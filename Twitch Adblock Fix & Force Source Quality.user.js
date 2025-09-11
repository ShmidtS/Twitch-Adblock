// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      30.3.0
// @description  Comprehensive Twitch adblock leveraging GQL metadata stripping and manifest cleaning.
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
        SCRIPT_VERSION: '30.3.0',
        SETTINGS: {
            FORCE_MAX_QUALITY: GM_getValue('TTV_AdBlock_ForceMaxQuality', true),
            ATTEMPT_DOM_AD_REMOVAL: GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true),
            HIDE_COOKIE_BANNER: GM_getValue('TTV_AdBlock_HideCookieBanner', true),
            ENABLE_AUTO_RELOAD: GM_getValue('TTV_AdBlock_EnableAutoReload', true),
        },
        DEBUG: {
            SHOW_ERRORS: GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true),
            CORE: GM_getValue('TTV_AdBlock_Debug_Core', false),
            PLAYER_MONITOR: GM_getValue('TTV_AdBlock_Debug_PlayerMon', true),
            M3U8_CLEANING: GM_getValue('TTV_AdBlock_Debug_M3U8', true),
            GQL_MODIFY: GM_getValue('TTV_AdBlock_Debug_GQL', true),
            NETWORK_BLOCKING: GM_getValue('TTV_AdBlock_Debug_NetBlock', false),
        },
        ADVANCED: {
            RELOAD_STALL_THRESHOLD_MS: GM_getValue('TTV_AdBlock_StallThresholdMs', 15000),
            RELOAD_BUFFERING_THRESHOLD_MS: GM_getValue('TTV_AdBlock_BufferingThresholdMs', 30000),
            RELOAD_COOLDOWN_MS: GM_getValue('TTV_AdBlock_ReloadCooldownMs', 20000),
            MAX_RELOADS_PER_SESSION: GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 3),
            RELOAD_ON_ERROR_CODES: GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', "403,1000,2000,3000,4000,5000")
            .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
        },
    };

    // --- Constants ---
    const LOG_PREFIX = `[TTV ADBLOCK ULT v${CONFIG.SCRIPT_VERSION}]`;
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;
    const AD_URL_KEYWORDS_BLOCK = [
        'edge.ads.twitch.tv', 'nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js',
        'googlesyndication.com', 'doubleclick.net', 'adnxs.com', 'amazon-adsystem.com',
        'ads.ttvnw.net', 'ad.twitch.tv', 'sentry.io', 'scorecardresearch.com',
    ];
    const AD_DOM_SELECTORS = [
        '.ad-interrupt-screen', '.video-player__ad-info-container', '.player-ad-notice',
        'div[data-test-selector="ad-banner-default-text-area"]', '.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]',
        '[data-test-selector*="sad-overlay"]', 'div[data-a-target*="ad-block-nag"]',
        '.ad-break-ui-container', '[data-a-target="ad-banner"]', '.promoted-content-card',
        '.video-ad-display__container', '[role="advertisement"]', 'div[data-a-target="player-ad-overlay"]',
        ...(CONFIG.SETTINGS.HIDE_COOKIE_BANNER ? ['.consent-banner'] : []),
    ];
    const AD_DATERANGE_KEYWORDS = [
        'AD-ID=', 'CUE-OUT', 'SCTE35', 'Twitch-Ad-Signal', 'Twitch-Prefetch',
        'Twitch-Ads', 'X-TWITCH-AD', 'EXT-X-TWITCH-INFO', 'EXT-X-ASSET'
    ];

    // --- State Variables ---
    let hooksInstalled = false;
    let adRemovalObserver = null;
    let videoPlayerObserver = null;
    let videoElement = null;
    let lastReloadTimestamp = 0;
    let reloadCount = 0;
    const originalFetch = unsafeWindow.fetch;
    const originalJsonParse = JSON.parse;

    // --- Logging Functions ---
    const logError = (source, message, ...args) => CONFIG.DEBUG.SHOW_ERRORS && console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args);
    const logWarn = (source, message, ...args) => CONFIG.DEBUG.SHOW_ERRORS && console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args);
    const logDebug = (source, message, ...args) => CONFIG.DEBUG.CORE && console.info(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args);
    const logTrace = (flag, source, message, ...args) => flag && console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args);

    /**
     * Overrides JSON.parse to remove ad-related properties from GQL responses.
     * This prevents the player from knowing about upcoming ads.
     */
    const hookJsonParse = () => {
        unsafeWindow.JSON.parse = function(text, reviver) {
            const originalObject = originalJsonParse(text, reviver);

            if (typeof originalObject !== 'object' || originalObject === null) {
                return originalObject;
            }

            // GQL AdSlot Removal
            if (originalObject.data?.adSlots) {
                if (originalObject.data.adSlots.length > 0) {
                    originalObject.data.adSlots = [];
                    logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Cleared adSlots in-flight.');
                }
            }
            if (originalObject.data?.user?.adPlacements) {
                if (originalObject.data.user.adPlacements.length > 0) {
                    originalObject.data.user.adPlacements = [];
                    logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Cleared user.adPlacements in-flight.');
                }
            }
             if (originalObject.data?.stream?.adPlacements) {
                if (originalObject.data.stream.adPlacements.length > 0) {
                    originalObject.data.stream.adPlacements = [];
                    logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Cleared stream.adPlacements in-flight.');
                }
            }
             if (originalObject.data?.user?.stream?.adPlacements) {
                if (originalObject.data.user.stream.adPlacements.length > 0) {
                    originalObject.data.user.stream.adPlacements = [];
                    logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Cleared user.stream.adPlacements in-flight.');
                }
            }

            // User Ad-Free Flag
            if (originalObject.data?.user?.broadcastSettings?.isAdFree === false) {
                originalObject.data.user.broadcastSettings.isAdFree = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'JSON.parse', 'Set isAdFree to true in-flight.');
            }

            // DO NOT MODIFY streamPlaybackAccessToken - this breaks signature validation
            // The value is signed and any change will result in a 403 error.

            return originalObject;
        };
    };

    /**
     * Injects CSS styles to hide ad-related elements on the page.
     */
    const injectCSS = () => {
        const css = `${AD_DOM_SELECTORS.join(',\n')} { display: none !important; }`;
        try {
            GM_addStyle(css);
            logDebug('CSSInject', 'CSS styles applied successfully.');
        } catch (e) {
            logError('CSSInject', 'Failed to apply CSS:', e);
        }
    };

    /**
     * Forces the browser to think the tab is always visible.
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
     */
    const parseAndCleanM3U8 = (m3u8Text, url = 'N/A') => {
        if (!m3u8Text || typeof m3u8Text !== 'string') return { cleanedText: m3u8Text, adsFound: false };

        let adsFound = false;
        const cleanLines = m3u8Text.split('\n').filter(line => {
            const upperTrimmedLine = line.trim().toUpperCase();
            if (AD_DATERANGE_KEYWORDS.some(keyword => upperTrimmedLine.includes(keyword))) {
                adsFound = true;
                return false;
            }
            return true;
        });

        if (adsFound) {
            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'M3U8Clean', `Cleaned M3U8 from ${url}.`);
            return { cleanedText: cleanLines.join('\n'), adsFound: true };
        }
        return { cleanedText: m3u8Text, adsFound: false };
    };

    /**
     * Main override for the `fetch` API.
     */
    const fetchOverride = async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const lowerUrl = requestUrl.toLowerCase();

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerUrl.includes(keyword)) {
                logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'FetchBlock', `Blocked fetch to ${requestUrl}`);
                return new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock` });
            }
        }

        if (TWITCH_MANIFEST_PATH_REGEX.test(lowerUrl) && lowerUrl.includes('usher.ttvnw.net')) {
            const response = await originalFetch(input, init);
            if (response.ok) {
                const text = await response.text();
                const { cleanedText } = parseAndCleanM3U8(text, requestUrl);
                const headers = new Headers(response.headers);
                headers.delete('Content-Length');
                return new Response(cleanedText, { status: response.status, statusText: response.statusText, headers });
            }
        }

        return originalFetch(input, init);
    };

    /**
     * Installs all network and data hooks.
     */
    const installHooks = () => {
        if (hooksInstalled) return;
        hookJsonParse();
        unsafeWindow.fetch = fetchOverride;
        hooksInstalled = true;
        logDebug('HookInstall', 'All network hooks installed.');
    };

    /**
     * Removes ad elements from the DOM using a MutationObserver.
     */
    const removeDOMAdElements = () => {
        if (!CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL) return;
        if (adRemovalObserver) adRemovalObserver.disconnect();
        adRemovalObserver = new MutationObserver(() => {
            AD_DOM_SELECTORS.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.remove());
            });
        });
        const target = document.body || document.documentElement;
        if (target) {
            adRemovalObserver.observe(target, { childList: true, subtree: true });
            logDebug('DOMAdRemoval', 'MutationObserver for ad removal started.');
        }
    };

    /**
     * Triggers a page reload if conditions are met.
     */
    const triggerReload = (reason) => {
        if (!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD) return;
        const now = Date.now();
        if (reloadCount >= CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION || now - lastReloadTimestamp < CONFIG.ADVANCED.RELOAD_COOLDOWN_MS) {
            return;
        }
        lastReloadTimestamp = now;
        reloadCount++;
        logWarn('ReloadTrigger', `Reloading page (${reloadCount}/${CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION}). Reason: ${reason}`);
        unsafeWindow.location.reload();
    };

    /**
     * Sets up a monitor on the video player to handle errors and stalls.
     */
    const setupVideoPlayerMonitor = () => {
        if (videoPlayerObserver) videoPlayerObserver.disconnect();
        const attachListeners = (vid) => {
            if (!vid || vid._adblock_listeners_attached) return;
            logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'PlayerMonitor', 'Attaching listeners to video element.');
            let stallTimer = null;
            vid.addEventListener('stalled', () => {
                logWarn('PlayerMonitor', 'Video stream stalled.');
                if (stallTimer) clearTimeout(stallTimer);
                stallTimer = setTimeout(() => triggerReload('Stall timeout'), CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS);
            }, { passive: true });
            vid.addEventListener('playing', () => {
                if (stallTimer) clearTimeout(stallTimer);
            }, { passive: true });
            vid.addEventListener('error', (e) => {
                const code = e.target?.error?.code;
                logError('PlayerMonitor', `Player error code: ${code || 'N/A'}`);
                if (code && CONFIG.ADVANCED.RELOAD_ON_ERROR_CODES.includes(code)) {
                    triggerReload(`Player error code ${code}`);
                }
            }, { passive: true });
            vid._adblock_listeners_attached = true;
        };

        const findAndAttach = () => {
            const currentVideo = document.querySelector('video');
            if (currentVideo && currentVideo !== videoElement) {
                videoElement = currentVideo;
                attachListeners(videoElement);
            }
        };
        videoPlayerObserver = new MutationObserver(findAndAttach);
        const target = document.body || document.documentElement;
        if (target) {
            videoPlayerObserver.observe(target, { childList: true, subtree: true });
            logDebug('PlayerMonitor', 'Video player observer started.');
            findAndAttach();
        }
    };

    /**
     * Main initialization function for the script.
     */
    const initialize = () => {
        logDebug('Initialize', `Script initializing...`);
        installHooks();
        injectCSS();
        if (CONFIG.SETTINGS.FORCE_MAX_QUALITY) forceMaxQuality();
        removeDOMAdElements();
        setupVideoPlayerMonitor();
        logDebug('Initialize', 'Script initialized.');
    };

    // --- Script Entry Point ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();