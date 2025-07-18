// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      30.2.0
// @description  Комплексная блокировка рекламы Twitch
// @author       ShmidtS
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
// @connect      gql.twitch.tv
// @connect      assets.twitch.tv
// @connect      raw.githubusercontent.com
// @updateURL    https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @downloadURL  https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- Script Configuration ---
    const CONFIG = {
        SCRIPT_VERSION: '30.2.0',
        SETTINGS: {
            PROACTIVE_TOKEN_SWAP: GM_getValue('TTV_AdBlock_ProactiveTokenSwap', true),
            ENABLE_MIDROLL_RECOVERY: GM_getValue('TTV_AdBlock_EnableMidrollRecovery', true),
            FORCE_MAX_QUALITY: GM_getValue('TTV_AdBlock_ForceMaxQuality', true),
            ATTEMPT_DOM_AD_REMOVAL: GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true),
            HIDE_COOKIE_BANNER: GM_getValue('TTV_AdBlock_HideCookieBanner', true),
            HOOK_WEB_WORKERS: GM_getValue('TTV_AdBlock_HookWebWorkers', true),
            ENABLE_AUTO_RELOAD: GM_getValue('TTV_AdBlock_EnableAutoReload', true),
        },
        DEBUG: {
            SHOW_ERRORS: GM_getValue('TTV_AdBlock_ShowErrorsInConsole', false),
            CORE: GM_getValue('TTV_AdBlock_Debug_Core', false),
            PLAYER_MONITOR: GM_getValue('TTV_AdBlock_Debug_PlayerMon', false),
            M3U8_CLEANING: GM_getValue('TTV_AdBlock_Debug_M3U8', false),
            GQL_MODIFY: GM_getValue('TTV_AdBlock_Debug_GQL', false),
            NETWORK_BLOCKING: GM_getValue('TTV_AdBlock_Debug_NetBlock', false),
            TOKEN_SWAP: GM_getValue('TTV_AdBlock_Debug_TokenSwap', false),
        },
        ADVANCED: {
            RELOAD_STALL_THRESHOLD_MS: GM_getValue('TTV_AdBlock_StallThresholdMs', 20000),
            RELOAD_BUFFERING_THRESHOLD_MS: GM_getValue('TTV_AdBlock_BufferingThresholdMs', 45000),
            RELOAD_COOLDOWN_MS: GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000),
            MAX_RELOADS_PER_SESSION: GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 5),
            RELOAD_ON_ERROR_CODES: GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', "0,2,3,4,9,10,403,1000,2000,3000,4000,5000,6001,500,502,503,504")
            .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
            MAX_TOKEN_FETCH_RETRIES: 3,
            TOKEN_FETCH_RETRY_DELAY_MS: 1000,
        },
    };

    // --- Constants ---
    const LOG_PREFIX = `[TTV ADBLOCK ULT v${CONFIG.SCRIPT_VERSION}]`;
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;
    const AD_URL_KEYWORDS_BLOCK = [
        'edge.ads.twitch.tv', 'nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com',
        'adservice.google.com', 'doubleclick.net', 'googlesyndication.com', 'pubads.g.doubleclick.net',
        'adnxs.com', 'amazon-adsystem.com', 'taboola.com', 'outbrain.com', 'taboolacdn.com',
        'yieldmo.com', 'criteorumble.com', 'rubiconproject.com', 'appier.net', 'inmobi.com',
        'adform.net', 'ads.ttvnw.net', 'adserver.ttvnw.net', 'beacon.ads.ttvnw.net',
        'mraid.googleapis.com', 'securepubads.g.doubleclick.net', 'googleads.g.doubleclick.net',
        'twitchads.net', 'ad.twitch.tv', 'analytics.twitch.tv', 'beacon.twist.tv', 'sentry.io',
        'sprig.com', 'scorecardresearch.com', 'v6s.js',
    ];
    const AD_DOM_SELECTORS = [
        'div[data-a-target="request-ad-block-disable-modal"]', '.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]',
        'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]', '.player-ad-notice', '.ad-interrupt-screen',
        'div[data-test-selector="ad-banner-default-text-area"]', 'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]', '[data-test-selector="sad-overlay"]',
        'div[class*="video-ad-label"]', '.player-ad-overlay', 'div[class*="advertisement"]', 'div[class*="-ad-"]',
        'div[data-a-target="sad-overlay-container"]', 'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]',
        'div[data-a-target*="ad-block-nag"]', 'div[data-test-selector*="ad-block-nag"]', 'div[data-a-target*="disable-adblocker-modal"]',
        'div[data-test-id="ad-break"]', '.ad-break-ui-container', '.ad-break-overlay', 'div[data-a-target="ad-break-countdown"]',
        'div[data-test-id="ad-break-countdown"]', 'div[data-a-target="ad-break-skip-button"]', 'div[data-test-id="ad-break-skip-button"]',
        '[data-a-target="ad-banner"]', '[data-test-id="ad-overlay"]', '.promoted-content-card', '[data-ad-placeholder="true"]',
        '.video-ad-display__container', '[role="advertisement"]', '[data-ad-overlay]', 'div[class*="ad-overlay"]',
        'div[class*="ad-container"]', 'div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]',
        'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]',
        'iframe[src*="imasdk.googleapis.com"]', '.player-overlay-ad', '.tw-player-ad-overlay', '.video-ad-display',
        'div[data-a-target="video-ad-countdown-container"]', 'div[class*="--ad-banner"]', 'div[data-ad-unit]',
        'div[class*="player-ads"]', 'div[data-ad-boundary]', 'div[class*="ad-module"]', 'div[data-test-selector="ad-module"]',
        ...(CONFIG.SETTINGS.HIDE_COOKIE_BANNER ? ['.consent-banner'] : []),
    ];
    const AD_DATERANGE_KEYWORDS = [
        'AD-ID=', 'CUE-OUT', 'SCTE35', 'Twitch-Ad-Signal', 'Twitch-Prefetch', 'Twitch-Ad-Hide',
        'Twitch-Ads', 'X-CUSTOM', 'X-AD', 'X-TWITCH-AD', 'EXT-X-TWITCH-INFO', 'EXT-X-ASSET'
    ];

    // --- State Variables ---
    let hooksInstalled = false;
    let adRemovalObserver = null;
    let errorScreenObserver = null;
    let videoPlayerObserver = null;
    let videoElement = null;
    let cachedCleanToken = null;
    let lastReloadTimestamp = 0;
    let reloadCount = 0;
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const originalWorker = unsafeWindow.Worker;
    const originalJsonParse = JSON.parse;

    // --- Logging Functions ---
    const logError = (source, message, ...args) => CONFIG.DEBUG.SHOW_ERRORS && console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args);
    const logWarn = (source, message, ...args) => CONFIG.DEBUG.SHOW_ERRORS && console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args);
    const logDebug = (source, message, ...args) => CONFIG.DEBUG.CORE && console.info(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args);
    const logTrace = (flag, source, message, ...args) => flag && console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg));


    /**
     * Overrides JSON.parse to modify Twitch player data in-flight.
     * This is the primary and most effective ad-blocking method.
     */
    const hookJsonParse = () => {
        unsafeWindow.JSON.parse = function(text, reviver) {
            const originalObject = originalJsonParse(text, reviver);

            if (typeof originalObject !== 'object' || originalObject === null) {
                return originalObject;
            }

            // --- Access Token Modification ---
            const streamAccessToken = originalObject.data?.streamPlaybackAccessToken || originalObject.data?.videoPlaybackAccessToken;
            if (streamAccessToken?.value) {
                try {
                    const tokenValue = originalJsonParse(streamAccessToken.value);
                    let modified = false;

                    if (tokenValue.ad_block_gate_overlay_enabled === true) {
                        tokenValue.ad_block_gate_overlay_enabled = false;
                        modified = true;
                    }
                    if (tokenValue.show_ads !== false || tokenValue.hide_ads !== true) {
                        tokenValue.show_ads = false;
                        tokenValue.hide_ads = true;
                        modified = true;
                    }

                    if (modified) {
                        streamAccessToken.value = JSON.stringify(tokenValue);
                        logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Modified PlaybackAccessToken in-flight.');
                    }
                } catch (e) {
                    // Ignore errors parsing nested JSON
                }
            }

            // --- GQL AdSlot Removal ---
            if (originalObject.data?.adSlots) {
                if (originalObject.data.adSlots.length > 0) {
                    originalObject.data.adSlots = [];
                    logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Cleared adSlots in-flight.');
                }
            }

            // --- User Ad-Free Flag ---
            if (originalObject.data?.user?.broadcastSettings?.isAdFree === false) {
                originalObject.data.user.broadcastSettings.isAdFree = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Set isAdFree to true in-flight.');
            }

            return originalObject;
        };
    };


    /**
     * Injects CSS styles to hide ad-related elements on the page.
     */
    const injectCSS = () => {
        const css = `${AD_DOM_SELECTORS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }`;
        try {
            GM_addStyle(css);
            logDebug('CSSInject', 'CSS styles applied successfully.');
        } catch (e) {
            logError('CSSInject', 'Failed to apply CSS:', e);
        }
    };

    /**
     * Forces the browser to think the tab is always visible to prevent
     * background video quality throttling.
     */
    const forceMaxQuality = () => {
        try {
            Object.defineProperties(document, {
                'visibilityState': { get: () => 'visible', configurable: true },
                'hidden': { get: () => false, configurable: true }
            });
            document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
            logDebug('ForceQuality', 'Background quality forcing activated.');
        } catch (e) {
            logError('ForceQuality', 'Failed to force max quality:', e);
        }
    };


    /**
     * Analyzes and cleans an M3U8 playlist to remove ad segments.
     * @param {string} m3u8Text - The text content of the M3U8 playlist.
     * @param {string} [url='N/A'] - The URL of the playlist for logging purposes.
     * @returns {{cleanedText: string, adsFound: boolean, errorDuringClean: boolean}}
     */
    const parseAndCleanM3U8 = (m3u8Text, url = 'N/A') => {
        const urlFilename = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || url;

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logError('M3U8Clean', `Invalid M3U8 content for ${urlFilename}.`);
            return { cleanedText: m3u8Text, adsFound: false, errorDuringClean: true };
        }

        let adsFound = false;
        const lines = m3u8Text.split('\n');
        const cleanLines = lines.filter(line => {
            const upperTrimmedLine = line.trim().toUpperCase();
            if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE') ||
                upperTrimmedLine.startsWith('#EXT-X-TWITCH-INFO') ||
                upperTrimmedLine.startsWith('#EXT-X-ASSET') ||
                upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH')) {
                adsFound = true;
                return false;
            }
            return true;
        });

        if (adsFound) {
            const cleanedText = cleanLines.join('\n');
            const segmentCount = cleanLines.filter(line => line.trim() && !line.trim().startsWith('#')).length;

            if (segmentCount < 3 && !cleanedText.includes('#EXT-X-ENDLIST')) {
                logWarn('M3U8Clean', `Insufficient segments (${segmentCount}) in ${urlFilename}. Reverting to original to prevent stall.`);
                return { cleanedText: m3u8Text, adsFound: false, errorDuringClean: true };
            }
            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'M3U8Clean', `Cleaned ${urlFilename}: ${lines.length - cleanLines.length} lines removed.`);
            return { cleanedText, adsFound, errorDuringClean: false };
        }

        return { cleanedText: m3u8Text, adsFound: false, errorDuringClean: false };
    };

    /**
     * Fetches a new, "clean" playback access token from Twitch's GQL endpoint.
     * @param {string} channelName - The name of the Twitch channel.
     * @param {string} deviceId - The user's device ID.
     * @param {number} [retryCount=0] - The current retry attempt number.
     * @returns {Promise<object>} A promise that resolves with the token object.
     */
    const fetchNewPlaybackAccessToken = async (channelName, deviceId, retryCount = 0) => {
        logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'TokenSwap', `Requesting token for ${channelName}, Attempt: ${retryCount + 1}`);
        const payload = {
            operationName: 'PlaybackAccessToken_Template',
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {\nstreamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {\nvalue\nsignature\nauthorization { isForbidden forbiddenReasonCode }\n__typename\n}\nvideoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {\nvalue\nsignature\n__typename\n}\n}',
            variables: { isLive: true, login: channelName, isVod: false, vodID: '', playerType: 'site' }
        };
        const headers = {
            'Content-Type': 'application/json',
            'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
            ...(deviceId && { 'Device-ID': deviceId }),
        };

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: GQL_URL,
                headers,
                data: JSON.stringify(payload),
                responseType: 'json',
                onload: async (response) => {
                    if (response.status >= 200 && response.status < 300 && response.response) {
                        const token = response.response?.data?.streamPlaybackAccessToken;
                        if (token?.value && token.signature) {
                            resolve(token); // The JSON.parse hook will clean it
                        } else {
                            reject(`No valid token in response.`);
                        }
                    } else {
                        logError('TokenSwap', `GQL request failed for ${channelName}. Status: ${response.status}`);
                        if (retryCount < CONFIG.ADVANCED.MAX_TOKEN_FETCH_RETRIES - 1) {
                            await new Promise(r => setTimeout(r, CONFIG.ADVANCED.TOKEN_FETCH_RETRY_DELAY_MS));
                            resolve(fetchNewPlaybackAccessToken(channelName, deviceId, retryCount + 1));
                        } else {
                            reject(`GQL request failed: status ${response.status}`);
                        }
                    }
                },
                onerror: (error) => {
                    logError('TokenSwap', `Network error for ${channelName}:`, error);
                    if (retryCount < CONFIG.ADVANCED.MAX_TOKEN_FETCH_RETRIES - 1) {
                        setTimeout(() => resolve(fetchNewPlaybackAccessToken(channelName, deviceId, retryCount + 1)), CONFIG.ADVANCED.TOKEN_FETCH_RETRY_DELAY_MS);
                    } else {
                        reject(`Network error: ${error.error || 'Unknown'}`);
                    }
                }
            });
        });
    };

    /**
     * Main override for the `fetch` API.
     */
    const fetchOverride = async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const lowerUrl = requestUrl.toLowerCase();

        // Block requests to known ad/tracking domains
        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerUrl.includes(keyword.toLowerCase())) {
                logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'FetchBlock', `Blocked fetch to ${requestUrl} (Keyword: ${keyword})`);
                return new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock` });
            }
        }

        const isM3U8Request = TWITCH_MANIFEST_PATH_REGEX.test(lowerUrl) && lowerUrl.includes('usher.ttvnw.net');

        if (isM3U8Request) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: requestUrl,
                    headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
                    responseType: 'text',
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            let { cleanedText } = parseAndCleanM3U8(response.responseText, requestUrl);
                            const headers = new Headers();
                            response.responseHeaders?.trim().split(/[\r\n]+/).forEach(line => {
                                const [key, value] = line.split(': ', 2);
                                if (key.toLowerCase() !== 'content-length' && value) headers.append(key, value);
                            });
                            headers.set('Content-Type', 'application/vnd.apple.mpegurl');
                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers }));
                        } else {
                            reject(new TypeError(`Fetch failed: ${response.status}`));
                        }
                    },
                    onerror: (error) => reject(new TypeError(`Network error: ${error.error || 'Unknown'}`))
                });
            });
        }

        return originalFetch(input, init);
    };

    /**
     * Overrides for `XMLHttpRequest` API for compatibility.
     */
    const xhrOpenOverride = function(method, url, ...args) {
        this._hooked_url = String(url);
        this._hooked_method = (method || 'GET').toUpperCase();
        return originalXhrOpen.apply(this, [method, url, ...args]);
    };
    const xhrSendOverride = function(data, ...args) {
        const url = this._hooked_url;
        if (url) {
            const lowerUrl = url.toLowerCase();
            for (const keyword of AD_URL_KEYWORDS_BLOCK) {
                if (lowerUrl.includes(keyword.toLowerCase())) {
                    logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'XHRBlock', `Blocked XHR to ${url} (Keyword: ${keyword})`);
                    this.dispatchEvent(new Event('error'));
                    return;
                }
            }
        }
        return originalXhrSend.apply(this, [data, ...args]);
    };

    /**
     * Overrides the Worker constructor to inject blocking logic into Twitch's workers.
     */
    const hookWorker = () => {
        const workerContentBlocker = `
            const originalFetch = self.fetch;
            const adKeywords = [${AD_URL_KEYWORDS_BLOCK.map(k => `'${k}'`).join(', ')}];
            self.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input);
                if (adKeywords.some(keyword => url.includes(keyword))) {
                    return new Response(null, { status: 403, statusText: 'Blocked by TTV AdBlock Worker Hook' });
                }
                return originalFetch(input, init);
            };
        `;

        unsafeWindow.Worker = new Proxy(originalWorker, {
            construct(target, args) {
                let [url, options] = args;
                if (typeof url === 'string' && url.includes('assets.twitch.tv')) {
                    logDebug('WorkerHook', `Intercepting worker: ${url}`);
                    try {
                        const blob = new Blob([workerContentBlocker], { type: 'application/javascript' });
                        const blobUrl = URL.createObjectURL(blob);
                        originalFetch(url).then(r => r.text()).then(text => {
                            const finalBlob = new Blob([workerContentBlocker, text], { type: 'application/javascript' });
                            const finalUrl = URL.createObjectURL(finalBlob);
                            new target(finalUrl, options);
                            URL.revokeObjectURL(finalUrl);
                        }).catch(e => {
                            logError('WorkerHook', 'Failed to fetch original worker script, creating empty worker.', e);
                            new target(blobUrl, options);
                        });
                        URL.revokeObjectURL(blobUrl);
                        return new Proxy({}, { get: () => ()=>{} });
                    } catch(e) {
                        logError('WorkerHook', 'Error creating hooked worker, falling back to original.', e);
                        return new target(url, options);
                    }
                }
                return new target(url, options);
            }
        });
    };

    /**
     * Installs all network and data hooks.
     */
    const installHooks = () => {
        if (hooksInstalled) return;
        try {
            hookJsonParse();
            logDebug('HookInstall', 'JSON.parse hook installed.');
        } catch (e) {
            logError('HookInstall', 'Failed to hook JSON.parse:', e);
        }
        try {
            unsafeWindow.fetch = fetchOverride;
            logDebug('HookInstall', 'Fetch hook installed.');
        } catch (e) {
            logError('HookInstall', 'Failed to hook fetch:', e);
        }
        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            logDebug('HookInstall', 'XHR hooks installed.');
        } catch (e) {
            logError('HookInstall', 'Failed to hook XHR:', e);
        }
        if (CONFIG.SETTINGS.HOOK_WEB_WORKERS) {
            try {
                hookWorker();
                logDebug('HookInstall', 'Worker hook installed.');
            } catch (e) {
                logError('HookInstall', 'Failed to hook Worker:', e);
            }
        }
        hooksInstalled = true;
        logDebug('HookInstall', 'All network hooks installed.');
    };

    /**
     * Removes ad elements from the DOM using a MutationObserver.
     */
    const removeDOMAdElements = () => {
        if (!CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL) return;

        const performRemoval = () => {
            AD_DOM_SELECTORS.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    if (el?.parentNode?.removeChild) {
                        el.parentNode.removeChild(el);
                        logTrace(CONFIG.DEBUG.CORE, 'DOMAdRemoval', `Removed element: ${selector}`);
                    }
                });
            });
        };

        if (adRemovalObserver) adRemovalObserver.disconnect();
        adRemovalObserver = new MutationObserver(performRemoval);
        const target = document.body || document.documentElement;
        if(target) {
            adRemovalObserver.observe(target, { childList: true, subtree: true });
            logDebug('DOMAdRemoval', 'MutationObserver for ad removal started.');
            performRemoval(); // Initial run
        }
    };

    /**
     * Triggers a page reload if conditions are met.
     * @param {string} reason - The reason for the reload, for logging.
     */
    const triggerReload = (reason) => {
        if (!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD) return;
        const now = Date.now();
        if (reloadCount >= CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION) {
            logWarn('ReloadTrigger', `Max reloads (${CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION}) reached for this session. Reason: ${reason}`);
            return;
        }
        if (now - lastReloadTimestamp < CONFIG.ADVANCED.RELOAD_COOLDOWN_MS) {
            logWarn('ReloadTrigger', `Reload cooldown active. Suppressing reload for: ${reason}`);
            return;
        }
        lastReloadTimestamp = now;
        reloadCount++;
        logDebug('ReloadTrigger', `Reloading page (${reloadCount}/${CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION}). Reason: ${reason}`);
        unsafeWindow.location.reload();
    };

    /**
     * Sets up a monitor on the video player to handle autoplay, errors, and stalls.
     */
    const setupVideoPlayerMonitor = () => {
        if (videoPlayerObserver) return;

        const attachListeners = (vid) => {
            if (!vid || vid._adblock_listeners_attached) return;
            logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'PlayerMonitor', 'Attaching listeners to video element:', vid);

            let lastTimeUpdate = Date.now();

            vid.addEventListener('timeupdate', () => { lastTimeUpdate = Date.now(); }, { passive: true });

            vid.addEventListener('error', (e) => {
                const error = e.target?.error;
                const code = error?.code;
                logError('PlayerMonitor', `Player error detected. Code: ${code || 'N/A'}, Message: ${error?.message || 'N/A'}`);
                if (code && CONFIG.ADVANCED.RELOAD_ON_ERROR_CODES.includes(code)) {
                    triggerReload(`Player error code ${code}`);
                }
            }, { passive: true });

            vid.addEventListener('waiting', () => {
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'PlayerMonitor', 'Video buffering...');
                if (CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS > 0) {
                    setTimeout(() => {
                        if (vid.paused || vid.seeking || vid.readyState >= 3) return;
                        if (Date.now() - lastTimeUpdate > CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS) {
                            logWarn('PlayerMonitor', `Buffering timeout exceeded (${CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS / 1000}s).`);
                            triggerReload('Buffering timeout');
                        }
                    }, CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS + 1000);
                }
            }, { passive: true });

            vid.addEventListener('stalled', () => {
                logWarn('PlayerMonitor', 'Video stream stalled.');
                if (CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS > 0) {
                    setTimeout(() => {
                        if (vid.paused || vid.seeking || vid.readyState >= 3) return;
                        if (Date.now() - lastTimeUpdate > CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS) {
                            logWarn('PlayerMonitor', `Stall timeout exceeded (${CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS / 1000}s).`);
                            triggerReload('Stall timeout');
                        }
                    }, CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS + 1000);
                }
            }, { passive: true });

            vid._adblock_listeners_attached = true;
        };

        const findAndAttach = () => {
            let currentVideo = document.querySelector('video');
            if (currentVideo && currentVideo !== videoElement) {
                videoElement = currentVideo;
                attachListeners(videoElement);
            }
        };

        if (videoPlayerObserver) videoPlayerObserver.disconnect();
        videoPlayerObserver = new MutationObserver(findAndAttach);
        const target = document.body || document.documentElement;
        if(target){
            videoPlayerObserver.observe(target, { childList: true, subtree: true });
            logDebug('PlayerMonitor', 'Video player observer started.');
            findAndAttach();
        }
    };

    /**
     * Starts a MutationObserver to watch for the "purple error screen".
     */
    const startErrorScreenObserver = () => {
        if (!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD || errorScreenObserver) return;
        const selectors = ['[data-a-target="player-error-screen"]', '.content-overlay-gate__content', 'div[data-test-selector="content-overlay-gate-text"]'];

        const observerCallback = () => {
            for (const selector of selectors) {
                if (document.querySelector(selector)) {
                    logError('ErrorScreenObserver', `Twitch error screen detected by selector: ${selector}`);
                    triggerReload(`Error screen appeared (${selector})`);
                    return;
                }
            }
        };

        errorScreenObserver = new MutationObserver(observerCallback);
        const target = document.body || document.documentElement;
        if (target) {
            errorScreenObserver.observe(target, { childList: true, subtree: true });
            logDebug('ErrorScreenObserver', 'Observer for error screen started.');
        }
    };


    /**
     * Main initialization function for the script.
     */
    const initialize = () => {
        logDebug('Initialize', `Twitch Adblock Ultimate v${CONFIG.SCRIPT_VERSION} initializing...`);
        installHooks();
        injectCSS();
        if (CONFIG.SETTINGS.FORCE_MAX_QUALITY) forceMaxQuality();
        removeDOMAdElements();
        setupVideoPlayerMonitor();
        startErrorScreenObserver();
        logDebug('Initialize', 'Script initialized.');
    };

    // --- Script Entry Point ---
    if (document.readyState === 'loading') {
        // Hooks must be installed before the page's scripts run.
        installHooks();
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();