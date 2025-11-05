// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      32.2.0
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
    const SETTINGS = {
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
        SKIP_AGGRESSIVE_BLOCKING: GM_getValue('TTV_SkipAggressive', false),
        ENABLE_DEBUG: GM_getValue('TTV_EnableDebug', false),
        SMART_QUALITY_PERSISTENCE: GM_getValue('TTV_SmartQualityPersistence', true),
        DEBOUNCED_OBSERVERS: GM_getValue('TTV_DebouncedObservers', true),
        ENHANCED_PLAYER_CONTROLS: GM_getValue('TTV_EnhancedPlayerControls', true),
        PERFORMANCE_MODE: GM_getValue('TTV_PerformanceMode', false),
        QUALITY_CACHE_ENABLED: GM_getValue('TTV_QualityCacheEnabled', true),
        AUTO_QUALITY_RESTORE: GM_getValue('TTV_AutoQualityRestore', true),
        SMART_UNMUTE_RESPECT_MANUAL: GM_getValue('TTV_SmartUnmuteRespectManual', true),
        BATCH_DOM_REMOVAL: GM_getValue('TTV_BatchDOMRemoval', true),
    };

    const CONFIG = {
        SCRIPT_VERSION: '32.2.1',
        SETTINGS,
        ADVANCED: {
            AD_SERVER_DOMAINS: [
                'edge.ads.twitch.tv',
                'ads.ttvnw.net',
                'ad.twitch.tv',
                'poster.ad.twitch.tv',
                'video.ad.twitch.tv',
                'doubleclick.net',
                'googlesyndication.com',
                'googletagservices.com',
                'amazon-adsystem.com',
                'adservice.google.com',
                'imasdk.googleapis.com',
                'criteo.com',
                'taboola.com',
                'outbrain.com',
                'scorecardresearch.com',
                'quantserve.com',
                'newrelic.com',
                'sq-tungsten-ts.amazon-adsystem.com',
                'aax.amazon-adsystem.com',
                'api.sprig.com',
                'sprig.com',
                'segment.com',
                'mixpanel.com',
                'hotjar.com',
                'fullstory.com',
                'clarity.ms',
            ],
            // Whitelist patterns - NEVER block these
            CHAT_PROTECTION_PATTERNS: [
                'wss://irc-ws.chat.twitch.tv',
                '/chat/room',
                'chat.twitch.tv',
                'tmi.twitch.tv',
                'usher.ttvnw.net/api/channel/hls',
                '/gql POST',
            ],
            // M3U8 ad markers
            M3U8_AD_MARKERS: [
                'CUE-OUT',
                'CUE-IN',
                'DATERANGE',
                'SCTE35',
                'EXT-X-TWITCH-AD',
                'STREAM-DISPLAY-AD',
                'EXT-X-AD-SECTION',
                'EXT-X-SPLICEPOINT-SCTE35',
                'EXT-X-SEGMENT',
                'EXT-X-TARGETDURATION',
            ],
            // Precise DOM selectors
            AD_DOM_SELECTORS: [
                // Commercial breaks
                '[data-test-selector="commercial-break-in-progress"]',
                '.ad-interrupt-screen',
                '.commercial-break-in-progress',
                '.player-ad-notice',
                '.stream-display-ad__wrapper',
                '.stream-display-ad__container',
                '.stream-display-ad',
                '.ivs-ad-container',
                '.ivs-ad-overlay',
                '.ivs-ad-container__overlay',
                '.ivs-ad-container__pause-button',
                '.ivs-ad-slate',
                '.ivs-ad-title-card',
                '.ivs-ad-skip-button',
                '.ivs-ad-linear',
                '.ivs-linear-ad',
                '[data-a-target="player-ad-label"]',
                '.player-ad-overlay',
                '.player-ad-overlay--linear',
                '.player-ad-ui',
                '.video-chat__containercommercial-break',
                '[class*="ivs-ad"]',
                '[id*="ivs-ad"]',
                '[class*="amazon-ivs"]',
                '[class*="amzn-ivs"]',
                '[data-a-target="preroll-ad-banner"]',
                '.preroll-ad-container',
                '[role="dialog"][aria-label*="ad" i]',
                '[aria-label*="advertisement" i]',
                '[aria-label*="commercial" i]',
                '.consent-banner',
                '.gdpr-consent-banner',
                '[data-a-target="consent-banner-accept"]',
                '.cookie-consent',
                '.cookie-banner',
                '#consent-banner',
                '.gdpr-banner',
            ],
            COOKIE_CONSENT_SELECTORS: [
                '.consent-banner',
                '.gdpr-consent-banner',
                '.cookie-consent',
                '.cookie-banner',
                '#consent-banner',
                '.gdpr-banner',
                '[data-test-selector="consent-banner"]',
                '[data-test-selector="cookie-consent-banner"]',
                '[data-test-selector="gdpr-consent-banner"]',
                '[data-a-target="consent-banner-accept"]',
                '[data-a-target="consent-banner-decline"]',
                '.consent-modal',
                '.gdpr-modal',
                '.cookie-modal',
                '.consent-banner-container',
                '.gdpr-consent-modal',
            ],
        },
        QUALITY_SETTINGS: {
            PREFERRED_QUALITIES: ['chunked', '1080p60', '1080p30', '720p60', '720p30', '480p30', '360p30', '160p30'],
            QUALITY_CHECK_INTERVAL: SETTINGS.PERFORMANCE_MODE ? 5000 : 5000,
            QUALITY_RESTORE_DELAY: 2000,
            CACHE_EXPIRY: 3600000,
        },
        PERFORMANCE: {
            DEBOUNCE_DELAY: SETTINGS.PERFORMANCE_MODE ? 500 : 200,
            BATCH_SIZE: 10,
            OBSERVER_THROTTLE: SETTINGS.PERFORMANCE_MODE ? 1000 : 300,
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

        if (isChatOrAuthUrl(url)) {
            return true;
        }

        if (CONFIG.SETTINGS.SKIP_AGGRESSIVE_BLOCKING) {
            const urlLower = url.toLowerCase();
            if (urlLower.includes('ad') && !urlLower.includes('user') && !urlLower.includes('chat')) {
                if (urlLower.includes('streamdisplayad') || urlLower.includes('commercial')) {
                    return false;
                }
            }
            return true;
        }

        return false;
    };

    // ====== ENHANCED UTILITIES ======
    // Debounce utility for performance optimization
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // Quality cache for persistence across sessions
    const QualityCache = {
        get: (key) => {
            if (!CONFIG.SETTINGS.QUALITY_CACHE_ENABLED) return null;
            try {
                const cached = GM_getValue(`TTV_QualityCache_${key}`, null);
                if (cached && cached.timestamp && Date.now() - cached.timestamp < CONFIG.QUALITY_SETTINGS.CACHE_EXPIRY) {
                    return cached.value;
                }
                return null;
            } catch (e) {
                log.debug('Cache get error:', e);
                return null;
            }
        },
        set: (key, value) => {
            if (!CONFIG.SETTINGS.QUALITY_CACHE_ENABLED) return;
            try {
                GM_setValue(`TTV_QualityCache_${key}`, {
                    value,
                    timestamp: Date.now()
                });
            } catch (e) {
                log.debug('Cache set error:', e);
            }
        },
        clear: () => {
            try {
                if (typeof GM_listValues === 'function') {
                    const keys = GM_listValues() || [];
                    keys.forEach(key => {
                        if (key.startsWith('TTV_QualityCache_')) {
                            GM_deleteValue(key);
                        }
                    });
                }
            } catch (e) {
                log.debug('Cache clear error:', e);
            }
        }
    };

    // Smart volume tracking for manual mute respect
    const VolumeTracker = {
        lastVolume: 0.5,
        manuallyMuted: false,
        initialized: false,

        init(video) {
            if (this.initialized || !video) return;
            
            this.lastVolume = video.volume || 0.5;
            this.manuallyMuted = video.muted || false;
            this.initialized = true;

            // Track manual volume changes
            const handleVolumeChange = () => {
                if (!video.muted) {
                    this.lastVolume = video.volume;
                    this.manuallyMuted = false;
                }
            };

            const handleMuteChange = () => {
                if (video.muted) {
                    this.manuallyMuted = true;
                } else {
                    this.manuallyMuted = false;
                }
            };

            video.addEventListener('volumechange', handleVolumeChange, { passive: true });
            video.addEventListener('mute', handleMuteChange, { passive: true });
            video.addEventListener('unmute', handleMuteChange, { passive: true });

            // Volume tracker initialized
        },

        shouldUnmute() {
            return !CONFIG.SETTINGS.SMART_UNMUTE_RESPECT_MANUAL || !this.manuallyMuted;
        },

        restoreVolume(video) {
            if (!video || !this.initialized) return;
            
            if (!this.manuallyMuted) {
                video.volume = Math.max(this.lastVolume, 0.3);
                video.muted = false;
            }
        }
    };

    // Batch DOM removal for performance
    const BatchDOMRemover = {
        queue: [],
        processing: false,

        add(element) {
            if (!CONFIG.SETTINGS.BATCH_DOM_REMOVAL) {
                this.removeNow(element);
                return;
            }

            this.queue.push(element);
            this.scheduleProcess();
        },

        removeNow(element) {
            try {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            } catch (e) {
                log.debug('Individual remove error:', e);
            }
        },

        scheduleProcess: debounce(() => {
            this.process();
        }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY),

        process() {
            if (this.processing || this.queue.length === 0) return;
            
            this.processing = true;
            const batch = this.queue.splice(0, CONFIG.PERFORMANCE.BATCH_SIZE);
            
            requestAnimationFrame(() => {
                batch.forEach(element => {
                    try {
                        if (element && element.parentNode) {
                            element.parentNode.removeChild(element);
                        }
                    } catch (e) {
                        log.debug('Batch remove error:', e);
                    }
                });
                
                this.processing = false;
                
                if (this.queue.length > 0) {
                    this.scheduleProcess();
                }
            });
        }
    };

    // Enhanced quality detection and selection
    const QualityManager = {
        currentQuality: null,
        availableQualities: [],
        lastCheck: 0,
        isChanging: false,

        detectAvailableQualities() {
            try {
                const qualityButtons = document.querySelectorAll('button[data-a-target*="quality-option"]');
                const qualities = [];
                
                qualityButtons.forEach(button => {
                    const text = button.textContent?.trim() || button.getAttribute('aria-label') || '';
                    if (text && !text.toLowerCase().includes('auto')) {
                        qualities.push(text);
                    }
                });

                // Also check for quality menu items
                const menuItems = document.querySelectorAll('.tw-select-option, .quality-menu-item');
                menuItems.forEach(item => {
                    const text = item.textContent?.trim();
                    if (text && !text.toLowerCase().includes('auto') && !qualities.includes(text)) {
                        qualities.push(text);
                    }
                });

                this.availableQualities = qualities;
                // Detected qualities available
                return qualities;
            } catch (e) {
                log.debug('Quality detection error:', e);
                return [];
            }
        },

        getBestQuality() {
            const available = this.detectAvailableQualities();
            const preferred = CONFIG.QUALITY_SETTINGS.PREFERRED_QUALITIES;
            
            for (const pref of preferred) {
                if (available.some(q => q.toLowerCase().includes(pref.toLowerCase()) || 
                                        pref.toLowerCase().includes(q.toLowerCase()))) {
                    return pref;
                }
            }
            
            return available[0] || 'chunked';
        },

        async setQuality(targetQuality) {
            if (this.isChanging) return;
            this.isChanging = true;

            try {
                // Attempting to set quality
                
                // Open quality menu
                const settingsButton = document.querySelector('[data-a-target="player-settings-menu"]');
                if (settingsButton) {
                    settingsButton.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // Click quality option
                    const qualityButton = document.querySelector('[data-a-target="player-settings-quality"]');
                    if (qualityButton) {
                        qualityButton.click();
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        // Find and click target quality
                        const qualityOptions = document.querySelectorAll('button[data-a-target*="quality-option"], .tw-select-option');
                        for (const option of qualityOptions) {
                            const text = option.textContent?.trim() || option.getAttribute('aria-label') || '';
                            if (text.toLowerCase().includes(targetQuality.toLowerCase()) ||
                                targetQuality.toLowerCase().includes(text.toLowerCase())) {
                                option.click();
                                this.currentQuality = targetQuality;
                                
                                // Cache the preference
                                if (CONFIG.SETTINGS.SMART_QUALITY_PERSISTENCE) {
                                    QualityCache.set('preferredQuality', targetQuality);
                                }
                                
                                log.info(`Quality set to: ${targetQuality}`);
                                return true;
                            }
                        }
                    }
                }
            } catch (e) {
                log.debug('Quality setting error:', e);
            } finally {
                this.isChanging = false;
            }
            
            return false;
        },

        async restoreQuality() {
            if (!CONFIG.SETTINGS.AUTO_QUALITY_RESTORE) return;
            
            const now = Date.now();
            if (now - this.lastCheck < CONFIG.QUALITY_SETTINGS.QUALITY_CHECK_INTERVAL) return;
            this.lastCheck = now;

            try {
                let targetQuality = this.currentQuality;
                
                // Try to get cached preference first
                if (CONFIG.SETTINGS.SMART_QUALITY_PERSISTENCE && !targetQuality) {
                    targetQuality = QualityCache.get('preferredQuality');
                }
                
                // Fall back to best available
                if (!targetQuality) {
                    targetQuality = this.getBestQuality();
                }

                if (targetQuality && targetQuality !== this.currentQuality) {
                    await this.setQuality(targetQuality);
                }
            } catch (e) {
                log.debug('Quality restore error:', e);
            }
        }
    };

    // ====== FETCH OVERRIDE - SELECTIVE ======
    const originalFetch = unsafeWindow.fetch;

    const fetchOverride = async (input, init = {}) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const method = (input instanceof Request ? input.method : init.method || 'GET').toUpperCase();

        try {
            // Skip blocking for chat/auth/protected endpoints
            if (shouldSkipBlocking(requestUrl)) {
                // Allowing protected request
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

                // Cleaning M3U8 manifest
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
                            // Modified GQL request
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
        // WebSocket connection allowed
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

            // CONSERVATIVE: Only modify playerType if it's causing issues
            // DO NOT modify playerType, platform, or other critical parameters
            // to avoid integrity check failures

            // Optional: Force source quality only if user explicitly enabled it
            // Commented out to avoid breaking Twitch integrity checks
            /*
            if (vars.videoQualityPreference && vars.videoQualityPreference !== 'chunked') {
                vars.videoQualityPreference = 'chunked';
                changed = true;
            }
            */

            // Add supported codecs to avoid IVS ads - this is safe
            if (!vars.supportedCodecs || !Array.isArray(vars.supportedCodecs)) {
                vars.supportedCodecs = ['av01', 'avc1', 'vp9', 'hev1', 'hvc1'];
                changed = true;
            }

            // DISABLED: These parameters often cause integrity check failures
            // if (vars.realtime !== false) {
            //     vars.realtime = false;
            //     changed = true;
            // }

            // if (vars.useReruns !== false) {
            //     vars.useReruns = false;
            //     changed = true;
            // }

            // if (vars.allowSource !== true) {
            //     vars.allowSource = true;
            //     changed = true;
            // }

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
            const cookieSelectors = CONFIG.ADVANCED.COOKIE_CONSENT_SELECTORS;
            let additionalSelectors = [];

            if (!CONFIG.SETTINGS.CONSERVATIVE_DOM_REMOVAL) {
                additionalSelectors = [
                    '[data-test-selector*="ad-overlay"]',
                    '.ad-banner',
                    '.ad-container',
                    '.ad-overlay'
                ];
            }

            const allSelectors = [...baseSelectors, ...cookieSelectors, ...additionalSelectors];
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

/* IVS-specific ad blocking */
[class*="ivs-ad"], [id*="ivs-ad"] {
    display: none !important;
    visibility: hidden !important;
}

[class*="amazon-ivs"], [class*="amzn-ivs"] {
    display: none !important;
}

/* Additional IVS elements */
.ivs-ad-container,
.ivs-ad-overlay,
.ivs-ad-slate,
.ivs-ad-title-card,
.ivs-ad-skip-button,
.ivs-ad-linear,
.ivs-linear-ad {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    position: absolute !important;
    left: -9999px !important;
}

/* Block IVS ad overlays */
div[class*="ivs"][class*="ad"],
div[id*="ivs"][id*="ad"] {
    display: none !important;
}
            `;

            GM_addStyle(css1);
            GM_addStyle(css2);
            // CSS injected successfully
        } catch (e) {
            log.error('CSS injection failed:', e);
        }
    };

    // ====== COOKIE CONSENT REMOVAL - OPTIMIZED ======
    const removeCookieBanners = (isDebugCheck = false) => {
        try {
            const selectors = CONFIG.ADVANCED.COOKIE_CONSENT_SELECTORS;
            let removedCount = 0;

            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (element && element.parentNode) {
                            if (CONFIG.SETTINGS.BATCH_DOM_REMOVAL) {
                                BatchDOMRemover.add(element);
                            } else {
                                element.parentNode.removeChild(element);
                            }
                            removedCount++;
                        }
                    });
                } catch (e) {
                    // Selector error
                }
            });

            // Also try to click accept buttons automatically
            const acceptButtons = [
                '[data-a-target="consent-banner-accept"]',
                'button[aria-label*="accept" i]',
                'button[aria-label*="agree" i]',
                'button[aria-label*="ok" i]',
                'button:contains("Accept")',
                'button:contains("Agree")',
                'button:contains("OK")'
            ];

            acceptButtons.forEach(selector => {
                try {
                    const buttons = document.querySelectorAll(selector);
                    buttons.forEach(button => {
                        if (button && !button.disabled) {
                            button.click();
                            removedCount++;
                        }
                    });
                } catch (e) {
                    // Ignore errors
                }
            });

            if (removedCount > 0 && !isDebugCheck) {
                log.debug(`Removed ${removedCount} cookie/consent banner elements`);
            }
        } catch (e) {
            log.error('Cookie banner removal error:', e);
        }
    };

    // ====== QUALITY FORCE MONITOR - ENHANCED ======
    const forceSourceQuality = async () => {
        if (!CONFIG.SETTINGS.FORCE_QUALITY) return;

        try {
            if (CONFIG.SETTINGS.ENHANCED_PLAYER_CONTROLS) {
                // Use the enhanced QualityManager
                await QualityManager.setQuality('chunked');
            } else {
                // Fallback to original method
                const qualitySelectors = [
                    '[data-a-target="player-settings-menu"]',
                    '[data-a-target="player-settings-quality"]',
                    '.tw-select',
                    '.player-menu__toggle',
                    '.quality-selector',
                    'button[aria-label*="quality" i]',
                    'button[aria-label*="качество" i]'
                ];

                for (const selector of qualitySelectors) {
                    const button = document.querySelector(selector);
                    if (button) {
                        // Found quality menu button, attempting to click
                        button.click();

                        // Wait a bit then look for chunked/source option
                        setTimeout(() => {
                            const qualityOptions = [
                                'button:contains("Source")',
                                'button:contains("Исходник")',
                                'button:contains("chunked")',
                                '[data-a-target="quality-option-chunked"]',
                                '[data-test-selector="quality-option-chunked"]',
                                '.tw-core-button:contains("chunked")',
                                '.tw-core-button:contains("Source")'
                            ];

                            for (const option of qualityOptions) {
                                try {
                                    const qualityButton = document.querySelector(option);
                                    if (qualityButton) {
                                        log.info('Found source quality option, clicking');
                                        qualityButton.click();
                                        return;
                                    }
                                } catch (e) {
                                    // Continue searching
                                }
                            }
                        }, 500);
                        break;
                    }
                }
            }
        } catch (e) {
            // Quality force error
        }
    };

    // ====== VIDEO PLAYER MONITOR - ENHANCED ======
    const setupPlayerMonitor = () => {
        try {
            const video = document.querySelector('video');
            if (!video) {
                // No video element found, will retry later
                return;
            }

            // Video player found, setting up enhanced monitor

            // Initialize volume tracker for smart unmute
            if (CONFIG.SETTINGS.SMART_UNMUTE_RESPECT_MANUAL) {
                VolumeTracker.init(video);
            }

            // Force source quality immediately
            forceSourceQuality();

            // Enhanced auto-unmute with manual mute respect
            if (CONFIG.SETTINGS.AUTO_UNMUTE) {
                const autoUnmute = () => {
                    try {
                        if (video && video.muted) {
                            if (CONFIG.SETTINGS.SMART_UNMUTE_RESPECT_MANUAL) {
                                if (VolumeTracker.shouldUnmute()) {
                                    log.info('Smart auto-unmuting video');
                                    VolumeTracker.restoreVolume(video);
                                }
                            } else {
                                log.info('Auto-unmuting video');
                                video.muted = false;
                                video.volume = Math.max(video.volume, 0.5);
                            }
                        }
                    } catch (e) {
                        log.error('Auto-unmute error:', e);
                    }
                };

                video.addEventListener('playing', autoUnmute, { once: true });
                video.addEventListener('loadeddata', autoUnmute, { once: true });
            }

            // Enhanced playback restoration with quality recovery
            if (CONFIG.SETTINGS.RESTORE_ON_AD) {
                let adDetected = false;
                let retryCount = 0;
                const maxRetries = 3;

                const onStalled = () => {
                    try {
                        if (!adDetected) {
                            // Possible ad detected, attempting to restore playback
                            adDetected = true;
                            retryCount++;

                            if (retryCount <= maxRetries) {
                                setTimeout(() => {
                                    try {
                                        if (video && video.paused) {
                                            // Playback restore attempt
                                            video.play().catch(() => {});
                                            
                                            // Restore quality after ad
                                            if (CONFIG.SETTINGS.AUTO_QUALITY_RESTORE) {
                                                setTimeout(() => {
                                                    QualityManager.restoreQuality();
                                                }, CONFIG.QUALITY_SETTINGS.QUALITY_RESTORE_DELAY);
                                            }
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

            // Enhanced quality monitoring with debouncing
            const qualityCheckFunction = CONFIG.SETTINGS.DEBOUNCED_OBSERVERS 
                ? debounce(() => {
                    forceSourceQuality();
                    if (CONFIG.SETTINGS.AUTO_QUALITY_RESTORE) {
                        QualityManager.restoreQuality();
                    }
                }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY)
                : () => {
                    forceSourceQuality();
                    if (CONFIG.SETTINGS.AUTO_QUALITY_RESTORE) {
                        QualityManager.restoreQuality();
                    }
                };

            const qualityCheckInterval = setInterval(qualityCheckFunction, CONFIG.QUALITY_SETTINGS.QUALITY_CHECK_INTERVAL);

            // Store interval ID to clear it later if needed
            video._qualityCheckInterval = qualityCheckInterval;

            // Stream change detection for quality restoration
            if (CONFIG.SETTINGS.SMART_QUALITY_PERSISTENCE) {
                const streamChangeObserver = new MutationObserver(debounce((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                            // Stream change detected, restoring quality
                            setTimeout(() => {
                                QualityManager.restoreQuality();
                            }, 2000);
                            break;
                        }
                    }
                }, CONFIG.PERFORMANCE.OBSERVER_THROTTLE));

                streamChangeObserver.observe(video, {
                    attributes: true,
                    attributeFilter: ['src']
                });

                video._streamChangeObserver = streamChangeObserver;
            }
        } catch (error) {
            log.error('Player monitor setup error:', error);
        }
    };

    // ====== INITIALIZATION ======
    const initialize = () => {
        try {
            log.info(`Starting Twitch Adblock Ultimate v${CONFIG.SCRIPT_VERSION}`);

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
                // Fetch override installed
            } catch (e) {
                log.error('✗ Fetch override failed:', e);
            }

            try {
                unsafeWindow.XMLHttpRequest = XHROverride;
                // XHR override installed
            } catch (e) {
                log.error('✗ XHR override failed:', e);
            }

            try {
                unsafeWindow.WebSocket = WebSocketOverride;
                // WebSocket override installed (chat-safe)
            } catch (e) {
                log.error('✗ WebSocket override failed:', e);
            }

            // Inject CSS
            injectCSS();

            // Remove cookie banners immediately
            removeCookieBanners();

            // Setup periodic cookie banner removal (every 10 seconds for first 60 seconds)
            let bannerCheckCount = 0;
            const bannerCheckInterval = setInterval(() => {
                removeCookieBanners(true); // Use debug mode to reduce log spam
                bannerCheckCount++;
                if (bannerCheckCount >= 6) { // 6 times * 10 seconds = 60 seconds total
                    clearInterval(bannerCheckInterval);
                }
            }, 10000); // Check every 10 seconds instead of 2

            // Setup enhanced MutationObserver for dynamic cookie banners
            if (typeof MutationObserver !== 'undefined') {
                // Throttle to prevent excessive calls
                let lastBannerCheck = 0;
                const THROTTLE_INTERVAL = 2000; // 2 seconds

                const bannerCheckFunction = CONFIG.SETTINGS.DEBOUNCED_OBSERVERS
                    ? debounce(() => {
                        const now = Date.now();
                        if (now - lastBannerCheck >= THROTTLE_INTERVAL) {
                            lastBannerCheck = now;
                            removeCookieBanners(true); // Use debug mode
                        }
                    }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY)
                    : () => {
                        const now = Date.now();
                        if (now - lastBannerCheck >= THROTTLE_INTERVAL) {
                            lastBannerCheck = now;
                            setTimeout(() => removeCookieBanners(true), 500); // Use debug mode
                        }
                    };

                const bannerObserver = new MutationObserver((mutations) => {
                    let shouldCheck = false;
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            for (let node of mutation.addedNodes) {
                                if (node.nodeType === 1) { // ELEMENT_NODE
                                    const text = node.textContent || '';
                                    const className = node.className || '';
                                    const id = node.id || '';

                                    // Safe string checks
                                    const classNameStr = typeof className === 'string' ? className : '';
                                    const idStr = typeof id === 'string' ? id : '';

                                    if (text.toLowerCase().includes('cookie') ||
                                        text.toLowerCase().includes('consent') ||
                                        text.toLowerCase().includes('gdpr') ||
                                        classNameStr.toLowerCase().includes('cookie') ||
                                        classNameStr.toLowerCase().includes('consent') ||
                                        idStr.toLowerCase().includes('cookie') ||
                                        idStr.toLowerCase().includes('consent')) {
                                        shouldCheck = true;
                                        break;
                                    }
                                }
                            }
                        }
                    });
                    if (shouldCheck) {
                        bannerCheckFunction();
                    }
                });

                bannerObserver.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'id']
                });
            }

            // Setup IVS ad observer for dynamic elements
            if (typeof MutationObserver !== 'undefined') {
                let lastIVSCheck = 0;
                const IVS_THROTTLE_INTERVAL = 1000; // 1 second

                const ivsCheckFunction = debounce(() => {
                    const now = Date.now();
                    if (now - lastIVSCheck >= IVS_THROTTLE_INTERVAL) {
                        lastIVSCheck = now;
                        // Remove IVS ad elements
                        CONFIG.ADVANCED.AD_DOM_SELECTORS.forEach(selector => {
                            try {
                                const elements = document.querySelectorAll(selector);
                                elements.forEach(element => {
                                    if (element && element.parentNode) {
                                        if (CONFIG.SETTINGS.BATCH_DOM_REMOVAL) {
                                            BatchDOMRemover.add(element);
                                        } else {
                                            element.parentNode.removeChild(element);
                                        }
                                    }
                                });
                            } catch (e) {
                                // Ignore selector errors
                            }
                        });
                    }
                }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);

                const ivsObserver = new MutationObserver((mutations) => {
                    let shouldCheck = false;
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            for (let node of mutation.addedNodes) {
                                if (node.nodeType === 1) { // ELEMENT_NODE
                                    const className = node.className || '';
                                    const id = node.id || '';
                                    const classNameStr = typeof className === 'string' ? className : '';
                                    const idStr = typeof id === 'string' ? id : '';

                                    if (classNameStr.toLowerCase().includes('ivs') ||
                                        classNameStr.toLowerCase().includes('amazon') ||
                                        idStr.toLowerCase().includes('ivs') ||
                                        idStr.toLowerCase().includes('amazon')) {
                                        shouldCheck = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'id')) {
                            const attrValue = mutation.target[mutation.attributeName] || '';
                            if (typeof attrValue === 'string' &&
                                (attrValue.toLowerCase().includes('ivs') ||
                                 attrValue.toLowerCase().includes('amazon') ||
                                 attrValue.toLowerCase().includes('ad'))) {
                                shouldCheck = true;
                            }
                        }
                    });
                    if (shouldCheck) {
                        ivsCheckFunction();
                    }
                });

                ivsObserver.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'id']
                });
            }

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
        } catch (error) {
            log.error('✗ Initialization failed:', error);
            if (isDebug) {
                console.error(`${LOG_PREFIX} Failed to initialize enhanced features!`, error);
            }
        }
    };

    // Enhanced cleanup for better memory management
    const cleanup = () => {
        try {
            // Clear quality cache if expired
            if (CONFIG.SETTINGS.QUALITY_CACHE_ENABLED) {
                QualityCache.clear();
            }

            // Clear intervals
            const video = document.querySelector('video');
            if (video) {
                if (video._qualityCheckInterval) {
                    clearInterval(video._qualityCheckInterval);
                }
                if (video._streamChangeObserver) {
                    video._streamChangeObserver.disconnect();
                }
            }

            // Enhanced cleanup completed
        } catch (e) {
            log.debug('Cleanup error:', e);
        }
    };

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
