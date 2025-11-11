// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      33.1.2
// @description  Twitch ad-blocking with performance optimizations and context fix
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
        SCRIPT_VERSION: '33.1.2',
        SETTINGS,
        ADVANCED: {
            AD_SERVER_DOMAINS: [
                'edge.ads.twitch.tv',
                'ads.ttvnw.net',
                'ad.twitch.tv',
                'poster.ad.twitch.tv',
                'video.ad.twitch.tv',
                'stream-display-ad.twitch.tv',
                'samsung-ads.com',
                'doubleclick.net',
                'googlesyndication.com',
                'googletagservices.com',
                'googleadservices.com',
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
                'mcs.zemanta.com',
                'rc.rlcdn.com',
                'events.lastsecondmedia.com',
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
            // Chat DOM selectors - NEVER interact with these
            CHAT_SELECTORS: [
                '[data-a-target="chat-input"]',
                '[data-a-target="chat-message"]',
                '[data-a-target="chat-welcome-message"]',
                '[data-a-target="chat-room-selector"]',
                '[data-a-target="chat-badge"]',
                '[data-test-selector*="chat"]',
                '.chat-scrollable-area__message-container',
                '.chat-line__message',
                '.chat-line__username',
                '.chat-input',
                '.chat-wysiwyg-input',
                '.stream-chat',
                '[class*="chat-line"]',
                '[class*="chat-room"]',
                '[class*="chat-input"]',
                '[class*="chat-message"]',
                '[data-a-target*="chat"]',
                '[data-test-selector*="chat"]',
                '.thread-message-container',
                '[data-a-target="thread-message"]',
                '[role="log"]',
                'button[data-a-target*="reply"]',
                'button[aria-label*="reply" i]',
                'button[aria-label*="ответ" i]',
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
                'EXT-X-TWITCH-IS_LOOKHEAD',
                'EXT-X-TWITCH-IS',
                'EXT-X-AD',
                'EXT-X-AD-BREAK',
                'EXT-X-BIF',
                'EXT-X-CUE',
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
                '.stream-display-ad-pushdown',
                '.stream-display-ad-portal',
                '.ivs-ad-container',
                '.ivs-ad-overlay',
                '.ivs-ad-container__overlay',
                '.ivs-ad-container__pause-button',
                '.ivs-ad-slate',
                '.ivs-ad-title-card',
                '.ivs-ad-skip-button',
                '.ivs-ad-linear',
                '.ivs-linear-ad',
                '.ivs-ad-marker',
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
                // Pushdown ads
                '.pushdown-ad',
                '.pushdown-ad-container',
                '.pushdown-banner',
                // PSA (Public Service Ads)
                '.psa-banner',
                '.psa-container',
                // Extension ads
                '.extension-ad-container',
                '.extension-sponsored-content',
                // Bounty board ads
                '.bounty-board-ad',
                '.bounty-sponsored-card',
                // Community points sponsored
                '.sponsored-upsell',
                '.sponsored-content-card',
                // Bits/cheering sponsored
                '.bits-sponsored',
                '.cheering-sponsored-content',
                // Partner plus ads
                '.partner-plus-ad',
                '.upsell-banner',
                // Cookie consent
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
            PREFERRED_QUALITIES: ['chunked'],
            QUALITY_CHECK_INTERVAL: SETTINGS.PERFORMANCE_MODE ? 500 : 200,
            QUALITY_RESTORE_DELAY: 50,
            CACHE_EXPIRY: 3600000,
            AGGRESSIVE_MONITORING: true,
        },
        PERFORMANCE: {
            DEBOUNCE_DELAY: SETTINGS.PERFORMANCE_MODE ? 200 : 50,
            BATCH_SIZE: 10,
            OBSERVER_THROTTLE: SETTINGS.PERFORMANCE_MODE ? 500 : 100,
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

    // Check if element is part of chat - NEVER interact with chat elements
    const isChatElement = (element) => {
        if (!element) return false;
        
        try {
            // Check if element matches chat selectors
            for (const selector of CONFIG.ADVANCED.CHAT_SELECTORS) {
                if (element.matches && element.matches(selector)) {
                    return true;
                }
            }
            
            // Check if any parent matches chat selectors
            let parent = element.parentElement;
            while (parent) {
                for (const selector of CONFIG.ADVANCED.CHAT_SELECTORS) {
                    if (parent.matches && parent.matches(selector)) {
                        return true;
                    }
                }
                parent = parent.parentElement;
            }
            
            // Additional heuristics - check classes and attributes
            const className = element.className || '';
            const id = element.id || '';
            const dataTarget = element.getAttribute('data-a-target') || '';
            const testSelector = element.getAttribute('data-test-selector') || '';
            const ariaLabel = element.getAttribute('aria-label') || '';
            
            const classStr = typeof className === 'string' ? className.toLowerCase() : '';
            const idStr = typeof id === 'string' ? id.toLowerCase() : '';
            const dataStr = typeof dataTarget === 'string' ? dataTarget.toLowerCase() : '';
            const testStr = typeof testSelector === 'string' ? testSelector.toLowerCase() : '';
            const ariaStr = typeof ariaLabel === 'string' ? ariaLabel.toLowerCase() : '';
            
            // Check for chat-related text
            if (classStr.includes('chat') || 
                idStr.includes('chat') || 
                dataStr.includes('chat') || 
                testStr.includes('chat') ||
                ariaStr.includes('chat') ||
                ariaStr.includes('reply') ||
                ariaStr.includes('ответ')) {
                return true;
            }
            
            return false;
        } catch (e) {
            // If error, assume it might be chat to be safe
            return true;
        }
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

    // Enhanced URL pattern matching for ad detection
    const isLikelyAdUrl = (url) => {
        if (!url) return false;
        const urlLower = url.toLowerCase();

        const adPatterns = [
            /\/ads?\//i,
            /adserver/i,
            /sponsor/i,
            /commercial/i,
            /promotion/i,
            /upsell/i,
            /sponsored/i,
            /advertisement/i,
            /doubleclick/i,
            /googlesyndication/i,
            /amazon-adsystem/i,
            /criteo/i,
            /taboola/i,
            /outbrain/i,
            /stream-display-ad/i,
            /pushdown/i,
            /preroll/i,
            /midroll/i,
            /postroll/i,
            /bounty/i,
            /cheering/i,
            /bits/i,
            /partner[-\s]?plus/i,
            /extension/i,
            /community[-\s]?points/i,
            /hype[-\s]?train/i,
        ];

        return adPatterns.some(pattern => pattern.test(urlLower));
    };

    // ====== ENHANCED UTILITIES ======
    // Debounce utility for performance optimization
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = undefined;
                try {
                    func(...args);
                } catch (e) {
                    log.error('Debounce function error:', e);
                }
            };
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(later, wait);
        };
    };

    // Enhanced ad detection for embedded ad elements
    const detectEmbeddedAds = () => {
        const adIndicators = [
            // Class names
            /ad[-\s]?break/i,
            /commercial/i,
            /sponsor/i,
            /promotion/i,
            /upsell/i,
            /sponsored/i,
            /advertisement/i,
            /stream-display-ad/i,
            /pushdown/i,
            /preroll/i,
            /midroll/i,
            /postroll/i,
            /bounty/i,
            /cheering/i,
            /bits/i,
            /partner[-\s]?plus/i,
            /extension/i,
            /community[-\s]?points/i,
            /hype[-\s]?train/i,
            // IVS ads
            /ivs[-\s]?ad/i,
            /amazon[-\s]?ivs/i,
            /amzn[-\s]?ivs/i,
            // PSA (Public Service Ads)
            /psa/i,
            // Extension ads
            /extension[-\s]?ad/i,
            /extension[-\s]?sponsor/i,
            // Common ad patterns
            /google[-\s]?ad/i,
            /doubleclick/i,
            /googlesyndication/i,
        ];

        const suspiciousElements = [];

        try {
            // Check all divs and spans for ad-like classes
            const elements = document.querySelectorAll('div, span, section, article, aside, header, footer, nav, main, figure, picture');
            elements.forEach(el => {
                try {
                    if (!el || !el.className) {
                        return;
                    }

                    const className = el.className || '';
                    const id = el.id || '';
                    const text = el.textContent || '';
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    const dataTarget = el.getAttribute('data-a-target') || '';
                    const role = el.getAttribute('role') || '';

                    const combined = `${className} ${id} ${text} ${ariaLabel} ${dataTarget} ${role}`.toLowerCase();

                    adIndicators.forEach(pattern => {
                        if (pattern.test(combined)) {
                            if (!isChatElement(el) && !suspiciousElements.includes(el)) {
                                suspiciousElements.push(el);
                            }
                        }
                    });
                } catch (e) {
                    // Skip individual element errors
                }
            });
        } catch (e) {
            log.debug('Detect embedded ads error:', e);
        }

        return suspiciousElements;
    };

    // Aggressive embedded ad removal
    const removeEmbeddedAds = () => {
        try {
            const suspiciousElements = detectEmbeddedAds();
            let removedCount = 0;

            if (!suspiciousElements || suspiciousElements.length === 0) {
                return;
            }

            suspiciousElements.forEach(el => {
                try {
                    if (!el || !el.parentNode) {
                        return;
                    }

                    // Skip if element is already removed
                    if (!document.body.contains(el)) {
                        return;
                    }

                    // Additional check: if element has no children or very little content, likely an ad container
                    const hasMinimalContent = el.children.length === 0 ||
                                             (el.textContent && el.textContent.trim().length < 50);

                    // Also check if it has ad-related dimensions
                    const style = window.getComputedStyle(el);
                    const isHidden = style.display === 'none' || style.visibility === 'hidden';

                    // More aggressive: remove any element that matches ad patterns
                    // regardless of content, but skip if it's in a video player or chat
                    const isInVideoPlayer = el.closest('video, [data-a-target="player"]');
                    const isInChat = isChatElement(el);

                    // Remove if: minimal content OR hidden OR matches strong ad indicators
                    const className = (el.className || '').toLowerCase();
                    const hasStrongAdIndicators = className.includes('ad-') ||
                                               className.includes('commercial') ||
                                               className.includes('sponsor') ||
                                               className.includes('stream-display-ad');

                    if ((hasMinimalContent || isHidden || hasStrongAdIndicators) && !isInVideoPlayer && !isInChat) {
                        if (CONFIG.SETTINGS.BATCH_DOM_REMOVAL) {
                            BatchDOMRemover.add(el);
                        } else {
                            el.parentNode.removeChild(el);
                        }
                        removedCount++;
                    }
                } catch (e) {
                    // Skip errors silently
                }
            });

            if (removedCount > 0) {
                log.debug(`Aggressively removed ${removedCount} embedded ad elements`);
            }
        } catch (e) {
            log.debug('Embedded ad removal error:', e);
        }
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
            try {
                if (!element || isChatElement(element)) {
                    if (isChatElement(element)) {
                        log.debug('Skipping chat element from removal queue');
                    }
                    return;
                }

                if (!CONFIG.SETTINGS.BATCH_DOM_REMOVAL) {
                    this.removeNow(element);
                    return;
                }

                // Add to queue only if not already in queue
                if (!this.queue.includes(element)) {
                    this.queue.push(element);
                }
                this.initDebounce()();
            } catch (e) {
                log.debug('BatchDOMRemover add error:', e);
            }
        },

        removeNow(element) {
            try {
                if (element && !isChatElement(element) && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            } catch (e) {
                log.debug('Individual remove error:', e);
            }
        },

        scheduleProcess: null,

        initDebounce() {
            if (!this.scheduleProcess) {
                this.scheduleProcess = debounce(function() {
                    this.process();
                }.bind(this), CONFIG.PERFORMANCE.DEBOUNCE_DELAY);
            }
            return this.scheduleProcess;
        },

        process() {
            try {
                if (this.processing || this.queue.length === 0) return;

                this.processing = true;
                const batch = this.queue.splice(0, CONFIG.PERFORMANCE.BATCH_SIZE);

                requestAnimationFrame(() => {
                    batch.forEach(element => {
                        try {
                            if (element && !isChatElement(element) && element.parentNode) {
                                element.parentNode.removeChild(element);
                            }
                        } catch (e) {
                            log.debug('Batch remove error:', e);
                        }
                    });

                    this.processing = false;

                    if (this.queue.length > 0) {
                        this.initDebounce()();
                    }
                });
            } catch (e) {
                log.error('BatchDOMRemover process error:', e);
                this.processing = false;
            }
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
        
        reset() {
            this.lastCheck = 0;
        },


        getBestQuality() {
            // ALWAYS return chunked - never use other qualities
            return 'chunked';
        },

        async setQuality() {
            if (this.isChanging) return;
            this.isChanging = true;

            try {
                // Attempting to set quality to chunked

                // Open quality menu
                const settingsButton = document.querySelector('[data-a-target="player-settings-menu"]');
                if (settingsButton && !isChatElement(settingsButton)) {
                    settingsButton.click();
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // Click quality option
                    const qualityButton = document.querySelector('[data-a-target="player-settings-quality"]');
                    if (qualityButton && !isChatElement(qualityButton)) {
                        qualityButton.click();
                        await new Promise(resolve => setTimeout(resolve, 50));

                        // Find and click chunked quality - ONLY chunked
                        const qualityOptions = document.querySelectorAll('button[data-a-target*="quality-option"], .tw-select-option');
                        for (const option of qualityOptions) {
                            if (isChatElement(option)) continue; // Skip chat elements

                            const text = option.textContent?.trim() || option.getAttribute('aria-label') || '';
                            // ONLY match chunked/source - never auto or other qualities
                            if ((text.toLowerCase().includes('chunked') || text.toLowerCase().includes('source') || text.toLowerCase().includes('исходник')) &&
                                !text.toLowerCase().includes('auto') &&
                                !text.toLowerCase().includes('авто')) {
                                option.click();
                                this.currentQuality = 'chunked';

                                // Cache the preference
                                if (CONFIG.SETTINGS.SMART_QUALITY_PERSISTENCE) {
                                    QualityCache.set('preferredQuality', 'chunked');
                                }

                                log.info(`Quality forcefully set to: chunked`);
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

        async restoreQuality(force = false) {
            if (!CONFIG.SETTINGS.AUTO_QUALITY_RESTORE) return;

            const now = Date.now();
            if (!force && now - this.lastCheck < CONFIG.QUALITY_SETTINGS.QUALITY_CHECK_INTERVAL) return;
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

            // Also block using pattern matching for additional ad URLs
            if (CONFIG.SETTINGS.ENABLE_AD_SERVER_BLOCKING && isLikelyAdUrl(requestUrl)) {
                log.info('Blocked ad URL (pattern match):', requestUrl);
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
                            newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                            newHeaders.set('Pragma', 'no-cache');
                            newHeaders.set('Expires', '0');
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

            // Block analytics and tracking services that feed ads
            if (requestUrl.includes('newrelic.com') ||
                requestUrl.includes('segment.com') ||
                requestUrl.includes('mixpanel.com') ||
                requestUrl.includes('hotjar.com') ||
                requestUrl.includes('fullstory.com') ||
                requestUrl.includes('clarity.ms') ||
                requestUrl.endsWith('/events') ||
                requestUrl.includes('/analytics/') ||
                requestUrl.includes('/track/') ||
                requestUrl.includes('/collect') ||
                requestUrl.includes('/beacon') ||
                requestUrl.includes('/pixel') ||
                isLikelyAdUrl(requestUrl)) {
                log.info('Blocked tracking/analytics/ad service:', requestUrl);
                return new Response(null, { status: 204, statusText: 'Blocked' });
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

                // Ultra-aggressive: check for ad URLs in segment paths
                if (line && !line.startsWith('#')) {
                    const isAdSegment = line.includes('ad') ||
                                      line.includes('sponsor') ||
                                      line.includes('commercial') ||
                                      line.includes('preroll') ||
                                      line.includes('midroll') ||
                                      line.includes('postroll');

                    if (isAdSegment) {
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

            try {
                // Force embed player to avoid ads - this is the key to blocking ads
                if (vars.playerType !== 'embed') {
                    vars.playerType = 'embed';
                    changed = true;
                    log.debug('Modified playerType to embed');
                }

                // Ensure web platform
                if (vars.platform !== 'web') {
                    vars.platform = 'web';
                    changed = true;
                    log.debug('Modified platform to web');
                }

                // Force HLS mediaplayer backend to avoid IVS ads pipeline
                // This is critical for blocking ads across country changes
                if (vars.playerBackend !== 'mediaplayer') {
                    vars.playerBackend = 'mediaplayer';
                    changed = true;
                    log.debug('Modified playerBackend to mediaplayer');
                }

                // Force chunked quality - ALWAYS
                vars.videoQualityPreference = 'chunked';
                changed = true;
                log.debug('Forcefully set videoQualityPreference to chunked');

                // Add supported codecs to avoid IVS ads - normalize and extend
                const preferredCodecs = ['av1', 'h265', 'h264', 'vp9', 'av01', 'avc1', 'hev1', 'hvc1'];
                const currentCodecs = Array.isArray(vars.supportedCodecs) ? vars.supportedCodecs : [];
                const codecSet = new Set();
                preferredCodecs.forEach(codec => codecSet.add(codec));
                currentCodecs.forEach(codec => codecSet.add(codec));
                const normalizedCodecs = Array.from(codecSet);

                if (!Array.isArray(vars.supportedCodecs) ||
                    vars.supportedCodecs.length !== normalizedCodecs.length ||
                    !normalizedCodecs.every((codec, index) => vars.supportedCodecs[index] === codec)) {
                    vars.supportedCodecs = normalizedCodecs;
                    changed = true;
                    log.debug('Modified supportedCodecs');
                }

                // Remove ad-related parameters that Twitch may inject
                // These can be added when switching countries or connections
                if (Object.prototype.hasOwnProperty.call(vars, 'adblock')) {
                    delete vars.adblock;
                    changed = true;
                    log.debug('Removed adblock parameter');
                }

                if (Object.prototype.hasOwnProperty.call(vars, 'adsEnabled')) {
                    delete vars.adsEnabled;
                    changed = true;
                    log.debug('Removed adsEnabled parameter');
                }

                // Remove any geo-specific ad parameters that can bypass blocking
                const geoKeys = ['geoblock', 'geoBlock', 'geoBlocked', 'geoRestrictions', 'geoEnabled'];
                geoKeys.forEach((key) => {
                    if (Object.prototype.hasOwnProperty.call(vars, key)) {
                        delete vars[key];
                        changed = true;
                        log.debug(`Removed ${key} parameter`);
                    }
                });

                // Force ad blockers on
                vars.adblockEnabled = true;
                vars.adblock = true;
                vars.adsBlocked = true;
                changed = true;
                log.debug('Force-enabled adblock parameters');

                // Set quality options to prevent ad-based quality changes
                vars.enableAutoQuality = false;
                vars.enforceVideoQuality = true;
                changed = true;
                log.debug('Set quality enforcement options');
            } catch (e) {
                log.error('Variable modification error:', e);
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
                    '.ad-overlay',
                    // Additional aggressive selectors
                    '[class*="ad-"]',
                    '[id*="ad-"]',
                    '[class*="-ad"]',
                    '[id*="-ad"]',
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
    height: 0 !important;
    width: 0 !important;
    position: absolute !important;
    left: -9999px !important;
    pointer-events: none !important;
}
            `;

            const css2 = `
${selectorChunk2.join(',\n')} {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    position: absolute !important;
    left: -9999px !important;
    pointer-events: none !important;
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
    height: 0 !important;
    width: 0 !important;
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

/* Aggressive ad pattern blocking */
[class*="ad"][class*="break"],
[class*="commercial"],
[class*="sponsor"],
[class*="promo"] {
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
                        if (button && !button.disabled && !isChatElement(button)) {
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
                    if (button && !isChatElement(button)) {
                        // Found quality menu button, attempting to click
                        button.click();

                        // Wait a bit then look for chunked/source option
                        setTimeout(() => {
                            const qualityOptions = document.querySelectorAll('button[data-a-target*="quality-option"], .tw-select-option, [data-test-selector*="quality-option"]');

                            for (const option of qualityOptions) {
                                if (isChatElement(option)) continue;

                                try {
                                    const text = option.textContent?.trim() || option.getAttribute('aria-label') || '';
                                    if (text.toLowerCase().includes('chunked') || text.toLowerCase().includes('source') || text.toLowerCase().includes('исходник')) {
                                        log.info('Found source quality option (fallback), clicking');
                                        option.click();
                                        return;
                                    }
                                } catch (error) {
                                    // Continue searching
                                }
                            }
                        }, 100);
                        break;
                    }
                }
            }
        } catch (e) {
            // Quality force error
        }
    };

    const VisibilityManager = {
        initialized: false,
        lastTrigger: 0,
        boundVisibilityChange: null,
        boundFocus: null,
        boundResume: null,

        trigger(force = false) {
            const now = Date.now();
            if (!force && now - this.lastTrigger < CONFIG.QUALITY_SETTINGS.QUALITY_CHECK_INTERVAL) {
                return;
            }

            this.lastTrigger = now;
            QualityManager.reset();

            try {
                const forcePromise = forceSourceQuality();
                if (forcePromise && typeof forcePromise.then === 'function') {
                    forcePromise.catch(() => {});
                }
            } catch (error) {
                log.debug('VisibilityManager forceSourceQuality error:', error);
            }

            try {
                const restorePromise = QualityManager.restoreQuality(true);
                if (restorePromise && typeof restorePromise.then === 'function') {
                    restorePromise.catch(() => {});
                }
            } catch (error) {
                log.debug('VisibilityManager restoreQuality error:', error);
            }
        },

        handleVisibilityChange() {
            if (!document.hidden) {
                this.trigger(true);
            }
        },

        handleFocus() {
            this.trigger(true);
        },

        handleResume() {
            this.trigger(true);
        },

        init() {
            if (this.initialized) return;

            this.boundVisibilityChange = this.handleVisibilityChange.bind(this);
            this.boundFocus = this.handleFocus.bind(this);
            this.boundResume = this.handleResume.bind(this);

            document.addEventListener('visibilitychange', this.boundVisibilityChange, { passive: true });
            window.addEventListener('focus', this.boundFocus, { passive: true });
            window.addEventListener('pageshow', this.boundResume, { passive: true });

            this.initialized = true;
        },

        cleanup() {
            if (!this.initialized) return;

            document.removeEventListener('visibilitychange', this.boundVisibilityChange);
            window.removeEventListener('focus', this.boundFocus);
            window.removeEventListener('pageshow', this.boundResume);

            this.boundVisibilityChange = null;
            this.boundFocus = null;
            this.boundResume = null;
            this.initialized = false;
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

            // Aggressive ad element detection on video events
            const adDetectionEvents = ['loadstart', 'loadeddata', 'playing', 'progress', 'stalled', 'waiting', 'suspend', 'abort', 'error'];
            adDetectionEvents.forEach(eventType => {
                video.addEventListener(eventType, () => {
                    // When video shows signs of ad loading, aggressively clean up
                    if (eventType === 'stalled' || eventType === 'waiting' || eventType === 'suspend') {
                        setTimeout(() => {
                            removeEmbeddedAds();
                            // Also clean M3U8 cache if exists
                            const allSources = document.querySelectorAll('source[src*=".m3u8"]');
                            allSources.forEach(source => {
                                if (source.src && source.src.includes('usher.ttvnw.net')) {
                                    // Force reload by clearing and re-setting
                                    const parentVideo = source.parentElement;
                                    if (parentVideo && parentVideo.tagName === 'VIDEO') {
                                        const currentSrc = parentVideo.currentSrc;
                                        if (currentSrc) {
                                            parentVideo.load(); // Force reload
                                        }
                                    }
                                }
                            });
                        }, 100);
                    }
                }, { passive: true });
            });

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
                                                    QualityManager.restoreQuality(true);
                                                }, CONFIG.QUALITY_SETTINGS.QUALITY_RESTORE_DELAY);
                                            }
                                        }
                                        adDetected = false;
                                    } catch (e) {
                                        log.error('Play attempt error:', e);
                                    }
                                }, 300 * retryCount); // Accelerated exponential backoff
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

            // IMMEDIATE quality restoration on any player event
            const qualityEvents = ['loadedmetadata', 'loadeddata', 'playing', 'progress', 'canplay', 'canplaythrough'];
            qualityEvents.forEach(eventType => {
                video.addEventListener(eventType, () => {
                    // Force chunked quality immediately on any player event
                    setTimeout(() => {
                        QualityManager.setQuality();
                    }, 25);
                }, { passive: true });
            });

            // Ultra-aggressive quality monitoring - checks every 200ms
            const qualityCheckFunction = () => {
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
                                QualityManager.restoreQuality(true);
                            }, 200);
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

            // AGGRESSIVE: Watch for any DOM changes related to quality settings
            const qualityDOMObserver = new MutationObserver((mutations) => {
                let shouldCheckQuality = false;
                mutations.forEach((mutation) => {
                    // Watch for quality menu changes
                    if (mutation.type === 'childList' || mutation.type === 'attributes') {
                        const target = mutation.target;
                        const className = target.className || '';
                        const dataTarget = target.getAttribute('data-a-target') || '';
                        const textContent = target.textContent || '';

                        if ((className && className.toString().toLowerCase().includes('quality')) ||
                            (dataTarget && dataTarget.toLowerCase().includes('quality')) ||
                            (textContent && (textContent.toLowerCase().includes('1080p') || textContent.toLowerCase().includes('720p') || textContent.toLowerCase().includes('480p') || textContent.toLowerCase().includes('360p')))) {
                            shouldCheckQuality = true;
                        }
                    }
                });

                if (shouldCheckQuality) {
                    // Immediately force chunked quality
                    setTimeout(() => {
                        QualityManager.setQuality();
                    }, 50);
                }
            });

            qualityDOMObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'data-a-target', 'textContent']
            });

            video._qualityDOMObserver = qualityDOMObserver;
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

            // Run aggressive embedded ad removal immediately
            removeEmbeddedAds();

            // Setup periodic cookie banner removal (reduced frequency for performance)
            let bannerCheckCount = 0;
            const bannerCheckInterval = setInterval(() => {
                try {
                    removeCookieBanners(true); // Use debug mode to reduce log spam
                } catch (e) {
                    log.debug('Banner check error:', e);
                }
                bannerCheckCount++;
                if (bannerCheckCount >= 6) { // Runs for ~18 seconds total
                    clearInterval(bannerCheckInterval);
                }
            }, 5000); // Check every 5 seconds for better performance

            // Setup enhanced MutationObserver for dynamic cookie banners
            if (typeof MutationObserver !== 'undefined') {
                // Throttle to prevent excessive calls
                let lastBannerCheck = 0;
                const THROTTLE_INTERVAL = 500; // Faster response to new banners

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
                        setTimeout(() => removeCookieBanners(true), 100); // Rapid follow-up check
                    }
                };

                const bannerObserver = new MutationObserver((mutations) => {
                    let shouldCheck = false;
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            for (let node of mutation.addedNodes) {
                                if (node.nodeType === 1) { // ELEMENT_NODE
                                    // Skip chat elements
                                    if (isChatElement(node)) continue;
                                    
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
                const IVS_THROTTLE_INTERVAL = 200; // Faster cleanup for IVS ad elements

                const ivsCheckFunction = debounce(() => {
                    const now = Date.now();
                    if (now - lastIVSCheck >= IVS_THROTTLE_INTERVAL) {
                        lastIVSCheck = now;
                        // Remove IVS ad elements
                        CONFIG.ADVANCED.AD_DOM_SELECTORS.forEach(selector => {
                            try {
                                const elements = document.querySelectorAll(selector);
                                elements.forEach(element => {
                                    if (element && !isChatElement(element) && element.parentNode) {
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

                        // Also run aggressive embedded ad removal
                        removeEmbeddedAds();
                    }
                }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);

                const ivsObserver = new MutationObserver((mutations) => {
                    let shouldCheck = false;
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            for (let node of mutation.addedNodes) {
                                if (node.nodeType === 1) { // ELEMENT_NODE
                                    // Skip chat elements
                                    if (isChatElement(node)) continue;

                                    const className = node.className || '';
                                    const id = node.id || '';
                                    const classNameStr = typeof className === 'string' ? className : '';
                                    const idStr = typeof id === 'string' ? id : '';

                                    if (classNameStr.toLowerCase().includes('ivs') ||
                                        classNameStr.toLowerCase().includes('amazon') ||
                                        classNameStr.toLowerCase().includes('ad') ||
                                        classNameStr.toLowerCase().includes('sponsor') ||
                                        classNameStr.toLowerCase().includes('promo') ||
                                        idStr.toLowerCase().includes('ivs') ||
                                        idStr.toLowerCase().includes('amazon') ||
                                        idStr.toLowerCase().includes('ad')) {
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
                                 attrValue.toLowerCase().includes('ad') ||
                                 attrValue.toLowerCase().includes('sponsor') ||
                                 attrValue.toLowerCase().includes('promo'))) {
                                // Skip chat elements
                                if (isChatElement(mutation.target)) {
                                    return;
                                }
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

            // Setup aggressive embedded ad removal interval (reduced frequency for performance)
            const embeddedAdInterval = setInterval(() => {
                try {
                    removeEmbeddedAds();
                } catch (e) {
                    log.debug('Embedded ad interval error:', e);
                }
            }, 5000); // Check every 5 seconds for embedded ads (optimized frequency)

            // Additional aggressive cleanup on page visibility changes
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    // Page became visible - run all cleanup routines
                    setTimeout(() => {
                        removeEmbeddedAds();
                        removeCookieBanners(true);
                    }, 100);
                }
            }, { passive: true });

            // Initialize VisibilityManager for aggressive quality restoration
            try {
                VisibilityManager.init();
                log.info('VisibilityManager initialized - quality will be restored on tab focus/visibility changes');
            } catch (e) {
                log.error('VisibilityManager initialization failed:', e);
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
            }, 500);
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
                if (video._qualityDOMObserver) {
                    video._qualityDOMObserver.disconnect();
                }
            }

            // Clear embedded ad interval
            if (typeof embeddedAdInterval !== 'undefined') {
                clearInterval(embeddedAdInterval);
            }

            // Clear banner check interval
            if (typeof bannerCheckInterval !== 'undefined') {
                clearInterval(bannerCheckInterval);
            }

            try {
                VisibilityManager.cleanup();
            } catch (error) {
                log.debug('VisibilityManager cleanup error:', error);
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
