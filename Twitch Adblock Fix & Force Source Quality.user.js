// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      35.2.1
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

(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    // Debug and performance settings
    DEBUG: GM_getValue('TTV_EnableDebug', false),
    PERFORMANCE_MODE: GM_getValue('TTV_PerformanceMode', false),

    // Core features
    SWITCH_FIX: true,
    FORCE_CHUNKED: true,
    AUTO_RELOAD_ON_PLAYER_ERROR: GM_getValue('TTV_AutoReload', true),
    AUTO_RELOAD_ON_AD_DETECTED: GM_getValue('TTV_AutoReloadOnAd', true),

    // Intervals and timeouts
    DEBOUNCE_DELAY: 100,
    MAIN_INTERVAL: 15000,
    AD_CHECK_INTERVAL: 3000,
    USER_ACTIVITY_TIMEOUT: 30000,
    MIN_RELOAD_DELAY: 30000,

    // Limits
    MAX_RELOAD_ATTEMPTS: GM_getValue('TTV_AutoReloadMax', 6),
    MAX_AD_RELOAD_ATTEMPTS: GM_getValue('TTV_AdReloadMax', 3),
    MAX_ELEMENTS_PER_CHECK: 200,
    MAX_AD_ELEMENTS_TO_REMOVE: 50,

    // Domains and patterns
    AD_DOMAINS: [
      'edge.ads.twitch.tv', 'amazon-adsystem.com', 'scorecardresearch.com',
      'sq-tungsten-ts.amazon-adsystem.com', 'ads.ttvnw.net', 'ad.twitch.tv',
      'video.ad.twitch.tv', 'stream-display-ad.twitch.tv', 'doubleclick.net',
      'googlesyndication.com', 'criteo.com', 'taboola.com', 'outbrain.com',
      'imasdk.googleapis.com', 'cdn.segment.com',
      'sponsored-content.twitch.tv', 'promotions.twitch.tv', 'marketing.twitch.tv',
      'partners.twitch.tv', 'sponsors.twitch.tv'
    ],

    // Chat protection patterns
    CHAT_PROTECTION_PATTERNS: [
      'wss://irc-ws.chat.twitch.tv', '/chat/room', 'chat.twitch.tv', 'tmi.twitch.tv',
      'usher.ttvnw.net/api/channel/hls', '/gql POST', 'passport.twitch.tv',
      'id.twitch.tv', 'oauth2', '/login', '/auth', 'access_token', 'scope=chat',
      'login.twitch.tv'
    ],

    // Core ad selectors (most common and reliable)
    CORE_AD_SELECTORS: [
      '[data-test-selector*="ad-"]',
      '[data-a-target*="ad-"]',
      '.stream-display-ad',
      '.video-ad-countdown',
      '.player-ad-overlay',
      '.player-ad-notice',
      '.consent-banner',
      '[data-a-target="consent-banner-accept"]',
      '.ivs-ad-container',
      '.ivs-ad-overlay',
      '.ivs-ad-skip-button',
      'div[data-a-target="video-ad-countdown"]',
      'div.ramp-up-ad-active',
      '[data-component="AdContainer"]',
      '.ad-overlay-modern',
      '.sponsored-highlight',
      '.promo-banner-inline',
      '[data-a-target="ad-content"]',
      '.native-ad-container',
      '.ad-banner',
      '.top-ad-banner',
      '.promo-card',
      '.prime-takeover'
    ],

    // Fallback keywords for text-based detection
    FALLBACK_KEYWORDS: [
      'ad', 'sponsor', 'sponsored', 'promotion', 'promotional',
      'advertisement', 'marketing', 'adcontent', 'commercial'
    ],

    // M3U8 ad markers
    M3U8_AD_MARKERS: [
      'CUE-OUT', 'CUE-IN', 'SCTE35', 'EXT-X-TWITCH-AD', 'STREAM-DISPLAY-AD',
      'EXT-X-AD', 'EXT-X-DATERANGE', 'EXT-X-ASSET', 'EXT-X-TWITCH-PREROLL-AD',
      'EXT-X-TWITCH-MIDROLL-AD', 'EXT-X-TWITCH-POSTROLL-AD'
    ]
  };

  // Performance optimization: memoized selector string
  const AD_SELECTOR_STRING = CONFIG.CORE_AD_SELECTORS.join(', ');

  // Logging with performance optimization
  const createLogger = () => {
    const prefix = '[TTV ADBLOCK FIX v35.2.1]';
    const enabled = CONFIG.DEBUG;

    return {
      info: enabled ? (...args) => console.info(prefix, ...args) : () => { },
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args),
      debug: enabled ? (...args) => console.debug(prefix, ...args) : () => { }
    };
  };

  const log = createLogger();

  // Utility functions
  const isChatOrAuthUrl = (url) => {
    const lowerUrl = url.toLowerCase();
    return CONFIG.CHAT_PROTECTION_PATTERNS.some(pattern =>
      lowerUrl.includes(pattern.toLowerCase())
    );
  };

  const isChatElement = (el) => {
    if (!el) return false;

    // Quick check for common chat selectors
    const chatSelectors = [
      '[data-a-target*="chat"]', '[data-test-selector*="chat"]',
      '.chat-line__', '.chat-input', '[role="log"]',
      '.tw-chat', '.chat-room', '.chat-container'
    ];

    return chatSelectors.some(selector => el.matches?.(selector)) ||
      (el.closest && el.closest('.chat')) ||
      (el.parentElement && isChatElement(el.parentElement));
  };

  // Optimized batch remover with throttling
  class OptimizedBatchRemover {
    constructor() {
      this.elements = new Set();
      this.timeout = null;
      this.lastFlushTime = 0;
      this.flushInterval = CONFIG.PERFORMANCE_MODE ? 250 : 150;
      this.maxElementsPerFlush = CONFIG.MAX_AD_ELEMENTS_TO_REMOVE;
    }

    add(element) {
      if (!element || !element.parentNode || isChatElement(element)) {
        return;
      }

      // Throttle element collection
      if (this.elements.size >= this.maxElementsPerFlush) {
        this.flush();
      }

      this.elements.add(element);

      if (!this.timeout) {
        const now = Date.now();
        const timeSinceLastFlush = now - this.lastFlushTime;
        const delay = Math.max(0, this.flushInterval - timeSinceLastFlush);

        this.timeout = setTimeout(() => this.flush(), delay);
      }
    }

    flush() {
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }

      if (this.elements.size === 0) return;

      const elementsArray = Array.from(this.elements);
      this.elements.clear();
      this.lastFlushTime = Date.now();

      // Use document fragment for better performance
      const fragment = document.createDocumentFragment();
      let removedCount = 0;

      try {
        for (let element of elementsArray) {
          if (element.parentNode && !isChatElement(element)) {
            try {
              fragment.appendChild(element);
              removedCount++;
            } catch (e) {
              // Element might have been removed by another process
              log.debug('Failed to remove element:', e);
            }
          }
        }

        if (removedCount > 0) {
          log.info(`Removed ${removedCount} ad elements`);
        }
      } catch (error) {
        log.error('Batch removal error:', error);
        // Fallback: remove elements individually
        for (let element of elementsArray) {
          try {
            if (element.parentNode && !isChatElement(element)) {
              element.remove();
              removedCount++;
            }
          } catch (e) {
            log.debug('Fallback removal failed:', e);
          }
        }
      }
    }

    clear() {
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }
      this.elements.clear();
    }
  }

  const batchRemover = new OptimizedBatchRemover();

  // Optimized GQL request modifier
  const modifyGQLRequest = (() => {
    const adOperationNames = new Set([
      'PlaybackAccessToken',
      'StreamDisplayAd',
      'CommercialBreak',
      'Sponsorship',
      'Marketing',
      'Promotion'
    ]);

    return (body) => {
      if (typeof body !== 'object' || !body) return null;

      const operations = Array.isArray(body) ? body : [body];
      let modified = false;

      try {
        for (let operation of operations) {
          if (!operation?.operationName) continue;

          // Quick check for ad-related operations
          const opName = operation.operationName;
          const isAdOperation = adOperationNames.has(opName) ||
            opName.includes('Ad') ||
            opName.includes('Commercial') ||
            opName.includes('Sponsorship') ||
            opName.includes('Marketing') ||
            opName.includes('Promotion');

          if (isAdOperation) {
            const vars = operation.variables || {};

            // Core ad-blocking parameters
            vars.isLive = true;
            vars.playerType = 'embed';
            vars.playerBackend = 'mediaplayer';
            vars.platform = 'web';
            vars.adblock = false;
            vars.adsEnabled = false;
            vars.isAd = false;
            vars.adBreaksEnabled = false;
            vars.disableAds = true;

            // Quality and performance parameters
            vars.params = vars.params || {};
            vars.params.allow_source = true;
            vars.params.allow_audio_only = true;
            vars.params.fast_bread = true;
            vars.params.playlist_include_framerate = true;
            vars.params.include_denylist_categories = false;
            vars.params.include_optional = true;

            // Clear ad identifiers
            vars.params.client_ad_id = null;
            vars.params.ad_session_id = null;
            vars.params.reftoken = null;
            vars.params.player_ad_id = null;
            vars.params.ad_id = null;
            vars.params.ad_conv_id = null;
            vars.params.ad_personalization_id = null;

            // Additional modern API parameters
            vars.enableAdblock = false;
            vars.showAds = false;
            vars.skipAds = true;
            vars.personalizedAds = false;

            operation.variables = vars;
            modified = true;

            if (CONFIG.DEBUG) {
              log.debug(`Patched GQL operation: ${opName}`);
            }
          }
        }
      } catch (error) {
        log.error('GQL modification error:', error);
      }

      return modified ? operations : null;
    };
  })();

  // Optimized M3U8 cleaner
  const cleanM3U8 = (() => {
    const markerRegex = new RegExp(CONFIG.M3U8_AD_MARKERS.join('|'), 'i');

    return (text) => {
      const lines = text.split('\n');
      const filteredLines = [];

      for (let line of lines) {
        if (!markerRegex.test(line)) {
          filteredLines.push(line);
        }
      }

      let cleaned = filteredLines.join('\n');

      // Force chunked quality if enabled
      if (CONFIG.FORCE_CHUNKED) {
        const chunkedMatch = cleaned.match(/#EXT-X-STREAM-INF:[^\n]*?(?:VIDEO="chunked"|NAME="Source"|исходное)[^\n]*\n([^\n]+)/i);

        if (chunkedMatch) {
          const chunkedUrl = chunkedMatch[1].trim();
          cleaned = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO="chunked"\n${chunkedUrl}`;
        }
      }

      return cleaned;
    };
  })();

  // Optimized fetch wrapper
  const originalFetch = unsafeWindow.fetch;
  unsafeWindow.fetch = async (input, init = {}) => {
    const url = (input instanceof Request ? input.url : input) + '';

    // Quick chat/auth protection
    if (isChatOrAuthUrl(url)) {
      return originalFetch(input, init);
    }

    // Block ad domains
    if (CONFIG.AD_DOMAINS.some(domain => url.includes(domain))) {
      return new Response(null, { status: 204 });
    }

    // Handle GQL requests
    if (url.includes('gql.twitch.tv')) {
      try {
        const bodyText = input instanceof Request
          ? await input.clone().text()
          : init.body || '{}';

        const body = JSON.parse(bodyText);
        const modified = modifyGQLRequest(body);

        if (modified) {
          const newBody = JSON.stringify(modified);
          init = { ...init, body: newBody };

          if (input instanceof Request) {
            input = new Request(input, { body: newBody });
          }
        }
      } catch (error) {
        log.debug('GQL processing error:', error);
      }
    }

    // Handle M3U8 streams
    if (url.includes('.m3u8') || url.includes('usher.ttvnw.net')) {
      const response = await originalFetch(input, init);

      if (!response.ok) return response;

      const text = await response.clone().text();

      if (text.includes('#EXTM3U')) {
        const cleaned = cleanM3U8(text);

        if (cleaned !== text) {
          return new Response(
            new Blob([cleaned]),
            {
              status: response.status,
              headers: {
                ...Object.fromEntries(response.headers),
                'Content-Type': 'application/vnd.apple.mpegurl'
              }
            }
          );
        }
      }

      return response;
    }

    return originalFetch(input, init);
  };

  // CSS injection
  const injectCSS = (() => {
    let cssInjected = false;

    return () => {
      if (cssInjected) return;

      GM_addStyle(`
        ${AD_SELECTOR_STRING} {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Additional performance optimizations */
        .stream-display-ad,
        .player-ad-overlay,
        .ivs-ad-container {
          visibility: hidden !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
        }
      `);

      cssInjected = true;
    };
  })();

  // Optimized ad removal
  const removeAds = (() => {
    let lastCheckTime = 0;
    const minCheckInterval = CONFIG.PERFORMANCE_MODE ? 200 : 100;

    return () => {
      const now = Date.now();

      // Throttle checks
      if (now - lastCheckTime < minCheckInterval) {
        return;
      }
      lastCheckTime = now;

      // Remove core ad elements
      try {
        const adElements = document.querySelectorAll(AD_SELECTOR_STRING);

        for (let element of adElements) {
          batchRemover.add(element);
        }
      } catch (error) {
        log.error('Core ad removal error:', error);
      }

      // Fallback text-based detection (throttled)
      if (CONFIG.FALLBACK_KEYWORDS.length > 0 && CONFIG.DEBUG) {
        try {
          const allElements = document.querySelectorAll('*');
          const maxElements = Math.min(allElements.length, CONFIG.MAX_ELEMENTS_PER_CHECK);

          let checked = 0;

          for (let element of allElements) {
            if (checked >= maxElements) break;
            checked++;

            if (element.childElementCount === 0 &&
              element.textContent &&
              element.offsetWidth > 0 &&
              !isChatElement(element)) {

              const text = element.textContent.toLowerCase();

              for (let keyword of CONFIG.FALLBACK_KEYWORDS) {
                if (text.includes(keyword)) {
                  // Check if it's not already covered by CSS
                  if (!element.matches(AD_SELECTOR_STRING)) {
                    batchRemover.add(element);
                  }
                  break;
                }
              }
            }
          }
        } catch (error) {
          log.error('Fallback detection error:', error);
        }
      }

      batchRemover.flush();
    };
  })();

  // Ad detection with improved accuracy
  const adDetector = (() => {
    let consecutiveAdChecks = 0;
    let lastAdDetectionTime = 0;
    let lastUserInteractionTime = 0;
    let userActivityTimer = null;

    const resetAdDetection = () => {
      consecutiveAdChecks = 0;
      lastAdDetectionTime = 0;
    };

    const handleUserInteraction = () => {
      lastUserInteractionTime = Date.now();

      if (userActivityTimer) {
        clearTimeout(userActivityTimer);
      }

      userActivityTimer = setTimeout(() => {
        lastUserInteractionTime = 0;
      }, CONFIG.USER_ACTIVITY_TIMEOUT);
    };

    // Setup user interaction tracking
    const setupUserTracking = () => {
      const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];

      events.forEach(event => {
        document.addEventListener(event, handleUserInteraction, { passive: true });
      });

      const video = document.querySelector('video');
      if (video) {
        video.addEventListener('play', handleUserInteraction);
        video.addEventListener('pause', handleUserInteraction);
        video.addEventListener('seeking', handleUserInteraction);
        video.addEventListener('seeked', handleUserInteraction);
      }
    };

    const isAdDetected = () => {
      try {
        // Check for visible ad elements
        const adElements = document.querySelectorAll(AD_SELECTOR_STRING);
        if (adElements.length > 0) {
          for (let element of adElements) {
            if (element.offsetParent !== null && element.style.display !== 'none') {
              return true;
            }
          }
        }

        // Check video state
        const video = document.querySelector('video');
        if (video && video.readyState > 0) {
          // Check for paused state (but not user-initiated)
          if (video.paused && !video.ended) {
            const timeSinceInteraction = Date.now() - lastUserInteractionTime;

            if (timeSinceInteraction >= 2000) {
              return true;
            }
          }

          // Check for stalled playback
          const currentTime = video.currentTime;
          if (currentTime > 0 && video.readyState < 2) {
            return true;
          }
        }

        return false;
      } catch (error) {
        log.error('Ad detection error:', error);
        return false;
      }
    };

    const handleAdDetection = () => {
      if (!CONFIG.AUTO_RELOAD_ON_AD_DETECTED) return;

      const now = Date.now();

      // Throttle ad detection
      if (now - lastAdDetectionTime < CONFIG.AD_CHECK_INTERVAL) {
        return;
      }
      lastAdDetectionTime = now;

      // Check if video is working normally
      const video = document.querySelector('video');
      if (video && video.readyState > 0 && !video.paused && !video.ended && video.currentTime > 0) {
        resetAdDetection();
        return;
      }

      if (isAdDetected()) {
        consecutiveAdChecks++;
        log.warn(`Ad detected (${consecutiveAdChecks}/${CONFIG.MAX_AD_RELOAD_ATTEMPTS})`);

        if (consecutiveAdChecks >= CONFIG.MAX_AD_RELOAD_ATTEMPTS) {
          log.warn('Max ad reload attempts reached');
          return;
        }

        // Check minimum delay between reloads
        if (now - lastAdDetectionTime < CONFIG.MIN_RELOAD_DELAY) {
          return;
        }

        setTimeout(() => {
          if (isAdDetected()) {
            log.info('Reloading page due to ad detection');
            window.location.reload();
          } else {
            resetAdDetection();
          }
        }, 1000);
      } else {
        resetAdDetection();
      }
    };

    return {
      setupUserTracking,
      handleAdDetection,
      isAdDetected
    };
  })();

  // Player error handler
  const playerErrorHandler = (() => {
    let reloadAttempts = 0;
    let lastPath = location.pathname;
    let lastReloadTime = 0;

    const resetAttempts = () => {
      reloadAttempts = 0;
      lastPath = location.pathname;
      lastReloadTime = 0;
    };

    const scheduleReload = (reason) => {
      if (!CONFIG.AUTO_RELOAD_ON_PLAYER_ERROR) return;

      const video = document.querySelector('video');
      if (video && video.readyState > 0 && !video.error) {
        resetAttempts();
        return;
      }

      if (reloadAttempts >= CONFIG.MAX_RELOAD_ATTEMPTS) return;

      const delay = Math.min(
        2000 * Math.pow(2, reloadAttempts),
        60000
      );

      reloadAttempts++;

      setTimeout(() => {
        const video2 = document.querySelector('video');
        if (video2 && video2.readyState > 0 && !video2.error) {
          resetAttempts();
          return;
        }
        window.location.reload();
      }, delay);
    };

    const attachErrorHandlers = (video) => {
      if (!video || video.___ttv_hooked) return;

      video.___ttv_hooked = true;

      const handleVideoError = () => {
        log.warn('Video error detected, scheduling reload');
        scheduleReload('video error');
      };

      const handleStall = () => {
        setTimeout(() => {
          if (video.readyState === 0) {
            scheduleReload('stalled');
          }
        }, 4000);
      };

      const handleWaiting = () => {
        setTimeout(() => {
          if (video.readyState === 0) {
            scheduleReload('waiting');
          }
        }, 5000);
      };

      const handlePlaying = () => {
        resetAttempts();
      };

      video.addEventListener('error', handleVideoError);
      video.addEventListener('stalled', handleStall);
      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('playing', handlePlaying);
    };

    return {
      attachErrorHandlers,
      resetAttempts
    };
  })();

  // Switch detector
  const switchDetector = (() => {
    let lastPath = location.pathname;

    const setup = () => {
      if (!CONFIG.SWITCH_FIX) return;

      new MutationObserver(() => {
        if (location.pathname !== lastPath) {
          lastPath = location.pathname;
          playerErrorHandler.resetAttempts();

          setTimeout(() => {
            const video = document.querySelector('video');
            if (video) {
              video.pause();
              video.src = '';
              video.load();
            }
            removeAds();
          }, 300);
        }
      }).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    };

    return { setup };
  })();

  // Video watcher
  const videoWatcher = (() => {
    const tryAttach = () => {
      const video = document.querySelector('video');
      if (video) {
        playerErrorHandler.attachErrorHandlers(video);
      }
    };

    const setup = () => {
      tryAttach();

      new MutationObserver(() => {
        tryAttach();
      }).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    };

    return { setup };
  })();

  // Main initialization
  const init = (() => {
    let initialized = false;

    return () => {
      if (initialized) return;
      initialized = true;

      log.info('Initializing Optimized Twitch Adblock Fix...');

      // Inject CSS
      injectCSS();

      // Initial ad removal
      removeAds();

      // Setup detectors and watchers
      switchDetector.setup();
      videoWatcher.setup();
      adDetector.setupUserTracking();

      // Main cleanup interval
      setInterval(() => {
        removeAds();
        batchRemover.flush();
      }, CONFIG.MAIN_INTERVAL);

      // Ad detection interval
      if (CONFIG.AUTO_RELOAD_ON_AD_DETECTED) {
        setInterval(() => {
          adDetector.handleAdDetection();
        }, CONFIG.AD_CHECK_INTERVAL);
      }

      // Performance monitoring
      if (CONFIG.DEBUG) {
        setInterval(() => {
          const adElements = document.querySelectorAll(AD_SELECTOR_STRING);
          log.debug(`Current ad elements: ${adElements.length}`);
        }, 30000);
      }

      log.info('Optimized Twitch Adblock Fix initialized successfully');
    };
  })();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    batchRemover.clear();
  });

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();