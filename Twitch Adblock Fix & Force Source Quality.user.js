// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource_v18_1_0
// @version      18.1.0
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
    const SCRIPT_VERSION = '18.1.0'; // **Версия обновлена**
    const SHOW_ERRORS = true; // Показывать ошибки в консоли
    // Настройки, необходимые для передачи в Worker
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false); // Отладочное логирование
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true); // Логирование очистки M3U8 (рекомендуется оставить включенным для отладки)
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', false); // Логирование блокировки сети (основной поток)
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false); // Логирование GQL
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

    // **Обновленные и новые константы для поиска рекламы в M3U8**
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad'; // Ищем этот класс в DATERANGE
    // Дополнительные маркеры и атрибуты, которые могут указывать на рекламу
    const AD_SIGNIFIERS_GENERAL = [
        '#EXT-X-DATERANGE', // Сам тег DATERANGE часто используется для рекламы
        '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', // Стандартные маркеры SCTE-35
        '#EXT-X-SCTE35', // Тег для SCTE-35 данных
        '#EXT-X-ASSET', // Иногда используется для рекламных ассетов
        '#EXT-X-DISCONTINUITY' // Разрыв потока, часто связан с рекламой
    ];
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED']; // Ключевые слова в атрибутах DATERANGE

    // URL-ключевые слова для безусловной блокировки запросов (основной поток)
    const AD_URL_KEYWORDS_BLOCK = ['amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com', 'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag', 'ttvl-o.cloudfront.net', 'd2v02itv0y9u9t.cloudfront.net', 'fastly.net/ad', 'edge.ads.twitch.tv']; // Добавлен edge.ads.twitch.tv для явной блокировки
    // URL-ключевые слова для предупреждения (не блокируются)
    const AD_URL_KEYWORDS_WARN = ['player-ad-', 'isp-signal', 'adlanding', 'adurl', 'adserver'];

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    var adBannerElement = null;
    var hooksInstalledMain = false;
    var workerHookAttempted = false;
    var hookedWorkers = new Set();
    var qualitySetIntervalId = null;

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

    logInfo('MAIN', `Скрипт запускается. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. Periodic Quality Check: ${ENABLE_PERIODIC_QUALITY_CHECK} (${PERIODIC_QUALITY_CHECK_INTERVAL_MS}ms).`);

    // --- УПРАВЛЕНИЕ БАННЕРОМ (Без изменений) ---
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
                    // Очищаем старые таймауты, если они есть
                    if (adDiv._fadeOutTimeout) clearTimeout(adDiv._fadeOutTimeout);
                    if (adDiv._hideTimeout) clearTimeout(adDiv._hideTimeout);

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


    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА (Без изменений) ---
    function setQualitySettings() {
        const context = 'QualityV2Enhanced';
        try {
            const currentValue = unsafeWindow.localStorage.getItem(LS_KEY_QUALITY);
            const targetValue = '{"default":"chunked"}'; // "chunked" обычно соответствует качеству "Источник"
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

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER ---
    function getWorkerInjectionCode() {
        // Передаем флаги и константы
        return `
        // --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
        const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
        const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
        const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
        // **Новые/обновленные константы для поиска рекламы**
        const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
        const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
        const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)};

        const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';
        // Функции логирования
        function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
        function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
        function workerLogInfo(message, ...args) { console.info(LOG_PREFIX_WORKER_BASE + ' INFO:', message, ...args); }
        function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
        function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }

        // --- **ОБНОВЛЕННАЯ ФУНКЦИЯ ПАРСИНГА И ОЧИСТКИ M3U8** ---
        function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
            const context = 'WorkerM3U8Parse';
            const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
            if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] Запуск очистки для URL: \${url}\`); // Логируем полный URL при отладке
            if (!m3u8Text || typeof m3u8Text !== 'string') { workerLogWarn(\`[\${context}] (\${urlShort}): Получен невалидный или пустой текст M3U8.\`); return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false }; }

            const lines = m3u8Text.split(/[\\r\\n]+/);
            if (lines.length < 2) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): M3U8 слишком короткий (\${lines.length} строк), пропускаем.\`); return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false }; }

            const cleanLines = [];
            let isAdSection = false; // Флаг, находимся ли мы внутри секции рекламы
            let adsFound = false;    // Флаг, была ли найдена реклама в этом плейлисте
            let linesRemoved = 0;   // Счетчик удаленных строк
            let isMidrollAd = false; // Флаг, является ли реклама midroll (основываясь на маркерах)
            let discontinuityCountInAd = 0; // Счетчик разрывов внутри предполагаемой рекламы

            if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обработка \${lines.length} строк...\`);

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                let trimmedLine = line.trim();

                if (!trimmedLine) { // Пустые строки пропускаем
                    cleanLines.push(line);
                    continue;
                }

                let isAdMarkerLine = false; // Флаг, является ли *текущая* строка рекламным маркером
                let shouldRemoveLine = false; // Флаг, нужно ли удалять текущую строку

                // --- Логика обнаружения начала/конца рекламной секции ---
                if (trimmedLine.startsWith('#EXT-X-DATERANGE:')) {
                    // Новый, более надежный способ: ищем CLASS="twitch-stitched-ad"
                    if (trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER)) {
                        isAdSection = true;
                        isAdMarkerLine = true;
                        adsFound = true;
                        discontinuityCountInAd = 0; // Сбрасываем счетчик при входе в новую секцию
                        isMidrollAd = true; // DATERANGE обычно midroll
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (CLASS=\${AD_SIGNIFIER_DATERANGE_ATTR_WORKER}) [\${i}]\`);
                        shouldRemoveLine = true; // Удаляем саму строку DATERANGE
                    }
                    // Дополнительная проверка по ключевым словам в атрибутах DATERANGE
                    else if (AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => trimmedLine.toUpperCase().includes(kw))) {
                         isAdSection = true;
                         isAdMarkerLine = true;
                         adsFound = true;
                         discontinuityCountInAd = 0;
                         isMidrollAd = true;
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (по ключевому слову) [\${i}]\`);
                         shouldRemoveLine = true;
                    }
                } else if (trimmedLine.startsWith('#EXT-X-CUE-OUT')) {
                     isAdSection = true;
                     isAdMarkerLine = true;
                     adsFound = true;
                     discontinuityCountInAd = 0;
                     isMidrollAd = true; // CUE-OUT обычно midroll
                     if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер начала #EXT-X-CUE-OUT [\${i}]\`);
                     shouldRemoveLine = true;
                } else if (trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) {
                     // Эти маркеры могут быть частью рекламы, начинаем секцию, но не всегда midroll
                     isAdSection = true;
                     isAdMarkerLine = true;
                     adsFound = true;
                     discontinuityCountInAd = 0;
                     if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер SCTE35/ASSET [\${i}]\`);
                     shouldRemoveLine = true;
                } else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
                     // Маркер конца рекламной секции
                     if (isAdSection) {
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]. Завершение рекламной секции.\`);
                         isAdSection = false;
                         isAdMarkerLine = true;
                         shouldRemoveLine = true; // Удаляем маркер CUE-IN
                    } else {
                         // CUE-IN без CUE-OUT? Странно, но просто пропустим его.
                         if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}): Обнаружен #EXT-X-CUE-IN без активной рекламной секции [\${i}]\`);
                    }
                }

                // --- Логика удаления строк ВНУТРИ рекламной секции ---
                 if (isAdSection && !isAdMarkerLine) {
                     // Если мы внутри рекламной секции и это не маркер конца/начала
                    shouldRemoveLine = true; // По умолчанию удаляем все внутри

                    // Особый случай: #EXT-X-DISCONTINUITY
                    // Twitch часто ставит разрыв *перед* рекламой и *после*.
                    // Разрыв *после* рекламы (когда isAdSection уже false) удалять НЕЛЬЗЯ.
                    // Разрывы *внутри* рекламы (если их несколько) или сразу *после* CUE-OUT/DATERANGE - удаляем.
                     if (trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                         discontinuityCountInAd++;
                         if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY #${discontinuityCountInAd} внутри рекламной секции [\${i}]. Удаляем.\`);
                         // shouldRemoveLine уже true
                     } else if (trimmedLine.startsWith('#EXTINF:') || (trimmedLine.includes('.ts') && !trimmedLine.startsWith('#'))) {
                         // Удаляем строки с информацией о сегменте и сами сегменты
                         if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем строку сегмента/inf из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                         // shouldRemoveLine уже true
                     } else {
                         // Другие теги внутри рекламы (например, #EXT-X-PROGRAM-DATE-TIME) тоже удаляем
                         if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем прочую строку из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                         // shouldRemoveLine уже true
                     }
                 }

                // --- Принятие решения об удалении ---
                if (shouldRemoveLine) {
                    linesRemoved++;
                    // Логируем удаление только для маркеров или при детальной трассировке
                    if (isAdMarkerLine || LOG_M3U8_CLEANING_WORKER) {
                         // workerLogTrace(\`[\${context}] (\${urlShort}): Удалена строка [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                    }
                } else {
                    cleanLines.push(line); // Добавляем строку в очищенный плейлист
                }
            } // end for loop

            // --- Завершение и логирование ---
            const cleanedText = cleanLines.join('\\n');
             if (adsFound) {
                 // Оставляем info лог при очистке, если LOG_M3U8_CLEANING_WORKER включен
                 if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружена реклама (Midroll: \${isMidrollAd}).\`);
                 try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e); }
             } else {
                 if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены или не распознаны текущей логикой. Плейлист не изменен.\`);
                 // **Добавим лог первых строк для диагностики, если реклама не найдена**
                 if (DEBUG_LOGGING_WORKER) {
                     workerLogTrace(\`[\${context}] (\${urlShort}) Первые 5 строк полученного M3U8:\\n\${lines.slice(0, 5).join('\\n')}\`);
                 }
             }
            return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
        } // end parseAndCleanM3U8_WORKER

        // --- Функция установки хука fetch в Worker'е (без существенных изменений, использует обновленный parseAndCleanM3U8_WORKER) ---
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

                // **Перехватываем ТОЛЬКО GET запросы к M3U8 и Usher**
                if ((isM3U8Request || isUsherRequest) && method.toUpperCase() === 'GET') {
                    if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] Перехвачен GET запрос M3U8/Usher: \${urlShort}\`);
                    try {
                        const originalResponse = await workerRealFetch(input, init);
                         if (!originalResponse.ok) {
                             // Важно не пытаться читать тело ответа при ошибке
                             if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status} \${originalResponse.statusText}). Пропускаем обработку.\`);
                             return originalResponse; // Возвращаем как есть
                         }
                        // Клонируем ответ, чтобы тело можно было прочитать дважды (один раз для проверки типа, второй - для текста)
                        const clonedResponse = originalResponse.clone();
                        const contentType = clonedResponse.headers.get('Content-Type') || '';

                        // Проверяем Content-Type на соответствие M3U8
                        if (contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('octet-stream')) {
                             if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: '\${contentType}'. Чтение и очистка...\`);
                             const m3u8Text = await clonedResponse.text();
                             if (!m3u8Text) { workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`); return originalResponse; } // Возвращаем оригинал, если тело пустое

                             // **Вызов обновленной функции очистки**
                             const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);

                             // Создаем новый ответ с очищенным текстом и оригинальными заголовками (кроме Content-Length)
                             const newHeaders = new Headers(originalResponse.headers);
                             newHeaders.delete('Content-Length'); // Длина изменилась
                             // Иногда ETag мешает кешированию, но лучше оставить его, если нет проблем
                             // newHeaders.delete('ETag');

                             return new Response(cleaningResult.cleanedText, {
                                 status: originalResponse.status,
                                 statusText: originalResponse.statusText,
                                 headers: newHeaders
                             });
                        } else {
                             // Если Content-Type не похож на M3U8, пропускаем
                             if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: '\${contentType}'). Пропускаем.\`);
                             return originalResponse; // Возвращаем оригинал
                        }
                    } catch (error) {
                         workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error);
                         // Возвращаем ошибку, чтобы плеер мог попытаться снова или показать ошибку
                         return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" });
                    }
                } else {
                     // Пропускаем все остальные запросы (включая сегменты .ts, другие API и т.д.)
                     // Уменьшаем шум в логах, логируя только при включенном DEBUG
                     if (DEBUG_LOGGING_WORKER && !isSegmentRequest) workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET запрос или не-GET запрос: (\${method}) \${urlShort}\`);
                     return workerRealFetch(input, init);
                 }
            };
            self.fetch.hooked_by_adblock = true;
            workerLogInfo("Перехват fetch в Worker'е УСПЕШНО установлен.");
            return true;
        } // end installWorkerFetchHook

        // --- Слушатель сообщений и запасной механизм EVAL (Без изменений) ---
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
    } // end getWorkerInjectionCode

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК - fetch, XHR) ---
    async function fetchOverride(input, init) {
        const context = 'MainFetch'; let requestUrl = ''; let method = 'GET';
        if (input instanceof Request) { requestUrl = input.url; method = input.method; } else { requestUrl = String(input); }
        if (init && init.method) { method = init.method; }
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;

        // 1. Блокировка по ключевым словам (URL Blocklist)
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch (${method}) запроса к: ${requestUrl}`);
            // Возвращаем пустой ответ, имитируя блокировку
            return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by TTV AdBlock)" }));
        }

        // 2. Предупреждение о потенциально рекламных запросах (не блокируем)
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) {
            logInfo(context, `Обнаружен потенциально рекламный Fetch запрос (${method}) (НЕ БЛОКИРОВАН): ${requestUrl}`);
        }

        // 3. Логирование GQL запросов (если включено)
        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
            try {
                if (method.toUpperCase() === 'POST' && init && init.body) {
                    let bodyData = init.body; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {/* ignore parse error */} }
                    let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                    if (operationName) { logInfo(context, `GraphQL Fetch: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN} (до выполнения)`); } }
                    else { logDebug(context, `GraphQL Fetch: Не удалось определить operationName`); }
                } else {
                    logDebug(context, `GraphQL Fetch: Обнаружен GET или запрос без тела`);
                }
            } catch (e) { logWarn(context, 'Ошибка при логировании GraphQL Fetch:', e); }
        }

        // 4. Вызов оригинального fetch
        try {
            const response = await originalFetch(input, init);
            // Логирование ответа GQL можно добавить здесь, если нужно
            // if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) { /* ... */ }
            return response;
        } catch (error) {
            // Обработка сетевых ошибок
            if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) {
                // Это часто происходит из-за внешних блокировщиков - это нормально. Логируем как Warn.
                logWarn(context, `Fetch к ${urlShort} не удался (возможно, заблокирован внешне): ${error.message}`);
                // Возвращаем фиктивный ответ, чтобы скрипт не падал
                return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed (TTV AdBlock Passthrough)" }));
            } else {
                // Другие ошибки логируем как Error
                logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error);
                throw error; // Перебрасываем ошибку дальше
            }
        }
    } // end fetchOverride

    const xhrRequestData = new WeakMap();
    function xhrOpenOverride(method, url, async, user, password) {
        const context = 'MainXHR'; const urlString = String(url); const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString;
        xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort, blocked: false }); // Инициализируем blocked: false

        // 1. Проверка на блокировку по URL
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR (${method}) запроса к: ${urlString}`);
            xhrRequestData.get(this).blocked = true; // Ставим флаг блокировки
            // Не прерываем здесь, даем open выполниться, блокировка будет в send
        }

        // 2. Предупреждение
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) {
            logInfo(context, `Обнаружен потенциально рекламный XHR запрос (${method}) (НЕ БЛОКИРОВАН): ${urlString}`);
        }

        // 3. Логирование GQL
        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) { logInfo(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`); }

        // 4. Вызов оригинального open
        try { return originalXhrOpen.call(this, method, url, async, user, password); }
        catch (error) { logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error); throw error; }
    } // end xhrOpenOverride

    function xhrSendOverride(data) {
        const context = 'MainXHR'; const requestInfo = xhrRequestData.get(this);
        if (!requestInfo) { logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала."); try { return originalXhrSend.call(this, data); } catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;} }

        const { method, url, urlShort, blocked } = requestInfo;

        // 1. Реализация блокировки
        if (blocked) {
            // logWarn(context, `Завершение заблокированного XHR запроса к: ${urlShort}`); // Уже залогировано в open
            this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false, lengthComputable: false })); // Имитируем ошибку сети
            try { this.abort(); } catch(e) { logWarn(context, `Не удалось вызвать abort() для заблокированного XHR к ${urlShort}: ${e.message}`); }
            return; // Прерываем выполнение
        }

        // 2. Логирование GQL (при отправке)
        if (LOG_GQL_INTERCEPTION && url.includes('/gql')) {
            try {
                let bodyData = data; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) { /* ignore */ } }
                let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                if (operationName) { logInfo(context, `GraphQL XHR Send: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Отправка XHR запроса ${GQL_OPERATION_ACCESS_TOKEN}`); } }
                else { logDebug(context, `GraphQL XHR Send: Не удалось определить operationName`); }
            } catch(e) { logWarn(context, 'Ошибка при логировании GraphQL XHR Send:', e); }
        }

        // 3. Вызов оригинального send
        try { return originalXhrSend.call(this, data); }
        catch (error) { logError(context, `Ошибка выполнения оригинального xhr.send для ${urlShort}:`, error); throw error; }
    } // end xhrSendOverride


    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER (createObjectURL, hookWorkerConstructor) ---
    // Использует getWorkerInjectionCode(), который был обновлен
    function createObjectURLOverride(blob) {
        const context = 'ObjectURL'; const blobType = blob?.type || 'unknown'; const blobSize = blob?.size || 0;

        // Внедряем только если опция включена, это Blob и тип похож на JS/Worker
        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker') || blobType === '' /* Иногда тип пустой */)) {
            if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);

            // Используем Promise для асинхронного чтения Blob
            const readerPromise = new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error("FileReader error: " + e.target.error));
                reader.readAsText(blob);
            });

            // Возвращаем Promise, который разрешится в URL (оригинальный или модифицированный)
            return (async () => {
                try {
                    const originalCode = await readerPromise;

                    // Улучшенная проверка на целевой Worker (ищем характерные строки)
                    // Добавим больше маркеров, встречающихся в видео-воркерах Twitch
                    const isLikelyVideoWorker = originalCode.includes('getVideoSegment') // Старый маркер
                    || originalCode.includes('wasmWorker') // Amazon IVS
                    || originalCode.includes('hlsManifestService') // HLS-плеер
                    || originalCode.includes('transmuxer') // Трансмуксинг
                    || (originalCode.includes('fetch') && originalCode.includes('postMessage') && originalCode.length > 10000); // Общий признак

                    if (isLikelyVideoWorker) {
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob ПОХОЖ на целевой Worker (маркеры найдены, размер: ${blobSize} bytes). Попытка внедрения кода...`);
                        const injectionCode = getWorkerInjectionCode(); // Получаем актуальный код для внедрения
                        const modifiedCode = injectionCode + '\\n\\n// --- Original Worker Code Below ---\\n' + originalCode;
                        const newBlob = new Blob([modifiedCode], { type: blobType });
                        const newUrl = originalCreateObjectURL.call(unsafeWindow.URL, newBlob);
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob успешно модифицирован и создан НОВЫЙ URL: ${newUrl.substring(0, 60)}... (Новый размер: ${newBlob.size})`);
                        return newUrl; // Возвращаем новый URL
                    } else {
                        if (LOG_WORKER_INJECTION) logDebug(context, `[Async] Blob НЕ похож на целевой Worker (маркеры не найдены или размер мал: ${blobSize} bytes). Возврат оригинального URL.`);
                        // Освобождаем память от прочитанного кода, если он не нужен
                        // originalCode = null; // Не обязательно, GC справится
                        return originalCreateObjectURL.call(unsafeWindow.URL, blob); // Возвращаем оригинальный URL
                    }
                } catch (error) {
                    logError(context, '[Async] Ошибка чтения/модификации Blob:', error);
                    // В случае ошибки возвращаем оригинальный URL
                    return originalCreateObjectURL.call(unsafeWindow.URL, blob);
                }
            })(); // Немедленно вызываем async IIFE
        } else {
            // Синхронный вызов для нецелевых объектов или если опция отключена
            if (blob instanceof Blob) { logTrace(context, `Пропуск createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`); }
            else { logTrace(context, `Пропуск createObjectURL для не-Blob объекта:`, blob); }
            return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        }
    } // end createObjectURLOverride

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true; // Флаг, что слушатели добавлены
        const context = 'WorkerMsg';

        // Слушатель ошибок из Worker'а
        workerInstance.addEventListener('error', (e) => {
            logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e);
            // Можно добавить логику реакции на ошибку, если нужно
        });

        // Слушатель сообщений от AdBlock кода в Worker'е
        const adBlockListener = (e) => {
            const messageData = e.data;
            if (messageData?.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${messageData.method || 'unknown'}`);
                hookedWorkers.add(label); // Добавляем в сет успешно перехваченных
            }
            else if (messageData?.type === 'ADBLOCK_ADS_REMOVED') {
                // Сообщение приходит из parseAndCleanM3U8_WORKER
                if (LOG_M3U8_CLEANING) logInfo('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${messageData.isMidroll}. URL: ${messageData.url}`); // Добавлен URL в лог
                if (OPT_SHOW_AD_BANNER) {
                    showAdBanner(messageData.isMidroll); // Показываем баннер
                }
                // Здесь можно добавить дополнительную логику при обнаружении рекламы
            } else {
                // Логируем другие сообщения от Worker'а при отладке
                if (DEBUG_LOGGING) logTrace(context, `Сообщение ОТ Worker'а (${label}):`, messageData);
            }
        };
        workerInstance.addEventListener('message', adBlockListener);
        workerInstance._adBlockListener = adBlockListener; // Сохраняем ссылку на слушатель для возможного удаления

        logDebug(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
    } // end addWorkerMessageListeners

    function hookWorkerConstructor() {
        if (!INJECT_INTO_WORKERS) { logWarn('WorkerHook', "Внедрение кода в Worker'ы отключено в настройках."); return; }
        if (unsafeWindow.Worker?.hooked_by_adblock) { logInfo('WorkerHook', "Конструктор Worker уже перехвачен."); return; } // Используем Info для тихой проверки
        if (typeof unsafeWindow.Worker === 'undefined') { logError('WorkerHook', 'Конструктор Worker (unsafeWindow.Worker) не определен. Невозможно перехватить.'); return; }

        logDebug('WorkerHook', "Попытка перехвата конструктора Worker...");
        workerHookAttempted = true;
        const OriginalWorkerClass = unsafeWindow.Worker;

        // Создаем новый класс, наследующий от оригинального Worker
        unsafeWindow.Worker = class HookedWorker extends OriginalWorkerClass {
            constructor(scriptURL, options) {
                let urlString = ''; let isBlobURL = false; let workerLabel = 'unknown'; let targetScriptURL = scriptURL;

                // Определяем тип источника Worker'а для логирования и запасного механизма
                try {
                    if (scriptURL instanceof URL) {
                        urlString = scriptURL.href;
                        isBlobURL = urlString.startsWith('blob:');
                    } else if (typeof scriptURL === 'string') {
                        urlString = scriptURL;
                        isBlobURL = urlString.startsWith('blob:');
                    }
                    // Создаем метку для Worker'а
                    if (isBlobURL) { workerLabel = `blob:${urlString.substring(5, 35)}...`; }
                     else if (urlString) { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); }
                     else { workerLabel = `non-url-source (${typeof scriptURL})`; }

                     if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : (urlString ? 'Script URL' : 'Unknown')}`);
                } catch (e) { logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL); workerLabel = 'error-determining-source'; }

                // --- ВАЖНО: Сначала вызываем super() ---
                // Если targetScriptURL был модифицирован в createObjectURLOverride (который вернул Promise),
                // здесь может быть проблема, т.к. конструктор Worker ожидает URL синхронно.
                // Однако, т.к. createObjectURLOverride возвращает Promise<string>, а не сам Promise,
                // и мы его разрешаем *до* передачи сюда, это должно работать.
                // Если бы createObjectURLOverride возвращал Promise, нужно было бы переделать логику.
                // **АКТУАЛЬНОЕ СОСТОЯНИЕ**: Мы используем createObjectURLOverride_Sync, который НЕ модифицирует URL,
                // поэтому targetScriptURL здесь всегда будет оригинальным scriptURL.
                super(targetScriptURL, options);

                // Сохраняем метку и добавляем слушатели к *этому* инстансу Worker'а
                 this._workerLabel = workerLabel;
                 addWorkerMessageListeners(this, workerLabel);

                // --- Запасной механизм внедрения для не-Blob воркеров ---
                // Если Worker создан не из Blob URL (т.е. хук createObjectURL не сработал или не применился)
                // и опция внедрения включена, пытаемся внедрить код через postMessage.
                if (!isBlobURL && urlString && INJECT_INTO_WORKERS) {
                     // Небольшая задержка, чтобы Worker успел инициализироваться
                     setTimeout(() => {
                        // Проверяем, не подтвердил ли Worker готовность (маловероятно, но возможно)
                        if (!hookedWorkers.has(this._workerLabel)) {
                             if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук createObjectURL не применился). Запасная попытка внедрения через postMessage...`);
                             try {
                                 const injectionCode = getWorkerInjectionCode();
                                 // if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `[Async] Отправка EVAL_ADBLOCK_CODE Worker'у (${this._workerLabel}).`);
                                 this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode });
                             } catch(e) { logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e); }
                        } else {
                            if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков (запасной механизм не требуется).`);
                        }
                    }, 500); // Немного увеличим задержку на всякий случай
                } else if (isBlobURL && LOG_WORKER_INJECTION) {
                     logDebug('WorkerHook', `Worker (${workerLabel}) создан из Blob URL, ожидаем подтверждения хуков...`);
                 }
            } // end constructor
        }; // end HookedWorker class

         // Восстанавливаем прототипную цепочку
         Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass); // Статичные свойства/методы
         Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype); // Методы инстанса

         unsafeWindow.Worker.hooked_by_adblock = true; // Ставим флаг, что конструктор перехвачен
         logInfo('WorkerHook', "Конструктор Worker успешно перехвачен.");
    } // end hookWorkerConstructor


    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК) ---
    function installHooks() {
        if (hooksInstalledMain) { logWarn('Hooks', "Попытка повторной установки хуков."); return; }
        logInfo('Hooks', "Установка перехватов в основном потоке...");
        try {
            unsafeWindow.fetch = fetchOverride;
            logDebug('Hooks', "Перехват Fetch API установлен.");
        } catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; } // Пытаемся восстановить оригинал

        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            logDebug('Hooks', "Перехваты XMLHttpRequest (open, send) установлены.");
        } catch (e) { logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; } // Восстанавливаем

        if (INJECT_INTO_WORKERS) {
            try {
                // Перехватываем createObjectURL. Мы ИСПОЛЬЗУЕМ синхронную версию
                // createObjectURLOverride_Sync, которая сама по себе НЕ ВНЕДРЯЕТ код,
                // так как это невозможно сделать надежно синхронно из-за FileReader API.
                // Она в основном служит для логирования.
                // Основная логика внедрения полагается на hookWorkerConstructor и запасной
                // механизм postMessage('EVAL_ADBLOCK_CODE').
                unsafeWindow.URL.createObjectURL = createObjectURLOverride_Sync;
                logInfo('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН (Синхронный, без модификации Blob).");
            }
            catch (e) { logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }

            try { hookWorkerConstructor(); } // Перехват конструктора Worker
            catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; } // Восстанавливаем

            // Перехват revokeObjectURL для отладки (не критично)
            try {
                 unsafeWindow.URL.revokeObjectURL = function(url) {
                     logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`);
                     return originalRevokeObjectURL.call(unsafeWindow.URL, url);
                 };
                 logDebug('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен.");
            }
            catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else {
            logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются.");
        }
        hooksInstalledMain = true;
        logInfo('Hooks', "Установка перехватов в основном потоке завершена.");
    } // end installHooks

     // *** СИНХРОННАЯ ВЕРСИЯ createObjectURLOverride (для большей надежности) ***
     // Эта функция НЕ МОЖЕТ надежно модифицировать Blob синхронно.
     // Она используется только для логирования перехвата, а реальное внедрение
     // происходит через hookWorkerConstructor.
     function createObjectURLOverride_Sync(blob) {
         const context = 'ObjectURLSync'; const blobType = blob?.type || 'unknown'; const blobSize = blob?.size || 0;
         if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker') || blobType === '')) {
             if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
             try {
                 // Попытка синхронного чтения Blob невозможна стандартными средствами JS.
                 // Поэтому мы НЕ ПЫТАЕМСЯ модифицировать Blob здесь.
                 logDebug(context, "Синхронная модификация Blob невозможна. Возвращаем оригинальный URL. Логика внедрения сработает в hookWorkerConstructor.");
                 return originalCreateObjectURL.call(unsafeWindow.URL, blob);

             } catch (error) {
                 // Эта ошибка не должна возникать, так как мы не читаем Blob
                 logError(context, 'Неожиданная ошибка при синхронной обработке Blob:', error);
                 return originalCreateObjectURL.call(unsafeWindow.URL, blob);
             }
         } else {
             // Пропускаем нецелевые объекты
             if (blob instanceof Blob) { logTrace(context, `Пропуск createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`); }
             else { logTrace(context, `Пропуск createObjectURL для не-Blob объекта.`); }
             return originalCreateObjectURL.call(unsafeWindow.URL, blob);
         }
     } // end createObjectURLOverride_Sync


    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---
    logInfo('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);

    // Добавление стилей для баннера
    if (OPT_SHOW_AD_BANNER) {
        try {
            GM_addStyle(`
                .tch-adblock-banner {
                    position: absolute; /* Позиционируется относительно родителя с position: relative/absolute/fixed */
                    top: 10px; left: 10px; z-index: 2000; /* Высокий z-index */
                    pointer-events: none; /* Не мешает кликам по плееру */
                    display: none; /* Изначально скрыт */
                    color: white;
                    background-color: rgba(0, 0, 0, 0.8); /* Полупрозрачный черный фон */
                    padding: 6px 12px;
                    font-size: 13px; border-radius: 5px;
                    font-family: Roobert, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; /* Шрифт Twitch */
                    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); /* Тень для читаемости */
                    text-align: center;
                    opacity: 0; /* Изначально прозрачный для анимации */
                    transition: opacity 0.5s ease-in-out; /* Плавное появление/исчезание */
                }
            `);
            logInfo('Init', "Стили для баннера добавлены.");
        } catch (e) { logError('Init', "Не удалось добавить стили для баннера:", e); }
    }

    // Устанавливаем хуки как можно раньше
    installHooks(); // Вызывает fetchOverride, xhr*, createObjectURLOverride_Sync (который не модифицирует), hookWorkerConstructor

    // Устанавливаем качество через localStorage СРАЗУ при старте
    setQualitySettings();

    // --- ЛОГИКА ПОДДЕРЖАНИЯ КАЧЕСТВА (Без изменений) ---
    try {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                logInfo('QualityV2Enhanced', "Вкладка стала видимой. Повторная установка качества 'Источник'.");
                setQualitySettings(); // Вызываем функцию установки
            }
        }, { passive: true }); // Используем passive для лучшей производительности
        logInfo('Init', "Слушатель 'visibilitychange' для качества установлен.");
    } catch (e) {
         logError('Init', "Не удалось добавить слушатель 'visibilitychange':", e);
    }

    try {
        // Используем pushState/replaceState для SPA навигации, popstate - для кнопок назад/вперед
        const handleStateChange = () => {
             // Небольшая задержка, чтобы дать Twitch обновить DOM после навигации
             setTimeout(() => {
                 logInfo('QualityV2Enhanced', "Обнаружено изменение состояния навигации (pushState/replaceState/popstate). Повторная установка качества 'Источник'.");
                 setQualitySettings();
             }, 300); // 300ms задержка
        };
        const originalPushState = history.pushState;
        history.pushState = function(...args) {
             originalPushState.apply(this, args);
             handleStateChange();
        };
        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) {
             originalReplaceState.apply(this, args);
             handleStateChange();
        };
        unsafeWindow.addEventListener('popstate', handleStateChange, { passive: true });

         logInfo('Init', "Слушатели 'pushState', 'replaceState', 'popstate' для качества установлены.");
    } catch (e) {
        logError('Init', "Не удалось добавить слушатели истории навигации:", e);
    }

     // Периодическая проверка качества (если включена)
     if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) {
         if (qualitySetIntervalId) {
             clearInterval(qualitySetIntervalId); // Очищаем старый интервал, если он есть
             qualitySetIntervalId = null;
         }
         qualitySetIntervalId = setInterval(() => {
             logDebug('QualityV2Enhanced', `Периодическая проверка качества (интервал: ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс).`);
             setQualitySettings();
         }, PERIODIC_QUALITY_CHECK_INTERVAL_MS);
         logInfo('Init', `Периодическая проверка качества 'Источник' запущена с интервалом ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс.`);
     } else {
          logInfo('Init', `Периодическая проверка качества отключена или интервал некорректен.`);
     }

    // --- Запуск DOM-зависимых действий ---
    function onDomReady() {
         // Код проверки обновлений удален для простоты
         logInfo('Init', "DOM готов (DOMContentLoaded).");
         // Можно добавить другие действия, требующие DOM, здесь
    }

    // Запускаем onDomReady, когда DOM будет готов
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
        // DOM уже готов
        onDomReady();
    }

    logInfo('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);

})(); // Конец IIFE (Immediately Invoked Function Expression)