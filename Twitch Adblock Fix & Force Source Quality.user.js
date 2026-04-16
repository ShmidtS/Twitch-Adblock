// ==UserScript==
// @name Twitch Adblock Ultimate
// @namespace TwitchAdblockUltimate
// @version 46.0.0
// @description Twitch ad-blocking with window.__vat interception, playerType cascade, M3U8 stitched-ad replacement, PBYP blocking, fake ad-quartile
// @author ShmidtS
// @match https://www.twitch.tv/*
// @match https://m.twitch.tv/*
// @match https://player.twitch.tv/*
// @grant unsafeWindow
// @grant GM_addStyle
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_xmlhttpRequest
// @grant GM_setClipboard
// @connect usher.ttvnw.net
// @connect *.ttvnw.net
// @connect *.twitch.tv
// @connect gql.twitch.tv
// @connect assets.twitch.tv
// @connect raw.githubusercontent.com
// @updateURL https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @downloadURL https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @run-at document-start
// @license MIT
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

    // Intervals and timeouts (optimized for faster reaction)
    DEBOUNCE_DELAY: 75,
    MAIN_INTERVAL: 15000,
    AD_CHECK_INTERVAL: 10000,
    USER_ACTIVITY_TIMEOUT: 30000,
    MIN_RELOAD_DELAY: 15000,

    // Limits
    MAX_RELOAD_ATTEMPTS: GM_getValue('TTV_AutoReloadMax', 6),
    MAX_AD_RELOAD_ATTEMPTS: GM_getValue('TTV_AdReloadMax', 2),
    MAX_ELEMENTS_PER_CHECK: 200,
    MAX_AD_ELEMENTS_TO_REMOVE: 50,

    // Domains and patterns
    AD_DOMAINS: [
      'edge.ads.twitch.tv', 'amazon-adsystem.com',
      'sq-tungsten-ts.amazon-adsystem.com', 'ads.ttvnw.net', 'ad.twitch.tv',
      'video.ad.twitch.tv', 'stream-display-ad.twitch.tv', 'doubleclick.net',
      'googlesyndication.com', 'criteo.com', 'taboola.com', 'outbrain.com',
      'imasdk.googleapis.com', 'cdn.segment.com',
      'sponsored-content.twitch.tv', 'promotions.twitch.tv', 'marketing.twitch.tv',
      'partners.twitch.tv', 'sponsors.twitch.tv',
      'adforensics.twitch.tv'
    ],

    // Tracking/analytics domains to block (not ad-specific but leak user data)
    TRACKING_DOMAINS: [
      'spade.twitch.tv',
      'sb.scorecardresearch.com',
      'secure-sts-prod.imrworldwide.com',
      'imrworldwide.com',
      'api.sprig.com',
      'sprig.com',
      'amazon-adsystem.com',
      'supervisor.ext-twitch.tv',
      'science-output.s3.amazonaws.com',
    ],

    // Chat protection patterns
    CHAT_PROTECTION_PATTERNS: [
      'wss://irc-ws.chat.twitch.tv', '/chat/room', 'chat.twitch.tv', 'tmi.twitch.tv',
      '/gql POST', 'passport.twitch.tv',
      'id.twitch.tv', 'oauth2', '/login', '/auth', 'access_token', 'scope=chat',
      'login.twitch.tv'
    ],

    // Core ad selectors (most common and reliable) - Updated v36.4.0
    CORE_AD_SELECTORS: [
      // Legacy selectors
      '[data-test-selector*="ad-"]',
      '[data-a-target*="ad-"]',
      '.stream-display-ad',
      '.video-ad-countdown',
      '.player-ad-overlay',
      '.player-ad-notice',
      '.consent-banner',
      '[data-a-target="consent-banner-accept"]',
      'div[data-a-target="video-ad-countdown"]',
      'div.ramp-up-ad-active',
      '[data-component="AdContainer"]',
      '.ad-overlay-modern',
      '.sponsored-highlight',
      '.promo-banner-inline',
      '.native-ad-container',
      '.ad-banner',
      '.top-ad-banner',
      '.promo-card',
      '.prime-takeover',
      // IVS Ads (Amazon video ads)
      '.ivs-ad-container',
      '.ivs-ad-overlay',
      '.ivs-ad-skip-button',
      // Stream Display Ad variants (2025-2026)
      '.stream-display-ad__wrapper',
      '.stream-display-ad__wrapper_squeezeback',
      '.stream-display-ad__wrapper-hidden',
      '.stream-display-ad__container_squeezeback',
      '.stream-display-ad__transform-container_squeezeback',
      '.stream-display-ad__frame_squeezeback',
      '.stream-display-ad__wrapper_left-third',
      '.stream-display-ad__wrapper_lower-third',
      '.stream-display-ad__wrapper_skyscraper',
      '.stream-display-ad__wrapper_pushdown',
      '.stream-display-ad__container_left-third',
      '.stream-display-ad__container_lower-third',
      '.stream-display-ad__container_skyscraper',
      '.stream-display-ad__container_pushdown',
      '.stream-display-ad__transform-container_left-third',
      '.stream-display-ad__transform-container_lower-third',
      '.stream-display-ad__transform-container_skyscraper',
      '.stream-display-ad__transform-container_pushdown',
      '.stream-display-ad__frame_left-third',
      '.stream-display-ad__frame_lower-third',
      '.stream-display-ad__frame_skyscraper',
      '.stream-display-ad__frame_pushdown',
      // Audio ads
      '.audio-ad-overlay',
      // Data attributes (new)
      '[data-a-target="ad-content"]',
      '[data-a-target="video-ad-countdown"]',
      '[data-a-target="outstream-ax-overlay"]',
      '[data-test-selector="sda-container"]',
      '[data-test-selector="sda-frame"]',
      '[data-test-selector="sda-transform"]',
      '[data-test-selector="sda-wrapper"]',
 // New selectors v36.4.0 (from HTML analysis)
 '.sda-eligibility',
 '.sda-upsell',
 '.video-ads',
 '[class*="video-ad-player"]',
 '#amznidpxl',
      // Additional 2025-2026 selectors from HTML analysis
      '[data-a-target="ax-overlay"]',
      '[data-a-target="skip-ad-overlay"]',
      '[data-a-target="video-ad-label"]',
      '[data-a-target="ad-countdown-progress-bar"]',
      '.pushdown-sda',
      '.skip-ad-overlay',
      '.video-ad-label',
      '.ad-countdown-progress-bar',
      '.audio-ax-overlay',
      '[class*="audio-ax-overlay"]',
      '[class*="stream-display-ad__wrapper_"]',
      '[class*="sda-sku"]',
      '[class*="sda-upsell"]',
      '[class*="video-player--stream-display-ad"]',
      '.video-ads-sub-upsell-type',
      '.content-overlay-gate',
      '.audio-ax-overlay-base',
      '.audio-ax-overlay-link',
      '.animated-audio-wave',
      '[class*="animated-audio-wave"]',
      // v40.0.0 additional selectors
      '.outstreamVideoAd',
      '[class*="OUTSTREAM_"]',
      '.pushdown-sda__landscape-upsell',
      '.sda-iframe',
      '[class*="sda-iframe"]',
      '.sda-nudge-overlay',
      '.hideAdOverlay',
      '[class*="videoAd"]',
      '.chan-sub-sda-upsell-live-pill',
      '[class*="chan-sub-sda-upsell"]',
      '.prime-offers-upsell',
      '[class*="prime-offers-upsell"]',
      '.ad-banner-default-text',
      '[class*="playAd"]',
      '[class*="outstream"]',
      '.picture-by-picture-player',
    ],

    // Fallback keywords for text-based detection
    FALLBACK_KEYWORDS: [
      'advertisement', 'sponsored', 'commercial-break', 'commercial break',
      'adcontent', 'video-ad', 'stream-display-ad', 'audio-ad'
    ],

    // M3U8 ad markers — pattern-based detection for ad breaks
    M3U8_AD_MARKERS: [
      /#EXT-X-DATERANGE:.*CLASS="com\.twitch\.ttv\.pts\.dai"/,
      /#EXT-X-DATERANGE:.*CLASS="twitch_ad"/,
      /#EXT-X-DATERANGE:.*ID="stitched-ad-/,
      /#EXT-X-CUE-OUT/,
      /#EXT-X-SCTE35-OUT.*ad/i,
      /#EXT-X-TWITCH-ADS/,
      /#EXT-X-DATERANGE:.*CLASS=".*ad.*"/i,
    ],
    M3U8_AD_END_MARKERS: [
      /#EXT-X-DATERANGE:.*END-DATE/,
      /#EXT-X-CUE-IN/,
      /#EXT-X-SCTE35-IN/,
    ],
    // Legacy string markers for direct matching
    M3U8_AD_STRINGS: [
      'SCTE35-AD', 'EXT-X-TWITCH-AD', 'STREAM-DISPLAY-AD',
      'EXT-X-AD', 'EXT-X-TWITCH-PREROLL-AD',
      'EXT-X-TWITCH-MIDROLL-AD', 'EXT-X-TWITCH-POSTROLL-AD',
      'EXT-X-TWITCH-AD-PLUGIN', 'EXT-X-TWITCH-AD-CREATIVE',
      'EXT-X-TWITCH-PREROLL', 'EXT-X-TWITCH-MIDROLL', 'EXT-X-TWITCH-POSTROLL',
      'URI="ad"', 'stitched-ad', 'EXT-X-DATERANGE:.*CLASS=".*ad.*"',
    ],
  };

  // Performance optimization: memoized selector string
  const AD_SELECTOR_STRING = CONFIG.CORE_AD_SELECTORS.join(', ');

  // Suppress MaxListenersExceededWarning from Twitch IVS player (their bug, not ours)
  // Suppress noisy warnings from Twitch IVS player (their bugs, not ours)
  const _origWarn = unsafeWindow.console.warn.bind(unsafeWindow.console);
  unsafeWindow.console.warn = function (...args) {
    const msg = args.join(' ');
    if (msg.includes('MaxListenersExceededWarning') ||
        msg.includes('Possible EventEmitter memory leak') ||
        msg.includes('Method called on deleted player instance') ||
        msg.includes('Playhead stalling') ||
        msg.includes('Moving to buffered region') ||
        msg.includes('SpadeClient') ||
        msg.includes('jumping') && msg.includes('gap')) {
      return;
    }
    _origWarn(...args);
  };

  const _origError = unsafeWindow.console.error.bind(unsafeWindow.console);
  unsafeWindow.console.error = function (...args) {
    const msg = args.join(' ');
    if (msg.includes('Unable to parse response json') ||
        msg.includes('Failed to record ad event') ||
        msg.includes('WithVideoAdTrackingComponent') ||
        msg.includes('no operations in query document') ||
        (msg.includes('GraphQL errors') && /VideoAd|ClientSideAd|AdEvent|AdBanner|TrackAd|ReportAd|AdOverlay|AdImpression/i.test(msg))) {
      return;
    }
    _origError(...args);
  };

  // Logging with performance optimization
  const createLogger = () => {
    const prefix = '[TTV ADBLOCK FIX v46.0.0]';
    const enabled = CONFIG.DEBUG;

    return {
      info: (...args) => console.info(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args),
      debug: enabled ? (...args) => console.debug(prefix, ...args) : () => { }
    };
  };

  const log = createLogger();

  // Utility functions
  const CHAT_PROTECTION_SET = new Set(CONFIG.CHAT_PROTECTION_PATTERNS.map(p => p.toLowerCase()));
const isChatOrAuthUrl = (url) => {
 const lowerUrl = url.toLowerCase();
 for (const pattern of CHAT_PROTECTION_SET) {
 if (lowerUrl.includes(pattern)) return true;
 }
 return false;
};

  const isChatElement = (el) => {
    if (!el) return false;
    // Iterative traversal to avoid stack overflow on deep trees
    let node = el;
    let depth = 0;
    while (node && depth < 15) {
      if (node.matches) {
        if (
          node.matches('[data-a-target*="chat"]') ||
          node.matches('[data-test-selector*="chat"]') ||
          node.matches('.chat-input') ||
          node.matches('[role="log"]') ||
          node.matches('.tw-chat') ||
          node.matches('.chat-room') ||
          node.matches('.chat-container') ||
          node.matches('.chat-shell') ||
          (node.className && typeof node.className === 'string' && node.className.includes('chat-line__'))
        ) {
          return true;
        }
      }
      node = node.parentElement;
      depth++;
    }
    return false;
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

      let removedCount = 0;

      try {
        for (let element of elementsArray) {
          if (element.parentNode && !isChatElement(element)) {
            try {
              element.remove();
              removedCount++;
            } catch (e) {
              log.debug('Failed to remove element:', e);
            }
          }
        }

        if (removedCount > 0) {
          log.info(`Removed ${removedCount} ad elements`);
        }
      } catch (error) {
        log.error('Batch removal error:', error);
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

  // Stream ad bypass state — playerType cascade + M3U8 replacement
  const PLAYER_TYPE_CASCADE = ['embed', 'site', 'thunderdome'];
  let currentPlayerTypeIdx = 0;
  let consecutiveAdM3U8 = 0;
  const MAX_CONSECUTIVE_AD_M3U8 = 3;
  let currentUsherUrl = null;
  let pendingReplacement = null;

  // Saved GQL headers for authenticated fake quartile
  let savedGQLHeaders = { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' };

  // Fake ad-quartile reporting — convinces Twitch the ad "played" so it stops retrying
  const sendFakeAdQuartile = (() => {
    let sentForSession = false;
    return () => {
      if (sentForSession) return;
      sentForSession = true;
      setTimeout(() => { sentForSession = false; }, 60000);
      try {
        const fakeEvent = {
          operationName: 'ClientSideAdEventHandling_RecordAdEvent',
          variables: {
            input: {
              eventName: 'video_ad_quartile_complete',
              eventPayload: JSON.stringify({
                adQuartile: 4,
                adMediaType: 'video',
                playerMute: false,
                playerVolume: 0.5,
                videoHeight: 1080,
                videoWidth: 1920,
              }),
            }
          }
        };
        originalFetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-ID': savedGQLHeaders['Client-ID'],
            ...(savedGQLHeaders['Authorization'] && { 'Authorization': savedGQLHeaders['Authorization'] }),
          },
          body: JSON.stringify(fakeEvent),
        }).catch(() => {});
        log.info('Sent fake ad-quartile event');
      } catch (e) {}
    };
  })();

  // Intercept window.__vat — Twitch bootstrap pre-loads PlaybackAccessToken before our
  // fetch wrapper processes it. The player reads the cached response from __vat.request
  // and skips our GQL cleaning. Strategy: change playerType to force cache MISS, so
  // the player re-fetches VAT through our intercepted fetch with playerType="embed".
  const interceptVAT = (() => {
    let intercepted = false;

    const patchVATRequest = (vat) => {
      if (!vat || intercepted) return;
      intercepted = true;

      const desiredPlayerType = PLAYER_TYPE_CASCADE[currentPlayerTypeIdx] || 'embed';

      if (vat.playerType !== desiredPlayerType) {
        log.info(`__vat playerType=${vat.playerType}, changing to ${desiredPlayerType} to force cache miss`);
        vat.playerType = desiredPlayerType;
      }

      // Invalidate the cached request so player code re-fetches through our intercepted fetch
      // The player code checks: window.__vat.playerType === expected -> if mismatch, skips cache
      if (vat.request) {
        vat.request = Promise.resolve(new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
        log.info('Invalidated __vat.request cache — player will re-fetch through our pipeline');
      }
    };

    // Intercept the property setter — catches __vat assignment in real-time
    let vatValue = null;
    try {
      Object.defineProperty(unsafeWindow, '__vat', {
        get() { return vatValue; },
        set(val) {
          vatValue = val;
          if (val) {
            patchVATRequest(val);
          }
        },
        configurable: true,
        enumerable: true
      });
      log.info('Installed __vat property interceptor');
    } catch (e) {
      log.debug('__vat interceptor install failed (already set?):', e);
      if (unsafeWindow.__vat) {
        patchVATRequest(unsafeWindow.__vat);
      }
    }

    // Also poll as fallback in case defineProperty fails or __vat already set before us
    let pollAttempts = 0;
    const pollInterval = setInterval(() => {
      pollAttempts++;
      if (unsafeWindow.__vat) {
        clearInterval(pollInterval);
        patchVATRequest(unsafeWindow.__vat);
      } else if (pollAttempts >= 30) {
        clearInterval(pollInterval);
      }
    }, 200);
  })();

  // Optimized GQL request modifier
  const modifyGQLRequest = (() => {
    const adOperationNames = new Set([
      'StreamDisplayAd',
      'CommercialBreak',
      'Sponsorship',
      'Marketing',
      'Promotion',
      'AdRequest',
      'VideoAd',
      'Midroll',
      'Preroll',
      'Postroll',
      'AdMetadata',
      'AdContext',
      'ClientSideVideoAd',
      'FillClientSideAdFormat',
      'ProcessClientSideAdFormatRequest',
      'ReportAdSpike',
      'VideoAdRequest',
      'InstreamVideoAd',
      'OutstreamVideoAd',
      'GetAdSpike',
      'TrackAdImpression',
      'GetAdQuartile',
      'ReportAdQuartile',
      'VideoAdBreak',
      'AdBreakV2',
      'StreamDisplayAdV2',
      'VideoAdPod',
      'AdPodRequest',
      'SdaEligibility',
      'SdaRequest',
      'AudioAdRequest',
      'GetAudioAd',
      'AudioAdBreak',
      'CompanionAd',
      'DisplayAd',
      'GetAdOverlay',
      'AdOverlayImpression',
      'TrackAdEvent',
      'PlayerAdInteractions',
      'GetAdQuartileReporting',
      'ReportAdMetric',
      'AdBidRequest',
      'GetSponsorship',
      'SponsorshipClip',
      'SponsorScreen',
      'VideoPictureByPicture',
      'PictureByPicture',
      'MidrollService',
      'GetMidroll',
      'TriggerMidroll',
    ]);

    const _adPrefixRegex = /^(?:ClientSide|Fill|Process|Video|Stream|Audio|Get|Report|Track|Instream|Outstream)Ad/i;
    const _commercialRegex = /^Commercial/i;
    const _sponsorRegex = /^Sponsor(?!shipAccessToken)/i;
    const _marketingRegex = /^Marketing/i;
    const _promoRegex = /^Promo(?!tionAccessToken)/i;
    const _pbypRegex = /^(?:Video)?PictureByPicture|^Midroll/i;

    return (body) => {
      if (typeof body !== 'object' || !body) return 'pass';

      const isBatch = Array.isArray(body);
      const operations = isBatch ? body : [body];
      let modified = false;

      try {
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          if (!operation?.operationName) continue;

          if (operation.operationName === 'PlaybackAccessToken') {
            const vars = operation.variables || {};
            vars.playerType = PLAYER_TYPE_CASCADE[currentPlayerTypeIdx] || 'embed';
            operation.variables = vars;
            modified = true;
            log.info(`PlaybackAccessToken: playerType=${vars.playerType}`);
            continue;
          }

          const opName = operation.operationName;

          const isAdOperation = adOperationNames.has(opName) ||
            _adPrefixRegex.test(opName) ||
            _commercialRegex.test(opName) ||
            _sponsorRegex.test(opName) ||
            _marketingRegex.test(opName) ||
            _promoRegex.test(opName) ||
            _pbypRegex.test(opName);

          if (isAdOperation) {
            // Completely remove ad operations instead of modifying them
            // Twitch ignores variable modifications and still returns ad data
            operation.extensions = operation.extensions || {};
            operation.extensions.operationMask = { id: 0 };
            operation.variables = {};
            operation.query = '';
            modified = true;
            log.info(`Blocked GQL ad operation: ${opName}`);
          }
        }
      } catch (error) {
        log.error('GQL modification error:', error);
        return 'pass';
      }

      return modified ? (isBatch ? operations : operations[0]) : 'pass';
    };
  })();

  // Optimized M3U8 cleaner
  const cleanM3U8 = (() => {
    const markerRegex = new RegExp(CONFIG.M3U8_AD_STRINGS.join('|'));

    return (text) => {
      const lines = text.split('\n');
      const filteredLines = [];
      let inAdBreak = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for ad break start markers
        if (CONFIG.M3U8_AD_MARKERS.some(regex => regex.test(line))) {
          inAdBreak = true;
          continue;
        }

        // Check for ad break end markers
        if (CONFIG.M3U8_AD_END_MARKERS.some(regex => regex.test(line))) {
          inAdBreak = false;
          continue;
        }

        // Check for direct string ad markers
        if (markerRegex.test(line)) {
          continue;
        }

        // Skip all lines while inside an ad break (auto-reset on content segment)
        if (inAdBreak) {
          if (line.startsWith('#EXT-X-DISCONTINUITY') ||
              (line.trim() && !line.startsWith('#') && line.includes('://'))) {
            inAdBreak = false;
            if (line.startsWith('#EXT-X-DISCONTINUITY')) continue;
            filteredLines.push(line);
            continue;
          }
          continue;
        }

        filteredLines.push(line);
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

  // Domain matching helper — exact/suffix matching, no substring false positives
  const isAdDomain = (url) => {
    try {
      const hostname = new URL(url).hostname;
      return CONFIG.AD_DOMAINS.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  };

  const isTrackingDomain = (url) => {
    try {
      const hostname = new URL(url).hostname;
      return CONFIG.TRACKING_DOMAINS.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  };

  // Ad-related HTTP header stripping
  const stripAdHeaders = (response) => {
    const headers = new Headers(response.headers);
    let stripped = false;

    for (const key of headers.keys()) {
      const lower = key.toLowerCase();
      if (lower.startsWith('x-tv-twitch-ad') ||
          lower.startsWith('x-ttv-maf-ad') ||
          lower.includes('ad-break') ||
          lower.includes('ad-slot')) {
        headers.delete(key);
        stripped = true;
      }
    }

    if (stripped) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    return response;
  };

  // Clean ad scheduling data from GQL response bodies
  const AD_RESPONSE_FIELDS = new Set([
    'commercialBreaks', 'midrollSchedule', 'adBreaks', 'displayAds',
    'adMetadata', 'adSlot', 'adReporting', 'adContext', 'adSchedule',
    'adForecast', 'playerAdvertisement', 'adSlotMetadata',
    'commercialBreakTimestamps', 'forcedAdBreaks',
    'playerAds', 'adPod', 'adPods', 'adQuartile',
  ]);

  const cleanGQLResponse = (data) => {
    const ops = Array.isArray(data) ? data : [data];
    let modified = false;

    for (const op of ops) {
      if (!op || typeof op !== 'object') continue;

      // Walk the response object recursively
      const walk = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
          const lower = key.toLowerCase();
          if (AD_RESPONSE_FIELDS.has(key) ||
              (lower.includes('ad') && (lower.includes('break') || lower.includes('schedule') || lower.includes('slot') || lower.includes('metadata')))) {
            if (obj[key] !== null && obj[key] !== false) {
              obj[key] = Array.isArray(obj[key]) ? [] : null;
              modified = true;
            }
          }
          if (typeof obj[key] === 'object') {
            walk(obj[key]);
          }
        }
      };

      // Check for isForbidden in PlaybackAccessToken response — advance cascade
      if (op.data?.streamPlaybackAccessToken?.authorization?.isForbidden) {
        const reason = op.data.streamPlaybackAccessToken.authorization.forbiddenReasonCode || 'unknown';
        if (currentPlayerTypeIdx < PLAYER_TYPE_CASCADE.length - 1) {
          currentPlayerTypeIdx++;
          log.info(`PlaybackAccessToken forbidden (${reason}), advancing cascade to ${PLAYER_TYPE_CASCADE[currentPlayerTypeIdx]}`);
        } else {
          log.warn(`PlaybackAccessToken forbidden (${reason}), cascade exhausted`);
        }
      }

      walk(op);
    }

    return modified ? data : null;
  };

  // Worker Constructor Proxy — IVS WASM Worker bypasses unsafeWindow.fetch;
  // this injects fetch override into Worker scope so M3U8 cleaning works
  const _OriginalWorker = unsafeWindow.Worker;

  const workerInjection = `(function(){
var _wf=self.fetch;
self.fetch=function(input,init){
var url=(input instanceof Request?input.url:input)+"";
try{var h=new URL(url).hostname;
var bd=["edge.ads.twitch.tv","amazon-adsystem.com","ads.ttvnw.net","ad.twitch.tv",
"video.ad.twitch.tv","stream-display-ad.twitch.tv","doubleclick.net","googlesyndication.com",
"criteo.com","taboola.com","outbrain.com","imasdk.googleapis.com","cdn.segment.com",
"sponsored-content.twitch.tv","promotions.twitch.tv","marketing.twitch.tv",
"partners.twitch.tv","sponsors.twitch.tv","adforensics.twitch.tv",
"spade.twitch.tv","sb.scorecardresearch.com","supervisor.ext-twitch.tv",
"secure-sts-prod.imrworldwide.com","imrworldwide.com","api.sprig.com","sprig.com",
"science-output.s3.amazonaws.com"];
for(var i=0;i<bd.length;i++){if(h===bd[i]||h.endsWith("."+bd[i]))
return Promise.resolve(new Response(null,{status:204}))}}catch(e){}
if(url.indexOf("amznidpxl")!==-1||url.indexOf("amazon-adsystem.com/cb")!==-1||
url.indexOf("adforensics")!==-1||url.indexOf("picture-by-picture")!==-1||
url.indexOf("/pbyp")!==-1||url.indexOf("picture_by_picture")!==-1)
return Promise.resolve(new Response(null,{status:204}));
return _wf(input,init).then(function(r){
if(!(url.indexOf(".m3u8")!==-1||url.indexOf("usher.ttvnw.net")!==-1)||!r.ok)return r;
return r.clone().text().then(function(text){
if(text.indexOf("#EXTM3U")===-1)return r;
var ls=text.split("\\n"),fl=[],iab=false;
var am=[/#EXT-X-DATERANGE:.*CLASS="com\\.twitch\\.ttv\\.pts\\.dai"/,
/#EXT-X-DATERANGE:.*CLASS="twitch_ad"/,
/#EXT-X-DATERANGE:.*ID="stitched-ad-/,
/#EXT-X-CUE-OUT/,/#EXT-X-SCTE35-OUT.*ad/i,/#EXT-X-TWITCH-ADS/,
/#EXT-X-DATERANGE:.*CLASS=".*ad.*"/i];
var em=[/#EXT-X-DATERANGE:.*END-DATE/,/#EXT-X-CUE-IN/,/#EXT-X-SCTE35-IN/];
var as=new RegExp(["SCTE35-AD","EXT-X-TWITCH-AD","STREAM-DISPLAY-AD","EXT-X-AD",
"EXT-X-TWITCH-PREROLL-AD","EXT-X-TWITCH-MIDROLL-AD","EXT-X-TWITCH-POSTROLL-AD",
"EXT-X-TWITCH-AD-PLUGIN","EXT-X-TWITCH-AD-CREATIVE","EXT-X-TWITCH-PREROLL",
"EXT-X-TWITCH-MIDROLL","EXT-X-TWITCH-POSTROLL",'URI="ad"',"stitched-ad"].join("|"));
for(var i=0;i<ls.length;i++){var l=ls[i],isS=false,isE=false;
for(var j=0;j<am.length;j++){if(am[j].test(l)){isS=true;break}}
if(isS){iab=true;continue}
for(var j=0;j<em.length;j++){if(em[j].test(l)){isE=true;break}}
if(isE){iab=false;continue}
if(as.test(l))continue;
if(iab){if(l.indexOf("#EXT-X-DISCONTINUITY")===0||
(l.trim()&&l.charAt(0)!=="#"&&l.indexOf("://")!==-1)){
iab=false;if(l.indexOf("#EXT-X-DISCONTINUITY")===0)continue;fl.push(l);continue}continue}
fl.push(l)}
var c=fl.join("\\n");
var cm=c.match(/#EXT-X-STREAM-INF:[^\\n]*?(?:VIDEO="chunked"|NAME="Source")[^\\n]*\\n([^\\n]+)/i);
if(cm)c="#EXTM3U\\n#EXT-X-VERSION:3\\n#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO=\\"chunked\\"\\n"+cm[1].trim();
if(c!==text){try{self.postMessage({__ttv_adblock:true,type:"m3u8_cleaned",url:url})}catch(e){}
return new Response(new Blob([c]),{status:r.status,
headers:{"Content-Type":"application/vnd.apple.mpegurl"}})}return r})})};
})();`;

  unsafeWindow.Worker = function (scriptUrl, options) {
    const url = String(scriptUrl);

    if (!url.includes('twitch') && !url.includes('ttvnw') && !url.startsWith('blob:')) {
      return new _OriginalWorker(scriptUrl, options);
    }

    if (options && options.type === 'module') {
      return new _OriginalWorker(scriptUrl, options);
    }

    const attachWorkerListener = (worker) => {
      worker.addEventListener('message', (e) => {
        if (e.data?.__ttv_adblock && e.data.type === 'm3u8_cleaned') {
          log.info('Worker M3U8 cleaned:', e.data.url?.substring(0, 60));
        }
      });
    };

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();

      if (xhr.status === 200 || xhr.status === 0) {
        const patchedCode = workerInjection + '\n' + xhr.responseText;
        const patchedBlob = new Blob([patchedCode], { type: 'application/javascript' });
        const patchedUrl = URL.createObjectURL(patchedBlob);
        const worker = new _OriginalWorker(patchedUrl, options);
        URL.revokeObjectURL(patchedUrl);
        attachWorkerListener(worker);
        log.info('Worker proxy installed for:', url.substring(0, 80));
        return worker;
      }
    } catch (e) {
      log.debug('Worker sync XHR failed:', e.message);
    }

    if (url.startsWith('blob:')) {
      try {
        const bootstrapCode = workerInjection + '\nimportScripts("' + url + '");\n';
        const bootstrapBlob = new Blob([bootstrapCode], { type: 'application/javascript' });
        const bootstrapUrl = URL.createObjectURL(bootstrapBlob);
        const worker = new _OriginalWorker(bootstrapUrl, options);
        URL.revokeObjectURL(bootstrapUrl);
        attachWorkerListener(worker);
        log.info('Worker proxy installed (importScripts) for blob: URL');
        return worker;
      } catch (e) {
        log.debug('Worker importScripts fallback failed:', e.message);
      }
    }

    log.debug('Worker proxy skipped:', url.substring(0, 80));
    return new _OriginalWorker(scriptUrl, options);
  };

  unsafeWindow.Worker.prototype = _OriginalWorker.prototype;
  Object.setPrototypeOf(unsafeWindow.Worker, _OriginalWorker);

  // Optimized fetch wrapper
  const originalFetch = unsafeWindow.fetch;
  unsafeWindow.fetch = async (input, init = {}) => {
    const url = (input instanceof Request ? input.url : input) + '';

    // Quick chat/auth protection
    if (isChatOrAuthUrl(url)) {
      return originalFetch(input, init);
    }

    // Block ad domains (exact/suffix matching)
    if (isAdDomain(url)) {
      return new Response(null, { status: 204 });
    }

    // Block tracking/analytics domains
    if (isTrackingDomain(url)) {
      return new Response(null, { status: 204 });
    }

    // Block Amazon tracking pixel + ad forensics script
    if (url.includes('amznidpxl') || url.includes('amazon-adsystem.com/cb') || url.includes('adforensics')) {
      return new Response(null, { status: 204 });
    }

    // Block PBYP (picture-by-picture) midroll triggers — URL and GQL body
    if (url.includes('picture-by-picture') || url.includes('/pbyp') || url.includes('picture_by_picture')) {
      log.info('Blocked PBYP midroll fetch');
      return new Response(null, { status: 204 });
    }

    // Handle GQL requests — single block for request modification + response processing
    if (url.includes('gql.twitch.tv')) {
      try {
        const bodyText = input instanceof Request
          ? await input.clone().text()
          : init.body || '{}';

        const body = JSON.parse(bodyText);
        const result = modifyGQLRequest(body);

        // Save GQL headers for authenticated fake quartile
        if (init.headers) {
          const headers = init.headers instanceof Headers
            ? Object.fromEntries(init.headers.entries())
            : init.headers;
          const cid = headers['Client-ID'] || headers['client-id'];
          const auth = headers['Authorization'] || headers['authorization'];
          if (cid) savedGQLHeaders['Client-ID'] = cid;
          if (auth && auth !== 'undefined') savedGQLHeaders['Authorization'] = auth;
        }

        if (result !== 'pass') {
          const newBody = JSON.stringify(result);
          init = { ...init, body: newBody };

          if (input instanceof Request) {
            input = new Request(input, { body: newBody });
          }
        }
      } catch (error) {
        log.debug('GQL processing error:', error);
      }

      try {
        const gqlResponse = await originalFetch(input, init);

        // Clean ad scheduling data from GQL response body
        try {
          const cloned = gqlResponse.clone();
          const data = await cloned.json();
          const cleaned = cleanGQLResponse(data);
          if (cleaned) {
            const cleanBody = JSON.stringify(cleaned);
            return new Response(cleanBody, {
              status: gqlResponse.status,
              statusText: gqlResponse.statusText,
              headers: gqlResponse.headers
            });
          }
        } catch (e) {
          log.debug('GQL response clean error:', e);
        }

        if (CONFIG.DEBUG) {
          const cloned = gqlResponse.clone();
          cloned.json().then(data => {
            const ops = Array.isArray(data) ? data : [data];
            for (const op of ops) {
              if (op?.extensions?.adReporting) {
                log.debug('GQL response contained ad reporting data');
              }
            }
          }).catch(() => {});
        }
        return stripAdHeaders(gqlResponse);
      } catch (error) {
        if (error?.name === 'AbortError') {
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        log.debug('GQL response interception error:', error);
      }
    }

    // Handle M3U8 streams
    if (url.includes('.m3u8') || url.includes('usher.ttvnw.net')) {
      log.info('M3U8 fetch intercepted:', url.substring(0, 80));
      // Store Usher URL for stream replacement
      if (url.includes('usher.ttvnw.net')) {
        currentUsherUrl = url;
      }

      const response = await originalFetch(input, init);

      if (!response.ok) return response;

      const text = await response.clone().text();

      if (text.includes('#EXTM3U')) {
        // Detect stitched-ad in media playlist — trigger stream replacement
        const hasStitchedAd = text.includes('stitched-ad') ||
          /#EXT-X-DATERANGE:.*ID="stitched-ad/.test(text) ||
          /#EXT-X-DATERANGE:.*CLASS=".*stitched.*ad.*"/i.test(text);
        const hasAdMarkers = CONFIG.M3U8_AD_MARKERS.some(regex => regex.test(text)) ||
          CONFIG.M3U8_AD_STRINGS.some(s => text.includes(s));

        if (hasStitchedAd) {
          consecutiveAdM3U8++;
          log.info(`M3U8 stitched-ad detected (count: ${consecutiveAdM3U8})`);
          sendFakeAdQuartile();

          // Try stream replacement via next playerType in cascade
          if (consecutiveAdM3U8 >= MAX_CONSECUTIVE_AD_M3U8 && currentUsherUrl && currentPlayerTypeIdx < PLAYER_TYPE_CASCADE.length - 1) {
            currentPlayerTypeIdx++;
            consecutiveAdM3U8 = 0;
            log.info(`Advancing cascade to ${PLAYER_TYPE_CASCADE[currentPlayerTypeIdx]} due to repeated stitched ads`);

            try {
              const replacementUrl = currentUsherUrl.replace(
                /player_type=([^&]+)/,
                `player_type=${PLAYER_TYPE_CASCADE[currentPlayerTypeIdx]}`
              );
              if (replacementUrl !== currentUsherUrl) {
                const replaceResp = await originalFetch(replacementUrl, init);
                if (replaceResp.ok) {
                  const replaceText = await replaceResp.clone().text();
                  if (replaceText.includes('#EXTM3U8')) {
                    const replaceCleaned = cleanM3U8(replaceText);
                    const hasSegments = replaceCleaned.split('\n').some(line =>
                      line.trim() && !line.startsWith('#') && line.includes('://')
                    );
                    if (hasSegments) {
                      log.info('Stream replacement successful');
                      return new Response(
                        new Blob([replaceCleaned]),
                        {
                          status: replaceResp.status,
                          headers: {
                            ...Object.fromEntries(replaceResp.headers),
                            'Content-Type': 'application/vnd.apple.mpegurl'
                          }
                        }
                      );
                    }
                  }
                }
                log.warn('Stream replacement failed, using cleaned original');
              }
            } catch (e) {
              log.warn('Stream replacement error:', e);
            }
          }
        } else if (hasAdMarkers) {
          // Non-stitched ad markers — just clean
          consecutiveAdM3U8 = 0;
        } else {
          // No ads — reset counter
          consecutiveAdM3U8 = 0;
        }

        const cleaned = cleanM3U8(text);

        if (cleaned !== text) {
          const hasSegments = cleaned.split('\n').some(line =>
            line.trim() && !line.startsWith('#') && line.includes('://')
          );
          if (!hasSegments) {
            log.warn('M3U8 cleaning removed all segments — returning original');
            return response;
          }

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

      return stripAdHeaders(response);
    }

    const response = await originalFetch(input, init);
    return stripAdHeaders(response);
  };

  // Intercept XMLHttpRequest for ad blocking
  const _origXHROpen = unsafeWindow.XMLHttpRequest.prototype.open;
  const _origXHRSend = unsafeWindow.XMLHttpRequest.prototype.send;

  unsafeWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._ttvUrl = url;
    this._ttvMethod = method;
    return _origXHROpen.call(this, method, url, ...rest);
  };

  unsafeWindow.XMLHttpRequest.prototype.send = function (body) {
    const url = this._ttvUrl || '';

    // Block ad domains
    if (isAdDomain(url) || url.includes('adforensics') || url.includes('amznidpxl') || url.includes('amazon-adsystem.com/cb')) {
      this.abort();
      return;
    }

    // Block PBYP midroll via XHR
    if (url.includes('picture-by-picture') || url.includes('/pbyp') || url.includes('picture_by_picture')) {
      this.abort();
      log.info('Blocked PBYP midroll XHR');
      return;
    }

    // Modify GQL requests via XHR
    if (url.includes('gql.twitch.tv') && body && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        const result = modifyGQLRequest(parsed);
        if (result !== 'pass') {
          arguments[0] = JSON.stringify(result);
        }
      } catch (e) {}

      // Intercept GQL response to clean ad data
      const origOnReady = this.onreadystatechange;
      const origAddListener = this.addEventListener.bind(this);
      const xhrRef = this;

      const cleanResponse = () => {
        if (xhrRef.readyState === 4 && xhrRef.status === 200) {
          try {
            const data = JSON.parse(xhrRef.responseText);
            const cleaned = cleanGQLResponse(data);
            if (cleaned) {
              Object.defineProperty(xhrRef, 'responseText', {
                value: JSON.stringify(cleaned),
                writable: false,
                configurable: true
              });
              Object.defineProperty(xhrRef, 'response', {
                value: JSON.stringify(cleaned),
                writable: false,
                configurable: true
              });
            }
          } catch (e) {}
        }
      };

      if (origOnReady) {
        this.onreadystatechange = function (...args) {
          cleanResponse();
          return origOnReady.apply(this, args);
        };
      } else {
        this.addEventListener('readystatechange', cleanResponse);
      }
    }

    return _origXHRSend.apply(this, arguments);
  };

  // Block sendBeacon to ad domains
  const _origSendBeacon = unsafeWindow.navigator.sendBeacon.bind(unsafeWindow.navigator);
  unsafeWindow.navigator.sendBeacon = function (url, data) {
    if (isAdDomain(url) || isTrackingDomain(url) || url.includes('adforensics') || url.includes('amznidpxl')) {
      return false;
    }
    return _origSendBeacon(url, data);
  };

  // Intercept window.postMessage to block tracking channels
  const _origPostMessage = unsafeWindow.postMessage.bind(unsafeWindow);
  unsafeWindow.postMessage = function (message, targetOrigin, transfer) {
    if (typeof targetOrigin === 'string' && isTrackingDomain(targetOrigin)) {
      log.debug('Blocked postMessage to tracking domain:', targetOrigin);
      return;
    }
    if (message && typeof message === 'object' && message.type && /ad|tracking|spade|supervisor/i.test(message.type)) {
      log.debug('Blocked tracking postMessage:', message.type);
      return;
    }
    return _origPostMessage(message, targetOrigin, transfer);
  };

  // Intercept HTMLImageElement/HTMLScriptElement src setter — block tracking at assignment time
  const interceptElementSrc = (ElementClass, propName) => {
    const proto = ElementClass.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, propName) ||
                 Object.getOwnPropertyDescriptor(HTMLElement.prototype, propName);
    if (!desc) return;

    Object.defineProperty(proto, propName, {
      ...desc,
      set(value) {
        const url = String(value);
        if (isAdDomain(url) || isTrackingDomain(url) ||
            url.includes('adforensics') || url.includes('amznidpxl')) {
          log.debug('Blocked ' + propName + ' setter for tracking URL:', url.substring(0, 60));
          if (propName === 'src' && this instanceof HTMLImageElement) {
            desc.set.call(this, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
          }
          return;
        }
        return desc.set.call(this, value);
      }
    });
  };

  interceptElementSrc(HTMLImageElement, 'src');
  interceptElementSrc(HTMLScriptElement, 'src');

  // Intercept Response.prototype.json — Twitch's internal "fetchlike" bypasses our
  // unsafeWindow.fetch override, but they all use standard Response.json() to parse.
  // This catches GQL ad data regardless of which fetch implementation was used.
  const _origResponseJson = unsafeWindow.Response.prototype.json;
  unsafeWindow.Response.prototype.json = function (...args) {
    return _origResponseJson.apply(this, args).then(data => {
      if (!data || typeof data !== 'object') return data;

      const isArray = Array.isArray(data);
      const ops = isArray ? data : [data];
      let hasGQL = false;
      let hasAdData = false;

      for (const op of ops) {
        if (op?.data?.streamPlaybackAccessToken ||
            op?.extensions?.adReporting ||
            op?.operationName) {
          hasGQL = true;
          break;
        }
      }

      if (!hasGQL) return data;

      // isForbidden cascade is handled in cleanGQLResponse (fetch-wrapper path) only
      // to avoid double-advancement when Twitch calls .json() on the same response

      const cleaned = cleanGQLResponse(data);
      if (cleaned) {
        log.info('Cleaned GQL ad data via Response.json intercept');
        return cleaned;
      }
      return data;
    });
  };

  const injectCSS = (() => {
    let cssInjected = false;

    const FORMAT_OVERRIDES = {
      '[class*="stream-display-ad__wrapper"]': 'visibility:hidden!important;height:0!important;width:0!important;overflow:hidden!important;',
      '[class*="stream-display-ad__wrapper_"]': 'visibility:hidden!important;height:0!important;width:0!important;overflow:hidden!important;',
      '#amznidpxl': 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;height:0!important;width:0!important;',
      '.ivs-ad-container': 'opacity:0!important;pointer-events:none!important;',
      '.ivs-ad-overlay': 'opacity:0!important;pointer-events:none!important;',
      '.ivs-ad-skip-button': 'opacity:0!important;pointer-events:none!important;',
      '.audio-ad-overlay': 'display:none!important;',
      '[class*="audio-ax-overlay"]': 'display:none!important;',
      '[data-a-target="ax-overlay"]': 'display:none!important;visibility:hidden!important;',
      '.audio-ax-overlay-base': 'display:none!important;',
      '.audio-ax-overlay-link': 'display:none!important;',
      '.animated-audio-wave': 'display:none!important;',
      '[class*="animated-audio-wave"]': 'display:none!important;',
      '.outstreamVideoAd': 'display:none!important;',
      '[class*="OUTSTREAM_"]': 'display:none!important;',
      '.pushdown-sda__landscape-upsell': 'display:none!important;',
      '.sda-iframe': 'display:none!important;',
      '.sda-nudge-overlay': 'display:none!important;',
      '.hideAdOverlay': 'display:none!important;',
      '[class*="videoAd"]': 'display:none!important;',
      '.chan-sub-sda-upsell-live-pill': 'display:none!important;',
      '.prime-offers-upsell': 'display:none!important;',
      '[class*="prime-offers-upsell"]': 'display:none!important;',
      '.ad-banner-default-text': 'display:none!important;',
      '[class*="playAd"]': 'display:none!important;',
      '[class*="outstream"]': 'display:none!important;',
      '.picture-by-picture-player': 'display:none!important;visibility:hidden!important;height:0!important;width:0!important;overflow:hidden!important;',
    };

    return () => {
      if (cssInjected) return;

      let css = `${AD_SELECTOR_STRING} {\n  display:none!important;\n  opacity:0!important;\n  pointer-events:none!important;\n}\n\n`;

      for (const [selector, rules] of Object.entries(FORMAT_OVERRIDES)) {
        css += `${selector} {\n  ${rules}\n}\n\n`;
      }

      GM_addStyle(css);
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

      // Pushdown SDA: collapse parent to prevent layout shift
      try {
        const pushdowns = document.querySelectorAll('.pushdown-sda, [class*="pushdown"]');
        for (const pd of pushdowns) {
          if (pd.parentElement) {
            pd.parentElement.style.setProperty('height', '0', 'important');
            pd.parentElement.style.setProperty('overflow', 'hidden', 'important');
            pd.parentElement.style.setProperty('transition', 'none', 'important');
            batchRemover.add(pd);
          }
        }
      } catch (e) {
        log.debug('Pushdown collapse error:', e);
      }

      // Fallback text-based detection using TreeWalker (lazy evaluation)
      if (CONFIG.FALLBACK_KEYWORDS.length > 0) {
        try {
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
              acceptNode: (node) => {
                if (node.childElementCount > 0) return NodeFilter.FILTER_SKIP;
                if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_SKIP;
                if (node.offsetParent === null) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          let checked = 0;
          let node;
          while ((node = walker.nextNode()) && checked < CONFIG.MAX_ELEMENTS_PER_CHECK) {
            checked++;

            if (isChatElement(node)) continue;

            const text = node.textContent.toLowerCase();
            for (let keyword of CONFIG.FALLBACK_KEYWORDS) {
              if (text.includes(keyword)) {
                if (!node.matches(AD_SELECTOR_STRING)) {
                  batchRemover.add(node);
                }
                break;
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
    let lastReloadTime = 0;
    let lastUserInteractionTime = 0;
    let userActivityTimer = null;
    let lastMoveTime = 0;
    let totalReloads = 0;
    const MAX_TOTAL_RELOADS = 4;
    let readyStateZeroSince = 0;

    const resetAdDetection = () => {
      consecutiveAdChecks = 0;
      lastAdDetectionTime = 0;
    };

    const handleUserInteraction = (e) => {
      if (e.type === 'mousemove') {
        const now = Date.now();
        if (now - lastMoveTime < 150) return;
        lastMoveTime = now;
      }
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
        // Primary: check for visible DOM ad elements only
        // This is the most reliable signal — video stalls are network issues, not ads
        const adElements = document.querySelectorAll(AD_SELECTOR_STRING);
        if (adElements.length > 0) {
          for (let element of adElements) {
            const computed = window.getComputedStyle(element);
            const isVisible = computed.display !== 'none' &&
                              computed.visibility !== 'hidden' &&
                              parseFloat(computed.opacity) > 0.01;
            if (isVisible) {
              return true;
            }
          }
        }

        // Audio ad overlay detection
        const audioOverlay = document.querySelector('[data-a-target="ax-overlay"], .audio-ax-overlay, [class*="audio-ax-overlay"]');
        if (audioOverlay) {
          const computed = window.getComputedStyle(audioOverlay);
          if (computed.display !== 'none' && computed.visibility !== 'hidden') {
            return true;
          }
        }

        // Secondary: video was playing before (currentTime > 0) but is now completely frozen
        // currentTime === 0 means initial load — NOT an ad, just player initializing
        // readyState === 0 must persist for 10 seconds to avoid false positives from buffering
        const video = document.querySelector('video');
        if (video && video.currentTime > 2 && video.readyState === 0 && video.paused && !video.ended) {
          const now = Date.now();
          if (readyStateZeroSince === 0) {
            readyStateZeroSince = now;
            return false; // Don't trigger immediately
          }
          if (now - readyStateZeroSince >= 10000) { // Must persist 10 seconds
            const timeSinceInteraction = now - lastUserInteractionTime;
            if (timeSinceInteraction >= 5000) return true;
          }
        } else {
          readyStateZeroSince = 0;
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

      // Throttle ad detection polling
      if (now - lastAdDetectionTime < CONFIG.AD_CHECK_INTERVAL) {
        return;
      }
      lastAdDetectionTime = now;

      const video = document.querySelector('video');

      // Skip detection during initial player load — currentTime=0 means stream hasn't started yet
      if (!video || video.currentTime === 0) {
        return;
      }

      // Check if video is working normally
      if (video.readyState > 0 && !video.paused && !video.ended) {
        resetAdDetection();
        return;
      }

      if (isAdDetected()) {
        consecutiveAdChecks++;
        log.warn(`Ad detected (${consecutiveAdChecks}/${CONFIG.MAX_AD_RELOAD_ATTEMPTS})`);

        if (consecutiveAdChecks >= CONFIG.MAX_AD_RELOAD_ATTEMPTS) {
          log.warn('Max ad reload attempts reached — counter stays high, totalReloads cap is final guard');
          return;
        }

        // Check minimum delay between reloads (use separate lastReloadTime, not lastAdDetectionTime)
        if (now - lastReloadTime < CONFIG.MIN_RELOAD_DELAY) {
          return;
        }

        setTimeout(() => {
          if (isAdDetected()) {
            if (totalReloads >= MAX_TOTAL_RELOADS) {
              log.warn('Total reload cap reached — stopping auto-reload');
              resetAdDetection();
              return;
            }
            totalReloads++;
            log.info('Reloading page due to ad detection');
            lastReloadTime = Date.now();
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
    let currentAbortController = null;

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
      if (!video) return;

      // Abort previous listeners to prevent MaxListenersExceededWarning
      if (currentAbortController) {
        currentAbortController.abort();
      }

      const controller = new AbortController();
      currentAbortController = controller;

      const handleVideoError = () => {
        log.warn('Video error detected, scheduling reload');
        scheduleReload('video error');
      };

      const handleStall = () => {
        setTimeout(() => {
          const currentVideo = document.querySelector('video');
          if (currentVideo && currentVideo.readyState === 0) {
            scheduleReload('stalled');
          }
        }, 4000);
      };

      const handleWaiting = () => {
        setTimeout(() => {
          const currentVideo = document.querySelector('video');
          if (currentVideo && currentVideo.readyState === 0) {
            scheduleReload('waiting');
          }
        }, 5000);
      };

      const handlePlaying = () => {
        resetAttempts();
      };

      video.addEventListener('error', handleVideoError, { signal: controller.signal });
      video.addEventListener('stalled', handleStall, { signal: controller.signal });
      video.addEventListener('waiting', handleWaiting, { signal: controller.signal });
      video.addEventListener('playing', handlePlaying, { signal: controller.signal });
    };

    return {
      attachErrorHandlers,
      resetAttempts
    };
  })();

  // Unified MutationObserver with debounce — replaces two separate observers
  // to fix MaxListenersExceededWarning and reduce overhead
  const domWatcher = (() => {
    let lastPath = location.pathname;
    let debounceTimer = null;

    const onMutation = (mutations) => {
      let relevant = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Remove tracking pixels/scripts from ad domains (bypass fetch wrapper)
          if (node.tagName === 'IMG' || node.tagName === 'SCRIPT' || node.tagName === 'IFRAME') {
            const src = node.src || '';
            if (src && (isAdDomain(src) || isTrackingDomain(src) || src.includes('adforensics') || src.includes('amznidpxl') || src.includes('amazon-adsystem.com/cb'))) {
              node.remove();
              continue;
            }
          }
          if (node.matches?.(AD_SELECTOR_STRING)) { relevant = true; break; }
          if (node.classList?.contains('picture-by-picture-player')) {
            node.remove();
            log.info('Removed PBYP midroll DOM element');
            continue;
          }
          if (node.firstElementChild?.matches?.(AD_SELECTOR_STRING)) { relevant = true; break; }
          if (mutation.type === 'childList' && mutation.target === document.body) {
            relevant = true; break;
          }
        }
        if (relevant) break;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null;

        const video = document.querySelector('video');
        if (video) {
          playerErrorHandler.attachErrorHandlers(video);
        }

        if (CONFIG.SWITCH_FIX && location.pathname !== lastPath) {
          lastPath = location.pathname;
          playerErrorHandler.resetAttempts();
          currentPlayerTypeIdx = 0;
          consecutiveAdM3U8 = 0;
          currentUsherUrl = null;
          log.info('SPA navigation detected — reset cascade state');
          setTimeout(() => {
            removeAds();
          }, 300);
        }

        if (relevant) {
          removeAds();
        }
      }, CONFIG.DEBOUNCE_DELAY);
    };

    const setup = () => {
      // Attach to video immediately if already present
      const video = document.querySelector('video');
      if (video) playerErrorHandler.attachErrorHandlers(video);

      new MutationObserver(onMutation).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    };

    return { setup };
  })();

  // Kept for API compatibility
  const switchDetector = { setup: () => {} };
  const videoWatcher = { setup: () => {} };

  // Main initialization
  const init = (() => {
    let initialized = false;

    return () => {
      if (initialized) return;
      initialized = true;

      log.info('Initializing Optimized Twitch Adblock Fix v46.0.0...');

      // Inject CSS
      injectCSS();

      // Initial ad removal
      removeAds();

      // Setup detectors and watchers
      domWatcher.setup();
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

      log.info('Optimized Twitch Adblock Fix v46.0.0 initialized successfully');
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
