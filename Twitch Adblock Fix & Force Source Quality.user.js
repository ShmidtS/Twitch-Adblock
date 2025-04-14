// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource
// @version      18.2.0
// @description  Блокировка рекламы + Качество "Источник" + Авто-перезагрузка 
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

    // --- НАСТРОЙКИ ---
    const SCRIPT_VERSION = '18.2.0'; // Версия обновлена
    const SHOW_ERRORS = true; // Оставляем показ ошибок
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false);
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', true);
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true);
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const ENABLE_PERIODIC_QUALITY_CHECK = GM_getValue('TTV_AdBlock_PeriodicQualityCheck', true);
    const PERIODIC_QUALITY_CHECK_INTERVAL_MS = GM_getValue('TTV_AdBlock_QualityCheckInterval', 3000);

    // --- НАСТРОЙКИ ДЛЯ АВТО-ПЕРЕЗАГРУЗКИ ---
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [1000, 2000, 3000, 4000, 5000]);
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 1500);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 15000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);

    // --- КОНСТАНТЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}'; // 'chunked' соответствует качеству "Источник"
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_SIGNIFIERS_GENERAL = ['#EXT-X-DATERANGE', '#EXT-X-CUE-OUT', '#EXT-X-SCTE35'];
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED'];
    const AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'scorecardresearch.com',
        'imasdk.googleapis.com', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag',
        'ttvl-o.cloudfront.net', // Обслуживает рекламу
        'd2v02itv0y9u9t.cloudfront.net', // Также связан с рекламой
        'edge.ads.twitch.tv', // Явный домен рекламы
        '.google.com/pagead/conversion/',
        '.youtube.com/api/stats/ads'
    ];
    // const AD_URL_KEYWORDS_WARN = ['player-ad-', 'isp-signal', 'adlanding', 'adurl', 'adserver'];
    const PLAYER_SELECTOR = 'video[playsinline]';

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    var hooksInstalledMain = false;
    var workerHookAttempted = false;
    var hookedWorkers = new Set();
    var qualitySetIntervalId = null;
    var playerMonitorIntervalId = null;
    var videoElement = null; // Кэшированный элемент видео
    var lastVideoTimeUpdateTimestamp = 0;
    var lastKnownVideoTime = -1;
    var isWaitingForDataTimestamp = 0;
    var reloadTimeoutId = null;
    var lastReloadTimestamp = 0;
    var cachedQualityValue = null; // Кэширование значения из localStorage

    // --- Оригинальные функции ---
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalCreateObjectURL = unsafeWindow.URL.createObjectURL;
    const originalRevokeObjectURL = unsafeWindow.URL.revokeObjectURL;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;

    // --- ЛОГИРОВАНИЕ (без изменений) ---
    function logError(source, message, ...args) { if (SHOW_ERRORS) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logDebug(source, message, ...args) { if (DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logTrace(source, message, ...args) { if (DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args); }

    logDebug('MAIN', `Скрипт запускается. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. Periodic Quality Check: ${ENABLE_PERIODIC_QUALITY_CHECK}. Auto Reload: ${ENABLE_AUTO_RELOAD}.`);

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА (Оптимизировано с кэшированием) ---
    function setQualitySettings(forceCheck = false) {
        const context = 'QualitySetter';
        try {
            let currentValue = cachedQualityValue;
            // Проверяем localStorage только если нет кэша или forceCheck=true
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue; // Обновляем кэш
                logTrace(context, `Прочитано из localStorage: ${currentValue}. Кэш обновлен.`);
            } else {
                logTrace(context, `Используем кэшированное значение: ${currentValue}`);
            }

            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE; // Обновляем кэш после установки
                logDebug(context, `Установлено качество 'Источник' ('${TARGET_QUALITY_VALUE}') через localStorage. Кэш обновлен.`);
                // Попытка принудительного обновления плеера (может не сработать или вызвать ошибки)
                // if (videoElement) {
                //     try {
                //         const playerInstance = /* Логика поиска экземпляра плеера, связанного с videoElement */;
                //         if (playerInstance && typeof playerInstance.setQuality === 'function') {
                //             playerInstance.setQuality('chunked'); // Или другой идентификатор качества "Источник"
                //             logDebug(context, "Попытка принудительно применить качество через API плеера.");
                //         }
                //     } catch (e) {
                //         logWarn(context, "Не удалось принудительно применить качество через API плеера:", e);
                //     }
                // }
            } else {
                logTrace(context, `Качество 'Источник' ('${TARGET_QUALITY_VALUE}') уже установлено (проверено по кэшу/localStorage).`);
            }
        } catch (e) {
            logError(context, 'Ошибка установки/проверки настроек качества в localStorage:', e);
            cachedQualityValue = null; // Сброс кэша при ошибке
        }
    }

    // --- Перехват localStorage для обновления кэша ---
    unsafeWindow.localStorage.setItem = function(key, value) {
        if (key === LS_KEY_QUALITY) {
            logTrace('LocalStorageHook', `Перехвачен setItem для ${key}. Обновление кэша качества.`);
            cachedQualityValue = value; // Обновляем наш кэш
        }
        originalLocalStorageSetItem.call(unsafeWindow.localStorage, key, value);
    };
    // Инициализируем кэш при запуске
    cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER (Оптимизированная очистка M3U8) ---
    function getWorkerInjectionCode() {
        // Используем те же переменные, что и в основной части для консистентности
        return `
	// --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
	const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
	const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING};
	const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
	const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
    // Оптимизированный список маркеров
	const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
	const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)};
	const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

	// --- Функции логирования Worker'а (без изменений) ---
	function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
	function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
	function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
	function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }

	workerLogDebug("--- Worker AdBlock Code EXECUTION STARTED ---");

    // --- Оптимизированная функция очистки M3U8 ---
	function parseAndCleanM3U8_WORKER(m3u8Text, url = "N/A") {
        const context = 'WorkerM3U8Parse';
        const urlShort = url.split(/[?#]/)[0].split('/').pop() || url;
        if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] Запуск очистки для URL: \${urlShort}\`);

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            workerLogWarn(\`[\${context}] (\${urlShort}): Получен невалидный или пустой текст M3U8.\`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
        }

        // Простая быстрая проверка на наличие ключевых слов рекламы
        let potentialAdContent = false;
        if (m3u8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER) || AD_SIGNIFIERS_GENERAL_WORKER.some(sig => m3u8Text.includes(sig))) {
            potentialAdContent = true;
        } else if (AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => m3u8Text.toUpperCase().includes(kw))) {
             potentialAdContent = true;
        }

        if (!potentialAdContent) {
            if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Предварительная проверка не нашла явных маркеров рекламы. Пропускаем детальный парсинг.\`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
        }

        workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружены потенциальные маркеры рекламы. Запуск детального парсинга...\`);

        const lines = m3u8Text.split('\\n'); // Используем \n, т.к. \r\n менее вероятен в M3U8 от Twitch
        const cleanLines = [];
        let isAdSection = false;
        let adsFound = false;
        let linesRemoved = 0;
        const daterangeKeywordsUpper = AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.map(kw => kw.toUpperCase());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim(); // Убираем пробелы только для проверок

            if (!trimmedLine) { // Пустые строки оставляем
                cleanLines.push(line);
                continue;
            }

            let isAdMarkerLine = false;
            let shouldRemoveLine = false;
            let lineUpper = ''; // Ленивая инициализация

             // Проверка на DATERANGE рекламы (самый надежный маркер)
            if (trimmedLine.startsWith('#EXT-X-DATERANGE:')) {
                if (trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER)) {
                     isAdSection = true; isAdMarkerLine = true; adsFound = true;
                     if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (CLASS=\${AD_SIGNIFIER_DATERANGE_ATTR_WORKER}) [\${i}]\`);
                     shouldRemoveLine = true;
                } else {
                    lineUpper = trimmedLine.toUpperCase();
                    if (daterangeKeywordsUpper.some(kw => lineUpper.includes(kw))) {
                        isAdSection = true; isAdMarkerLine = true; adsFound = true;
                        if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (по ключевому слову) [\${i}]\`);
                        shouldRemoveLine = true;
                    }
                }
            }
            // Проверка на другие маркеры начала рекламы
            else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:')) {
                 isAdSection = true; isAdMarkerLine = true; adsFound = true;
                 if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен маркер начала рекламы (CUE-OUT/SCTE35) [\${i}]\`);
                 shouldRemoveLine = true;
            }
            // Проверка на маркер конца рекламы
            else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
                 if (isAdSection) {
                     if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]. Завершение рекламной секции.\`);
                     isAdSection = false; isAdMarkerLine = true; shouldRemoveLine = true;
                 } else {
                    // Иногда CUE-IN может приходить без CUE-OUT, удаляем на всякий случай
                     if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}): Обнаружен #EXT-X-CUE-IN без активной рекламной секции [\${i}]. Удаляем.\`);
                     shouldRemoveLine = true;
                 }
            }
             // Удаление строк внутри рекламной секции
            else if (isAdSection) {
                 shouldRemoveLine = true;
                 isAdMarkerLine = false; // Это не сам маркер, а контент внутри
            }

            if (shouldRemoveLine) {
                linesRemoved++;
                if (LOG_M3U8_CLEANING_WORKER && !isAdMarkerLine && trimmedLine.includes('.ts')) {
                     // Логируем только удаление сегментов, чтобы уменьшить шум
                     workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем строку сегмента/inf из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
                 }
            } else {
                cleanLines.push(line);
            }
        } // end for loop

        const cleanedText = cleanLines.join('\\n');

        if (adsFound) {
            if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружена реклама.\`);
             try {
                 self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', url: urlShort, linesRemoved: linesRemoved });
             } catch(e) {
                 workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e);
             }
        } else {
            if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены или не распознаны текущей логикой. Плейлист не изменен.\`);
        }

        return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved };
	} // end parseAndCleanM3U8_WORKER


	function installWorkerFetchHook() {
        // Логика установки хука fetch в Worker'е остается прежней, но вызывает оптимизированный parseAndCleanM3U8_WORKER
		workerLogDebug("installWorkerFetchHook() ВЫЗВАНА.");
		if (typeof self.fetch !== 'function') {
			workerLogWarn("Fetch API недоступен в этом Worker'е. Перехват невозможен.");
			return false;
		}
		if (self.fetch.hooked_by_adblock) {
			workerLogDebug("Перехват Fetch в Worker'е уже был установлен ранее.");
			return true;
		}

		workerLogDebug("Попытка установки перехвата fetch в Worker'е...");
		const workerRealFetch = self.fetch;

		self.fetch = async (input, init) => {
			let requestUrl = '';
			let method = 'GET';
			if (input instanceof Request) { requestUrl = input.url; method = input.method; }
			else { requestUrl = String(input); }
			if (init && init.method) { method = init.method; }

			const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
			const isM3U8Request = requestUrl.includes('.m3u8');
			const isUsherRequest = requestUrl.includes('usher.ttvnw.net');
			const isSegmentRequest = requestUrl.includes('.ts'); // Для уменьшения логов
			const context = 'WorkerFetch';

            // Логируем только важные запросы для снижения шума
			if (method.toUpperCase() === 'GET' && !isSegmentRequest && DEBUG_LOGGING_WORKER) {
                 workerLogTrace(\`[\${context}] Перехвачен GET запрос: \${requestUrl}\`);
            }

			// Обработка только M3U8 и Usher запросов
			if ((isM3U8Request || isUsherRequest) && method.toUpperCase() === 'GET') {
				workerLogDebug(\`[\${context}] ОБРАБОТКА M3U8/Usher: \${urlShort}\`);
				try {
					const originalResponse = await workerRealFetch(input, init);
					if (!originalResponse.ok) {
						 workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status} \${originalResponse.statusText}). Пропускаем обработку.\`);
						 return originalResponse;
					}

                    // Клонируем для безопасного чтения
					const clonedResponse = originalResponse.clone();
					const contentType = clonedResponse.headers.get('Content-Type') || '';

                    // Проверяем Content-Type перед чтением тела
					if (contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('octet-stream')) {
						 workerLogTrace(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: '\${contentType}'. Чтение и очистка...\`);
						 const m3u8Text = await clonedResponse.text();
						 if (!m3u8Text) {
							 workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`);
							 return originalResponse; // Возвращаем оригинальный пустой ответ
						 }
						 const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);

                         // Создаем новый ответ только если были внесены изменения
                         if (cleaningResult.adsFound) {
                             const newHeaders = new Headers(originalResponse.headers);
                             newHeaders.delete('Content-Length'); // Длина изменилась
                             workerLogTrace(\`[\${context}] (\${urlShort}) Возврат ОЧИЩЕННОГО M3U8. Удалено строк: \${cleaningResult.linesRemoved}\`);
                             return new Response(cleaningResult.cleanedText, {
                                 status: originalResponse.status,
                                 statusText: originalResponse.statusText,
                                 headers: newHeaders
                             });
                         } else {
                              workerLogTrace(\`[\${context}] (\${urlShort}) Реклама не найдена, возврат оригинального M3U8.\`);
                              return originalResponse; // Возвращаем оригинальный ответ без изменений
                         }
					} else {
						 workerLogWarn(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: '\${contentType}'). Пропускаем.\`);
						 return originalResponse;
					}
				} catch (error) {
					workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error);
					// Возвращаем ошибку, чтобы плеер мог её обработать
                    return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, {
						status: 500,
						statusText: "AdBlock Internal Error"
					});
				}
			} else {
                 // Пропускаем все остальные запросы
                 if (!isSegmentRequest && DEBUG_LOGGING_WORKER) {
                      workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET или не-GET запрос: (\${method}) \${urlShort}\`);
                 }
				 return workerRealFetch(input, init);
			}
		};
		self.fetch.hooked_by_adblock = true;
		workerLogDebug("Перехват fetch в Worker'е УСПЕШНО установлен.");
		return true;
	} // end installWorkerFetchHook

	// --- Обработчик сообщений и первичная установка хука (без изменений) ---
	self.addEventListener('message', function(e) {
		if (e.data?.type === 'EVAL_ADBLOCK_CODE' && e.data.code) {
			workerLogDebug("Получено сообщение EVAL_ADBLOCK_CODE (запасной метод). Попытка выполнения...");
			try {
				eval(e.data.code);
				workerLogDebug("EVAL_ADBLOCK_CODE успешно выполнен.");
				if (!self.fetch.hooked_by_adblock) {
					workerLogDebug("EVAL: Fetch еще не был перехвачен, пытаемся установить...");
					if (installWorkerFetchHook()) {
						try {
							 workerLogDebug("EVAL: Отправка ADBLOCK_WORKER_HOOKS_READY после eval...");
							 self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval' });
						} catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY после eval:", e); }
					} else { workerLogError("Не удалось установить перехват fetch в Worker'е после eval!"); }
				} else { workerLogDebug("Перехват fetch уже был установлен, повторная установка не требуется."); }
			} catch (err) { workerLogError("Ошибка выполнения кода из EVAL_ADBLOCK_CODE:", err); }
		}
	 });

	workerLogDebug("Перед первичной попыткой установки fetch hook...");
	if (installWorkerFetchHook()) {
		try {
			workerLogDebug("INITIAL: Отправка ADBLOCK_WORKER_HOOKS_READY...");
			self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' });
		} catch(e) { workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY при инициализации:", e); }
	} else { workerLogError("Не удалось установить перехват fetch в Worker'е при инициализации!"); }

	workerLogDebug("--- Worker AdBlock Code EXECUTION FINISHED (Инициализация завершена) ---");
	// --- Worker AdBlock Code End ---
	`;
    } // end getWorkerInjectionCode

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК) (Оптимизировано) ---
    async function fetchOverride(input, init) {
        const context = 'MainFetch';
        let requestUrl = '';
        let method = 'GET'; // По умолчанию

        // Определение URL и метода с одного раза
        if (input instanceof Request) {
            requestUrl = input.url;
            method = input.method;
        } else {
            requestUrl = String(input);
        }
        // Переопределение метода, если он указан в init
        if (init && init.method) {
            method = init.method;
        }

        // Быстрая проверка на блокировку по ключевым словам
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch (${method}) запроса к: ${requestUrl}`);
            // Возвращаем пустой успешный ответ, чтобы не вызывать ошибок в коде Twitch
            return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by TTV AdBlock)" }));
        }

        // Логирование GQL запросов (если включено)
        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql') && method.toUpperCase() === 'POST') {
            logGqlOperation(context, init?.body); // Вынесли в отдельную функцию
        }

        // Вызов оригинального fetch
        try {
            // const response = await originalFetch(input, init); // Возвращаем как было
            // return response;
            return originalFetch(input, init); // Оптимизация: не создаем лишнюю переменную
        } catch (error) {
            // Обработка типовых ошибок сети, которые могут быть вызваны внешними блокировщиками
            if (error.name === 'TypeError' && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                logWarn(context, `Fetch к ${requestUrl.substring(0,100)}... не удался (возможно, заблокирован внешне): ${error.message}`);
                // Возвращаем фейковый ответ, чтобы приложение не упало
                return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed (TTV AdBlock Passthrough)" }));
            } else {
                logError(context, `Ошибка выполнения оригинального fetch для ${requestUrl.substring(0,100)}...:`, error);
                throw error; // Перебрасываем другие ошибки
            }
        }
    } // end fetchOverride

    // --- Улучшенный XHR перехват ---
    const xhrRequestData = new WeakMap(); // Используем WeakMap для хранения данных запроса, связанных с экземпляром XHR

    function xhrOpenOverride(method, url, async, user, password) {
        const context = 'MainXHR';
        const urlString = String(url); // Убедимся, что url - строка
        let blocked = false;

        // Проверка на блокировку
        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR (${method}) запроса к: ${urlString}`);
            blocked = true;
            // Не вызываем оригинал, блокировка произойдет в 'send'
        }

        // Сохраняем данные для использования в 'send'
        xhrRequestData.set(this, { method: method, url: urlString, blocked: blocked });

        // Вызываем оригинальный open только если запрос не заблокирован
        // Ошибки в 'send' не произойдет, т.к. мы проверим флаг 'blocked'
        if (!blocked) {
            try {
                return originalXhrOpen.call(this, method, url, async, user, password);
            } catch (error) {
                logError(context, `Ошибка выполнения оригинального xhr.open для ${urlString.substring(0,100)}...:`, error);
                throw error; // Перебрасываем ошибку
            }
        } else {
            // Если заблокировано, просто ничего не делаем здесь.
            // Логика блокировки сработает в xhrSendOverride.
            return; // Важно вернуть undefined, как может делать оригинальный open в некоторых случаях
        }
    } // end xhrOpenOverride

    function xhrSendOverride(data) {
        const context = 'MainXHR';
        const requestInfo = xhrRequestData.get(this);

        // Проверка, есть ли данные о запросе (должны быть всегда, если open перехвачен)
        if (!requestInfo) {
            logWarn(context, "Не удалось получить данные запроса для XHR.send. Вызов оригинала.");
            try { return originalXhrSend.call(this, data); }
            catch(e) { logError(context, "Ошибка вызова оригинального xhr.send без requestInfo:", e); throw e;}
        }

        const { method, url, blocked } = requestInfo;

        // Если запрос был помечен как заблокированный в 'open'
        if (blocked) {
            logWarn(context, `Прерывание заблокированного XHR (${method}) к ${url.substring(0,100)}... в send.`);
            // Имитируем событие ошибки сети для XMLHttpRequest
            this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false, lengthComputable: false }));
            // Пытаемся тихо прервать запрос, если это возможно
            try { if (typeof this.abort === 'function') this.abort(); }
            catch(e) { logWarn(context, `Не удалось вызвать abort() для заблокированного XHR к ${url.substring(0,100)}...: ${e.message}`); }
            return; // Прерываем выполнение send
        }

        // Логирование GQL, если включено и это POST запрос
        if (LOG_GQL_INTERCEPTION && url.includes('/gql') && method.toUpperCase() === 'POST') {
            logGqlOperation(context, data);
        }

        // Вызов оригинального send
        try {
            return originalXhrSend.call(this, data);
        } catch (error) {
            logError(context, `Ошибка выполнения оригинального xhr.send для ${url.substring(0,100)}...:`, error);
            throw error;
        }
    } // end xhrSendOverride

    // --- Вспомогательная функция для логирования GQL ---
    function logGqlOperation(context, body) {
        if (!LOG_GQL_INTERCEPTION) return; // Проверка флага логирования GQL
        try {
            let operationName = null;
            if (body) {
                let parsedBody = body;
                // Пытаемся распарсить тело, если это строка
                if (typeof parsedBody === 'string') {
                    try { parsedBody = JSON.parse(parsedBody); } catch (e) { parsedBody = null; }
                }
                // Извлекаем operationName из объекта или массива объектов
                if (parsedBody) {
                    operationName = parsedBody.operationName || (Array.isArray(parsedBody) ? parsedBody[0]?.operationName : null);
                }
            }

            if (operationName) {
                logDebug(context, `GraphQL Request: ${operationName}`);
                // Дополнительное логирование для важной операции
                if (operationName === GQL_OPERATION_ACCESS_TOKEN) {
                    logDebug(context, `--> Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN}`);
                }
            } else {
                logTrace(context, `GraphQL Request: Не удалось определить operationName.`);
            }
        } catch (e) {
            logWarn(context, 'Ошибка при логировании GraphQL операции:', e);
        }
    }

    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER (Без изменений, использует getWorkerInjectionCode) ---
    function createObjectURLOverride_Sync(blob) {
        const context = 'ObjectURLSync';
        const blobType = blob?.type || 'unknown';
        const blobSize = blob?.size || 0;

        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker') || blobType === '')) {
            if (LOG_WORKER_INJECTION) logDebug(context, `Перехвачен createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}. Логика внедрения сработает в hookWorkerConstructor.`);
            // Просто возвращаем оригинальный URL, модификация тут невозможна синхронно.
            return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        } else {
            if (blob instanceof Blob) {
                logTrace(context, `Пропуск createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
            } else {
                logTrace(context, `Пропуск createObjectURL для не-Blob объекта.`);
            }
            return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        // (Без изменений)
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true;
        const context = 'WorkerMsg';

        workerInstance.addEventListener('error', (e) => {
            logError(context, `Ошибка В Worker'е (${label}):`, e.message, e.filename, e.lineno, e);
        });

        const adBlockListener = (e) => {
            const messageData = e.data;
            if (messageData?.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                logDebug('WorkerHook', `---> ПОЛУЧЕНО ПОДТВЕРЖДЕНИЕ ADBLOCK_WORKER_HOOKS_READY от Worker'а (${label})! Метод: ${messageData.method || 'unknown'}`);
                hookedWorkers.add(label);
            }
            else if (messageData?.type === 'ADBLOCK_ADS_REMOVED') {
                if (LOG_M3U8_CLEANING) logDebug('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). URL: ${messageData.url}, Удалено строк: ${messageData.linesRemoved}`);
            }
        };
        workerInstance.addEventListener('message', adBlockListener);
        workerInstance._adBlockListener = adBlockListener; // Сохраняем ссылку для возможного удаления
        logTrace(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
    }

    function hookWorkerConstructor() {
        // (Без изменений)
        if (!INJECT_INTO_WORKERS) {
            logWarn('WorkerHook', "Внедрение кода в Worker'ы отключено в настройках.");
            return;
        }
        if (unsafeWindow.Worker?.hooked_by_adblock) {
            logDebug('WorkerHook', "Конструктор Worker уже перехвачен.");
            return;
        }
        if (typeof unsafeWindow.Worker === 'undefined') {
            logError('WorkerHook', 'Конструктор Worker (unsafeWindow.Worker) не определен. Невозможно перехватить.');
            return;
        }

        logTrace('WorkerHook', "Попытка перехвата конструктора Worker...");
        workerHookAttempted = true;
        const OriginalWorkerClass = unsafeWindow.Worker;

        unsafeWindow.Worker = class HookedWorker extends OriginalWorkerClass {
            constructor(scriptURL, options) {
                let urlString = '';
                let isBlobURL = false;
                let workerLabel = 'unknown';
                let targetScriptURL = scriptURL; // URL, который будет передан в super()

                try {
                    if (scriptURL instanceof URL) { urlString = scriptURL.href; }
                    else if (typeof scriptURL === 'string') { urlString = scriptURL; }

                    isBlobURL = urlString.startsWith('blob:');

                    if (isBlobURL) { workerLabel = `blob:${urlString.substring(5, 40)}...`; }
                    else if (urlString) { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); }
                    else { workerLabel = `non-url-source (${typeof scriptURL})`; }

                    if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : (urlString ? 'Script URL' : 'Unknown')}`);


                } catch (e) {
                    logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL);
                    workerLabel = 'error-determining-source';
                }

                // Вызываем оригинальный конструктор
                super(targetScriptURL, options);
                this._workerLabel = workerLabel; // Сохраняем метку для логов

                // Добавляем слушатели для получения сообщений от worker'а
                addWorkerMessageListeners(this, workerLabel);

                if (!isBlobURL && urlString && INJECT_INTO_WORKERS) {
                    // Даем worker'у немного времени на инициализацию перед отправкой кода
                    setTimeout(() => {
                        if (!hookedWorkers.has(this._workerLabel)) { // Проверяем, не пришло ли уже подтверждение
                            if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук не сработал). Запасная попытка внедрения через postMessage...`);
                            try {
                                const injectionCode = getWorkerInjectionCode();
                                this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode });
                            } catch(e) {
                                logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e);
                            }
                        } else {
                            if (LOG_WORKER_INJECTION) logTrace('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков (запасной механизм не требуется).`);
                        }
                    }, 500); // Задержка для инициализации worker'а
                }
            }
        };

        // Восстанавливаем прототипы для совместимости
        Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass);
        Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype);
        unsafeWindow.Worker.hooked_by_adblock = true; // Флаг, что конструктор перехвачен

        logDebug('WorkerHook', "Конструктор Worker успешно перехвачен.");
    } // end hookWorkerConstructor


    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК) (без изменений) ---
    function installHooks() {
        if (hooksInstalledMain) { logWarn('Hooks', "Попытка повторной установки хуков."); return; }
        logDebug('Hooks', "Установка перехватов в основном потоке...");

        try { unsafeWindow.fetch = fetchOverride; logTrace('Hooks', "Перехват Fetch API установлен."); }
        catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }

        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            logTrace('Hooks', "Перехваты XMLHttpRequest (open, send) установлены.");
        } catch (e) {
            logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e);
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend;
        }

        if (INJECT_INTO_WORKERS) {
            try {
                unsafeWindow.URL.createObjectURL = createObjectURLOverride_Sync;
                logDebug('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН (Синхронный).");
            } catch (e) {
                logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e);
                if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL;
            }

            try { hookWorkerConstructor(); }
            catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            try {
                unsafeWindow.URL.revokeObjectURL = function(url) {
                    logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`);
                    return originalRevokeObjectURL.call(unsafeWindow.URL, url);
                };
                logTrace('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен.");
            } catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else {
            logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются.");
        }

        hooksInstalledMain = true;
        logDebug('Hooks', "Установка перехватов в основном потоке завершена.");
    } // end installHooks


    // --- ФУНКЦИИ МОНИТОРИНГА И ПЕРЕЗАГРУЗКИ ПЛЕЕРА (Оптимизировано с кэшированием элемента) ---
    function findVideoPlayer() {
        // Сначала проверяем кэшированный элемент
        if (videoElement && document.body.contains(videoElement)) {
            logTrace('PlayerFinder', 'Используем кэшированный видеоэлемент.');
            return videoElement;
        }
        // Если кэш невалиден, ищем заново
        logTrace('PlayerFinder', 'Кэшированный видеоэлемент не найден или не в DOM. Поиск нового...');
        const selectors = [
            PLAYER_SELECTOR, // Основной селектор
            '.video-player__container video',
            'div[data-a-target="video-player"] video',
            'div[data-a-target="video-player-layout"] video',
            '.persistent-player video'
        ];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.tagName === 'VIDEO' && element.src) { // Добавлена проверка на src
                    logTrace('PlayerFinder', `Найден новый видеоэлемент по селектору: ${selector}`);
                    videoElement = element; // Обновляем кэш
                    return element;
                }
            } catch (e) {
                logWarn('PlayerFinder', `Ошибка поиска по селектору "${selector}":`, e.message);
            }
        }
        logTrace('PlayerFinder', 'Видеоэлемент не найден ни по одному из селекторов.');
        videoElement = null; // Сбрасываем кэш, если не нашли
        return null;
    } // end findVideoPlayer

    function triggerReload(reason) {
        // (Без изменений)
        const context = 'PlayerReload';
        const now = Date.now();
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn(context, `Перезагрузка запрошена (${reason}), но кулдаун (${RELOAD_COOLDOWN_MS / 1000}с) еще активен. Отмена.`);
            return;
        }
        if (document.hidden) {
            logWarn(context, `Перезагрузка запрошена (${reason}), но вкладка неактивна. Отмена.`);
            return;
        }
        logWarn(context, `!!! ПЕРЕЗАГРУЗКА СТРАНИЦЫ !!! Причина: ${reason}.`);
        lastReloadTimestamp = now;
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); }
        catch (e) { logError(context, "Не удалось записать время перезагрузки в sessionStorage:", e); }
        unsafeWindow.location.reload();
    } // end triggerReload

    function resetMonitorState(reason = '') {
        // (Без изменений)
        if (reloadTimeoutId) {
            clearTimeout(reloadTimeoutId);
            reloadTimeoutId = null;
            logTrace('PlayerMonitor', `Отменен запланированный reload (${reason}).`);
        }
        lastVideoTimeUpdateTimestamp = Date.now();
        // Используем кэшированный videoElement
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0;
    } // end resetMonitorState

    function monitorPlayerState() {
        const context = 'PlayerMonitor';
        // Используем кэшированный videoElement
        if (!videoElement || !document.body.contains(videoElement)) {
            logWarn(context, 'Кэшированный видеоэлемент потерян. Попытка перенастроить монитор...');
            setupPlayerMonitor(); // Попробует найти новый элемент и обновить кэш
            return;
        }

        const now = Date.now();
        const isPlaying = !videoElement.paused && !videoElement.ended;
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        let stallReason = null;

        // Проверка на зависание (если плеер играет)
        if (isPlaying && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;

            // currentTime не увеличивается ИЛИ readyState недостаточен для воспроизведения
            if ((currentTime <= lastKnownVideoTime || readyState < videoElement.HAVE_FUTURE_DATA) && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                stallReason = `currentTime (${currentTime.toFixed(2)}) <= lastKnown (${lastKnownVideoTime.toFixed(2)}) или readyState (${readyState}) < HAVE_FUTURE_DATA в течение > ${timeSinceLastUpdate.toFixed(0)}ms`;
            }
            // Если currentTime обновился, сбрасываем таймеры
            else if (currentTime > lastKnownVideoTime) {
                lastKnownVideoTime = currentTime;
                lastVideoTimeUpdateTimestamp = now;
                isWaitingForDataTimestamp = 0; // Сброс буферизации при обновлении времени
                if (reloadTimeoutId) {
                    logDebug(context, "Воспроизведение возобновилось (timeupdate). Отмена перезагрузки.");
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                }
            }

            // Запуск таймера перезагрузки при зависании
            if (stallReason && !reloadTimeoutId) {
                logWarn(context, `Обнаружено зависание плеера! Причина: ${stallReason}.`);
                logWarn(context, `Планируем перезагрузку через 5 секунд...`);
                reloadTimeoutId = setTimeout(() => triggerReload(stallReason), 5000);
                return; // Выходим, чтобы не проверять буферизацию сразу после зависания
            }
        }

        // Проверка на длительную буферизацию (если буферизация была зафиксирована)
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            if (now - isWaitingForDataTimestamp > RELOAD_BUFFERING_THRESHOLD_MS) {
                const bufferReason = `Длительная буферизация/Ожидание данных > ${RELOAD_BUFFERING_THRESHOLD_MS / 1000}с (readyState: ${readyState})`;
                logWarn(context, bufferReason);
                if (!reloadTimeoutId) {
                    logWarn(context, `Планируем перезагрузку через 5 секунд...`);
                    reloadTimeoutId = setTimeout(() => triggerReload(bufferReason), 5000);
                }
                // Не выходим, чтобы следующая проверка могла сбросить таймер, если буферизация закончится
            }
        }

        // Сброс таймера буферизации, если воспроизведение возобновилось
        if (isPlaying && isWaitingForDataTimestamp > 0 && readyState >= videoElement.HAVE_FUTURE_DATA) {
            logTrace(context, `Буферизация завершена (readyState: ${readyState}). Сброс таймера ожидания.`);
            isWaitingForDataTimestamp = 0;
            // Отменяем перезагрузку, если она была запланирована из-за буферизации
            if (reloadTimeoutId && !stallReason) { // Отменяем только если не было зависания
                logDebug(context, "Воспроизведение возобновилось после буферизации. Отмена перезагрузки.");
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }
    } // end monitorPlayerState


    function setupPlayerMonitor() {
        if (!ENABLE_AUTO_RELOAD) {
            logDebug('PlayerMonitor', 'Авто-перезагрузка отключена в настройках.');
            // Убираем существующий монитор, если он есть
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (videoElement) { removePlayerEventListeners(); videoElement = null; } // Удаляем слушатели и сбрасываем кэш
            return;
        }

        const context = 'PlayerMonitorSetup';
        const currentVideoElement = findVideoPlayer(); // Ищет или использует кэш

        // Если элемент тот же и монитор уже запущен, ничего не делаем
        if (currentVideoElement === videoElement && playerMonitorIntervalId) {
            logTrace(context, 'Монитор уже запущен для текущего видеоэлемента.');
            return;
        }

        // Если элемент изменился или монитор не запущен, останавливаем старый (если был)
        if (playerMonitorIntervalId) {
            logDebug(context, 'Остановка предыдущего монитора плеера.');
            clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
        }
        if (videoElement) { // Удаляем слушатели со старого элемента
            removePlayerEventListeners();
        }

        videoElement = currentVideoElement; // Обновляем кэш

        if (!videoElement) {
            logTrace(context, 'Видеоэлемент не найден. Повторная попытка через 3 секунды.');
            setTimeout(setupPlayerMonitor, 3000); // Повторная попытка найти
            return;
        }

        logDebug(context, 'Видеоэлемент найден/обновлен. Установка слушателей событий и запуск мониторинга...');

        // Проверка кулдауна после перезагрузки (без изменений)
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const timeSinceLastReload = Date.now() - parseInt(sessionReloadTime, 10);
                if (timeSinceLastReload < RELOAD_COOLDOWN_MS) {
                    logWarn(context, `Обнаружена недавняя перезагрузка (${(timeSinceLastReload / 1000).toFixed(1)}с назад). Устанавливаем кулдаун.`);
                    lastReloadTimestamp = Date.now() - timeSinceLastReload + RELOAD_COOLDOWN_MS; // Корректируем время последнего релоада
                }
                sessionStorage.removeItem('ttv_adblock_last_reload');
            }
        } catch (e) { logError(context, "Ошибка чтения времени перезагрузки из sessionStorage:", e); }

        // Установка слушателей на новый элемент
        addPlayerEventListeners();

        resetMonitorState('Initial setup or element change'); // Сброс состояния монитора
        playerMonitorIntervalId = setInterval(monitorPlayerState, 2000); // Запуск интервала

        logDebug(context, `Мониторинг плеера запущен (Интервал: 2000мс, Порог зависания: ${RELOAD_STALL_THRESHOLD_MS}мс, Порог буферизации: ${RELOAD_BUFFERING_THRESHOLD_MS}мс).`);
    } // end setupPlayerMonitor

    // Вспомогательные функции для добавления/удаления слушателей
    function addPlayerEventListeners() {
        if (!videoElement) return;
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true });
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true });
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });
        videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true }); // Добавлено для сброса
        videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true }); // Для сброса при смене источника
        // 'timeupdate' не нужен для логики мониторинга зависания/буферизации
        logTrace('PlayerEvents', 'Слушатели событий плеера добавлены.');
    }

    function removePlayerEventListeners() {
        if (!videoElement) return;
        videoElement.removeEventListener('error', handlePlayerError);
        videoElement.removeEventListener('waiting', handlePlayerWaiting);
        videoElement.removeEventListener('playing', handlePlayerPlaying);
        videoElement.removeEventListener('pause', handlePlayerPause);
        videoElement.removeEventListener('emptied', handlePlayerEmptied);
        videoElement.removeEventListener('loadedmetadata', handlePlayerLoadedMeta);
        logTrace('PlayerEvents', 'Слушатели событий плеера удалены.');
    }

    // --- Обработчики событий плеера (без timeupdate) ---
    function handlePlayerError(event) {
        // (Логика без изменений)
        const context = 'PlayerEvent:Error';
        if (!videoElement || !videoElement.error) {
            logWarn(context, 'Событие ошибки получено, но объект ошибки отсутствует.');
            return;
        }
        const error = videoElement.error;
        logError(context, `Ошибка плеера! Код: ${error.code}, Сообщение: "${error.message}"`);
        if (RELOAD_ON_ERROR_CODES.includes(error.code)) {
            const errorReason = `Ошибка плеера (код ${error.code})`;
            logWarn(context, `Ошибка (код ${error.code}) требует перезагрузки.`);
            if (!reloadTimeoutId) {
                logWarn(context, `Планируем перезагрузку через 3 секунды (причина: ${errorReason})...`);
                reloadTimeoutId = setTimeout(() => triggerReload(errorReason), 3000);
            }
        } else {
            logWarn(context, `Ошибка (код ${error.code}) не входит в список для перезагрузки (${RELOAD_ON_ERROR_CODES.join(',')}).`);
        }
    }

    function handlePlayerWaiting() {
        const context = 'PlayerEvent:Waiting';
        // Запускаем таймер буферизации только если плеер действительно ожидает данных
        if (videoElement && videoElement.readyState < videoElement.HAVE_FUTURE_DATA && isWaitingForDataTimestamp === 0 && !videoElement.paused) {
            logTrace(context, `Плеер начал буферизацию/ожидание (readyState: ${videoElement.readyState}). Запуск таймера.`);
            isWaitingForDataTimestamp = Date.now();
        } else {
            logTrace(context, `Событие 'waiting', но readyState (${videoElement?.readyState}) достаточный, плеер на паузе, или таймер уже запущен. Игнорируем.`);
        }
    }

    function handlePlayerPlaying() {
        logTrace('PlayerEvent:Playing', 'Воспроизведение началось/возобновилось.');
        resetMonitorState('Playing event'); // Сбрасывает таймеры зависания и буферизации
    }

    function handlePlayerPause() {
        logTrace('PlayerEvent:Pause', 'Воспроизведение приостановлено.');
        resetMonitorState('Pause event'); // Сбрасывает таймеры
    }

    function handlePlayerEmptied() {
        logTrace('PlayerEvent:Emptied', 'Событие Emptied (например, смена канала). Сброс состояния монитора.');
        resetMonitorState('Emptied event');
        // Может потребоваться перезапуск монитора, если элемент плеера остался тот же
        // setupPlayerMonitor(); // Раскомментировать, если нужно гарантировать перезапуск
    }
    function handlePlayerLoadedMeta() {
        logTrace('PlayerEvent:LoadedMetadata', 'Метаданные загружены (возможно, смена качества или источника). Сброс состояния монитора.');
        resetMonitorState('LoadedMetadata event');
    }

    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА (Оптимизировано) ---
    logDebug('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);

    installHooks(); // Устанавливаем перехваты сети и Worker'ов
    setQualitySettings(true); // Принудительно проверяем и устанавливаем качество при запуске

    // --- Улучшенные обработчики событий жизненного цикла страницы ---
    // Используем requestAnimationFrame для установки качества после того, как вкладка станет видимой,
    // чтобы дать браузеру отрисовать кадр.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            logDebug('VisibilityChange', "Вкладка стала видимой.");
            requestAnimationFrame(() => {
                logTrace('VisibilityChange', "requestAnimationFrame: Повторная установка качества 'Источник'.");
                setQualitySettings(true); // Принудительно проверяем localStorage
                if (ENABLE_AUTO_RELOAD) {
                    logTrace('VisibilityChange', 'requestAnimationFrame: Перезапуск монитора плеера.');
                    setupPlayerMonitor(); // Перезапускаем монитор
                }
            });
        } else {
            logDebug('VisibilityChange', "Вкладка скрыта.");
            if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) {
                logTrace('VisibilityChange', 'Остановка монитора плеера.');
                clearInterval(playerMonitorIntervalId);
                playerMonitorIntervalId = null;
                // Не сбрасываем videoElement, чтобы можно было быстро найти его при возвращении
                if (videoElement) removePlayerEventListeners(); // Удаляем слушатели, чтобы не срабатывали в фоне
            }
            if (reloadTimeoutId) { // Отменяем запланированную перезагрузку
                logWarn('VisibilityChange', 'Вкладка скрыта, отмена запланированной перезагрузки.');
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }
    }, { passive: true });
    logDebug('Init', "Слушатель 'visibilitychange' для качества и монитора установлен.");

    // Навигация: используем таймаут для дебаунсинга, чтобы избежать частых вызовов при быстрой навигации
    let navigationDebounceTimer = null;
    const handleNavigationChange = () => {
        clearTimeout(navigationDebounceTimer);
        navigationDebounceTimer = setTimeout(() => {
            logDebug('Navigation', "Обнаружено изменение состояния навигации (push/replace/pop).");
            setQualitySettings(true); // Принудительно проверяем localStorage
            if (ENABLE_AUTO_RELOAD) {
                logTrace('Navigation', 'Перезапуск монитора плеера.');
                setupPlayerMonitor(); // Перезапускаем монитор
            }
        }, 500); // Задержка 500 мс
    };

    try {
        const originalPushState = history.pushState;
        history.pushState = function(...args) { originalPushState.apply(this, args); handleNavigationChange(); };
        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) { originalReplaceState.apply(this, args); handleNavigationChange(); };
        unsafeWindow.addEventListener('popstate', handleNavigationChange, { passive: true });
        logDebug('Init', "Слушатели истории навигации для качества и монитора установлены.");
    } catch (e) { logError('Init', "Не удалось добавить слушатели истории навигации:", e); }

    // Периодическая проверка качества (если включена)
    if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) {
        if (qualitySetIntervalId) { clearInterval(qualitySetIntervalId); } // Очищаем старый интервал, если есть
        qualitySetIntervalId = setInterval(() => {
            logTrace('PeriodicQualityCheck', `Периодическая проверка качества (интервал: ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс).`);
            setQualitySettings(); // Используем кэш по умолчанию
        }, PERIODIC_QUALITY_CHECK_INTERVAL_MS);
        logDebug('Init', `Периодическая проверка качества 'Источник' запущена (интервал ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс).`);
    } else {
        logDebug('Init', `Периодическая проверка качества отключена.`);
    }

    // Запуск первичной настройки монитора после загрузки DOM
    function onDomReady() {
        logDebug('Init', "DOM готов (DOMContentLoaded). Запуск первичной настройки монитора плеера.");
        setupPlayerMonitor(); // Находит плеер и запускает монитор
    }

    // Гарантированный запуск onDomReady
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', onDomReady, { once: true, passive: true });
    } else {
        // Если DOM уже готов, запускаем немедленно (или почти немедленно)
        requestAnimationFrame(onDomReady);
    }

    logDebug('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);

})();