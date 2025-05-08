// ==UserScript==
// @name Twitch Adblock Ultimate
// @namespace TwitchAdblockUltimate
// @version 19.0.2
// @description Оптимизированная версия для уменьшения зависаний и улучшения блокировки. GQL и DOM удаление включены. Очистка M3U8 в Worker'е + Авто-перезагрузка + Качество "Источник"
// @author ShmidtS
// @match https://www.twitch.tv/*
// @match https://m.twitch.tv/*
// @match https://player.twitch.tv/*
// @grant unsafeWindow
// @grant GM_addStyle
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_xmlhttpRequest
// @connect usher.ttvnw.net
// @connect *.ttvnw.net
// @connect *.twitch.tv
// @connect github.com
// @connect raw.githubusercontent.com
// @connect gql.twitch.tv
// @connect *
// @updateURL    https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js
// @downloadURL  https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '19.0.2'; // Версия обновлена

    // Основные функциональные флаги (изменены значения по умолчанию для некоторых)
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true); // ВКЛЮЧЕНО ПО УМОЛЧАНИЮ
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const BLOCK_NATIVE_ADS_SCRIPT = GM_getValue('TTV_AdBlock_BlockNatScript', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true); // ВКЛЮЧЕНО ПО УМОЛЧАНИЮ

    // Флаги логгирования
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrors', true);
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_CoreDebugLog', false);
    const LOG_WORKER_INJECTION_DEBUG = GM_getValue('TTV_AdBlock_LogWorkerInject', false);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_LogPlayerMon', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_LogM3U8Clean', false);

    // Настройки перезагрузки и таймауты (незначительно смягчены)
    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '2, 3, 4, 1000, 2000, 3000, 4000, 5000, 6001');
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 8000); // Увеличено с 7000
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 25000); // Увеличено с 20000
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 35000);
    const VISIBILITY_RESUME_DELAY_MS = GM_getValue('TTV_AdBlock_VisResumeDelayMs', 1500);

    const WORKER_PING_INTERVAL_MS = GM_getValue('TTV_AdBlock_WorkerPingIntervalMs', 15000);
    const USE_REGEX_M3U8_CLEANING = GM_getValue('TTV_AdBlock_UseRegexM3U8', false);
    const AGGRESSIVE_GQL_SCAN = GM_getValue('TTV_AdBlock_AggressiveGQLScan', false);

    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}'; // "Источник"
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const GQL_OPERATION_ACCESS_TOKEN_TEMPLATE = 'PlaybackAccessToken_Template';
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const GQL_OPERATION_AD_FREE_QUERY = 'AdFreeQuery';
    const GQL_CLIENT_AD_QUERY = 'ClientSideAd';

    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', '#EXT-X-SCTE35', '#EXT-X-ASSET', '#EXT-X-TWITCH-AD-SIGNAL', '#EXT-X-TWITCH-AD']; // Добавлен #EXT-X-TWITCH-AD
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIAL', 'ANNOUNCEMENT'];
    const AD_DATERANGE_REGEX = USE_REGEX_M3U8_CLEANING ? /CLASS="(?:TWITCH-)?STITCHED-AD"/i : null;

    let AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com',
        'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'scorecardresearch.com', // Добавлено из логов
        'yandex.ru/clck/', // Добавлено из логов/общих знаний
        'd2v02itv0y9u9t.cloudfront.net', // Добавлено из логов (потенциальный рекламный CDN)
        '/ads/', '/advertisement/', 'omnitagjs', 'omnitag', 'video-ads', 'ads-content', 'adserver',
        '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads', 'innovid.com',
        'eyewonder.com', 'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com',
        'flashtalking.com', 'contextual.media.net', 'advertising.com', 'adform.net',
        'freewheel.tv', 'stickyadstv.com', 'tremorhub.com', 'aniview.com', 'criteo.com',
        'adition.com', 'teads.tv', 'undertone.com', 'vidible.tv', 'vidoomy.com', 'appnexus.com'
    ];
    if (BLOCK_NATIVE_ADS_SCRIPT) {
        AD_URL_KEYWORDS_BLOCK.push('nat.min.js');
        AD_URL_KEYWORDS_BLOCK.push('twitchAdServer.js');
        AD_URL_KEYWORDS_BLOCK.push('player-ad-aws.js'); // Предположительно для рекламы
    }
    const blockedUrlKeywordsSet = new Set(AD_URL_KEYWORDS_BLOCK.map(keyword => keyword.toLowerCase()));

    const PLAYER_SELECTORS_IMPROVED = [
        'div[data-a-target="video-player"] video[playsinline]',
        '.video-player video[playsinline]',
        'div[data-a-player-state] video',
        'main video[playsinline][src]',
        'video.persistent-player',
        'video[class*="video-player"]', // Более общий селектор
        'video[class*="player-video"]', // Еще один общий
        'video[src]',
        'video'
    ];

    const AD_OVERLAY_SELECTORS_CSS = [
        '.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]',
        'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]',
        '.player-ad-notice', '.ad-interrupt-screen', 'div[data-test-selector="ad-banner-default-text-area"]',
        'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]',
        '[data-test-selector="sad-overlay"]', // Дополнительный селектор
        'div[class*="video-ad-label"]' // Более общий
    ];

    const AD_DOM_ELEMENT_SELECTORS_TO_REMOVE = [
        'div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]',
        'div[class*="InjectLayout-sc-"] > div[class*="Layout-sc-"] > div[class*="InjectLayout-sc-"]', // Очень общий, может быть рискованным
        'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]',
        'iframe[src*="imasdk.googleapis.com"]', // Добавлен iframe для IMA SDK
        '.player-overlay-ad', '.tw-player-ad-overlay', '.video-ad-display',
        'div[data-ad-placeholder="true"]', '[data-a-target="video-ad-countdown-container"]',
        '.promoted-content-card', 'div[class*="--ad-banner"]', 'div[data-ad-unit]' // Более общие
    ];
    const AD_DOM_PARENT_INDICATOR_SELECTORS = [
        '.video-player', '.persistent-player', 'div[data-a-target="video-player-layout"]', 'main',
        'div[class*="player-container"]' // Более общий родитель
    ];

    let hooksInstalledMain = false;
    let workerHookAttempted = false;
    const hookedWorkers = new Map();
    let playerMonitorIntervalId = null;
    let videoElement = null;
    let lastVideoTimeUpdateTimestamp = 0;
    let lastKnownVideoTime = -1;
    let isWaitingForDataTimestamp = 0;
    let reloadTimeoutId = null;
    let lastReloadTimestamp = 0;
    let cachedQualityValue = null;
    let visibilityResumeTimer = null;
    let playerFinderObserver = null;
    let adRemovalObserver = null;
    let workerPingIntervalId = null;
    const RELOAD_ON_ERROR_CODES = RELOAD_ON_ERROR_CODES_RAW.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;
    let originalXhrResponseGetter = null;
    try { originalXhrResponseGetter = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'response'); } catch(e) {}
    let originalXhrResponseTextGetter = null;
    try { originalXhrResponseTextGetter = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'responseText'); } catch(e) {}

    function logError(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logCoreDebug(source, message, ...args) { if (CORE_DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logModuleTrace(moduleFlag, source, message, ...args) {
        if (moduleFlag) {
            const truncatedArgs = args.map(arg => typeof arg === 'string' && arg.length > 200 ? arg.substring(0, 200) + '...' : arg);
            console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...truncatedArgs);
        }
    }

    logCoreDebug('Main', `Запуск скрипта. Версия: ${SCRIPT_VERSION}. GQL Modify: ${MODIFY_GQL_RESPONSE}. DOM Ad Removal: ${ATTEMPT_DOM_AD_REMOVAL}. Worker Inject: ${INJECT_INTO_WORKERS}. Auto Reload: ${ENABLE_AUTO_RELOAD}.`);

    if (HIDE_AD_OVERLAY_ELEMENTS) {
        try {
            const cssHideRule = `${AD_OVERLAY_SELECTORS_CSS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }`;
            GM_addStyle(cssHideRule);
            logCoreDebug('CSSInject', 'CSS правила для скрытия рекламного оверлея применены.');
        } catch (e) { logError('CSSInject', 'Не удалось применить CSS для скрытия оверлея:', e); }
    }

    function setQualitySettings(forceCheck = false) {
        const context = 'QualitySet';
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue;
            }
            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE;
                logCoreDebug(context, `Качество установлено на 'Источник' ('${TARGET_QUALITY_VALUE}') через localStorage.`);
            }
        } catch (e) {
            logError(context, 'Ошибка установки/проверки настроек качества:', e);
            cachedQualityValue = null;
        }
    }

    try {
        unsafeWindow.localStorage.setItem = function(key, value) {
            const context = 'QualitySet:LocalStorageHook';
            let forcedValue = value;
            if (key === LS_KEY_QUALITY) {
                if (value !== TARGET_QUALITY_VALUE) {
                    logWarn(context, `Попытка изменить '${key}' на '${value}'. Принудительно устанавливается '${TARGET_QUALITY_VALUE}'.`);
                    forcedValue = TARGET_QUALITY_VALUE;
                }
                cachedQualityValue = forcedValue;
            }
            try {
                const args = Array.from(arguments);
                args[1] = forcedValue;
                return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, args);
            } catch (e) {
                logError(context, `Ошибка вызова оригинального localStorage.setItem для ключа '${key}':`, e);
                if (key === LS_KEY_QUALITY) cachedQualityValue = null;
                throw e;
            }
        };
        cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
        setQualitySettings(true);
    } catch(e) {
        logError('QualitySet:LocalStorageHook', 'Критическая ошибка при хуке localStorage.setItem:', e);
        if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
    }

    function getWorkerInjectionCode() {
        const workerCodeString = (function() {
            const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION_WORKER_REPLACE}';
            const CORE_DEBUG_LOGGING_WORKER = '${CORE_DEBUG_LOGGING_WORKER_REPLACE}';
            const LOG_M3U8_CLEANING_DEBUG_WORKER = '${LOG_M3U8_CLEANING_DEBUG_WORKER_REPLACE}';
            const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR_WORKER_REPLACE}';
            const AD_SIGNIFIERS_GENERAL_WORKER_JSON = '${AD_SIGNIFIERS_GENERAL_WORKER_JSON_REPLACE}';
            const AD_DATERANGE_ATTRIBUTE_KEYWORDS_JSON = '${AD_DATERANGE_ATTRIBUTE_KEYWORDS_JSON_REPLACE}';
            const AD_DATERANGE_REGEX_STR = '${AD_DATERANGE_REGEX_STR_REPLACE}';
            const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

            let AD_SIGNIFIERS_GENERAL_WORKER = [];
            let AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = [];
            let AD_DATERANGE_REGEX_WORKER = null;

            try {
                AD_SIGNIFIERS_GENERAL_WORKER = JSON.parse(AD_SIGNIFIERS_GENERAL_WORKER_JSON);
                AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = JSON.parse(AD_DATERANGE_ATTRIBUTE_KEYWORDS_JSON).map(kw => kw.toUpperCase());
                if (AD_DATERANGE_REGEX_STR && AD_DATERANGE_REGEX_STR !== "null") {
                    const match = AD_DATERANGE_REGEX_STR.match(/^\/(.+)\/([gimyus]*)$/);
                    if (match) {
                        AD_DATERANGE_REGEX_WORKER = new RegExp(match[1], match[2]);
                    } else {
                        console.warn(LOG_PREFIX_WORKER_BASE + ' WARN: Invalid Regex string received:', AD_DATERANGE_REGEX_STR);
                    }
                }
            } catch(e) {
                console.error(LOG_PREFIX_WORKER_BASE + ' ERROR: Failed to parse JSON/Regex constants:', e);
                AD_SIGNIFIERS_GENERAL_WORKER = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', '#EXT-X-SCTE35', '#EXT-X-ASSET', '#EXT-X-TWITCH-AD-SIGNAL', '#EXT-X-TWITCH-AD'];
                AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIAL', 'ANNOUNCEMENT'];
            }

            function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
            function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
            function workerLogCoreDebug(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
            function workerLogM3U8Trace(message, ...args) {
                if (LOG_M3U8_CLEANING_DEBUG_WORKER) {
                    const truncatedArgs = args.map(arg => typeof arg === 'string' && arg.length > 100 ? arg.substring(0,100)+'...' : arg);
                    console.debug(LOG_PREFIX_WORKER_BASE + ' [M3U8 Clean] TRACE:', message, ...truncatedArgs);
                }
            }

            workerLogCoreDebug("--- Worker AdBlock Code Initializing ---");

            function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
                const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
                workerLogM3U8Trace('Starting parse for: ' + urlShort);

                if (!m3u8Text || typeof m3u8Text !== 'string') {
                    workerLogWarn('[M3U8 Clean] (' + urlShort + '): Invalid or empty M3U8 text received.');
                    return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
                }
                const upperM3U8Text = m3u8Text.toUpperCase(); // Оптимизация: один раз переводим в верхний регистр для проверок

                let potentialAdContent = false;
                if (AD_SIGNIFIERS_GENERAL_WORKER.some(sig => upperM3U8Text.includes(sig.toUpperCase()))) { // Сравниваем с uppercased сигнификаторами
                    potentialAdContent = true;
                } else if (AD_DATERANGE_REGEX_WORKER && AD_DATERANGE_REGEX_WORKER.test(m3u8Text)) { // Regex на оригинальном тексте
                    potentialAdContent = true;
                } else if (!AD_DATERANGE_REGEX_WORKER && upperM3U8Text.includes("DATERANGE") && AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperM3U8Text.includes(kw))) {
                    potentialAdContent = true;
                }

                if (!potentialAdContent) {
                    workerLogM3U8Trace('(' + urlShort + '): No obvious ad markers found. Skipping detailed parse.');
                    return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
                }

                workerLogM3U8Trace('(' + urlShort + '): Potential ad markers found. Starting detailed parse...');
                const lines = m3u8Text.split('\n');
                const cleanLines = [];
                let isAdSection = false;
                let adsFound = false;
                let linesRemoved = 0;
                let currentAdMarkers = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmedLine = line.trim();
                    const upperTrimmedLine = trimmedLine.toUpperCase(); // Для сравнения с константами
                    let isAdMarkerLine = false;
                    let shouldRemoveLine = false;
                    let removalReason = '';

                    if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE:')) {
                        let isAdDateRange = false;
                        if (upperTrimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER.toUpperCase())) {
                            isAdDateRange = true; removalReason = 'DATERANGE (twitch-stitched-ad)';
                        } else if (AD_DATERANGE_REGEX_WORKER && AD_DATERANGE_REGEX_WORKER.test(trimmedLine)) {
                            isAdDateRange = true; removalReason = 'DATERANGE (Regex Match)';
                        } else if (!AD_DATERANGE_REGEX_WORKER && AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperTrimmedLine.includes(kw))) {
                            isAdDateRange = true; removalReason = 'DATERANGE (Keyword Match)';
                        }
                        if (isAdDateRange) {
                            workerLogM3U8Trace(`Found ad marker: ${removalReason} [Line ${i+1}]`);
                            isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
                            currentAdMarkers.push(removalReason);
                        }
                    } else if (upperTrimmedLine.startsWith('#EXT-X-ASSET:')) {
                        workerLogM3U8Trace(`Found ad marker: ASSET Tag [Line ${i+1}]`);
                        isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
                        removalReason = 'ASSET Tag';
                        currentAdMarkers.push(removalReason);
                    } else if (AD_SIGNIFIERS_GENERAL_WORKER.some(sig => upperTrimmedLine.startsWith(sig.toUpperCase()) && (sig.toUpperCase().includes('CUE-OUT') || sig.toUpperCase().includes('AD-SIGNAL')))) {
                         // Более общая проверка на старт рекламы по другим тегам
                        removalReason = 'Start Marker (' + upperTrimmedLine.split(':')[0] + ')';
                        workerLogM3U8Trace(`Found ad marker: ${removalReason} [Line ${i+1}]`);
                        isAdSection = true; isAdMarkerLine = true; adsFound = true; shouldRemoveLine = true;
                        currentAdMarkers.push(removalReason);
                    } else if (AD_SIGNIFIERS_GENERAL_WORKER.some(sig => upperTrimmedLine.startsWith(sig.toUpperCase()) && (sig.toUpperCase().includes('CUE-IN') || sig.toUpperCase().includes('AD-SIGNAL')))) {
                        // Более общая проверка на конец рекламы
                        if (isAdSection) {
                            isAdSection = false; isAdMarkerLine = true; shouldRemoveLine = true;
                            removalReason = 'End Marker (' + upperTrimmedLine.split(':')[0] + ')';
                            if (currentAdMarkers.length > 0) currentAdMarkers.pop();
                        } else {
                            shouldRemoveLine = true; isAdMarkerLine = true;
                            removalReason = 'Orphan ' + upperTrimmedLine.split(':')[0];
                            workerLogWarn('[M3U8 Clean] (' + urlShort + '): Found ' + removalReason + ' [Line ' + (i+1) + ']. Removing.');
                        }
                    } else if (isAdSection && !trimmedLine.startsWith('#') && trimmedLine !== '') {
                        shouldRemoveLine = true; removalReason = 'Segment within ad section';
                    } else if (isAdSection && upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                        shouldRemoveLine = true; isAdMarkerLine = true; removalReason = 'Discontinuity within ad section';
                    }

                    if (shouldRemoveLine) {
                        linesRemoved++;
                        if (isAdMarkerLine) {
                            workerLogM3U8Trace(`Removing Ad Line [Line ${i+1}, Reason: ${removalReason}]: ${trimmedLine.substring(0, 80)}...`);
                        }
                    } else {
                        cleanLines.push(line);
                    }
                }

                if (isAdSection && currentAdMarkers.length > 0) {
                    workerLogWarn('[M3U8 Clean] (' + urlShort + '): M3U8 ended while still in ad section (Markers: ' + currentAdMarkers.join(', ') + '). Some ad segments might remain if CUE-IN was missing.');
                }

                const cleanedText = cleanLines.join('\n');

                if (adsFound) {
                    workerLogCoreDebug('[M3U8 Clean] (' + urlShort + '): M3U8 Cleaning Complete. Removed ' + linesRemoved + ' lines.');
                    try { self.postMessage({ type: 'ADBLOCK_M3U8_CLEANED', url: urlShort, linesRemoved: linesRemoved }); }
                    catch(e) { workerLogError("Error sending ADBLOCK_M3U8_CLEANED message:", e); }
                } else {
                    workerLogM3U8Trace('(' + urlShort + '): No ads found/removed during detailed parse.');
                    try { self.postMessage({ type: 'ADBLOCK_M3U8_NO_ADS', url: urlShort }); } catch(e){}
                }
                return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved };
            }


            function installWorkerFetchHook() {
                const context = 'WorkerInject:FetchHook';
                if (typeof self.fetch !== 'function') {
                    workerLogWarn('[' + context + '] Fetch API not available in this Worker.');
                    return false;
                }
                if (self.fetch.hooked_by_adblock) {
                    workerLogCoreDebug('[' + context + '] Fetch already hooked.');
                    return true;
                }

                const workerRealFetch = self.fetch;

                self.fetch = async (input, init) => {
                    let requestUrl = (input instanceof Request) ? input.url : String(input);
                    let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
                    const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
                    const isM3U8Request = requestUrl.includes('.m3u8');

                    if (method === 'GET' && isM3U8Request) {
                        workerLogM3U8Trace('Intercepted M3U8 GET: ' + urlShort);
                        try { self.postMessage({ type: 'ADBLOCK_FETCH_INTERCEPTED', url: urlShort }); } catch(e){}

                        let originalResponse;
                        try {
                            originalResponse = await workerRealFetch(input, init);
                            if (!originalResponse.ok) {
                                workerLogWarn('[FetchIntercept] (' + urlShort + ') Original response NOT OK (Status: ' + originalResponse.status + '). Passing through.');
                                return originalResponse;
                            }

                            const clonedResponse = originalResponse.clone();
                            const contentType = clonedResponse.headers.get('Content-Type') || '';
                            const m3u8ContentTypes = ['mpegurl', 'vnd.apple.mpegurl', 'octet-stream', 'text/plain', 'x-mpegurl', 'application/x-mpegurl', 'application/dash+xml', 'application/vnd.apple.mpegurl', 'video/mp2t']; // Добавлен video/mp2t для некоторых кейсов

                            if (m3u8ContentTypes.some(type => contentType.toLowerCase().includes(type)) || requestUrl.endsWith('.m3u8')) { // Дополнительная проверка по расширению
                                workerLogM3U8Trace('(' + urlShort + ') M3U8 content type/extension detected (\'' + contentType + '\'). Reading and cleaning...');
                                const m3u8Text = await clonedResponse.text();
                                if (!m3u8Text) {
                                    workerLogWarn('[FetchIntercept] (' + urlShort + '): M3U8 body is empty. Passing through original.');
                                    return originalResponse;
                                }
                                const { cleanedText, adsFound, linesRemoved } = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);
                                if (adsFound) {
                                    const newHeaders = new Headers(originalResponse.headers);
                                    newHeaders.delete('Content-Length');
                                    workerLogCoreDebug('[FetchIntercept] (' + urlShort + ') Returning CLEANED M3U8. Removed: ' + linesRemoved + ' lines.');
                                    return new Response(cleanedText, {
                                        status: originalResponse.status,
                                        statusText: originalResponse.statusText,
                                        headers: newHeaders
                                    });
                                } else {
                                    return originalResponse;
                                }
                            } else {
                                return originalResponse;
                            }
                        } catch (error) {
                            workerLogError('[FetchIntercept] (' + urlShort + '): Error proxying/cleaning M3U8: ', error);
                            if (originalResponse) return originalResponse;
                            return new Response('AdBlock Worker Error processing M3U8: ' + error.message, { status: 500, statusText: "AdBlock Internal Error" });
                        }
                    }
                    return workerRealFetch(input, init);
                };
                self.fetch.hooked_by_adblock = true;
                workerLogCoreDebug('[' + context + '] Fetch hook installed successfully in Worker.');
                return true;
            }

            self.addEventListener('message', function(e) {
                if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
                    workerLogWarn("[WorkerInject:EvalMsg] Received EVAL_ADBLOCK_CODE. Executing...");
                    try {
                        eval(e.data.code);
                        if (typeof self.fetch === 'function' && !self.fetch.hooked_by_adblock) {
                            workerLogWarn("[WorkerInject:EvalMsg] Fetch hook was not installed after eval. Attempting install now.");
                            if (installWorkerFetchHook()) {
                                try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval_install' }); }
                                catch(postMsgErr) { workerLogError("Error sending ADBLOCK_WORKER_HOOKS_READY post-eval:", postMsgErr); }
                            }
                        } else if (typeof self.fetch === 'function' && self.fetch.hooked_by_adblock) {
                            try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval_reconfirm' }); } catch(err){}
                        }
                    } catch (err) { workerLogError("Error executing EVAL_ADBLOCK_CODE:", err); }
                } else if (e.data?.type === 'PING') {
                    self.postMessage({ type: 'PONG' });
                }
            });

            if (installWorkerFetchHook()) {
                try {
                    workerLogCoreDebug("[WorkerInject:Init] Sending initial ADBLOCK_WORKER_HOOKS_READY...");
                    self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' });
                } catch(e) { workerLogError("Error sending initial ADBLOCK_WORKER_HOOKS_READY:", e); }
            } else {
                workerLogError("Failed to install fetch hook on initial worker load!");
            }
            workerLogCoreDebug("--- Worker AdBlock Code Initialized ---");
        }).toString()
        .replace('v${SCRIPT_VERSION_WORKER_REPLACE}', SCRIPT_VERSION)
        .replace("'${CORE_DEBUG_LOGGING_WORKER_REPLACE}'", String(CORE_DEBUG_LOGGING))
        .replace("'${LOG_M3U8_CLEANING_DEBUG_WORKER_REPLACE}'", String(LOG_M3U8_CLEANING_DEBUG))
        .replace("'${AD_SIGNIFIER_DATERANGE_ATTR_WORKER_REPLACE}'", AD_SIGNIFIER_DATERANGE_ATTR)
        .replace("'${AD_SIGNIFIERS_GENERAL_WORKER_JSON_REPLACE}'", JSON.stringify(AD_SIGNIFIERS_GENERAL).replace(/\\/g, '\\\\').replace(/'/g, "\\'"))
        .replace("'${AD_DATERANGE_ATTRIBUTE_KEYWORDS_JSON_REPLACE}'", JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS).replace(/\\/g, '\\\\').replace(/'/g, "\\'"))
        .replace("'${AD_DATERANGE_REGEX_STR_REPLACE}'", AD_DATERANGE_REGEX ? AD_DATERANGE_REGEX.toString() : 'null')
        .slice(14, -2);

        return workerCodeString;
    }

    function modifyGqlResponse(responseText, url) {
        const context = 'GQL:Modify';
        if (!MODIFY_GQL_RESPONSE) return responseText;

        try {
            let data = JSON.parse(responseText);
            let modified = false;
            const opDataArray = Array.isArray(data) ? data : [data];

            for (const opData of opDataArray) {
                if (!opData) continue;
                const operationName = opData?.extensions?.operationName || opData?.operationName || 'UnknownGQLOperation';

                if (!opData.data && operationName !== GQL_CLIENT_AD_QUERY) continue;

                if (operationName === GQL_OPERATION_ACCESS_TOKEN_TEMPLATE || operationName === GQL_OPERATION_ACCESS_TOKEN) {
                    const accessData = opData.data;
                    if (!accessData) continue;

                    const processToken = (token, tokenType) => {
                        if (!token) return false;
                        let tokenModified = false;
                        if (token.authorization && typeof token.authorization.is_ad !== 'undefined' && token.authorization.is_ad !== false) {
                            token.authorization.is_ad = false; tokenModified = true;
                        }
                        if (token.restrictions && typeof token.restrictions.adAllowed !== 'undefined' && token.restrictions.adAllowed !== false) {
                            token.restrictions.adAllowed = false; tokenModified = true;
                        }
                        if (token.ad_segments && Array.isArray(token.ad_segments) && token.ad_segments.length > 0) {
                            token.ad_segments = []; tokenModified = true;
                        }
                        // Новое: обнуляем stitch_profile, если он указывает на рекламу
                        if (token.stitch_profile === "stitched-ad") {
                           token.stitch_profile = null; tokenModified = true;
                        }
                        return tokenModified;
                    };
                    if (accessData.streamPlaybackAccessToken && processToken(accessData.streamPlaybackAccessToken, 'streamPlaybackAccessToken')) modified = true;
                    if (accessData.videoPlaybackAccessToken && processToken(accessData.videoPlaybackAccessToken, 'videoPlaybackAccessToken')) modified = true;

                } else if (operationName === GQL_OPERATION_AD_FREE_QUERY) {
                    const adData = opData?.data?.viewerAdFreeConfig;
                    if (adData && typeof adData.isAdFree !== 'undefined' && adData.isAdFree === false) {
                        adData.isAdFree = true; modified = true;
                    }
                } else if (operationName === GQL_CLIENT_AD_QUERY) {
                    if (opData.data && (opData.data.ads || opData.data.clientAd)) {
                        opData.data = {}; modified = true;
                    } else if (!opData.data) {
                        opData.data = {}; modified = true;
                    }
                } else if (operationName === "Interstitials") { // Новый GQL тип для блокировки
                    if (opData.data && opData.data.stream && opData.data.stream.interstitials && opData.data.stream.interstitials.length > 0) {
                        opData.data.stream.interstitials = []; modified = true;
                    }
                } else if (AGGRESSIVE_GQL_SCAN && opData.data) {
                    let scanModified = false;
                    try {
                        JSON.stringify(opData.data, (key, value) => {
                            const lowerKey = key.toLowerCase();
                            if (lowerKey.includes('ad') || lowerKey.includes('promo') || lowerKey.includes('sponsor') || lowerKey.includes('interstitial')) { // Добавлен interstitial
                                if (typeof value !== 'object' || Array.isArray(value)) {
                                    scanModified = true; return undefined;
                                }
                            }
                            if ((key === 'is_ad' || key === 'adAllowed' || key === 'isAd') && value === true) {
                                scanModified = true; return false;
                            }
                            if ((key === 'adSegments' || key === 'interstitials') && Array.isArray(value) && value.length > 0) { // Добавлен interstitials
                                scanModified = true; return [];
                            }
                            return value;
                        });
                        if (scanModified) modified = true;
                    } catch (scanError) {
                        logError(context, `Ошибка агрессивного сканирования GQL для ${operationName}:`, scanError);
                    }
                }
            }
            if (modified) {
                const finalData = Array.isArray(data) ? opDataArray : opDataArray[0];
                logCoreDebug(context, `GQL ответ ИЗМЕНЕН.`);
                return JSON.stringify(finalData);
            }
        } catch (e) {
            logError(context, `Ошибка модификации GQL ответа от ${url}:`, e);
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
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl.substring(0, 70);

        let isBlocked = false;
        if (!isGqlRequest && !isM3U8Request && !isTsRequest) {
            if (blockedUrlKeywordsSet.has(new URL(requestUrl).hostname) || // Блокировка по хостнейму
                AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()))) { // Блокировка по ключевому слову в URL
                if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) {
                    // Пропуск
                } else {
                    logWarn(context, `Блокировка Fetch (${method}) к рекламному/трекерному URL: ${urlShort}`);
                    isBlocked = true;
                }
            }
        }

        if (isBlocked) {
            return Promise.resolve(new Response(null, { status: 403, statusText: "Blocked by TTV AdBlock Ultimate" }));
        }

        if (isM3U8Request && method === 'GET' && INJECT_INTO_WORKERS && workerHookAttempted) {
            return originalFetch(input, init);
        }

        let originalResponse;
        try {
            originalResponse = await originalFetch(input, init);

            if (isGqlRequest && method === 'POST' && originalResponse.ok && MODIFY_GQL_RESPONSE) {
                const contextGQL = 'GQL:FetchResp';
                let responseText;
                try {
                    responseText = await originalResponse.clone().text();
                    if (!responseText) return originalResponse;
                } catch (e) {
                    logError(contextGQL, `Ошибка клонирования/чтения тела ответа GQL для ${urlShort}:`, e);
                    return originalResponse;
                }

                const modifiedText = modifyGqlResponse(responseText, requestUrl);
                if (modifiedText !== responseText) {
                    const newHeaders = new Headers(originalResponse.headers);
                    newHeaders.delete('Content-Length');
                    return new Response(modifiedText, {
                        status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders
                    });
                }
            }
            return originalResponse;

        } catch (error) {
            if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('aborted'))) {
                logWarn(context, `Fetch к ${urlShort} не удался/заблокирован браузером: ${error.message}`);
                if (lowerCaseUrl.includes('usher.ttvnw.net') || lowerCaseUrl.includes('akamaized.net')) {
                    scheduleReload(`Fetch к ${urlShort} не удался: ${error.message}`, 8000); // Увеличен таймаут
                }
                return Promise.resolve(new Response(null, { status: 0, statusText: `Blocked/Failed (${error.message})` }));
            } else if (error instanceof DOMException && error.name === 'AbortError') {
                // Запрос был прерван, это нормально
            } else {
                logError(context, `Неожиданная ошибка fetch для ${urlShort}:`, error);
            }
            throw error;
        }
    }

    const xhrRequestData = new WeakMap();

    function xhrOpenOverride(method, url) {
        const context = 'NetBlock:XHR';
        const urlString = String(url); const lowerCaseUrl = urlString.toLowerCase();
        let blocked = false; const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const isM3U8Request = urlString.includes('.m3u8'); const isTsRequest = urlString.endsWith('.ts');
        const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 70);

        if (!isGqlRequest && !isM3U8Request && !isTsRequest) {
             if (blockedUrlKeywordsSet.has(new URL(urlString).hostname) ||
                AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()))) {
                if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) {
                    // Пропуск
                } else {
                    blocked = true;
                }
            }
        }
        xhrRequestData.set(this, { method: method.toUpperCase(), url: urlString, urlShort: urlShort, blocked: blocked, isGql: isGqlRequest });

        if (isGqlRequest && MODIFY_GQL_RESPONSE) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const reqData = xhrRequestData.get(this);
                    if (reqData?.isGql) {
                        const originalResponseText = this.responseText;
                        if (typeof originalResponseText !== 'string' || originalResponseText.length === 0) return;
                        const modifiedText = modifyGqlResponse(originalResponseText, reqData.url);
                        xhrRequestData.set(this, { ...reqData, modifiedResponse: modifiedText !== originalResponseText ? modifiedText : null });
                    }
                }
            }, { once: true, passive: true });
        }

        if (isM3U8Request && method.toUpperCase() === 'GET' && INJECT_INTO_WORKERS && workerHookAttempted) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `Ошибка в оригинальном xhr.open для M3U8 (worker bypass) ${urlShort}:`, error); throw error; }
        }

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `Ошибка в оригинальном xhr.open для ${urlShort}:`, error); throw error; }
        } else {
            logWarn(context, `Пометка XHR (${method}) для блокировки (send будет перехвачен): ${urlShort}`);
            try { originalXhrOpen.apply(this, arguments); }
            catch(e) { /* Игнор */ }
        }
    }

    function xhrSendOverride(data) {
        const context = 'NetBlock:XHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            try { return originalXhrSend.apply(this, arguments); }
            catch(e){ logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e; }
        }
        const { method, url, urlShort, blocked } = requestInfo;

        if (blocked) {
            logWarn(context, `Блокировка XHR (${method}) send к ${urlShort}`);
            this.dispatchEvent(new ProgressEvent('abort'));
            this.dispatchEvent(new ProgressEvent('error'));
            try {
                Object.defineProperty(this, 'readyState', { value: 4, writable: false, configurable: true });
                Object.defineProperty(this, 'status', { value: 0, writable: false, configurable: true });
            } catch (e) { /* Игнор */ }
            return;
        }
        try {
            return originalXhrSend.apply(this, arguments);
        } catch (error) {
            if (error.name === 'NetworkError' || (error.message && (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to execute') ) ) ) {
                logWarn(context, `XHR send к ${urlShort} не удался (Сетевая ошибка/Заблокирован браузером?): ${error.message}`);
                if (url.toLowerCase().includes('usher.ttvnw.net') || url.toLowerCase().includes('akamaized.net')) {
                    scheduleReload(`XHR к ${urlShort} не удался: ${error.message}`, 8000); // Увеличен таймаут
                }
            } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
                logError(context, `Неизвестная ошибка в xhr.send для ${urlShort}:`, error);
            }
            throw error;
        }
    }

    function hookXhrGetters() {
        const context = 'GQL:XhrGetter';
        if (MODIFY_GQL_RESPONSE) {
            if (originalXhrResponseGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.isGql && reqData.modifiedResponse !== undefined && reqData.modifiedResponse !== null && (this.responseType === '' || this.responseType === 'text')) {
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseGetter.get.call(this); }
                        catch (getterError) { logWarn(context, `Ошибка вызова оригинального XHR response геттера для ${reqData?.urlShort}: ${getterError.message}`); return null; }
                    },
                    configurable: true
                });
            }
            if (originalXhrResponseTextGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.isGql && reqData.modifiedResponse !== undefined && reqData.modifiedResponse !== null) {
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseTextGetter.get.call(this); }
                        catch (getterError) { logWarn(context, `Ошибка вызова оригинального XHR responseText геттера для ${reqData?.urlShort}: ${getterError.message}`); return ""; }
                    },
                    configurable: true
                });
            }
        }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true;
        const context = 'WorkerInject:MsgListener';

        const adBlockListener = (e) => {
            const msgData = e.data;
            if (msgData && typeof msgData.type === 'string') {
                if (msgData.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                    logCoreDebug('WorkerInject:Confirm', `---> HOOKS READY получено от Worker (${label})! Метод: ${msgData.method || 'N/A'}`);
                    hookedWorkers.set(label, { instance: workerInstance, lastPing: 0, lastPong: Date.now(), hooksReady: true });
                } else if (msgData.type === 'ADBLOCK_M3U8_CLEANED') {
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'WorkerMsg', `M3U8 почищен Worker'ом (${label}). URL: ${msgData.url || 'N/A'}, Удалено: ${msgData.linesRemoved}`);
                } else if (msgData.type === 'PONG') {
                    const workerState = hookedWorkers.get(label);
                    if (workerState) workerState.lastPong = Date.now();
                }
            }
        };
        workerInstance.addEventListener('message', adBlockListener, { passive: true });
        workerInstance.addEventListener('error', (e) => {
            logError(context, `Ошибка ВНУТРИ Worker (${label}):`, e.message, `(${e.filename || '?'}:${e.lineno || '?'}:${e.colno || '?'})`);
            hookedWorkers.delete(label);
        }, { passive: true });
        workerInstance._adBlockListener = adBlockListener;
    }

    function hookWorkerConstructor() {
        const context = 'WorkerInject:HookSetup';
        if (!INJECT_INTO_WORKERS) {
            logWarn(context, "Внедрение в Worker отключено настройками.");
            return;
        }
        if (unsafeWindow.Worker?.hooked_by_adblock) return;
        if (typeof OriginalWorker === 'undefined') {
            logError(context, 'Оригинальный конструктор Worker не найден.');
            return;
        }
        logCoreDebug(context, "Попытка перехвата конструктора Worker...");
        workerHookAttempted = true;

        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                let urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                let isBlobURL = urlString.startsWith('blob:');
                let workerLabel = isBlobURL ? `blob:${urlString.substring(5, 25)}...` : (urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60));
                let isIVSWorker = workerLabel.includes('amazon-ivs-wasmworker') || workerLabel.includes('ivs-wasmworker'); // Расширена проверка
                if(isIVSWorker) workerLabel += " (IVS)";

                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Вызван конструктор Worker. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob' : 'Скрипт'}${isIVSWorker ? ', IVS' : ''}`);

                try {
                    super(scriptURL, options);
                    this._workerLabel = workerLabel;
                    addWorkerMessageListeners(this, workerLabel);
                    hookedWorkers.set(workerLabel, { instance: this, lastPing: 0, lastPong: 0, hooksReady: false });

                    if (isIVSWorker) {
                        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Пропуск внедрения кода в IVS worker (${workerLabel}).`);
                        // Отправляем PING, чтобы убедиться, что воркер жив, даже если не внедряем
                        setTimeout(() => { try { this.postMessage({ type: 'PING_IVS_WORKER' }); } catch(e){} }, 1000);
                        return;
                    }
                    setTimeout(() => {
                        const workerState = hookedWorkers.get(this._workerLabel);
                        if (workerState && !workerState.hooksReady) {
                            logWarn(context, `Worker (${this._workerLabel}) не подтвердил готовность через 250ms. Попытка внедрения через postMessage (EVAL)...`);
                            try {
                                this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: getWorkerInjectionCode() });
                            } catch(e) {
                                logError(context, `Ошибка использования postMessage fallback для ${this._workerLabel}:`, e);
                            }
                        }
                    }, 250);
                } catch (constructorError) {
                    logError(context, `Ошибка в конструкторе HookedWorker для ${workerLabel}:`, constructorError);
                    hookedWorkers.delete(workerLabel);
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
        } catch (e) {
            logError(context, "Не удалось восстановить цепочку прототипов Worker:", e);
        }
        unsafeWindow.Worker.hooked_by_adblock = true;
        logCoreDebug(context, "Конструктор Worker успешно перехвачен.");
    }

    function startWorkerPinger() {
        const context = 'WorkerInject:Pinger';
        if (workerPingIntervalId || !INJECT_INTO_WORKERS || WORKER_PING_INTERVAL_MS <= 0) return;

        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Запуск PING для Worker'ов с интервалом ${WORKER_PING_INTERVAL_MS}ms.`);
        workerPingIntervalId = setInterval(() => {
            const now = Date.now();
            if (hookedWorkers.size === 0) return;

            hookedWorkers.forEach((state, label) => {
                try {
                    if (state.instance && typeof state.instance.postMessage === 'function') {
                        if (!state.hooksReady && !label.includes('(IVS)')) { // Не пингуем обычных, если не готовы
                            logWarn(context, `Worker (${label}) еще не подтвердил готовность хуков (hooksReady=false), PING пропущен.`);
                            return;
                        }
                        const timeSinceLastPong = now - (state.lastPong || state.lastPing || 0); // Используем lastPing если lastPong 0
                        if (state.lastPong !== 0 && timeSinceLastPong > WORKER_PING_INTERVAL_MS * 3.5) { // Немного увеличен таймаут ответа
                            logWarn(context, `Worker (${label}) не отвечает на PING (прошло ${Math.round(timeSinceLastPong/1000)}s). Считаем его неактивным.`);
                            hookedWorkers.delete(label);
                            return;
                        }
                        // Для IVS Worker'ов, если они не ответили на PING_IVS_WORKER, не отправляем обычный PING
                        if(label.includes('(IVS)') && !state.hooksReady){ /*  IVS worker не должен отвечать PONG, если в него не внедрен код */ }
                        else { state.instance.postMessage({ type: 'PING' }); }

                        state.lastPing = now;
                    } else {
                        hookedWorkers.delete(label);
                    }
                } catch (e) {
                    logError(context, `Ошибка отправки PING Worker'у (${label}):`, e);
                    hookedWorkers.delete(label);
                }
            });
        }, WORKER_PING_INTERVAL_MS);
    }

    function stopWorkerPinger() {
        if (workerPingIntervalId) {
            clearInterval(workerPingIntervalId);
            workerPingIntervalId = null;
        }
    }

    function installHooks() {
        const context = 'MainHooks';
        if (hooksInstalledMain) return;
        logCoreDebug(context, "Установка хуков основного потока...");

        try { unsafeWindow.fetch = fetchOverride; }
        catch (e) { logError(context, "Не удалось перехватить Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }

        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            if (MODIFY_GQL_RESPONSE) hookXhrGetters();
        } catch (e) {
            logError(context, "Не удалось перехватить XMLHttpRequest:", e);
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend;
            if (MODIFY_GQL_RESPONSE) {
                if (originalXhrResponseGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', originalXhrResponseGetter); } catch(revertErr) {}
                if (originalXhrResponseTextGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', originalXhrResponseTextGetter); } catch (revertErr) {}
            }
        }

        if (INJECT_INTO_WORKERS) {
            try {
                hookWorkerConstructor();
                startWorkerPinger();
            } catch (e) { logError(context, "Не удалось перехватить конструктор Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            if(LOG_WORKER_INJECTION_DEBUG) {
                try {
                    unsafeWindow.URL.revokeObjectURL = function(url) {
                        if (typeof url === 'string' && url.startsWith('blob:')) {
                            logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerInject:Revoke', `revokeObjectURL: ${String(url).substring(0, 70)}...`);
                        }
                        if (typeof originalRevokeObjectURL === 'function') return originalRevokeObjectURL.call(unsafeWindow.URL, url);
                    };
                } catch(e) { /* Игнор */ }
            }
        } else {
            workerHookAttempted = false;
        }
        hooksInstalledMain = true;
        logCoreDebug(context, "Установка хуков основного потока завершена.");
    }

    function removeDOMAdElements(contextNode = document) {
        if (!ATTEMPT_DOM_AD_REMOVAL || !contextNode || typeof contextNode.querySelectorAll !== 'function') return;
        let removedCount = 0;
        AD_DOM_ELEMENT_SELECTORS_TO_REMOVE.forEach(selector => {
            try {
                const elements = contextNode.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el && el.parentNode) {
                        // Дополнительная проверка, чтобы не удалить сам плеер или его важные части
                        if (el.querySelector('video') || el.closest('video')) return;
                        el.parentNode.removeChild(el);
                        removedCount++;
                    }
                });
            } catch (e) { /* Игнор */ }
        });
        if (removedCount > 0) {
            logCoreDebug('DOMRemove', `Удалено ${removedCount} DOM-элементов рекламы.`);
        }
    }

    function startAdRemovalObserver() {
        if (!ATTEMPT_DOM_AD_REMOVAL || adRemovalObserver) return;
        const context = 'DOMRemove:Observer';
        let observedNode = document.body;
        for (const selector of AD_DOM_PARENT_INDICATOR_SELECTORS) {
            const parentNode = document.querySelector(selector);
            if (parentNode) { observedNode = parentNode; break; }
        }
        if (!observedNode) observedNode = document.body || document.documentElement;

        const observerConfig = { childList: true, subtree: true };
        const callback = function(mutationsList) {
            let potentialAdNodeAdded = false;
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (potentialAdNodeAdded) return;
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) {
                                if ((node.matches && node.matches(adSelector)) || node.querySelector(adSelector)) {
                                    potentialAdNodeAdded = true; return;
                                }
                            }
                            // Проверка на iframe с рекламными src
                            if (node.tagName === 'IFRAME' && AD_URL_KEYWORDS_BLOCK.some(keyword => node.src.toLowerCase().includes(keyword))) {
                                potentialAdNodeAdded = true; return;
                            }
                        }
                    });
                }
                if (potentialAdNodeAdded) break;
            }
            if (potentialAdNodeAdded) removeDOMAdElements(observedNode);
        };
        adRemovalObserver = new MutationObserver(callback);
        try {
            adRemovalObserver.observe(observedNode, observerConfig);
            removeDOMAdElements(observedNode);
        } catch (e) {
            logError(context, 'Не удалось запустить MutationObserver для удаления DOM-рекламы:', e);
            adRemovalObserver = null;
        }
    }

    function stopAdRemovalObserver() {
        if (adRemovalObserver) {
            adRemovalObserver.disconnect();
            adRemovalObserver = null;
        }
    }

    function findVideoPlayer() {
        if (videoElement && videoElement.isConnected && videoElement.closest('body')) {
            // Дополнительная проверка, что это действительно активный плеер
            if (videoElement.offsetWidth > 0 && videoElement.offsetHeight > 0 && !videoElement.paused) return videoElement;
        }
        let foundElement = null;
        for (const selector of PLAYER_SELECTORS_IMPROVED) {
            try {
                const elements = document.querySelectorAll(selector); // Ищем все, а не первый
                for (const el of elements) {
                     if (el && el.tagName === 'VIDEO' && el.isConnected &&
                        el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null &&
                        el.hasAttribute('src') && el.src.startsWith('blob:')) // Ищем плеер с blob src, это обычно основной
                    {
                        foundElement = el; break;
                    }
                }
                if (foundElement) break;
                // Если не нашли с blob, берем первый подходящий
                if (!foundElement && elements.length > 0) {
                     for (const el of elements) {
                        if (el && el.tagName === 'VIDEO' && el.isConnected &&
                            el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null)
                        {
                            foundElement = el; break;
                        }
                    }
                }
                if (foundElement) break;

            } catch (e) { /* Игнор */ }
        }
        videoElement = foundElement;
        if (!foundElement) logWarn('PlayerFind', 'Видео элемент НЕ найден.');
        return foundElement;
    }

    function observePlayerContainer() {
        if (playerFinderObserver) return;
        const targetNode = document.body || document.documentElement;
        if (!targetNode) { setTimeout(observePlayerContainer, 500); return; }

        const config = { childList: true, subtree: true };
        const callback = function() {
            if (videoElement && videoElement.isConnected) return;
            if (document.querySelector('video[src^="blob:"]')) { // Ищем видео с blob src
                setupPlayerMonitor();
            } else if (document.querySelector('video')) { // Общий поиск
                 setupPlayerMonitor();
            }
        };
        playerFinderObserver = new MutationObserver(callback);
        try { playerFinderObserver.observe(targetNode, config); }
        catch (e) { logError('PlayerFind:Observer', 'Не удалось запустить MutationObserver:', e); playerFinderObserver = null; }
    }

    function stopObservingPlayerContainer() {
        if (playerFinderObserver) {
            playerFinderObserver.disconnect();
            playerFinderObserver = null;
        }
    }

    function setupPlayerMonitor() {
        const context = 'PlayerMon:Setup';
        if (!ENABLE_AUTO_RELOAD) {
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners(); videoElement = null;
            stopObservingPlayerContainer(); stopAdRemovalObserver(); stopWorkerPinger();
            return;
        }
        const currentVideoElement = findVideoPlayer();

        if (!currentVideoElement) {
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners(); videoElement = null;
            stopAdRemovalObserver();
            observePlayerContainer();
            return;
        }
        stopObservingPlayerContainer();

        if (currentVideoElement !== videoElement || !playerMonitorIntervalId) {
            logCoreDebug(context, `Видео элемент найден/изменен. Инициализация монитора...`);
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            if (videoElement) removePlayerEventListeners();

            videoElement = currentVideoElement;
            checkReloadCooldown(context);
            addPlayerEventListeners();
            resetMonitorState('Monitor setup/reset');

            if (ATTEMPT_DOM_AD_REMOVAL) startAdRemovalObserver();

            if (!document.hidden) {
                playerMonitorIntervalId = setInterval(monitorPlayerState, 2000);
            }
        }
    }

    function triggerReload(reason) {
        const context = 'PlayerMon:Reload';
        const now = Date.now();

        if (!ENABLE_AUTO_RELOAD) return;
        if (reloadTimeoutId) { logWarn(context, `Перезагрузка (${reason}) запрошена, но другая уже запланирована. Игнор.`); return; }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn(context, `Перезагрузка (${reason}) отменена: Кулдаун (${((RELOAD_COOLDOWN_MS - (now - lastReloadTimestamp))/1000).toFixed(1)}с).`);
            return;
        }
        if (document.hidden) { logWarn(context, `Перезагрузка (${reason}) отменена: Вкладка скрыта.`); return; }

        logError(context, `!!!!!! ЗАПУСК ПЕРЕЗАГРУЗКИ СТРАНИЦЫ !!!!!! Причина: ${reason}.`);
        lastReloadTimestamp = now;
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); } catch (e) {}

        if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
        removePlayerEventListeners(); stopObservingPlayerContainer(); stopAdRemovalObserver(); stopWorkerPinger();

        unsafeWindow.location.reload();
        setTimeout(() => { if(unsafeWindow && typeof unsafeWindow.location === 'object' && typeof unsafeWindow.location.reload === 'function') unsafeWindow.location.reload(true); }, 2500); // Force reload
    }

    function scheduleReload(reason, delayMs = 5000) {
        const context = 'PlayerMon:ScheduleReload';
        if (reloadTimeoutId || !ENABLE_AUTO_RELOAD || document.hidden) return;

        logWarn(context, `Планирование перезагрузки через ${(delayMs / 1000).toFixed(1)}с. Причина: ${reason}`);
        reloadTimeoutId = setTimeout(() => {
            const internalReason = reloadTimeoutId?._reason || reason;
            reloadTimeoutId = null;
            triggerReload(internalReason);
        }, delayMs);
        try { if (reloadTimeoutId) reloadTimeoutId._reason = reason; } catch(e){}
    }

    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) {
            const currentReloadReason = reloadTimeoutId._reason || '';
            if (!currentReloadReason.toLowerCase().includes('error') && !currentReloadReason.toLowerCase().includes('ошибка')) {
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }
        lastVideoTimeUpdateTimestamp = Date.now();
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0;
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:State', `Состояние монитора сброшено (${reason}). Известное время: ${lastKnownVideoTime > -1 ? lastKnownVideoTime.toFixed(2) : 'N/A'}`);
    }

    function monitorPlayerState() {
        const context = 'PlayerMon:Monitor';
        if (!ENABLE_AUTO_RELOAD || document.hidden) {
            if (playerMonitorIntervalId && document.hidden) {
                clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
            } return;
        }
        if (!videoElement || !videoElement.isConnected || !videoElement.closest('body')) {
            logWarn(context, 'Видео элемент потерян. Попытка перезапуска setupPlayerMonitor.');
            if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners(); videoElement = null;
            stopAdRemovalObserver();
            setupPlayerMonitor(); return;
        }

        const now = Date.now();
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        const networkState = videoElement.networkState;
        const isSeeking = videoElement.seeking;
        let bufferEnd = 0;
        try { if (videoElement.buffered && videoElement.buffered.length > 0) bufferEnd = videoElement.buffered.end(videoElement.buffered.length - 1); } catch (e) {}

        let detectedProblemReason = null;

        if (!videoElement.paused && !videoElement.ended && !isSeeking && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;

            if (currentTime === lastKnownVideoTime && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                const nearBufferEnd = bufferEnd - currentTime < 1.5;
                if (readyState < videoElement.HAVE_FUTURE_DATA || networkState === videoElement.NETWORK_IDLE || networkState === videoElement.NETWORK_EMPTY || (nearBufferEnd && readyState <= videoElement.HAVE_CURRENT_DATA)) {
                    detectedProblemReason = `Зависание: currentTime (${currentTime.toFixed(2)}) не меняется ${timeSinceLastUpdate.toFixed(0)}ms (RS ${readyState}, NS ${networkState}, Buffered: ${bufferEnd.toFixed(2)})`;
                }
            } else if (lastKnownVideoTime > 0 && currentTime < (lastKnownVideoTime - 1.5)) {
                detectedProblemReason = `Сбой: currentTime (${currentTime.toFixed(2)}) перемоталось назад с (${lastKnownVideoTime.toFixed(2)})`;
            }

            if (currentTime > lastKnownVideoTime) {
                lastVideoTimeUpdateTimestamp = now; lastKnownVideoTime = currentTime;
                if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
                if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('stall') && !detectedProblemReason) {
                    clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
                }
            }
        } else {
            lastKnownVideoTime = currentTime;
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        }

        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            const bufferingDuration = now - isWaitingForDataTimestamp;
            if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS && !detectedProblemReason) {
                detectedProblemReason = `Чрезмерная буферизация > ${(bufferingDuration / 1000).toFixed(1)}с (RS ${readyState}, NS ${networkState})`;
            }
        }
        const isPlayingAndReady = !videoElement.paused && !videoElement.ended && readyState >= videoElement.HAVE_FUTURE_DATA;
        if (isPlayingAndReady && isWaitingForDataTimestamp > 0) {
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('buffer')) {
                clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
            }
        }
        if (detectedProblemReason && !reloadTimeoutId) scheduleReload(detectedProblemReason);
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
                        lastReloadTimestamp = Date.now() - timeSinceLastReload;
                    }
                }
            }
        } catch (e) { /* Игнор */ }
    }

    function addPlayerEventListeners() {
        if (!videoElement || videoElement._adblockListenersAttached) return;
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true });
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true });
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });
        videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true });
        videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true });
        videoElement.addEventListener('abort', handlePlayerAbort, { passive: true });
        videoElement.addEventListener('timeupdate', handlePlayerTimeUpdate, { passive: true });
        videoElement._adblockListenersAttached = true;
    }

    function removePlayerEventListeners() {
        if (!videoElement || !videoElement._adblockListenersAttached) return;
        videoElement.removeEventListener('error', handlePlayerError);
        videoElement.removeEventListener('waiting', handlePlayerWaiting);
        videoElement.removeEventListener('playing', handlePlayerPlaying);
        videoElement.removeEventListener('pause', handlePlayerPause);
        videoElement.removeEventListener('emptied', handlePlayerEmptied);
        videoElement.removeEventListener('loadedmetadata', handlePlayerLoadedMeta);
        videoElement.removeEventListener('abort', handlePlayerAbort);
        videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
        delete videoElement._adblockListenersAttached;
    }

    function handlePlayerError(event) {
        const error = event?.target?.error;
        if (!error) { logWarn('PlayerMon:EventError', 'Событие ошибки без деталей video.error.'); return; }
        const errorCode = error.code; const errorMessage = error.message || 'N/A';
        logError('PlayerMon:EventError', `Ошибка плеера! Код: ${errorCode}, Сообщение: "${errorMessage}"`);
        let reason = `Ошибка плеера (Код ${errorCode}: ${errorMessage})`;
        if (ENABLE_AUTO_RELOAD && RELOAD_ON_ERROR_CODES.includes(errorCode)) {
            scheduleReload(reason, errorCode === 2000 ? 2500 : 3500); // Слегка увеличены задержки
        }
        resetMonitorState(`Ошибка плеера ${errorCode}`);
    }

    function handlePlayerWaiting() {
        if (videoElement && !videoElement.paused && !videoElement.seeking && isWaitingForDataTimestamp === 0 && !document.hidden) {
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventWaiting', `Плеер перешел в состояние ожидания данных.`);
            isWaitingForDataTimestamp = Date.now();
        }
    }

    function handlePlayerPlaying() {
        if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
        resetMonitorState('Плеер воспроизводится');
        setQualitySettings(true);
    }

    function handlePlayerPause() {
        if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        resetMonitorState('Пауза');
    }

    function handlePlayerEmptied() {
        logWarn('PlayerMon:EventEmptied', 'Источник плеера очищен. Перенастройка монитора.');
        resetMonitorState('Источник очищен');
        if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null;
        stopAdRemovalObserver();
        setTimeout(setupPlayerMonitor, 750); // Увеличена задержка
    }

    function handlePlayerLoadedMeta() {
        resetMonitorState('Метаданные загружены');
        setQualitySettings(true);
    }

    function handlePlayerAbort() {
        resetMonitorState('Загрузка прервана');
    }

    function handlePlayerTimeUpdate() {
        if (videoElement && !videoElement.seeking) {
            const currentTime = videoElement.currentTime;
            if (Math.abs(currentTime - lastKnownVideoTime) > 0.01) {
                if (currentTime > lastKnownVideoTime) {
                    lastVideoTimeUpdateTimestamp = Date.now();
                    lastKnownVideoTime = currentTime;
                    if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
                    if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('stall')) {
                        clearTimeout(reloadTimeoutId); reloadTimeoutId = null;
                    }
                }
                if (LOG_PLAYER_MONITOR_DEBUG) {
                    const now = Date.now();
                    if (!videoElement._lastTimeUpdateLog || now - videoElement._lastTimeUpdateLog > 5000) {
                        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventTimeUpdate', `TimeUpdate: CT=${currentTime.toFixed(2)}`);
                        videoElement._lastTimeUpdateLog = now;
                    }
                }
            }
        }
    }

    function handleVisibilityChange() {
        const context = 'Visibility';
        if (document.hidden) {
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
            if (visibilityResumeTimer) { clearTimeout(visibilityResumeTimer); visibilityResumeTimer = null; }
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
            stopAdRemovalObserver(); stopWorkerPinger();
        } else {
            if (visibilityResumeTimer) clearTimeout(visibilityResumeTimer);
            visibilityResumeTimer = setTimeout(() => {
                visibilityResumeTimer = null;
                setQualitySettings(true);
                if (ENABLE_AUTO_RELOAD) {
                    resetMonitorState('Возобновление видимости');
                    checkReloadCooldown(context);
                    setupPlayerMonitor();
                }
                if (ATTEMPT_DOM_AD_REMOVAL && videoElement) startAdRemovalObserver(); // Перезапуск и при видимости
                if (INJECT_INTO_WORKERS) startWorkerPinger();

                if (videoElement && videoElement.paused && !videoElement.ended && videoElement.readyState >= videoElement.HAVE_FUTURE_DATA) {
                    videoElement.play().catch(e => logWarn(context, 'Ошибка авто-возобновления видео:', e.message));
                }
            }, VISIBILITY_RESUME_DELAY_MS);
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    installHooks();
    setQualitySettings(true);

    function initialPlayerSearchAndMonitor() {
        setupPlayerMonitor();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        requestAnimationFrame(initialPlayerSearchAndMonitor);
    } else {
        window.addEventListener('load', () => requestAnimationFrame(initialPlayerSearchAndMonitor), { once: true, passive: true });
    }
    setTimeout(() => {
        if (!videoElement && (document.readyState === 'complete' || document.readyState === 'interactive')) {
            logWarn('Init', 'Запасной поиск плеера через 5с...');
            setupPlayerMonitor();
        }
    }, 5000);

})();