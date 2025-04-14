// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource
// @version      18.3.1
// @description  Блокировка рекламы Twitch + Качество "Источник" + Авто-перезагрузка плеера при ошибках/зависании.
// @author       ShmidtS & AI
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @match        https://player.twitch.tv/*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      usher.ttvnw.net
// @connect      *.ttvnw.net
// @connect      *.twitch.tv
// @connect      github.com
// @connect      raw.githubusercontent.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js
// @downloadURL  https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- НАСТРОЙКИ СКРИПТА (Конфигурируемые через Tampermonkey/Greasemonkey меню) ---
    const SCRIPT_VERSION = '18.3.1';

    // Настройки отображения ошибок и логирования
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrors', true);
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false);
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', false);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', false); // Defaulted to false to reduce noise
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true); // Keep true for essential injection logs
    const LOG_PLAYER_MONITOR = GM_getValue('TTV_AdBlock_LogPlayerMon', false);
    const LOG_QUALITY_SETTER = GM_getValue('TTV_AdBlock_LogQualitySet', false);

    // Основные переключатели функций
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const ENABLE_PERIODIC_QUALITY_CHECK = GM_getValue('TTV_AdBlock_PeriodicQualityCheck', true);
    const PERIODIC_QUALITY_CHECK_INTERVAL_MS = GM_getValue('TTV_AdBlock_QualityCheckInterval', 5000);

    // Настройки для авто-перезагрузки плеера
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [2, 3, 4, 1000, 2000, 3000, 4000, 5000]);
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 3000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 15000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);

    // --- КОНСТАНТЫ СКРИПТА ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}'; // "Source" quality
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-SCTE35'];
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED'];
    const AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com',
        'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag',
        'ttvl-o.cloudfront.net',
        'd2v02itv0y9u9t.cloudfront.net', // Seen in logs, related to ads/tracking
        'edge.ads.twitch.tv',
        '.google.com/pagead/conversion/',
        '.youtube.com/api/stats/ads',
        // '.cloudfront.net/prod/vod-manifests/', // Potential VOD ads - TEST CAREFULLY IF UNCOMMENTING
        // 'video-edge-.*\.abs\.hls\.ttvnw\.net/v1/segment/.*\.ts', // BLOCKS .ts segments - EXTREMELY DANGEROUS, CAN BREAK PLAYER - KEEP COMMENTED
        'googletagservices.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'twitch.tv/api/ads' // Hypothetical ad API endpoint
    ];
    // Set for faster URL checks (case-insensitive)
    const blockedUrlKeywordsSet = new Set(AD_URL_KEYWORDS_BLOCK.map(keyword => keyword.toLowerCase()));
    const PLAYER_SELECTOR = 'video[playsinline]';

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
    let hooksInstalledMain = false;
    let workerHookAttempted = false;
    const hookedWorkers = new Set();
    let qualitySetIntervalId = null;
    let playerMonitorIntervalId = null;
    let videoElement = null;
    let lastVideoTimeUpdateTimestamp = 0;
    let lastKnownVideoTime = -1;
    let isWaitingForDataTimestamp = 0;
    let reloadTimeoutId = null;
    let lastReloadTimestamp = 0;
    let cachedQualityValue = null;

    // --- ССЫЛКИ НА ОРИГИНАЛЬНЫЕ ФУНКЦИИ БРАУЗЕРА ---
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;

    // --- ФУНКЦИИ ЛОГИРОВАНИЯ (Оптимизированные) ---
    function logError(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logDebug(source, message, ...args) { if (DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    // Reduced trace logging, only shown if specific flags OR general DEBUG_LOGGING is on
    function logTrace(source, message, ...args) {
        const lowerSource = source.toLowerCase();
        if ( (lowerSource.includes('m3u8') && LOG_M3U8_CLEANING) ||
            (lowerSource.includes('netblock') && LOG_NETWORK_BLOCKING) || // Only logs if specifically enabled
            (lowerSource.includes('gql') && LOG_GQL_INTERCEPTION) ||
            (lowerSource.includes('workerinject') && LOG_WORKER_INJECTION) || // Keep essential worker injection trace
            (lowerSource.includes('playermon') && LOG_PLAYER_MONITOR) ||
            (lowerSource.includes('qualityset') && LOG_QUALITY_SETTER) ||
            (DEBUG_LOGGING && !lowerSource.includes('playermon') && !lowerSource.includes('qualityset')) // General DEBUG shows most traces except frequent monitors
           ) {
            console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args);
        }
    }

    logDebug('Main', `Запуск скрипта. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. Quality Check: ${ENABLE_PERIODIC_QUALITY_CHECK}. Auto Reload: ${ENABLE_AUTO_RELOAD}.`);

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА "ИСТОЧНИК" ---
    function setQualitySettings(forceCheck = false) {
        const context = 'QualitySet';
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue;
                logTrace(context, `Прочитано из localStorage: ${currentValue}.`);
            } else {
                logTrace(context, `Используем кэш: ${currentValue}`);
            }

            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE;
                logDebug(context, `Установлено качество 'Источник' ('${TARGET_QUALITY_VALUE}') через localStorage.`);
                // Player interaction removed for stability, relying on Twitch reading localStorage.
            } else {
                logTrace(context, `Качество 'Источник' уже установлено.`);
            }
        } catch (e) {
            logError(context, 'Ошибка установки/проверки настроек качества:', e);
            cachedQualityValue = null; // Reset cache on error
        }
    }

    // Hook localStorage.setItem to keep cache consistent
    try {
        unsafeWindow.localStorage.setItem = function(key, value) {
            if (key === LS_KEY_QUALITY) {
                logTrace('QualitySet:LocalStorageHook', `Перехвачен setItem для ключа '${key}'. Обновление кэша.`);
                cachedQualityValue = value;
            }
            try {
                return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, arguments);
            } catch (e) {
                logError('QualitySet:LocalStorageHook', `Ошибка вызова оригинального localStorage.setItem для ключа '${key}':`, e);
                if (key === LS_KEY_QUALITY) cachedQualityValue = null; // Invalidate cache if set failed
                throw e;
            }
        };
        // Initialize cache
        cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
        logTrace('QualitySet:LocalStorageHook', `Начальное значение качества кэшировано: ${cachedQualityValue}`);
    } catch(e) {
        logError('QualitySet:LocalStorageHook', 'Критическая ошибка при перехвате localStorage.setItem:', e);
        if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
    }


    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WEB WORKER (Оптимизированное логирование) ---
    function getWorkerInjectionCode() {
        return `
// --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)}.map(kw => kw.toUpperCase());
const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

// --- Worker Logging ---
function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
function workerLogTrace(source, message, ...args) { if (LOG_M3U8_CLEANING_WORKER) console.debug(\`\${LOG_PREFIX_WORKER_BASE} [\${source}] TRACE:\`, message, ...args); }

workerLogDebug("--- Worker AdBlock Code Initializing ---");

function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
    const context = 'M3U8 Clean';
    const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;

    if (!m3u8Text || typeof m3u8Text !== 'string') {
        workerLogWarn(\`[\${context}] (\${urlShort}): Invalid or empty M3U8 text received.\`);
        return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
    }

    let potentialAdContent = false;
    const upperM3U8Text = m3u8Text.toUpperCase(); // Check in upper case once
    if (m3u8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER) ||
        AD_SIGNIFIERS_GENERAL_WORKER.some(sig => m3u8Text.includes(sig)) ||
        AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperM3U8Text.includes(kw))) {
        potentialAdContent = true;
    }

    if (!potentialAdContent) {
        // workerLogTrace(context, \`(\${urlShort}): No potential ad markers found. Skipping detailed parse.\`); // Too verbose
        return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
    }

    workerLogTrace(context, \`(\${urlShort}): Potential ad markers found. Starting detailed parse...\`);

    const lines = m3u8Text.split('\\n');
    const cleanLines = [];
    let isAdSection = false;
    let adsFound = false;
    let linesRemoved = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!trimmedLine) { cleanLines.push(line); continue; }

        let isAdMarkerLine = false;
        let shouldRemoveLine = false;
        let removalReason = '';

        if (trimmedLine.startsWith('#EXT-X-DATERANGE:')) {
            if (trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER)) {
                isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
                removalReason = \`DATERANGE (CLASS=\${AD_SIGNIFIER_DATERANGE_ATTR_WORKER})\`;
            } else {
                const lineUpper = trimmedLine.toUpperCase();
                if (AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => lineUpper.includes(kw))) {
                    isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
                    removalReason = 'DATERANGE (keyword)';
                }
            }
        } else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:')) {
            isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
            removalReason = \`Start Marker (\${trimmedLine.split(':')[0]})\`;
        } else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
            if (isAdSection) {
                isAdSection = false; isAdMarkerLine = true; shouldRemoveLine = true;
                removalReason = 'End Marker (#EXT-X-CUE-IN)';
            } else {
                 shouldRemoveLine = true; isAdMarkerLine = true;
                 removalReason = 'Orphan #EXT-X-CUE-IN';
                 workerLogWarn(\`[\${context}] (\${urlShort}): Found \${removalReason} [Line \${i+1}]. Removing.\`);
            }
        } else if (isAdSection) {
            shouldRemoveLine = true; // Remove content within ad section
        }

        if (shouldRemoveLine) {
            linesRemoved++;
            if (isAdMarkerLine && LOG_M3U8_CLEANING_WORKER) { // Only trace marker removal if flag is on
                workerLogTrace(context, \`(\${urlShort}): Removing Ad Marker [Line \${i+1}, Reason: \${removalReason}]: \${trimmedLine.substring(0, 60)}...\`);
            }
        } else {
            cleanLines.push(line);
        }
    }

    const cleanedText = cleanLines.join('\\n');

    if (adsFound) {
        workerLogDebug(\`[\${context}] (\${urlShort}): M3U8 Cleaning Complete. Removed \${linesRemoved} lines. Ads were found.\`);
        try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', url: urlShort, linesRemoved: linesRemoved }); }
        catch(e) { workerLogError("Error sending ADBLOCK_ADS_REMOVED message:", e); }
    } else {
        workerLogTrace(context, \`(\${urlShort}): No ads found/removed.\`);
    }

    return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved };
}

function installWorkerFetchHook() {
    const context = 'WorkerInject:FetchHook';
    if (typeof self.fetch !== 'function') { workerLogWarn(\`[\${context}] Fetch API not available.\`); return false; }
    if (self.fetch.hooked_by_adblock) { workerLogDebug(\`[\${context}] Fetch already hooked.\`); return true; }

    const workerRealFetch = self.fetch;
    self.fetch = async (input, init) => {
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
        const isM3U8Request = requestUrl.includes('.m3u8');
        const isUsherRequest = requestUrl.includes('usher.ttvnw.net');
        const fetchContext = 'WorkerInject:FetchIntercept';

        if (method === 'GET' && (isM3U8Request || isUsherRequest)) {
            workerLogTrace(fetchContext, \`Intercepted M3U8/Usher GET: \${urlShort}\`);
            try {
                const originalResponse = await workerRealFetch(input, init);
                if (!originalResponse.ok) {
                     workerLogWarn(\`[\${fetchContext}] (\${urlShort}) Original response NOT OK (Status: \${originalResponse.status}). Passing through.\`);
                     return originalResponse;
                }

                const clonedResponse = originalResponse.clone();
                const contentType = clonedResponse.headers.get('Content-Type') || '';
                const m3u8ContentTypes = ['mpegurl', 'application/vnd.apple.mpegurl', 'octet-stream', 'text/plain'];

                if (m3u8ContentTypes.some(type => contentType.includes(type))) {
                     workerLogTrace(fetchContext, \`(\${urlShort}) M3U8 content type ('\${contentType}'). Reading and cleaning...\`);
                     const m3u8Text = await clonedResponse.text();
                     if (!m3u8Text) { workerLogWarn(\`[\${fetchContext}] (\${urlShort}): M3U8 body is empty.\`); return originalResponse; }

                     const { cleanedText, adsFound, linesRemoved } = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);

                     if (adsFound) {
                         const newHeaders = new Headers(originalResponse.headers);
                         newHeaders.delete('Content-Length');
                         workerLogDebug(\`[\${fetchContext}] (\${urlShort}) Returning CLEANED M3U8. Removed: \${linesRemoved} lines.\`);
                         return new Response(cleanedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                     } else {
                          // workerLogTrace(fetchContext, \`(\${urlShort}) No ads found, returning original M3U8.\`); // Too verbose
                          return originalResponse;
                     }
                } else {
                     workerLogWarn(\`[\${fetchContext}] (\${urlShort}) Response not M3U8 (Type: '\${contentType}'). Passing through.\`);
                     return originalResponse;
                }
            } catch (error) {
                workerLogError(\`[\${fetchContext}] (\${urlShort}): Error proxying/cleaning M3U8: \`, error);
                return new Response(\`AdBlock Error: \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" });
            }
        } else {
             // workerLogTrace(fetchContext, \`Passing through request: (\${method}) \${urlShort}\`); // Too verbose
             return workerRealFetch(input, init);
        }
    };
    self.fetch.hooked_by_adblock = true;
    workerLogDebug(\`[\${context}] Fetch hook installed successfully in Worker.\`);
    return true;
}

self.addEventListener('message', function(e) {
    if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
        workerLogDebug("[WorkerInject:EvalMsg] Received EVAL_ADBLOCK_CODE. Executing...");
        try {
            eval(e.data.code);
            if (typeof self.fetch === 'function' && !self.fetch.hooked_by_adblock) {
                if (installWorkerFetchHook()) {
                    try {
                         workerLogDebug("[WorkerInject:EvalMsg] Sending ADBLOCK_WORKER_HOOKS_READY after eval...");
                         self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval' });
                    } catch(postMsgErr) { workerLogError("Error sending ADBLOCK_WORKER_HOOKS_READY post-eval:", postMsgErr); }
                } else { workerLogError("Failed to install fetch hook post-eval!"); }
            }
        } catch (err) { workerLogError("Error executing EVAL_ADBLOCK_CODE:", err); }
    }
 });

// --- Initial hook install attempt ---
if (installWorkerFetchHook()) {
    try {
        workerLogDebug("[WorkerInject:Init] Sending initial ADBLOCK_WORKER_HOOKS_READY...");
        self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' });
    } catch(e) { workerLogError("Error sending initial ADBLOCK_WORKER_HOOKS_READY:", e); }
} else { workerLogError("Failed to install fetch hook on initial worker load!"); }

workerLogDebug("--- Worker AdBlock Code Initialized ---");
// --- Worker AdBlock Code End ---
`;
    }

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК) ---
    async function fetchOverride(input, init) {
        const context = 'NetBlock:Fetch';
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();

        // Check against blocklist (optimized check)
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()))) { // Keep includes check for partial matches
            if (blockedUrlKeywordsSet.has(lowerCaseUrl.split('/')[2])) { // Check domain with Set if needed
                logTrace(context, `Blocking Fetch (${method}) to: ${requestUrl}`); // Only trace if LOG_NETWORK_BLOCKING is true
                return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked)" }));
            }
        }


        if (requestUrl.includes('/gql') && method === 'POST') {
            logGqlOperation('GQL:Fetch', init?.body);
        }

        try {
            return await originalFetch(input, init);
        } catch (error) {
            // Log common network errors quietly unless debug is on
            if (error.name === 'TypeError' && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_CONNECTION_CLOSED'))) {
                logWarn(context, `Fetch to ${requestUrl.substring(0,100)}... failed (likely blocked or network issue): ${error.message}`);
                return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked/Failed" })); // Return a dummy response
            } else {
                logError(context, `Unknown fetch error for ${requestUrl.substring(0,100)}...:`, error);
                throw error;
            }
        }
    }

    const xhrRequestData = new WeakMap();

    function xhrOpenOverride(method, url /*, async, user, password*/) {
        const context = 'NetBlock:XHR';
        const urlString = String(url);
        const lowerCaseUrl = urlString.toLowerCase();
        let blocked = false;

        if (AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()))) {
            if (blockedUrlKeywordsSet.has(lowerCaseUrl.split('/')[2])) { // Check domain
                logTrace(context, `Marking XHR (${method}) for blocking: ${urlString}`); // Only trace if LOG_NETWORK_BLOCKING is true
                blocked = true;
            }
        }

        xhrRequestData.set(this, { method: method, url: urlString, blocked: blocked });

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `Error in original xhr.open for ${urlString.substring(0,100)}...:`, error); throw error; }
        }
        // If blocked, original open is not called.
    }

    function xhrSendOverride(data) {
        const context = 'NetBlock:XHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            // logWarn(context, "No request info for XHR.send. Calling original."); // Can be noisy
            try { return originalXhrSend.apply(this, arguments); }
            catch(e) { logError(context, "Error calling original xhr.send without requestInfo:", e); throw e;}
        }

        const { method, url, blocked } = requestInfo;

        if (blocked) {
            logWarn(context, `Blocking XHR (${method}) send to ${url.substring(0,100)}...`);
            try {
                // Simulate a network error event to avoid breaking Twitch scripts expecting a response/error
                this.dispatchEvent(new ProgressEvent('error'));
                if (typeof this.abort === 'function') this.abort();
            } catch (e) { logWarn(context, `Failed to simulate error/abort for blocked XHR: ${e.message}`); }
            return; // Prevent actual send
        }

        if (url.includes('/gql') && method.toUpperCase() === 'POST') {
            logGqlOperation('GQL:XHR', data);
        }

        try {
            return originalXhrSend.apply(this, arguments);
        } catch (error) {
            if (error.name === 'NetworkError' || (error.message && error.message.includes('ERR_CONNECTION_CLOSED'))) {
                logWarn(context, `XHR send to ${url.substring(0,100)}... failed (Network Error): ${error.message}`);
            } else {
                logError(context, `Unknown error in xhr.send for ${url.substring(0,100)}...:`, error);
            }
            throw error; // Re-throw the error
        }
    }

    function logGqlOperation(context, body) {
        if (!LOG_GQL_INTERCEPTION || !body) return;
        try {
            let operationName = 'UnknownOperation';
            let parsedBody = (typeof body === 'string') ? JSON.parse(body) : body;

            if (Array.isArray(parsedBody)) { operationName = parsedBody[0]?.operationName || operationName; }
            else if (typeof parsedBody === 'object' && parsedBody !== null) { operationName = parsedBody.operationName || operationName; }

            logTrace(context, `GraphQL Request: ${operationName}`);
            if (operationName === GQL_OPERATION_ACCESS_TOKEN) {
                logDebug(context, `--> Intercepted crucial GQL operation: ${GQL_OPERATION_ACCESS_TOKEN}`);
            }
        } catch (e) { /* Silently ignore parsing errors for logging */ }
    }

    // --- ЛОГИКА ВНЕДРЕНИЯ КОДА В WEB WORKER'Ы (ОСНОВНОЙ ПОТОК) ---
    function createObjectURLOverride_Sync(obj) {
        const context = 'WorkerInject:ObjectURL';
        const isBlob = obj instanceof Blob;

        // Only log potential worker blobs if worker logging is enabled
        if (LOG_WORKER_INJECTION && INJECT_INTO_WORKERS && isBlob) {
            const blobType = obj.type || 'empty';
            if(blobType.includes('javascript') || blobType.includes('worker') || blobType === 'empty') {
                logTrace(context, `Potential Worker Blob detected (Type: '${blobType}', Size: ${obj.size}). Injection handled by Worker constructor hook.`);
            }
        }

        try { return originalCreateObjectURL.call(unsafeWindow.URL, obj); }
        catch (e) { logError(context, `Error calling original createObjectURL:`, e); throw e; }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true; // Prevent adding multiple times
        const context = 'WorkerInject:MsgListener';

        workerInstance.addEventListener('error', (e) => {
            logError(context, `Error INSIDE Worker (${label}):`, e.message, `(${e.filename}:${e.lineno})`);
        }, { passive: true });

        const adBlockListener = (e) => {
            const msgData = e.data;
            if (msgData?.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                logDebug('WorkerInject:Confirm', `---> HOOKS READY confirmation received from Worker (${label})! Method: ${msgData.method || 'N/A'}`);
                hookedWorkers.add(label);
            } else if (msgData?.type === 'ADBLOCK_ADS_REMOVED') {
                logDebug('M3U8 Clean:Confirm', `ADBLOCK_ADS_REMOVED from Worker (${label}). URL: ${msgData.url}, Removed: ${msgData.linesRemoved}`);
            }
        };
        workerInstance.addEventListener('message', adBlockListener, { passive: true });
        workerInstance._adBlockListener = adBlockListener; // Store reference for potential removal if needed
        logTrace(context, `AdBlock message/error listeners installed for Worker (${label})`);
    }

    function hookWorkerConstructor() {
        const context = 'WorkerInject:HookSetup';
        if (!INJECT_INTO_WORKERS) { logWarn(context, "Worker injection disabled."); return; }
        if (unsafeWindow.Worker?.hooked_by_adblock) { logDebug(context, "Worker constructor already hooked."); return; }
        if (typeof OriginalWorker === 'undefined') { logError(context, 'Original Worker constructor not found.'); return; }

        logTrace(context, "Attempting to hook Worker constructor...");
        workerHookAttempted = true;

        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                let urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                let isBlobURL = urlString.startsWith('blob:');
                let workerLabel = 'unknown';
                let isIVSWorker = false; // Flag for Amazon IVS workers

                try {
                    if (isBlobURL) { workerLabel = `blob:${urlString.substring(5, 40)}...`; }
                    else if (urlString) {
                        workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60);
                        if (workerLabel.includes('amazon-ivs-wasmworker')) {
                            isIVSWorker = true;
                            workerLabel += " (IVS)";
                        }
                    }

                    logTrace(context, `Worker constructor called. Source: ${workerLabel}, Type: ${isBlobURL ? 'Blob' : 'Script'}${isIVSWorker ? ', Skipping injection' : ''}`);

                    if(isIVSWorker) {
                        // Call original constructor directly for IVS workers and exit early
                        super(scriptURL, options);
                        this._workerLabel = workerLabel;
                        addWorkerMessageListeners(this, workerLabel); // Still listen for errors
                        return;
                    }

                    // --- Main Injection Logic (non-IVS) ---
                    // Call original constructor FIRST
                    super(scriptURL, options);
                    this._workerLabel = workerLabel;
                    addWorkerMessageListeners(this, workerLabel);

                    // Fallback injection attempt for non-Blob URLs via postMessage
                    if (!isBlobURL && urlString) {
                        setTimeout(() => {
                            if (!hookedWorkers.has(this._workerLabel)) {
                                logWarn(context, `Worker (${this._workerLabel}) not from Blob. Attempting fallback injection via postMessage...`);
                                try { this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: getWorkerInjectionCode() }); }
                                catch(e) { logError(context, `Error using postMessage fallback for ${this._workerLabel}:`, e); }
                            }
                        }, 500); // Delay slightly
                    } else if (isBlobURL) {
                        logTrace(context, `Worker (${workerLabel}) from Blob URL. Awaiting ADBLOCK_WORKER_HOOKS_READY confirmation.`);
                    }

                } catch (constructorError) {
                    logError(context, `Error in HookedWorker constructor for ${workerLabel}:`, constructorError);
                    if(!this._workerLabel) throw constructorError; // Rethrow if super() failed before label assignment
                }
            }
        };

        // Restore prototype chain
        try { Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker); Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorker.prototype); }
        catch (e) { logError(context, "Failed to restore Worker prototype chain:", e); }

        unsafeWindow.Worker.hooked_by_adblock = true;
        logDebug(context, "Worker constructor hooked successfully.");
    }

    // --- УСТАНОВКА ХУКОВ В ОСНОВНОМ ПОТОКЕ ---
    function installHooks() {
        const context = 'MainHooks';
        if (hooksInstalledMain) { /*logWarn(context, "Attempted re-install.");*/ return; }
        logDebug(context, "Installing main thread hooks...");

        try { unsafeWindow.fetch = fetchOverride; logTrace(context, "Fetch API hooked."); }
        catch (e) { logError(context, "Failed to hook Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }

        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            logTrace(context, "XMLHttpRequest hooks (open, send) installed.");
        } catch (e) {
            logError(context, "Failed to hook XMLHttpRequest:", e);
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend;
        }

        if (INJECT_INTO_WORKERS) {
            try { unsafeWindow.URL.createObjectURL = createObjectURLOverride_Sync; logTrace(context, "URL.createObjectURL hooked."); }
            catch (e) { logError(context, "Failed to hook URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }

            try { hookWorkerConstructor(); } // Contains own logging
            catch (e) { logError(context, "Failed to hook Worker constructor:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            // Hook revokeObjectURL mainly for debugging worker lifecycle if needed
            try {
                unsafeWindow.URL.revokeObjectURL = function(url) {
                    // Only log if worker injection logging is enabled
                    if(LOG_WORKER_INJECTION) logTrace('WorkerInject:ObjectURLRevoke', `revokeObjectURL called: ${String(url).substring(0, 60)}...`);
                    return originalRevokeObjectURL.call(unsafeWindow.URL, url);
                };
                logTrace(context, "URL.revokeObjectURL hooked.");
            } catch(e) { logWarn(context, "Failed to hook revokeObjectURL (non-critical):", e); }
        } else {
            logWarn(context, "Worker injection is disabled.");
        }

        hooksInstalledMain = true;
        logDebug(context, "Main thread hooks installation complete.");
    }


    // --- ФУНКЦИИ МОНИТОРИНГА И ПЕРЕЗАГРУЗКИ ПЛЕЕРА ---
    function findVideoPlayer() {
        const context = 'PlayerMon:Finder';
        if (videoElement && document.body.contains(videoElement)) return videoElement; // Use cache if valid

        logTrace(context, 'Searching for video element...');
        const selectors = [PLAYER_SELECTOR, 'div[data-a-target="video-player"] video', '.video-player__container video', 'div[data-a-target="video-player-layout"] video', '.persistent-player video', 'video'];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.tagName === 'VIDEO' && (element.src || element.currentSrc || element.hasAttribute('src'))) { // Check src/currentSrc/hasAttribute
                    logTrace(context, `Video element found via selector: ${selector}`);
                    videoElement = element;
                    return element;
                }
            } catch (e) { /* Ignore selector errors */ }
        }
        logTrace(context, 'Video element not found.');
        videoElement = null;
        return null;
    }

    function triggerReload(reason) {
        const context = 'PlayerMon:Reload';
        const now = Date.now();
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) { logWarn(context, `Reload (${reason}) cancelled: Cooldown active.`); return; }
        if (document.hidden) { logWarn(context, `Reload (${reason}) cancelled: Tab hidden.`); return; }

        logWarn(context, `!!! TRIGGERING PAGE RELOAD !!! Reason: ${reason}.`);
        lastReloadTimestamp = now;
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); }
        catch (e) { /* Ignore sessionStorage errors */ }
        unsafeWindow.location.reload();
    }

    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; logTrace('PlayerMon:State', `Scheduled reload cancelled (${reason || 'reset'}).`); }
        const now = Date.now();
        lastVideoTimeUpdateTimestamp = now;
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0; // Reset buffering timer
        logTrace('PlayerMon:State', `Monitor state reset (${reason || 'N/A'}). lastKnownTime: ${lastKnownVideoTime.toFixed(2)}`);
    }

    function monitorPlayerState() {
        const context = 'PlayerMon:Monitor';
        if (!videoElement || !document.body.contains(videoElement)) {
            logWarn(context, 'Video element lost. Monitor will attempt restart.');
            if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            setTimeout(setupPlayerMonitor, 500); // Attempt restart shortly
            return;
        }

        const now = Date.now();
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        let detectedProblemReason = null;

        // 1. Check for stall (if supposed to be playing)
        if (!videoElement.paused && !videoElement.ended && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;
            if (currentTime === lastKnownVideoTime && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                detectedProblemReason = `Stall: currentTime (${currentTime.toFixed(2)}) not changing > ${timeSinceLastUpdate.toFixed(0)}ms (State: ${readyState})`;
            } else if (currentTime < lastKnownVideoTime && lastKnownVideoTime > 0) { // Time went backwards?
                detectedProblemReason = `Stall: currentTime (${currentTime.toFixed(2)}) < lastKnown (${lastKnownVideoTime.toFixed(2)})`;
            }

            if (currentTime > lastKnownVideoTime) { // Time is progressing
                lastKnownVideoTime = currentTime;
                lastVideoTimeUpdateTimestamp = now;
                if (reloadTimeoutId && detectedProblemReason === null) { // If progressing now, cancel scheduled reload if any
                    logDebug(context, "Playback resumed (timeupdate). Cancelling scheduled reload.");
                    clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
                }
                if (isWaitingForDataTimestamp > 0) { // Reset buffering timer if we have data now
                    // logTrace(context, `Data received (timeupdate). Reset buffering timer.`);
                    isWaitingForDataTimestamp = 0;
                }
            }
        } else if(videoElement.paused || videoElement.ended) {
            // If paused or ended, ensure state reflects that for next check
            lastKnownVideoTime = currentTime;
            lastVideoTimeUpdateTimestamp = now;
            isWaitingForDataTimestamp = 0;
            if(reloadTimeoutId) {
                logTrace(context, `Video paused/ended. Cancelling scheduled reload.`);
                clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
            }
        }


        // 2. Check for excessive buffering
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            const bufferingDuration = now - isWaitingForDataTimestamp;
            if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS) {
                if (!detectedProblemReason) { // Don't overwrite stall reason
                    detectedProblemReason = `Excessive Buffering > ${(bufferingDuration / 1000).toFixed(1)}s (State: ${readyState})`;
                }
            }
        }

        // 3. Trigger reload if problem detected and not already scheduled
        if (detectedProblemReason && !reloadTimeoutId) {
            logWarn(context, `PLAYER PROBLEM DETECTED! Reason: ${detectedProblemReason}.`);
            logWarn(context, `Scheduling reload in 5 seconds...`);
            reloadTimeoutId = setTimeout(() => triggerReload(detectedProblemReason), 5000); // Delay before reload
        }

        // 4. Reset buffering timer if playing state is healthy
        const isPlayingHealthy = !videoElement.paused && !videoElement.ended && readyState >= videoElement.HAVE_FUTURE_DATA;
        if (isPlayingHealthy && isWaitingForDataTimestamp > 0) {
            // logTrace(context, `Playback healthy (readyState=${readyState}). Reset buffering timer.`);
            isWaitingForDataTimestamp = 0;
            // Cancel reload ONLY if it was due to buffering (not stall)
            if (reloadTimeoutId && !detectedProblemReason?.toLowerCase().includes('stall')) {
                logDebug(context, "Buffering resolved. Cancelling scheduled reload.");
                clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
            }
        }
    }

    function setupPlayerMonitor() {
        const context = 'PlayerMon:Setup';
        if (!ENABLE_AUTO_RELOAD) {
            logDebug(context, 'Auto-reload disabled.');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); videoElement = null; }
            return;
        }

        const currentVideoElement = findVideoPlayer();

        if (!currentVideoElement) {
            logTrace(context, 'Video element not found. Retrying setup in 3s.');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); videoElement = null; }
            setTimeout(setupPlayerMonitor, 3000);
            return;
        }

        if (currentVideoElement !== videoElement || !playerMonitorIntervalId) {
            logDebug(context, 'New video element detected or monitor inactive. Re-initializing monitor...');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); } // Cleanup old listeners

            videoElement = currentVideoElement;
            checkReloadCooldown(context);
            addPlayerEventListeners();
            resetMonitorState('Monitor setup/reset');
            playerMonitorIntervalId = setInterval(monitorPlayerState, 2000); // Check every 2 seconds
            logDebug(context, `Player monitor started (Interval: 2s, Stall: ${RELOAD_STALL_THRESHOLD_MS}ms, Buffer: ${RELOAD_BUFFERING_THRESHOLD_MS}ms).`);
        }
        // else { logTrace(context, 'Monitor already active for current video element.'); } // Reduce noise
    }

    function checkReloadCooldown(context) {
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const timeSinceLastReload = Date.now() - parseInt(sessionReloadTime, 10);
                sessionStorage.removeItem('ttv_adblock_last_reload'); // Remove flag
                if (timeSinceLastReload < RELOAD_COOLDOWN_MS) {
                    const cooldownRemaining = RELOAD_COOLDOWN_MS - timeSinceLastReload;
                    logWarn(context, `Recent reload detected (${(timeSinceLastReload / 1000).toFixed(1)}s ago). Cooldown active for ${(cooldownRemaining / 1000).toFixed(1)}s.`);
                    lastReloadTimestamp = Date.now() - timeSinceLastReload; // Set timestamp to enforce cooldown
                }
            }
        } catch (e) { /* Ignore sessionStorage errors */ }
    }

    // --- Event Listener Helpers ---
    function addPlayerEventListeners() {
        if (!videoElement || videoElement._adblockListenersAttached) return;
        const context = 'PlayerMon:Events';
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true }); // Start buffering timer
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true }); // Reset state/timers
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });   // Reset state/timers
        videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true }); // Source gone, reset & find new
        videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true }); // Reset state, check quality
        videoElement.addEventListener('abort', handlePlayerAbort, { passive: true });   // Loading aborted, reset & find new
        videoElement._adblockListenersAttached = true;
        logTrace(context, 'Player event listeners added.');
    }

    function removePlayerEventListeners() {
        if (!videoElement || !videoElement._adblockListenersAttached) return;
        const context = 'PlayerMon:Events';
        videoElement.removeEventListener('error', handlePlayerError);
        videoElement.removeEventListener('waiting', handlePlayerWaiting);
        videoElement.removeEventListener('playing', handlePlayerPlaying);
        videoElement.removeEventListener('pause', handlePlayerPause);
        videoElement.removeEventListener('emptied', handlePlayerEmptied);
        videoElement.removeEventListener('loadedmetadata', handlePlayerLoadedMeta);
        videoElement.removeEventListener('abort', handlePlayerAbort);
        delete videoElement._adblockListenersAttached;
        logTrace(context, 'Player event listeners removed.');
    }

    // --- Player Event Handlers ---
    function handlePlayerError(event) {
        const context = 'PlayerMon:EventError';
        if (!videoElement?.error) { logWarn(context, 'Error event triggered without video.error details.'); return; }
        const error = videoElement.error;
        logError(context, `Player Error! Code: ${error.code}, Message: "${error.message || 'N/A'}"`);
        if (RELOAD_ON_ERROR_CODES.includes(error.code)) {
            const reason = `Player Error (Code ${error.code})`;
            logWarn(context, `Error code requires reload. Scheduling reload in 3s...`);
            if (!reloadTimeoutId) reloadTimeoutId = setTimeout(() => triggerReload(reason), 3000);
        }
    }

    function handlePlayerWaiting() {
        const context = 'PlayerMon:EventWaiting';
        // Start buffering timer only if not paused and data is actually needed
        if (videoElement && !videoElement.paused && videoElement.readyState < videoElement.HAVE_FUTURE_DATA && isWaitingForDataTimestamp === 0) {
            logTrace(context, `Buffering started (readyState: ${videoElement.readyState}). Starting timer.`);
            isWaitingForDataTimestamp = Date.now();
        }
    }

    function handlePlayerPlaying() { resetMonitorState('Playing event'); }
    function handlePlayerPause() { resetMonitorState('Pause event'); }
    function handlePlayerEmptied() { logWarn('PlayerMon:EventEmptied', 'Video source emptied.'); resetMonitorState('Emptied event'); setTimeout(setupPlayerMonitor, 100); } // Re-find player quickly
    function handlePlayerLoadedMeta() { logTrace('PlayerMon:EventLoadedMeta', 'Metadata loaded.'); resetMonitorState('LoadedMetadata event'); setQualitySettings(true); } // Re-check quality
    function handlePlayerAbort() { logWarn('PlayerMon:EventAbort', 'Video load aborted.'); resetMonitorState('Abort event'); setTimeout(setupPlayerMonitor, 100); } // Re-find player quickly


    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---
    function initializeScript() {
        const context = 'Init';
        logDebug(context, `--- Initializing Twitch Adblock (v${SCRIPT_VERSION}) ---`);
        installHooks();
        setQualitySettings(true); // Force check on init
        setupPageLifecycleListeners(context);
        setupPeriodicQualityCheck(context);
        setupDomReadyHandler(context); // Setup player monitor after DOM ready
        logDebug(context, `--- Twitch Adblock (v${SCRIPT_VERSION}) Initialization Complete ---`);
    }

    function setupPageLifecycleListeners(parentContext) {
        const context = `${parentContext}:PageLifecycle`;
        document.addEventListener('visibilitychange', () => {
            const visContext = `${context}:Visibility`;
            if (!document.hidden) {
                logDebug(visContext, "Tab became visible. Re-checking quality and player state.");
                // Use rAF to ensure checks happen after potential layout changes
                requestAnimationFrame(() => {
                    setQualitySettings(true);
                    if (ENABLE_AUTO_RELOAD) setupPlayerMonitor(); // Restart monitor if enabled
                });
            } else {
                logDebug(visContext, "Tab hidden.");
                if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) {
                    logTrace(visContext, 'Stopping player monitor.');
                    clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
                    removePlayerEventListeners(); // Detach listeners when hidden
                }
                if (reloadTimeoutId) { logWarn(visContext, 'Cancelling scheduled reload due to tab hidden.'); clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
            }
        }, { passive: true });
        logTrace(context, "'visibilitychange' listener installed.");

        let navigationDebounceTimer = null;
        const handleNavigationChange = () => {
            clearTimeout(navigationDebounceTimer);
            navigationDebounceTimer = setTimeout(() => {
                const navContext = `${context}:Navigation`;
                logDebug(navContext, `Navigation detected (${window.location.pathname}). Re-checking state.`);
                // Force checks after navigation
                setQualitySettings(true);
                if (ENABLE_AUTO_RELOAD) setupPlayerMonitor(); // Resetup monitor for potentially new page/player
            }, 300); // Debounce navigation events slightly
        };

        try { // Hook history API for SPA navigation
            const originalPushState = history.pushState;
            history.pushState = function(...args) { originalPushState.apply(this, args); handleNavigationChange(); };
            const originalReplaceState = history.replaceState;
            history.replaceState = function(...args) { originalReplaceState.apply(this, args); handleNavigationChange(); };
            unsafeWindow.addEventListener('popstate', handleNavigationChange, { passive: true });
            logTrace(context, "Navigation listeners (pushState, replaceState, popstate) installed.");
        } catch (e) { logError(context, "Failed to install navigation listeners:", e); }
    }

    function setupPeriodicQualityCheck(parentContext) {
        const context = `${parentContext}:PeriodicQualityCheck`;
        if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) {
            if (qualitySetIntervalId) clearInterval(qualitySetIntervalId);
            qualitySetIntervalId = setInterval(() => {
                logTrace(context, `Periodic quality check running...`);
                setQualitySettings(); // Use cache by default for periodic checks
            }, PERIODIC_QUALITY_CHECK_INTERVAL_MS);
            logDebug(context, `Periodic quality check started (interval ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} ms).`);
        } else { logDebug(context, `Periodic quality check disabled.`); }
    }

    function setupDomReadyHandler(parentContext) {
        const context = `${parentContext}:DomReady`;
        const onDomReady = () => {
            logDebug(context, "DOM ready. Initializing player monitor setup.");
            if (ENABLE_AUTO_RELOAD) setupPlayerMonitor();
            else logDebug(context, "Auto-reload disabled, player monitor not started.");
        };

        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', onDomReady, { once: true, passive: true });
        } else {
            requestAnimationFrame(onDomReady); // Use rAF if DOM already loaded
        }
    }

    // --- Start Initialization ---
    initializeScript();

})();