// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      30.8.0
// @description  A robust Twitch ad-blocker that modifies network requests and responses to prevent ads and player errors.
// @author       ShmidtS & Architect
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

    // --- CONFIGURATION ---
    const CONFIG = {
        SCRIPT_VERSION: '30.8.0',
        SETTINGS: {
            FORCE_MAX_QUALITY: GM_getValue('TTV_AdBlock_ForceMaxQuality', true),
            ATTEMPT_DOM_AD_REMOVAL: GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true),
            FORCE_UNMUTE: GM_getValue('TTV_AdBlock_ForceUnmute', true),
        },
        DEBUG: {
            SHOW_ERRORS: GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true),
            GQL_MODIFY: GM_getValue('TTV_AdBlock_Debug_GQL', true),
            PLAYER_MONITOR: GM_getValue('TTV_AdBlock_Debug_PlayerMon', true),
        },
    };

    // --- CONSTANTS ---
    const LOG_PREFIX = `[TTV ADBLOCK ULT v${CONFIG.SCRIPT_VERSION}]`;
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const AD_URL_KEYWORDS_BLOCK = ['googlesyndication.com', 'doubleclick.net', 'adnxs.com', 'amazon-adsystem.com', 'nat.min.js'];
    const AD_DOM_SELECTORS = ['.ad-interrupt-screen', '.video-player__ad-info-container', '.player-ad-notice', '.persistent-player__ad-container', '[data-a-target*="ad-"]'];
    const AD_M3U8_KEYWORDS = ['-ad-', 'stitched-ad', 'pl-ad', 'preoll', 'Twitch-Ad-Signal', 'EXT-X-TWITCH-AD-INFO', 'EXT-X-ASSET', 'EXT-X-CUE-OUT', 'EXT-X-SCTE35'];

    // --- STATE ---
    let userManuallyMuted = false;
    const originalFetch = unsafeWindow.fetch;

    // --- LOGGING ---
    const logError = (m, ...a) => CONFIG.DEBUG.SHOW_ERRORS && console.error(`${LOG_PREFIX} ERROR:`, m, ...a);
    const logWarn = (m, ...a) => CONFIG.DEBUG.SHOW_ERRORS && console.warn(`${LOG_PREFIX} WARN:`, m, ...a);
    const logTrace = (f, m, ...a) => f && console.debug(`${LOG_PREFIX} TRACE:`, m, ...a);

    // --- CORE LOGIC ---
    const fetchOverride = async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input);

        if (AD_URL_KEYWORDS_BLOCK.some(k => requestUrl.includes(k))) {
            logTrace(true, 'Blocking ad-related URL:', requestUrl);
            return new Response(null, { status: 403, statusText: 'Blocked by TTV Adblock Ultimate' });
        }

        if (requestUrl === GQL_URL && init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
            return handleGQLRequest(input, init);
        }

        if (requestUrl.endsWith('.m3u8')) {
            return handleM3U8Request(input, init);
        }

        return originalFetch(input, init);
    };

    async function handleGQLRequest(input, init) {
        let body;
        try {
            body = JSON.parse(init.body);
        } catch (e) {
            return originalFetch(input, init);
        }

        const isPlaybackRequest = (req) => req.operationName === 'PlaybackAccessToken' || req.operationName === 'VideoPlaybackAccessToken';

        let isTargetRequest = Array.isArray(body) ? body.some(isPlaybackRequest) : isPlaybackRequest(body);

        if (isTargetRequest) {
            // 1. Modify the outgoing request
            const modifyRequest = (req) => {
                if (isPlaybackRequest(req)) {
                    const vars = req.variables;
                    vars.platform = 'web';
                    vars.playerType = 'site';
                    vars.disableAds = true;
                }
            };
            Array.isArray(body) ? body.forEach(modifyRequest) : modifyRequest(body);
            init.body = JSON.stringify(body);

            // 2. Intercept and modify the incoming response
            try {
                const response = await originalFetch(input, init);
                if (!response.ok) return response;

                const responseJson = await response.json();

                const modifyResponse = (resData) => {
                    const processToken = (tokenData, type) => {
                        if (tokenData && tokenData.value) {
                            try {
                                const token = JSON.parse(tokenData.value);
                                if (token) {
                                    token.ads = null;
                                    token.ad_decision = null;
                                    token.player_ads = null;
                                    token.show_ads = false;
                                    tokenData.value = JSON.stringify(token);
                                    logTrace(CONFIG.DEBUG.GQL_MODIFY, `Stripped ads from ${type} GQL token.`);
                                }
                            } catch (e) { /* Ignore JSON parse error */ }
                        }
                    };
                    processToken(resData.data?.streamPlaybackAccessToken, 'live');
                    processToken(resData.data?.videoPlaybackAccessToken, 'VOD');
                };

                Array.isArray(responseJson) ? responseJson.forEach(modifyResponse) : modifyResponse(responseJson);

                return new Response(JSON.stringify(responseJson), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            } catch (error) {
                logError('Error processing GQL response:', error);
                return originalFetch(input, init); // Fallback
            }
        }
        return originalFetch(input, init);
    }

    async function handleM3U8Request(input, init) {
        try {
            const response = await originalFetch(input, init);
            if (response && response.ok) {
                const manifestText = await response.text();
                const keywordUpper = AD_M3U8_KEYWORDS.map(k => k.toUpperCase());
                if (keywordUpper.some(k => manifestText.toUpperCase().includes(k))) {
                    const cleanedText = manifestText.split('\n').filter(line => !keywordUpper.some(k => line.toUpperCase().includes(k))).join('\n');
                    return new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: response.headers });
                }
            }
            return response;
        } catch (e) {
            logWarn('Error fetching/cleaning m3u8.', e);
            return originalFetch(input, init);
        }
    }

    const unblockVideoPlayback = (vid) => {
        if (!vid) return;
        if (CONFIG.SETTINGS.FORCE_UNMUTE && !userManuallyMuted && vid.muted) {
            vid.muted = false;
            if (vid.volume < 0.1) vid.volume = 0.5;
        }
        if (vid.paused) {
            vid.play().catch(e => logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'Play attempt failed:', e.name));
        }
    };

    const setupObservers = () => {
        // DOM Ad Remover
        if (CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL) {
            new MutationObserver((mutations) => {
                mutations.forEach(() => {
                    AD_DOM_SELECTORS.forEach(sel => {
                        document.querySelectorAll(sel).forEach(el => el.remove());
                    });
                });
            }).observe(document.documentElement, { childList: true, subtree: true });
        }

        // Player and Mute Button Monitor
        let videoElement = null;
        new MutationObserver(() => {
            // Find video element
            const currentVideo = document.querySelector('video');
            if (currentVideo && !currentVideo._adblock_monitored) {
                videoElement = currentVideo;
                videoElement._adblock_monitored = true;
                userManuallyMuted = videoElement.muted;
                videoElement.addEventListener('playing', () => unblockVideoPlayback(videoElement));
                videoElement.addEventListener('waiting', () => unblockVideoPlayback(videoElement));
            }
            // Find mute button
            const muteButton = document.querySelector('[data-a-target="player-mute-unmute-button"]');
            if (muteButton && !muteButton._adblock_monitored) {
                muteButton._adblock_monitored = true;
                muteButton.addEventListener('click', () => {
                    if (videoElement) {
                        userManuallyMuted = !videoElement.muted;
                        logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'User toggled mute. New manual state:', userManuallyMuted);
                    }
                });
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    };

    const initialize = () => {
        try {
            unsafeWindow.fetch = fetchOverride;
        } catch (e) {
            logError('Could not override fetch.', e);
        }
        GM_addStyle(`${AD_DOM_SELECTORS.join(',\n')} { display: none !important; }`);
        if (CONFIG.SETTINGS.FORCE_MAX_QUALITY) {
            try {
                Object.defineProperties(document, { 'visibilityState': { get: () => 'visible' }, 'hidden': { get: () => false } });
                document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
            } catch (e) { /* ignore */ }
        }
        setupObservers();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();