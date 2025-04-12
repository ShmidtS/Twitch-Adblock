// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality (v17.1.1)
// @namespace    TwitchAdblockOptimizedWorkerM3U8ProxyV17_1_ForceSource
// @version      17.1.1
// @description  Блокировка рекламы Twitch через Worker + Автоматическая установка качества "Источник" (Source).
// @author       AI Generated & Adapted (Optimized + Force Source)
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
// @connect      *
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- НАСТРОЙКИ (Конфигурируемые через GM_setValue) ---
    const SCRIPT_VERSION = '17.1.1'; // Обновлена версия
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false); // Включить подробное логирование для отладки
    const SHOW_ERRORS = true; // Показывать ошибки в консоли
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true); // Логировать процесс очистки M3U8 в Worker'е
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', true); // Логировать блокировку рекламных/трекинговых URL
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false); // Логировать перехват GraphQL запросов (по умолчанию выключено)
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true); // Логировать процесс внедрения кода в Worker'ы
    const LOG_FORCE_QUALITY = GM_getValue('TTV_AdBlock_LogForceQuality', true); // Логировать процесс установки качества
    const OPT_SHOW_AD_BANNER = GM_getValue('TTV_AdBlock_ShowBanner', true); // Показывать баннер "Реклама удалена"
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true); // Включать/выключать попытки внедрения в Worker'ы
    const ENABLE_FORCE_SOURCE_QUALITY = GM_getValue('TTV_AdBlock_ForceSource', true); // Включить/выключить принудительную установку качества "Источник"

    // --- КОНСТАНТЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';

    // Списки для идентификации и блокировки (оставлены без изменений)
    const AD_SIGNIFIER_DATERANGE = 'stitched-ad';
    const AD_SIGNIFIERS_TAGS = ['#EXT-X-DATERANGE', '#EXT-X-DISCONTINUITY', '#EXT-X-CUE-OUT', '#EXT-X-CUE-IN', '#EXT-X-SCTE35', '#EXT-X-ASSET'];
    const AD_URL_KEYWORDS_BLOCK = ['amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com', 'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag', 'ttvl-o.cloudfront.net', 'd2v02itv0y9u9t.cloudfront.net', 'fastly.net/ad'];
    const AD_URL_KEYWORDS_WARN = ['player-ad-', 'isp-signal', 'adlanding', 'adurl', 'adserver'];

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    var adBannerElement = null;
    var hooksInstalledMain = false;
    var workerHookAttempted = false;
    var hookedWorkers = new Set();
    var qualityObserver = null; // Для MutationObserver
    var playerInstanceCache = null; // Кешируем найденный экземпляр плеера

    // Оригинальные функции (оставлены без изменений)
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const OriginalEventSource = unsafeWindow.EventSource;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;

    // --- ЛОГИРОВАНИЕ ---
    // Добавляем новый тип лога для качества
    function logError(source, message, ...args) { if (SHOW_ERRORS) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logInfo(source, message, ...args) { console.info(`${LOG_PREFIX} [${source}] INFO:`, message, ...args); }
    function logDebug(source, message, ...args) { if (DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logTrace(source, message, ...args) { if (DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args); }
    function logQuality(message, ...args) { if (LOG_FORCE_QUALITY) console.info(`${LOG_PREFIX} [Quality] INFO:`, message, ...args); }
    function logQualityDebug(message, ...args) { if (LOG_FORCE_QUALITY && DEBUG_LOGGING) console.log(`${LOG_PREFIX} [Quality] DEBUG:`, message, ...args); }


    logInfo('MAIN', `Скрипт запускается. Версия: ${SCRIPT_VERSION}. Метод: Optimized Worker M3U8 Proxy + Force Source. Debug: ${DEBUG_LOGGING}. Worker Inject: ${INJECT_INTO_WORKERS}. Force Quality: ${ENABLE_FORCE_SOURCE_QUALITY}.`);

    // --- УПРАВЛЕНИЕ БАННЕРОМ (без изменений) ---
    function getAdDiv() { /* ... код без изменений ... */
        logTrace("Banner", "getAdDiv вызвана");
        if (!OPT_SHOW_AD_BANNER) return null;
        if (adBannerElement && document.body.contains(adBannerElement)) { return adBannerElement; }
        adBannerElement = document.querySelector('.tch-adblock-banner');
        if (adBannerElement) { logDebug("Banner", "Найден существующий баннер."); return adBannerElement; }
        try {
            const playerRootDiv = document.querySelector('.video-player__container') || document.querySelector('.video-player .persistent-player') || document.querySelector('div[data-a-target="video-player-layout"]') || document.querySelector('div[data-a-target="video-player"]') || document.querySelector('.video-player') || document.body;
            if (!playerRootDiv || !(playerRootDiv instanceof Node)) { logWarn("Banner", "Не удалось найти валидный контейнер плеера для баннера."); return null; }
            const div = document.createElement('div');
            div.className = 'tch-adblock-banner';
            playerRootDiv.appendChild(div);
            adBannerElement = div;
            logInfo("Banner", "Баннер успешно создан и добавлен.");
            return adBannerElement;
        } catch (e) { logError("Banner", "Ошибка создания баннера:", e); adBannerElement = null; return null; }
    }
    function showAdBanner(isMidroll) { /* ... код без изменений ... */
        logTrace("Banner", `showAdBanner вызвана. isMidroll: ${isMidroll}`);
        if (!OPT_SHOW_AD_BANNER) return;
        const adDiv = getAdDiv();
        if (adDiv) {
            requestAnimationFrame(() => {
                try {
                    const bannerText = `Реклама удалена v${SCRIPT_VERSION.substring(0, 6)}` + (isMidroll ? ' (midroll)' : ''); // Короче версия в баннере
                    adDiv.textContent = bannerText;
                    adDiv.style.display = 'block';
                    logInfo("Banner", "Баннер показан (сигнал из Worker). Текст:", bannerText);
                } catch(e) { logError("Banner", "Ошибка отображения баннера:", e); adBannerElement = null; }
            });
        } else { logWarn("Banner", "Не удалось получить/создать баннер для показа."); }
    }
    function hideAdBanner() { /* ... код без изменений ... */
        logTrace("Banner", "hideAdBanner вызвана");
        if (!OPT_SHOW_AD_BANNER) return;
        const adDiv = adBannerElement || document.querySelector('.tch-adblock-banner');
        if (adDiv && adDiv.style.display !== 'none') {
            requestAnimationFrame(() => {
                try {
                    adDiv.style.display = 'none';
                    logInfo("Banner", "Баннер скрыт.");
                } catch(e) { logError("Banner", "Ошибка скрытия баннера:", e); }
            });
        }
    }

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА ---

    // 1. Метод через localStorage (оставлен как есть)
    function setQualitySettingsLocalStorage() {
        logTrace('Quality', "setQualitySettingsLocalStorage вызвана");
        try {
            const qualitySettings = {
                default: 'chunked', // 'chunked' обычно соответствует Source/Исходному качеству
                restricted: null,
                adaptive: false // Отключаем адаптивное изменение качества
            };
            unsafeWindow.localStorage.setItem(LS_KEY_QUALITY, JSON.stringify(qualitySettings));
            logQuality(`Попытка установить качество через localStorage:`, qualitySettings);
        } catch (e) {
            logError('Quality', 'Ошибка установки настроек качества в localStorage:', e);
        }
    }

    // 2. Основной метод - через Player API
    function findPlayerInstance() {
        if (playerInstanceCache) return playerInstanceCache; // Возвращаем кеш, если есть

        logQualityDebug("Поиск экземпляра плеера...");
        const playerElement = document.querySelector('.video-player'); // Основной селектор
        if (!playerElement) {
             logQualityDebug("Элемент '.video-player' не найден.");
             return null;
        }

        // Эвристики для поиска React/внутреннего экземпляра
        const reactKey = Object.keys(playerElement).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (!reactKey) {
             logQualityDebug("React key ('__reactFiber$' или '__reactInternalInstance$') не найден на элементе плеера.");
             return null; // Не React или структура изменилась
        }

        let instance = playerElement[reactKey];
        if (!instance) {
            logQualityDebug("Экземпляр React не найден по ключу:", reactKey);
            return null;
        }

        logQualityDebug("Поиск объекта плеера во вложенной структуре React...");
        // Поиск может потребовать обхода дерева вверх или вниз
        // Ищем свойство 'player' или методы типа 'getQualities', 'setQuality'
        // Максимальная глубина поиска, чтобы избежать бесконечных циклов
        const MAX_DEPTH = 15;
        let depth = 0;
        let queue = [instance];
        let visited = new Set(); // Для предотвращения циклов

        while (queue.length > 0 && depth < MAX_DEPTH) {
            let current = queue.shift();
            if (!current || visited.has(current)) continue;
            visited.add(current);

            // Проверяем сам объект и его 'stateNode', 'memoizedProps', 'child', 'sibling'
            const candidates = [current, current.stateNode, current.memoizedProps];
            for (const candidate of candidates) {
                 if (candidate && typeof candidate.getQualities === 'function' && typeof candidate.setQuality === 'function') {
                      logQualityDebug("Найден подходящий экземпляр плеера на глубине:", depth, candidate);
                      playerInstanceCache = candidate; // Кешируем
                      return candidate;
                 }
                 // Добавляем дочерние и соседние узлы для поиска
                 if (candidate?.child) queue.push(candidate.child);
                 if (candidate?.sibling) queue.push(candidate.sibling);
                 // Иногда плеер находится в return (родительском) компоненте
                 if(current.return && !visited.has(current.return)) queue.push(current.return);
            }
            depth++;
        }

        logWarn('Quality', "Не удалось найти рабочий экземпляр плеера Twitch с методами getQualities/setQuality после поиска.");
        return null;
    }


    function forceSourceQualityViaAPI() {
        logQuality("Запуск forceSourceQualityViaAPI...");
        const player = findPlayerInstance();

        if (!player) {
            logWarn('Quality', "Экземпляр плеера не найден или недоступен для установки качества через API.");
            return;
        }

        try {
            if (typeof player.getQualities !== 'function') {
                logWarn('Quality', "Метод player.getQualities() не найден. Невозможно определить 'Source'.");
                return;
            }

            const qualities = player.getQualities();
            logQualityDebug("Доступные качества:", JSON.stringify(qualities));

            if (!qualities || qualities.length === 0) {
                logWarn('Quality', "Список доступных качеств пуст или не получен.");
                return;
            }

            // Ищем качество "Источник" (Source)
            // 1. Пробуем найти по group === 'chunked' (старый метод, может не работать)
            // 2. Если не найдено, берем первое качество в списке (часто это Source)
            // 3. ИЛИ ищем качество с максимальным битрейтом/высотой (более надежно, но сложнее)
            let sourceQuality = qualities.find(q => q.group === 'chunked');
            if (!sourceQuality && qualities.length > 0) {
                 // Берём первое качество как наиболее вероятный Source
                 sourceQuality = qualities[0];
                 logQualityDebug("Качество с group='chunked' не найдено, используем первое качество из списка как 'Source'.");
            }

            // Альтернатива: Ищем качество с максимальной высотой (если разрешение известно)
             /*
             let bestQuality = null;
             let maxHeight = 0;
             for (const q of qualities) {
                  if (q.height > maxHeight) {
                      maxHeight = q.height;
                      bestQuality = q;
                  }
             }
             if (bestQuality) {
                sourceQuality = bestQuality;
                logQualityDebug("Найдено качество с максимальной высотой:", maxHeight, sourceQuality);
             }
            */


            if (!sourceQuality) {
                logWarn('Quality', "Не удалось идентифицировать качество 'Источник'.");
                return;
            }

            if (typeof player.setQuality !== 'function') {
                logWarn('Quality', "Метод player.setQuality() не найден. Невозможно установить качество.");
                return;
            }

            // Проверяем текущее качество, чтобы не устанавливать его повторно без надобности
            let currentQuality = null;
             try {
                 if (typeof player.getQuality === 'function') {
                     currentQuality = player.getQuality();
                     logQualityDebug("Текущее качество:", JSON.stringify(currentQuality));
                 } else {
                     logQualityDebug("Метод player.getQuality() не найден.");
                 }
             } catch (e) { logWarn('Quality', "Ошибка получения текущего качества:", e); }

            // Сравниваем по group ID или другому уникальному идентификатору, если есть
            // Простое сравнение объектов может не сработать
            if (currentQuality && currentQuality.group === sourceQuality.group && currentQuality.name === sourceQuality.name) {
                 logQuality("Текущее качество уже установлено как 'Источник'. Пропуск установки.");
                 return;
            }

            logQuality(`Попытка установить качество 'Источник' через API:`, sourceQuality);
            player.setQuality(sourceQuality.group); // Twitch API часто ожидает 'group' ID [1, 9]

            // Небольшая задержка для проверки результата (опционально)
            setTimeout(() => {
                try {
                     if (typeof player.getQuality === 'function') {
                        const finalQuality = player.getQuality();
                        if (finalQuality && finalQuality.group === sourceQuality.group) {
                             logQuality(`Качество успешно установлено на '${finalQuality.name}' (${finalQuality.group}).`);
                        } else {
                             logWarn('Quality', `Не удалось подтвердить установку качества. Текущее:`, finalQuality);
                        }
                    }
                } catch(e) { logWarn('Quality', "Ошибка проверки качества после установки:", e); }
            }, 1500); // Задержка в 1.5 секунды

        } catch (error) {
            logError('Quality', 'Ошибка при попытке установить качество через API плеера:', error);
        }
    }


    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER (без изменений) ---
    function getWorkerInjectionCode() { /* ... код без изменений ... */
        return `
        // --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
        const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
        const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
        const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
        const AD_SIGNIFIER_DATERANGE_WORKER = '${AD_SIGNIFIER_DATERANGE}';
        const AD_SIGNIFIERS_TAGS_WORKER = ${JSON.stringify(AD_SIGNIFIERS_TAGS)};

        const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';
        function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
        function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
        function workerLogInfo(message, ...args) { console.info(LOG_PREFIX_WORKER_BASE + ' INFO:', message, ...args); }
        function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
        function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }

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
                if (!trimmedLine) { if (isAdSection) workerLogTrace(\`[\${context}] (\${urlShort}): Пустая строка [\${i}], возможно конец рекламной секции.\`); cleanLines.push(line); continue; }
                let isAdMarker = false;
                if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && trimmedLine.includes(AD_SIGNIFIER_DATERANGE_WORKER)) { workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы [\${i}]\`); isAdSection = true; isAdMarker = true; adsFound = true; if (trimmedLine.includes('MIDROLL')) isMidrollAd = true; }
                else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) { workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер начала/ассета \${trimmedLine.split(':')[0]} [\${i}]\`); isAdSection = true; isAdMarker = true; adsFound = true; if (trimmedLine.includes('MIDROLL')) isMidrollAd = true; }
                else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) { workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]\`); isAdSection = false; isAdMarker = true; adsFound = true; }
                else if (isAdSection && trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) { workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY внутри рекламной секции [\${i}]\`); isAdMarker = true; adsFound = true; discontinuitySequence++; }
                if (isAdMarker) { linesRemoved++; if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удален рекламный маркер [\${i}]: \${trimmedLine.substring(0, 100)}\`); continue; }
                if (isAdSection) {
                    if (!trimmedLine.startsWith('#EXT-X-PROGRAM-DATE-TIME:') && !trimmedLine.startsWith('#EXT-X-MEDIA-SEQUENCE:') && !trimmedLine.startsWith('#EXT-X-TARGETDURATION:') && !trimmedLine.startsWith('#EXT-X-VERSION:') && !trimmedLine.startsWith('#EXT-X-PLAYLIST-TYPE:') && !trimmedLine.startsWith('#EXT-X-MEDIA:') && !trimmedLine.startsWith('#EXT-X-STREAM-INF:') && !trimmedLine.startsWith('#EXT-X-I-FRAME-STREAM-INF:') && !trimmedLine.startsWith('#EXT-X-ENDLIST') && !trimmedLine.startsWith('#EXTM3U')) {
                        linesRemoved++; if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удалена строка из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`); continue;
                    } else { workerLogWarn(\`[\${context}] (\${urlShort}): Важный тег [\${i}] (\${trimmedLine.split(':')[0]}) встречен внутри рекламной секции. Сброс флага isAdSection.\`); isAdSection = false; }
                }
                cleanLines.push(line);
            }
            const cleanedText = cleanLines.join('\\n');
            if (adsFound) {
                if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружен Midroll: \${isMidrollAd}.\`);
                try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e); }
            } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены. Плейлист не изменен.\`); }
            return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
        }

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
                    if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] Перехвачен GET запрос M3U8/Usher: \${urlShort}\`);
                    try {
                        const originalResponse = await workerRealFetch(input, init);
                        const clonedResponse = originalResponse.clone(); const contentType = clonedResponse.headers.get('Content-Type');
                        if (clonedResponse.ok && contentType && (contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || contentType.includes('vnd.apple.mpegurl'))) {
                             workerLogDebug(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: \${contentType}. Чтение и очистка...\`);
                             const m3u8Text = await clonedResponse.text();
                             if (!m3u8Text) { workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`); return originalResponse; }
                             const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);
                             const newHeaders = new Headers(originalResponse.headers); newHeaders.delete('Content-Length'); newHeaders.delete('ETag');
                             // newHeaders.set('X-Adblock-Status', cleaningResult.adsFound ? 'Cleaned' : 'Untouched');
                             return new Response(cleaningResult.cleanedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                        } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ НЕ M3U8 или НЕ OK (Статус: \${clonedResponse.status}, Тип: \${contentType}). Пропускаем.\`); return originalResponse; }
                    } catch (error) { workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error); return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" }); }
                } else { if (DEBUG_LOGGING_WORKER && !isSegmentRequest) workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET запрос: (\${method}) \${urlShort}\`); return workerRealFetch(input, init); }
            };
            self.fetch.hooked_by_adblock = true;
            workerLogInfo("Перехват fetch в Worker'е УСПЕШНО установлен.");
            return true;
        }

        self.addEventListener('message', function(e) { /* ... код без изменений ... */ });

        if (installWorkerFetchHook()) {
            try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY:", e); }
        } else { workerLogError("Не удалось установить перехват fetch в Worker'е при инициализации!"); }
        workerLogInfo("AdBlock Worker: Код внедрения успешно инициализирован.");
        // --- Worker AdBlock Code End ---
        `;
    }

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК - без изменений) ---
    async function fetchOverride(input, init) { /* ... код без изменений ... */
        const context = 'MainFetch'; let requestUrl = ''; let method = 'GET';
        if (input instanceof Request) { requestUrl = input.url; method = input.method; } else { requestUrl = String(input); }
        if (init && init.method) { method = init.method; }
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) { if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch запроса к: ${urlShort}`); return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by AdBlock)" })); }
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) { logDebug(context, `Обнаружен Fetch запрос (НЕ БЛОКИРОВАН): ${urlShort}`); }
        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
            try {
                if (method.toUpperCase() === 'POST' && init && init.body) {
                    let bodyData = init.body; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
                    let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                     if (operationName) { logDebug(context, `GraphQL Fetch: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN} (до выполнения)`); } }
                     else { logTrace(context, `GraphQL Fetch: Не удалось извлечь operationName. URL: ${urlShort}`); }
                } else { logTrace(context, `GraphQL Fetch: Не POST или нет тела. URL: ${urlShort}`); }
            } catch (e) { logWarn(context, 'Ошибка при логировании GraphQL Fetch:', e); }
        }
        try {
             const response = await originalFetch(input, init);
             if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
                  if (method.toUpperCase() === 'POST' && init && init.body) {
                       let bodyData = init.body; if (typeof bodyData === 'string') try {bodyData = JSON.parse(bodyData);} catch(e){}
                       let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                       if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Запрос ${GQL_OPERATION_ACCESS_TOKEN} выполнен. Статус: ${response.status}`); }
                  }
              }
             return response;
        } catch (error) { logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error); throw error; }
    }
    const xhrRequestData = new WeakMap();
    function xhrOpenOverride(method, url, async, user, password) { /* ... код без изменений ... */
        const context = 'MainXHR'; const urlString = String(url); const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString;
        xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort });
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) { if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR запроса к: ${urlShort}`); xhrRequestData.get(this).blocked = true; return; }
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) { logDebug(context, `Обнаружен XHR запрос (НЕ БЛОКИРОВАН): ${urlShort}`); }
        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) { logDebug(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`); }
        try { return originalXhrOpen.call(this, method, url, async, user, password); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error); throw error; }
    }
    function xhrSendOverride(data) { /* ... код без изменений ... */
        const context = 'MainXHR'; const requestInfo = xhrRequestData.get(this);
        if (!requestInfo) { logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала."); try { return originalXhrSend.call(this, data); } catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;} }
        const { method, url, urlShort, blocked } = requestInfo;
        if (blocked) { logWarn(context, `Завершение заблокированного XHR запроса к: ${urlShort}`); this.dispatchEvent(new ProgressEvent('error')); return; }
         if (LOG_GQL_INTERCEPTION && url.includes('/gql')) {
             try {
                 let bodyData = data; if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) { } }
                 let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                 if (operationName) { logDebug(context, `GraphQL XHR Send: ${operationName}`); if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Отправка XHR запроса ${GQL_OPERATION_ACCESS_TOKEN}`); } }
                 else { logTrace(context, `GraphQL XHR Send: Не удалось извлечь operationName. URL: ${urlShort}`); }
             } catch(e) { logWarn(context, 'Ошибка при логировании GraphQL XHR Send:', e); }
         }
        try { return originalXhrSend.call(this, data); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.send для ${urlShort}:`, error); throw error; }
    }

    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER (без изменений) ---
    function createObjectURLOverride(blob) { /* ... код без изменений ... */
        const context = 'ObjectURL'; const blobType = blob?.type || 'unknown'; const blobSize = blob?.size || 0;
        if (INJECT_INTO_WORKERS && blob instanceof Blob && blobType.includes('javascript')) {
            if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: ${blobType}, размер: ${blobSize}`);
            const readerPromise = new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target.result); reader.onerror = (e) => reject(new Error("FileReader error: " + e.target.error)); reader.readAsText(blob); });
            return readerPromise.then(originalCode => {
                const isLikelyVideoWorker = originalCode.includes('getVideoSegment') || originalCode.includes('wasmWorker') || originalCode.includes('hlsManifestService') || originalCode.includes('bandwidthEstimator') || originalCode.includes('manifestDemuxer') || (originalCode.includes('fetch') && originalCode.includes('postMessage'));
                if (isLikelyVideoWorker) {
                    if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob ПОХОЖ на целевой Worker. Попытка внедрения кода...`);
                    try { const injectionCode = getWorkerInjectionCode(); const modifiedCode = injectionCode + '\\n\\n// --- Original Worker Code Below ---\\n' + originalCode; const newBlob = new Blob([modifiedCode], { type: blobType }); const newUrl = originalCreateObjectURL.call(unsafeWindow.URL, newBlob); if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob успешно модифицирован и создан НОВЫЙ URL: ${newUrl.substring(0, 60)}... (Размер: ${newBlob.size})`); return newUrl; }
                    catch (e) { logError(context, '[Async] Ошибка создания нового Blob или URL после модификации:', e); return originalCreateObjectURL.call(unsafeWindow.URL, blob); }
                } else { if (LOG_WORKER_INJECTION) logDebug(context, `[Async] Blob НЕ похож на целевой Worker (маркеры не найдены). Возврат оригинального URL.`); return originalCreateObjectURL.call(unsafeWindow.URL, blob); }
            }).catch(error => { logError(context, '[Async] Ошибка чтения содержимого Blob:', error); return originalCreateObjectURL.call(unsafeWindow.URL, blob); });
        } else { if (blob instanceof Blob) { logTrace(context, `Пропуск createObjectURL для Blob типа: ${blobType}, размер: ${blobSize}`); } else { logTrace(context, `Пропуск createObjectURL для не-Blob объекта:`, blob); } return originalCreateObjectURL.call(unsafeWindow.URL, blob); }
    }
    function addWorkerMessageListeners(workerInstance, label) { /* ... код без изменений ... */
        if (!workerInstance || workerInstance._listenersAddedByAdblock) return;
         workerInstance._listenersAddedByAdblock = true; const context = 'WorkerMsg';
         if (DEBUG_LOGGING) { workerInstance.addEventListener('message', (e) => { logTrace(context, `Сообщение ОТ Worker'а (${label}):`, e.data); }); }
         workerInstance.addEventListener('error', (e) => { logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e); });
         const adBlockListener = (e) => {
             if (e.data?.type === 'ADBLOCK_WORKER_HOOKS_READY') { if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${e.data.method || 'unknown'}`); hookedWorkers.add(label); }
             else if (e.data?.type === 'ADBLOCK_ADS_REMOVED') { if (LOG_M3U8_CLEANING) logInfo('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${e.data.isMidroll}. URL: ${e.data.url || 'N/A'}`); if (OPT_SHOW_AD_BANNER) { showAdBanner(e.data.isMidroll); } setTimeout(hideAdBanner, 5000); }
         };
         workerInstance.addEventListener('message', adBlockListener); workerInstance._adBlockListener = adBlockListener;
         logDebug(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
    }
    function hookWorkerConstructor() { /* ... код без изменений ... */
        if (!INJECT_INTO_WORKERS) { logWarn('WorkerHook', "Внедрение кода в Worker'ы отключено в настройках."); return; }
        if (workerHookAttempted) { logWarn('WorkerHook', "Повторная попытка перехвата конструктора Worker (уже перехвачен?)."); return; }
        if (typeof unsafeWindow.Worker === 'undefined') { logError('WorkerHook', 'Конструктор Worker (unsafeWindow.Worker) не определен. Невозможно перехватить.'); return; }
        logDebug('WorkerHook', "Попытка перехвата конструктора Worker..."); workerHookAttempted = true;
        const OriginalWorkerClass = unsafeWindow.Worker;
        unsafeWindow.Worker = class HookedWorker extends OriginalWorkerClass {
            constructor(scriptURL, options) {
                let urlString = ''; let isBlobURL = false; let workerLabel = 'unknown';
                try { /* ... код определения workerLabel без изменений ... */
                     if (scriptURL instanceof URL) { urlString = scriptURL.href; if (scriptURL.protocol === 'blob:') { isBlobURL = true; workerLabel = `blob:${urlString.substring(5, 30)}...`; } else { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); } }
                     else if (typeof scriptURL === 'string') { urlString = scriptURL; if (urlString.startsWith('blob:')) { isBlobURL = true; workerLabel = `blob:${urlString.substring(5, 30)}...`; } else { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); } }
                     else { workerLabel = `non-url-source (${typeof scriptURL})`; }
                     if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : 'Script URL'}, Опции:`, options);
                } catch (e) { logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL); workerLabel = 'error-determining-source'; }
                super(scriptURL, options); this._workerLabel = workerLabel;
                addWorkerMessageListeners(this, workerLabel);
                if (!isBlobURL && INJECT_INTO_WORKERS) {
                     setTimeout(() => {
                        if (!hookedWorkers.has(this._workerLabel)) {
                             if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL. Запасная попытка внедрения через postMessage...`);
                             try { const injectionCode = getWorkerInjectionCode(); if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `[Async] Отправка EVAL_ADBLOCK_CODE Worker'у (${this._workerLabel}).`); this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode }); }
                             catch(e) { logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e); }
                        } else { if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков, запасной postMessage не требуется.`); }
                    }, 250);
                } else if (isBlobURL && LOG_WORKER_INJECTION) { logDebug('WorkerHook', `Worker (${workerLabel}) создан из Blob URL. Ожидается срабатывание хука createObjectURL или подтверждение от Worker'а.`); }
            }
        };
        unsafeWindow.Worker.hooked_by_adblock = true; logInfo('WorkerHook', "Конструктор Worker успешно перехвачен.");
    }

    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК - без изменений) ---
    function installHooks() {
        if (hooksInstalledMain) { logWarn('Hooks', "Попытка повторной установки хуков."); return; }
        logDebug('Hooks', "Начало установки хуков в основном потоке...");
        try { unsafeWindow.fetch = fetchOverride; logDebug('Hooks', "Перехват Fetch API установлен."); }
        catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }
        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; logDebug('Hooks', "Перехваты XMLHttpRequest (open, send) установлены."); }
        catch (e) { logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; }
        if (INJECT_INTO_WORKERS) {
            try { unsafeWindow.URL.createObjectURL = createObjectURLOverride; logInfo('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН."); }
            catch (e) { logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }
            try { hookWorkerConstructor(); } catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }
            try { unsafeWindow.URL.revokeObjectURL = function(url) { logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`); return originalRevokeObjectURL.call(unsafeWindow.URL, url); }; logDebug('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен."); }
            catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else { logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются."); }
        hooksInstalledMain = true;
        logInfo('Hooks', "Установка перехватов в основном потоке завершена.");
    }

    // --- НАБЛЮДАТЕЛЬ ЗА ПОЯВЛЕНИЕМ ПЛЕЕРА ---
    function startPlayerObserver() {
        if (!ENABLE_FORCE_SOURCE_QUALITY) {
            logQuality("Принудительная установка качества отключена (ENABLE_FORCE_SOURCE_QUALITY = false).");
            return;
        }
        if (qualityObserver) {
            logQualityDebug("Наблюдатель MutationObserver уже запущен.");
            return; // Уже запущен
        }

        const targetNode = document.body; // Наблюдаем за всем body
        if (!targetNode) {
            logError('QualityObserver', "Не удалось найти document.body для запуска MutationObserver.");
            return;
        }

        const observerOptions = {
            childList: true, // Наблюдать за добавлением/удалением дочерних узлов
            subtree: true    // Наблюдать за всем поддеревом
        };

        const callback = function(mutationsList, observer) {
            // Ищем один из селекторов плеера
            const playerSelectors = [
                '.video-player__container',
                'div[data-a-target="video-player-layout"]',
                'div[data-a-target="video-player"]',
                '.video-player .persistent-player',
                '.video-player' // Общий
            ];

            let playerFound = false;
            for (const selector of playerSelectors) {
                if (document.querySelector(selector)) {
                     logQuality(`Обнаружен элемент плеера ('${selector}') через MutationObserver.`);
                     playerFound = true;
                     break;
                 }
            }

            if (playerFound) {
                 logQuality("Плеер обнаружен. Отключаем MutationObserver и запускаем установку качества через API.");
                 observer.disconnect(); // Больше не нужен
                 qualityObserver = null; // Сбрасываем ссылку на наблюдателя

                 // Вызываем установку качества через API с задержкой
                 // Задержка важна, чтобы API плеера успело инициализироваться
                 setTimeout(forceSourceQualityViaAPI, 2000); // Задержка 2 секунды (можно настроить)
             }
        };

        qualityObserver = new MutationObserver(callback);
        qualityObserver.observe(targetNode, observerOptions);
        logQuality("MutationObserver запущен для ожидания плеера.");
    }

    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---
    logInfo('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);

    // Добавляем стили для баннера (если включен)
    if (OPT_SHOW_AD_BANNER) {
        try {
            GM_addStyle(`
                .tch-adblock-banner {
                    /* Стили без изменений */
                    position: absolute; top: 10px; left: 10px; z-index: 2000;
                    pointer-events: none; display: none; color: white;
                    background-color: rgba(0, 0, 0, 0.75); padding: 6px 12px;
                    font-size: 13px; border-radius: 5px;
                    font-family: Roobert, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
                    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); text-align: center;
                    opacity: 0; transition: opacity 0.5s ease-in-out;
                }
                .tch-adblock-banner[style*="display: block;"] { opacity: 1; }
            `);
            logDebug('Init', "Стили для баннера добавлены.");
        } catch (e) { logError('Init', "Не удалось добавить стили для баннера:", e); }
    }

    // Устанавливаем хуки как можно раньше
    installHooks();

    // Устанавливаем настройки качества через localStorage (ранний этап)
    if (ENABLE_FORCE_SOURCE_QUALITY) {
         setQualitySettingsLocalStorage(); // Вызываем старый метод
    }

    // Запускаем MutationObserver для ожидания плеера и установки качества через API
    // Лучше делать это после полной загрузки DOM, чтобы избежать лишних срабатываний
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', startPlayerObserver, { once: true });
    } else {
        startPlayerObserver(); // DOM уже загружен
    }

    logInfo('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);
    if (DEBUG_LOGGING) { logWarn('Init', "РЕЖИМ ОТЛАДКИ АКТИВЕН (DEBUG_LOGGING = true). В консоли будет много сообщений."); }

})();