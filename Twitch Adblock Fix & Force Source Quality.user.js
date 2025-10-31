// ==UserScript==
// @name         Twitch Adblock Ultimate Enhanced
// @namespace    TwitchAdblockUltimate
// @version      31.1.1
// @description  Enhanced Twitch ad-blocking with smart auto-unmute, injected ad protection, and performance optimizations
// @author       ShmidtS (Enhanced)
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

    const defaultForceUnmute = GM_getValue('TTV_AdBlock_ForceUnmute', true);

    const CONFIG = {
        SCRIPT_VERSION: '31.1.1',
        SETTINGS: {
            FORCE_MAX_QUALITY: GM_getValue('TTV_AdBlock_ForceMaxQuality', true),
            ATTEMPT_DOM_AD_REMOVAL: GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true),
            HIDE_COOKIE_BANNER: GM_getValue('TTV_AdBlock_HideCookieBanner', true),
            ENABLE_AUTO_RELOAD: GM_getValue('TTV_AdBlock_EnableAutoReload', true),
            FORCE_UNMUTE: defaultForceUnmute,
            SMART_UNMUTE: GM_getValue('TTV_AdBlock_SmartUnmute', defaultForceUnmute),
            RESPECT_USER_MUTE: GM_getValue('TTV_AdBlock_RespectUserMute', true),
            REMOVE_AD_PLACEHOLDER: GM_getValue('TTV_AdBlock_RemoveAdPlaceholder', true),
            AGGRESSIVE_AD_BLOCK: GM_getValue('TTV_AdBlock_AggressiveBlock', true),
        },
        DEBUG: {
            SHOW_ERRORS: GM_getValue('TTV_AdBlock_ShowErrorsInConsole', false),
            CORE: GM_getValue('TTV_AdBlock_Debug_Core', false),
            PLAYER_MONITOR: GM_getValue('TTV_AdBlock_Debug_PlayerMon', false),
            M3U8_CLEANING: GM_getValue('TTV_AdBlock_Debug_M3U8', false),
            GQL_MODIFY: GM_getValue('TTV_AdBlock_Debug_GQL', false),
            NETWORK_BLOCKING: GM_getValue('TTV_AdBlock_Debug_NetBlock', false),
        },
        ADVANCED: {
            RELOAD_STALL_THRESHOLD_MS: GM_getValue('TTV_AdBlock_StallThresholdMs', 12000),
            RELOAD_BUFFERING_THRESHOLD_MS: GM_getValue('TTV_AdBlock_BufferingThresholdMs', 30000),
            RELOAD_COOLDOWN_MS: GM_getValue('TTV_AdBlock_ReloadCooldownMs', 20000),
            MAX_RELOADS_PER_SESSION: GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 2),
            RELOAD_ON_ERROR_CODES: GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', "3000,4000,5000")
                .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
            IVS_ERROR_THRESHOLD: 5000,
            PIP_RETRY_ATTEMPTS: 3,
            PIP_RETRY_DELAY_MS: 1000,
            OBSERVER_THROTTLE_MS: 450,
        },
    };

    const LOG_PREFIX = `[TTV ADBLOCK ENH v${CONFIG.SCRIPT_VERSION}]`;
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;

    const AD_URL_KEYWORDS_BLOCK = [
        'edge.ads.twitch.tv',
        'nat.min.js',
        'twitchadserver.js',
        'player-ad-aws.js',
        'googlesyndication.com',
        'doubleclick.net',
        'adnxs.com',
        'amazon-adsystem.com',
        'ads.ttvnw.net',
        'ad.twitch.tv',
        'sentry.io',
        'scorecardresearch.com',
        'amazon-ivs-ads',
        'ivs-player-ads',
        'ad-delivery',
        'ad-beacon',
        'ad-insertion',
        'ad-decisioning',
    ];

    const AD_DOM_SELECTORS = [
        '.ad-interrupt-screen',
        '.video-player__ad-info-container',
        '.player-ad-notice',
        'div[data-test-selector="ad-banner-default-text-area"]',
        '.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]',
        'div[data-a-target="ax-overlay"]',
        '[data-test-selector*="sad-overlay"]',
        'div[data-a-target*="ad-block-nag"]',
        '.ad-break-ui-container',
        '[data-a-target="ad-banner"]',
        '.promoted-content-card',
        '.video-ad-display__container',
        '[role="advertisement"]',
        'div[data-a-target="player-ad-overlay"]',
        '.commercial-break-in-progress',
        '[data-test-selector="commercial-break-in-progress"]',
        '.twitch-ad-break-placeholder',
        '.ad-break-overlay',
        '.player-overlay.ad-break',
        '.video-player__overlay[data-test-selector*="ad"]',
        '.picture-in-picture-player',
        '.pip-player-container',
        '[data-a-target="player-pip"]',
        '.ivs-ad-container',
        '.ivs-ad-overlay',
        '.ivs-ad-wrapper',
        '[class*="AdOverlay"]',
        '[class*="AdBanner"]',
        '[class*="AdContainer"]',
        '[class*="ad-overlay"]',
        '[class*="ad-banner"]',
        '[class*="ad-container"]',
        '.video-player__stream-info-overlay',
        ...(CONFIG.SETTINGS.HIDE_COOKIE_BANNER ? ['.consent-banner'] : []),
    ];

    const AD_DATERANGE_KEYWORDS = [
        'AD-ID=',
        'CUE-OUT',
        'CUE-IN',
        'SCTE35',
        'Twitch-Ad-Signal',
        'Twitch-Prefetch',
        'Twitch-Ads',
        'X-TWITCH-AD',
        'EXT-X-TWITCH-INFO',
        'EXT-X-ASSET',
        'EXT-X-IVS-AD',
        'IVS-AD-MARKER',
        'TWITCH-AD-ROLL',
        'ADVERTISEMENT',
        'STITCHED-AD',
        'PREROLL',
        'MIDROLL',
        'AD-SERVER',
    ];

    const PLACEHOLDER_TEXTS = [
        'Commercial break in progress',
        'The channel is currently displaying a commercial',
        'Ad break in progress',
        'Advertisement',
        'Реклама',
        'Рекламная вставка',
        'Werbeunterbrechung',
    ];

    let hooksInstalled = false;
    let adRemovalObserver = null;
    let videoPlayerObserver = null;
    let videoElement = null;
    let lastReloadTimestamp = 0;
    let reloadCount = 0;
    let userMutedManually = false;
    let lastUserVolumeChange = 0;
    let adDetected = false;
    let originalVideoParent = null;
    let lastKnownVolume = 0.5;
    let scriptAdjustingVolume = false;
    const USER_VOLUME_CHANGE_COOLDOWN_MS = 4000;
    const PREFERRED_SUPPORTED_CODECS = ['av1', 'h265', 'h264'];
    const originalFetch = unsafeWindow.fetch;

    const logError = (s, m, ...a) => CONFIG.DEBUG.SHOW_ERRORS && console.error(`${LOG_PREFIX} [${s}] ERROR:`, m, ...a);
    const logWarn = (s, m, ...a) => CONFIG.DEBUG.SHOW_ERRORS && console.warn(`${LOG_PREFIX} [${s}] WARN:`, m, ...a);
    const logDebug = (s, m, ...a) => CONFIG.DEBUG.CORE && console.info(`${LOG_PREFIX} [${s}] DEBUG:`, m, ...a);
    const logTrace = (f, s, m, ...a) => f && console.debug(`${LOG_PREFIX} [${s}] TRACE:`, m, ...a);

    const debounce = (fn, wait) => {
        let timeout = null;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    };

    const withVolumeGuard = (fn) => {
        scriptAdjustingVolume = true;
        try {
            fn();
        } finally {
            setTimeout(() => {
                scriptAdjustingVolume = false;
            }, 200);
        }
    };

    const hasRecentUserVolumeChange = () => (
        !!(lastUserVolumeChange && (Date.now() - lastUserVolumeChange) < USER_VOLUME_CHANGE_COOLDOWN_MS)
    );

    const shouldAutoUnmute = () => {
        if (!CONFIG.SETTINGS.FORCE_UNMUTE || !CONFIG.SETTINGS.SMART_UNMUTE) {
            return false;
        }

        if (CONFIG.SETTINGS.RESPECT_USER_MUTE && userMutedManually) {
            return false;
        }

        if (hasRecentUserVolumeChange()) {
            return false;
        }

        return true;
    };

    const attemptAutoUnmute = (reason) => {
        if (!videoElement || !shouldAutoUnmute()) {
            if (CONFIG.DEBUG.PLAYER_MONITOR) {
                if (userMutedManually) {
                    logTrace(true, 'AudioGuard', `Skipping auto-unmute (${reason}) due to user mute`);
                } else if (hasRecentUserVolumeChange()) {
                    logTrace(true, 'AudioGuard', `Skipping auto-unmute (${reason}) due to recent user volume change`);
                }
            }
            return;
        }
        
        const targetVolume = lastKnownVolume > 0.05 ? lastKnownVolume : 0.5;
        const wasMuted = videoElement.muted;
        const wasLowVolume = videoElement.volume <= 0.001;
        
        withVolumeGuard(() => {
            if (videoElement.muted) {
                videoElement.muted = false;
            }
            if (videoElement.volume <= 0.001) {
                videoElement.volume = targetVolume;
            }
        });
        
        if (wasMuted || wasLowVolume) {
            lastKnownVolume = videoElement.volume > 0.05 ? videoElement.volume : targetVolume;
            logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'AudioGuard', `Auto-unmuted (${reason}) to volume ${lastKnownVolume.toFixed(2)}`);
        }
    };

    const normalizeSupportedCodecs = (existing) => {
        const codecs = Array.isArray(existing)
            ? existing.filter(codec => typeof codec === 'string' && codec.trim())
            : [];
        const unique = new Set();
        codecs.forEach(codec => unique.add(codec));
        PREFERRED_SUPPORTED_CODECS.forEach(codec => unique.add(codec));
        return Array.from(unique);
    };

    const adjustPlaybackAccessTokenPayload = (payload) => {
        if (!payload || typeof payload !== 'object' || !payload.variables || typeof payload.variables !== 'object') {
            return false;
        }

        const { variables } = payload;
        let updated = false;

        if (variables.playerType !== 'embed') {
            variables.playerType = 'embed';
            updated = true;
        }

        if (!variables.platform || variables.platform !== 'web') {
            variables.platform = 'web';
            updated = true;
        }

        const normalizedCodecs = normalizeSupportedCodecs(variables.supportedCodecs);
        if (!Array.isArray(variables.supportedCodecs) ||
            variables.supportedCodecs.length !== normalizedCodecs.length ||
            variables.supportedCodecs.some((codec, index) => normalizedCodecs[index] !== codec)) {
            variables.supportedCodecs = normalizedCodecs;
            updated = true;
        }

        if (variables.isVod === false && variables.playerBackend !== 'mediaplayer') {
            variables.playerBackend = 'mediaplayer';
            updated = true;
        }

        if (Object.prototype.hasOwnProperty.call(variables, 'adblock')) {
            delete variables.adblock;
            updated = true;
        }

        return updated;
    };

    const fetchOverride = async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const requestUrlLower = requestUrl.toLowerCase();

        if (AD_URL_KEYWORDS_BLOCK.some(k => requestUrlLower.includes(String(k).toLowerCase()))) {
            logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'Network', `Blocked fetch ${requestUrl}`);
            return new Response(null, { status: 204, statusText: 'Blocked by TTV Adblock Enhanced' });
        }

        if (requestUrl === GQL_URL) {
            try {
                let originalBodyText = null;

                if (typeof init?.body === 'string') {
                    originalBodyText = init.body;
                } else if (input instanceof Request) {
                    originalBodyText = await input.clone().text();
                } else if (init && init.body) {
                    originalBodyText = await (new Request(requestUrl, init)).text();
                }

                if (originalBodyText) {
                    const originalBody = JSON.parse(originalBodyText);

                    const adjustPlayback = (payload) => {
                        if (!payload || typeof payload !== 'object') {
                            return false;
                        }
                        const updated = adjustPlaybackAccessTokenPayload(payload);
                        if (updated) {
                            logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQL', 'Adjusted PlaybackAccessToken payload');
                        }
                        return updated;
                    };

                    if (Array.isArray(originalBody)) {
                        let modified = false;
                        originalBody.forEach(payload => {
                            if (payload?.operationName === 'PlaybackAccessToken' && adjustPlayback(payload)) {
                                modified = true;
                            }
                        });

                        if (modified) {
                            const newInit = { ...(init || {}), body: JSON.stringify(originalBody) };
                            return originalFetch(input, newInit);
                        }
                    } else if (originalBody && typeof originalBody === 'object') {
                        if (originalBody.operationName === 'ShoutoutHighlightServiceQuery') {
                            return new Response(JSON.stringify({ data: {}, errors: [] }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        if (originalBody.operationName === 'VideoPlayerStreamInfoOverlayChannel') {
                            return new Response(JSON.stringify({ data: { user: null }, errors: [] }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        if (originalBody.operationName === 'PlaybackAccessToken' && adjustPlayback(originalBody)) {
                            const newInit = { ...(init || {}), body: JSON.stringify(originalBody) };
                            return originalFetch(input, newInit);
                        }
                    }
                }
            } catch (e) {
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQL', 'PlaybackAccessToken modification failed', e);
            }
        }

        if (TWITCH_MANIFEST_PATH_REGEX.test(requestUrl) && requestUrlLower.includes('usher.ttvnw.net')) {
            try {
                const response = await originalFetch(input, init);
                if (response && response.ok) {
                    const manifestText = await response.text();
                    const { cleanedText, adsFound, adSegments } = parseAndCleanM3U8(manifestText, requestUrl);

                    if (adsFound) {
                        adDetected = true;
                        logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'M3U8', `Removed ${adSegments} ad segments`);

                        const newHeaders = new Headers(response.headers);
                        newHeaders.delete('Content-Length');
                        newHeaders.set('X-Adblock-Cleaned', 'true');

                        return new Response(cleanedText, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: newHeaders
                        });
                    }

                    return new Response(manifestText, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }

                return response;
            } catch (e) {
                logWarn('Network', 'Failed to clean M3U8 manifest', e);
            }
        }

        return originalFetch(input, init);
    };

    const injectCSS = () => {
        const css = `
${AD_DOM_SELECTORS.join(',\n')} {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    z-index: -9999 !important;
    position: absolute !important;
    width: 0 !important;
    height: 0 !important;
    pointer-events: none !important;
}

.video-player__container {
    position: relative !important;
}

.video-player__overlay[data-test-selector*="ad"]:not([data-a-target*="player-controls"]) {
    pointer-events: none !important;
}

video {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
}

/* Ensure player controls remain interactive */
[data-a-target*="player-controls"],
[data-a-target*="player-overlay-click-handler"],
.player-controls,
.player-controls__left-control-group,
.player-controls__right-control-group,
button[data-a-target*="player"],
.player-button,
[class*="player-controls"],
[class*="PlayerControls"],
[class*="player-overlay-background"],
.video-player__overlay-background {
    pointer-events: auto !important;
}

/* Optimize rendering */
.video-player__container,
.video-player {
    will-change: transform !important;
    transform: translateZ(0);
}
        `;

        try {
            GM_addStyle(css);
            logTrace(CONFIG.DEBUG.CORE, 'Init', 'CSS injected');
        } catch (e) {
            logWarn('Init', 'CSS injection failed', e);
        }
    };

    const forceMaxQuality = () => {
        try {
            Object.defineProperties(document, {
                visibilityState: { get: () => 'visible', configurable: true },
                hidden: { get: () => false, configurable: true },
                webkitHidden: { get: () => false, configurable: true },
                mozHidden: { get: () => false, configurable: true },
                msHidden: { get: () => false, configurable: true },
            });
            document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
            logTrace(CONFIG.DEBUG.CORE, 'Init', 'Page visibility overridden for quality');
        } catch (e) {
            logWarn('Init', 'Unable to override visibility API', e);
        }
    };

    const parseAndCleanM3U8 = (m3u8Text, url = 'N/A') => {
        if (!m3u8Text || typeof m3u8Text !== 'string') {
            return { cleanedText: m3u8Text, adsFound: false, adSegments: 0 };
        }

        let adsFound = false;
        let adSegments = 0;
        const keywordUpper = AD_DATERANGE_KEYWORDS.map(k => String(k).toUpperCase());
        const lines = m3u8Text.split('\n');
        const cleanLines = [];
        let skipNextSegment = false;
        let inAdBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) {
                cleanLines.push(line);
                continue;
            }

            const trimmed = line.trim();
            const upper = trimmed.toUpperCase();

            if (skipNextSegment) {
                skipNextSegment = false;
                adSegments++;
                continue;
            }

            if (upper.startsWith('#EXT-X-DATERANGE')) {
                if (keywordUpper.some(k => upper.includes(k))) {
                    adsFound = true;
                    inAdBlock = true;
                    continue;
                }
            }

            if (upper.startsWith('#EXT-X-CUE-OUT') || (upper.startsWith('#EXTINF') && inAdBlock)) {
                adsFound = true;
                if (upper.startsWith('#EXTINF')) {
                    skipNextSegment = true;
                }
                continue;
            }

            if (upper.startsWith('#EXT-X-CUE-IN')) {
                adsFound = true;
                inAdBlock = false;
                continue;
            }

            if (keywordUpper.some(k => upper.includes(k))) {
                adsFound = true;
                if (upper.startsWith('#EXTINF')) {
                    skipNextSegment = true;
                }
                continue;
            }

            cleanLines.push(line);
        }

        return {
            cleanedText: adsFound ? cleanLines.join('\n') : m3u8Text,
            adsFound,
            adSegments,
        };
    };

    const removeDOMAdElements = () => {
        if (!CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL) return;

        const runCleanup = () => {
            const root = videoElement?.closest('.video-player__container') || document.body || document.documentElement;
            if (!root) return;

            let removedElements = 0;
            let placeholderDetected = false;

            AD_DOM_SELECTORS.forEach(selector => {
                try {
                    const matches = root.querySelectorAll(selector);
                    if (matches.length) {
                        matches.forEach(el => {
                            if (el && el.parentNode && !el.closest('.persistent-player') && !el.closest('[data-a-target*="player-controls"]')) {
                                el.remove();
                                removedElements++;
                            }
                        });
                    }
                } catch (e) { /* ignore CSS errors */ }
            });

            if (CONFIG.SETTINGS.REMOVE_AD_PLACEHOLDER) {
                const textContainers = root.querySelectorAll('div, span, p, section, article');
                textContainers.forEach(node => {
                    if (!node || !node.textContent) return;
                    if (node.closest('[data-a-target*="player-controls"]')) return;
                    const text = node.textContent.trim().toLowerCase();
                    if (!text) return;
                    if (PLACEHOLDER_TEXTS.some(ph => text.includes(ph.toLowerCase()))) {
                        placeholderDetected = true;
                        if (node.parentNode) {
                            node.remove();
                            removedElements++;
                        }
                    }
                });
            }

            if (placeholderDetected) {
                restoreVideoFromAd('placeholder cleanup');
            }

            if (removedElements && CONFIG.DEBUG.PLAYER_MONITOR) {
                logTrace(true, 'DOM', `Removed ${removedElements} ad elements`);
            }
        };

        const debouncedCleanup = debounce(runCleanup, CONFIG.ADVANCED.OBSERVER_THROTTLE_MS);

        if (adRemovalObserver) {
            adRemovalObserver.disconnect();
        }

        adRemovalObserver = new MutationObserver((mutations) => {
            // Only process if we actually see relevant changes
            let shouldClean = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldClean = true;
                    break;
                }
                if (mutation.type === 'attributes' && ['class', 'data-a-target', 'style'].includes(mutation.attributeName)) {
                    shouldClean = true;
                    break;
                }
            }
            if (shouldClean) {
                debouncedCleanup();
            }
        });

        const target = document.body || document.documentElement;
        if (target) {
            adRemovalObserver.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'data-a-target'],
            });
        }

        runCleanup();
    };

    const restoreVideoFromAd = (reason = 'ad cleanup') => {
        if (!videoElement) return;

        attemptAutoUnmute(reason);

        if (videoElement.paused) {
            videoElement.play().catch(() => {});
        }

        if (document.pictureInPictureElement && document.pictureInPictureElement !== videoElement) {
            document.exitPictureInPicture().catch(() => {});
        }

        if (originalVideoParent && videoElement.parentElement !== originalVideoParent) {
            try {
                originalVideoParent.appendChild(videoElement);
            } catch (e) {}
        }

        videoElement.style.removeProperty('display');
        videoElement.style.removeProperty('opacity');
        videoElement.style.removeProperty('width');
        videoElement.style.removeProperty('height');

        adDetected = false;
    };

    const triggerReload = (reason) => {
        if (!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD) return;

        const now = Date.now();
        if (reloadCount >= CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION || (now - lastReloadTimestamp) < CONFIG.ADVANCED.RELOAD_COOLDOWN_MS) {
            logTrace(CONFIG.DEBUG.CORE, 'Reload', `Skipped reload (${reason})`);
            return;
        }

        reloadCount++;
        lastReloadTimestamp = now;
        logWarn('Reload', `Reloading page (#${reloadCount}) due to ${reason}`);
        setTimeout(() => unsafeWindow.location.reload(), 100);
    };

    const setupVideoPlayerMonitor = () => {
        if (videoPlayerObserver) {
            videoPlayerObserver.disconnect();
        }

        const attachListeners = (vid) => {
            if (!vid || vid._ttvAdblockListeners) return;

            originalVideoParent = vid.parentElement;
            if (vid.volume > 0.05) {
                lastKnownVolume = vid.volume;
            }

            // Don't treat initial autoplay mute as user action
            // Only set userMutedManually if user actually interacts
            if (!vid._ttvInitialState) {
                vid._ttvInitialState = true;
                if (CONFIG.SETTINGS.FORCE_UNMUTE && CONFIG.SETTINGS.SMART_UNMUTE) {
                    // Give browser/Twitch time to set up the video, then try auto-unmute
                    // Use multiple attempts to ensure unmute happens
                    setTimeout(() => {
                        if (videoElement === vid && !userMutedManually) {
                            attemptAutoUnmute('initial setup');
                        }
                    }, 1000);
                    
                    setTimeout(() => {
                        if (videoElement === vid && !userMutedManually && (vid.muted || vid.volume <= 0.001)) {
                            attemptAutoUnmute('initial setup retry');
                        }
                    }, 2500);
                }
            }

            let stallTimer = null;
            let ivsErrorTimer = null;
            let waitingTimer = null;

            vid.addEventListener('volumechange', () => {
                const now = Date.now();
                if (scriptAdjustingVolume) {
                    if (vid.volume > 0.05) {
                        lastKnownVolume = vid.volume;
                    }
                    logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'AudioGuard', 'Volume changed by script');
                    return;
                }

                // Real user volume change detected
                const isMuted = vid.muted || vid.volume <= 0.001;
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'AudioGuard', `User volume change: muted=${isMuted}, volume=${vid.volume}`);
                
                if (isMuted) {
                    userMutedManually = true;
                    logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'AudioGuard', 'User manually muted');
                } else {
                    userMutedManually = false;
                    if (vid.volume > 0.05) {
                        lastKnownVolume = vid.volume;
                    }
                    logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'AudioGuard', 'User manually unmuted');
                }
                lastUserVolumeChange = now;
            }, { passive: true });

            vid.addEventListener('stalled', () => {
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'Video', 'Playback stalled');
                if (stallTimer) clearTimeout(stallTimer);
                stallTimer = setTimeout(() => triggerReload('stall timeout'), CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS);
                document.querySelectorAll('.commercial-break-in-progress,[data-test-selector="commercial-break-in-progress"]').forEach(el => el.remove());
                if (vid.paused) {
                    vid.play().catch(() => {});
                }
            }, { passive: true });

            vid.addEventListener('playing', () => {
                if (stallTimer) clearTimeout(stallTimer);
                if (waitingTimer) clearTimeout(waitingTimer);
                if (adDetected) {
                    attemptAutoUnmute('playing');
                    adDetected = false;
                }
                if (vid.volume > 0.05 && !scriptAdjustingVolume) {
                    lastKnownVolume = vid.volume;
                }
            }, { passive: true });

            vid.addEventListener('loadeddata', () => {
                if (adDetected) {
                    attemptAutoUnmute('loadeddata');
                    adDetected = false;
                }
            }, { passive: true });

            vid.addEventListener('error', (e) => {
                const code = e?.target?.error?.code;
                const message = e?.target?.error?.message || '';
                logError('Video', `Player error (code=${code}, message=${message})`);
                if (code && (CONFIG.ADVANCED.RELOAD_ON_ERROR_CODES.includes(code) || message.includes('IVS') || message.includes('InvalidCharacter'))) {
                    if (ivsErrorTimer) clearTimeout(ivsErrorTimer);
                    ivsErrorTimer = setTimeout(() => triggerReload(`error ${code}`), CONFIG.ADVANCED.IVS_ERROR_THRESHOLD);
                }
                document.querySelectorAll('.commercial-break-in-progress,[data-test-selector="commercial-break-in-progress"]').forEach(el => el.remove());
            });

            vid.addEventListener('waiting', () => {
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'Video', 'Buffering...');
                if (waitingTimer) clearTimeout(waitingTimer);
                waitingTimer = setTimeout(() => {
                    if (vid.readyState < 3) {
                        vid.play().catch(() => {});
                    }
                }, CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS);
            }, { passive: true });

            vid.addEventListener('canplay', () => {
                if (waitingTimer) clearTimeout(waitingTimer);
            }, { passive: true });

            vid.addEventListener('seeking', () => {
                if (stallTimer) clearTimeout(stallTimer);
            }, { passive: true });

            vid._ttvAdblockListeners = true;
        };

        const debouncedAttach = debounce(() => {
            const currentVideo = document.querySelector('video');
            if (currentVideo && currentVideo !== videoElement) {
                videoElement = currentVideo;
                attachListeners(videoElement);
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'Video', 'Attached to new video element');
            }
        }, 250);

        videoPlayerObserver = new MutationObserver(() => debouncedAttach());

        const target = document.body || document.documentElement;
        if (target) {
            videoPlayerObserver.observe(target, { childList: true, subtree: true });
        }

        debouncedAttach();
    };

    const installHooks = () => {
        if (hooksInstalled) return;
        hooksInstalled = true;

        try {
            unsafeWindow.fetch = fetchOverride;
            logTrace(CONFIG.DEBUG.CORE, 'Init', 'Fetch override installed');
        } catch (e) {
            logWarn('Init', 'Failed to override fetch', e);
        }
    };

    const initialize = () => {
        logDebug('Init', 'Starting Twitch Adblock Ultimate Enhanced');
        installHooks();
        injectCSS();
        if (CONFIG.SETTINGS.FORCE_MAX_QUALITY) {
            forceMaxQuality();
        }
        removeDOMAdElements();
        setupVideoPlayerMonitor();

        setInterval(() => {
            if (adDetected && videoElement && CONFIG.SETTINGS.AGGRESSIVE_AD_BLOCK) {
                restoreVideoFromAd('periodic watchdog');
            }
            
            // Periodic unmute check for persistent ad muting
            if (videoElement && CONFIG.SETTINGS.FORCE_UNMUTE && CONFIG.SETTINGS.SMART_UNMUTE && !userMutedManually) {
                if (videoElement.muted || videoElement.volume <= 0.001) {
                    attemptAutoUnmute('periodic check');
                }
            }
        }, 2000);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }

    console.info(`${LOG_PREFIX} Ready! Smart unmute: ${CONFIG.SETTINGS.SMART_UNMUTE}; respect user mute: ${CONFIG.SETTINGS.RESPECT_USER_MUTE}; aggressive blocking: ${CONFIG.SETTINGS.AGGRESSIVE_AD_BLOCK}`);
})();
