// ==UserScript==
// @name         Twitch Adblock Fix & Force Source Quality
// @namespace    TwitchAdblockOptimizedWorkerM3U8Proxy_ForceSource
// @version      18.1.4
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
    const SCRIPT_VERSION = '18.1.4';
    const SHOW_ERRORS = true; // Оставляем показ ошибок
    const DEBUG_LOGGING = GM_getValue('TTV_AdBlock_DebugLog', false);
    const LOG_M3U8_CLEANING = GM_getValue('TTV_AdBlock_LogM3U8Clean', true);
    const LOG_NETWORK_BLOCKING = GM_getValue('TTV_AdBlock_LogNetBlock', true);
    const LOG_GQL_INTERCEPTION = GM_getValue('TTV_AdBlock_LogGQLIntercept', false);
    const LOG_WORKER_INJECTION = GM_getValue('TTV_AdBlock_LogWorkerInject', true);
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const ENABLE_PERIODIC_QUALITY_CHECK = GM_getValue('TTV_AdBlock_PeriodicQualityCheck', true);
    const PERIODIC_QUALITY_CHECK_INTERVAL_MS = GM_getValue('TTV_AdBlock_QualityCheckInterval', 1000);

    // --- НАСТРОЙКИ ДЛЯ АВТО-ПЕРЕЗАГРУЗКИ ---
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const RELOAD_ON_ERROR_CODES = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', [1000, 2000, 3000, 4000]); // Распространенные коды ошибок Twitch
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 2000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 10000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 10000);

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
    var lastKnownVideoTime = -1;
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
    function logDebug(source, message, ...args) { if (DEBUG_LOGGING) console.log(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); } // Используем console.log для DEBUG
    function logTrace(source, message, ...args) { if (DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args); } // Используем console.debug для TRACE


    logDebug('MAIN', `Скрипт запускается. Версия: ${SCRIPT_VERSION}. Worker Inject: ${INJECT_INTO_WORKERS}. Periodic Quality Check: ${ENABLE_PERIODIC_QUALITY_CHECK}. Auto Reload: ${ENABLE_AUTO_RELOAD}.`);

    // --- ЛОГИКА УСТАНОВКИ КАЧЕСТВА ---
    function setQualitySettings() { const context = 'QualityV2Enhanced'; try { const currentValue = unsafeWindow.localStorage.getItem(LS_KEY_QUALITY); const targetValue = '{"default":"chunked"}'; // 'chunked' соответствует качеству "Источник"
                                                                              if (currentValue !== targetValue) { unsafeWindow.localStorage.setItem(LS_KEY_QUALITY, targetValue); logDebug(context, `Установлено качество 'Источник' ('${targetValue}') через localStorage.`); } else { logTrace(context, `Качество 'Источник' ('${targetValue}') уже установлено в localStorage.`); } } catch (e) { logError(context, 'Ошибка установки настроек качества в localStorage:', e); } }

    // --- КОД ДЛЯ ВНЕДРЕНИЯ В WORKER ---
    function getWorkerInjectionCode() {
        return `
	// --- Worker AdBlock Code Start (v${SCRIPT_VERSION}) ---
	const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
	const DEBUG_LOGGING_WORKER = ${DEBUG_LOGGING}; // Передаем флаг из основного скрипта
	const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING};
	const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = '${AD_SIGNIFIER_DATERANGE_ATTR}';
	const AD_SIGNIFIERS_GENERAL_WORKER = ${JSON.stringify(AD_SIGNIFIERS_GENERAL)};
	const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ${JSON.stringify(AD_DATERANGE_ATTRIBUTE_KEYWORDS)};
	const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

	// --- Функции логирования Worker'а ---
	function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
	function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
	// INFO -> DEBUG
	function workerLogDebug(message, ...args) { if (DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
	function workerLogTrace(message, ...args) { if (DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' TRACE:', message, ...args); }


	workerLogDebug("--- Worker AdBlock Code EXECUTION STARTED ---");

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
			if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): M3U8 слишком короткий (\${lines.length} строк), пропускаем.\`);
			return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, isMidroll: false };
		}

		const cleanLines = [];
		let isAdSection = false;
		let adsFound = false;
		let linesRemoved = 0;
		let isMidrollAd = false;
		let discontinuityCountInAd = 0;

		if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обработка \${lines.length} строк...\`);

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			let trimmedLine = line.trim();

			if (!trimmedLine) {
				cleanLines.push(line);
				continue;
			}

			let isAdMarkerLine = false;
			let shouldRemoveLine = false;

			if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && trimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER)) {
				isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
				if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (CLASS=\${AD_SIGNIFIER_DATERANGE_ATTR_WORKER}) [\${i}]\`);
				shouldRemoveLine = true;
			}
			else if (trimmedLine.startsWith('#EXT-X-DATERANGE:') && AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => trimmedLine.toUpperCase().includes(kw))) {
				isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0; isMidrollAd = true;
				if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен DATERANGE рекламы (по ключевому слову) [\${i}]\`);
				shouldRemoveLine = true;
			}
			else if (trimmedLine.startsWith('#EXT-X-CUE-OUT') || trimmedLine.startsWith('#EXT-X-SCTE35:') || trimmedLine.startsWith('#EXT-X-ASSET:')) {
				isAdSection = true; isAdMarkerLine = true; adsFound = true; discontinuityCountInAd = 0;
				isMidrollAd = true;
				if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен маркер начала рекламы (CUE-OUT/SCTE35/ASSET) [\${i}]\`);
				shouldRemoveLine = true;
			}
			else if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
				if (isAdSection) {
					if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен маркер конца #EXT-X-CUE-IN [\${i}]. Завершение рекламной секции.\`);
					isAdSection = false; isAdMarkerLine = true; shouldRemoveLine = true;
				} else {
					if (LOG_M3U8_CLEANING_WORKER) workerLogWarn(\`[\${context}] (\${urlShort}): Обнаружен #EXT-X-CUE-IN без активной рекламной секции [\${i}]. Удаляем на всякий случай.\`);
					shouldRemoveLine = true;
				}
			}
			else if (isAdSection && trimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
				 discontinuityCountInAd++;
				 if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Обнаружен DISCONTINUITY #${discontinuityCountInAd} внутри рекламной секции [\${i}]. Удаляем.\`);
				 shouldRemoveLine = true;
				 isAdMarkerLine = true;
			}

			if (isAdSection && !isAdMarkerLine) {
				shouldRemoveLine = true;
				if (trimmedLine.startsWith('#EXTINF:') || (trimmedLine.includes('.ts') && !trimmedLine.startsWith('#'))) {
					if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем строку сегмента/inf из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
				} else {
					if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Удаляем прочую строку из рекламной секции [\${i}]: \${trimmedLine.substring(0, 100)}\`);
				}
			}

			if (shouldRemoveLine) {
				linesRemoved++;
			} else {
				cleanLines.push(line);
			}
		}

		const cleanedText = cleanLines.join('\\n');

		if (adsFound) {

			if (LOG_M3U8_CLEANING_WORKER) workerLogDebug(\`[\${context}] (\${urlShort}): Очистка M3U8 завершена. Удалено строк: \${linesRemoved}. Обнаружена реклама (Midroll: \${isMidrollAd}).\`);
			try {
				self.postMessage({ type: 'ADBLOCK_ADS_REMOVED', isMidroll: isMidrollAd, url: urlShort });
			} catch(e) {
				workerLogError("Ошибка отправки сообщения ADBLOCK_ADS_REMOVED:", e);
			}
		} else {
			if (LOG_M3U8_CLEANING_WORKER) workerLogTrace(\`[\${context}] (\${urlShort}): Рекламные маркеры не найдены или не распознаны текущей логикой. Плейлист не изменен.\`);
			if (DEBUG_LOGGING_WORKER) {
				 workerLogTrace(\`[\${context}] (\${urlShort}) Первые 5 строк полученного M3U8:\\n\${lines.slice(0, 5).join('\\n')}\`);
			}
		}

		return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved, isMidroll: isMidrollAd };
	} // end parseAndCleanM3U8_WORKER

	function installWorkerFetchHook() {

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
		workerLogTrace("Перед сохранением оригинального self.fetch.");
		const workerRealFetch = self.fetch;
		workerLogTrace("Оригинальный self.fetch сохранен. Перед переопределением self.fetch.");

		self.fetch = async (input, init) => {
			let requestUrl = '';
			let method = 'GET';
			if (input instanceof Request) { requestUrl = input.url; method = input.method; }
			else { requestUrl = String(input); }
			if (init && init.method) { method = init.method; }

			const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;
			const isM3U8Request = requestUrl.includes('.m3u8');
			const isUsherRequest = requestUrl.includes('usher.ttvnw.net');
			const isSegmentRequest = requestUrl.includes('.ts');
			const context = 'WorkerFetch';

			if (method.toUpperCase() === 'GET' && DEBUG_LOGGING_WORKER) {
				if (!isSegmentRequest) {
				   workerLogTrace(\`[\${context}] Перехвачен GET запрос: \${requestUrl}\`); for less noise
				} else {
				   workerLogTrace(\`[\${context}] Перехвачен GET запрос на сегмент: \${urlShort}\`);
				}
			}

			if ((isM3U8Request || isUsherRequest) && method.toUpperCase() === 'GET') {

				workerLogDebug(\`[\${context}] ОБРАБОТКА M3U8/Usher: \${urlShort}\`);
				try {
					const originalResponse = await workerRealFetch(input, init);
					if (!originalResponse.ok) {
						 workerLogWarn(\`[\${context}] (\${urlShort}) Оригинальный ответ НЕ OK (Статус: \${originalResponse.status} \${originalResponse.statusText}). Пропускаем обработку.\`);
						 return originalResponse;
					}
					const clonedResponse = originalResponse.clone();
					const contentType = clonedResponse.headers.get('Content-Type') || '';

					if (contentType.includes('mpegurl') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('octet-stream')) {
						 workerLogTrace(\`[\${context}] (\${urlShort}) Ответ M3U8/Usher OK (\${clonedResponse.status}). Тип: '\${contentType}'. Чтение и очистка...\`);
						 const m3u8Text = await clonedResponse.text();
						 if (!m3u8Text) {
							 workerLogWarn(\`[\${context}] (\${urlShort}): Тело ответа M3U8/Usher пустое.\`);
							 return originalResponse;
						 }
						 const cleaningResult = parseAndCleanM3U8_WORKER(m3u8Text, requestUrl);
						 const newHeaders = new Headers(originalResponse.headers);
						 newHeaders.delete('Content-Length');
						 workerLogTrace(\`[\${context}] (\${urlShort}) Возврат \${cleaningResult.adsFound ? 'ОЧИЩЕННОГО' : 'оригинального (нет рекламы)'} M3U8. Удалено строк: \${cleaningResult.linesRemoved}\`);
						 return new Response(cleaningResult.cleanedText, {
							 status: originalResponse.status,
							 statusText: originalResponse.statusText,
							 headers: newHeaders
						 });
					} else {
						 workerLogWarn(\`[\${context}] (\${urlShort}) Ответ НЕ похож на M3U8 (Статус: \${clonedResponse.status}, Тип: '\${contentType}'). Пропускаем.\`);
						 return originalResponse;
					}
				} catch (error) {
					workerLogError(\`[\${context}] (\${urlShort}): Ошибка при проксировании/очистке M3U8/Usher запроса: \`, error);
					return new Response(\`AdBlock Error: Failed to process M3U8 - \${error.message}\`, {
						status: 500,
						statusText: "AdBlock Internal Error"
					});
				}
			} else {
				 if (!isSegmentRequest && DEBUG_LOGGING_WORKER) {
					  workerLogTrace(\`[\${context}] Пропускаем не-M3U8/Usher GET или не-GET запрос: (\${method}) \${urlShort}\`);
				 }
				 return workerRealFetch(input, init);
			}
		};
		self.fetch.hooked_by_adblock = true;

		workerLogDebug("Перехват fetch в Worker'е УСПЕШНО установлен и присвоен self.fetch.");
		return true;
	} // end installWorkerFetchHook

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

							 workerLogDebug("!!! --->>> EVAL: Отправка ADBLOCK_WORKER_HOOKS_READY после eval...");
							 self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'eval' });
						} catch(e) {
							 workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY после eval:", e);
						}
					} else {
						 workerLogError("Не удалось установить перехват fetch в Worker'е после eval!");
					}
				} else {

					workerLogDebug("Перехват fetch уже был установлен, повторная установка не требуется.");
				}
			} catch (err) {
				workerLogError("Ошибка выполнения кода из EVAL_ADBLOCK_CODE:", err);
			}
		}
	 });

	// --- Первичная установка хука ---

	workerLogDebug("Перед первичной попыткой установки fetch hook...");
	if (installWorkerFetchHook()) {
		try {

			workerLogDebug("!!! --->>> INITIAL: Отправка ADBLOCK_WORKER_HOOKS_READY...");
			self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'initial' });
		} catch(e) {
			 workerLogError("Ошибка отправки сообщения ADBLOCK_WORKER_HOOKS_READY при инициализации:", e);
		}
	} else {
		 workerLogError("Не удалось установить перехват fetch в Worker'е при инициализации!");
	}


	workerLogDebug("--- Worker AdBlock Code EXECUTION FINISHED (Инициализация завершена) ---");
	// --- Worker AdBlock Code End ---
	`;
    } // end getWorkerInjectionCode

    // --- ПЕРЕХВАТЫ СЕТЕВЫХ ЗАПРОСОВ (ОСНОВНОЙ ПОТОК) ---
    async function fetchOverride(input, init) {
        const context = 'MainFetch';
        let requestUrl = '';
        let method = 'GET';
        if (input instanceof Request) { requestUrl = input.url; method = input.method; }
        else { requestUrl = String(input); }
        if (init && init.method) { method = init.method; }
        const urlShort = requestUrl.split(/[?#]/)[0].split('/').pop() || requestUrl;

        if (AD_URL_KEYWORDS_BLOCK.some(keyword => requestUrl.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА Fetch (${method}) запроса к: ${requestUrl}`);
            return Promise.resolve(new Response(null, { status: 204, statusText: "No Content (Blocked by TTV AdBlock)" }));
        }

        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => requestUrl.includes(keyword))) {

            logDebug(context, `Обнаружен потенциально рекламный Fetch запрос (${method}) (НЕ БЛОКИРОВАН): ${requestUrl}`);
        }

        if (LOG_GQL_INTERCEPTION && requestUrl.includes('/gql')) {
            try {
                if (method.toUpperCase() === 'POST' && init && init.body) {
                    let bodyData = init.body;
                    if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {/* ignore */} }
                    let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                    if (operationName) {

                        logDebug(context, `GraphQL Fetch: ${operationName}`);
                        if (operationName === GQL_OPERATION_ACCESS_TOKEN) {

                            logDebug(context, `Перехвачен запрос ${GQL_OPERATION_ACCESS_TOKEN} (до выполнения)`);
                        }
                    } else { logTrace(context, `GraphQL Fetch: Не удалось определить operationName`); }
                } else { logTrace(context, `GraphQL Fetch: Обнаружен GET или запрос без тела`); }
            } catch (e) { logWarn(context, 'Ошибка при логировании GraphQL Fetch:', e); }
        }

        try {
            const response = await originalFetch(input, init);
            return response;
        } catch (error) {
            if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) {
                logWarn(context, `Fetch к ${urlShort} не удался (возможно, заблокирован внешне): ${error.message}`);
                return Promise.resolve(new Response(null, { status: 0, statusText: "Blocked or Failed (TTV AdBlock Passthrough)" }));
            } else {
                logError(context, `Ошибка выполнения оригинального fetch для ${urlShort}:`, error);
                throw error;
            }
        }
    } // end fetchOverride

    const xhrRequestData = new WeakMap();

    function xhrOpenOverride(method, url, async, user, password) {
        const context = 'MainXHR';
        const urlString = String(url);
        const urlShort = urlString.split(/[?#]/)[0].split('/').pop() || urlString;
        xhrRequestData.set(this, { method: method, url: urlString, urlShort: urlShort, blocked: false });

        if (AD_URL_KEYWORDS_BLOCK.some(keyword => urlString.includes(keyword))) {
            if (LOG_NETWORK_BLOCKING) logWarn(context, `БЛОКИРОВКА XHR (${method}) запроса к: ${urlString}`);
            xhrRequestData.get(this).blocked = true;
        }

        if (LOG_NETWORK_BLOCKING && AD_URL_KEYWORDS_WARN.some(keyword => urlString.includes(keyword))) {

            logDebug(context, `Обнаружен потенциально рекламный XHR запрос (${method}) (НЕ БЛОКИРОВАН): ${urlString}`);
        }

        if (LOG_GQL_INTERCEPTION && urlString.includes('/gql')) {

            logDebug(context, `Обнаружен GraphQL XHR запрос (до send): ${urlShort}`);
        }

        if (!xhrRequestData.get(this).blocked) {
            try {
                return originalXhrOpen.call(this, method, url, async, user, password);
            } catch (error) {
                logError(context, `Ошибка выполнения оригинального xhr.open для ${urlShort}:`, error);
                throw error;
            }
        }
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

        if (blocked) {
            logWarn(context, `Прерывание заблокированного XHR (${method}) к ${urlShort} в send.`);
            this.dispatchEvent(new ProgressEvent('error', { bubbles: false, cancelable: false, lengthComputable: false }));
            try { this.abort(); }
            catch(e) { logWarn(context, `Не удалось вызвать abort() для заблокированного XHR к ${urlShort}: ${e.message}`); }
            return;
        }

        if (LOG_GQL_INTERCEPTION && url.includes('/gql')) {
            try {
                let bodyData = data;
                if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {/* ignore */} }
                let operationName = bodyData?.operationName || (Array.isArray(bodyData) ? bodyData[0]?.operationName : null);
                if (operationName) {

                    logDebug(context, `GraphQL XHR Send: ${operationName}`);
                    if (operationName === GQL_OPERATION_ACCESS_TOKEN) {

                        logDebug(context, `Отправка XHR запроса ${GQL_OPERATION_ACCESS_TOKEN}`);
                    }
                } else { logTrace(context, `GraphQL XHR Send: Не удалось определить operationName`); }
            } catch(e) { logWarn(context, 'Ошибка при логировании GraphQL XHR Send:', e); }
        }

        try {
            return originalXhrSend.call(this, data);
        } catch (error) {
            logError(context, `Ошибка выполнения оригинального xhr.send для ${urlShort}:`, error);
            throw error;
        }
    } // end xhrSendOverride

    // --- ЛОГИКА ВНЕДРЕНИЯ В WORKER ---
    function createObjectURLOverride_Sync(blob) {
        const context = 'ObjectURLSync';
        const blobType = blob?.type || 'unknown';
        const blobSize = blob?.size || 0;

        if (INJECT_INTO_WORKERS && blob instanceof Blob && (blobType.includes('javascript') || blobType.includes('worker') || blobType === '')) {

            if (LOG_WORKER_INJECTION) logDebug(context, `Перехвачен createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
            try {
                logTrace(context, "Синхронная модификация Blob невозможна. Возвращаем оригинальный URL. Логика внедрения сработает в hookWorkerConstructor.");
                return originalCreateObjectURL.call(unsafeWindow.URL, blob);
            } catch (error) {
                logError(context, 'Неожиданная ошибка при синхронной обработке Blob:', error);
                return originalCreateObjectURL.call(unsafeWindow.URL, blob);
            }
        } else {
            if (blob instanceof Blob) {
                logTrace(context, `Пропуск createObjectURL для Blob типа: '${blobType}', размер: ${blobSize}`);
            } else {
                logTrace(context, `Пропуск createObjectURL для не-Blob объекта.`);
            }
            return originalCreateObjectURL.call(unsafeWindow.URL, blob);
        }
    } // end createObjectURLOverride_Sync

    function addWorkerMessageListeners(workerInstance, label) {
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

                if (LOG_M3U8_CLEANING) logDebug('WorkerHook', `ПОЛУЧЕНО СООБЩЕНИЕ ADBLOCK_ADS_REMOVED от Worker'а (${label}). Midroll: ${messageData.isMidroll}. URL: ${messageData.url}`);
            }
        };
        workerInstance.addEventListener('message', adBlockListener);
        workerInstance._adBlockListener = adBlockListener;
        logTrace(context, `Слушатели сообщений AdBlock установлены для Worker'а (${label})`);
    } // end addWorkerMessageListeners

    function hookWorkerConstructor() {
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
                let targetScriptURL = scriptURL;

                try {
                    if (scriptURL instanceof URL) { urlString = scriptURL.href; isBlobURL = urlString.startsWith('blob:'); }
                    else if (typeof scriptURL === 'string') { urlString = scriptURL; isBlobURL = urlString.startsWith('blob:'); }

                    if (isBlobURL) { workerLabel = `blob:${urlString.substring(5, 35)}...`; }
                    else if (urlString) { workerLabel = urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60); }
                    else { workerLabel = `non-url-source (${typeof scriptURL})`; }


                    if (LOG_WORKER_INJECTION) logDebug('WorkerHook', `Конструктор Worker вызван. Источник: ${workerLabel}, Тип: ${isBlobURL ? 'Blob URL' : (urlString ? 'Script URL' : 'Unknown')}`);

                    if (isBlobURL && INJECT_INTO_WORKERS) {
                        logTrace('WorkerHook', `Worker (${workerLabel}) создан из Blob URL. Ожидаем подтверждения хуков изнутри Worker'а...`);
                    }

                } catch (e) {
                    logError('WorkerHook', "Ошибка при определении источника Worker'а:", e, scriptURL);
                    workerLabel = 'error-determining-source';
                }

                super(targetScriptURL, options);
                this._workerLabel = workerLabel;

                addWorkerMessageListeners(this, workerLabel);

                if (!isBlobURL && urlString && INJECT_INTO_WORKERS) {
                    setTimeout(() => {
                        if (!hookedWorkers.has(this._workerLabel)) {
                            if (LOG_WORKER_INJECTION) logWarn('WorkerHook', `Worker (${this._workerLabel}) создан НЕ из Blob URL (или хук createObjectURL не применился). Запасная попытка внедрения через postMessage...`);
                            try {
                                const injectionCode = getWorkerInjectionCode();
                                this.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: injectionCode });
                            } catch(e) {
                                logError('WorkerHook', `[Async] Ошибка отправки postMessage для запасного внедрения (${this._workerLabel}):`, e);
                            }
                        } else {
                            if (LOG_WORKER_INJECTION) logTrace('WorkerHook', `Worker (${this._workerLabel}) уже подтвердил готовность хуков (запасной механизм не требуется).`);
                        }
                    }, 500);
                }
            }
        };

        Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorkerClass);
        Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorkerClass.prototype);
        unsafeWindow.Worker.hooked_by_adblock = true;

        logDebug('WorkerHook', "Конструктор Worker успешно перехвачен.");
    } // end hookWorkerConstructor

    // --- УСТАНОВКА ХУКОВ (ОСНОВНОЙ ПОТОК) ---
    function installHooks() {
        if (hooksInstalledMain) { logWarn('Hooks', "Попытка повторной установки хуков."); return; }

        logDebug('Hooks', "Установка перехватов в основном потоке...");

        try { unsafeWindow.fetch = fetchOverride; logTrace('Hooks', "Перехват Fetch API установлен.");
            } catch (e) { logError('Hooks', "Критическая ошибка установки перехвата Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }

        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; logTrace('Hooks', "Перехваты XMLHttpRequest (open, send) установлены.");
            } catch (e) { logError('Hooks', "Критическая ошибка установки перехватов XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; }

        if (INJECT_INTO_WORKERS) {
            try { unsafeWindow.URL.createObjectURL = createObjectURLOverride_Sync;
                 logDebug('Hooks', "Перехват URL.createObjectURL УСТАНОВЛЕН (Синхронный, без модификации Blob).");
                } catch (e) { logError('Hooks', "Ошибка установки перехвата URL.createObjectURL:", e); if (originalCreateObjectURL) unsafeWindow.URL.createObjectURL = originalCreateObjectURL; }

            try { hookWorkerConstructor();
                } catch (e) { logError('Hooks', "Ошибка установки перехвата конструктора Worker:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }

            try { unsafeWindow.URL.revokeObjectURL = function(url) { logTrace('ObjectURL', `Вызван revokeObjectURL для: ${String(url).substring(0, 60)}...`); return originalRevokeObjectURL.call(unsafeWindow.URL, url); }; logTrace('Hooks', "Перехват URL.revokeObjectURL для логгирования установлен.");
                } catch(e) { logWarn('Hooks', "Не удалось установить перехват revokeObjectURL (не критично):", e); }
        } else {
            logWarn('Hooks', "Внедрение в Worker'ы отключено. Хуки createObjectURL и Worker не устанавливаются.");
        }

        hooksInstalledMain = true;

        logDebug('Hooks', "Установка перехватов в основном потоке завершена.");
    } // end installHooks

    // --- ФУНКЦИИ МОНИТОРИНГА И ПЕРЕЗАГРУЗКИ ПЛЕЕРА ---
    function findVideoPlayer() {
        const selectors = [ PLAYER_SELECTOR, '.video-player__container video', 'div[data-a-target="video-player"] video', 'div[data-a-target="video-player-layout"] video', '.persistent-player video' ];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.tagName === 'VIDEO') {
                    logTrace('PlayerFinder', `Найден видеоэлемент по селектору: ${selector}`);
                    return element;
                }
            } catch (e) {
                logWarn('PlayerFinder', `Ошибка поиска по селектору "${selector}":`, e.message);
            }
        }
        logTrace('PlayerFinder', 'Видеоэлемент не найден ни по одному из селекторов.');
        return null;
    } // end findVideoPlayer

    function triggerReload(reason) {
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
        if (reloadTimeoutId) {
            clearTimeout(reloadTimeoutId);
            reloadTimeoutId = null;
            logTrace('PlayerMonitor', `Отменен запланированный reload (${reason}).`);
        }
        lastVideoTimeUpdateTimestamp = Date.now();
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0;
    } // end resetMonitorState

    function monitorPlayerState() {
        const context = 'PlayerMonitor';
        if (!videoElement || !document.body.contains(videoElement)) {
            logWarn(context, 'Видеоэлемент потерян. Попытка перенастроить монитор...');
            setupPlayerMonitor();
            return;
        }

        const now = Date.now();
        const isPlaying = !videoElement.paused && !videoElement.ended;
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        let stallReason = null;

        if (isPlaying && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;
            if (currentTime <= lastKnownVideoTime) {
                if (timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                    stallReason = `currentTime (${currentTime.toFixed(2)}) не обновлялся > ${RELOAD_STALL_THRESHOLD_MS / 1000}с`;
                }
            }
            else if (readyState < videoElement.HAVE_CURRENT_DATA) {
                if (timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                    stallReason = `readyState (${readyState}) < HAVE_CURRENT_DATA в течение ${RELOAD_STALL_THRESHOLD_MS / 1000}с`;
                }
            }
            else if (currentTime > lastKnownVideoTime) {
                lastKnownVideoTime = currentTime;
                lastVideoTimeUpdateTimestamp = now;
                if (reloadTimeoutId) {

                    logDebug(context, "Воспроизведение возобновилось (timeupdate/readyState OK). Отмена перезагрузки.");
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                }
                if (isWaitingForDataTimestamp > 0 && readyState > 0) {
                    isWaitingForDataTimestamp = 0;
                }
            }

            if (stallReason && !reloadTimeoutId) {
                logWarn(context, `Обнаружено зависание плеера! Причина: ${stallReason}.`);
                logWarn(context, `Планируем перезагрузку через 5 секунд (причина: ${stallReason})...`);
                reloadTimeoutId = setTimeout(() => triggerReload(stallReason), 5000);
                return;
            }
        }

        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            if (now - isWaitingForDataTimestamp > RELOAD_BUFFERING_THRESHOLD_MS) {
                const bufferReason = `Буферизация/Ожидание данных > ${RELOAD_BUFFERING_THRESHOLD_MS / 1000}с (readyState: ${readyState})`;
                logWarn(context, `Обнаружена длительная буферизация! ${bufferReason}`);
                if (!reloadTimeoutId) {
                    logWarn(context, `Планируем перезагрузку через 5 секунд (причина: ${bufferReason})...`);
                    reloadTimeoutId = setTimeout(() => triggerReload(bufferReason), 5000);
                }
                return;
            }
        }

        if (isPlaying && isWaitingForDataTimestamp > 0 && readyState >= videoElement.HAVE_FUTURE_DATA) {
            logTrace(context, `Буферизация завершена (readyState: ${readyState}). Сброс таймера ожидания.`);
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId) {

                logDebug(context, "Воспроизведение возобновилось после буферизации. Отмена перезагрузки.");
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }
    } // end monitorPlayerState

    function setupPlayerMonitor() {
        if (!ENABLE_AUTO_RELOAD) {

            logDebug('PlayerMonitor', 'Авто-перезагрузка отключена в настройках.');
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

        if (currentVideoElement === videoElement && playerMonitorIntervalId) { return; }

        if (playerMonitorIntervalId) {

            logDebug(context, 'Остановка предыдущего монитора плеера.');
            clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
        }
        if (videoElement) {
            videoElement.removeEventListener('error', handlePlayerError);
            videoElement.removeEventListener('waiting', handlePlayerWaiting);
            videoElement.removeEventListener('playing', handlePlayerPlaying);
            videoElement.removeEventListener('pause', handlePlayerPause);
            videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
            logTrace(context, 'Старые слушатели событий плеера удалены.');
        }

        videoElement = currentVideoElement;

        if (!videoElement) {
            logTrace(context, 'Видеоэлемент не найден. Повторная попытка через 3 секунды.');
            setTimeout(setupPlayerMonitor, 3000);
            return;
        }

        logDebug(context, 'Видеоэлемент найден. Установка слушателей событий и запуск мониторинга...');

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

        logDebug(context, `Мониторинг плеера запущен (Интервал: 2000мс, Порог зависания/readyState: ${RELOAD_STALL_THRESHOLD_MS}мс, Порог буферизации: ${RELOAD_BUFFERING_THRESHOLD_MS}мс).`);
    } // end setupPlayerMonitor

    function handlePlayerError(event) {
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
    } // end handlePlayerError

    function handlePlayerWaiting() {
        const context = 'PlayerEvent:Waiting';
        if (videoElement && videoElement.readyState < videoElement.HAVE_FUTURE_DATA && isWaitingForDataTimestamp === 0) {
            logTrace(context, `Плеер начал буферизацию/ожидание (readyState: ${videoElement.readyState}). Запуск таймера.`);
            isWaitingForDataTimestamp = Date.now();
        } else if (isWaitingForDataTimestamp === 0) {
            logTrace(context, `Событие 'waiting', но readyState (${videoElement?.readyState}) достаточный или таймер уже запущен. Игнорируем.`);
        }
    } // end handlePlayerWaiting

    function handlePlayerPlaying() {
        logTrace('PlayerEvent:Playing', 'Воспроизведение началось/возобновилось.');
        resetMonitorState('Playing event');
    } // end handlePlayerPlaying

    function handlePlayerPause() {
        logTrace('PlayerEvent:Pause', 'Воспроизведение приостановлено.');
        resetMonitorState('Pause event');
    } // end handlePlayerPause

    function handlePlayerTimeUpdate() {
        if (videoElement) {
            const currentTime = videoElement.currentTime;
            if (currentTime > lastKnownVideoTime) {
                lastKnownVideoTime = currentTime;
            }
        }
    } // end handlePlayerTimeUpdate

    // --- ИНИЦИАЛИЗАЦИЯ СКРИПТА ---

    logDebug('Init', `--- Начало инициализации Twitch Adblock (v${SCRIPT_VERSION}) ---`);


    installHooks();
    setQualitySettings();

    try {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {

                logDebug('QualityV2Enhanced', "Вкладка стала видимой. Повторная установка качества 'Источник'.");
                setQualitySettings();
                if (ENABLE_AUTO_RELOAD) {
                    logTrace('PlayerMonitor', 'Перезапуск монитора плеера из-за visibilitychange.');
                    setupPlayerMonitor();
                }
            } else {
                if (ENABLE_AUTO_RELOAD && playerMonitorIntervalId) {
                    logTrace('PlayerMonitor', 'Вкладка скрыта. Остановка монитора плеера.');
                    clearInterval(playerMonitorIntervalId);
                    playerMonitorIntervalId = null;
                }
            }
        }, { passive: true });

        logDebug('Init', "Слушатель 'visibilitychange' для качества и монитора установлен.");
    } catch (e) { logError('Init', "Не удалось добавить слушатель 'visibilitychange':", e); }

    try {
        const handleStateChange = () => {
            setTimeout(() => {

                logDebug('QualityV2Enhanced', "Обнаружено изменение состояния навигации (pushState/replaceState/popstate). Повторная установка качества 'Источник'.");
                setQualitySettings();
                if (ENABLE_AUTO_RELOAD) {
                    logTrace('PlayerMonitor', 'Перезапуск монитора плеера из-за изменения истории навигации.');
                    setupPlayerMonitor();
                }
            }, 500);
        };
        const originalPushState = history.pushState;
        history.pushState = function(...args) { originalPushState.apply(this, args); handleStateChange(); };
        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) { originalReplaceState.apply(this, args); handleStateChange(); };
        unsafeWindow.addEventListener('popstate', handleStateChange, { passive: true });

        logDebug('Init', "Слушатели 'pushState', 'replaceState', 'popstate' для качества и монитора установлены.");
    } catch (e) { logError('Init', "Не удалось добавить слушатели истории навигации:", e); }

    if (ENABLE_PERIODIC_QUALITY_CHECK && PERIODIC_QUALITY_CHECK_INTERVAL_MS > 0) {
        if (qualitySetIntervalId) { clearInterval(qualitySetIntervalId); qualitySetIntervalId = null; }
        qualitySetIntervalId = setInterval(() => {
            logTrace('QualityV2Enhanced', `Периодическая проверка качества (интервал: ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс).`);
            setQualitySettings();
        }, PERIODIC_QUALITY_CHECK_INTERVAL_MS);

        logDebug('Init', `Периодическая проверка качества 'Источник' запущена с интервалом ${PERIODIC_QUALITY_CHECK_INTERVAL_MS} мс.`);
    } else {

        logDebug('Init', `Периодическая проверка качества отключена или интервал некорректен.`);
    }

    function onDomReady() {

        logDebug('Init', "DOM готов (DOMContentLoaded). Запуск первичной настройки монитора плеера.");
        setupPlayerMonitor();
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
        onDomReady();
    }

    logDebug('Init', `--- Twitch Adblock (v${SCRIPT_VERSION}) Инициализирован УСПЕШНО ---`);

})();