// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource_TriggerBased
// @version      18.3.2
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
    const SCRIPT_VERSION = '18.3.2';

    // Настройки отображения ошибок и логирования
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrors', false);
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false); //
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', false);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', false);
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', false); //
    const LOG_PLAYER_MONITOR = GM_getValue('TTV_AdBlock_LogPlayerMon', false);
    const LOG_QUALITY_SETTER = GM_getValue('TTV_AdBlock_LogQualitySet', false);

    // Основные переключатели функций
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);

    // Настройки для авто-перезагрузки плеера
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [2, 3, 4, 1000, 2000, 3000, 4000, 5000]);
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 5000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 15000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);

    // --- КОНСТАНТЫ СКРИПТА ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`; // Префикс для логов
    const LS_KEY_QUALITY = 'video-quality'; // Ключ в localStorage для настроек качества
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}'; // Значение для качества "Источник" ("Source")
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken'; // Имя GraphQL операции для получения токена доступа к плееру
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad'; // Атрибут в M3U8, указывающий на сшитую рекламу
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-SCTE35'];
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED'];
    const AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com',
        'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag',
        'ttvl-o.cloudfront.net', // Рекламный CDN Twitch
        'd2v02itv0y9u9t.cloudfront.net', // Замечен в логах, связан с рекламой/трекингом
        'edge.ads.twitch.tv', // Прямой домен рекламы Twitch
        '.google.com/pagead/conversion/', // Трекинг конверсий Google Ads
        '.youtube.com/api/stats/ads', // Статистика рекламы YouTube (может использоваться Twitch)
        '.cloudfront.net/prod/vod-manifests/', // Потенциальная реклама в VOD
        'googletagservices.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'twitch.tv/api/ads' // Гипотетическая точка API рекламы
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
    function logTrace(source, message, ...args) {
        const lowerSource = source.toLowerCase();
        // Логирование включается соответствующим флагом ИЛИ общим DEBUG_LOGGING
        // Исключаем частые логи монитора из DEBUG для чистоты, если не включен LOG_PLAYER_MONITOR
        if ( (lowerSource.includes('m3u8') && LOG_M3U8_CLEANING) ||
            (lowerSource.includes('netblock') && LOG_NETWORK_BLOCKING) ||
            (lowerSource.includes('gql') && LOG_GQL_INTERCEPTION) ||
            (lowerSource.includes('workerinject') && LOG_WORKER_INJECTION) ||
            (lowerSource.includes('playermon') && LOG_PLAYER_MONITOR) ||
            (lowerSource.includes('qualityset') && LOG_QUALITY_SETTER) ||
            (DEBUG_LOGGING && !(lowerSource.includes('playermon') && !LOG_PLAYER_MONITOR)) // Общий DEBUG показывает всё, кроме PlayerMon, если он выключен
           ) {
            console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args);
        }
    }

    logDebug('Main', `Запуск скрипта. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. Quality Check: Trigger-Based. Auto Reload: ${ENABLE_AUTO_RELOAD}.`);

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА "ИСТОЧНИК" (ПО ТРИГГЕРАМ) ---
    /**
     * Проверяет и устанавливает качество видео "Источник" в localStorage.
     * Использует кэширование. Вызывается по триггерам (инициализация, навигация, смена видимости, загрузка метаданных плеера).
     * @param {boolean} forceCheck - Если true, принудительно читает значение из localStorage, игнорируя кэш.
     */
    function setQualitySettings(forceCheck = false) {
        const context = 'QualitySet';
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue; // Обновляем кэш
                logTrace(context, `Прочитано из localStorage: ${currentValue}. (Force Check: ${forceCheck})`);
            } else {
                logTrace(context, `Используем кэш: ${currentValue}`);
            }

            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE; // Обновляем кэш после успешной установки
                logDebug(context, `Установлено качество 'Источник' ('${TARGET_QUALITY_VALUE}') через localStorage.`);
            } else {
                logTrace(context, `Качество 'Источник' уже установлено.`);
            }
        } catch (e) {
            logError(context, 'Ошибка установки/проверки настроек качества:', e);
            cachedQualityValue = null; // Сбрасываем кэш при ошибке
        }
    }

    // Перехватываем localStorage.setItem для поддержания актуальности кэша `cachedQualityValue`.
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
                if (key === LS_KEY_QUALITY) cachedQualityValue = null;
                throw e;
            }
        };
        // Инициализируем кэш текущим значением из localStorage при запуске скрипта
        cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
        logTrace('QualitySet:LocalStorageHook', `Начальное значение качества кэшировано: ${cachedQualityValue}`);
    } catch(e) {
        logError('QualitySet:LocalStorageHook', 'Критическая ошибка при перехвате localStorage.setItem:', e);
        if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
    }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WEB WORKER (Оптимизированное логирование) ---
    /**
     * Генерирует код, который будет внедрен в Web Worker'ы Twitch.
     * @returns {string} Код для внедрения.
     */
    function getWorkerInjectionCode() {
        // Используем шаблонные строки для вставки актуальных настроек и констант
        return `
// --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)}.map(kw => kw.toUpperCase());
const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

// --- Функции логирования внутри Worker'а ---
function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
function workerLogTrace(source, message, ...args) { if (LOG_M3U8_CLEANING_WORKER) console.debug(\`\${LOG_PREFIX_WORKER_BASE} [\${source}] TRACE:\`, message, ...args); }

workerLogDebug("--- Worker AdBlock Code Initializing ---");

/**
 * Парсит и очищает M3U8 плейлист от рекламных сегментов.
 * @param {string} m3u8Text - Текст M3U8 плейлиста.
 * @param {string} [url="N/A"] - URL плейлиста (для логирования).
 * @returns {{cleanedText: string, adsFound: boolean, linesRemoved: number}} - Объект с очищенным текстом, флагом нахождения рекламы и количеством удаленных строк.
 */
function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
    const context = 'M3U8 Clean';
    const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;

    if (!m3u8Text || typeof m3u8Text !== 'string') {
        workerLogWarn(\`[\${context}] (\${urlShort}): Invalid or empty M3U8 text received.\`);
        return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
    }

    // --- Оптимизация: Быстрая проверка на наличие потенциальных маркеров рекламы ---
    let potentialAdContent = false;
    const upperM3U8Text = m3u8Text.toUpperCase();
    if (m3u8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER) ||
        AD_SIGNIFIERS_GENERAL_WORKER.some(sig => m3u8Text.includes(sig)) ||
        AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperM3U8Text.includes(kw))) {
        potentialAdContent = true;
    }

    if (!potentialAdContent) {
        return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
    }

    workerLogTrace(context, \`(\${urlShort}): Potential ad markers found. Starting detailed parse...\`);

    // --- Детальный парсинг и очистка ---
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
            shouldRemoveLine = true;
        }

        if (shouldRemoveLine) {
            linesRemoved++;
            if (isAdMarkerLine && LOG_M3U8_CLEANING_WORKER) {
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

/**
 * Устанавливает хук на функцию fetch внутри Worker'а.
 * @returns {boolean} - True, если хук успешно установлен, иначе false.
 */
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
             return workerRealFetch(input, init);
        }
    };
    self.fetch.hooked_by_adblock = true;
    workerLogDebug(\`[\${context}] Fetch hook installed successfully in Worker.\`);
    return true;
}

// Слушатель сообщений от основного потока (для eval-инъекции как fallback)
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

// --- Первоначальная попытка установки хука при загрузке Worker'а ---
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

    /**
     * Переопределенная функция fetch для блокировки рекламных запросов и логирования GQL.
     */
    async function fetchOverride(input, init) {
        const context = 'NetBlock:Fetch';
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();

        // --- Оптимизированная проверка на блокировку ---
        let potentiallyBlocked = AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()));
        if (potentiallyBlocked && blockedUrlKeywordsSet.has(lowerCaseUrl.split('/')[2])) {
            if (LOG_NETWORK_BLOCKING) logTrace(context, `Blocking Fetch (${method}) to: ${requestUrl}`);
            return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by AdBlocker)" }));
        }
        // --- Конец проверки на блокировку ---

        if (requestUrl.includes('/gql') && method === 'POST') {
            logGqlOperation('GQL:Fetch', init?.body);
        }

        try {
            return await originalFetch(input, init);
        } catch (error) {
            if (error.name === 'TypeError' && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_CONNECTION_CLOSED'))) {
                logWarn(context, `Fetch to ${requestUrl.substring(0,100)}... failed (likely blocked or network issue): ${error.message}`);
                return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked/Failed" }));
            } else {
                logError(context, `Unknown fetch error for ${requestUrl.substring(0,100)}...:`, error);
                throw error;
            }
        }
    }

    const xhrRequestData = new WeakMap();

    /**
     * Переопределенная функция XMLHttpRequest.prototype.open для пометки рекламных запросов.
     */
    function xhrOpenOverride(method, url /*, async, user, password*/) {
        const context = 'NetBlock:XHR';
        const urlString = String(url);
        const lowerCaseUrl = urlString.toLowerCase();
        let blocked = false;

        // --- Оптимизированная проверка на блокировку ---
        let potentiallyBlocked = AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()));
        if (potentiallyBlocked && blockedUrlKeywordsSet.has(lowerCaseUrl.split('/')[2])) {
            if (LOG_NETWORK_BLOCKING) logTrace(context, `Marking XHR (${method}) for blocking: ${urlString}`);
            blocked = true;
        }
        // --- Конец проверки ---

        xhrRequestData.set(this, { method: method, url: urlString, blocked: blocked });

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `Error in original xhr.open for ${urlString.substring(0,100)}...:`, error); throw error; }
        }
    }

    /**
     * Переопределенная функция XMLHttpRequest.prototype.send для фактической блокировки и логирования GQL.
     */
    function xhrSendOverride(data) {
        const context = 'NetBlock:XHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            try { return originalXhrSend.apply(this, arguments); }
            catch(e) { logError(context, "Error calling original xhr.send without requestInfo:", e); throw e;}
        }

        const { method, url, blocked } = requestInfo;

        if (blocked) {
            logWarn(context, `Blocking XHR (${method}) send to ${url.substring(0,100)}...`);
            try {
                if (typeof this.dispatchEvent === 'function') {
                    this.dispatchEvent(new ProgressEvent('error'));
                }
                if (typeof this.abort === 'function') {
                    this.abort();
                }
            } catch (e) { logWarn(context, `Failed to dispatch error/abort for blocked XHR: ${e.message}`); }
            return;
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
            throw error;
        }
    }

    /**
     * Логирует имя GraphQL операции из тела запроса.
     */
    function logGqlOperation(context, body) {
        if (!LOG_GQL_INTERCEPTION || !body) return;
        try {
            let operationName = 'UnknownOperation';
            let parsedBody = (typeof body === 'string') ? JSON.parse(body) : body;

            if (Array.isArray(parsedBody)) {
                operationName = parsedBody[0]?.operationName || operationName;
            } else if (typeof parsedBody === 'object' && parsedBody !== null) {
                operationName = parsedBody.operationName || operationName;
            }

            logTrace(context, `GraphQL Request: ${operationName}`);
            if (operationName === GQL_OPERATION_ACCESS_TOKEN) {
                logDebug(context, `--> Intercepted crucial GQL operation: ${GQL_OPERATION_ACCESS_TOKEN}`);
            }
        } catch (e) { /* Ignore parsing errors for logging */ }
    }

    // --- ЛОГИКА ВНЕДРЕНИЯ КОДА В WEB WORKER'Ы (ОСНОВНОЙ ПОТОК) ---

    /**
     * Переопределенная функция URL.createObjectURL для отслеживания создания Blob URL'ов Worker'ов.
     */
    function createObjectURLOverride_Sync(obj) {
        const context = 'WorkerInject:ObjectURL';
        const isBlob = obj instanceof Blob;

        if (LOG_WORKER_INJECTION && INJECT_INTO_WORKERS && isBlob) {
            const blobType = obj.type || 'empty';
            if(blobType.includes('javascript') || blobType.includes('worker') || blobType === 'empty') {
                logTrace(context, `Potential Worker Blob detected (Type: '${blobType}', Size: ${obj.size}). Injection handled by Worker constructor hook.`);
            }
        }

        try { return originalCreateObjectURL.call(unsafeWindow.URL, obj); }
        catch (e) { logError(context, `Error calling original createObjectURL:`, e); throw e; }
    }

    /**
     * Добавляет слушатели сообщений 'message' и 'error' к экземпляру Worker'а.
     */
    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true;
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
        workerInstance._adBlockListener = adBlockListener;
        logTrace(context, `AdBlock message/error listeners installed for Worker (${label})`);
    }

    /**
     * Перехватывает конструктор Worker для внедрения кода и добавления слушателей.
     */
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
                        super(scriptURL, options);
                        this._workerLabel = workerLabel;
                        addWorkerMessageListeners(this, workerLabel);
                        return;
                    }

                    super(scriptURL, options);
                    this._workerLabel = workerLabel;
                    addWorkerMessageListeners(this, workerLabel);

                    if (!isBlobURL && urlString) {
                        setTimeout(() => {
                            if (!hookedWorkers.has(this._workerLabel)) {
                                logWarn(context, `Worker (${this._workerLabel}) not from Blob. Attempting fallback injection via postMessage...`);
                                try {
                                    this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: getWorkerInjectionCode() });
                                } catch(e) { logError(context, `Error using postMessage fallback for ${this._workerLabel}:`, e); }
                            }
                        }, 500);
                    } else if (isBlobURL) {
                        logTrace(context, `Worker (${workerLabel}) from Blob URL. Awaiting ADBLOCK_WORKER_HOOKS_READY confirmation.`);
                    }

                } catch (constructorError) {
                    logError(context, `Error in HookedWorker constructor for ${workerLabel}:`, constructorError);
                    if(!this._workerLabel) throw constructorError;
                }
            }
        };

        try {
            Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker);
            Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorker.prototype);
        } catch (e) { logError(context, "Failed to restore Worker prototype chain:", e); }

        unsafeWindow.Worker.hooked_by_adblock = true;
        logDebug(context, "Worker constructor hooked successfully.");
    }

    // --- УСТАНОВКА ХУКОВ В ОСНОВНОМ ПОТОКЕ ---
    /**
     * Устанавливает все необходимые хуки в основном потоке страницы.
     */
    function installHooks() {
        const context = 'MainHooks';
        if (hooksInstalledMain) { return; }
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

            try { hookWorkerConstructor(); }
            catch (e) { logError(context, "Failed to hook Worker constructor:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            try {
                unsafeWindow.URL.revokeObjectURL = function(url) {
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

    /**
     * Ищет активный элемент <video> плеера на странице.
     */
    function findVideoPlayer() {
        const context = 'PlayerMon:Finder';
        if (videoElement && document.body.contains(videoElement)) return videoElement;

        logTrace(context, 'Searching for video element...');
        const selectors = [
            PLAYER_SELECTOR,
            'div[data-a-target="video-player"] video',
            '.video-player__container video',
            'div[data-a-target="video-player-layout"] video',
            '.persistent-player video',
            'video'
        ];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.tagName === 'VIDEO' && (element.src || element.currentSrc || element.hasAttribute('src'))) {
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

    /**
     * Инициирует перезагрузку страницы.
     */
    function triggerReload(reason) {
        const context = 'PlayerMon:Reload';
        const now = Date.now();
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) { logWarn(context, `Reload (${reason}) cancelled: Cooldown active.`); return; }
        if (document.hidden) { logWarn(context, `Reload (${reason}) cancelled: Tab hidden.`); return; }

        logWarn(context, `!!! TRIGGERING PAGE RELOAD !!! Reason: ${reason}.`);
        lastReloadTimestamp = now;
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); }
        catch (e) { logWarn(context, 'Failed to set sessionStorage item for reload cooldown:', e); }
        unsafeWindow.location.reload();
    }

    /**
     * Сбрасывает состояние монитора плеера.
     */
    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; logTrace('PlayerMon:State', `Scheduled reload cancelled (${reason || 'reset'}).`); }
        const now = Date.now();
        lastVideoTimeUpdateTimestamp = now;
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0;
        logTrace('PlayerMon:State', `Monitor state reset (${reason || 'N/A'}). lastKnownTime: ${lastKnownVideoTime > -1 ? lastKnownVideoTime.toFixed(2) : 'N/A'}`);
    }

    /**
     * Основная функция мониторинга состояния плеера, вызываемая по интервалу.
     */
    function monitorPlayerState() {
        const context = 'PlayerMon:Monitor';
        if (!videoElement || !document.body.contains(videoElement)) {
            logWarn(context, 'Video element lost. Monitor will attempt restart.');
            if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners();
            videoElement = null;
            setTimeout(setupPlayerMonitor, 500);
            return;
        }

        const now = Date.now();
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        let detectedProblemReason = null;

        // 1. Проверка на зависание (Stall)
        if (!videoElement.paused && !videoElement.ended && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;
            if (currentTime === lastKnownVideoTime && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                detectedProblemReason = `Stall: currentTime (${currentTime.toFixed(2)}) not changing > ${timeSinceLastUpdate.toFixed(0)}ms (State: ${readyState})`;
            } else if (currentTime < lastKnownVideoTime && lastKnownVideoTime > 0) {
                detectedProblemReason = `Stall: currentTime (${currentTime.toFixed(2)}) < lastKnown (${lastKnownVideoTime.toFixed(2)})`;
            }

            if (currentTime > lastKnownVideoTime) {
                lastKnownVideoTime = currentTime;
                lastVideoTimeUpdateTimestamp = now;
                if (reloadTimeoutId && detectedProblemReason === null) {
                    logDebug(context, "Playback resumed (timeupdate). Cancelling scheduled reload.");
                    clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
                }
                if (isWaitingForDataTimestamp > 0) {
                    isWaitingForDataTimestamp = 0;
                }
            }
        } else if(videoElement.paused || videoElement.ended) {
            lastKnownVideoTime = currentTime;
            lastVideoTimeUpdateTimestamp = now;
            isWaitingForDataTimestamp = 0;
            if(reloadTimeoutId) {
                logTrace(context, `Video paused/ended. Cancelling scheduled reload.`);
                clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
            }
        }


        // 2. Проверка на чрезмерную буферизацию
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            const bufferingDuration = now - isWaitingForDataTimestamp;
            if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS) {
                if (!detectedProblemReason) {
                    detectedProblemReason = `Excessive Buffering > ${(bufferingDuration / 1000).toFixed(1)}s (State: ${readyState})`;
                }
            }
        }

        // 3. Инициирование перезагрузки
        if (detectedProblemReason && !reloadTimeoutId) {
            logWarn(context, `PLAYER PROBLEM DETECTED! Reason: ${detectedProblemReason}.`);
            logWarn(context, `Scheduling reload in 5 seconds...`);
            reloadTimeoutId = setTimeout(() => triggerReload(detectedProblemReason), 5000);
        }

        // 4. Сброс таймера буферизации
        const isPlayingHealthy = !videoElement.paused && !videoElement.ended && readyState >= videoElement.HAVE_FUTURE_DATA;
        if (isPlayingHealthy && isWaitingForDataTimestamp > 0) {
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId && !detectedProblemReason?.toLowerCase().includes('stall')) {
                logDebug(context, "Buffering resolved. Cancelling scheduled reload.");
                clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
            }
        }
    }

    /**
     * Настраивает и запускает мониторинг плеера.
     */
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
            if (videoElement) { removePlayerEventListeners(); }

            videoElement = currentVideoElement;
            checkReloadCooldown(context);
            addPlayerEventListeners();
            resetMonitorState('Monitor setup/reset');
            playerMonitorIntervalId = setInterval(monitorPlayerState, 2000);
            logDebug(context, `Player monitor started (Interval: 2s, Stall: ${RELOAD_STALL_THRESHOLD_MS}ms, Buffer: ${RELOAD_BUFFERING_THRESHOLD_MS}ms).`);
        }
    }

    /**
     * Проверяет sessionStorage на наличие флага недавней перезагрузки.
     */
    function checkReloadCooldown(context) {
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const timeSinceLastReload = Date.now() - parseInt(sessionReloadTime, 10);
                sessionStorage.removeItem('ttv_adblock_last_reload');
                if (timeSinceLastReload < RELOAD_COOLDOWN_MS) {
                    const cooldownRemaining = RELOAD_COOLDOWN_MS - timeSinceLastReload;
                    logWarn(context, `Recent reload detected (${(timeSinceLastReload / 1000).toFixed(1)}s ago). Cooldown active for ${(cooldownRemaining / 1000).toFixed(1)}s.`);
                    lastReloadTimestamp = Date.now() - timeSinceLastReload;
                }
            }
        } catch (e) { logWarn(context, "Failed to check sessionStorage for reload cooldown:", e); }
    }

    // --- Вспомогательные функции для слушателей событий ---
    /**
     * Добавляет слушатели событий к элементу video.
     */
    function addPlayerEventListeners() {
        if (!videoElement || videoElement._adblockListenersAttached) return;
        const context = 'PlayerMon:Events';
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true });
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true });
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });
        videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true });
        videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true }); // Важный триггер для проверки качества
        videoElement.addEventListener('abort', handlePlayerAbort, { passive: true });
        videoElement._adblockListenersAttached = true;
        logTrace(context, 'Player event listeners added.');
    }

    /**
     * Удаляет слушатели событий с элемента video.
     */
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

    // --- Обработчики событий плеера ---
    /** Обработчик события 'error' */
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

    /** Обработчик события 'waiting' (начало буферизации) */
    function handlePlayerWaiting() {
        const context = 'PlayerMon:EventWaiting';
        if (videoElement && !videoElement.paused && videoElement.readyState < videoElement.HAVE_FUTURE_DATA && isWaitingForDataTimestamp === 0) {
            logTrace(context, `Buffering started (readyState: ${videoElement.readyState}). Starting timer.`);
            isWaitingForDataTimestamp = Date.now();
        }
    }

    /** Обработчик события 'playing' (сброс состояния) */
    function handlePlayerPlaying() { resetMonitorState('Playing event'); }
    /** Обработчик события 'pause' (сброс состояния) */
    function handlePlayerPause() { resetMonitorState('Pause event'); }
    /** Обработчик события 'emptied' (перезапуск поиска плеера) */
    function handlePlayerEmptied() { logWarn('PlayerMon:EventEmptied', 'Video source emptied.'); resetMonitorState('Emptied event'); setTimeout(setupPlayerMonitor, 100); }
    /** Обработчик события 'loadedmetadata' (сброс состояния и ПРОВЕРКА КАЧЕСТВА) */
    function handlePlayerLoadedMeta() {
        logTrace('PlayerMon:EventLoadedMeta', 'Metadata loaded.');
        resetMonitorState('LoadedMetadata event');
        setQualitySettings(true); // <-- Важно: Проверяем качество при загрузке метаданных
    }
    /** Обработчик события 'abort' (перезапуск поиска плеера) */
    function handlePlayerAbort() { logWarn('PlayerMon:EventAbort', 'Video load aborted.'); resetMonitorState('Abort event'); setTimeout(setupPlayerMonitor, 100); }


    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---

    /**
     * Основная функция инициализации скрипта.
     */
    function initializeScript() {
        const context = 'Init';
        logDebug(context, `--- Initializing Twitch Adblock (v${SCRIPT_VERSION}) ---`);
        installHooks();
        // Устанавливаем качество принудительно при запуске (первый триггер)
        setQualitySettings(true);
        // Настраиваем слушатели жизненного цикла страницы (видимость, навигация) - это триггеры
        setupPageLifecycleListeners(context);
        // Настраиваем запуск монитора плеера после загрузки DOM
        setupDomReadyHandler(context);
        logDebug(context, `--- Twitch Adblock (v${SCRIPT_VERSION}) Initialization Complete ---`);
    }

    /**
     * Настраивает слушатели событий жизненного цикла страницы (видимость, навигация) - ТРИГГЕРЫ КАЧЕСТВА.
     */
    function setupPageLifecycleListeners(parentContext) {
        const context = `${parentContext}:PageLifecycle`;
        // Слушатель изменения видимости вкладки
        document.addEventListener('visibilitychange', () => {
            const visContext = `${context}:Visibility`;
            if (!document.hidden) { // Вкладка стала видимой - ТРИГГЕР
                logDebug(visContext, "Tab became visible. Triggering quality check and player monitor restart.");
                requestAnimationFrame(() => {
                    setQualitySettings(true); // Принудительно проверяем качество
                    if (ENABLE_AUTO_RELOAD) setupPlayerMonitor(); // Перезапускаем монитор плеера
                });
            } else { // Вкладка стала невидимой
                logDebug(visContext, "Tab hidden.");
                if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) {
                    logTrace(visContext, 'Stopping player monitor.');
                    clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
                    removePlayerEventListeners();
                }
                if (reloadTimeoutId) { logWarn(visContext, 'Cancelling scheduled reload due to tab hidden.'); clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
            }
        }, { passive: true });
        logTrace(context, "'visibilitychange' listener installed.");

        // --- Обработка SPA навигации - ТРИГГЕР ---
        let navigationDebounceTimer = null;
        const handleNavigationChange = () => {
            clearTimeout(navigationDebounceTimer);
            navigationDebounceTimer = setTimeout(() => {
                const navContext = `${context}:Navigation`;
                logDebug(navContext, `Navigation detected (${window.location.pathname}). Triggering quality check and player monitor restart.`);
                // Принудительно проверяем качество и перезапускаем монитор плеера
                setQualitySettings(true);
                if (ENABLE_AUTO_RELOAD) setupPlayerMonitor();
            }, 300);
        };

        try {
            const originalPushState = history.pushState;
            history.pushState = function(...args) { originalPushState.apply(this, args); handleNavigationChange(); };
            const originalReplaceState = history.replaceState;
            history.replaceState = function(...args) { originalReplaceState.apply(this, args); handleNavigationChange(); };
            unsafeWindow.addEventListener('popstate', handleNavigationChange, { passive: true });
            logTrace(context, "Navigation listeners (pushState, replaceState, popstate) installed.");
        } catch (e) { logError(context, "Failed to install navigation listeners:", e); }
    }


    /**
     * Настраивает запуск монитора плеера после полной загрузки DOM.
     */
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
            requestAnimationFrame(onDomReady);
        }
    }

    // --- Запуск инициализации скрипта ---
    initializeScript();

})();