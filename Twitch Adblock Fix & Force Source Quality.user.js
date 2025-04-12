// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality (v18.1.4 - Optimized Logging)
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource_v18_1_4_ReloadWorkerDebug
// @version      18.1.4
// @description  Блокировка рекламы + Качество "Источник" + Авто-перезагрузка
// @author       AI Generated & Adapted by ShmidtS & Optimized
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

    // --- НАСТРОЙКИ ---
    const SCRIPT_VERSION = '18.1.4';
    const SHOW_ERRORS = true;
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false); // **Включаем Debug лог по умолчанию для отладки**
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', true); // **Включаем лог блокировки сети**
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true);
    const OPT_SHOW_AD_BANNER = GM_getValue('TTV_AdBlock_ShowBanner', true);
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const ENABLE_PERIODIC_QUALITY_CHECK = GM_getValue('TTV_AdBlock_PeriodicQualityCheck', true);
    const PERIODIC_QUALITY_CHECK_INTERVAL_MS = GM_getValue('TTV_AdBlock_QualityCheckInterval', 7500);

    // --- **НАСТРОЙКИ ДЛЯ АВТО-ПЕРЕЗАГРУЗКИ (ВОЗВРАЩЕНЫ)** ---
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [1000, 2000, 3000, 4000]); // Распространенные коды ошибок Twitch [15, 19]
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 12000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 18000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 45000);

    // --- КОНСТАНТЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', '#EXT-X-SCTE35', '#EXT-X-ASSET', '#EXT-X-DISCONTINUITY']; // Стандартные маркеры M3U8 для рекламы
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED']; // Дополнительные ключевые слова в DATERANGE
    const AD_URL_KEYWORDS_BLOCK = ['amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com', 'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag', 'ttvl-o.cloudfront.net', 'd2v02itv0y9u9t.cloudfront.net', 'fastly.net/ad', 'edge.ads.twitch.tv']; // URL для блокировки [20]
    const AD_URL_KEYWORDS_WARN = ['player-ad-', 'isp-signal', 'adlanding', 'adurl', 'adserver']; // URL для предупреждения (не блокируются)

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (ВОЗВРАЩЕНЫ переменные авто-релоада) ---
    var adBannerElement = null;
    var hooksInstalledMain = false;
    var workerHookAttempted = false;
    var hookedWorkers = new Set();
    var qualitySetIntervalId = null;
    var playerMonitorIntervalId = null;
    var videoElement = null;
    var lastVideoTimeUpdateTimestamp = 0;
    var lastKnownVideoTime = -1;
    var isWaitingForDataTimestamp = 0;
    var reloadTimeoutId = null;
    var lastReloadTimestamp = 0;
    const PLAYER_SELECTOR = 'video'; // Основной селектор видеоэлемента

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
    function getAdDiv() { if (!OPT_SHOW_AD_BANNER) return null; if (adBannerElement && document.body.contains(adBannerElement)) { return adBannerElement; } adBannerElement = document.querySelector('.tch-adblock-banner'); if (adBannerElement) { return adBannerElement; } try { const playerRootDiv = document.querySelector('.video-player__container') || document.querySelector('.video-player .persistent-player') || document.querySelector('div[data-a-target="video-player-layout"]') || document.querySelector('div[data-a-target="video-player"]') || document.querySelector('.video-player') || document.body; if (!playerRootDiv || !(playerRootDiv instanceof Node)) { logWarn("Banner", "Не удалось найти валидный контейнер плеера для баннера."); return null; } const div = document.createElement('div'); div.className = 'tch-adblock-banner'; const currentPosition = window.getComputedStyle(playerRootDiv).position; if (currentPosition === 'static') { playerRootDiv.style.position = 'relative'; } playerRootDiv.appendChild(div); adBannerElement = div; logInfo("Banner", "Баннер успешно создан и добавлен."); return adBannerElement; } catch (e) { logError("Banner", "Ошибка создания баннера:", e); adBannerElement = null; return null; } }
    function showAdBanner(isMidroll) { if (!OPT_SHOW_AD_BANNER) return; const adDiv = getAdDiv(); if (adDiv) { requestAnimationFrame(() => { try { if (adDiv._fadeOutTimeout) clearTimeout(adDiv._fadeOutTimeout); if (adDiv._hideTimeout) clearTimeout(adDiv._hideTimeout); const bannerText = `Реклама удалена v${SCRIPT_VERSION.substring(0, 6)}` + (isMidroll ? ' (midroll)' : ''); adDiv.textContent = bannerText; adDiv.style.display = 'block'; adDiv.style.opacity = '1'; logInfo("Banner", "Баннер показан. Текст:", bannerText); let fadeOutTimeout = setTimeout(() => { if (adDiv) { adDiv.style.opacity = '0'; let hideTimeout = setTimeout(() => { if (adDiv) adDiv.style.display = 'none'; }, 600); adDiv._hideTimeout = hideTimeout; } }, 5000); adDiv._fadeOutTimeout = fadeOutTimeout; } catch(e) { logError("Banner", "Ошибка отображения баннера:", e); } }); } else { logWarn("Banner", "Не удалось получить/создать баннер для показа."); } }

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА (Без изменений) ---
    function setQualitySettings() { const context = 'QualityV2Enhanced'; try { const currentValue = unsafeWindow.localStorage.getItem(LS_KEY_QUALITY); const targetValue = '{"default":"chunked"}'; // 'chunked' соответствует качеству "Источник"
        if (currentValue !== targetValue) { unsafeWindow.localStorage.setItem(LS_KEY_QUALITY, targetValue); logInfo(context, `Установлено качество 'Источник' ('${targetValue}') через localStorage.`); } else { logDebug(context, `Качество 'Источник' ('${targetValue}') уже установлено в localStorage.`); } } catch (e) { logError(context, 'Ошибка установки настроек качества в localStorage:', e); } }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER (С ДОПОЛНИТЕЛЬНЫМИ ЛОГАМИ) ---
    function getWorkerInjectionCode() {
        // Используем JSON.stringify для корректной передачи массивов и строк в код Worker'а
        return `
    // --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
    // ==============================================================
    // !!! ВАЖНО: ЭТОТ КОД ВЫПОЛНЯЕТСЯ ВНУТРИ WORKER'А !!!
    // ==============================================================
    const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
    const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
    const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
    const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
    const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)};
    const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

    // --- Функции логирования Worker'а ---
    function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
    function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
    function workerLogInfo(message, ...args) { console.info(LOG_PREFIX_WORKER_BASE + ' INFO:', message, ...args); }
    function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
    function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }

    // --- **САМЫЙ ПЕРВЫЙ ЛОГ ПРИ ВЫПОЛНЕНИИ ВНУТРИ WORKER'А** ---
    workerLogInfo("--- Worker AdBlock Code EXECUTION STARTED ---");

    function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
        const context = 'WorkerM3U8Parse';
        const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
        if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] Запуск очистки для URL: \${url}\`);

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            workerLogWarn(\`[\${context}] (\${urlShort}): Получен невалидный или пустой текст M3U8.\`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false };
        }

        const lines = m3u8Text.split(/[\\r\\n]+/);
        if (lines.length < 2) {
            if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): M3U8 слишком короткий (\${lines.length} строк), пропускаем.\`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false };
        }

        const cleanLines = [];
        let isAdSection = false;
        let adsFound = false;
        let linesRemoved = 0;
        let isMidrollAd = false; // Флаг для определения, является ли реклама mid-roll
        let discontinuityCountInAd = 0;

        if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обработка \${lines.length} строк...\`);

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmedLine = line.trim();

            if (!trimmedLine) { // Сохраняем пустые строки
                cleanLines.push(line);
                continue;
            }

            let isAdMarkerLine = false;
            let shouldRemoveLine = false;

            // --- Логика определения рекламных сегментов ---
            // 1. По маркеру EXT-X-DATERANGE с атрибутом CLASS (наиболее надежный)
            if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER)) {
                isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
                if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (CLASS=\${AD_SIGNIFIER_DATERANGE_ATTR_WORKER}) [\${i}]\`);
                shouldRemoveLine = true;
            }
            // 2. По маркеру EXT-X-DATERANGE с ключевыми словами в атрибутах
            else if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => trimmedLine.toUpperCase().includes(kw))) {
                isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
                if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (по ключевому слову) [\${i}]\`);
                shouldRemoveLine = true;
            }
            // 3. По стандартным маркерам CUE-OUT/SCTE35/ASSET
            else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) {
                isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0;
                isMidrollAd = true; // CUE-OUT обычно midroll, другие тоже могут быть
                if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер начала рекламы (CUE-OUT/SCTE35/ASSET) [\${i}]\`);
                shouldRemoveLine = true;
            }
            // 4. Маркер завершения CUE-IN
            else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
                if (isAdSection) {
                    if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]. Завершение рекламной секции.\`);
                    isAdSection = false; isAdMarkerLine = true; shouldRemoveLine = true;
                } else {
                    // Иногда CUE-IN может приходить без CUE-OUT, его лучше тоже удалить на всякий случай
                    if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}): Обнаружен #EXT-X-CUE-IN без активной рекламной секции [\${i}]. Удаляем на всякий случай.\`);
                    shouldRemoveLine = true;
                }
            }
            // 5. Маркер EXT-X-DISCONTINUITY внутри рекламной секции
            else if (isAdSection && trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                 discontinuityCountInAd++;
                 if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY #${discontinuityCountInAd} внутри рекламной секции [\${i}]. Удаляем.\`);
                 shouldRemoveLine = true;
                 isAdMarkerLine = true; // Считаем его частью маркеров рекламы
            }


            // Если мы находимся в рекламной секции и строка не является маркером начала/конца, удаляем ее
            if (isAdSection && !isAdMarkerLine) {
                shouldRemoveLine = true;
                if (trimmedLine.startsWith('#EXTINF:') || (trimmedLine.includes('.ts') && !trimmedLine.startsWith('#'))) {
                    if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем строку сегмента/inf из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                } else {
                    if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем прочую строку из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                }
            }

            // Добавляем строку в результат, если она не помечена на удаление
            if (shouldRemoveLine) {
                linesRemoved++;
            } else {
                cleanLines.push(line);
            }
        } // end for

        const cleanedText = cleanLines.join('\\n'); // Собираем обратно с переносами строк

        if (adsFound) {
            if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружена реклама (Midroll: \${isMidrollAd}).\`);
            try {
                // Отправляем сообщение в основной поток об удалении рекламы
                self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort });
            } catch(e) {
                workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e);
            }
        } else {
            if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены или не распознаны текущей логикой. Плейлист не изменен.\`);
            if (DEBUG_LOGGING_WORKER) {
                 // Логируем начало плейлиста, если реклама не найдена, для отладки
                 workerLogTrace(\`[\${context}] (\${urlShort}) Первые 5 строк полученного M3U8:\\n\${lines.slice(0, 5).join('\\n')}\`);
            }
        }

        return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
    } // end parseAndCleanM3U8_WORKER

    // --- **ОБНОВЛЕННЫЙ Fetch Hook внутри Worker'а с ДОП. ЛОГАМИ** ---
    function installWorkerFetchHook() {
        workerLogInfo("installWorkerFetchHook() ВЫЗВАНА."); // **ЛОГ 1**
        if (typeof self.fetch !== 'function') {
            workerLogWarn("Fetch API недоступен в этом Worker'е. Перехват невозможен.");
            return false;
        }
        if (self.fetch.hooked_by_adblock) {
            workerLogInfo("Перехват Fetch в Worker'е уже был установлен ранее.");
            return true;
        }
        workerLogInfo("Попытка установки перехвата fetch в Worker'е...");
        workerLogDebug("Перед сохранением оригинального self.fetch."); // **ЛОГ 2**
        const workerRealFetch = self.fetch;
        workerLogDebug("Оригинальный self.fetch сохранен. Перед переопределением self.fetch."); // **ЛОГ 3**

        self.fetch = async (input, init) => {
            let requestUrl = '';
            let method = 'GET';
            if (input instanceof Request) { requestUrl = input.url; method = input.method; }
            else { requestUrl = String(input); }
            if (init && init.method) { method = init.method; }

            const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
            const isM3U8Request = requestUrl.includes('.m3u8');
            const isUsherRequest = requestUrl.includes('usher.ttvnw.net'); // Запросы к серверу плейлистов Twitch
            const isSegmentRequest = requestUrl.includes('.ts'); // Видео сегменты
            const context = 'WorkerFetch';

            if (method.toUpperCase() === 'GET' && DEBUG_LOGGING_WORKER) {
                // Логируем только GET запросы для уменьшения шума, исключая сегменты
                if (!isSegmentRequest) {
                   workerLogDebug(\`[\${context}] Перехвачен GET запрос: \${requestUrl}\`);
                } else {
                   workerLogTrace(\`[\${context}] Перехвачен GET запрос на сегмент: \${urlShort}\`);
                }
            }

            // Обрабатываем только GET запросы к M3U8 или Usher
            if ((isM3U8Request || isUsherRequest) && method.toUpperCase() === 'GET') {
                workerLogInfo(\`[\${context}] ОБРАБОТКА M3U8/Usher: \${urlShort}\`);
                try {
                    const originalResponse = await workerRealFetch(input, init);

                    // Проверяем, успешен ли оригинальный запрос
                    if (!originalResponse.ok) {
                         workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status} \${originalResponse.statusText}). Пропускаем обработку.\`);
                         return originalResponse;
                    }

                    const clonedResponse = originalResponse.clone(); // Клонируем для безопасного чтения
                    const contentType = clonedResponse.headers.get('Content-Type') || '';

                    // Проверяем Content-Type, чтобы убедиться, что это плейлист
                    if (contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('octet-stream')) {
                         workerLogDebug(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: '\${contentType}'. Чтение и очистка...\`);
                         const m3u8Text = await clonedResponse.text();

                         if (!m3u8Text) {
                             workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`);
                             return originalResponse; // Возвращаем оригинал, если тело пустое
                         }

                         const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);

                         // Создаем новый ответ с очищенным текстом и оригинальными заголовками (кроме Content-Length)
                         const newHeaders = new Headers(originalResponse.headers);
                         newHeaders.delete('Content-Length'); // Content-Length изменился, удаляем его

                         workerLogDebug(\`[\${context}] (\${urlShort}) Возврат \${cleaningResult.adsFound ? 'ОЧИЩЕННОГО' : 'оригинального (нет рекламы)'} M3U8. Удалено строк: \${cleaningResult.linesRemoved}\`);
                         return new Response(cleaningResult.cleanedText, {
                             status: originalResponse.status,
                             statusText: originalResponse.statusText,
                             headers: newHeaders
                         });
                    } else {
                         // Если Content-Type не соответствует, пропускаем обработку
                         workerLogWarn(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: '\${contentType}'). Пропускаем.\`);
                         return originalResponse;
                    }
                } catch (error) {
                    workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error);
                    // Возвращаем ошибку, чтобы плеер мог ее обработать
                    return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, {
                        status: 500,
                        statusText: "AdBlock Internal Error"
                    });
                }
            } else {
                 // Пропускаем все остальные запросы (POST, PUT, DELETE, не-M3U8 GET и т.д.)
                 if (!isSegmentRequest && DEBUG_LOGGING_WORKER) {
                      workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET или не-GET запрос: (\${method}) \${urlShort}\`);
                 }
                 return workerRealFetch(input, init);
            }
        };
        self.fetch.hooked_by_adblock = true; // Ставим флаг, что перехват установлен
        workerLogInfo("Перехват fetch в Worker'е УСПЕШНО установлен и присвоен self.fetch."); // **ЛОГ 4**
        return true;
    } // end installWorkerFetchHook

    // --- Слушатель сообщений и запасной механизм EVAL (Без изменений) ---
    self.addEventListener('message', function(e) {
        if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
            workerLogInfo("Получено сообщение EVAL_ADBLOCK_CODE (запасной метод). Попытка выполнения...");
            try {
                eval(e.data.code); // Выполняем код, переданный из основного потока
                workerLogInfo("EVAL_ADBLOCK_CODE успешно выполнен.");
                // Повторно пытаемся установить хук, если он еще не установлен
                if (!self.fetch.hooked_by_adblock) {
                    workerLogInfo("EVAL: Fetch еще не был перехвачен, пытаемся установить...");
                    if (installWorkerFetchHook()) {
                        try {
                             workerLogInfo("!!! --->>> EVAL: Отправка ADBLOCK_WORKER_HOOKS_READY после eval...");
                             self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval' });
                        } catch(e) {
                             workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY после eval:", e);
                        }
                    } else {
                         workerLogError("Не удалось установить перехват fetch в Worker'е после eval!");
                    }
                } else {
                    workerLogInfo("Перехват fetch уже был установлен, повторная установка не требуется.");
                }
            } catch (err) {
                workerLogError("Ошибка выполнения кода из EVAL_ADBLOCK_CODE:", err);
            }
        }
     });

    // --- Первичная установка хука ---
    workerLogInfo("Перед первичной попыткой установки fetch hook..."); // **ЛОГ 5**
    if (installWorkerFetchHook()) {
        try {
            // **!!! САМОЕ ВАЖНОЕ СООБЩЕНИЕ ДЛЯ ОТЛАДКИ !!!**
            // Отправляем сообщение в основной поток, что хуки готовы
            workerLogInfo("!!! --->>> INITIAL: Отправка ADBLOCK_WORKER_HOOKS_READY...");
            self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' });
        } catch(e) {
             workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY при инициализации:", e);
        }
    } else {
         workerLogError("Не удалось установить перехват fetch в Worker'е при инициализации!");
    }

    workerLogInfo("--- Worker AdBlock Code EXECUTION FINISHED (Инициализация завершена) ---");
    // --- Worker AdBlock Code End ---
    `;
    } // end getWorkerInjectionCode

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК - fetch, XHR) (Без изменений) ---
    async function fetchOverride(input, init) {
        const context = 'MainFetch';
        let requestUrl = '';
        let method = 'GET';
        if (input instanceof Request) { requestUrl = input.url; method = input.method; }
        else { requestUrl = String(input); }
        if (init && init.method) { method = init.method; }
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;

        // Блокировка запросов по ключевым словам
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch (${method}) запроса к: ${requestUrl}`);
            // Возвращаем пустой ответ со статусом 204 No Content
            return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by TTV AdBlock)" }));
        }

        // Логирование потенциально рекламных запросов (без блокировки)
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) {
            logInfo(context, `Обнаружен потенциально рекламный Fetch запрос (${method}) (НЕ БЛОКИРОВАН): ${requestUrl}`);
        }

        // Логирование GraphQL запросов
        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
            try {
                if (method.toUpperCase() === 'POST' && init && init.body) {
                    let bodyData = init.body;
                    if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {/* ignore json parse error */} }
                    let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                    if (operationName) {
                        logInfo(context, `GraphQL Fetch: ${operationName}`);
                        if (operationName === GQL_OPERATION_ACCESS_TOKEN) {
                            logInfo(context, `Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN} (до выполнения)`);
                        }
                    } else { logDebug(context, `GraphQL Fetch: Не удалось определить operationName`); }
                } else { logDebug(context, `GraphQL Fetch: Обнаружен GET или запрос без тела`); }
            } catch (e) { logWarn(context, 'Ошибка при логировании GraphQL Fetch:', e); }
        }

        // Выполняем оригинальный fetch
        try {
            const response = await originalFetch(input, init);
            // Можно добавить логирование ответа GraphQL здесь, если нужно
            return response;
        } catch (error) {
            // Обрабатываем специфичные ошибки сети, которые могут возникать из-за блокировок
            if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) {
                 logWarn(context, `Fetch к ${urlShort} не удался (возможно, заблокирован внешне): ${error.message}`);
                 // Возвращаем "пустой" промис, чтобы имитировать заблокированный запрос
                 return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed (TTV AdBlock Passthrough)" }));
            } else {
                 // Перебрасываем другие ошибки
                 logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error);
                 throw error;
            }
        }
    } // end fetchOverride

    const xhrRequestData = new WeakMap(); // Хранилище данных для XHR запросов

    function xhrOpenOverride(method, url, async, user, password) {
        const context = 'MainXHR';
        const urlString = String(url);
        const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString;
        // Сохраняем информацию о запросе и флаг блокировки
        xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort, blocked: false });

        // Блокировка по URL
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR (${method}) запроса к: ${urlString}`);
            xhrRequestData.get(this).blocked = true;
            // Не вызываем originalXhrOpen, блокировка произойдет в xhrSendOverride
        }

        // Логирование по URL
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) {
            logInfo(context, `Обнаружен потенциально рекламный XHR запрос (${method}) (НЕ БЛОКИРОВАН): ${urlString}`);
        }

        // Логирование GraphQL
        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) {
            logInfo(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`);
        }

        // Вызываем оригинальный open только если запрос не заблокирован
        if (!xhrRequestData.get(this).blocked) {
           try {
               return originalXhrOpen.call(this, method, url, async, user, password);
           } catch (error) {
               logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error);
               throw error;
           }
        }
        // Если заблокирован, просто ничего не делаем здесь, send обработает
    } // end xhrOpenOverride

    function xhrSendOverride(data) {
        const context = 'MainXHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала.");
            try { return originalXhrSend.call(this, data); }
            catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;}
        }

        const { method, url, urlShort, blocked } = requestInfo;

        // Если запрос помечен как заблокированный в open, прерываем его
        if (blocked) {
            logWarn(context, `Прерывание заблокированного XHR (${method}) к ${urlShort} в send.`);
            // Имитируем событие ошибки, чтобы вызывающий код мог это обработать
            this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false, lengthComputable: false }));
            try { this.abort(); } // Пытаемся прервать запрос
            catch(e) { logWarn(context, `Не удалось вызвать abort() для заблокированного XHR к ${urlShort}: ${e.message}`); }
            return; // Не вызываем оригинальный send
        }

        // Логирование GraphQL перед отправкой
        if (LOG_GQL_INTERCEPTION && url.includes('/gql')) {
             try {
                 let bodyData = data;
                 if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {/* ignore */} }
                 let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                 if (operationName) {
                     logInfo(context, `GraphQL XHR Send: ${operationName}`);
                     if (operationName === GQL_OPERATION_ACCESS_TOKEN) {
                         logInfo(context, `Отправка XHR запроса ${GQL_OPERATION_ACCESS_TOKEN}`);
                     }
                 } else { logDebug(context, `GraphQL XHR Send: Не удалось определить operationName`); }
             } catch(e) { logWarn(context, 'Ошибка при логировании GraphQL XHR Send:', e); }
        }

        // Вызываем оригинальный send для не заблокированных запросов
        try {
            return originalXhrSend.call(this, data);
        } catch (error) {
             logError(context, `Ошибка выполнения оригинального xhr.send для ${urlShort}:`, error);
             throw error;
        }
    } // end xhrSendOverride


    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER (как в v18.1.3, но с ОПТИМИЗИРОВАННЫМ ЛОГГИРОВАНИЕМ) ---

    // Перехват URL.createObjectURL для логгирования и подготовки к перехвату Worker
    function createObjectURLOverride_Sync(blob) {
        const context = 'ObjectURLSync';
        const blobType = blob?.type || 'unknown';
        const blobSize = blob?.size || 0;

        // Проверяем, включено ли внедрение и является ли объект Blob'ом с типом javascript/worker
        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker') || blobType === '')) {
             if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
             try {
                 // ВАЖНО: Синхронная модификация Blob здесь невозможна или очень сложна.
                 // Мы просто возвращаем оригинальный URL. Основная логика внедрения
                 // сработает при перехвате конструктора Worker (hookWorkerConstructor).
                 logDebug(context, "Синхронная модификация Blob невозможна. Возвращаем оригинальный URL. Логика внедрения сработает в hookWorkerConstructor.");
                 return originalCreateObjectURL.call(unsafeWindow.URL, blob);
             } catch (error) {
                 logError(context, 'Неожиданная ошибка при синхронной обработке Blob:', error);
                 return originalCreateObjectURL.call(unsafeWindow.URL, blob); // Возвращаем оригинал при ошибке
             }
        } else {
             // Пропускаем другие типы объектов
             if (blob instanceof Blob) {
                 logTrace(context, `Пропуск createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
             } else {
                 logTrace(context, `Пропуск createObjectURL для не-Blob объекта.`);
             }
             return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        }
    } // end createObjectURLOverride_Sync

    // Добавление слушателей сообщений к экземпляру Worker'а
    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return; // Проверка валидности и однократного добавления
        workerInstance._listenersAddedByAdblock = true; // Флаг, что слушатели добавлены
        const context = 'WorkerMsg';

        // Слушатель ошибок Worker'а
        workerInstance.addEventListener('error', (e) => {
            logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e);
        });

        // Основной слушатель сообщений от Worker'а
        const adBlockListener = (e) => {
            const messageData = e.data;
            // Обработка сообщения о готовности хуков в Worker'е
            if (messageData?.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                logInfo('WorkerHook', `---> ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${messageData.method || 'unknown'}`);
                hookedWorkers.add(label); // Добавляем Worker в список успешно "зараженных"
            }
            // Обработка сообщения об удалении рекламы в Worker'е
            else if (messageData?.type === 'ADBLOCK_ADS_REMOVED') {
                if (LOG_M3U8_CLEANING) logInfo('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${messageData.isMidroll}. URL: ${messageData.url}`);
                if (OPT_SHOW_AD_BANNER) {
                    showAdBanner(messageData.isMidroll); // Показываем баннер
                }
            }
             // *** ОПТИМИЗАЦИЯ: Удалено избыточное TRACE логирование всех остальных сообщений ***
             // else {
             //     if (DEBUG_LOGGING) logTrace(context, `Сообщение ОТ Worker'а (${label}):`, messageData);
             // }
        };
        workerInstance.addEventListener('message', adBlockListener);
        workerInstance._adBlockListener = adBlockListener; // Сохраняем ссылку на слушатель для возможного удаления
        logDebug(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
    } // end addWorkerMessageListeners

    // Перехват конструктора Worker
    function hookWorkerConstructor() {
        if (!INJECT_INTO_WORKERS) {
            logWarn('WorkerHook', "Внедрение кода в Worker'ы отключено в настройках.");
            return;
        }
        if (unsafeWindow.Worker?.hooked_by_adblock) {
            logInfo('WorkerHook', "Конструктор Worker уже перехвачен.");
            return;
        }
        if (typeof unsafeWindow.Worker === 'undefined') {
            logError('WorkerHook', 'Конструктор Worker (unsafeWindow.Worker) не определен. Невозможно перехватить.');
            return;
        }

        logDebug('WorkerHook', "Попытка перехвата конструктора Worker...");
        workerHookAttempted = true;
        const OriginalWorkerClass = unsafeWindow.Worker; // Сохраняем оригинальный конструктор

        // Создаем новый класс-обертку
        unsafeWindow.Worker = class HookedWorker extends OriginalWorkerClass {
            constructor(scriptURL, options) {
                let urlString = '';
                let isBlobURL = false;
                let workerLabel = 'unknown'; // Метка для логов
                let targetScriptURL = scriptURL; // URL, который будет передан в super()

                // Определяем источник Worker'а (URL или Blob)
                try {
                    if (scriptURL instanceof URL) { urlString = scriptURL.href; isBlobURL = urlString.startsWith('blob:'); }
                    else if (typeof scriptURL === 'string') { urlString = scriptURL; isBlobURL = urlString.startsWith('blob:'); }

                    if (isBlobURL) { workerLabel = `blob:${urlString.substring(5, 35)}...`; } // Укороченный Blob URL
                    else if (urlString) { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); } // Имя файла или начало URL
                    else { workerLabel = `non-url-source (${typeof scriptURL})`; } // Нестандартный источник

                    if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : (urlString ? 'Script URL' : 'Unknown')}`);

                    // --- ВНЕДРЕНИЕ КОДА ---
                    // Если Worker создается из Blob URL, предполагается, что Blob был модифицирован
                    // (хотя в текущей реализации createObjectURLOverride_Sync этого не делает,
                    // но логика остается на случай будущих изменений или альтернативных методов).
                    // Если Worker создается из внешнего URL, используем запасной метод postMessage.
                    if (isBlobURL && INJECT_INTO_WORKERS) {
                       // Здесь можно было бы попытаться асинхронно прочитать Blob и внедрить код перед вызовом super(),
                       // но это сложно и может нарушить работу страницы.
                       // Текущая стратегия полагается на то, что хук сработает при инициализации Worker'а
                       // или через запасной механизм postMessage, если он создан не из Blob.
                       logDebug('WorkerHook', `Worker (${workerLabel}) создан из Blob URL. Ожидаем подтверждения хуков изнутри Worker'а...`);
                    }

                } catch (e) {
                    logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL);
                    workerLabel = 'error-determining-source';
                }

                // Вызываем оригинальный конструктор Worker
                super(targetScriptURL, options);
                this._workerLabel = workerLabel; // Сохраняем метку в экземпляре

                // Добавляем наши слушатели к новому Worker'у
                addWorkerMessageListeners(this, workerLabel);

                 // --- ЗАПАСНОЙ МЕХАНИЗМ ВНЕДРЕНИЯ через postMessage ---
                 // Срабатывает, если Worker создан НЕ из Blob URL (или если хук createObjectURL не сработал как ожидалось)
                 // и если этот Worker еще не подтвердил установку хуков.
                 if (!isBlobURL && urlString && INJECT_INTO_WORKERS) {
                      // Небольшая задержка, чтобы Worker успел инициализироваться
                      setTimeout(() => {
                          if (!hookedWorkers.has(this._workerLabel)) {
                              if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук createObjectURL не применился). Запасная попытка внедрения через postMessage...`);
                              try {
                                   const injectionCode = getWorkerInjectionCode();
                                   this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode }); // Отправляем код для eval()
                              } catch(e) {
                                   logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e);
                              }
                          } else {
                              if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков (запасной механизм не требуется).`);
                          }
                      }, 500); // Задержка 500 мс
                 }
            } // end constructor
        }; // end class HookedWorker

        // Восстанавливаем прототип и статические свойства для совместимости
        Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass);
        Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype);
        unsafeWindow.Worker.hooked_by_adblock = true; // Ставим флаг
        logInfo('WorkerHook', "Конструктор Worker успешно перехвачен.");
    } // end hookWorkerConstructor


    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК) (Без изменений) ---
    function installHooks() {
        if (hooksInstalledMain) { logWarn('Hooks', "Попытка повторной установки хуков."); return; }
        logInfo('Hooks', "Установка перехватов в основном потоке...");

        try { unsafeWindow.fetch = fetchOverride; logDebug('Hooks', "Перехват Fetch API установлен.");
        } catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; } // Восстанавливаем при ошибке

        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; logDebug('Hooks', "Перехваты XMLHttpRequest (open, send) установлены.");
        } catch (e) { logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; }

        if (INJECT_INTO_WORKERS) {
            try { unsafeWindow.URL.createObjectURL = createObjectURLOverride_Sync; logInfo('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН (Синхронный, без модификации Blob).");
            } catch (e) { logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }

            try { hookWorkerConstructor(); // Устанавливаем перехват конструктора Worker
            } catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            try { unsafeWindow.URL.revokeObjectURL = function(url) { logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`); return originalRevokeObjectURL.call(unsafeWindow.URL, url); }; logDebug('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен.");
            } catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else {
             logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются.");
        }

        hooksInstalledMain = true;
        logInfo('Hooks', "Установка перехватов в основном потоке завершена.");
    } // end installHooks


    // --- **ФУНКЦИИ МОНИТОРИНГА И ПЕРЕЗАГРУЗКИ ПЛЕЕРА (ВОЗВРАЩЕНЫ)** ---

    // Поиск видеоэлемента на странице
    function findVideoPlayer() {
        const selectors = [
            PLAYER_SELECTOR, // 'video'
            '.video-player__container video',
            'div[data-a-target="video-player"] video',
            'div[data-a-target="video-player-layout"] video',
            '.persistent-player video' // Для режима мини-плеера
        ];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.tagName === 'VIDEO') {
                    logDebug('PlayerFinder', `Найден видеоэлемент по селектору: ${selector}`);
                    return element;
                }
            } catch (e) {
                logWarn('PlayerFinder', `Ошибка поиска по селектору "${selector}":`, e.message);
            }
        }
        logDebug('PlayerFinder', 'Видеоэлемент не найден ни по одному из селекторов.');
        return null;
    } // end findVideoPlayer

    // Функция перезагрузки страницы
    function triggerReload(reason) {
        const context = 'PlayerReload';
        const now = Date.now();

        // Отменяем предыдущий таймаут перезагрузки, если он есть
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }

        // Проверка кулдауна
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn(context, `Перезагрузка запрошена (${reason}), но кулдаун (${RELOAD_COOLDOWN_MS / 1000}с) еще активен. Отмена.`);
            return;
        }

        // Не перезагружаем, если вкладка неактивна
        if (document.hidden) {
            logWarn(context, `Перезагрузка запрошена (${reason}), но вкладка неактивна. Отмена.`);
            return;
        }

        logWarn(context, `!!! ПЕРЕЗАГРУЗКА СТРАНИЦЫ !!! Причина: ${reason}.`);
        lastReloadTimestamp = now; // Обновляем время последней перезагрузки

        // Сохраняем время перезагрузки в sessionStorage для кулдауна после перезагрузки
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); }
        catch (e) { logError(context, "Не удалось записать время перезагрузки в sessionStorage:", e); }

        // Перезагружаем страницу
        unsafeWindow.location.reload();
    } // end triggerReload

    // Сброс состояния мониторинга (при возобновлении/паузе/начале)
    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) {
            clearTimeout(reloadTimeoutId);
            reloadTimeoutId = null;
            logDebug('PlayerMonitor', `Отменен запланированный reload (${reason}).`);
        }
        lastVideoTimeUpdateTimestamp = Date.now(); // Сбрасываем время последнего обновления
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1; // Обновляем время
        isWaitingForDataTimestamp = 0; // Сбрасываем флаг ожидания
    } // end resetMonitorState

    // Основная функция мониторинга состояния плеера
    function monitorPlayerState() {
        const context = 'PlayerMonitor';
        // Перепроверяем наличие видеоэлемента
        if (!videoElement || !document.body.contains(videoElement)) {
            logWarn(context, 'Видеоэлемент потерян. Попытка перенастроить монитор...');
            setupPlayerMonitor(); // Пытаемся найти его снова
            return;
        }

        const now = Date.now();
        const isPlaying = !videoElement.paused && !videoElement.ended;
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState; // Состояние готовности плеера
        let stallReason = null; // Причина зависания

        // 1. Проверка на зависание (Stall Detection) - только если плеер должен играть
        if (isPlaying && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;

            // Условие 1: Время не идет вперед
            if (currentTime <= lastKnownVideoTime) {
                if (timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                    stallReason = `currentTime (${currentTime.toFixed(2)}) не обновлялся > ${RELOAD_STALL_THRESHOLD_MS / 1000}с`;
                }
            }
            // Условие 2: Состояние плеера недостаточно для воспроизведения (буферизация?)
            else if (readyState < videoElement.HAVE_CURRENT_DATA) { // HAVE_CURRENT_DATA = 2
                 if (timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                      stallReason = `readyState (${readyState}) < HAVE_CURRENT_DATA в течение ${RELOAD_STALL_THRESHOLD_MS / 1000}с`;
                 }
            }
            // Если время идет вперед и состояние ОК, сбрасываем таймеры
            else if (currentTime > lastKnownVideoTime) {
                lastKnownVideoTime = currentTime;
                lastVideoTimeUpdateTimestamp = now; // Обновляем время последнего 'живого' кадра
                if (reloadTimeoutId) { // Если была запланирована перезагрузка, отменяем
                     logInfo(context, "Воспроизведение возобновилось (timeupdate/readyState OK). Отмена перезагрузки.");
                     clearTimeout(reloadTimeoutId);
                     reloadTimeoutId = null;
                }
                if (isWaitingForDataTimestamp > 0 && readyState > 0) {
                     isWaitingForDataTimestamp = 0; // Сбрасываем таймер буферизации
                }
            }

            // Если обнаружено зависание и перезагрузка еще не запланирована
            if (stallReason && !reloadTimeoutId) {
                 logWarn(context, `Обнаружено зависание плеера! Причина: ${stallReason}.`);
                 logWarn(context, `Планируем перезагрузку через 5 секунд (причина: ${stallReason})...`);
                 reloadTimeoutId = setTimeout(() => triggerReload(stallReason), 5000);
                 return; // Выходим, чтобы не проверять буферизацию
            }
        }

        // 2. Проверка на длительную буферизацию (Buffering Detection)
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
             if (now - isWaitingForDataTimestamp > RELOAD_BUFFERING_THRESHOLD_MS) {
                 const bufferReason = `Буферизация/Ожидание данных > ${RELOAD_BUFFERING_THRESHOLD_MS / 1000}с (readyState: ${readyState})`;
                 logWarn(context, `Обнаружена длительная буферизация! ${bufferReason}`);
                 if (!reloadTimeoutId) { // Планируем перезагрузку, если еще не запланирована
                      logWarn(context, `Планируем перезагрузку через 5 секунд (причина: ${bufferReason})...`);
                      reloadTimeoutId = setTimeout(() => triggerReload(bufferReason), 5000);
                 }
                 return; // Выходим
             }
        }

        // 3. Сброс таймера буферизации, если воспроизведение идет и данных достаточно
        if (isPlaying && isWaitingForDataTimestamp > 0 && readyState >= videoElement.HAVE_FUTURE_DATA) { // HAVE_FUTURE_DATA = 3
             logDebug(context, `Буферизация завершена (readyState: ${readyState}). Сброс таймера ожидания.`);
             isWaitingForDataTimestamp = 0;
             if (reloadTimeoutId) { // Отменяем перезагрузку, если она была запланирована из-за буферизации
                  logInfo(context, "Воспроизведение возобновилось после буферизации. Отмена перезагрузки.");
                  clearTimeout(reloadTimeoutId);
                  reloadTimeoutId = null;
             }
        }
    } // end monitorPlayerState

    // Настройка мониторинга плеера (поиск элемента, добавление слушателей)
    function setupPlayerMonitor() {
        if (!ENABLE_AUTO_RELOAD) {
            logInfo('PlayerMonitor', 'Авто-перезагрузка отключена в настройках.');
            // Убираем интервал и слушатели, если они были
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) {
                videoElement.removeEventListener('error', handlePlayerError);
                videoElement.removeEventListener('waiting', handlePlayerWaiting);
                videoElement.removeEventListener('playing', handlePlayerPlaying);
                videoElement.removeEventListener('pause', handlePlayerPause);
                videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
                videoElement = null;
            }
            return;
        }

        const context = 'PlayerMonitorSetup';
        const currentVideoElement = findVideoPlayer();

        // Если элемент тот же и мониторинг уже идет, ничего не делаем
        if (currentVideoElement === videoElement && playerMonitorIntervalId) { return; }

        // Останавливаем предыдущий монитор, если он был
        if (playerMonitorIntervalId) {
            logInfo(context, 'Остановка предыдущего монитора плеера.');
            clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
        }
        // Удаляем слушатели со старого элемента, если он был
        if (videoElement) {
            videoElement.removeEventListener('error', handlePlayerError);
            videoElement.removeEventListener('waiting', handlePlayerWaiting);
            videoElement.removeEventListener('playing', handlePlayerPlaying);
            videoElement.removeEventListener('pause', handlePlayerPause);
            videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
            logDebug(context, 'Старые слушатели событий плеера удалены.');
        }

        videoElement = currentVideoElement; // Обновляем ссылку на видеоэлемент

        // Если элемент не найден, пробуем позже
        if (!videoElement) {
            logDebug(context, 'Видеоэлемент не найден. Повторная попытка через 3 секунды.');
            setTimeout(setupPlayerMonitor, 3000);
            return;
        }

        logInfo(context, 'Видеоэлемент найден. Установка слушателей событий и запуск мониторинга...');

        // Проверка кулдауна после предыдущей перезагрузки (из sessionStorage)
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const timeSinceLastReload = Date.now() - parseInt(sessionReloadTime, 10);
                if (timeSinceLastReload < RELOAD_COOLDOWN_MS) {
                    logWarn(context, `Обнаружена недавняя перезагрузка (${(timeSinceLastReload / 1000).toFixed(1)}с назад). Устанавливаем кулдаун.`);
                    // Устанавливаем lastReloadTimestamp так, чтобы кулдаун действовал
                    lastReloadTimestamp = Date.now() - timeSinceLastReload + RELOAD_COOLDOWN_MS;
                }
                sessionStorage.removeItem('ttv_adblock_last_reload'); // Удаляем запись
            }
        } catch (e) { logError(context, "Ошибка чтения времени перезагрузки из sessionStorage:", e); }

        // Добавляем слушатели событий плеера
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true }); // Начало буферизации
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true }); // Начало/возобновление воспроизведения
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });   // Пауза
        videoElement.addEventListener('timeupdate', handlePlayerTimeUpdate, { passive: true }); // Обновление времени (не используется напрямую для перезагрузки, но полезно для сброса таймеров)

        resetMonitorState('Initial setup'); // Сбрасываем состояние при старте
        playerMonitorIntervalId = setInterval(monitorPlayerState, 2000); // Запускаем интервал проверки
        logInfo(context, `Мониторинг плеера запущен (Интервал: 2000мс, Порог зависания/readyState: ${RELOAD_STALL_THRESHOLD_MS}мс, Порог буферизации: ${RELOAD_BUFFERING_THRESHOLD_MS}мс).`);
    } // end setupPlayerMonitor

    // Обработчик события ошибки плеера
    function handlePlayerError(event) {
        const context = 'PlayerEvent:Error';
        if (!videoElement || !videoElement.error) {
            logWarn(context, 'Событие ошибки получено, но объект ошибки отсутствует.');
            return;
        }
        const error = videoElement.error;
        logError(context, `Ошибка плеера! Код: ${error.code}, Сообщение: "${error.message}"`);

        // Перезагружаем только при определенных кодах ошибки
        if (RELOAD_ON_ERROR_CODES.includes(error.code)) {
            const errorReason = `Ошибка плеера (код ${error.code})`;
            logWarn(context, `Ошибка (код ${error.code}) требует перезагрузки.`);
            if (!reloadTimeoutId) { // Планируем перезагрузку, если еще не запланирована
                logWarn(context, `Планируем перезагрузку через 3 секунды (причина: ${errorReason})...`);
                reloadTimeoutId = setTimeout(() => triggerReload(errorReason), 3000);
            }
        } else {
            logWarn(context, `Ошибка (код ${error.code}) не входит в список для перезагрузки (${RELOAD_ON_ERROR_CODES.join(',')}).`);
        }
    } // end handlePlayerError

    // Обработчик события ожидания данных (буферизации)
    function handlePlayerWaiting() {
        const context = 'PlayerEvent:Waiting';
        // Запускаем таймер буферизации только если плеер действительно ждет данных
        // и таймер еще не запущен
        if (videoElement && videoElement.readyState < videoElement.HAVE_FUTURE_DATA && isWaitingForDataTimestamp === 0) {
            logDebug(context, `Плеер начал буферизацию/ожидание (readyState: ${videoElement.readyState}). Запуск таймера.`);
            isWaitingForDataTimestamp = Date.now();
        } else if (isWaitingForDataTimestamp === 0) {
             logTrace(context, `Событие 'waiting', но readyState (${videoElement?.readyState}) достаточный или таймер уже запущен. Игнорируем.`);
        }
    } // end handlePlayerWaiting

    // Обработчик начала/возобновления воспроизведения
    function handlePlayerPlaying() {
        logDebug('PlayerEvent:Playing', 'Воспроизведение началось/возобновилось.');
        resetMonitorState('Playing event'); // Сбрасываем все таймеры и состояние
    } // end handlePlayerPlaying

    // Обработчик паузы
    function handlePlayerPause() {
        logDebug('PlayerEvent:Pause', 'Воспроизведение приостановлено.');
        resetMonitorState('Pause event'); // Сбрасываем таймеры, но не трогаем lastKnownVideoTime
    } // end handlePlayerPause

    // Обработчик обновления времени (для отслеживания зависаний)
    function handlePlayerTimeUpdate() {
        // Просто обновляем время последнего известного кадра
        if (videoElement) {
            const currentTime = videoElement.currentTime;
            // Небольшая оптимизация: обновляем только если время действительно идет вперед
            if (currentTime > lastKnownVideoTime) {
                lastKnownVideoTime = currentTime;
                // Не сбрасываем lastVideoTimeUpdateTimestamp здесь, это делается в monitorPlayerState
            }
        }
    } // end handlePlayerTimeUpdate


    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА (ВОЗВРАЩЕН вызов setupPlayerMonitor) ---
    logInfo('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);

    // Добавление стилей для баннера
    if (OPT_SHOW_AD_BANNER) {
        try { GM_addStyle(`.tch-adblock-banner { position: absolute; top: 10px; left: 10px; z-index: 2000; pointer-events: none; display: none; color: white; background-color: rgba(0, 0, 0, 0.8); padding: 6px 12px; font-size: 13px; border-radius: 5px; font-family: Roobert, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); text-align: center; opacity: 0; transition: opacity 0.5s ease-in-out; }`); logInfo('Init', "Стили для баннера добавлены."); }
        catch (e) { logError('Init', "Не удалось добавить стили для баннера:", e); }
    }

    // Установка основных сетевых перехватов
    installHooks();

    // Первоначальная установка качества "Источник"
    setQualitySettings();

    // Слушатель изменения видимости вкладки (для повторной установки качества и перезапуска монитора)
    try {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { // Вкладка стала видимой
                 logInfo('QualityV2Enhanced', "Вкладка стала видимой. Повторная установка качества 'Источник'.");
                 setQualitySettings();
                 if (ENABLE_AUTO_RELOAD) {
                      logDebug('PlayerMonitor', 'Перезапуск монитора плеера из-за visibilitychange.');
                      setupPlayerMonitor(); // Перезапускаем монитор
                 }
            } else { // Вкладка стала невидимой
                 if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) {
                      logDebug('PlayerMonitor', 'Вкладка скрыта. Остановка монитора плеера.');
                      clearInterval(playerMonitorIntervalId); // Останавливаем монитор
                      playerMonitorIntervalId = null;
                 }
            }
        }, { passive: true });
        logInfo('Init', "Слушатель 'visibilitychange' для качества и монитора установлен.");
    } catch (e) { logError('Init', "Не удалось добавить слушатель 'visibilitychange':", e); }

    // Слушатели изменения истории навигации (для повторной установки качества и перезапуска монитора при SPA-переходах)
    try {
        const handleStateChange = () => {
            // Небольшая задержка, чтобы дать странице обновиться после навигации
            setTimeout(() => {
                logInfo('QualityV2Enhanced', "Обнаружено изменение состояния навигации (pushState/replaceState/popstate). Повторная установка качества 'Источник'.");
                setQualitySettings();
                if (ENABLE_AUTO_RELOAD) {
                     logDebug('PlayerMonitor', 'Перезапуск монитора плеера из-за изменения истории навигации.');
                     setupPlayerMonitor(); // Перезапускаем монитор при смене URL
                }
            }, 500); // Задержка 500 мс
        };
        // Перехватываем pushState и replaceState
        const originalPushState = history.pushState;
        history.pushState = function(...args) { originalPushState.apply(this, args); handleStateChange(); };
        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) { originalReplaceState.apply(this, args); handleStateChange(); };
        // Слушаем событие popstate (нажатие кнопок Назад/Вперед)
        unsafeWindow.addEventListener('popstate', handleStateChange, { passive: true });
        logInfo('Init', "Слушатели 'pushState', 'replaceState', 'popstate' для качества и монитора установлены.");
    } catch (e) { logError('Init', "Не удалось добавить слушатели истории навигации:", e); }

    // Запуск периодической проверки и установки качества
    if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) {
        if (qualitySetIntervalId) { clearInterval(qualitySetIntervalId); qualitySetIntervalId = null; } // Останавливаем предыдущий, если есть
        qualitySetIntervalId = setInterval(() => {
            logDebug('QualityV2Enhanced', `Периодическая проверка качества (интервал: ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс).`);
            setQualitySettings();
        }, PERIODIC_QUALITY_CHECK_INTERVAL_MS);
        logInfo('Init', `Периодическая проверка качества 'Источник' запущена с интервалом ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс.`);
    } else {
        logInfo('Init', `Периодическая проверка качества отключена или интервал некорректен.`);
    }

    // Запуск мониторинга плеера после загрузки DOM
    function onDomReady() {
        logInfo('Init', "DOM готов (DOMContentLoaded). Запуск первичной настройки монитора плеера.");
        setupPlayerMonitor(); // **Вызов setupPlayerMonitor ВОЗВРАЩЕН**
    }
    if (document.readyState === 'loading') { // Если DOM еще не готов, ждем события
        window.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else { // Если DOM уже готов, запускаем сразу
        onDomReady();
    }

    logInfo('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);

})();