// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      32.1.0
// @description  Twitch ad-blocking
// @author       ShmidtS
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @match        https://player.twitch.tv/*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
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

    // ====== CONFIGURATION ======
    const CONFIG = {
        SCRIPT_VERSION: '32.1.0',
        SETTINGS: {
            // Network blocking - SELECTIVE to avoid breaking chat/auth
            ENABLE_AD_SERVER_BLOCKING: GM_getValue('TTV_BlockAdServers', true),
            ENABLE_M3U8_CLEANING: GM_getValue('TTV_CleanM3U8', true),
            ENABLE_GQL_MODIFICATION: GM_getValue('TTV_ModifyGQL', true),
            ENABLE_DOM_CLEANUP: GM_getValue('TTV_DOMCleanup', true),
            CONSERVATIVE_DOM_REMOVAL: GM_getValue('TTV_ConservativeDOM', true),
            AUTO_UNMUTE: GM_getValue('TTV_AutoUnmute', true),
            FORCE_QUALITY: GM_getValue('TTV_ForceQuality', true),
            RESTORE_ON_AD: GM_getValue('TTV_RestoreOnAd', true),
            HIDE_AD_PLACEHOLDERS: GM_getValue('TTV_HidePlaceholders', true),
            PROTECT_CHAT: GM_getValue('TTV_ProtectChat', true),
            SKIP_AGGRESSIVE_BLOCKING: GM_getValue('TTV_SkipAggressive', true),
            ENABLE_DEBUG: GM_getValue('TTV_EnableDebug', false),
        },
        ADVANCED: {
            // More precise patterns - only block ACTUAL ad endpoints
            AD_SERVER_DOMAINS: [
                'edge.ads.twitch.tv',
                'ads.ttvnw.net',
                'ad.twitch.tv',
                'doubleclick.net',
                'googlesyndication.com',
                'amazon-adsystem.com',
            ],
            // Whitelist patterns - NEVER block these
            CHAT_PROTECTION_PATTERNS: [
                'wss://irc-ws.chat.twitch.tv',
                '/chat/room',
                'chat.twitch.tv',
                'tmi.twitch.tv',
                'usher.ttvnw.net/api/channel/hls',
                '/gql POST', // Don't block GQL, only modify
            ],
            // M3U8 ad markers
            M3U8_AD_MARKERS: [
                'CUE-OUT',
                'CUE-IN',
                'DATERANGE',
                'SCTE35',
                'EXT-X-TWITCH-AD',
                'STREAM-DISPLAY-AD',
            ],
            // Precise DOM selectors
            AD_DOM_SELECTORS: [
                '[data-test-selector="commercial-break-in-progress"]',
                '.ad-interrupt-screen',
                '.commercial-break-in-progress',
                '.player-ad-notice',
                '.stream-display-ad__wrapper',
                '.stream-display-ad__container',
                '.ivs-ad-container',
                '.ivs-ad-overlay',
            ],
        },
    };

    // ====== LOGGING ======
    const LOG_PREFIX = `[TTV ADBLOCK v${CONFIG.SCRIPT_VERSION}]`;
    const isDebug = CONFIG.SETTINGS.ENABLE_DEBUG;

    const log = {
        debug: (...args) => isDebug && console.debug(LOG_PREFIX, ...args),
        info: (...args) => console.info(LOG_PREFIX, ...args),
        warn: (...args) => console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args),
    };

    // ====== UTILITIES ======
    const isChatOrAuthUrl = (url) => {
        if (!url) return false;
        const urlLower = url.toLowerCase();

        // Protected patterns - NEVER block these
        return CONFIG.ADVANCED.CHAT_PROTECTION_PATTERNS.some(pattern => {
            if (pattern.includes('/gql POST')) {
                return urlLower.includes('gql.twitch.tv') && !urlLower.includes('streamdisplayad');
            }
            return urlLower.includes(pattern.toLowerCase());
        });
    };

    const isAdServerUrl = (url) => {
        if (!url) return false;
        const urlLower = url.toLowerCase();

        return CONFIG.ADVANCED.AD_SERVER_DOMAINS.some(domain =>
            urlLower.includes(domain.toLowerCase())
        );
    };

    const shouldSkipBlocking = (url) => {
        if (!url) return false;

        // Skip if it's chat/auth
        if (isChatOrAuthUrl(url)) {
            return true;
        }

        // Skip if user disabled aggressive blocking
        if (CONFIG.SETTINGS.SKIP_AGGRESSIVE_BLOCKING) {
            // Only block very specific ad patterns
            const urlLower = url.toLowerCase();
            if (urlLower.includes('ad') && !urlLower.includes('user') && !urlLower.includes('chat')) {
                // Additional check to avoid false positives
                if (urlLower.includes('streamdisplayad') || urlLower.includes('commercial')) {
                    return false;
                }
            }
            return true;
        }

        return false;
    };

    // ====== FETCH OVERRIDE - SELECTIVE ======
    const originalFetch = unsafeWindow.fetch;

    const fetchOverride = async (input, init = {}) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const method = (input instanceof Request ? input.method : init.method || 'GET').toUpperCase();

        try {
            // Skip blocking for chat/auth/protected endpoints
            if (shouldSkipBlocking(requestUrl)) {
                log.debug('Allowing (protected):', requestUrl);
                return originalFetch(input, init);
            }

            // Block ad servers - ONLY specific domains
            if (CONFIG.SETTINGS.ENABLE_AD_SERVER_BLOCKING && isAdServerUrl(requestUrl)) {
                log.info('Blocked ad server:', requestUrl);
                return new Response(null, { status: 204, statusText: 'Blocked' });
            }

            // Handle M3U8 cleaning
            if (CONFIG.SETTINGS.ENABLE_M3U8_CLEANING &&
                requestUrl.includes('.m3u8') &&
                requestUrl.includes('usher.ttvnw.net')) {

                log.debug('Cleaning M3U8 manifest:', requestUrl);
                const response = await originalFetch(input, init);

                if (response && response.ok) {
                    const text = await response.clone().text();
                    if (typeof text === 'string' && text.length > 0) {
                        const cleaned = cleanM3U8(text);

                        if (cleaned.changed && cleaned.text && cleaned.text !== text) {
                            log.info(`Cleaned M3U8: removed ${cleaned.removedSegments} ad segments`);
                            const newHeaders = new Headers(response.headers);
                            newHeaders.set('Content-Type', 'application/x-mpegURL');
                            return new Response(cleaned.text, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: newHeaders
                            });
                        }
                    }
                }

                return response;
            }

            // Handle GQL modification
            if (CONFIG.SETTINGS.ENABLE_GQL_MODIFICATION && requestUrl.includes('gql.twitch.tv')) {
                let body = null;

                // Get body from Request object or init
                if (input instanceof Request && init.body == null) {
                    body = await input.clone().text();
                } else if (init.body) {
                    body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
                }

                if (body && typeof body === 'string' && body.length > 0) {
                    try {
                        const parsed = JSON.parse(body);
                        const modified = modifyGQLRequest(parsed);

                        if (modified.changed) {
                            log.debug('Modified GQL request');
                            const newInit = { ...(init || {}), body: JSON.stringify(modified.data) };
                            return originalFetch(input, newInit);
                        }
                    } catch (e) {
                        // Not critical - just pass through
                    }
                }
            }

            // Default: pass through
            return originalFetch(input, init);
        } catch (error) {
            // Don't break the page on errors - always fall back
            log.warn('Fetch override error, falling back to original:', error);
            try {
                return originalFetch(input, init);
            } catch (fallbackError) {
                log.error('Even original fetch failed:', fallbackError);
                // Last resort: return a minimal response
                return new Response('Network error', { status: 500 });
            }
        }
    };

    // ====== XHR OVERRIDE - LIGHTWEIGHT ======
    const originalXHR = unsafeWindow.XMLHttpRequest;

    const XHROverride = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        const originalSend = xhr.send;
        let requestUrl = '';
        let method = 'GET';
        let opened = false;

        xhr.open = function(m, url, ...args) {
            try {
                method = (m || 'GET').toString().toUpperCase();
                requestUrl = url || '';

                // Protect chat/auth endpoints
                if (shouldSkipBlocking(requestUrl)) {
                    log.debug('XHR Allowing (protected):', requestUrl);
                    opened = true;
                    return originalOpen.apply(this, [method, requestUrl, ...args]);
                }

                // Block ONLY ad servers
                if (CONFIG.SETTINGS.ENABLE_AD_SERVER_BLOCKING && isAdServerUrl(requestUrl)) {
                    log.info('XHR Blocked ad server:', requestUrl);
                    // Don't throw - just make it a no-op by opening a data URL
                    opened = false;
                    const noOp = function() {
                        Object.defineProperty(this, 'readyState', { get: () => 4 });
                        Object.defineProperty(this, 'status', { get: () => 204 });
                        Object.defineProperty(this, 'responseText', { get: () => '' });
                        setTimeout(() => {
                            if (this.onreadystatechange) this.onreadystatechange();
                            if (this.onload) this.onload();
                        }, 0);
                    };
                    return noOp.bind(this);
                }

                opened = true;
                return originalOpen.apply(this, [method, requestUrl, ...args]);
            } catch (error) {
                log.error('XHR open error:', error);
                // Fallback to original
                return originalOpen.apply(this, [method, requestUrl, ...args]);
            }
        };

        xhr.send = function(...args) {
            try {
                if (!opened) {
                    // This shouldn't happen, but just in case
                    log.warn('XHR send called without open');
                    return originalSend.apply(this, args);
                }
                return originalSend.apply(this, args);
            } catch (error) {
                log.error('XHR send error:', error);
                // Try to fall back
                try {
                    return originalSend.apply(this, args);
                } catch (e) {
                    // Last resort
                    if (this.onerror) this.onerror(e);
                }
            }
        };

        return xhr;
    };

    // Ensure prototype is properly set
    if (originalXHR) {
        XHROverride.prototype = originalXHR.prototype;
        // Copy static methods
        Object.setPrototypeOf(XHROverride, originalXHR);
    }

    // ====== WEBSOCKET OVERRIDE - CHAT-SAFE ======
    const originalWebSocket = unsafeWindow.WebSocket;

    const WebSocketOverride = function(url, protocols) {
        // ALWAYS allow WebSocket connections - critical for chat
        log.debug('WebSocket (allowed):', url);
        try {
            return new originalWebSocket(url, protocols);
        } catch (error) {
            log.error('WebSocket creation error:', error);
            // Don't break - just let it fail naturally
            throw error;
        }
    };

    // Ensure prototype is properly set
    if (originalWebSocket) {
        WebSocketOverride.prototype = originalWebSocket.prototype;
        // Copy static properties
        Object.setPrototypeOf(WebSocketOverride, originalWebSocket);
    }

    // ====== M3U8 CLEANING - IMPROVED ======
    const cleanM3U8 = (text) => {
        if (!text || typeof text !== 'string') {
            return { text, changed: false, removedSegments: 0 };
        }

        try {
            const lines = text.split('\n');
            const result = [];
            let removedSegments = 0;
            let skipNext = false;
            let inAdBlock = false;
            let adBlockDepth = 0;

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const line = rawLine.trim();
                const upper = line.toUpperCase();

                // Handle nested ad blocks
                if (upper.startsWith('#EXT-X-DATERANGE')) {
                    const isAdMarker = CONFIG.ADVANCED.M3U8_AD_MARKERS.some(marker =>
                        upper.includes(marker)
                    );
                    if (isAdMarker) {
                        inAdBlock = true;
                        adBlockDepth++;
                        continue;
                    }
                }

                if (upper.startsWith('#EXT-X-CUE-OUT') || upper.startsWith('#EXT-X-SCTE35')) {
                    inAdBlock = true;
                    adBlockDepth++;
                    continue;
                }

                if (upper.startsWith('#EXT-X-CUE-IN')) {
                    inAdBlock = false;
                    adBlockDepth = Math.max(0, adBlockDepth - 1);
                    continue;
                }

                // Check for ad markers
                const isAdMarker = CONFIG.ADVANCED.M3U8_AD_MARKERS.some(marker =>
                    upper.includes(marker)
                );

                if (isAdMarker) {
                    inAdBlock = true;
                    adBlockDepth++;
                    continue;
                }

                // Skip ad segments
                if (inAdBlock || skipNext) {
                    if (line.startsWith('#EXTINF')) {
                        skipNext = true;
                        removedSegments++;
                        continue;
                    }

                    if (line && !line.startsWith('#')) {
                        removedSegments++;
                        continue;
                    }

                    if (line.startsWith('#EXT-X-') && !inAdBlock) {
                        // This might be the end of ad block
                        inAdBlock = false;
                        adBlockDepth = Math.max(0, adBlockDepth - 1);
                    } else {
                        // Still in ad block
                        removedSegments++;
                        continue;
                    }
                }

                // Keep the line
                result.push(rawLine);
            }

            const cleaned = result.join('\n');
            return {
                text: cleaned,
                changed: removedSegments > 0,
                removedSegments
            };
        } catch (error) {
            log.error('M3U8 cleaning error:', error);
            // Return original on error
            return { text, changed: false, removedSegments: 0 };
        }
    };

    // ====== GQL MODIFICATION - ROBUST ======
    const modifyGQLRequest = (body) => {
        try {
            if (!body || typeof body !== 'object') {
                return { changed: false, data: body };
            }

            let changed = false;
            let data = body;

            if (Array.isArray(body)) {
                data = body.map(item => {
                    try {
                        if (item?.operationName === 'PlaybackAccessToken') {
                            const result = modifyPlaybackToken(item);
                            if (result.changed) {
                                changed = true;
                            }
                            return result.data;
                        }
                        return item;
                    } catch (e) {
                        // Return original on error
                        return item;
                    }
                });
            } else if (body.operationName === 'PlaybackAccessToken') {
                const result = modifyPlaybackToken(body);
                changed = result.changed;
                data = result.data;
            }

            return { changed, data };
        } catch (error) {
            log.error('GQL modification error:', error);
            return { changed: false, data: body };
        }
    };

    const modifyPlaybackToken = (payload) => {
        try {
            if (!payload || typeof payload !== 'object') {
                return { changed: false, data: payload };
            }

            if (!payload.variables || typeof payload.variables !== 'object') {
                return { changed: false, data: payload };
            }

            let changed = false;
            const vars = { ...payload.variables };

            // Force embed player to avoid ads
            if (vars.playerType !== 'embed') {
                vars.playerType = 'embed';
                changed = true;
            }

            // Ensure web platform
            if (vars.platform !== 'web') {
                vars.platform = 'web';
                changed = true;
            }

            // Prefer source quality
            if (vars.videoQualityPreference !== 'chunked') {
                vars.videoQualityPreference = 'chunked';
                changed = true;
            }

            // Add supported codecs to avoid IVS ads
            if (!vars.supportedCodecs || !Array.isArray(vars.supportedCodecs)) {
                vars.supportedCodecs = ['av01', 'avc1', 'vp9'];
                changed = true;
            }

            return { changed, data: { ...payload, variables: vars } };
        } catch (error) {
            log.error('PlaybackToken modification error:', error);
            return { changed: false, data: payload };
        }
    };

    // ====== DOM CLEANUP - CONSERVATIVE ======
    const injectCSS = () => {
        if (!CONFIG.SETTINGS.ENABLE_DOM_CLEANUP) return;

        try {
            // Check if GM_addStyle is available
            if (typeof GM_addStyle !== 'function') {
                log.warn('GM_addStyle not available');
                return;
            }

            // Build CSS safely
            const baseSelectors = CONFIG.ADVANCED.AD_DOM_SELECTORS;
            let additionalSelectors = [];

            if (!CONFIG.SETTINGS.CONSERVATIVE_DOM_REMOVAL) {
                additionalSelectors = [
                    '[data-test-selector*="ad-overlay"]',
                    '.ad-banner',
                    '.ad-container',
                    '.ad-overlay'
                ];
            }

            const allSelectors = [...baseSelectors, ...additionalSelectors];
            const selectorChunk1 = allSelectors.slice(0, Math.ceil(allSelectors.length / 2));
            const selectorChunk2 = allSelectors.slice(Math.ceil(allSelectors.length / 2));

            // Split into two parts to avoid CSS length limits
            const css1 = `
${selectorChunk1.join(',\n')} {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
}
            `;

            const css2 = `
${selectorChunk2.join(',\n')} {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
}

video {
    pointer-events: auto !important;
    display: block !important;
}

[data-a-target*="player-controls"] {
    pointer-events: auto !important;
    display: block !important;
}
            `;

            GM_addStyle(css1);
            GM_addStyle(css2);
            log.debug('CSS injected successfully');
        } catch (e) {
            log.error('CSS injection failed:', e);
        }
    };

    // ====== VIDEO PLAYER MONITOR ======
    const setupPlayerMonitor = () => {
        try {
            const video = document.querySelector('video');
            if (!video) {
                log.debug('No video element found, will retry later');
                return;
            }

            log.debug('Video player found, setting up monitor');

            // Auto-unmute on certain events
            if (CONFIG.SETTINGS.AUTO_UNMUTE) {
                const autoUnmute = () => {
                    try {
                        if (video && video.muted) {
                            log.info('Auto-unmuting video');
                            video.muted = false;
                            video.volume = Math.max(video.volume, 0.5);
                        }
                    } catch (e) {
                        log.error('Auto-unmute error:', e);
                    }
                };

                video.addEventListener('playing', autoUnmute, { once: true });
                video.addEventListener('loadeddata', autoUnmute, { once: true });
            }

            // Restore playback on ad detection
            if (CONFIG.SETTINGS.RESTORE_ON_AD) {
                let adDetected = false;
                let retryCount = 0;
                const maxRetries = 3;

                const onStalled = () => {
                    try {
                        if (!adDetected) {
                            log.debug('Possible ad detected, attempting to restore playback');
                            adDetected = true;
                            retryCount++;

                            if (retryCount <= maxRetries) {
                                setTimeout(() => {
                                    try {
                                        if (video && video.paused) {
                                            log.debug(`Playback restore attempt ${retryCount}`);
                                            video.play().catch(() => {});
                                        }
                                        adDetected = false;
                                    } catch (e) {
                                        log.error('Play attempt error:', e);
                                    }
                                }, 1500 * retryCount); // Exponential backoff
                            } else {
                                log.warn('Max retries reached, giving up on restore');
                                adDetected = false;
                                retryCount = 0;
                            }
                        }
                    } catch (e) {
                        log.error('Stalled handler error:', e);
                    }
                };

                video.addEventListener('stalled', onStalled, { passive: true });
                video.addEventListener('waiting', onStalled, { passive: true });
            }
        } catch (error) {
            log.error('Player monitor setup error:', error);
        }
    };

    // ====== INITIALIZATION ======
    const initialize = () => {
        try {
            log.info('Starting Twitch Adblock Ultimate v' + CONFIG.SCRIPT_VERSION);
            console.info(`\n${'='.repeat(60)}`);
            console.info(`${LOG_PREFIX} IMPROVED VERSION ${CONFIG.SCRIPT_VERSION}`);
            console.info(`${'='.repeat(60)}`);
            console.info(`${LOG_PREFIX} ✅ Chat protection: ENABLED`);
            console.info(`${LOG_PREFIX} ✅ Selective blocking: ENABLED`);
            console.info(`${LOG_PREFIX} ✅ M3U8 cleaning: ${CONFIG.SETTINGS.ENABLE_M3U8_CLEANING ? 'ENABLED' : 'DISABLED'}`);
            console.info(`${LOG_PREFIX} ✅ GQL modification: ${CONFIG.SETTINGS.ENABLE_GQL_MODIFICATION ? 'ENABLED' : 'DISABLED'}`);
            console.info(`${LOG_PREFIX} ✅ Auto-unmute: ${CONFIG.SETTINGS.AUTO_UNMUTE ? 'ENABLED' : 'DISABLED'}`);
            console.info(`${LOG_PREFIX} ✅ DOM cleanup: ${CONFIG.SETTINGS.ENABLE_DOM_CLEANUP ? 'ENABLED' : 'DISABLED'}`);
            console.info(`${'='.repeat(60)}\n`);

            // Verify critical APIs are available
            if (typeof unsafeWindow !== 'object') {
                throw new Error('unsafeWindow not available');
            }
            if (typeof originalFetch !== 'function') {
                log.warn('Original fetch not found, fetch override may not work');
            }
            if (typeof originalXHR !== 'function') {
                log.warn('Original XMLHttpRequest not found, XHR override may not work');
            }
            if (typeof originalWebSocket !== 'function') {
                log.warn('Original WebSocket not found, WebSocket override may not work');
            }

            // Install network overrides
            try {
                unsafeWindow.fetch = fetchOverride;
                log.debug('✓ Fetch override installed');
            } catch (e) {
                log.error('✗ Fetch override failed:', e);
            }

            try {
                unsafeWindow.XMLHttpRequest = XHROverride;
                log.debug('✓ XHR override installed');
            } catch (e) {
                log.error('✗ XHR override failed:', e);
            }

            try {
                unsafeWindow.WebSocket = WebSocketOverride;
                log.debug('✓ WebSocket override installed (chat-safe)');
            } catch (e) {
                log.error('✗ WebSocket override failed:', e);
            }

            // Inject CSS
            injectCSS();

            // Setup player monitor with retry
            let retryCount = 0;
            const maxRetries = 5;
            const retryInterval = setInterval(() => {
                try {
                    setupPlayerMonitor();
                    clearInterval(retryInterval);
                } catch (e) {
                    log.error('Player monitor setup error:', e);
                }
                retryCount++;
                if (retryCount >= maxRetries) {
                    clearInterval(retryInterval);
                    log.warn('Player monitor retry limit reached');
                }
            }, 1000);

            log.info('✓ Initialization complete');
            console.info(`${LOG_PREFIX} Ready! Enjoy ad-free Twitch with working chat!\n`);
        } catch (error) {
            log.error('✗ Initialization failed:', error);
            console.error(`${LOG_PREFIX} Failed to initialize!`, error);
        }
    };

    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
