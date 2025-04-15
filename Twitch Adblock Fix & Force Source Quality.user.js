// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource_Mod
// @version      18.4.6
// @description  Блокировка рекламы Twitch + Качество "Источник" + Авто-перезагрузка плеера
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
// @connect      gql.twitch.tv
// @connect      *
// @updateURL    https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js
// @downloadURL  https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- НАСТРОЙКИ СКРИПТА ---
    const SCRIPT_VERSION = '18.4.6'; // Updated version with logging optimization

    // Основные переключатели
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true); // Master toggle for GQL mods
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);

    // Настройки логирования
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrors', false);
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false); // Master debug toggle (false by default)
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', false); // Less verbose by default
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', false); // Less verbose by default
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false); // Less verbose by default
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', false); // Keep worker readiness logs by default
    const LOG_PLAYER_MONITOR = GM_getValue('TTV_AdBlock_LogPlayerMon', false); // Less verbose by default
    const LOG_QUALITY_SETTER = GM_getValue('TTV_AdBlock_LogQualitySet', false); // Less verbose by default
    const LOG_VISIBILITY_FIX = GM_getValue('TTV_AdBlock_LogVisibilityFix', false); // Keep visibility logs by default

    // Настройки авто-перезагрузки
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [2, 3, 4, 1000, 2000, 3000, 4000, 5000]);
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 6000); // 6 seconds
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 15000); // 15 seconds
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000); // 15 seconds
    const VISIBILITY_RESUME_DELAY_MS = GM_getValue('TTV_AdBlock_VisResumeDelayMs', 500); // Increased delay

    // --- КОНСТАНТЫ СКРИПТА ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}'; // "Source" quality
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const GQL_OPERATION_ACCESS_TOKEN_TEMPLATE = 'PlaybackAccessToken_Template'; // For Live Streams
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken'; // For VODs maybe? Monitor GQL logs
    const GQL_OPERATION_AD_FREE_QUERY = 'AdFreeQuery';
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-SCTE35'];
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED'];
    const AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com',
        'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag',
        'edge.ads.twitch.tv',
        '.google.com/pagead/conversion/',
        '.youtube.com/api/stats/ads',
        'googletagservices.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'twitch.tv/api/ads', // API endpoint for ads
        'spade.twitch.tv', // Twitch internal tracking, blocking can break things
    ];
    const blockedUrlKeywordsSet = new Set(AD_URL_KEYWORDS_BLOCK.map(keyword => keyword.toLowerCase()));
    const PLAYER_SELECTOR = 'video[playsinline]';

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
    let hooksInstalledMain = false;
    let workerHookAttempted = false;
    const hookedWorkers = new Set();
    let playerMonitorIntervalId = null;
    let videoElement = null;
    let lastVideoTimeUpdateTimestamp = 0;
    let lastKnownVideoTime = -1;
    let isWaitingForDataTimestamp = 0;
    let reloadTimeoutId = null;
    let lastReloadTimestamp = 0;
    let cachedQualityValue = null;
    let visibilityResumeTimer = null;

    // --- ССЫЛКИ НА ОРИГИНАЛЬНЫЕ ФУНКЦИИ БРАУЗЕРА ---
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;
    // Get descriptors carefully
    let originalXhrResponseGetter = null;
    try { originalXhrResponseGetter = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'response'); } catch(e) { logWarn('Init', 'Failed to get XMLHttpRequest.response descriptor'); }
    let originalXhrResponseTextGetter = null;
    try { originalXhrResponseTextGetter = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'responseText'); } catch(e) { logWarn('Init', 'Failed to get XMLHttpRequest.responseText descriptor'); }


    // --- ФУНКЦИИ ЛОГИРОВАНИЯ ---
    function logError(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logDebug(source, message, ...args) { if (DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logTrace(source, message, ...args) {
        const lowerSource = source.toLowerCase();
        let shouldLog = false;

        if (lowerSource.includes('m3u8') && LOG_M3U8_CLEANING) shouldLog = true;
        else if (lowerSource.includes('netblock') && LOG_NETWORK_BLOCKING) shouldLog = true;
        else if (lowerSource.includes('gql') && LOG_GQL_INTERCEPTION) shouldLog = true;
        else if (lowerSource.includes('workerinject') && LOG_WORKER_INJECTION) shouldLog = true;
        else if (lowerSource.includes('playermon') && LOG_PLAYER_MONITOR) shouldLog = true;
        else if (lowerSource.includes('qualityset') && LOG_QUALITY_SETTER) shouldLog = true;
        else if (lowerSource.includes('visibility') && LOG_VISIBILITY_FIX) shouldLog = true;
        // General debug trace if enabled AND the specific flag is NOT explicitly false
        else if (DEBUG_LOGGING) {
            if (lowerSource.includes('m3u8') && LOG_M3U8_CLEANING !== false) shouldLog = true;
            else if (lowerSource.includes('netblock') && LOG_NETWORK_BLOCKING !== false) shouldLog = true;
            else if (lowerSource.includes('gql') && LOG_GQL_INTERCEPTION !== false) shouldLog = true;
            else if (lowerSource.includes('workerinject') && LOG_WORKER_INJECTION !== false) shouldLog = true;
            else if (lowerSource.includes('playermon') && LOG_PLAYER_MONITOR !== false) shouldLog = true;
            else if (lowerSource.includes('qualityset') && LOG_QUALITY_SETTER !== false) shouldLog = true;
            else if (lowerSource.includes('visibility') && LOG_VISIBILITY_FIX !== false) shouldLog = true;
            else if (!lowerSource.match(/m3u8|netblock|gql|workerinject|playermon|qualityset|visibility/)) shouldLog = true; // Log other sources if master debug is on
        }

        if (shouldLog) {
            const truncatedArgs = args.map(arg =>
                                           typeof arg === 'string' && arg.length > 300 ? arg.substring(0, 300) + '...' : arg
                                          );
            console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...truncatedArgs);
        }
    }

    logDebug('Main', `Запуск скрипта. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. GQL Modify: ${MODIFY_GQL_RESPONSE}. Auto Reload: ${ENABLE_AUTO_RELOAD}. Stall Threshold: ${RELOAD_STALL_THRESHOLD_MS}ms.`);

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА "ИСТОЧНИК" ---
    function setQualitySettings(forceCheck = false) {
        const context = 'QualitySet';
        try {
            let currentValue = cachedQualityValue;
            // Force read from localStorage if forceCheck is true or cache is null
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue; // Update cache
                logTrace(context, `Read from localStorage: ${currentValue}. (Force Check: ${forceCheck})`);
            } else {
                logTrace(context, `Using cached quality: ${currentValue}`);
            }

            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE; // Update cache after setting
                logDebug(context, `Set quality to 'Source' ('${TARGET_QUALITY_VALUE}') via localStorage.`);
            } else {
                logTrace(context, `'Source' quality already set.`);
            }
        } catch (e) {
            logError(context, 'Error setting/checking quality settings:', e);
            cachedQualityValue = null; // Invalidate cache on error
        }
    }

    // Hook localStorage.setItem to enforce quality and keep cache updated
    try {
        unsafeWindow.localStorage.setItem = function(key, value) {
            if (key === LS_KEY_QUALITY) {
                logTrace('QualitySet:LocalStorageHook', `Intercepted setItem for key '${key}'. Requested value: '${value}'`);
                if (value !== TARGET_QUALITY_VALUE) {
                    logWarn('QualitySet:LocalStorageHook', `Attempt to change '${key}' to '${value}'. Forcing '${TARGET_QUALITY_VALUE}'.`);
                    value = TARGET_QUALITY_VALUE; // Enforce target quality
                }
                cachedQualityValue = value; // Update cache with the (potentially forced) value
            }
            // Call original setItem with potentially modified arguments
            try {
                const args = Array.from(arguments);
                if (key === LS_KEY_QUALITY) args[1] = value; // Use the potentially forced value
                return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, args);
            } catch (e) {
                logError('QualitySet:LocalStorageHook', `Error calling original localStorage.setItem for key '${key}':`, e);
                if (key === LS_KEY_QUALITY) cachedQualityValue = null; // Invalidate cache on error
                throw e; // Re-throw error
            }
        };
        // Initial cache population and check after hook setup
        cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
        logTrace('QualitySet:LocalStorageHook', `Initial cached quality after hook: ${cachedQualityValue}`);
        setQualitySettings(true); // Ensure quality is set correctly on script start

    } catch(e) {
        logError('QualitySet:LocalStorageHook', 'Critical error hooking localStorage.setItem:', e);
        if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem; // Restore original if hook failed
    }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WEB WORKER ---
    // Worker code remains largely the same as v18.4.5, focusing on M3U8 cleaning
    function getWorkerInjectionCode() {
        // Use the reliable M3U8 cleaning logic
        // Pass only necessary logging flags to the worker
        return `
// --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING}; // Pass master debug flag
const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING}; // Pass specific M3U8 flag
const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)}.map(kw => kw.toUpperCase());
const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

// Simplified worker logging functions
function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
function workerLogTrace(source, message, ...args) {
    // Log M3U8 traces if specifically enabled, OR if master debug is on
    if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) {
         console.debug(\`\${LOG_PREFIX_WORKER_BASE} [\${source}] TRACE:\`, message, ...args);
    }
}

workerLogDebug("--- Worker AdBlock Code Initializing ---");

function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
    const context = 'M3U8 Clean';
    const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
    if (!m3u8Text || typeof m3u8Text !== 'string') {
        workerLogWarn(\`[\${context}] (\${urlShort}): Invalid or empty M3U8 text received.\`);
        return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
    }
    let potentialAdContent = false;
    const upperM3U8Text = m3u8Text.toUpperCase();
    if (m3u8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER) ||
        AD_SIGNIFIERS_GENERAL_WORKER.some(sig => m3u8Text.includes(sig)) ||
        AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperM3U8Text.includes(kw))) {
        potentialAdContent = true;
    }

    if (!potentialAdContent && !m3u8Text.includes('#EXT-X-CUE-')) {
         // Only log this trace if M3U8 logging or full debug is on
         if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) {
             workerLogTrace(context, \`(\${urlShort}): No obvious ad markers found. Skipping detailed parse.\`);
         }
         return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
    }

    // Log start of detailed parse only if debugging is on
    if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) {
        workerLogTrace(context, \`(\${urlShort}): Potential ad markers or CUE tags found. Starting detailed parse...\`);
    }
    const lines = m3u8Text.split('\\n');
    const cleanLines = [];
    let isAdSection = false;
    let adsFound = false;
    let linesRemoved = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        let isAdMarkerLine = false;
        let shouldRemoveLine = false;
        let removalReason = '';

        if (trimmedLine.startsWith('#EXT-X-DATERANGE:')) {
            const lineUpper = trimmedLine.toUpperCase();
            if (trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER) || AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => lineUpper.includes(kw))) {
                isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
                removalReason = \`DATERANGE (Attr/Keyword)\`;
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
        } else if (isAdSection && !trimmedLine.startsWith('#EXT-')) { // Only remove non-metadata lines within ad section
             shouldRemoveLine = true;
             removalReason = 'Segment within ad section';
             // Don't log every segment removal
        }

        if (shouldRemoveLine) {
            linesRemoved++;
            // Log marker removal only if debugging is on
            if (isAdMarkerLine && (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER)) {
                workerLogTrace(context, \`(\${urlShort}): Removing Ad Line [Line \${i+1}, Reason: \${removalReason}]: \${trimmedLine.substring(0, 80)}...\`);
            }
        } else {
            cleanLines.push(line);
        }
    }

    if (isAdSection) {
         workerLogWarn(\`[\${context}] (\${urlShort}): M3U8 ended while in ad section (missing CUE-IN?).\`);
    }

    const cleanedText = cleanLines.join('\\n');
    if (adsFound) {
        // Log completion only if debugging
        if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) {
            workerLogDebug(\`[\${context}] (\${urlShort}): M3U8 Cleaning Complete. Removed \${linesRemoved} lines.\`);
        }
        try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', url: urlShort, linesRemoved: linesRemoved }); }
        catch(e) { workerLogError("Error sending ADBLOCK_ADS_REMOVED message:", e); }
    } else {
         if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) { // Log only if debugging
             workerLogTrace(context, \`(\${urlShort}): No ads found/removed during detailed parse.\`);
         }
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
        const fetchContext = 'WorkerInject:FetchIntercept';

        if (method === 'GET' && isM3U8Request) {
             if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) { // Log interception only if debugging
                workerLogTrace(fetchContext, \`Intercepted M3U8 GET: \${urlShort}\`);
             }
            let originalResponse;
            try {
                originalResponse = await workerRealFetch(input, init);

                if (!originalResponse.ok) {
                     workerLogWarn(\`[\${fetchContext}] (\${urlShort}) Original response NOT OK (Status: \${originalResponse.status}). Passing through.\`);
                     return originalResponse;
                }

                const clonedResponse = originalResponse.clone();
                const contentType = clonedResponse.headers.get('Content-Type') || '';
                const m3u8ContentTypes = ['mpegurl', 'vnd.apple.mpegurl', 'octet-stream', 'text/plain', 'x-mpegurl', 'application/x-mpegurl'];

                if (m3u8ContentTypes.some(type => contentType.toLowerCase().includes(type))) {
                     if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) { // Log cleaning start only if debugging
                        workerLogTrace(fetchContext, \`(\${urlShort}) M3U8 content type ('\${contentType}'). Reading and cleaning...\`);
                     }
                     const m3u8Text = await clonedResponse.text();

                     if (!m3u8Text) {
                          workerLogWarn(\`[\${fetchContext}] (\${urlShort}): M3U8 body is empty. Passing through original.\`);
                          return originalResponse;
                     }

                     const { cleanedText, adsFound, linesRemoved } = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);

                     if (adsFound) {
                         const newHeaders = new Headers(originalResponse.headers);
                         newHeaders.delete('Content-Length');
                          if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) { // Log result only if debugging
                            workerLogDebug(\`[\${fetchContext}] (\${urlShort}) Returning CLEANED M3U8. Removed: \${linesRemoved} lines.\`);
                          }
                         return new Response(cleanedText, {
                             status: originalResponse.status,
                             statusText: originalResponse.statusText,
                             headers: newHeaders
                         });
                     } else {
                          if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) { // Log only if debugging
                            workerLogTrace(fetchContext, \`(\${urlShort}) No ads found in M3U8. Passing through original.\`);
                          }
                          return originalResponse;
                     }
                } else {
                     if (LOG_M3U8_CLEANING_WORKER || DEBUG_LOGGING_WORKER) { // Log only if debugging
                        workerLogTrace(fetchContext, \`(\${urlShort}) Response not M3U8 (Type: '\${contentType}'). Passing through.\`);
                     }
                     return originalResponse;
                }
            } catch (error) {
                workerLogError(\`[\${fetchContext}] (\${urlShort}): Error proxying/cleaning M3U8: \`, error);
                 if (originalResponse) {
                     workerLogWarn(\`[\${fetchContext}] (\${urlShort}): Passing through original response due to processing error.\`);
                     return originalResponse;
                 }
                 workerLogError(\`[\${fetchContext}] (\${urlShort}): Failed to fetch original or process before response. Returning error response.\`);
                 return new Response(\`AdBlock Worker Error processing M3U8: \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" });
            }
        } else {
            // Pass through non-M3U8 requests
            return workerRealFetch(input, init);
        }
    };
    self.fetch.hooked_by_adblock = true;
    workerLogDebug(\`[\${context}] Fetch hook installed successfully in Worker.\`);
    return true;
}

// Add message listener for EVAL command and PING
self.addEventListener('message', function(e) {
    if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
        workerLogDebug("[WorkerInject:EvalMsg] Received EVAL_ADBLOCK_CODE. Executing...");
        try {
            eval(e.data.code);
            if (typeof self.fetch === 'function' && !self.fetch.hooked_by_adblock) {
                 workerLogWarn("[WorkerInject:EvalMsg] Fetch hook was not installed after eval. Attempting install now.");
                 if (installWorkerFetchHook()) {
                     try {
                         workerLogDebug("[WorkerInject:EvalMsg] Sending ADBLOCK_WORKER_HOOKS_READY after eval install...");
                         self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval_install' });
                     } catch(postMsgErr) { workerLogError("Error sending ADBLOCK_WORKER_HOOKS_READY post-eval install:", postMsgErr); }
                 } else { workerLogError("Failed to install fetch hook post-eval!"); }
            } else if (typeof self.fetch === 'function' && self.fetch.hooked_by_adblock) {
                workerLogDebug("[WorkerInject:EvalMsg] Fetch hook already present after eval.");
                 try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval_reconfirm' }); } catch(e){}
            }
        } catch (err) { workerLogError("Error executing EVAL_ADBLOCK_CODE:", err); }
    } else if (e.data?.type === 'PING') {
         // Only log PING/PONG if debugging worker
         if (DEBUG_LOGGING_WORKER) {
            workerLogTrace("WorkerInject:Ping", "Received PING from main thread, sending PONG.");
         }
         self.postMessage({ type: 'PONG' });
    }
 });

// Initial installation attempt
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


    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК) + GQL МОДИФИКАЦИЯ ---

    function modifyGqlResponse(responseText, url) {
        const context = 'GQL:Modify';

        if (!MODIFY_GQL_RESPONSE) {
            logTrace(context, `GQL Modification DISABLED via setting.`);
            return responseText;
        }

        try {
            let data = JSON.parse(responseText);
            let modified = false;
            let operationName = 'Unknown';
            const opDataArray = Array.isArray(data) ? data : [data];

            for (const opData of opDataArray) {
                if (!opData) continue;

                operationName = opData?.extensions?.operationName
                || opData?.operationName
                || 'Unknown';

                if (!opData.data && operationName !== 'ClientSideAd') {
                    logTrace(context, `Response from ${url} (Op: ${operationName}) has no 'data' field. Skipping this operation.`);
                    continue;
                }

                // --- Обработка PlaybackAccessToken ---
                if (operationName === GQL_OPERATION_ACCESS_TOKEN_TEMPLATE || operationName === GQL_OPERATION_ACCESS_TOKEN) {
                    logTrace(context, `Processing ${operationName} response.`);
                    const accessData = opData?.data;
                    if (!accessData) {
                        logWarn(context, `No 'data' field found for ${operationName} in response from ${url}. Skipping modification.`);
                        continue;
                    }

                    const processToken = (token, tokenType) => {
                        if (!token) return false;
                        let tokenModified = false;
                        logTrace(context, `Processing ${tokenType}...`);

                        if (token.authorization && typeof token.authorization.is_ad !== 'undefined') {
                            if (token.authorization.is_ad !== false) {
                                logDebug(context, `Setting ${tokenType}.authorization.is_ad = false.`);
                                token.authorization.is_ad = false; tokenModified = true;
                            }
                        }

                        if (token.restrictions && typeof token.restrictions.adAllowed !== 'undefined') {
                            if (token.restrictions.adAllowed !== false) {
                                logDebug(context, `Setting ${tokenType}.restrictions.adAllowed = false.`);
                                token.restrictions.adAllowed = false; tokenModified = true;
                            }
                        }

                        return tokenModified;
                    };

                    const streamTokenModified = processToken(accessData.streamPlaybackAccessToken, 'streamPlaybackAccessToken');
                    const videoTokenModified = processToken(accessData.videoPlaybackAccessToken, 'videoPlaybackAccessToken');

                    if (streamTokenModified || videoTokenModified) {
                        modified = true;
                    }

                }
                // --- Обработка AdFreeQuery ---
                else if (operationName === GQL_OPERATION_AD_FREE_QUERY) {
                    logTrace(context, `Processing ${GQL_OPERATION_AD_FREE_QUERY} response.`);
                    const adData = opData?.data?.viewerAdFreeConfig;
                    if (adData && adData.isAdFree === false) {
                        logDebug(context, `Setting isAdFree = true in ${GQL_OPERATION_AD_FREE_QUERY} response.`);
                        adData.isAdFree = true;
                        modified = true;
                    } else if (adData) {
                        logTrace(context, `isAdFree already true or not present in ${GQL_OPERATION_AD_FREE_QUERY}.`);
                    } else {
                        logTrace(context, `No viewerAdFreeConfig data found in ${GQL_OPERATION_AD_FREE_QUERY}.`);
                    }
                }
            } // End loop through operations

            if (modified) {
                const finalData = Array.isArray(data) ? opDataArray : opDataArray[0];
                logDebug(context, `GQL response MODIFIED for operation(s): ${operationName}`);
                return JSON.stringify(finalData);
            } else {
                logTrace(context, `GQL response not modified.`);
            }

        } catch (e) {
            logError(context, `Error modifying GQL response from ${url}:`, e);
        }
        return responseText;
    }


    async function fetchOverride(input, init) {
        const context = 'NetBlock:Fetch';
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const isM3U8Request = requestUrl.includes('.m3u8');
        const isTsRequest = requestUrl.endsWith('.ts');
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl.substring(0, 60);

        // --- URL Blocking Logic ---
        if (!isGqlRequest) {
            let potentiallyBlocked = AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()));
            if (potentiallyBlocked) {
                try {
                    const domain = new URL(requestUrl).hostname.toLowerCase();
                    if (blockedUrlKeywordsSet.has(domain) || AD_URL_KEYWORDS_BLOCK.some(k => !k.startsWith('gql.') && lowerCaseUrl.includes(k))) {
                        if (!isTsRequest) {
                            logTrace(context, `Blocking Fetch (${method}) to: ${urlShort}`);
                            return Promise.resolve(new Response(null, { status: 403, statusText: "Blocked by TTV AdBlock" }));
                        } else {
                            logTrace(context, `Keyword match but allowing TS Fetch: ${urlShort}`);
                        }
                    }
                } catch(e) { logWarn(context, `URL parsing failed for blocking check: ${urlShort}`, e); }
            }
        }

        // --- Request Logging ---
        if (isGqlRequest && method === 'POST') {
            logGqlOperation('GQL:FetchReq', init?.body);
        } else if (isM3U8Request && method === 'GET') {
            logTrace(context, `Fetch GET M3U8: ${urlShort}`);
        } else if (isTsRequest && method === 'GET') {
            logTrace(context, `Fetch GET TS: ${urlShort}`); // Trace level for TS requests
        }

        // --- M3U8 Handling ---
        if (isM3U8Request && method === 'GET' && INJECT_INTO_WORKERS && workerHookAttempted) {
            logTrace(context, `Passing M3U8 fetch to worker: ${urlShort}`);
            return originalFetch(input, init);
        }

        // --- Fetch Execution and GQL Response Handling ---
        let originalResponse;
        try {
            originalResponse = await originalFetch(input, init);

            // --- GQL Response Modification ---
            if (isGqlRequest && method === 'POST' && originalResponse.ok && MODIFY_GQL_RESPONSE) {
                const contextGQL = 'GQL:FetchResp';
                logTrace(contextGQL, `Intercepting GQL fetch response from: ${requestUrl}`);
                let responseText;
                let clonedResponse;
                try {
                    clonedResponse = originalResponse.clone();
                    responseText = await clonedResponse.text();
                    if (!responseText) {
                        logWarn(contextGQL, `GQL response body is empty for ${requestUrl}. Returning original.`);
                        return originalResponse;
                    }
                } catch (e) {
                    logError(contextGQL, "Error cloning/reading GQL response body:", e);
                    return originalResponse;
                }

                const modifiedText = modifyGqlResponse(responseText, requestUrl);

                if (modifiedText !== responseText) {
                    logTrace(contextGQL, `Returning MODIFIED GQL response for ${requestUrl}`);
                    const newHeaders = new Headers(originalResponse.headers);
                    newHeaders.delete('Content-Length');
                    return new Response(modifiedText, {
                        status: originalResponse.status,
                        statusText: originalResponse.statusText,
                        headers: newHeaders
                    });
                } else {
                    logTrace(contextGQL, `Returning ORIGINAL GQL response for ${requestUrl} (no modifications applied).`);
                    return originalResponse;
                }
            }

            // --- Default: Return original response ---
            logTrace(context, `Returning ORIGINAL response for: ${urlShort}`);
            return originalResponse;

        } catch (error) {
            if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('aborted'))) {
                if (isTsRequest) {
                    logError(context, `CRITICAL: Fetch for TS segment failed: ${urlShort} - Error: ${error.message}`);
                } else if (isM3U8Request) {
                    logWarn(context, `Fetch for M3U8 failed: ${urlShort} - Error: ${error.message}`);
                } else {
                    logWarn(context, `Fetch to ${urlShort} failed/blocked: ${error.message}`);
                }
                return Promise.resolve(new Response(null, { status: 0, statusText: `Blocked/Failed (${error.message})` }));
            } else {
                logError(context, `Unexpected fetch error for ${urlShort}:`, error);
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
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const isM3U8Request = urlString.includes('.m3u8');
        const isTsRequest = urlString.endsWith('.ts');
        const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60);


        // --- URL Blocking Logic for XHR ---
        if (!isGqlRequest) {
            let potentiallyBlocked = AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()));
            if (potentiallyBlocked) {
                try {
                    const domain = new URL(urlString).hostname.toLowerCase();
                    if (blockedUrlKeywordsSet.has(domain) || AD_URL_KEYWORDS_BLOCK.some(k => !k.startsWith('gql.') && lowerCaseUrl.includes(k))) {
                        if (!isTsRequest) {
                            logTrace(context, `Marking XHR (${method}) for blocking: ${urlShort}`);
                            blocked = true;
                        } else {
                            logTrace(context, `Keyword match but allowing TS XHR: ${urlShort}`);
                        }
                    }
                } catch (e) { logWarn(context, `URL parsing failed for XHR blocking check: ${urlShort}`, e); }
            }
        }

        xhrRequestData.set(this, { method: method.toUpperCase(), url: urlString, urlShort: urlShort, blocked: blocked, isGql: isGqlRequest, isM3U8: isM3U8Request });

        // --- GQL Response Modification Hook ---
        if (isGqlRequest && MODIFY_GQL_RESPONSE) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const reqData = xhrRequestData.get(this);
                    if (reqData?.isGql) {
                        const contextGQL = 'GQL:XhrResp';
                        logTrace(contextGQL, `Intercepting GQL XHR response (on load): ${reqData.urlShort}`);
                        const originalResponseText = this.responseText;
                        if (typeof originalResponseText !== 'string' || originalResponseText.length === 0) {
                            logWarn(contextGQL, `XHR responseText invalid/empty for ${reqData.urlShort}. Cannot modify.`);
                            return;
                        }
                        const modifiedText = modifyGqlResponse(originalResponseText, reqData.url);
                        if (modifiedText !== originalResponseText) {
                            logTrace(contextGQL, `Storing MODIFIED GQL response for XHR ${reqData.urlShort}`);
                            xhrRequestData.set(this, { ...reqData, modifiedResponse: modifiedText });
                        } else {
                            logTrace(contextGQL, `Storing ORIGINAL GQL response indication for XHR ${reqData.urlShort}`);
                            xhrRequestData.set(this, { ...reqData, modifiedResponse: null });
                        }
                    }
                }
            }, { once: true, passive: true });
        }

        // --- M3U8 Handling ---
        if (isM3U8Request && method.toUpperCase() === 'GET' && INJECT_INTO_WORKERS && workerHookAttempted) {
            logTrace(context, `Passing M3U8 XHR to worker (via original open): ${urlShort}`);
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `Error in original xhr.open for M3U8 (worker bypass) ${urlShort}:`, error); throw error; }
        }

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `Error in original xhr.open for ${urlShort}:`, error); throw error; }
        } else {
            try { originalXhrOpen.apply(this, arguments); }
            catch(e) { logWarn(context, `Ignoring error during open for blocked XHR: ${e.message}`); }
        }
    }


    function xhrSendOverride(data) {
        const context = 'NetBlock:XHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            logWarn(context, "No requestInfo found for XHR send. Calling original send.");
            try { return originalXhrSend.apply(this, arguments); }
            catch(e) { logError(context, "Error calling original xhr.send without requestInfo:", e); throw e;}
        }

        const { method, url, urlShort, blocked, isGql, isM3U8 } = requestInfo;

        if (blocked) {
            logWarn(context, `Blocking XHR (${method}) send to ${urlShort}`);
            this.dispatchEvent(new ProgressEvent('abort'));
            this.dispatchEvent(new ProgressEvent('error'));
            try {
                Object.defineProperty(this, 'readyState', { value: 4, writable: false, configurable: true });
                Object.defineProperty(this, 'status', { value: 0, writable: false, configurable: true });
            } catch (e) { /* Ignore */ }
            return;
        }

        // Log GQL request body if applicable
        if (isGql && method === 'POST') {
            logGqlOperation('GQL:XhrReq', data);
        } else if (isM3U8 && method === 'GET') {
            logTrace(context, `XHR GET M3U8: ${urlShort}`);
        } else if (url.endsWith('.ts') && method === 'GET') {
            logTrace(context, `XHR GET TS: ${urlShort}`); // Trace level for TS requests
        }

        try {
            return originalXhrSend.apply(this, arguments);
        } catch (error) {
            if (error.name === 'NetworkError' || (error.message && (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to execute') ) ) ) {
                if (url.endsWith('.ts')) {
                    logError(context, `CRITICAL: XHR send for TS segment failed: ${urlShort} - Error: ${error.message}`);
                } else {
                    logWarn(context, `XHR send to ${urlShort} failed (Network Error/Blocked?): ${error.message}`);
                }
            } else {
                logError(context, `Unknown error in xhr.send for ${urlShort}:`, error);
            }
            throw error;
        }
    }


    function logGqlOperation(context, body) {
        if (!LOG_GQL_INTERCEPTION || !body) return; // Only log if GQL logging is enabled
        try {
            let operationNames = ['UnknownOperation'];
            let parsedBody;

            if (typeof body === 'string') {
                try { parsedBody = JSON.parse(body); } catch(e){ logTrace(context, `Failed to parse GQL string body: ${e.message}`); return; }
            } else if (body instanceof Blob || body instanceof ArrayBuffer) {
                logTrace(context, `GQL Request Body is Blob/ArrayBuffer. Cannot inspect content synchronously.`);
                return;
            } else if (typeof body === 'object' && body !== null) {
                parsedBody = body;
            } else {
                logTrace(context, `GQL Request Body is of unknown/unhandled type: ${typeof body}`);
                return;
            }

            if (!parsedBody) return;

            if (Array.isArray(parsedBody)) {
                operationNames = parsedBody.map(op => op?.operationName || 'Unknown');
            } else if (typeof parsedBody === 'object' && parsedBody !== null) {
                operationNames = [parsedBody.operationName || 'Unknown'];
            }

            const opNameStr = operationNames.join(', ');
            logTrace(context, `GraphQL Request: ${opNameStr}`);

            if (operationNames.some(name => name === GQL_OPERATION_ACCESS_TOKEN || name === GQL_OPERATION_ACCESS_TOKEN_TEMPLATE || name === GQL_OPERATION_AD_FREE_QUERY)) {
                logDebug(context, `--> Intercepted crucial GQL operation(s): ${opNameStr}`);
            }
        } catch (e) { logWarn(context, `Failed to parse GQL request body for logging: ${e.message}`); }
    }


    // --- ЛОГИКА ВНЕДРЕНИЯ КОДА В WEB WORKER'Ы ---

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true;
        const context = 'WorkerInject:MsgListener';

        workerInstance.addEventListener('error', (e) => {
            logError(context, `Error INSIDE Worker (${label}):`, e.message, `(${e.filename || 'unknown'}:${e.lineno || '?'}:${e.colno || '?'})`);
        }, { passive: true });

        // OPTIMIZED Listener: Reduced logging for non-AdBlock messages
        const adBlockListener = (e) => {
            const msgData = e.data;
            if (msgData && typeof msgData.type === 'string' && msgData.type.startsWith('ADBLOCK_')) {
                // Handle known AdBlock messages
                switch (msgData.type) {
                    case 'ADBLOCK_WORKER_HOOKS_READY':
                        logDebug('WorkerInject:Confirm', `---> HOOKS READY received from Worker (${label})! Method: ${msgData.method || 'N/A'}`);
                        hookedWorkers.add(label);
                        break;
                    case 'ADBLOCK_ADS_REMOVED':
                        // Log ad removal only if M3U8 cleaning logs are enabled OR master debug is on
                        if (LOG_M3U8_CLEANING || DEBUG_LOGGING) {
                            logDebug('M3U8 Clean:Confirm', `ADBLOCK_ADS_REMOVED from Worker (${label}). URL: ${msgData.url || 'N/A'}, Removed: ${msgData.linesRemoved}`);
                        }
                        break;
                    default:
                        logTrace(context, `Received unhandled AdBlock message from (${label}):`, msgData);
                }
            } else if (msgData?.type === 'PONG') {
                // Only log PONG if worker injection logging is enabled
                logTrace(context, `Received PONG from Worker (${label}). Communication OK.`);
            } else {
                // Log other messages ONLY if full debugging AND worker injection logging are enabled.
                // This significantly reduces the noise from frequent non-string type messages.
                if (DEBUG_LOGGING && LOG_WORKER_INJECTION) {
                    logTrace(context, `Received OTHER message from Worker (${label}):`, msgData);
                }
            }
        };
        workerInstance.addEventListener('message', adBlockListener, { passive: true });
        workerInstance._adBlockListener = adBlockListener;
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
                let isIVSWorker = false;

                try {
                    if (isBlobURL) {
                        workerLabel = `blob:${urlString.substring(5, 25)}...`;
                    } else if (urlString) {
                        workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60);
                        if (workerLabel.includes('amazon-ivs-wasmworker')) {
                            isIVSWorker = true;
                            workerLabel += " (IVS)";
                        }
                    }
                    logTrace(context, `Worker constructor called. Source: ${workerLabel}, Type: ${isBlobURL ? 'Blob' : 'Script'}${isIVSWorker ? ', IVS' : ''}`);

                    super(scriptURL, options);
                    this._workerLabel = workerLabel;
                    addWorkerMessageListeners(this, workerLabel);

                    if (isIVSWorker) {
                        logDebug(context, `Skipping code injection for IVS worker (${workerLabel}). Listeners attached only.`);
                        return;
                    }

                    setTimeout(() => {
                        if (!hookedWorkers.has(this._workerLabel)) {
                            logTrace(context, `Worker (${this._workerLabel}) not confirmed hooked. Attempting injection via postMessage (EVAL)...`);
                            try {
                                this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: getWorkerInjectionCode() });
                            } catch(e) {
                                logError(context, `Error using postMessage fallback for ${this._workerLabel}:`, e);
                            }
                        } else {
                            logTrace(context, `Worker (${this._workerLabel}) already confirmed hooked. Skipping postMessage injection.`);
                        }
                    }, 150);

                } catch (constructorError) {
                    logError(context, `Error in HookedWorker constructor for ${workerLabel}:`, constructorError);
                    throw constructorError;
                }
            }
        };

        try {
            Object.keys(OriginalWorker).forEach(key => {
                if (!unsafeWindow.Worker.hasOwnProperty(key)) {
                    try { unsafeWindow.Worker[key] = OriginalWorker[key]; } catch(e){}
                }
            });
            Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker);
            Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorker.prototype);
        } catch (e) { logError(context, "Failed to restore Worker prototype chain:", e); }

        unsafeWindow.Worker.hooked_by_adblock = true;
        logDebug(context, "Worker constructor hooked successfully (Using postMessage EVAL fallback).");
    }


    // --- УСТАНОВКА ХУКОВ В ОСНОВНОМ ПОТОКЕ ---
    function installHooks() {
        const context = 'MainHooks';
        if (hooksInstalledMain) {
            logTrace(context, "Hooks already installed.");
            return;
        }
        logDebug(context, "Installing main thread hooks...");

        // Fetch Hook
        try { unsafeWindow.fetch = fetchOverride; logTrace(context, "Fetch API hooked."); }
        catch (e) { logError(context, "Failed to hook Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }

        // XHR Hooks
        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;

            // Hook response/responseText getters for GQL
            if (originalXhrResponseGetter && originalXhrResponseGetter.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.isGql && reqData.modifiedResponse !== undefined && reqData.modifiedResponse !== null && (this.responseType === '' || this.responseType === 'text')) {
                            logTrace(context, `XHR getter: Returning MODIFIED response for ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try {
                            return originalXhrResponseGetter.get.call(this);
                        } catch (getterError) {
                            logWarn(context, `Error calling original XHR response getter for ${reqData?.urlShort}: ${getterError.message}`);
                            return null;
                        }
                    },
                    configurable: true
                });
            } else { logWarn(context, "Could not hook XHR 'response' getter."); }

            if (originalXhrResponseTextGetter && originalXhrResponseTextGetter.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.isGql && reqData.modifiedResponse !== undefined && reqData.modifiedResponse !== null) {
                            logTrace(context, `XHR getter: Returning MODIFIED responseText for ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try {
                            return originalXhrResponseTextGetter.get.call(this);
                        } catch (getterError) {
                            logWarn(context, `Error calling original XHR responseText getter for ${reqData?.urlShort}: ${getterError.message}`);
                            return "";
                        }
                    },
                    configurable: true
                });
            } else { logWarn(context, "Could not hook XHR 'responseText' getter."); }

            logTrace(context, "XMLHttpRequest hooks (open, send, response, responseText) installed.");
        } catch (e) {
            logError(context, "Failed to hook XMLHttpRequest:", e);
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend;
            if (originalXhrResponseGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', originalXhrResponseGetter); } catch(revertErr) {}
            if (originalXhrResponseTextGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', originalXhrResponseTextGetter); } catch (revertErr) {}
        }

        // Worker Hooks
        if (INJECT_INTO_WORKERS) {
            try { hookWorkerConstructor(); }
            catch (e) { logError(context, "Failed to hook Worker constructor:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            // Hook revokeObjectURL for debug logging
            try {
                unsafeWindow.URL.revokeObjectURL = function(url) {
                    // Log only if specifically debugging worker injection
                    if(LOG_WORKER_INJECTION && typeof url === 'string' && url.startsWith('blob:')) {
                        logTrace('WorkerInject:Revoke', `revokeObjectURL: ${String(url).substring(0, 60)}...`);
                    }
                    if (typeof originalRevokeObjectURL === 'function') {
                        return originalRevokeObjectURL.call(unsafeWindow.URL, url);
                    } else {
                        logWarn('WorkerInject:Revoke', 'Original revokeObjectURL not available.');
                    }
                };
                logTrace(context, "URL.revokeObjectURL hooked (for logging).");
            } catch(e) {
                logWarn(context, "Failed to hook revokeObjectURL:", e);
            }
        } else {
            logWarn(context, "Worker injection is disabled.");
            workerHookAttempted = false;
        }

        hooksInstalledMain = true;
        logDebug(context, "Main thread hooks installation complete.");
    }


    // --- ФУНКЦИИ МОНИТОРИНГА И ПЕРЕЗАГРУЗКИ ПЛЕЕРА ---

    function findVideoPlayer() {
        const context = 'PlayerMon:Finder';
        if (videoElement && videoElement.isConnected && videoElement.offsetParent !== null) {
            logTrace(context, 'Re-using existing valid video element.');
            return videoElement;
        }
        logTrace(context, 'Searching for new video element...');
        const selectors = [
            'div[data-a-target="video-player"] video[playsinline]',
            'main video[playsinline][src]',
            '.video-player__container video',
            PLAYER_SELECTOR,
            'div[data-a-target="video-player-layout"] video',
            '.persistent-player video',
            'video[class*="video-player"]',
            'div[class*="player"] video',
            'video[src]',
            'video'
        ];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.tagName === 'VIDEO' &&
                    (element.src || element.currentSrc || element.hasAttribute('src') || element.querySelector('source[src]')) &&
                    element.offsetWidth > 0 && element.offsetHeight > 0 && element.isConnected)
                {
                    logDebug(context, `Video element found via selector: ${selector}`);
                    videoElement = element;
                    return element;
                }
            } catch (e) { logWarn(context, `Error using selector "${selector}": ${e.message}`); }
        }
        logWarn(context, 'Video element not found.');
        videoElement = null;
        return null;
    }

    function setupPlayerMonitor() {
        const context = 'PlayerMon:Setup';
        if (!ENABLE_AUTO_RELOAD) {
            logDebug(context, 'Auto-reload disabled. Monitor will not start.');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); videoElement = null; }
            return;
        }

        const currentVideoElement = findVideoPlayer();

        if (!currentVideoElement) {
            logTrace(context, 'Video element not found. Retrying setup in 5s.');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); videoElement = null; }
            setTimeout(setupPlayerMonitor, 5000);
            return;
        }

        if (currentVideoElement !== videoElement || !playerMonitorIntervalId) {
            logDebug(context, `New/changed video element or monitor inactive. Re-initializing...`);

            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); }

            videoElement = currentVideoElement;

            checkReloadCooldown(context);
            addPlayerEventListeners();
            resetMonitorState('Monitor setup/reset');

            if (!document.hidden) {
                if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
                playerMonitorIntervalId = setInterval(monitorPlayerState, 2000);
                logDebug(context, `Player monitor STARTED (Interval: 2s, Stall: ${RELOAD_STALL_THRESHOLD_MS}ms, Buffer: ${RELOAD_BUFFERING_THRESHOLD_MS}ms).`);
            } else {
                logDebug(context, `Document hidden, delaying monitor interval start.`);
            }
        } else {
            logTrace(context, 'Player monitor already running for the current video element.');
        }
    }

    function triggerReload(reason) {
        const context = 'PlayerMon:Reload';
        const now = Date.now();

        if (reloadTimeoutId) {
            logWarn(context, `Reload (${reason}) requested, but another is scheduled. Ignoring.`);
            return;
        }

        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn(context, `Reload (${reason}) cancelled: Cooldown active (${((RELOAD_COOLDOWN_MS - (now - lastReloadTimestamp))/1000).toFixed(1)}s left).`);
            return;
        }
        if (document.hidden) {
            logWarn(context, `Reload (${reason}) cancelled: Tab is hidden.`);
            return;
        }

        logError(context, `!!!!!! TRIGGERING PAGE RELOAD !!!!!! Reason: ${reason}.`);
        lastReloadTimestamp = now;

        try {
            sessionStorage.setItem('ttv_adblock_last_reload', now.toString());
        } catch (e) {
            logWarn(context, 'Failed to set sessionStorage for reload cooldown:', e);
        }

        unsafeWindow.location.reload();

        setTimeout(() => {
            logWarn(context, "Reload fallback triggered (if page didn't reload).");
            unsafeWindow.location.reload(true);
        }, 2000);
    }

    function scheduleReload(reason, delayMs = 5000) {
        const context = 'PlayerMon:ScheduleReload';
        if (reloadTimeoutId || !ENABLE_AUTO_RELOAD || document.hidden) {
            logTrace(context, `Skipping schedule reload (${reason}): Already scheduled, disabled, or hidden tab.`);
            return;
        }

        logWarn(context, `Scheduling reload in ${(delayMs / 1000).toFixed(1)}s. Reason: ${reason}`);
        reloadTimeoutId = setTimeout(() => {
            const internalReason = reason;
            reloadTimeoutId = null;
            triggerReload(internalReason);
        }, delayMs);
        try { if (reloadTimeoutId) reloadTimeoutId._reason = reason; } catch(e){}
    }


    function resetMonitorState(reason = '') {
        const context = 'PlayerMon:State';
        if (reloadTimeoutId) {
            clearTimeout(reloadTimeoutId);
            reloadTimeoutId = null;
            logTrace(context, `Scheduled reload cancelled due to state reset (${reason || 'N/A'}).`);
        }
        const now = Date.now();
        lastVideoTimeUpdateTimestamp = now;
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0;
        logTrace(context, `Monitor state reset (${reason || 'N/A'}). Known Time: ${lastKnownVideoTime > -1 ? lastKnownVideoTime.toFixed(2) : 'N/A'}`);
    }

    function monitorPlayerState() {
        const context = 'PlayerMon:Monitor';

        if (!ENABLE_AUTO_RELOAD) {
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            return;
        }

        if (document.hidden) {
            return;
        }

        if (!videoElement || !videoElement.isConnected) {
            logWarn(context, 'Video element lost. Stopping monitor, attempting restart.');
            if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners();
            videoElement = null;
            setTimeout(setupPlayerMonitor, 1000);
            return;
        }

        const now = Date.now();
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        const networkState = videoElement.networkState;
        let detectedProblemReason = null;

        // --- Stall Detection ---
        if (!videoElement.paused && !videoElement.ended && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;

            if (LOG_PLAYER_MONITOR && timeSinceLastUpdate > 1000) { // Log stall check only if player monitor logs enabled
                logTrace(context, `Stall Check: CT=${currentTime.toFixed(2)}, LKT=${lastKnownVideoTime.toFixed(2)}, DeltaT=${timeSinceLastUpdate.toFixed(0)}ms, RS=${readyState}, NS=${networkState}, Paused=${videoElement.paused}, Ended=${videoElement.ended}`);
            }

            if (currentTime === lastKnownVideoTime && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                if (readyState < videoElement.HAVE_FUTURE_DATA || networkState === videoElement.NETWORK_IDLE) {
                    detectedProblemReason = `Stall: currentTime (${currentTime.toFixed(2)}) stuck for ${timeSinceLastUpdate.toFixed(0)}ms (RS ${readyState}, NS ${networkState})`;
                } else {
                    logTrace(context, `Time stuck, but state okay (RS ${readyState}, NS ${networkState}). Monitoring.`);
                }
            }
            else if (lastKnownVideoTime > 0 && currentTime < (lastKnownVideoTime - 0.5)) {
                detectedProblemReason = `Stall: currentTime (${currentTime.toFixed(2)}) rewound from (${lastKnownVideoTime.toFixed(2)})`;
            }

            if (currentTime > lastKnownVideoTime) {
                lastVideoTimeUpdateTimestamp = now;
                lastKnownVideoTime = currentTime;
                if (isWaitingForDataTimestamp > 0) {
                    logTrace(context, "Time updated, clearing buffering state.");
                    isWaitingForDataTimestamp = 0;
                }
                if (reloadTimeoutId && !detectedProblemReason) {
                    logDebug(context, "Playback resumed. Cancelling scheduled reload.");
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                }
            }
        } else {
            lastKnownVideoTime = currentTime;
            if (isWaitingForDataTimestamp > 0) {
                logTrace(context, `Video paused/ended, clearing buffering state.`);
                isWaitingForDataTimestamp = 0;
            }
            if (reloadTimeoutId) {
                logTrace(context, `Video paused/ended. Cancelling scheduled reload.`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }

        // --- Buffering Detection ---
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            const bufferingDuration = now - isWaitingForDataTimestamp;
            if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS) {
                if (!detectedProblemReason) {
                    detectedProblemReason = `Excessive Buffering > ${(bufferingDuration / 1000).toFixed(1)}s (RS ${readyState}, NS ${networkState})`;
                }
            }
        }
        const isPlayingAndReady = !videoElement.paused && !videoElement.ended && readyState >= videoElement.HAVE_FUTURE_DATA;
        if (isPlayingAndReady && isWaitingForDataTimestamp > 0) {
            logTrace(context, "Buffering seems resolved. Clearing timer.");
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId && !reloadTimeoutId._reason?.toLowerCase().includes('stall')) {
                logDebug(context, "Buffering resolved. Cancelling buffer-related reload.");
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }

        // --- Trigger Reload ---
        if (detectedProblemReason && !reloadTimeoutId) {
            scheduleReload(detectedProblemReason);
        }
    }

    function checkReloadCooldown(context) {
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const parsedTime = parseInt(sessionReloadTime, 10);
                sessionStorage.removeItem('ttv_adblock_last_reload');
                if (!isNaN(parsedTime)) {
                    const timeSinceLastReload = Date.now() - parsedTime;
                    if (timeSinceLastReload < RELOAD_COOLDOWN_MS && timeSinceLastReload >= 0) {
                        const cooldownRemaining = RELOAD_COOLDOWN_MS - timeSinceLastReload;
                        logWarn(context, `Recent reload detected (${(timeSinceLastReload / 1000).toFixed(1)}s ago). Cooldown active for ${(cooldownRemaining / 1000).toFixed(1)}s.`);
                        lastReloadTimestamp = Date.now() - timeSinceLastReload;
                    }
                }
            }
        } catch (e) { logWarn(context, "Failed to check sessionStorage for reload cooldown:", e); }
    }

    function addPlayerEventListeners() {
        if (!videoElement || videoElement._adblockListenersAttached) return;
        const context = 'PlayerMon:Events';
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true });
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true });
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });
        videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true });
        videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true });
        videoElement.addEventListener('abort', handlePlayerAbort, { passive: true });
        videoElement.addEventListener('timeupdate', handlePlayerTimeUpdate, { passive: true });
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
        videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
        delete videoElement._adblockListenersAttached;
        logTrace(context, 'Player event listeners removed.');
    }

    // --- Event Handlers ---
    function handlePlayerError(event) {
        const context = 'PlayerMon:EventError';
        const error = event?.target?.error;
        if (!error) { logWarn(context, 'Error event without video.error details.'); return; }
        logError(context, `Player Error! Code: ${error.code}, Message: "${error.message || 'N/A'}"`);
        if (ENABLE_AUTO_RELOAD && RELOAD_ON_ERROR_CODES.includes(error.code)) {
            const reason = `Player Error (Code ${error.code}: ${error.message || 'Unknown'})`;
            scheduleReload(reason, 3000);
        } else if (ENABLE_AUTO_RELOAD) {
            logWarn(context, `Player error code ${error.code} not in RELOAD_ON_ERROR_CODES. Not scheduling reload automatically.`);
        }
    }

    function handlePlayerWaiting() {
        const context = 'PlayerMon:EventWaiting';
        if (videoElement && !videoElement.paused && isWaitingForDataTimestamp === 0 && !document.hidden) {
            logTrace(context, 'Player waiting for data (buffering started).');
            isWaitingForDataTimestamp = Date.now();
        } else {
            logTrace(context, 'Player waiting event ignored (paused, already buffering, or hidden tab).');
        }
    }

    function handlePlayerPlaying() {
        const context = 'PlayerMon:EventPlaying';
        if (isWaitingForDataTimestamp > 0) {
            logTrace(context, 'Player playing, buffering resolved.');
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId && !reloadTimeoutId._reason?.toLowerCase().includes('stall')) {
                logDebug(context, "Buffering resolved. Cancelling scheduled reload.");
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }
        resetMonitorState('Player playing');
        setQualitySettings(true);
    }

    function handlePlayerPause() {
        const context = 'PlayerMon:EventPause';
        logTrace(context, 'Player paused.');
        if (isWaitingForDataTimestamp > 0) {
            isWaitingForDataTimestamp = 0;
            logTrace(context, 'Cleared buffering state on pause.');
        }
        if (reloadTimeoutId) {
            clearTimeout(reloadTimeoutId);
            reloadTimeoutId = null;
            logDebug(context, 'Scheduled reload cancelled due to pause.');
        }
        lastVideoTimeUpdateTimestamp = Date.now();
        if (videoElement) lastKnownVideoTime = videoElement.currentTime;
    }

    function handlePlayerEmptied() {
        const context = 'PlayerMon:EventEmptied';
        logWarn(context, 'Player source emptied. Resetting state.');
        resetMonitorState('Player source emptied');
        setTimeout(setupPlayerMonitor, 500);
    }

    function handlePlayerLoadedMeta() {
        const context = 'PlayerMon:EventLoadedMeta';
        logTrace(context, 'Player metadata loaded.');
        resetMonitorState('Metadata loaded');
        setQualitySettings(true);
    }

    function handlePlayerAbort() {
        const context = 'PlayerMon:EventAbort';
        logWarn(context, 'Player loading aborted (e.g., navigation). Resetting state.');
        resetMonitorState('Player loading aborted');
    }

    function handlePlayerTimeUpdate() {
        const context = 'PlayerMon:EventTimeUpdate';
        if (videoElement) {
            const currentTime = videoElement.currentTime;
            if (currentTime > lastKnownVideoTime) {
                lastVideoTimeUpdateTimestamp = Date.now();
                lastKnownVideoTime = currentTime;
                if (isWaitingForDataTimestamp > 0) {
                    isWaitingForDataTimestamp = 0;
                }
                if (reloadTimeoutId) {
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                }
            }
            // Only log timeupdate trace if player monitor logging is enabled
            if (LOG_PLAYER_MONITOR) {
                const now = Date.now();
                if (!videoElement._lastTimeUpdateLog || now - videoElement._lastTimeUpdateLog > 5000) { // Throttle log
                    logTrace(context, `TimeUpdate: CT=${currentTime.toFixed(2)}`);
                    videoElement._lastTimeUpdateLog = now;
                }
            }
        }
    }


    // --- VISIBILITY CHANGE HANDLING ---
    function handleVisibilityChange() {
        const context = 'Visibility';
        if (document.hidden) {
            logTrace(context, 'Document became hidden.');
            if (playerMonitorIntervalId) {
                logDebug(context, 'Pausing player monitor interval.');
                clearInterval(playerMonitorIntervalId);
                playerMonitorIntervalId = null;
            }
            if (reloadTimeoutId) {
                logDebug(context, 'Tab hidden, cancelling scheduled reload.');
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
            if (visibilityResumeTimer) {
                clearTimeout(visibilityResumeTimer);
                visibilityResumeTimer = null;
            }
            if (isWaitingForDataTimestamp > 0) {
                logTrace(context, 'Tab hidden, resetting buffering state.');
                isWaitingForDataTimestamp = 0;
            }

        } else {
            logTrace(context, 'Document became visible.');
            if (visibilityResumeTimer) clearTimeout(visibilityResumeTimer);

            visibilityResumeTimer = setTimeout(() => {
                visibilityResumeTimer = null;
                logDebug(context, 'Processing visibility resume...');
                setQualitySettings(true);

                if (ENABLE_AUTO_RELOAD && !playerMonitorIntervalId) {
                    logDebug(context, 'Restarting player monitor after visibility change.');
                    resetMonitorState('Visibility resume');
                    checkReloadCooldown(context);
                    setupPlayerMonitor();
                } else if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) {
                    logTrace(context, 'Player monitor already running.');
                    resetMonitorState('Visibility resume check');
                }
                if (videoElement && videoElement.paused && !videoElement.ended && videoElement.readyState >= videoElement.HAVE_FUTURE_DATA) {
                    logTrace(context, 'Attempting to resume paused video after becoming visible.');
                    videoElement.play().catch(e => logWarn(context, 'Failed to auto-resume video:', e.message));
                }

            }, VISIBILITY_RESUME_DELAY_MS);
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });


    // --- ИНИЦИАЛИЗАЦИЯ ---
    logDebug('Init', 'DOM Content Loading...');
    installHooks();
    setQualitySettings(true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPlayerMonitor, { once: true, passive: true });
    } else {
        setupPlayerMonitor();
    }

    setTimeout(() => {
        if (!videoElement) {
            logWarn('Init', 'Initial player search failed, retrying...');
            setupPlayerMonitor();
        }
    }, 5000);

})();