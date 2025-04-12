// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource_ShmidtS_Mod
// @version      17.1.2 // Версия увеличена для отражения изменений
// @description  Блокировка рекламы Twitch через Worker + Автоматическая установка качества "Источник" (Source). Адаптировано и дополнено.
// @author       AI Generated & Adapted by ShmidtS & Assistant (Optimized + Force Source + Updater)
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
// @updateURL    https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js
// @downloadURL  https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- НАСТРОЙКИ (Конфигурируемые через GM_setValue) ---
    const SCRIPT_VERSION = '17.1.2'; // Версия обновлена
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false);
    const SHOW_ERRORS = true;
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', true);
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true);
    const LOG_FORCE_QUALITY = GM_getValue('TTV_AdBlock_LogForceQuality', true);
    const OPT_SHOW_AD_BANNER = GM_getValue('TTV_AdBlock_ShowBanner', true);
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const ENABLE_FORCE_SOURCE_QUALITY = GM_getValue('TTV_AdBlock_ForceSource', true);
    const CHECK_FOR_UPDATES = true; // Добавлена опция проверки обновлений

    // --- КОНСТАНТЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const UPDATE_CHECK_INTERVAL_HOURS = 24; // Как часто проверять обновления (в часах)
    const UPDATE_SCRIPT_URL = 'https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js'; // URL для проверки версии

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
    var qualityObserver = null;
    var playerInstanceCache = null;

    // Оригинальные функции (оставлены без изменений)
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    // const OriginalEventSource = unsafeWindow.EventSource; // EventSource не используется в текущей логике
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;

    // --- ЛОГИРОВАНИЕ ---
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
            // Убедимся, что контейнер имеет позиционирование, чтобы баннер позиционировался относительно него
            const currentPosition = window.getComputedStyle(playerRootDiv).position;
            if (currentPosition === 'static') {
                playerRootDiv.style.position = 'relative';
                logDebug("Banner", "Установлено 'position: relative' для контейнера плеера.");
            }
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
                    const bannerText = `Реклама удалена v${SCRIPT_VERSION.substring(0, 6)}` + (isMidroll ? ' (midroll)' : '');
                    adDiv.textContent = bannerText;
                    adDiv.style.display = 'block'; // Убедимся, что display: block
                    adDiv.style.opacity = '1'; // Мгновенно показываем
                    logInfo("Banner", "Баннер показан. Текст:", bannerText);
                    // Плавное исчезновение через 5 секунд
                    setTimeout(() => {
                        if (adDiv) {
                            adDiv.style.opacity = '0';
                             // Скрываем элемент после завершения анимации
                            setTimeout(() => { if (adDiv) adDiv.style.display = 'none'; }, 600); // 500ms transition + 100ms buffer
                        }
                    }, 5000);
                } catch(e) { logError("Banner", "Ошибка отображения баннера:", e); adBannerElement = null; }
            });
        } else { logWarn("Banner", "Не удалось получить/создать баннер для показа."); }
    }
    // hideAdBanner теперь не нужна, так как показ и скрытие объединены в showAdBanner

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА ---

    // 1. Метод через localStorage (оставлен для совместимости/ранней инициализации)
    function setQualitySettingsLocalStorage() {
        // ... (код без изменений) ...
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

    // 2. Основной метод - через Player API (УЛУЧШЕН ПОИСК И ЛОГИРОВАНИЕ)
    function findPlayerInstance() {
        if (playerInstanceCache && typeof playerInstanceCache.getQualities === 'function') {
            logQualityDebug("Возвращаем кешированный экземпляр плеера.");
            return playerInstanceCache;
        }
        playerInstanceCache = null; // Сбрасываем кеш, если он невалиден

        logQualityDebug("Поиск экземпляра плеера...");
        const playerElement = document.querySelector('.video-player'); // Основной селектор
        if (!playerElement) {
            logQualityDebug("Элемент плеера ('.video-player' или другие) не найден.");
            return null;
        }

        const reactKey = Object.keys(playerElement).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (!reactKey) {
            logQualityDebug("React key ('__reactFiber$' или '__reactInternalInstance$') не найден на элементе плеера.");
            return null;
        }

        let instance = playerElement[reactKey];
        if (!instance) {
            logQualityDebug("Экземпляр React не найден по ключу:", reactKey);
            return null;
        }

        logQualityDebug("Начало поиска объекта плеера во вложенной структуре React (макс. глубина 20)...");
        const MAX_DEPTH = 20; // Увеличена глубина на всякий случай
        let depth = 0;
        let queue = [instance];
        let visited = new Set();

        while (queue.length > 0 && depth < MAX_DEPTH) {
            let current = queue.shift();
            if (!current || visited.has(current)) continue;
            visited.add(current);

            // Проверяем сам объект, stateNode, child, sibling, memoizedProps, return
            const candidates = [
                current,
                current.stateNode,
                current.memoizedProps?.player, // Часто плеер передается в props
                current.memoizedProps?.playerApi, // Другое возможное имя
                current.memoizedState?.player, // Иногда хранится в state
                current.memoizedState?.playerApi
            ];

            for (const candidate of candidates) {
                if (candidate && typeof candidate.getQualities === 'function' && typeof candidate.setQuality === 'function') {
                    logQualityDebug(`Найден подходящий экземпляр плеера на глубине ${depth} через свойство/объект:`, candidate);
                    playerInstanceCache = candidate; // Кешируем валидный экземпляр
                    return candidate;
                }
                // Иногда нужные методы находятся на самом stateNode
                 if (current.stateNode && typeof current.stateNode.getQualities === 'function' && typeof current.stateNode.setQuality === 'function') {
                     logQualityDebug(`Найден подходящий экземпляр плеера на глубине ${depth} через stateNode:`, current.stateNode);
                     playerInstanceCache = current.stateNode;
                     return current.stateNode;
                 }
            }

             // Добавляем следующие узлы для поиска
            if (current.child && !visited.has(current.child)) queue.push(current.child);
            if (current.sibling && !visited.has(current.sibling)) queue.push(current.sibling);
            if (current.return && !visited.has(current.return)) queue.push(current.return); // Проверяем родителя

            depth++;
        }

        logWarn('Quality', `Не удалось найти рабочий экземпляр плеера Twitch с методами getQualities/setQuality после исчерпывающего поиска (глубина ${depth}). Возможно, структура плеера изменилась.`);
        return null;
    }


    function forceSourceQualityViaAPI() {
        // ... (код без изменений, использует улучшенный findPlayerInstance) ...
        logQuality("Запуск forceSourceQualityViaAPI...");
        const player = findPlayerInstance();

        if (!player) {
            logWarn('Quality', "Экземпляр плеера не найден или недоступен для установки качества через API.");
            return;
        }

        try {
            if (typeof player.getQualities !== 'function') {
                logWarn('Quality', "Метод player.getQualities() не найден на найденном объекте. Невозможно определить 'Source'.", player);
                return;
            }

            const qualities = player.getQualities();
            logQualityDebug("Доступные качества:", JSON.stringify(qualities));

            if (!qualities || qualities.length === 0) {
                logWarn('Quality', "Список доступных качеств пуст или не получен от player.getQualities().");
                return;
            }

            let sourceQuality = qualities.find(q => q.group === 'chunked'); // 'chunked' часто соответствует Source
             if (!sourceQuality && qualities.length > 0) {
                 // Ищем качество с максимальным битрейтом или разрешением как запасной вариант
                 qualities.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0) || (b.height || 0) - (a.height || 0));
                 sourceQuality = qualities[0];
                 logQualityDebug("Качество с group='chunked' не найдено. Используем качество с наивысшим битрейтом/разрешением как 'Source':", sourceQuality);
             }


            if (!sourceQuality) {
                logWarn('Quality', "Не удалось идентифицировать качество 'Источник' (Source) ни по 'chunked', ни по битрейту.");
                return;
            }

            if (typeof player.setQuality !== 'function') {
                logWarn('Quality', "Метод player.setQuality() не найден на найденном объекте. Невозможно установить качество.", player);
                return;
            }

            let currentQuality = null;
            try {
                 if (typeof player.getQuality === 'function') {
                     currentQuality = player.getQuality();
                     logQualityDebug("Текущее качество:", JSON.stringify(currentQuality));
                 } else {
                     logQualityDebug("Метод player.getQuality() не найден.");
                 }
            } catch (e) { logWarn('Quality', "Ошибка получения текущего качества:", e); }


            if (currentQuality && currentQuality.group === sourceQuality.group && currentQuality.name === sourceQuality.name) {
                 logQuality("Текущее качество уже установлено как 'Источник'. Пропуск установки.");
                 return;
            }

            logQuality(`Попытка установить качество 'Источник' ('${sourceQuality.name}', group: ${sourceQuality.group}) через API...`);
            // Twitch API может ожидать group ID или сам объект качества. Пробуем group.
            // В некоторых версиях API требовался объект { group: 'chunked' }
            player.setQuality(sourceQuality.group); // или player.setQuality(sourceQuality);

            // Небольшая задержка для проверки результата
            setTimeout(() => {
                try {
                     if (typeof player.getQuality === 'function') {
                        const finalQuality = player.getQuality();
                        if (finalQuality && finalQuality.group === sourceQuality.group) {
                             logQuality(`Качество успешно установлено на '${finalQuality.name}' (${finalQuality.group}).`);
                        } else {
                             logWarn('Quality', `Не удалось подтвердить установку качества. Текущее после попытки:`, finalQuality);
                        }
                    }
                } catch(e) { logWarn('Quality', "Ошибка проверки качества после установки:", e); }
            }, 1500);

        } catch (error) {
            logError('Quality', 'Критическая ошибка при попытке установить качество через API плеера:', error);
        }
    }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER (без изменений) ---
    function getWorkerInjectionCode() { /* ... код без изменений ... */
        // Важно: передаем актуальную версию и настройки в код Worker'а
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

        // Функция очистки M3U8 (оставлена без изменений, т.к. ее эффективность зависит от Twitch)
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
                if (!trimmedLine) { /*if (isAdSection) workerLogTrace(\`[\${context}] (\${urlShort}): Пустая строка [\${i}], возможно конец рекламной секции.\`);*/ cleanLines.push(line); continue; } // Пустые строки могут быть важны
                let isAdMarker = false;
                if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && trimmedLine.includes(AD_SIGNIFIER_DATERANGE_WORKER)) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы [\${i}]\`); isAdSection = true; isAdMarker = true; adsFound = true; if (trimmedLine.includes('MIDROLL')) isMidrollAd = true; }
                else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер начала/ассета \${trimmedLine.split(':')[0]} [\${i}]\`); isAdSection = true; isAdMarker = true; adsFound = true; if (trimmedLine.includes('MIDROLL')) isMidrollAd = true; }
                else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]\`); isAdSection = false; isAdMarker = true; adsFound = true; }
                // Важно: Не удалять EXT-X-DISCONTINUITY полностью, а только если он *строго внутри* секции CUE-OUT/CUE-IN или DATERANGE
                 else if (isAdSection && trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY внутри рекламной секции [\${i}]\`); isAdMarker = true; adsFound = true; discontinuitySequence++; }

                if (isAdMarker) { linesRemoved++; if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удален рекламный маркер [\${i}]: \${trimmedLine.substring(0, 100)}\`); continue; }

                if (isAdSection) {
                    // Удаляем только сегменты (.ts) и их теги EXTINF внутри рекламной секции
                     if (trimmedLine.startsWith('#EXTINF:') || (trimmedLine.includes('.ts') && !trimmedLine.startsWith('#'))) {
                          linesRemoved++; if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удалена строка (вероятно, сегмент/inf) из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`); continue;
                     } else {
                         // Оставляем другие теги (#EXT-X-PROGRAM-DATE-TIME, и т.д.)
                         if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Оставляем НЕ-сегментную строку внутри рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                     }
                }
                 cleanLines.push(line); // Добавляем строку, если она не была удалена
            }
            const cleanedText = cleanLines.join('\\n');
            if (adsFound) {
                if (LOG_M3U8_CLEANING_WORKER) workerLogInfo(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружен Midroll: \${isMidrollAd}. Длина оригинала: \${m3u8Text.length}, Длина очищенного: \${cleanedText.length}\`);
                try { self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort }); } catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e); }
            } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены. Плейлист не изменен.\`); }
            // Всегда возвращаем результат, даже если рекламы не было
             return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
        }

        // Перехват Fetch в Worker'е (без изменений)
        function installWorkerFetchHook() {
            // ... (код без изменений) ...
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
                        if (!originalResponse.ok) {
                             if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status}). Пропускаем.\`);
                             return originalResponse; // Не трогаем ошибочные ответы
                         }
                        const clonedResponse = originalResponse.clone(); const contentType = clonedResponse.headers.get('Content-Type');
                         // Проверяем Content-Type более мягко
                        if (contentType && (contentType.includes('mpegurl') || contentType.includes('octet-stream'))) { // octet-stream иногда используется для m3u8
                             workerLogDebug(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: \${contentType}. Чтение и очистка...\`);
                             const m3u8Text = await clonedResponse.text();
                             if (!m3u8Text) { workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`); return originalResponse; }
                             const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);
                             const newHeaders = new Headers(originalResponse.headers);
                             newHeaders.delete('Content-Length'); // Длина изменилась
                             newHeaders.delete('ETag'); // ETag больше не валиден
                             // newHeaders.set('X-Adblock-Status', cleaningResult.adsFound ? 'Cleaned' : 'Untouched'); // Можно добавить для отладки
                             return new Response(cleaningResult.cleanedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                        } else { if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: \${contentType}). Пропускаем.\`); return originalResponse; }
                    } catch (error) { workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error); return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, { status: 500, statusText: "AdBlock Internal Error" }); }
                } else { if (DEBUG_LOGGING_WORKER && !isSegmentRequest) workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET запрос: (\${method}) \${urlShort}\`); return workerRealFetch(input, init); }
            };
            self.fetch.hooked_by_adblock = true;
            workerLogInfo("Перехват fetch в Worker'е УСПЕШНО установлен.");
            return true;
        }

        // Обработчик сообщений для запасного метода внедрения (без изменений)
        self.addEventListener('message', function(e) {
            if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
                workerLogInfo("Получено сообщение EVAL_ADBLOCK_CODE (запасной метод). Попытка выполнения...");
                try {
                    eval(e.data.code); // Выполняем код основного скрипта
                    workerLogInfo("EVAL_ADBLOCK_CODE успешно выполнен.");
                    // Повторно пытаемся установить хуки, если они не были установлены при инициализации
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
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) { logDebug(context, `Обнаружен потенциально рекламный Fetch запрос (НЕ БЛОКИРОВАН): ${urlShort}`); }
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
             // Логирование ответа GQL (опционально)
             /*
             if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
                  if (method.toUpperCase() === 'POST' && init && init.body) {
                       let bodyData = init.body; if (typeof bodyData === 'string') try {bodyData = JSON.parse(bodyData);} catch(e){}
                       let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                       if (operationName === GQL_OPERATION_ACCESS_TOKEN) { logInfo(context, `Запрос ${GQL_OPERATION_ACCESS_TOKEN} выполнен. Статус: ${response.status}`); }
                  }
              }
             */
             return response;
        } catch (error) {
             // Игнорируем ошибки ERR_CONNECTION_CLOSED, так как они могут быть результатом блокировки
             if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) {
                  logWarn(context, `Fetch к ${urlShort} не удался (возможно, заблокирован): ${error.message}`);
                  // Возвращаем "пустой" ответ, чтобы не ломать цепочку Promise
                  return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed" }));
             } else {
                  logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error);
                  throw error; // Перебрасываем другие ошибки
             }
        }
    }
    const xhrRequestData = new WeakMap();
    function xhrOpenOverride(method, url, async, user, password) { /* ... код без изменений ... */
        const context = 'MainXHR'; const urlString = String(url); const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString;
        xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort });
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) { if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR запроса к: ${urlShort}`); xhrRequestData.get(this).blocked = true; return; }
        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) { logDebug(context, `Обнаружен потенциально рекламный XHR запрос (НЕ БЛОКИРОВАН): ${urlShort}`); }
        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) { logDebug(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`); }
        try { return originalXhrOpen.call(this, method, url, async, user, password); } catch (error) { logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error); throw error; }
    }
    function xhrSendOverride(data) { /* ... код без изменений ... */
        const context = 'MainXHR'; const requestInfo = xhrRequestData.get(this);
        if (!requestInfo) { logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала."); try { return originalXhrSend.call(this, data); } catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;} }
        const { method, url, urlShort, blocked } = requestInfo;
        if (blocked) { logWarn(context, `Завершение заблокированного XHR запроса к: ${urlShort}`); this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false })); return; } // Инициируем ошибку для заблокированных
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
        // Проверяем тип более строго, ищем 'javascript' или 'worker'
        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker'))) {
            if (LOG_WORKER_INJECTION) logInfo(context, `Перехвачен createObjectURL для Blob типа: ${blobType}, размер: ${blobSize}`);
            const readerPromise = new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target.result); reader.onerror = (e) => reject(new Error("FileReader error: " + e.target.error)); reader.readAsText(blob); });
            // Используем async/await для читаемости
            return (async () => {
                try {
                    const originalCode = await readerPromise;
                    // Упрощенная проверка на видео-воркер (можно расширить)
                    const isLikelyVideoWorker = originalCode.includes('getVideoSegment') || originalCode.includes('wasmWorker') || originalCode.includes('hlsManifestService') || (originalCode.includes('fetch') && originalCode.includes('postMessage') && originalCode.length > 10000); // Добавлено условие на размер

                    if (isLikelyVideoWorker) {
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob ПОХОЖ на целевой Worker (${blobSize} bytes). Попытка внедрения кода...`);
                        const injectionCode = getWorkerInjectionCode();
                        const modifiedCode = injectionCode + '\n\n// --- Original Worker Code Below ---\n' + originalCode;
                        const newBlob = new Blob([modifiedCode], { type: blobType });
                        const newUrl = originalCreateObjectURL.call(unsafeWindow.URL, newBlob);
                        if (LOG_WORKER_INJECTION) logInfo(context, `[Async] Blob успешно модифицирован и создан НОВЫЙ URL: ${newUrl.substring(0, 60)}... (Новый размер: ${newBlob.size})`);
                        return newUrl;
                    } else {
                        if (LOG_WORKER_INJECTION) logDebug(context, `[Async] Blob НЕ похож на целевой Worker (маркеры не найдены или размер мал: ${blobSize} bytes). Возврат оригинального URL.`);
                        return originalCreateObjectURL.call(unsafeWindow.URL, blob);
                    }
                } catch (error) {
                    logError(context, '[Async] Ошибка чтения/модификации Blob:', error);
                    return originalCreateObjectURL.call(unsafeWindow.URL, blob); // Возвращаем оригинал в случае ошибки
                }
            })(); // Сразу вызываем async IIFE
        } else {
            if (blob instanceof Blob) { logTrace(context, `Пропуск createObjectURL для Blob типа: ${blobType}, размер: ${blobSize}`); }
            else { logTrace(context, `Пропуск createObjectURL для не-Blob объекта:`, blob); }
            return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        }
    }
    function addWorkerMessageListeners(workerInstance, label) { /* ... код без изменений ... */
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
         workerInstance._listenersAddedByAdblock = true; const context = 'WorkerMsg';
         if (DEBUG_LOGGING) { workerInstance.addEventListener('message', (e) => { logTrace(context, `Сообщение ОТ Worker'а (${label}):`, e.data); }); }
         workerInstance.addEventListener('error', (e) => { logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e); });
         const adBlockListener = (e) => {
             if (e.data?.type === 'ADBLOCK_WORKER_HOOKS_READY') { if (LOG_WORKER_INJECTION) logInfo('WorkerHook', `ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${e.data.method || 'unknown'}`); hookedWorkers.add(label); }
             else if (e.data?.type === 'ADBLOCK_ADS_REMOVED') { if (LOG_M3U8_CLEANING) logInfo('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${e.data.isMidroll}. URL: ${e.data.url || 'N/A'}`); if (OPT_SHOW_AD_BANNER) { showAdBanner(e.data.isMidroll); } /* setTimeout(hideAdBanner, 5000); - Скрытие теперь внутри showAdBanner */ }
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
                // ВАЖНО: Вызываем super() с ОРИГИНАЛЬНЫМ scriptURL, даже если мы его потом модифицировали через createObjectURLOverride
                 // Модификация происходит *до* вызова конструктора, в createObjectURLOverride
                 super(scriptURL, options);
                 this._workerLabel = workerLabel;
                 addWorkerMessageListeners(this, workerLabel);

                // Запасной механизм внедрения (если Worker создан НЕ из Blob URL ИЛИ если хук createObjectURL не сработал)
                if (!isBlobURL && INJECT_INTO_WORKERS) {
                     setTimeout(() => {
                        // Проверяем, был ли уже внедрен код (например, через createObjectURL)
                        if (!hookedWorkers.has(this._workerLabel)) {
                             if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук не сработал). Запасная попытка внедрения через postMessage...`);
                             try {
                                 // Используем тот же код, что и для Blob
                                 const injectionCode = getWorkerInjectionCode();
                                 if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `[Async] Отправка EVAL_ADBLOCK_CODE Worker'у (${this._workerLabel}).`);
                                 this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode });
                             } catch(e) { logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e); }
                        } else {
                             if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков, запасной postMessage не требуется.`);
                        }
                    }, 350); // Небольшая задержка для инициализации Worker'а
                } else if (isBlobURL && LOG_WORKER_INJECTION) {
                     logDebug('WorkerHook', `Worker (${workerLabel}) создан из Blob URL. Ожидается срабатывание хука createObjectURL или подтверждение от Worker'а.`);
                 }
            }
        };
        // Копируем статические свойства и прототип от оригинального Worker, если они есть
         Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass);
         Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype);
         unsafeWindow.Worker.hooked_by_adblock = true;
         logInfo('WorkerHook', "Конструктор Worker успешно перехвачен.");
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
            // Перехват Worker должен идти ПОСЛЕ createObjectURL, чтобы он получил уже перехваченный URL
            try { hookWorkerConstructor(); } catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }
            try { unsafeWindow.URL.revokeObjectURL = function(url) { logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`); return originalRevokeObjectURL.call(unsafeWindow.URL, url); }; logDebug('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен."); }
            catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else { logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются."); }
        hooksInstalledMain = true;
        logInfo('Hooks', "Установка перехватов в основном потоке завершена.");
    }

    // --- НАБЛЮДАТЕЛЬ ЗА ПОЯВЛЕНИЕМ ПЛЕЕРА ---
    function startPlayerObserver() {
        // ... (код без изменений) ...
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
                '.video-player__container', // Основной контейнер
                'div[data-a-target="video-player-layout"]', // Новый атрибут
                'div[data-a-target="video-player"]', // Старый атрибут
                '.video-player .persistent-player', // Вложенный плеер
                '.video-player' // Общий класс
            ];

            let playerFound = false;
            for (const selector of playerSelectors) {
                const element = document.querySelector(selector);
                 if (element && element.querySelector('video')) { // Убедимся, что внутри есть видео
                     logQuality(`Обнаружен элемент плеера ('${selector}') содержащий <video> через MutationObserver.`);
                     playerFound = true;
                     break;
                 }
            }

            if (playerFound) {
                 logQuality("Плеер обнаружен. Отключаем MutationObserver и запускаем установку качества через API.");
                 observer.disconnect(); // Больше не нужен
                 qualityObserver = null; // Сбрасываем ссылку на наблюдателя

                 // Вызываем установку качества через API с небольшой задержкой
                 // Задержка важна, чтобы API плеера (React компоненты) успело инициализироваться после появления DOM элемента
                 setTimeout(forceSourceQualityViaAPI, 2500); // Задержка 2.5 секунды (можно настроить)
             }
        };

        qualityObserver = new MutationObserver(callback);
        qualityObserver.observe(targetNode, observerOptions);
        logQuality("MutationObserver запущен для ожидания плеера.");
    }

     // --- ПРОВЕРКА ОБНОВЛЕНИЙ ---
    function checkForUpdates() {
        if (!CHECK_FOR_UPDATES) return;

        const lastCheck = GM_getValue('TTV_AdBlock_LastUpdateCheck', 0);
        const now = Date.now();
        if (now - lastCheck < UPDATE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000) {
            logDebug('UpdateCheck', `Проверка обновлений пропускается (последняя проверка < ${UPDATE_CHECK_INTERVAL_HOURS} ч назад).`);
            return;
        }

        logInfo('UpdateCheck', `Проверка наличия обновлений для скрипта с ${UPDATE_SCRIPT_URL}...`);
        GM_xmlhttpRequest({
            method: 'GET',
            url: UPDATE_SCRIPT_URL + '?_=' + now, // Добавляем кэш-бастер
            onload: function(response) {
                if (response.status >= 200 && response.status < 300) {
                    const remoteText = response.responseText;
                    const remoteVersionMatch = remoteText.match(/@version\s+([\d.]+)/);
                    if (remoteVersionMatch && remoteVersionMatch[1]) {
                        const remoteVersion = remoteVersionMatch[1];
                        logInfo('UpdateCheck', `Текущая версия: ${SCRIPT_VERSION}, Удаленная версия: ${remoteVersion}`);
                        // Простое сравнение версий
                        if (compareVersions(remoteVersion, SCRIPT_VERSION) > 0) {
                            logWarn('UpdateCheck', `Доступна новая версия скрипта: ${remoteVersion}. Пожалуйста, обновитесь через менеджер скриптов или по ссылке: ${UPDATE_SCRIPT_URL}`);
                            // Можно добавить уведомление для пользователя
                            // alert(`TTV AdBlock: Доступна новая версия (${remoteVersion})!`);
                        } else {
                            logInfo('UpdateCheck', 'Установлена последняя версия скрипта.');
                        }
                        GM_setValue('TTV_AdBlock_LastUpdateCheck', now); // Обновляем время последней успешной проверки
                    } else {
                        logWarn('UpdateCheck', 'Не удалось извлечь версию из удаленного скрипта.');
                    }
                } else {
                    logError('UpdateCheck', `Ошибка при загрузке скрипта для проверки обновления. Статус: ${response.status}`, response.statusText);
                }
            },
            onerror: function(error) {
                logError('UpdateCheck', 'Сетевая ошибка при проверке обновлений:', error);
            },
            ontimeout: function() {
                logError('UpdateCheck', 'Тайм-аут при проверке обновлений.');
            },
            timeout: 15000 // 15 секунд
        });
    }

    // Вспомогательная функция для сравнения версий (простая)
    function compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        const len = Math.max(parts1.length, parts2.length);
        for (let i = 0; i < len; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---
    logInfo('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);

    // Добавляем стили для баннера (если включен)
    if (OPT_SHOW_AD_BANNER) {
        try {
            GM_addStyle(`
                .tch-adblock-banner {
                    position: absolute; top: 10px; left: 10px; z-index: 2000;
                    pointer-events: none; /* Не мешает кликам по плееру */
                    display: none; /* Изначально скрыт */
                    color: white;
                    background-color: rgba(0, 0, 0, 0.8); /* Чуть темнее */
                    padding: 6px 12px;
                    font-size: 13px; border-radius: 5px;
                    font-family: Roobert, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
                    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6); text-align: center;
                    /* Анимация появления/исчезновения */
                    opacity: 0;
                    transition: opacity 0.5s ease-in-out;
                }
                /* Класс для показа баннера не нужен, управляем через style */
            `);
            logDebug('Init', "Стили для баннера добавлены.");
        } catch (e) { logError('Init', "Не удалось добавить стили для баннера:", e); }
    }

    // Устанавливаем хуки как можно раньше
    installHooks();

    // Устанавливаем настройки качества через localStorage (ранний этап)
    if (ENABLE_FORCE_SOURCE_QUALITY) {
         setQualitySettingsLocalStorage();
    }

    // Запускаем MutationObserver и проверку обновлений после загрузки DOM
    function onDomReady() {
         startPlayerObserver();
         checkForUpdates(); // Проверяем обновления при загрузке страницы
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
        onDomReady(); // DOM уже загружен
    }

    logInfo('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);
    if (DEBUG_LOGGING) { logWarn('Init', "РЕЖИМ ОТЛАДКИ АКТИВЕН (DEBUG_LOGGING = true). В консоли будет много сообщений."); }

})();