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
    const CONFIG = {
        SCRIPT_VERSION: '32.2.0',
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
            SKIP_AGGRESSIVE_BLOCKING: GM_getValue('TTV_SkipAggressive', false),
            ENABLE_DEBUG: GM_getValue('TTV_EnableDebug', false),
            
            // Enhanced features from history
            SMART_QUALITY_PERSISTENCE: GM_getValue('TTV_SmartQualityPersistence', true),
            DEBOUNCED_OBSERVERS: GM_getValue('TTV_DebouncedObservers', true),
            ENHANCED_PLAYER_CONTROLS: GM_getValue('TTV_EnhancedPlayerControls', true),
            PERFORMANCE_MODE: GM_getValue('TTV_PerformanceMode', false),
            QUALITY_CACHE_ENABLED: GM_getValue('TTV_QualityCacheEnabled', true),
            AUTO_QUALITY_RESTORE: GM_getValue('TTV_AutoQualityRestore', true),
            SMART_UNMUTE_RESPECT_MANUAL: GM_getValue('TTV_SmartUnmuteRespectManual', true),
            BATCH_DOM_REMOVAL: GM_getValue('TTV_BatchDOMRemoval', true),
        },
        ADVANCED: {
            // More precise patterns - only block ACTUAL ad endpoints
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
                // Commercial breaks
                '[data-test-selector="commercial-break-in-progress"]',
                '.ad-interrupt-screen',
                '.commercial-break-in-progress',
                '.player-ad-notice',
                // Stream display ads
                '.stream-display-ad__wrapper',
                '.stream-display-ad__container',
                '.stream-display-ad',
                // IVS ads
                '.ivs-ad-container',
                '.ivs-ad-overlay',
                '.ivs-ad-container__overlay',
                // Video player ads
                '[data-a-target="player-ad-label"]',
                '.player-ad-overlay',
                '.player-ad-overlay--linear',
                '.player-ad-ui',
                '.video-chat__containercommercial-break',
                // Cookie/GDPR consent banners
                '.consent-banner',
                '.gdpr-consent-banner',
                '[data-a-target="consent-banner-accept"]',
                '.cookie-consent',
                '.cookie-banner',
                '#consent-banner',
                '.gdpr-banner',
                // Popups and overlays
                '[role="dialog"][aria-label*="ad" i]',
                '[aria-label*="advertisement" i]',
                '[aria-label*="commercial" i]',
            ],
            // Cookie/GDPR consent selectors
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
        // Enhanced features configuration
        QUALITY_SETTINGS: {
            PREFERRED_QUALITIES: ['chunked', '1080p60', '1080p30', '720p60', '720p30', '480p30', '360p30', '160p30'],
            QUALITY_CHECK_INTERVAL: CONFIG.SETTINGS.PERFORMANCE_MODE ? 15000 : 8000,
            QUALITY_RESTORE_DELAY: 2000,
            CACHE_EXPIRY: 3600000, // 1 hour
        },
        PERFORMANCE: {
            DEBOUNCE_DELAY: CONFIG.SETTINGS.PERFORMANCE_MODE ? 500 : 200,
            BATCH_SIZE: 10,
            OBSERVER_THROTTLE: CONFIG.SETTINGS.PERFORMANCE_MODE ? 1000 : 300,
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
                const keys = GM_listValues?.() || [];
                keys.forEach(key => {
                    if (key.startsWith('TTV_QualityCache_')) {
                        GM_deleteValue(key);
                    }
                });
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

            // Force embed player to avoid ads
            if (vars.playerType !== 'embed') {
                vars.playerType = 'embed';
                changed = true;
                // Forcing playerType to embed
            }

            // Ensure web platform
            if (vars.platform !== 'web') {
                vars.platform = 'web';
                changed = true;
                // Forcing platform to web
            }

            // AGGRESSIVE: Force source quality (chunked)
            if (vars.videoQualityPreference !== 'chunked') {
                vars.videoQualityPreference = 'chunked';
                changed = true;
                // Forcing video quality to chunked (source)
            }

            // Add additional quality preferences for more reliable source setting
            if (!vars.videoQualityDefault || vars.videoQualityDefault !== 'chunked') {
                vars.videoQualityDefault = 'chunked';
                changed = true;
            }

            if (!vars.videoPriorities || !Array.isArray(vars.videoPriorities) || !vars.videoPriorities.includes('chunked')) {
                vars.videoPriorities = ['chunked', '1080p60', '1080p30', '720p60', '720p30', '480p30', '360p30', '160p30'];
                changed = true;
            }

            // Add supported codecs to avoid IVS ads
            if (!vars.supportedCodecs || !Array.isArray(vars.supportedCodecs)) {
                vars.supportedCodecs = ['av01', 'avc1', 'vp9', 'hev1', 'hvc1'];
                changed = true;
                // Setting supported codecs
            }

            // Add additional parameters for better ad blocking
            if (vars.realtime !== false) {
                vars.realtime = false;
                changed = true;
            }

            if (vars.useReruns !== false) {
                vars.useReruns = false;
                changed = true;
            }

            if (vars.allowSource !== true) {
                vars.allowSource = true;
                changed = true;
            }

            // Ensure we get the highest quality
            if (typeof vars.lowLatency !== 'boolean') {
                vars.lowLatency = false;
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
            `;

            GM_addStyle(css1);
            GM_addStyle(css2);
            // CSS injected successfully
        } catch (e) {
            log.error('CSS injection failed:', e);
        }
    };

    // ====== COOKIE CONSENT REMOVAL - AGGRESSIVE ======
    const removeCookieBanners = () => {
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

            if (removedCount > 0) {
                log.info(`Removed ${removedCount} cookie/consent banner elements`);
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
            if (isDebug) {
                console.info(`\n${'='.repeat(60)}`);
                console.info(`${LOG_PREFIX} IMPROVED VERSION ${CONFIG.SCRIPT_VERSION}`);
                console.info(`${'='.repeat(60)}`);
                console.info(`${LOG_PREFIX} ✅ Chat protection: ENABLED`);
                console.info(`${LOG_PREFIX} ✅ Aggressive ad blocking: ENABLED`);
                console.info(`${LOG_PREFIX} ✅ Cookie banner removal: ENABLED`);
                console.info(`${LOG_PREFIX} ✅ M3U8 cleaning: ${CONFIG.SETTINGS.ENABLE_M3U8_CLEANING ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ GQL modification: ${CONFIG.SETTINGS.ENABLE_GQL_MODIFICATION ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Auto-unmute: ${CONFIG.SETTINGS.AUTO_UNMUTE ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ DOM cleanup: ${CONFIG.SETTINGS.ENABLE_DOM_CLEANUP ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Force Source quality: ${CONFIG.SETTINGS.FORCE_QUALITY ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Smart quality persistence: ${CONFIG.SETTINGS.SMART_QUALITY_PERSISTENCE ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Debounced observers: ${CONFIG.SETTINGS.DEBOUNCED_OBSERVERS ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Enhanced player controls: ${CONFIG.SETTINGS.ENHANCED_PLAYER_CONTROLS ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Auto quality restore: ${CONFIG.SETTINGS.AUTO_QUALITY_RESTORE ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Smart unmute (respect manual): ${CONFIG.SETTINGS.SMART_UNMUTE_RESPECT_MANUAL ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Batch DOM removal: ${CONFIG.SETTINGS.BATCH_DOM_REMOVAL ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Quality caching: ${CONFIG.SETTINGS.QUALITY_CACHE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${LOG_PREFIX} ✅ Performance mode: ${CONFIG.SETTINGS.PERFORMANCE_MODE ? 'ENABLED' : 'DISABLED'}`);
                console.info(`${'='.repeat(60)}\n`);
            }

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

            // Setup periodic cookie banner removal (every 2 seconds for first 30 seconds)
            let bannerCheckCount = 0;
            const bannerCheckInterval = setInterval(() => {
                removeCookieBanners();
                bannerCheckCount++;
                if (bannerCheckCount >= 15) {
                    clearInterval(bannerCheckInterval);
                }
            }, 2000);

            // Setup enhanced MutationObserver for dynamic cookie banners
            if (typeof MutationObserver !== 'undefined') {
                const bannerCheckFunction = CONFIG.SETTINGS.DEBOUNCED_OBSERVERS
                    ? debounce(() => {
                        removeCookieBanners();
                    }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY)
                    : () => {
                        removeCookieBanners();
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
                                    
                                    if (text.toLowerCase().includes('cookie') ||
                                        text.toLowerCase().includes('consent') ||
                                        text.toLowerCase().includes('gdpr') ||
                                        className.toLowerCase().includes('cookie') ||
                                        className.toLowerCase().includes('consent') ||
                                        id.toLowerCase().includes('cookie') ||
                                        id.toLowerCase().includes('consent')) {
                                        shouldCheck = true;
                                        break;
                                    }
                                }
                            }
                        }
                    });
                    if (shouldCheck) {
                        if (CONFIG.SETTINGS.DEBOUNCED_OBSERVERS) {
                            bannerCheckFunction();
                        } else {
                            setTimeout(removeCookieBanners, 500);
                        }
                    }
                });

                bannerObserver.observe(document.body || document.documentElement, {
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

            log.info('✓ Initialization complete');
            if (isDebug) {
                console.info(`${LOG_PREFIX} Ready! Enjoy ad-free Twitch with enhanced features and working chat!\n`);
                console.info(`${LOG_PREFIX} 🚀 Enhanced features: Smart quality persistence, performance optimization, and intelligent controls activated.\n`);
            }
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
