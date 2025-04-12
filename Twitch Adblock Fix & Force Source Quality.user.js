// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality (with Auto-Reload)
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource_v18_1_2_ReloadOpt
// @version      18.1.2
// @description  Блокировка рекламы Twitch через Worker + Установка качества "Источник" + Оптимизированная авто-перезагрузка при зависании/ошибке
// @author       AI Generated & Adapted by ShmidtS + Reload Feature Optimized
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
// @updateURL    https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js // Оставьте оригинальный URL или обновите на свой форк
// @downloadURL  https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality%20V2.user.js // Оставьте оригинальный URL или обновите на свой форк
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- НАСТРОЙКИ (Конфигурируемые через GM_setValue) ---
    const SCRIPT_VERSION = '18.1.2'; // **Версия обновлена**
    const SHOW_ERRORS = true;
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false);
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', false);
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true);
    const OPT_SHOW_AD_BANNER = GM_getValue('TTV_AdBlock_ShowBanner', true);
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const ENABLE_PERIODIC_QUALITY_CHECK = GM_getValue('TTV_AdBlock_PeriodicQualityCheck', true);
    const PERIODIC_QUALITY_CHECK_INTERVAL_MS = GM_getValue('TTV_AdBlock_QualityCheckInterval', 7500);

    // --- **НАСТРОЙКИ ДЛЯ АВТО-ПЕРЕЗАГРУЗКИ (СКОРРЕКТИРОВАНЫ)** ---
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [1000, 2000, 3000, 4000]);
    // **Уменьшены пороги по умолчанию. Если перезагрузки слишком частые, увеличьте их через GM_setValue**
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 12000); // Время зависания/низкого readyState (мс)
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 18000); // Время непрерывной буферизации (waiting + low readyState) (мс)
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 45000); // Пауза перед следующей авто-перезагрузкой (мс)

    // --- КОНСТАНТЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', '#EXT-X-SCTE35', '#EXT-X-ASSET', '#EXT-X-DISCONTINUITY'];
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED'];
    const AD_URL_KEYWORDS_BLOCK = ['amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com', 'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag', 'ttvl-o.cloudfront.net', 'd2v02itv0y9u9t.cloudfront.net', 'fastly.net/ad', 'edge.ads.twitch.tv'];
    const AD_URL_KEYWORDS_WARN = ['player-ad-', 'isp-signal', 'adlanding', 'adurl', 'adserver'];

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    var adBannerElement = null;
    var hooksInstalledMain = false;
    var workerHookAttempted = false;
    var hookedWorkers = new Set();
    var qualitySetIntervalId = null;
    var playerMonitorIntervalId = null;
    var videoElement = null;
    var lastVideoTimeUpdateTimestamp = 0;
    var lastKnownVideoTime = -1; // Инициализируем -1, чтобы первая проверка сработала
    var isWaitingForDataTimestamp = 0;
    var reloadTimeoutId = null;
    var lastReloadTimestamp = 0;
    const PLAYER_SELECTOR = 'video';

    // --- Оригинальные функции ---
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;

    // --- ЛОГИРОВАНИЕ ---
    function logError(source, message, ...args) { if (SHOW_ERRORS) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logInfo(source, message, ...args) { console.info(`${LOG_PREFIX} [${source}] INFO:`, message, ...args); }
    function logDebug(source, message, ...args) { if (DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logTrace(source, message, ...args) { if (DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args); }

    logInfo('MAIN', `Скрипт запускается. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. Periodic Quality Check: ${ENABLE_PERIODIC_QUALITY_CHECK}. Auto Reload: ${ENABLE_AUTO_RELOAD}.`);

    // --- УПРАВЛЕНИЕ БАННЕРОМ (Без изменений) ---
    function getAdDiv() { /* ... код из v18.1.1 ... */
        if (!OPT_SHOW_AD_BANNER) return null;
        if (adBannerElement && document.body.contains(adBannerElement)) { return adBannerElement; }
        adBannerElement = document.querySelector('.tch-adblock-banner');
        if (adBannerElement) { return adBannerElement; }
        try {
            const playerRootDiv = document.querySelector('.video-player__container') || document.querySelector('.video-player .persistent-player') || document.querySelector('div[data-a-target="video-player-layout"]') || document.querySelector('div[data-a-target="video-player"]') || document.querySelector('.video-player') || document.body;
            if (!playerRootDiv || !(playerRootDiv instanceof Node)) { logWarn("Banner", "Не удалось найти валидный контейнер плеера для баннера."); return null; }
            const div = document.createElement('div');
            div.className = 'tch-adblock-banner';
            const currentPosition = window.getComputedStyle(playerRootDiv).position;
            if (currentPosition === 'static') { playerRootDiv.style.position = 'relative'; }
            playerRootDiv.appendChild(div);
            adBannerElement = div;
            logInfo("Banner", "Баннер успешно создан и добавлен.");
            return adBannerElement;
        } catch (e) { logError("Banner", "Ошибка создания баннера:", e); adBannerElement = null; return null; }
     }
    function showAdBanner(isMidroll) { /* ... код из v18.1.1 ... */
        if (!OPT_SHOW_AD_BANNER) return;
        const adDiv = getAdDiv();
        if (adDiv) {
            requestAnimationFrame(() => {
                try {
                    if (adDiv._fadeOutTimeout) clearTimeout(adDiv._fadeOutTimeout);
                    if (adDiv._hideTimeout) clearTimeout(adDiv._hideTimeout);
                    const bannerText = `Реклама удалена v${SCRIPT_VERSION.substring(0, 6)}` + (isMidroll ? ' (midroll)' : '');
                    adDiv.textContent = bannerText;
                    adDiv.style.display = 'block'; adDiv.style.opacity = '1';
                    logInfo("Banner", "Баннер показан. Текст:", bannerText);
                    let fadeOutTimeout = setTimeout(() => {
                        if (adDiv) {
                            adDiv.style.opacity = '0';
                            let hideTimeout = setTimeout(() => { if (adDiv) adDiv.style.display = 'none'; }, 600);
                            adDiv._hideTimeout = hideTimeout;
                        }
                    }, 5000);
                    adDiv._fadeOutTimeout = fadeOutTimeout;
                } catch(e) { logError("Banner", "Ошибка отображения баннера:", e); }
            });
        } else { logWarn("Banner", "Не удалось получить/создать баннер для показа."); }
    }

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА (Без изменений) ---
    function setQualitySettings() { /* ... код из v18.1.1 ... */
        const context = 'QualityV2Enhanced';
        try {
            const currentValue = unsafeWindow.localStorage.getItem(LS_KEY_QUALITY);
            const targetValue = '{"default":"chunked"}';
            if (currentValue !== targetValue) {
                unsafeWindow.localStorage.setItem(LS_KEY_QUALITY, targetValue);
                logInfo(context, `Установлено качество 'Источник' ('${targetValue}') через localStorage.`);
            } else {
                logDebug(context, `Качество 'Источник' ('${targetValue}') уже установлено в localStorage.`);
            }
        } catch (e) {
            logError(context, 'Ошибка установки настроек качества в localStorage:', e);
        }
     }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER (Без изменений) ---
    function getWorkerInjectionCode() { /* ... код из v18.1.1 ... */
        return `
        // --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
        const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
        const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
        const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
        const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
        const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
        const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)};
        const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';
        function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
        function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
        function workerLogInfo(message, ...args) { console.info(LOG_PREFIX_WORKER_BASE + ' INFO:', message, ...args); }
        function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
        function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }
        function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
            const context = 'WorkerM3U8Parse'; const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
            if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] Запуск очистки для URL: \${url}\`);
            if (!m3u8Text || typeof m3u8Text !== 'string') { workerLogWarn(\`[\${context}] (\${urlShort}): Получен невалидный или пустой текст M3U8.\`); return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false }; }
            const lines = m3u8Text.split(/[\\r\\n]+/);
            if (lines.length < 2) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): M3U8 слишком короткий (\${lines.length} строк), пропускаем.\`); return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false }; }
            const cleanLines = []; let isAdSection = false; let adsFound = false; let linesRemoved = 0; let isMidrollAd = false; let discontinuityCountInAd = 0;
            if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обработка \${lines.length} строк...\`);
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i]; let trimmedLine = line.trim();
                if (!trimmedLine) { cleanLines.push(line); continue; }
                let isAdMarkerLine = false; let shouldRemoveLine = false;
                if (trimmedLine.startsWith('#EXT-X-DATERANGE:')) {
                    if (trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER)) {
                        isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (CLASS=\${AD_SIGNIFIER_DATERANGE_ATTR_WORKER}) [\${i}]\`);
                        shouldRemoveLine = true;
                    } else if (AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => trimmedLine.toUpperCase().includes(kw))) {
                         isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (по ключевому слову) [\${i}]\`);
                         shouldRemoveLine = true;
                    }
                } else if (trimmedLine.startsWith('#EXT-X-CUE-OUT')) {
                     isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
                     if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер начала #EXT-X-CUE-OUT [\${i}]\`);
                     shouldRemoveLine = true;
                } else if (trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) {
                     isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0;
                     if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер SCTE35/ASSET [\${i}]\`);
                     shouldRemoveLine = true;
                } else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
                     if (isAdSection) {
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]. Завершение рекламной секции.\`);
                         isAdSection = false; isAdMarkerLine = true; shouldRemoveLine = true;
                    } else { if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}): Обнаружен #EXT-X-CUE-IN без активной рекламной секции [\${i}]\`); }
                }
                 if (isAdSection && !isAdMarkerLine) {
                    shouldRemoveLine = true;
                     if (trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                         discontinuityCountInAd++; if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY #${discontinuityCountInAd} внутри рекламной секции [\${i}]. Удаляем.\`);
                     } else if (trimmedLine.startsWith('#EXTINF:') || (trimmedLine.includes('.ts') && !trimmedLine.startsWith('#'))) {
                         if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем строку сегмента/inf из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                     } else { if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем прочую строку из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`); }
                 }
                if (shouldRemoveLine) { linesRemoved++; } else { cleanLines.push(line); }
            }
            const cleanedText = cleanLines.join('\\n');
             if (adsFound) {
                 if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружена реклама (Midroll: \${isMidrollAd}).\`);
                 try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e); }
             } else {
                 if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены или не распознаны текущей логикой. Плейлист не изменен.\`);
                 if (DEBUG_LOGGING_WORKER) { workerLogTrace(\`[\${context}] (\${urlShort}) Первые 5 строк полученного M3U8:\\n\${lines.slice(0, 5).join('\\n')}\`); }
             }
            return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
        }
        function installWorkerFetchHook() {
             if (typeof self.fetch !== 'function') { workerLogWarn("Fetch API недоступен в этом Worker'е. Перехват невозможен."); return false; }
             if (self.fetch.hooked_by_adblock) { workerLogInfo("Перехват Fetch в Worker'е уже был установлен ранее."); return true; }
             workerLogInfo("Попытка установки перехвата fetch в Worker'е..."); const workerRealFetch = self.fetch;
             self.fetch = async (input, init) => {
                 let requestUrl = ''; let method = 'GET'; if (input instanceof Request) { requestUrl = input.url; method = input.method; } else { requestUrl = String(input); } if (init && init.method) { method = init.method; } const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl; const isM3U8Request = requestUrl.includes('.m3u8'); const isUsherRequest = requestUrl.includes('usher.ttvnw.net'); const isSegmentRequest = requestUrl.includes('.ts'); const context = 'WorkerFetch';
                 if ((isM3U8Request || isUsherRequest) && method.toUpperCase() === 'GET') {
                     if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] Перехвачен GET запрос M3U8/Usher: \${urlShort}\`);
                     try {
                         const originalResponse = await workerRealFetch(input, init);
                          if (!originalResponse.ok) { if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status} \${originalResponse.statusText}). Пропускаем обработку.\`); return originalResponse; }
                         const clonedResponse = originalResponse.clone(); const contentType = clonedResponse.headers.get('Content-Type') || '';
                         if (contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('octet-stream')) {
                              if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: '\${contentType}'. Чтение и очистка...\`);
                              const m3u8Text = await clonedResponse.text(); if (!m3u8Text) { workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`); return originalResponse; }
                              const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl); const newHeaders = new Headers(originalResponse.headers); newHeaders.delete('Content-Length');
                              return new Response(cleaningResult.cleanedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                         } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: '\${contentType}'). Пропускаем.\`); return originalResponse; }
                     } catch (error) { workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error); return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" }); }
                 } else { if (DEBUG_LOGGING_WORKER && !isSegmentRequest) workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET запрос или не-GET запрос: (\${method}) \${urlShort}\`); return workerRealFetch(input, init); }
             };
             self.fetch.hooked_by_adblock = true; workerLogInfo("Перехват fetch в Worker'е УСПЕШНО установлен."); return true;
         }
        self.addEventListener('message', function(e) {
            if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
                workerLogInfo("Получено сообщение EVAL_ADBLOCK_CODE (запасной метод). Попытка выполнения...");
                try { eval(e.data.code); workerLogInfo("EVAL_ADBLOCK_CODE успешно выполнен.");
                    if (!self.fetch.hooked_by_adblock) { if (installWorkerFetchHook()) { try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval' }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY после eval:", e); } } else { workerLogError("Не удалось установить перехват fetch в Worker'е после eval!"); } } else { workerLogInfo("Перехват fetch уже был установлен, повторная установка не требуется."); }
                } catch (err) { workerLogError("Ошибка выполнения кода из EVAL_ADBLOCK_CODE:", err); }
            }
        });
        if (installWorkerFetchHook()) { try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY:", e); } } else { workerLogError("Не удалось установить перехват fetch в Worker'е при инициализации!"); }
        workerLogInfo("AdBlock Worker: Код внедрения успешно инициализирован.");
        // --- Worker AdBlock Code End ---
        `;
     } // end getWorkerInjectionCode

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК - fetch, XHR) (Без изменений) ---
    async function fetchOverride(input, init) { /* ... код из v18.1.1 ... */
        const context = 'MainFetch'; let requestUrl = ''; let method = 'GET'; if (input instanceof Request) { requestUrl = input.url; method = input.method; } else { requestUrl = String(input); } if (init && init.method) { method = init.method; } const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) { if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch (${method}) запроса к: ${requestUrl}`); return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by TTV AdBlock)" })); }
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) { logInfo(context, `Обнаружен потенциально рекламный Fetch запрос (${method}) (НЕ БЛОКИРОВАН): ${requestUrl}`); }
        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) { try { if (method.toUpperCase() === 'POST' && init && init.body) { let bodyData = init.body; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} } let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null); if (operationName) { logInfo(context, `GraphQL Fetch: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN} (до выполнения)`); } } else { logDebug(context, `GraphQL Fetch: Не удалось определить operationName`); } } else { logDebug(context, `GraphQL Fetch: Обнаружен GET или запрос без тела`); } } catch (e) { logWarn(context, 'Ошибка при логировании GraphQL Fetch:', e); } }
        try { const response = await originalFetch(input, init); return response; }
        catch (error) { if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) { logWarn(context, `Fetch к ${urlShort} не удался (возможно, заблокирован внешне): ${error.message}`); return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed (TTV AdBlock Passthrough)" })); } else { logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error); throw error; } }
     }
    const xhrRequestData = new WeakMap();
    function xhrOpenOverride(method, url, async, user, password) { /* ... код из v18.1.1 ... */
        const context = 'MainXHR'; const urlString = String(url); const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString; xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort, blocked: false });
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) { if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR (${method}) запроса к: ${urlString}`); xhrRequestData.get(this).blocked = true; }
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) { logInfo(context, `Обнаружен потенциально рекламный XHR запрос (${method}) (НЕ БЛОКИРОВАН): ${urlString}`); }
        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) { logInfo(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`); }
        try { return originalXhrOpen.call(this, method, url, async, user, password); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error); throw error; }
     }
    function xhrSendOverride(data) { /* ... код из v18.1.1 ... */
        const context = 'MainXHR'; const requestInfo = xhrRequestData.get(this); if (!requestInfo) { logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала."); try { return originalXhrSend.call(this, data); } catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;} } const { method, url, urlShort, blocked } = requestInfo;
        if (blocked) { this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false, lengthComputable: false })); try { this.abort(); } catch(e) { logWarn(context, `Не удалось вызвать abort() для заблокированного XHR к ${urlShort}: ${e.message}`); } return; }
        if (LOG_GQL_INTERCEPTION && url.includes('/gql')) { try { let bodyData = data; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} } let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null); if (operationName) { logInfo(context, `GraphQL XHR Send: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Отправка XHR запроса ${GQL_OPERATION_ACCESS_TOKEN}`); } } else { logDebug(context, `GraphQL XHR Send: Не удалось определить operationName`); } } catch(e) { logWarn(context, 'Ошибка при логировании GraphQL XHR Send:', e); } }
        try { return originalXhrSend.call(this, data); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.send для ${urlShort}:`, error); throw error; }
     }

    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER (Без изменений) ---
    function createObjectURLOverride_Sync(blob) { /* ... код из v18.1.1 ... */
        const context = 'ObjectURLSync'; const blobType = blob?.type || 'unknown'; const blobSize = blob?.size || 0;
        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker') || blobType === '')) {
            if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
            try { logDebug(context, "Синхронная модификация Blob невозможна. Возвращаем оригинальный URL. Логика внедрения сработает в hookWorkerConstructor."); return originalCreateObjectURL.call(unsafeWindow.URL, blob); }
            catch (error) { logError(context, 'Неожиданная ошибка при синхронной обработке Blob:', error); return originalCreateObjectURL.call(unsafeWindow.URL, blob); }
        } else { if (blob instanceof Blob) { logTrace(context, `Пропуск createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`); } else { logTrace(context, `Пропуск createObjectURL для не-Blob объекта.`); } return originalCreateObjectURL.call(unsafeWindow.URL, blob); }
     }
    function addWorkerMessageListeners(workerInstance, label) { /* ... код из v18.1.1 ... */
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return; workerInstance._listenersAddedByAdblock = true; const context = 'WorkerMsg';
        workerInstance.addEventListener('error', (e) => { logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e); });
        const adBlockListener = (e) => {
            const messageData = e.data;
            if (messageData?.type === 'ADBLOCK_WORKER_HOOKS_READY') { if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${messageData.method || 'unknown'}`); hookedWorkers.add(label); }
            else if (messageData?.type === 'ADBLOCK_ADS_REMOVED') { if (LOG_M3U8_CLEANING) logInfo('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${messageData.isMidroll}. URL: ${messageData.url}`); if (OPT_SHOW_AD_BANNER) { showAdBanner(messageData.isMidroll); } }
            else { if (DEBUG_LOGGING) logTrace(context, `Сообщение ОТ Worker'а (${label}):`, messageData); }
        };
        workerInstance.addEventListener('message', adBlockListener); workerInstance._adBlockListener = adBlockListener; logDebug(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
     }
    function hookWorkerConstructor() { /* ... код из v18.1.1 ... */
        if (!INJECT_INTO_WORKERS) { logWarn('WorkerHook', "Внедрение кода в Worker'ы отключено в настройках."); return; } if (unsafeWindow.Worker?.hooked_by_adblock) { logInfo('WorkerHook', "Конструктор Worker уже перехвачен."); return; } if (typeof unsafeWindow.Worker === 'undefined') { logError('WorkerHook', 'Конструктор Worker (unsafeWindow.Worker) не определен. Невозможно перехватить.'); return; } logDebug('WorkerHook', "Попытка перехвата конструктора Worker..."); workerHookAttempted = true; const OriginalWorkerClass = unsafeWindow.Worker;
        unsafeWindow.Worker = class HookedWorker extends OriginalWorkerClass {
            constructor(scriptURL, options) {
                let urlString = ''; let isBlobURL = false; let workerLabel = 'unknown'; let targetScriptURL = scriptURL;
                try { if (scriptURL instanceof URL) { urlString = scriptURL.href; isBlobURL = urlString.startsWith('blob:'); } else if (typeof scriptURL === 'string') { urlString = scriptURL; isBlobURL = urlString.startsWith('blob:'); } if (isBlobURL) { workerLabel = `blob:${urlString.substring(5, 35)}...`; } else if (urlString) { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); } else { workerLabel = `non-url-source (${typeof scriptURL})`; } if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : (urlString ? 'Script URL' : 'Unknown')}`); } catch (e) { logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL); workerLabel = 'error-determining-source'; }
                super(targetScriptURL, options); this._workerLabel = workerLabel; addWorkerMessageListeners(this, workerLabel);
                if (!isBlobURL && urlString && INJECT_INTO_WORKERS) { setTimeout(() => { if (!hookedWorkers.has(this._workerLabel)) { if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук createObjectURL не применился). Запасная попытка внедрения через postMessage...`); try { const injectionCode = getWorkerInjectionCode(); this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode }); } catch(e) { logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e); } } else { if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков (запасной механизм не требуется).`); } }, 500); } else if (isBlobURL && LOG_WORKER_INJECTION) { logDebug('WorkerHook', `Worker (${workerLabel}) создан из Blob URL, ожидаем подтверждения хуков...`); }
            }
        };
        Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass); Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype); unsafeWindow.Worker.hooked_by_adblock = true; logInfo('WorkerHook', "Конструктор Worker успешно перехвачен.");
     }

    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК) (Без изменений) ---
    function installHooks() { /* ... код из v18.1.1 ... */
        if (hooksInstalledMain) { logWarn('Hooks', "Попытка повторной установки хуков."); return; } logInfo('Hooks', "Установка перехватов в основном потоке...");
        try { unsafeWindow.fetch = fetchOverride; logDebug('Hooks', "Перехват Fetch API установлен."); } catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }
        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; logDebug('Hooks', "Перехваты XMLHttpRequest (open, send) установлены."); } catch (e) { logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; }
        if (INJECT_INTO_WORKERS) {
            try { unsafeWindow.URL.createObjectURL = createObjectURLOverride_Sync; logInfo('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН (Синхронный, без модификации Blob)."); } catch (e) { logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }
            try { hookWorkerConstructor(); } catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }
            try { unsafeWindow.URL.revokeObjectURL = function(url) { logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`); return originalRevokeObjectURL.call(unsafeWindow.URL, url); }; logDebug('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен."); } catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else { logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются."); }
        hooksInstalledMain = true; logInfo('Hooks', "Установка перехватов в основном потоке завершена.");
     }

    // --- **ФУНКЦИИ МОНИТОРИНГА И ПЕРЕЗАГРУЗКИ ПЛЕЕРА (ОПТИМИЗИРОВАНЫ)** ---

    function findVideoPlayer() { /* ... код из v18.1.1 ... */
        const selectors = [PLAYER_SELECTOR, '.video-player__container video', 'div[data-a-target="video-player"] video', 'div[data-a-target="video-player-layout"] video', '.persistent-player video'];
        for (const selector of selectors) { const element = document.querySelector(selector); if (element && element.tagName === 'VIDEO') { return element; } } return null;
     }

    function triggerReload(reason) { /* ... код из v18.1.1, но с улучшенным логированием ... */
        const context = 'PlayerReload'; const now = Date.now();
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) { logWarn(context, `Перезагрузка запрошена (${reason}), но кулдаун (${RELOAD_COOLDOWN_MS / 1000}с) еще активен. Отмена.`); return; }
        if (document.hidden) { logWarn(context, `Перезагрузка запрошена (${reason}), но вкладка неактивна. Отмена.`); return; }

        logWarn(context, `!!! ПЕРЕЗАГРУЗКА СТРАНИЦЫ !!! Причина: ${reason}.`);
        lastReloadTimestamp = now;
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); }
        catch (e) { logError(context, "Не удалось записать время перезагрузки в sessionStorage:", e); }
        unsafeWindow.location.reload();
    }

    function resetMonitorState(reason = '') { /* ... код из v18.1.1 ... */
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; logDebug('PlayerMonitor', 'Отменен запланированный reload.'); }
        lastVideoTimeUpdateTimestamp = Date.now();
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1; // Сбрасываем на текущее или -1
        isWaitingForDataTimestamp = 0;
     }

    function monitorPlayerState() {
        const context = 'PlayerMonitor';
        if (!videoElement || !document.body.contains(videoElement)) {
            setupPlayerMonitor(); return;
        }

        const now = Date.now();
        const isPlaying = !videoElement.paused && !videoElement.ended;
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        let stallReason = null; // Причина возможного зависания

        // 1. **ОПТИМИЗИРОВАННАЯ Проверка на зависание (currentTime не растет ИЛИ readyState низкий)**
        if (isPlaying && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;

            // Условие 1: Время не продвинулось (или откатилось)
            if (currentTime <= lastKnownVideoTime) {
                if (timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                    stallReason = `currentTime (${currentTime.toFixed(2)}) не обновлялся > ${RELOAD_STALL_THRESHOLD_MS / 1000}с`;
                }
            }
            // Условие 2: Время могло немного продвинуться, но readyState недостаточный для игры
            // Используем HAVE_CURRENT_DATA, так как даже если есть текущий кадр, но нет будущих, это проблема
            else if (readyState < videoElement.HAVE_CURRENT_DATA) {
                 if (timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                    stallReason = `readyState (${readyState}) < HAVE_CURRENT_DATA в течение ${RELOAD_STALL_THRESHOLD_MS / 1000}с`;
                 }
            }
            // Условие 3: Время обновляется, readyState в порядке - сбрасываем таймстемп
            else if (currentTime > lastKnownVideoTime) {
                 // logTrace(context, `Время видео обновилось: ${lastKnownVideoTime.toFixed(2)} -> ${currentTime.toFixed(2)}, readyState: ${readyState}`);
                 lastKnownVideoTime = currentTime;
                 lastVideoTimeUpdateTimestamp = now;
                 // Отменяем запланированную перезагрузку, если она была по причине зависания
                 if (reloadTimeoutId) {
                    logInfo(context, "Воспроизведение возобновилось (timeupdate/readyState OK). Отмена перезагрузки.");
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                 }
                 // Если время идет и readyState > 0, сбрасываем и таймер буферизации
                 if (isWaitingForDataTimestamp > 0 && readyState > 0) {
                     // logDebug(context, "Сброс таймера буферизации из-за timeupdate.");
                     isWaitingForDataTimestamp = 0;
                 }
            }

            // Если обнаружили зависание по одной из причин
            if (stallReason) {
                logWarn(context, `Обнаружено зависание плеера! Причина: ${stallReason}.`);
                if (!reloadTimeoutId) {
                    logWarn(context, `Планируем перезагрузку через 5 секунд (причина: ${stallReason})...`);
                    reloadTimeoutId = setTimeout(() => triggerReload(stallReason), 5000);
                }
                return; // Выходим, чтобы не сбросить таймер буферизации ниже
            }
        } // End stall check

        // 2. Проверка на длительную буферизацию (флаг 'waiting' установлен ИЛИ readyState = 0)
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            if (now - isWaitingForDataTimestamp > RELOAD_BUFFERING_THRESHOLD_MS) {
                const bufferReason = `Буферизация/Ожидание данных > ${RELOAD_BUFFERING_THRESHOLD_MS / 1000}с (readyState: ${readyState})`;
                logWarn(context, `Обнаружена длительная буферизация! ${bufferReason}`);
                 if (!reloadTimeoutId) {
                     logWarn(context, `Планируем перезагрузку через 5 секунд (причина: ${bufferReason})...`);
                     reloadTimeoutId = setTimeout(() => triggerReload(bufferReason), 5000);
                 }
                 return; // Выходим
            }
        }

        // Если плеер играет и readyState достаточный, сбрасываем таймер ожидания
        if (isPlaying && isWaitingForDataTimestamp > 0 && readyState >= videoElement.HAVE_FUTURE_DATA) {
            // logDebug(context, "Буферизация завершилась (readyState >= HAVE_FUTURE_DATA).");
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId) {
                 logInfo(context, "Воспроизведение возобновилось после буферизации. Отмена перезагрузки.");
                 clearTimeout(reloadTimeoutId);
                 reloadTimeoutId = null;
            }
        }

    } // end monitorPlayerState

    function setupPlayerMonitor() { /* ... почти без изменений, только логирование порогов ... */
        if (!ENABLE_AUTO_RELOAD) {
            logInfo('PlayerMonitor', 'Авто-перезагрузка отключена в настройках.');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) {
                videoElement.removeEventListener('error', handlePlayerError); videoElement.removeEventListener('waiting', handlePlayerWaiting); videoElement.removeEventListener('playing', handlePlayerPlaying); videoElement.removeEventListener('pause', handlePlayerPause); videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
                videoElement = null;
            }
            return;
        }
        const context = 'PlayerMonitorSetup'; const currentVideoElement = findVideoPlayer();
        if (currentVideoElement === videoElement && playerMonitorIntervalId) { return; }
        if (playerMonitorIntervalId) { logInfo(context, 'Остановка предыдущего монитора плеера.'); clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
        if (videoElement) {
            videoElement.removeEventListener('error', handlePlayerError); videoElement.removeEventListener('waiting', handlePlayerWaiting); videoElement.removeEventListener('playing', handlePlayerPlaying); videoElement.removeEventListener('pause', handlePlayerPause); videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
            logDebug(context, 'Старые слушатели событий плеера удалены.');
        }
        videoElement = currentVideoElement;
        if (!videoElement) { logDebug(context, 'Видеоэлемент не найден. Повторная попытка через 3 секунды.'); setTimeout(setupPlayerMonitor, 3000); return; }
        logInfo(context, 'Видеоэлемент найден. Установка слушателей событий и запуск мониторинга...');
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const timeSinceLastReload = Date.now() - parseInt(sessionReloadTime, 10);
                if (timeSinceLastReload < RELOAD_COOLDOWN_MS) {
                    logWarn(context, `Обнаружена недавняя перезагрузка (${(timeSinceLastReload / 1000).toFixed(1)}с назад). Устанавливаем кулдаун.`);
                    lastReloadTimestamp = Date.now() - timeSinceLastReload + RELOAD_COOLDOWN_MS;
                }
                sessionStorage.removeItem('ttv_adblock_last_reload');
            }
        } catch (e) { logError(context, "Ошибка чтения времени перезагрузки из sessionStorage:", e); }

        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true });
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true });
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });
        videoElement.addEventListener('timeupdate', handlePlayerTimeUpdate, { passive: true });

        resetMonitorState('Initial setup');
        playerMonitorIntervalId = setInterval(monitorPlayerState, 2000);

        // **Улучшенный лог с текущими порогами**
        logInfo(context, `Мониторинг плеера запущен (Интервал: 2000мс, Порог зависания/readyState: ${RELOAD_STALL_THRESHOLD_MS}мс, Порог буферизации: ${RELOAD_BUFFERING_THRESHOLD_MS}мс).`);
    } // end setupPlayerMonitor

    // --- **ОБРАБОТЧИКИ СОБЫТИЙ ПЛЕЕРА (waiting оптимизирован)** ---

    function handlePlayerError(event) { /* ... код из v18.1.1 ... */
        const context = 'PlayerEvent:Error';
        if (!videoElement || !videoElement.error) { logWarn(context, 'Событие ошибки получено, но объект ошибки отсутствует.'); return; }
        const error = videoElement.error; logError(context, `Ошибка плеера! Код: ${error.code}, Сообщение: "${error.message}"`);
        if (RELOAD_ON_ERROR_CODES.includes(error.code)) {
            const errorReason = `Ошибка плеера (код ${error.code})`;
            logWarn(context, `Ошибка (код ${error.code}) требует перезагрузки.`);
             if (!reloadTimeoutId) {
                 logWarn(context, `Планируем перезагрузку через 3 секунды (причина: ${errorReason})...`);
                 reloadTimeoutId = setTimeout(() => triggerReload(errorReason), 3000);
             }
        } else { logWarn(context, `Ошибка (код ${error.code}) не входит в список для перезагрузки (${RELOAD_ON_ERROR_CODES.join(',')}).`); }
     }

    function handlePlayerWaiting() {
        const context = 'PlayerEvent:Waiting';
        // **ОПТИМИЗАЦИЯ:** Запускаем таймер, только если readyState действительно низкий
        if (videoElement && videoElement.readyState < videoElement.HAVE_FUTURE_DATA && isWaitingForDataTimestamp === 0) {
            logDebug(context, `Плеер начал буферизацию/ожидание (readyState: ${videoElement.readyState}). Запуск таймера.`);
            isWaitingForDataTimestamp = Date.now();
        } else if (isWaitingForDataTimestamp === 0) {
             logTrace(context, `Событие 'waiting', но readyState (${videoElement?.readyState}) достаточный или таймер уже запущен. Игнорируем.`);
        }
    }

    function handlePlayerPlaying() { /* ... код из v18.1.1 ... */
        logDebug('PlayerEvent:Playing', 'Воспроизведение началось/возобновилось.');
        resetMonitorState('Playing event');
     }

    function handlePlayerPause() { /* ... код из v18.1.1 ... */
        logDebug('PlayerEvent:Pause', 'Воспроизведение приостановлено.');
        resetMonitorState('Pause event');
     }

    function handlePlayerTimeUpdate() {
        // Эта функция теперь менее важна для сброса состояния, т.к. основная логика в monitorPlayerState
        if (videoElement) {
            const currentTime = videoElement.currentTime;
             if (currentTime > lastKnownVideoTime) { // Обновляем только при реальном продвижении
                 // logTrace('PlayerEvent:TimeUpdate', `Время обновлено: ${currentTime.toFixed(2)}`);
                 lastKnownVideoTime = currentTime;
                 // lastVideoTimeUpdateTimestamp обновляется в monitorPlayerState при проверке
             }
        }
    }

    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА (Без изменений) ---
    logInfo('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);
    if (OPT_SHOW_AD_BANNER) { try { GM_addStyle(`.tch-adblock-banner { position: absolute; top: 10px; left: 10px; z-index: 2000; pointer-events: none; display: none; color: white; background-color: rgba(0, 0, 0, 0.8); padding: 6px 12px; font-size: 13px; border-radius: 5px; font-family: Roobert, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); text-align: center; opacity: 0; transition: opacity 0.5s ease-in-out; }`); logInfo('Init', "Стили для баннера добавлены."); } catch (e) { logError('Init', "Не удалось добавить стили для баннера:", e); } }
    installHooks();
    setQualitySettings();
    try { document.addEventListener('visibilitychange', () => { if (!document.hidden) { logInfo('QualityV2Enhanced', "Вкладка стала видимой. Повторная установка качества 'Источник'."); setQualitySettings(); if (ENABLE_AUTO_RELOAD) { logDebug('PlayerMonitor', 'Перезапуск монитора плеера из-за visibilitychange.'); setupPlayerMonitor(); } } else { if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) { logDebug('PlayerMonitor', 'Вкладка скрыта. Остановка монитора плеера.'); clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; } } }, { passive: true }); logInfo('Init', "Слушатель 'visibilitychange' для качества установлен."); } catch (e) { logError('Init', "Не удалось добавить слушатель 'visibilitychange':", e); }
    try { const handleStateChange = () => { setTimeout(() => { logInfo('QualityV2Enhanced', "Обнаружено изменение состояния навигации (pushState/replaceState/popstate). Повторная установка качества 'Источник'."); setQualitySettings(); if (ENABLE_AUTO_RELOAD) { logDebug('PlayerMonitor', 'Перезапуск монитора плеера из-за изменения истории навигации.'); setupPlayerMonitor(); } }, 500); }; const originalPushState = history.pushState; history.pushState = function(...args) { originalPushState.apply(this, args); handleStateChange(); }; const originalReplaceState = history.replaceState; history.replaceState = function(...args) { originalReplaceState.apply(this, args); handleStateChange(); }; unsafeWindow.addEventListener('popstate', handleStateChange, { passive: true }); logInfo('Init', "Слушатели 'pushState', 'replaceState', 'popstate' для качества установлены."); } catch (e) { logError('Init', "Не удалось добавить слушатели истории навигации:", e); }
     if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) { if (qualitySetIntervalId) { clearInterval(qualitySetIntervalId); qualitySetIntervalId = null; } qualitySetIntervalId = setInterval(() => { logDebug('QualityV2Enhanced', `Периодическая проверка качества (интервал: ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс).`); setQualitySettings(); }, PERIODIC_QUALITY_CHECK_INTERVAL_MS); logInfo('Init', `Периодическая проверка качества 'Источник' запущена с интервалом ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс.`); } else { logInfo('Init', `Периодическая проверка качества отключена или интервал некорректен.`); }
    function onDomReady() { logInfo('Init', "DOM готов (DOMContentLoaded)."); setupPlayerMonitor(); }
    if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', onDomReady, { once: true }); } else { onDomReady(); }
    logInfo('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);

})();