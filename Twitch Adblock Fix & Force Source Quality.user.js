// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource
// @version      18.0.0
// @description  Блокировка рекламы Twitch через Worker + Установка качества "Источник"
// @author       AI Generated & Adapted by ShmidtS
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

    // --- НАСТРОЙКИ (Конфигурируемые через GM_setValue) ---
    const SCRIPT_VERSION = '18.0.3'; // Увеличена версия
    const SHOW_ERRORS = true; // Показывать ошибки в консоли
    // Настройки, необходимые для передачи в Worker из версии 18.0.0
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false); // Отладочное логирование (влияет на Worker)
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true); // Логирование очистки M3U8 (влияет на Worker)
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', false); // Логирование блокировки сети (основной поток, отключено)
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false); // Логирование GQL (основной поток, отключено)
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true); // Логирование процесса внедрения в Worker
    // Основные настройки функционала
    const OPT_SHOW_AD_BANNER = GM_getValue('TTV_AdBlock_ShowBanner', true); // Показывать баннер при блокировке рекламы
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true); // Пытаться внедрить код AdBlock в Web Workers
    const ENABLE_PERIODIC_QUALITY_CHECK = GM_getValue('TTV_AdBlock_PeriodicQualityCheck', true); // Включить периодическую проверку качества
    const PERIODIC_QUALITY_CHECK_INTERVAL_MS = GM_getValue('TTV_AdBlock_QualityCheckInterval', 7500); // Интервал проверки (мс)

    // --- КОНСТАНТЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality'; // Ключ для localStorage
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken'; // Имя GraphQL операции для токена доступа

    const AD_SIGNIFIER_DATERANGE = 'stitched-ad'; // Сигнатура рекламы в DATERANGE
    // Сигнатуры/теги рекламы в M3U8
    const AD_SIGNIFIERS_TAGS = ['#EXT-X-DATERANGE', '#EXT-X-DISCONTINUITY', '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', '#EXT-X-SCTE35', '#EXT-X-ASSET'];
    // URL-ключевые слова для безусловной блокировки запросов
    const AD_URL_KEYWORDS_BLOCK = ['amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com', 'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag', 'ttvl-o.cloudfront.net', 'd2v02itv0y9u9t.cloudfront.net', 'fastly.net/ad'];
    // URL-ключевые слова для предупреждения
    const AD_URL_KEYWORDS_WARN = ['player-ad-', 'isp-signal', 'adlanding', 'adurl', 'adserver'];

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    var adBannerElement = null; // Элемент для баннера
    var hooksInstalledMain = false; // Флаг установки хуков в основном потоке
    var workerHookAttempted = false; // Флаг попытки перехвата конструктора Worker
    var hookedWorkers = new Set(); // Множество успешно перехваченных Worker'ов
    var qualitySetIntervalId = null; // ID для таймера периодической проверки качества

    // --- Оригинальные функции ---
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;

    // --- ЛОГИРОВАНИЕ (Только Info, Warn, Error) ---
    function logError(source, message, ...args) { if (SHOW_ERRORS) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logInfo(source, message, ...args) { console.info(`${LOG_PREFIX} [${source}] INFO:`, message, ...args); }
    // logDebug и logTrace удалены

    logInfo('MAIN', `Скрипт запускается. Версия: ${SCRIPT_VERSION}. Adblock Logic: 18.0.0. Worker Inject: ${INJECT_INTO_WORKERS}. Periodic Quality Check: ${ENABLE_PERIODIC_QUALITY_CHECK} (${PERIODIC_QUALITY_CHECK_INTERVAL_MS}ms).`);

    // --- УПРАВЛЕНИЕ БАННЕРОМ ---
    function getAdDiv() {
        // logTrace("Banner", "getAdDiv вызвана");
        if (!OPT_SHOW_AD_BANNER) return null;
        if (adBannerElement && document.body.contains(adBannerElement)) { return adBannerElement; }
        adBannerElement = document.querySelector('.tch-adblock-banner');
        if (adBannerElement) { /* logDebug("Banner", "Найден существующий баннер."); */ return adBannerElement; }
        try {
            const playerRootDiv = document.querySelector('.video-player__container') || document.querySelector('.video-player .persistent-player') || document.querySelector('div[data-a-target="video-player-layout"]') || document.querySelector('div[data-a-target="video-player"]') || document.querySelector('.video-player') || document.body;
            if (!playerRootDiv || !(playerRootDiv instanceof Node)) { logWarn("Banner", "Не удалось найти валидный контейнер плеера для баннера."); return null; }
            const div = document.createElement('div');
            div.className = 'tch-adblock-banner';
            const currentPosition = window.getComputedStyle(playerRootDiv).position;
            if (currentPosition === 'static') {
                playerRootDiv.style.position = 'relative';
                /* logDebug("Banner", "Установлено 'position: relative' для контейнера плеера."); */
            }
            playerRootDiv.appendChild(div);
            adBannerElement = div;
            logInfo("Banner", "Баннер успешно создан и добавлен.");
            return adBannerElement;
        } catch (e) { logError("Banner", "Ошибка создания баннера:", e); adBannerElement = null; return null; }
    }
    function showAdBanner(isMidroll) {
        // logTrace("Banner", `showAdBanner вызвана. isMidroll: ${isMidroll}`);
        if (!OPT_SHOW_AD_BANNER) return;
        const adDiv = getAdDiv();
        if (adDiv) {
            requestAnimationFrame(() => {
                try {
                    const bannerText = `Реклама удалена v${SCRIPT_VERSION.substring(0, 6)}` + (isMidroll ? ' (midroll)' : '');
                    adDiv.textContent = bannerText;
                    adDiv.style.display = 'block';
                    adDiv.style.opacity = '1';
                    logInfo("Banner", "Баннер показан. Текст:", bannerText);
                    let fadeOutTimeout = setTimeout(() => {
                        if (adDiv) {
                            adDiv.style.opacity = '0';
                            let hideTimeout = setTimeout(() => { if (adDiv) adDiv.style.display = 'none'; }, 600);
                             adDiv._hideTimeout = hideTimeout;
                        }
                    }, 5000);
                    adDiv._fadeOutTimeout = fadeOutTimeout;
                } catch(e) { logError("Banner", "Ошибка отображения баннера:", e); /* Не сбрасываем adBannerElement */ }
            });
        } else { logWarn("Banner", "Не удалось получить/создать баннер для показа."); }
    }

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА ---
    function setQualitySettings() {
        const context = 'QualityV2Enhanced';
        try {
            const currentValue = unsafeWindow.localStorage.getItem(LS_KEY_QUALITY);
            const targetValue = '{"default":"chunked"}';
            if (currentValue !== targetValue) {
                unsafeWindow.localStorage.setItem(LS_KEY_QUALITY, targetValue);
                logInfo(context, `Установлено качество 'Источник' через localStorage.`);
            }
        } catch (e) {
            logError(context, 'Ошибка установки настроек качества в localStorage:', e);
        }
    }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER ---
    function getWorkerInjectionCode() {
        // Передаем флаги, необходимые для логики Worker'а
        return `
        // --- Worker AdBlock Code Start (v${SCRIPT_VERSION} based on 18.0.0 logic) ---
        const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
        const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING}; // Управляется из главного скрипта
        const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING}; // Управляется из главного скрипта
        const AD_SIGNIFIER_DATERANGE_WORKER = '${AD_SIGNIFIER_DATERANGE}';
        const AD_SIGNIFIERS_TAGS_WORKER = ${JSON.stringify(AD_SIGNIFIERS_TAGS)};

        const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';
        // Функции логирования, используемые в Worker'е
        function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
        function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
        function workerLogInfo(message, ...args) { console.info(LOG_PREFIX_WORKER_BASE + ' INFO:', message, ...args); }
        function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
        function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }

        // Функция парсинга M3U8
        function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
            const context = 'WorkerM3U8Parse';
            const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
            if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] Запуск очистки для: \${urlShort}\`);
            if (!m3u8Text || typeof m3u8Text !== 'string') { workerLogWarn(\`[\${context}] (\${urlShort}): Получен невалидный или пустой текст M3U8.\`); return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false }; }
            const lines = m3u8Text.split(/[\\r\\n]+/);
            if (lines.length < 2) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): M3U8 слишком короткий (\${lines.length} строк), пропускаем.\`); return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false }; }
            const cleanLines = []; let isAdSection = false; let adsFound = false; let linesRemoved = 0; let isMidrollAd = false; let discontinuitySequence = -1;
            if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обработка \${lines.length} строк...\`);
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i]; let trimmedLine = line.trim();
                if (!trimmedLine) { cleanLines.push(line); continue; }
                let isAdMarker = false;
                if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && trimmedLine.includes(AD_SIGNIFIER_DATERANGE_WORKER)) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы [\${i}]\`); isAdSection = true; isAdMarker = true; adsFound = true; if (trimmedLine.includes('MIDROLL')) isMidrollAd = true; }
                else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер начала/ассета \${trimmedLine.split(':')[0]} [\${i}]\`); isAdSection = true; isAdMarker = true; adsFound = true; if (trimmedLine.includes('MIDROLL')) isMidrollAd = true; }
                else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]\`); isAdSection = false; isAdMarker = true; adsFound = true; }
                 else if (isAdSection && trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY внутри рекламной секции [\${i}]\`); isAdMarker = true; adsFound = true; discontinuitySequence++; }
                if (isAdMarker) { linesRemoved++; if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удален рекламный маркер [\${i}]: \${trimmedLine.substring(0, 100)}\`); continue; }
                if (isAdSection) {
                     if (trimmedLine.startsWith('#EXTINF:') || (trimmedLine.includes('.ts') && !trimmedLine.startsWith('#'))) {
                          linesRemoved++; if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удалена строка (вероятно, сегмент/inf) из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`); continue;
                     } else {
                         if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Оставляем НЕ-сегментную строку внутри рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                     }
                }
                 cleanLines.push(line);
            }
            const cleanedText = cleanLines.join('\\n');
            if (adsFound) {
                // Оставляем info лог при очистке, если LOG_M3U8_CLEANING_WORKER включен
                if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружен Midroll: \${isMidrollAd}.\`);
                try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e); }
            } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены. Плейлист не изменен.\`); }
             return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
        }

        // Функция установки хука fetch в Worker'е
        function installWorkerFetchHook() {
            if (typeof self.fetch !== 'function') { workerLogWarn("Fetch API недоступен в этом Worker'е. Перехват невозможен."); return false; }
            if (self.fetch.hooked_by_adblock) { workerLogInfo("Перехват Fetch в Worker'е уже был установлен ранее."); return true; }
            workerLogInfo("Попытка установки перехвата fetch в Worker'е...");
            const workerRealFetch = self.fetch;
            self.fetch = async (input, init) => {
                let requestUrl = ''; let method = 'GET';
                if (input instanceof Request) { requestUrl = input.url; method = input.method; } else { requestUrl = String(input); }
                if (init && init.method) { method = init.method; }
                const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
                const isM3U8Request = requestUrl.includes('.m3u8'); const isUsherRequest = requestUrl.includes('usher.ttvnw.net'); const isSegmentRequest = requestUrl.includes('.ts');
                const context = 'WorkerFetch';
                if ((isM3U8Request || isUsherRequest) && method.toUpperCase() === 'GET') {
                    // Логируем только если включен LOG_M3U8_CLEANING_WORKER (как в 18.0.0)
                    if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] Перехвачен GET запрос M3U8/Usher: \${urlShort}\`);
                    try {
                        const originalResponse = await workerRealFetch(input, init);
                        if (!originalResponse.ok) {
                             if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status}). Пропускаем.\`);
                             return originalResponse;
                         }
                        const clonedResponse = originalResponse.clone(); const contentType = clonedResponse.headers.get('Content-Type');
                        if (contentType && (contentType.includes('mpegurl') || contentType.includes('octet-stream') || contentType.includes('application/vnd.apple.mpegurl'))) {
                             if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: \${contentType}. Чтение и очистка...\`);
                             const m3u8Text = await clonedResponse.text();
                             if (!m3u8Text) { workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`); return originalResponse; }
                             const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);
                             const newHeaders = new Headers(originalResponse.headers);
                             newHeaders.delete('Content-Length');
                             newHeaders.delete('ETag');
                             return new Response(cleaningResult.cleanedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                        } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: \${contentType}). Пропускаем.\`); return originalResponse; }
                    } catch (error) { workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error); return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" }); }
                } else { if (DEBUG_LOGGING_WORKER && !isSegmentRequest) workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET запрос: (\${method}) \${urlShort}\`); return workerRealFetch(input, init); }
            };
            self.fetch.hooked_by_adblock = true;
            workerLogInfo("Перехват fetch в Worker'е УСПЕШНО установлен.");
            return true;
        }

        // Слушатель сообщений и запасной механизм EVAL
        self.addEventListener('message', function(e) {
            if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
                workerLogInfo("Получено сообщение EVAL_ADBLOCK_CODE (запасной метод). Попытка выполнения...");
                try {
                    eval(e.data.code);
                    workerLogInfo("EVAL_ADBLOCK_CODE успешно выполнен.");
                    if (!self.fetch.hooked_by_adblock) {
                        if (installWorkerFetchHook()) {
                             try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval' }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY после eval:", e); }
                        } else { workerLogError("Не удалось установить перехват fetch в Worker'е после eval!"); }
                    } else {
                         workerLogInfo("Перехват fetch уже был установлен, повторная установка не требуется.");
                    }
                } catch (err) {
                    workerLogError("Ошибка выполнения кода из EVAL_ADBLOCK_CODE:", err);
                }
            }
        });

        // Первичная установка хука при инициализации
        if (installWorkerFetchHook()) {
            try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY:", e); }
        } else { workerLogError("Не удалось установить перехват fetch в Worker'е при инициализации!"); }
        workerLogInfo("AdBlock Worker: Код внедрения успешно инициализирован.");
        // --- Worker AdBlock Code End ---
        `;
    }

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК -) ---
    async function fetchOverride(input, init) {
        const context = 'MainFetch'; let requestUrl = ''; let method = 'GET';
        if (input instanceof Request) { requestUrl = input.url; method = input.method; } else { requestUrl = String(input); }
        if (init && init.method) { method = init.method; }
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
        // Блокировка по ключевым словам
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) {
             if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch запроса к: ${urlShort}`); // Логируем если включено
             return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by AdBlock)" }));
        }
        // Предупреждение о потенциально рекламных
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) {
            logInfo(context, `Обнаружен потенциально рекламный Fetch запрос (НЕ БЛОКИРОВАН): ${urlShort}`); // Используем logInfo вместо Debug
        }
        // Логирование GQL (если включено)
        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
            try {
                if (method.toUpperCase() === 'POST' && init && init.body) {
                    let bodyData = init.body; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
                    let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                     if (operationName) { logInfo(context, `GraphQL Fetch: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN} (до выполнения)`); } }
                }
            } catch (e) { logWarn(context, 'Ошибка при логировании GraphQL Fetch:', e); }
        }
        // Вызов оригинального fetch
        try {
             const response = await originalFetch(input, init);
             // Здесь нет логирования ответа GQL
             return response;
        } catch (error) {
             // Обработка ошибок
             if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) {
                  logWarn(context, `Fetch к ${urlShort} не удался (возможно, заблокирован): ${error.message}`);
                  return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed" })); // Возвращаем пустой ответ
             } else {
                  logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error);
                  throw error;
             }
        }
    }
    const xhrRequestData = new WeakMap();
    function xhrOpenOverride(method, url, async, user, password) {
        const context = 'MainXHR'; const urlString = String(url); const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString;
        xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort });
        // Установка флага блокировки
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR запроса к: ${urlShort}`); // Логируем если включено
            xhrRequestData.get(this).blocked = true;
            // Не вызываем return здесь,
        }
        // Предупреждение
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) {
             logInfo(context, `Обнаружен потенциально рекламный XHR запрос (НЕ БЛОКИРОВАН): ${urlShort}`); // Используем logInfo
        }
        // Логирование GQL
        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) { logInfo(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`); }
        try { return originalXhrOpen.call(this, method, url, async, user, password); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error); throw error; }
    }
    function xhrSendOverride(data) {
        const context = 'MainXHR'; const requestInfo = xhrRequestData.get(this);
        if (!requestInfo) { logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала."); try { return originalXhrSend.call(this, data); } catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;} }
        const { method, url, urlShort, blocked } = requestInfo;
        // Блокировка запроса
        if (blocked) {
            // logWarn(context, `Завершение заблокированного XHR запроса к: ${urlShort}`); // Уже залогировано в open
            this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false })); // Имитируем ошибку
             try { this.abort(); } catch(e) { /* Игнорируем ошибку abort */ }
            return;
         }
         // Логирование GQL
         if (LOG_GQL_INTERCEPTION && url.includes('/gql')) {
             try {
                 let bodyData = data; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) { } }
                 let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                 if (operationName) { logInfo(context, `GraphQL XHR Send: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Отправка XHR запроса ${GQL_OPERATION_ACCESS_TOKEN}`); } }
             } catch(e) { logWarn(context, 'Ошибка при логировании GraphQL XHR Send:', e); }
         }
         // Вызов оригинального send
        try { return originalXhrSend.call(this, data); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.send для ${urlShort}:`, error); throw error; }
    }

    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER ---
    function createObjectURLOverride(blob) {
        const context = 'ObjectURL'; const blobType = blob?.type || 'unknown'; const blobSize = blob?.size || 0;
        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker'))) {
            if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: ${blobType}, размер: ${blobSize}`);
            const readerPromise = new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target.result); reader.onerror = (e) => reject(new Error("FileReader error: " + e.target.error)); reader.readAsText(blob); });
            // Возвращаем Promise
            return (async () => {
                try {
                    const originalCode = await readerPromise;
                    // Проверка на целевой Worker
                    const isLikelyVideoWorker = originalCode.includes('getVideoSegment') || originalCode.includes('wasmWorker') || originalCode.includes('hlsManifestService') || (originalCode.includes('fetch') && originalCode.includes('postMessage') && originalCode.length > 10000);
                    if (isLikelyVideoWorker) {
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob ПОХОЖ на целевой Worker (${blobSize} bytes). Попытка внедрения кода...`);
                        const injectionCode = getWorkerInjectionCode();
                        const modifiedCode = injectionCode + '\\n\\n// --- Original Worker Code Below ---\\n' + originalCode;
                        const newBlob = new Blob([modifiedCode], { type: blobType });
                        const newUrl = originalCreateObjectURL.call(unsafeWindow.URL, newBlob);
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob успешно модифицирован и создан НОВЫЙ URL: ${newUrl.substring(0, 60)}... (Новый размер: ${newBlob.size})`);
                        return newUrl; // Возвращаем Promise<string>
                    } else {
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob НЕ похож на целевой Worker (маркеры не найдены или размер мал: ${blobSize} bytes). Возврат оригинального URL.`); // Используем logInfo вместо Debug
                        return originalCreateObjectURL.call(unsafeWindow.URL, blob); // Возвращаем Promise<string>
                    }
                } catch (error) {
                    logError(context, '[Async] Ошибка чтения/модификации Blob:', error);
                    return originalCreateObjectURL.call(unsafeWindow.URL, blob); // Возвращаем Promise<string>
                }
            })(); // Возвращаем Promise
        } else {
            // Синхронный вызов для нецелевых объектов
             if (blob instanceof Blob) { /* logTrace('ObjectURL', `Пропуск createObjectURL для Blob типа: ${blobType}, размер: ${blobSize}`); */ } // Логирование удалено
             else { /* logTrace('ObjectURL', `Пропуск createObjectURL для не-Blob объекта:`, blob); */ } // Логирование удалено
            return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        }
    }
    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
         workerInstance._listenersAddedByAdblock = true; const context = 'WorkerMsg';
         // Логирование сообщений и ошибок
         // if (DEBUG_LOGGING) { workerInstance.addEventListener('message', (e) => { logTrace(context, `Сообщение ОТ Worker'а (${label}):`, e.data); }); }
         workerInstance.addEventListener('error', (e) => { logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e); });
         // Слушатель для сообщений от AdBlock кода в Worker'е
         const adBlockListener = (e) => {
             if (e.data?.type === 'ADBLOCK_WORKER_HOOKS_READY') { if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${e.data.method || 'unknown'}`); hookedWorkers.add(label); }
             else if (e.data?.type === 'ADBLOCK_ADS_REMOVED') { if (LOG_M3U8_CLEANING) logInfo('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${e.data.isMidroll}.`); if (OPT_SHOW_AD_BANNER) { showAdBanner(e.data.isMidroll); } } // Убрал URL из лога M3U8
         };
         workerInstance.addEventListener('message', adBlockListener); workerInstance._adBlockListener = adBlockListener;
         // logDebug(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
    }
    function hookWorkerConstructor() {
        if (!INJECT_INTO_WORKERS) { logWarn('WorkerHook', "Внедрение кода в Worker'ы отключено в настройках."); return; }
        if (unsafeWindow.Worker?.hooked_by_adblock) { /* logWarn('WorkerHook', "Повторная попытка перехвата конструктора Worker (уже перехвачен?)."); */ return; } // Тихая проверка флага
        if (typeof unsafeWindow.Worker === 'undefined') { logError('WorkerHook', 'Конструктор Worker (unsafeWindow.Worker) не определен. Невозможно перехватить.'); return; }
        // logDebug('WorkerHook', "Попытка перехвата конструктора Worker...");
        workerHookAttempted = true; // Оставляем флаг на всякий случай
        const OriginalWorkerClass = unsafeWindow.Worker;
        unsafeWindow.Worker = class HookedWorker extends OriginalWorkerClass {
            constructor(scriptURL, options) {
                let urlString = ''; let isBlobURL = false; let workerLabel = 'unknown'; let targetScriptURL = scriptURL;
                try {
                     if (scriptURL instanceof URL) { urlString = scriptURL.href; if (scriptURL.protocol === 'blob:') { isBlobURL = true; workerLabel = `blob:${urlString.substring(5, 30)}...`; } else { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); } }
                     else if (typeof scriptURL === 'string') { urlString = scriptURL; if (urlString.startsWith('blob:')) { isBlobURL = true; workerLabel = `blob:${urlString.substring(5, 30)}...`; } else { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); } }
                     else { workerLabel = `non-url-source (${typeof scriptURL})`; }
                     if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : 'Script URL'}`); // Сохраняем Info лог
                } catch (e) { logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL); workerLabel = 'error-determining-source'; }

                // --- ВАЖНО: Вызов super() перед добавлением слушателей, ---
                 super(targetScriptURL, options); // Используем оригинальный URL

                 this._workerLabel = workerLabel;
                 addWorkerMessageListeners(this, workerLabel); // Добавляем слушателей к созданному инстансу

                // Запасной механизм для не-Blob воркеров
                if (!isBlobURL && INJECT_INTO_WORKERS) {
                     setTimeout(() => {
                        if (!hookedWorkers.has(this._workerLabel)) {
                             if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук createObjectURL не сработал). Запасная попытка внедрения через postMessage...`);
                             try {
                                 const injectionCode = getWorkerInjectionCode();
                                 // if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `[Async] Отправка EVAL_ADBLOCK_CODE Worker'у (${this._workerLabel}).`);
                                 this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode });
                             } catch(e) { logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e); }
                        } /* else { if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков...`); } */
                    }, 350);
                } /* else if (isBlobURL && LOG_WORKER_INJECTION) { logDebug('WorkerHook', `Worker (${workerLabel}) создан из Blob URL...`); } */
            }
        };
         Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass);
         Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype);
         unsafeWindow.Worker.hooked_by_adblock = true; // Ставим флаг
         logInfo('WorkerHook', "Конструктор Worker успешно перехвачен.");
    }

    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК - вызываем функции) ---
    function installHooks() {
        if (hooksInstalledMain) { /* logWarn('Hooks', "Попытка повторной установки хуков."); */ return; }
        logInfo('Hooks', "Установка перехватов в основном потоке...");
        try { unsafeWindow.fetch = fetchOverride; /* logDebug('Hooks', "Перехват Fetch API установлен."); */ }
        catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }
        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; /* logDebug('Hooks', "Перехваты XMLHttpRequest (open, send) установлены."); */ }
        catch (e) { logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; }
        if (INJECT_INTO_WORKERS) {
            try { unsafeWindow.URL.createObjectURL = createObjectURLOverride; logInfo('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН."); }
            catch (e) { logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }
            try { hookWorkerConstructor(); } catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }
            try { unsafeWindow.URL.revokeObjectURL = function(url) { /* logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`); */ return originalRevokeObjectURL.call(unsafeWindow.URL, url); }; /* logDebug('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен."); */ }
            catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else { logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются."); }
        hooksInstalledMain = true;
        logInfo('Hooks', "Установка перехватов в основном потоке завершена.");
    }

    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---
    logInfo('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);

    if (OPT_SHOW_AD_BANNER) {
        try {
            GM_addStyle(`
                .tch-adblock-banner {
                    position: absolute; top: 10px; left: 10px; z-index: 2000;
                    pointer-events: none; display: none; color: white;
                    background-color: rgba(0, 0, 0, 0.8); padding: 6px 12px;
                    font-size: 13px; border-radius: 5px;
                    font-family: Roobert, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
                    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); text-align: center;
                    opacity: 0; transition: opacity 0.5s ease-in-out;
                }
            `);
        } catch (e) { logError('Init', "Не удалось добавить стили для баннера:", e); }
    }

    // Устанавливаем хуки как можно раньше
    installHooks();

    // Устанавливаем качество через localStorage СРАЗУ при старте
    setQualitySettings();

    // --- ЛОГИКА ПОДДЕРЖАНИЯ КАЧЕСТВА ---

    // 1. Слушатель события visibilitychange
    try {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                logInfo('QualityV2Enhanced', "Вкладка стала видимой. Повторная установка качества 'Источник'.");
                setQualitySettings();
            }
        });
        logInfo('Init', "Слушатель 'visibilitychange' для качества установлен.");
    } catch (e) {
         logError('Init', "Не удалось добавить слушатель 'visibilitychange':", e);
    }

    // 2. Слушатель события popstate (для навигации внутри Twitch SPA)
    try {
        unsafeWindow.addEventListener('popstate', () => {
            // logInfo('QualityV2Enhanced', "Обнаружено событие 'popstate'. Повторная установка качества 'Источник'."); // Уменьшаем шум
            setQualitySettings();
        });
         logInfo('Init', "Слушатель 'popstate' для качества установлен.");
    } catch (e) {
        logError('Init', "Не удалось добавить слушатель 'popstate':", e);
    }

     // 3. Периодическая проверка (если включена)
     if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) {
         if (qualitySetIntervalId) {
             clearInterval(qualitySetIntervalId);
         }
         qualitySetIntervalId = setInterval(() => {
             setQualitySettings();
         }, PERIODIC_QUALITY_CHECK_INTERVAL_MS);
         logInfo('Init', `Периодическая проверка качества 'Источник' запущена с интервалом ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс.`);
     } else {
          logInfo('Init', `Периодическая проверка качества отключена или интервал некорректен.`);
     }

    // --- Запуск DOM-зависимых действий ---
    function onDomReady() {
         // Код проверки обновлений удален
         logInfo('Init', "DOM готов (DOMContentLoaded).");
    }

    // Запускаем onDomReady, когда DOM будет готов
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
        onDomReady();
    }

    logInfo('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);

})();