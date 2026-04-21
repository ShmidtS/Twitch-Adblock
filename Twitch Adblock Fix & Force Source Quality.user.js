// ==UserScript==
// @name Twitch Adblock Ultimate
// @namespace TwitchAdblockUltimate
// @version 59.0.0
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
      'adforensics.twitch.tv',
      'vaes.amazon-adsystem.com', 'aax.amazon-adsystem.com',
      'aax-us.amazon-adsystem.com', 'c.amazon-adsystem.com',
      'gin.twitch.tv', 'imprint.twitch.tv',
      'client-event.twitch.tv',
    ],

    // Tracking/analytics domains to block (not ad-specific but leak user data)
    TRACKING_DOMAINS: [
      'spade.twitch.tv',
      'sb.scorecardresearch.com',
      'scorecardresearch.com',
      'secure-sts-prod.imrworldwide.com',
      'imrworldwide.com',
      'api.sprig.com',
      'sprig.com',
      'amazon-adsystem.com',
      'supervisor.ext-twitch.tv',
      'science-output.s3.amazonaws.com',
      'client-event.twitch.tv',
      'gin.twitch.tv',
      'imprint.twitch.tv',
    ],

    // URL path patterns for precise ad blocking (checked before domain-level)
    AD_URL_PATTERNS: [
      { domain: 'amazon-adsystem.com', path: '/iu3' },
      { domain: 'amazon-adsystem.com', path: '/iui3' },
      { domain: 'amazon-adsystem.com', path: '/noop/' },
      { domain: 'amazon-adsystem.com', path: '/e/ipb/' },
      { domain: 'amazon-adsystem.com', path: '/x/px/' },
      { domain: 'amazon-adsystem.com', path: '/e/dtb/' },
      { domain: 'amazon-adsystem.com', path: '/g/' },
      { domain: 'amazon-adsystem.com', path: '/cb' },
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
      // v48.0.0 additional selectors
      '.pause-ad-container',
      '[class*="pause-ad"]',
      '[data-a-target="outstream-ax-overlay"]',
      '.outstream-vertical-video',
      '[class*="outstream-vertical"]',
      '.stream-display-ad__iframe',
      '[data-test-selector="sda-wrapper"]',
      '[data-test-selector="sda-container"]',
      '[data-test-selector="sda-frame"]',
      '.side-nav-card-sponsored-loading-bottom',
      '[class*="sda-lshape"]',
      '[class*="sda-ad-edge"]',
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
      /#EXT-X-DATERANGE:.*CLASS="twitch-maf-ad"/,
      /#EXT-X-DATERANGE:.*CLASS="twitch-ad-quartile"/,
      /#EXT-X-DATERANGE:.*CLASS="twitch-stream-source"/,
      /#EXT-X-DATERANGE:.*CLASS="stitched_ad"/,
      /#EXT-X-DATERANGE:.*ID="stitched-ad-/,
      /#EXT-X-SCTE35-OUT.*ad/i,
      /#EXT-X-TWITCH-ADS/,
      /#EXT-X-DATERANGE:.*CLASS="[^"]*_ad"/i,
      /#EXT-X-DATERANGE:.*CLASS="twitch-[^"]*ad[^"]*"/i,
      /#EXT-X-DATERANGE:.*CLASS="AD_BREAK"/,
      /#EXT-X-DATERANGE:.*CLASS="FREEWHEEL"/,
    ],
    M3U8_AD_END_MARKERS: [
      /#EXT-X-DATERANGE:.*END-DATE/,
      /#EXT-X-SCTE35-IN/,
    ],
    // Legacy string markers for direct matching
    M3U8_AD_STRINGS: [
      'SCTE35-AD', 'EXT-X-TWITCH-AD', 'STREAM-DISPLAY-AD',
      'EXT-X-AD', 'EXT-X-TWITCH-PREROLL-AD',
      'EXT-X-TWITCH-MIDROLL-AD', 'EXT-X-TWITCH-POSTROLL-AD',
      'EXT-X-TWITCH-AD-PLUGIN', 'EXT-X-TWITCH-AD-CREATIVE',
      'EXT-X-TWITCH-PREROLL', 'EXT-X-TWITCH-MIDROLL', 'EXT-X-TWITCH-POSTROLL',
      'URI="ad"', 'stitched-ad',
      'X-TTV-MAF-AD', 'X-TV-TWITCH-AD', 'twitch-maf-ad', 'twitch-ad-quartile',
      'X-TTV-MAF-AD-COMMERCIAL-ID', 'X-TTV-MAF-AD-AD-SESSION-ID',
      'X-TTV-MAF-AD-PRIMARY-POD', 'X-TTV-MAF-AD-RADS-TOKEN',
      'X-TTV-MAF-AD-DECISION', 'X-TTV-MAF-AD-SDA-SEQUENCE-LENGTH',
      'X-TTV-MAF-AD-FALLBACK-FORMATS',
      'CLASS="AD_BREAK"', 'CLASS="FREEWHEEL"',
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
    const prefix = '[TTV ADBLOCK FIX v59.0.0]';
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
  const PLAYER_TYPE_CASCADE = ['site', 'embed', 'thunderdome'];
  const BACKUP_PLAYER_TYPES = ['embed', 'popout', 'autoplay'];
  let currentPlayerTypeIdx = 0;
  let consecutiveAdM3U8 = 0;
  const MAX_CONSECUTIVE_AD_M3U8 = 3;
  let globalReloadCount = 0;
  const GLOBAL_MAX_RELOADS = 6;
  let currentUsherUrl = null;
  let pendingReplacement = null;
  let currentChannelName = null;
  let backupEncodingsCache = {};
  const ENCODINGS_CACHE_TTL = 30000;
  const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  let gqlDeviceId = null;
  let gqlAuthorization = undefined;

  // Fetch a clean PlaybackAccessToken independently (vaft approach)
  const getAccessToken = async (channelName, playerType) => {
    try {
      if (!gqlDeviceId) {
        gqlDeviceId = '';
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) gqlDeviceId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const headers = {
        'Client-ID': GQL_CLIENT_ID,
        'X-Device-Id': gqlDeviceId,
        'Content-Type': 'application/json',
      };
      if (gqlAuthorization) headers['Authorization'] = gqlAuthorization;
      const body = {
        operationName: 'PlaybackAccessToken',
        variables: {
          isLive: true,
          login: channelName,
          isVod: false,
          vodID: '',
          playerType: playerType,
          platform: playerType === 'autoplay' ? 'android' : 'web',
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9',
          },
        },
      };
      const resp = await originalFetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (resp.ok) return await resp.json();
    } catch (e) {
      log.debug('getAccessToken failed:', e);
    }
    return null;
  };

  // Fetch a clean M3U8 via independent GQL + Usher (vaft approach)
  const fetchCleanM3U8 = async (channelName, playerType) => {
    try {
      const accessTokenResp = await getAccessToken(channelName, playerType);
      if (!accessTokenResp?.data?.streamPlaybackAccessToken) return null;
      const token = accessTokenResp.data.streamPlaybackAccessToken;
      const isV2 = currentUsherUrl?.includes('/api/v2/');
      const usherBase = isV2
        ? `https://usher.ttvnw.net/api/v2/channel/hls/${channelName}.m3u8`
        : `https://usher.ttvnw.net/api/channel/hls/${channelName}.m3u8`;
      const usherUrl = new URL(usherBase);
      usherUrl.searchParams.set('sig', token.signature);
      usherUrl.searchParams.set('token', token.value);
      // Copy existing Usher params except sig/token/player_type
      if (currentUsherUrl) {
        try {
          const existingParams = new URL(currentUsherUrl).searchParams;
          for (const [key, value] of existingParams) {
            if (!['sig', 'token', 'player_type', 'parent_domains'].includes(key)) {
              usherUrl.searchParams.set(key, value);
            }
          }
        } catch (e) {}
      }
      // Remove parent_domains — Twitch uses it to determine embed context and inject ads
      usherUrl.searchParams.delete('parent_domains');
      usherUrl.searchParams.set('player_type', playerType);
      const m3u8Resp = await originalFetch(usherUrl.toString());
      if (m3u8Resp.ok) {
        const text = await m3u8Resp.text();
        if (text.includes('#EXTM3U')) return text;
      }
    } catch (e) {
      log.debug('fetchCleanM3U8 failed:', e);
    }
    return null;
  };

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
        for (let q = 1; q <= 4; q++) {
          const quartile = q;
          setTimeout(() => {
            const fakeEvent = {
              operationName: 'ClientSideAdEventHandling_RecordAdEvent',
              variables: {
                input: {
                  eventName: 'video_ad_quartile_complete',
                  eventPayload: JSON.stringify({
                    adQuartile: quartile,
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
          }, quartile * 1500);
        }
        log.info('Sending fake ad-quartile sequence 1-4');
      } catch (e) {}
    };
  })();

  // Intercept window.__vat — Twitch bootstrap pre-loads PlaybackAccessToken before our
  // fetch wrapper processes it. The player reads the cached response from __vat.request
  // and skips our GQL cleaning. Strategy: change playerType to force cache MISS, so
  // the player re-fetches VAT through our intercepted fetch with playerType="embed".
  const interceptVAT = (() => {
    const patchedVATs = new WeakSet();
    const patchVATRequest = (vat) => {
      if (!vat || patchedVATs.has(vat)) return;
      patchedVATs.add(vat);

      const desiredPlayerType = PLAYER_TYPE_CASCADE[currentPlayerTypeIdx] || 'embed';

      if (vat.playerType !== desiredPlayerType) {
        log.info(`__vat playerType=${vat.playerType}, changing to ${desiredPlayerType} to force cache miss`);
        vat.playerType = desiredPlayerType;
      }

      // Do NOT modify vat.request or its response body.
      // The PlaybackAccessToken value is cryptographically signed by Twitch.
      // Any modification (even adblock/http_only flags) invalidates the signature,
      // causing 403 nauth_sig_invalid on M3U8 requests.
      // The M3U8 cleaning pipeline handles ad removal at the stream level instead.
      log.info('VAT playerType patched — M3U8 cleaning handles ads');
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

  // Intercept window.__playerBootstrap — Twitch IVS player bootstrap may carry
  // ad-related configuration before our fetch wrapper processes requests.
  const interceptPlayerBootstrap = (() => {
    let bootstrapValue = null;
    try {
      Object.defineProperty(unsafeWindow, '__playerBootstrap', {
        get() { return bootstrapValue; },
        set(val) {
          bootstrapValue = val;
          if (val && typeof val === 'object') {
            if (val.adConfig) {
              val.adConfig = {};
              log.info('__playerBootstrap: stripped adConfig');
            }
            if (val.forceAds) {
              val.forceAds = false;
              log.info('__playerBootstrap: disabled forceAds');
            }
          }
        },
        configurable: true,
        enumerable: true
      });
      log.info('Installed __playerBootstrap interceptor');
    } catch (e) {
      log.debug('__playerBootstrap interceptor install failed:', e);
    }
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
      'AdRequestHandling',
      'AdRequestContext',
      'AdRequestBroadcaster',
      'AdRequestGame',
      'AdRequestContentLabel',
      'AdRequestTag',
      'AdRequestProp',
      'AdRequestVOD',
      'AdRequested',
      'AdRequester',
      'AdRequestDecline',
      'AdRequestDeclined',
      'AdRequestBlocked',
      'AdRequestError',
      'RateLimitPreroll',
      'ForcePreroll',
      'ForceMidroll',
      'ForcePostroll',
      'ForceWeaverAds',
      'AdQuartile',
      'CommercialCommandHandler_ChannelData',
      'ChannelCommercialBreakUpdate',
      'CommercialBreakUpdate',
      'SdaRenderingEntrypoint',
      'PlayerDisplayAdRequest',
      'VlmMidroll',
      'MafsDecision',
      'AdOpportunityStart',
      'AdOpportunityAbort',
      'AdClientPodCompletion',
      'AdClientQuartile',
      'AdClientImpression',
      'AdFormatRequest',
      'VideoAdError',
      'AudioAdFormat',
      'StandardAudioAd',
      'LowerThirdAd',
      'MirrorPbyPAd',
      'TurboAdsUpsell',
      'ClientSideAdSelection',
      'VodArchiveMidroll',
      'WithVideoAdEvents',
      'AdImpressionComplete',
      'AdOverlayContainer',
      'AdTrackingURLsComplete',
      'AdTrackingURLsStart',
      'AdTrackingUrls',
    ]);

    const _adPrefixRegex = /^(?:ClientSide|Fill|Process|Video|Stream|Audio|Get|Report|Track|Instream|Outstream)Ad/i;
    const _commercialRegex = /^Commercial/i;
    const _sponsorRegex = /^Sponsor(?!shipAccessToken)/i;
    const _marketingRegex = /^Marketing/i;
    const _promoRegex = /^Promo(?!tionAccessToken)/i;
    const LEGITIMATE_OPS = new Set(['PlaybackAccessToken', 'VideoPlayerStreamOverlay', 'VideoPlayerStreamInfo', 'StreamMetadata', 'AddChannel', 'AdjustPlayback', 'AddStreamTag']);
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

          let isAdOperation = adOperationNames.has(opName) ||
            _adPrefixRegex.test(opName) ||
            _commercialRegex.test(opName) ||
            _sponsorRegex.test(opName) ||
            _marketingRegex.test(opName) ||
            _promoRegex.test(opName) ||
            _pbypRegex.test(opName);

          if (!isAdOperation && !LEGITIMATE_OPS.has(opName) && /\bAd[A-Z]/.test(opName)) {
            isAdOperation = true;
            log.info(`Catch-all matched unknown ad operation: ${opName}`);
          }

          if (isAdOperation) {
            // Neutralize ad operations: preserve variable names with safe values
            // to prevent GraphQL schema errors that trigger Twitch retry/fallback
            operation.extensions = operation.extensions || {};
            operation.extensions.operationMask = { id: 0 };
            const safeVars = {};
            if (operation.variables && typeof operation.variables === 'object') {
              for (const key of Object.keys(operation.variables)) {
                const val = operation.variables[key];
                if (val === null || val === undefined) {
                  safeVars[key] = '';
                } else if (typeof val === 'string') {
                  safeVars[key] = '';
                } else {
                  safeVars[key] = val;
                }
              }
            }
            operation.variables = safeVars;
            operation.query = `query ${opName}{__typename}`;
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
    const markersCombined = new RegExp(CONFIG.M3U8_AD_MARKERS.map(r => r.source).join('|'));
    const endMarkersCombined = new RegExp(CONFIG.M3U8_AD_END_MARKERS.map(r => r.source).join('|'));

    return (text) => {
      // Early bailout: skip processing if no ad markers present
      if (!markerRegex.test(text) && !markersCombined.test(text)) {
        return text;
      }

      const lines = text.split('\n');
      const filteredLines = [];
      let inAdBreak = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for ad break start markers (compiled single regex)
        if (markersCombined.test(line)) {
          inAdBreak = true;
          continue;
        }

        // Check for ad break end markers (compiled single regex)
        if (endMarkersCombined.test(line)) {
          inAdBreak = false;
          continue;
        }

        // Check for direct string ad markers
        if (markerRegex.test(line)) {
          continue;
        }

        // Skip all lines while inside an ad break — exit on DISCONTINUITY
        if (inAdBreak) {
          if (line === '#EXT-X-DISCONTINUITY') {
            inAdBreak = false;
            filteredLines.push('#EXT-X-DISCONTINUITY');
            continue;
          }
          continue;
        }

        filteredLines.push(line);
      }

      let cleaned = filteredLines.join('\n');

      // Safety net: if cleaning removed all content segments, return original
      const hasContentSegments = filteredLines.some(line =>
        line.trim() && !line.startsWith('#') && line.includes('://')
      );
      if (!hasContentSegments && text.split('\n').some(line =>
        line.trim() && !line.startsWith('#') && line.includes('://')
      )) {
        log.warn('M3U8 cleaning removed all segments — returning original');
        return text;
      }

      // Force chunked quality if enabled
      if (CONFIG.FORCE_CHUNKED) {
        const chunkedMatch = cleaned.match(/#EXT-X-STREAM-INF:[^\n]*?(?:VIDEO="chunked"|NAME="Source"|исходное)[^\n]*\n([^\n]+)/i);

        if (chunkedMatch) {
          const chunkedUrl = chunkedMatch[1].trim();
          cleaned = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO="chunked"\n${chunkedUrl}`;
        } else {
          log.warn('FORCE_CHUNKED: no chunked/Source stream found in M3U8');
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
    'vodArchiveMidrolls', 'hasVodAdsEnabled', 'adFormatMetadata',
    'adFormatRequest', 'videoAdMetadata', 'videoAdRequest',
    'feedAdMetadata', 'mirrorPbyPAdMetadata', 'isShowingMirrorPbyPAdPod',
    'isShowingTurboAdsUpsell', 'triggerAfterAdBreakTurboUpsell',
    'mafsDecision', 'radsToken', 'adSessionID',
    'clientSideAdSelectionParams', 'broadcasterInitiated',
  ]);

  const cleanGQLResponse = (data) => {
    const ops = Array.isArray(data) ? data : [data];
    let modified = false;

    for (const op of ops) {
      if (!op || typeof op !== 'object') continue;

      // Walk the response object recursively — but NEVER touch streamPlaybackAccessToken
      // (its value is cryptographically signed; any modification = 403 nauth_sig_invalid)
      const walk = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
          if (key === 'streamPlaybackAccessToken') continue;
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
      } else if (op.data?.streamPlaybackAccessToken?.authorization) {
        if (currentPlayerTypeIdx > 0) {
          currentPlayerTypeIdx = 0;
          log.info('PlaybackAccessToken OK, resetting cascade to embed');
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
var _mc={};
var _ac=new Map();
var _rid=0;
var _adSegCache=new Map();
var _tinyVid='data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAAAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoABaABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoFAX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA';
if(typeof SpadeClient!=='undefined'){SpadeClient.prototype.send=function(){return -1};}
self.addEventListener('message',function(e){
if(e.data&&e.data.__ttv_adblock&&e.data.type==='clean_m3u8_response'){
var id=e.data.requestId;
if(_ac.has(id)){var cb=_ac.get(id);_ac.delete(id);cb(e.data.m3u8);}}
});
function reqCleanM3U8(url){
return new Promise(function(resolve){
var id=++_rid;
_ac.set(id,resolve);
self.postMessage({__ttv_adblock:true,type:'clean_m3u8_request',url:url,requestId:id});});
}
self.fetch=function(input,init){
var url=(input instanceof Request?input.url:input)+"";
var _uk=url.split("?")[0];
var _now=Date.now();
if(_mc[_uk]&&_now-_mc[_uk].t<30000){return Promise.resolve(new Response(new Blob([_mc[_uk].text]),{status:200,headers:{"Content-Type":"application/vnd.apple.mpegurl"}}))}
try{var h=new URL(url).hostname;
var bd=["edge.ads.twitch.tv","amazon-adsystem.com","sq-tungsten-ts.amazon-adsystem.com","ads.ttvnw.net","ad.twitch.tv",
"video.ad.twitch.tv","stream-display-ad.twitch.tv","doubleclick.net","googlesyndication.com",
"criteo.com","taboola.com","outbrain.com","imasdk.googleapis.com","cdn.segment.com",
"sponsored-content.twitch.tv","promotions.twitch.tv","marketing.twitch.tv",
"partners.twitch.tv","sponsors.twitch.tv","adforensics.twitch.tv",
"vaes.amazon-adsystem.com","aax.amazon-adsystem.com","aax-us.amazon-adsystem.com",
"c.amazon-adsystem.com","gin.twitch.tv","imprint.twitch.tv","client-event.twitch.tv",
"spade.twitch.tv","sb.scorecardresearch.com","scorecardresearch.com","supervisor.ext-twitch.tv",
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
var hasAd=text.indexOf("stitched")!==-1||text.indexOf("X-TTV-MAF-AD")!==-1||
text.indexOf("twitch-maf-ad")!==-1||text.indexOf("twitch-ad-quartile")!==-1||
text.indexOf("X-TV-TWITCH-AD")!==-1||text.indexOf("SCTE35-AD")!==-1||
/#EXT-X-DATERANGE:.*CLASS="(com\\.twitch\\.ttv\\.pts\\.dai|twitch_ad|twitch-maf-ad|twitch-ad-quartile|stitched_ad)"/.test(text)||
/#EXT-X-DATERANGE:.*ID="stitched-ad-/.test(text)||/#EXT-X-TWITCH-ADS/.test(text)||
text.indexOf("AD_BREAK")!==-1||text.indexOf("FREEWHEEL")!==-1;
if(hasAd){
self.postMessage({__ttv_adblock:true,type:"ad_detected",url:url});
return reqCleanM3U8(url).then(function(cleanText){
if(cleanText){if(cleanText.indexOf("#EXT-X-STREAM-INF")!==-1)_mc[_uk]={t:_now,text:cleanText};
try{self.postMessage({__ttv_adblock:true,type:"m3u8_replaced",url:url})}catch(e){}
return new Response(new Blob([cleanText]),{status:r.status,headers:{"Content-Type":"application/vnd.apple.mpegurl"}});}
var ls=text.split("\\n"),fl=[],iab=false;
var am=[/#EXT-X-DATERANGE:.*CLASS="com\\.twitch\\.ttv\\.pts\\.dai"/,
/#EXT-X-DATERANGE:.*CLASS="twitch_ad"/,
/#EXT-X-DATERANGE:.*CLASS="twitch-maf-ad"/,
/#EXT-X-DATERANGE:.*CLASS="twitch-ad-quartile"/,
/#EXT-X-DATERANGE:.*CLASS="twitch-stream-source"/,
/#EXT-X-DATERANGE:.*CLASS="stitched_ad"/,
/#EXT-X-DATERANGE:.*ID="stitched-ad-/,
/#EXT-X-SCTE35-OUT.*ad/i,/#EXT-X-TWITCH-ADS/,
/#EXT-X-DATERANGE:.*CLASS="[^"]*_ad"/i,
/#EXT-X-DATERANGE:.*CLASS="twitch-[^"]*ad[^"]*"/i,
/#EXT-X-DATERANGE:.*CLASS="AD_BREAK"/,
/#EXT-X-DATERANGE:.*CLASS="FREEWHEEL"/];
var em=[/#EXT-X-DATERANGE:.*END-DATE/,/#EXT-X-SCTE35-IN/];
var as=new RegExp(["SCTE35-AD","EXT-X-TWITCH-AD","STREAM-DISPLAY-AD","EXT-X-AD",
"EXT-X-TWITCH-PREROLL-AD","EXT-X-TWITCH-MIDROLL-AD","EXT-X-TWITCH-POSTROLL-AD",
"EXT-X-TWITCH-AD-PLUGIN","EXT-X-TWITCH-AD-CREATIVE","EXT-X-TWITCH-PREROLL",
"EXT-X-TWITCH-MIDROLL","EXT-X-TWITCH-POSTROLL",'URI="ad"',"stitched-ad",
"X-TTV-MAF-AD","X-TV-TWITCH-AD","twitch-maf-ad","twitch-ad-quartile",
"X-TTV-MAF-AD-COMMERCIAL-ID","X-TTV-MAF-AD-AD-SESSION-ID",
"X-TTV-MAF-AD-PRIMARY-POD","X-TTV-MAF-AD-RADS-TOKEN",
"X-TTV-MAF-AD-DECISION","X-TTV-MAF-AD-SDA-SEQUENCE-LENGTH",
"X-TTV-MAF-AD-FALLBACK-FORMATS",'CLASS="AD_BREAK"','CLASS="FREEWHEEL"'].join("|"));
for(var i=0;i<ls.length;i++){var l=ls[i],isS=false,isE=false;
for(var j=0;j<am.length;j++){if(am[j].test(l)){isS=true;break}}
if(isS){iab=true;continue}
for(var j=0;j<em.length;j++){if(em[j].test(l)){isE=true;break}}
if(isE){iab=false;continue}
if(as.test(l))continue;
if(iab){if(l.indexOf("#EXT-X-DISCONTINUITY")===0){
iab=false;fl.push("#EXT-X-DISCONTINUITY");continue}continue}
fl.push(l)}
var c=fl.join("\\n");
if(!c.match(/https?:\\/\\//))return r;
var cm=c.match(/#EXT-X-STREAM-INF:[^\\n]*?(?:VIDEO="chunked"|NAME="Source"|\\u0438\\u0441\\u0445\\u043e\\u0434\\u043d\\u043e\\u0435)[^\\n]*\\n([^\\n]+)/i);
if(cm)c="#EXTM3U\\n#EXT-X-VERSION:3\\n#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO=\\"chunked\\"\\n"+cm[1].trim();
if(c.indexOf("#EXT-X-STREAM-INF")!==-1)_mc[_uk]={t:_now,text:c};try{self.postMessage({__ttv_adblock:true,type:"m3u8_cleaned",url:url})}catch(e){}
return new Response(new Blob([c]),{status:r.status,headers:{"Content-Type":"application/vnd.apple.mpegurl"}});});
}
var cm=text.match(/#EXT-X-STREAM-INF:[^\\n]*?(?:VIDEO="chunked"|NAME="Source"|\\u0438\\u0441\\u0445\\u043e\\u0434\\u043d\\u043e\\u0435)[^\\n]*\\n([^\\n]+)/i);
if(cm){var cs="#EXTM3U\\n#EXT-X-VERSION:3\\n#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO=\\"chunked\\"\\n"+cm[1].trim();
if(cs!==text){if(cs.indexOf("#EXT-X-STREAM-INF")!==-1)_mc[_uk]={t:_now,text:cs};return new Response(new Blob([cs]),{status:r.status,headers:{"Content-Type":"application/vnd.apple.mpegurl"}});}}
return r;})})};
})();`;

  unsafeWindow.Worker = function (scriptUrl, options) {
    const url = String(scriptUrl);

    if (!url.includes('twitch') && !url.includes('ttvnw') && !url.includes('amazon-ivs') && !url.startsWith('blob:')) {
      return new _OriginalWorker(scriptUrl, options);
    }

    function attachWorkerListener(worker) {
      worker.addEventListener('message', (e) => {
        if (!e.data?.__ttv_adblock) return;
        const msg = e.data;

        if (msg.type === 'm3u8_cleaned') {
          log.info('Worker M3U8 cleaned:', msg.url?.substring(0, 60));
        } else if (msg.type === 'ad_detected') {
          log.info('Worker ad detected in M3U8:', msg.url?.substring(0, 60));
        } else if (msg.type === 'm3u8_replaced') {
          log.info('Worker M3U8 replaced with clean stream:', msg.url?.substring(0, 60));
        } else if (msg.type === 'clean_m3u8_request') {
          // Worker requests a clean M3U8 — use vaft approach (independent GQL + Usher)
          (async () => {
            let cleanText = null;
            const cacheKey = msg.url?.split('?')[0];
            // Check cache first to avoid GQL spam
            const cached = cacheKey ? backupEncodingsCache[cacheKey] : null;
            if (cached && Date.now() - cached.t < ENCODINGS_CACHE_TTL) {
              cleanText = cached.text;
            } else {
              let channelName = currentChannelName;
              if (!channelName && msg.url) {
                const chMatch = msg.url.match(/\/hls\/([^/.]+)/);
                if (chMatch) channelName = chMatch[1];
              }
              if (!channelName) {
                try {
                  const pMatch = location.pathname.match(/^\/(popout\/)?([^/]+)/);
                  if (pMatch && pMatch[2] && !['directory','videos','settings','friends','inventory','payments','subscriptions','tags',' Following','followers'].includes(pMatch[2])) channelName = pMatch[2];
                } catch(e) {}
              }
              if (channelName) {
                for (const backupType of BACKUP_PLAYER_TYPES) {
                  try {
                    const encodings = await fetchCleanM3U8(channelName, backupType);
                    if (encodings) {
                      // Always use encodings — clean ads from it if present
                      const cleanEncodings = cleanM3U8(encodings);
                      // Media playlist request — must return media playlist, never master playlist
                      if (msg.url && !msg.url.includes('usher.ttvnw.net')) {
                        const lines = cleanEncodings.replaceAll('\r', '').split('\n');
                        // Prefer chunked/Source quality
                        for (let i = 0; i < lines.length - 1; i++) {
                          if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('://')) {
                            const isChunked = /VIDEO="chunked"|NAME="Source"|исходное/.test(lines[i]);
                            if (isChunked) {
                              const streamUrl = lines[i + 1].trim();
                              try {
                                const streamResp = await originalFetch(streamUrl);
                                if (streamResp.ok) {
                                  const streamText = await streamResp.text();
                                  if (streamText.includes('#EXTM3U') && streamText.includes('#EXTINF')) {
                                    const cleanMedia = cleanM3U8(streamText);
                                    if (cleanMedia.includes('#EXTINF')) {
                                      cleanText = cleanMedia;
                                      log.info(`Worker backup stream found (${backupType}, chunked)`);
                                      break;
                                    }
                                  }
                                }
                              } catch (e) {}
                            }
                          }
                        }
                        // Fallback: highest bandwidth media playlist
                        if (!cleanText) {
                          const candidates = [];
                          for (let i = 0; i < lines.length - 1; i++) {
                            if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('://')) {
                              const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0', 10);
                              candidates.push({ url: lines[i + 1].trim(), bandwidth: bw });
                            }
                          }
                          candidates.sort((a, b) => b.bandwidth - a.bandwidth);
                          for (const { url: streamUrl, bandwidth } of candidates) {
                            try {
                              const streamResp = await originalFetch(streamUrl);
                              if (streamResp.ok) {
                                const streamText = await streamResp.text();
                                if (streamText.includes('#EXTM3U') && streamText.includes('#EXTINF')) {
                                  const cleanMedia = cleanM3U8(streamText);
                                  if (cleanMedia.includes('#EXTINF')) {
                                    cleanText = cleanMedia;
                                    log.info(`Worker backup stream found (${backupType}, ${bandwidth}bps)`);
                                    break;
                                  }
                                }
                              }
                            } catch (e) { log.debug('Media playlist fetch failed:', e.message); }
                          }
                        }
                      } else {
                        // Encodings M3U8 from Usher — return cleaned directly
                        cleanText = cleanEncodings;
                      }
                      if (cleanText) {
                        // Cache the result
                        if (cacheKey) backupEncodingsCache[cacheKey] = { t: Date.now(), text: cleanText };
                        break;
                      }
                    }
                  } catch (e) {
                    log.debug(`Worker backup fetch failed for ${backupType}:`, e);
                  }
                }
              }
            }
            worker.postMessage({
              __ttv_adblock: true,
              type: 'clean_m3u8_response',
              requestId: msg.requestId,
              m3u8: cleanText,
            });
          })();
        }
      });
    }

    if (options && options.type === 'module') {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
          const src = xhr.responseText;
          if (/^import\s/m.test(src)) {
            log.warn('Module Worker has top-level imports, skipping proxy:', url.substring(0, 80));
            return new _OriginalWorker(scriptUrl, options);
          }
          const patchedCode = workerInjection + '\n' + src;
          const patchedBlob = new Blob([patchedCode], { type: 'application/javascript' });
          const patchedUrl = URL.createObjectURL(patchedBlob);
          const worker = new _OriginalWorker(patchedUrl, options);
          setTimeout(() => URL.revokeObjectURL(patchedUrl), 1000);
          attachWorkerListener(worker);
          log.info('Module Worker proxy installed for:', url.substring(0, 80));
          return worker;
        }
      } catch (e) {
        log.warn('Module Worker proxy failed, using original:', e.message);
      }
      return new _OriginalWorker(scriptUrl, options);
    }

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
        const safeUrl = url.replace(/[^a-zA-Z0-9\-:/?.&=_]/g, '');
        const bootstrapCode = workerInjection + '\nimportScripts("' + safeUrl + '");\n';
        const bootstrapBlob = new Blob([bootstrapCode], { type: 'application/javascript' });
        const bootstrapUrl = URL.createObjectURL(bootstrapBlob);
        const worker = new _OriginalWorker(bootstrapUrl, options);
        setTimeout(() => URL.revokeObjectURL(bootstrapUrl), 1000);
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
          if (auth && auth !== 'undefined') {
            savedGQLHeaders['Authorization'] = auth;
            gqlAuthorization = auth;
          }
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
          const abortBody = JSON.stringify([{ data: null, errors: [{ message: 'Aborted' }] }]);
          return new Response(abortBody, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        log.debug('GQL response interception error:', error);
      }
    }

    // Handle M3U8 streams
    if (url.includes('.m3u8') || url.includes('usher.ttvnw.net')) {
      log.info('M3U8 fetch intercepted:', url.substring(0, 80));
      // Store Usher URL and extract channel name for stream replacement
      if (url.includes('usher.ttvnw.net')) {
        currentUsherUrl = url;
        try {
          const pathMatch = url.match(/channel\/hls\/([^/.]+)/);
          if (pathMatch) currentChannelName = pathMatch[1];
        } catch (e) {}
      }

      const response = await originalFetch(input, init);

      if (!response.ok) return response;

      const text = await response.clone().text();

      if (text.includes('#EXTM3U')) {
        // Detect stitched-ad in media playlist — trigger stream replacement
        const hasStitchedAd = text.includes('stitched-ad') ||
          text.includes('stitched_ad') ||
          /#EXT-X-DATERANGE:.*ID="stitched-ad/.test(text) ||
          /#EXT-X-DATERANGE:.*CLASS="stitched_ad"/.test(text) ||
          /#EXT-X-DATERANGE:.*CLASS=".*stitched.*ad.*"/i.test(text);
        const hasAdMarkers = CONFIG.M3U8_AD_MARKERS.some(regex => regex.test(text)) ||
          CONFIG.M3U8_AD_STRINGS.some(s => text.includes(s));
        const hasAnyAd = hasStitchedAd || hasAdMarkers;

        if (hasAnyAd && currentChannelName) {
          consecutiveAdM3U8++;
          log.info(`M3U8 ad detected (count: ${consecutiveAdM3U8})`);
          sendFakeAdQuartile();

          // vaft approach: try backup player types with independent GQL + Usher fetch
          for (const backupType of BACKUP_PLAYER_TYPES) {
            try {
              const rawEncodings = await fetchCleanM3U8(currentChannelName, backupType);
              if (rawEncodings) {
                // Always clean ads from backup — don't skip if ads present
                const cleanEncodings = cleanM3U8(rawEncodings);
                // Media playlist request — must return media playlist, never master playlist
                if (!url.includes('usher.ttvnw.net')) {
                  const lines = cleanEncodings.replaceAll('\r', '').split('\n');
                  // Prefer chunked/Source quality
                  for (let i = 0; i < lines.length - 1; i++) {
                    if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('://')) {
                      if (/VIDEO="chunked"|NAME="Source"|исходное/.test(lines[i])) {
                        const mediaUrl = lines[i + 1].trim();
                        try {
                          const mediaResp = await originalFetch(mediaUrl);
                          if (mediaResp.ok) {
                            const mediaText = await mediaResp.text();
                            if (mediaText.includes('#EXTM3U') && mediaText.includes('#EXTINF')) {
                              const cleanMedia = cleanM3U8(mediaText);
                              if (cleanMedia.includes('#EXTINF')) {
                                log.info(`Replaced with clean stream (${backupType}, chunked)`);
                                consecutiveAdM3U8 = 0;
                                return new Response(
                                  new Blob([cleanMedia]),
                                  { status: response.status, headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'application/vnd.apple.mpegurl' } }
                                );
                              }
                            }
                          }
                        } catch (e) {}
                      }
                    }
                  }
                  // Fallback: highest bandwidth media playlist
                  const candidates = [];
                  for (let i = 0; i < lines.length - 1; i++) {
                    if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('://')) {
                      const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0', 10);
                      candidates.push({ url: lines[i + 1].trim(), bandwidth: bw });
                    }
                  }
                  candidates.sort((a, b) => b.bandwidth - a.bandwidth);
                  for (const { url: mediaUrl, bandwidth } of candidates) {
                    try {
                      const mediaResp = await originalFetch(mediaUrl);
                      if (mediaResp.ok) {
                        const mediaText = await mediaResp.text();
                        if (mediaText.includes('#EXTM3U') && mediaText.includes('#EXTINF')) {
                          const cleanMedia = cleanM3U8(mediaText);
                          if (cleanMedia.includes('#EXTINF')) {
                            log.info(`Replaced with clean stream (${backupType}, ${bandwidth}bps)`);
                            consecutiveAdM3U8 = 0;
                            return new Response(
                              new Blob([cleanMedia]),
                              { status: response.status, headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'application/vnd.apple.mpegurl' } }
                            );
                          }
                        }
                      }
                    } catch (e) { log.debug('Media playlist fetch failed:', e.message); }
                  }
                  // No clean media playlist found — continue to next backup type
                } else {
                  // This is the encodings M3U8 from Usher — return cleaned version
                  log.info(`Replaced encodings M3U8 with clean stream (${backupType})`);
                  consecutiveAdM3U8 = 0;
                  return new Response(
                    new Blob([cleanEncodings]),
                    { status: response.status, headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'application/vnd.apple.mpegurl' } }
                  );
                  }
              }
            } catch (e) {
              log.debug(`Backup fetch failed for ${backupType}:`, e);
            }
          }

          // Fallback: advance cascade and try old replacement
          if (consecutiveAdM3U8 >= MAX_CONSECUTIVE_AD_M3U8 && currentUsherUrl && currentPlayerTypeIdx < PLAYER_TYPE_CASCADE.length - 1) {
            currentPlayerTypeIdx++;
            consecutiveAdM3U8 = 0;
            log.info(`Advancing cascade to ${PLAYER_TYPE_CASCADE[currentPlayerTypeIdx]} due to repeated ads`);

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
        } else if (!hasAnyAd) {
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
    if (message && typeof message === 'object' && message.type && /\bad\b|tracking|spade|supervisor/i.test(message.type)) {
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
      '[class*="channel_skin"]': 'display:none!important;',
      '[class*="vertical-video"]': 'display:none!important;',
      '[class*="squeezeback"]': 'display:none!important;height:0!important;overflow:hidden!important;',
      '[class*="lower-third"]': 'display:none!important;height:0!important;overflow:hidden!important;',
      '[class*="left-third"]': 'display:none!important;width:0!important;overflow:hidden!important;',
      '[class*="skyscraper"]': 'display:none!important;width:0!important;overflow:hidden!important;',
      '[class*="sda-lshape"]': 'display:none!important;width:0!important;overflow:hidden!important;',
      '[class*="sda-ad-edge"]': 'display:none!important;overflow:hidden!important;',
      '.side-nav-card-sponsored-loading-bottom': 'display:none!important;',
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
          if (element.querySelector('video')) continue;
          batchRemover.add(element);
        }
      } catch (error) {
        log.error('Core ad removal error:', error);
      }

      // SDA collapse: all formats — pushdown, squeezeback, lower-third, left-third, skyscraper
      try {
        const sdaSelectors = [
          '.pushdown-sda', '[class*="pushdown"]',
          '[class*="squeezeback"]', '[class*="lower-third"]',
          '[class*="left-third"]', '[class*="skyscraper"]',
          '[class*="vertical-video"]', '[class*="channel_skin"]',
          '.stream-display-ad', '[class*="stream-display-ad"]',
        ];
        const sdaElements = document.querySelectorAll(sdaSelectors.join(','));
        for (const sda of sdaElements) {
          if (sda.querySelector('video')) continue;
          sda.style.setProperty('display', 'none', 'important');
          sda.style.setProperty('visibility', 'hidden', 'important');
          sda.style.setProperty('opacity', '0', 'important');
          if (sda.parentElement) {
            if (sda.parentElement.querySelector('video') && !sda.parentElement.matches('[class*="stream-display-ad"],[class*="sda"]')) {
              sda.parentElement.style.setProperty('overflow', 'hidden', 'important');
            } else {
              sda.parentElement.style.setProperty('height', '0', 'important');
              sda.parentElement.style.setProperty('overflow', 'hidden', 'important');
              sda.parentElement.style.setProperty('transition', 'none', 'important');
            }
            batchRemover.add(sda);
          }
        }
      } catch (e) {
        log.debug('SDA collapse error:', e);
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
            if (globalReloadCount >= GLOBAL_MAX_RELOADS) {
              log.warn('Global reload cap reached — stopping auto-reload');
              resetAdDetection();
              return;
            }
            globalReloadCount++;
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
      globalReloadCount = 0;
    };

    const scheduleReload = (reason) => {
      if (!CONFIG.AUTO_RELOAD_ON_PLAYER_ERROR) return;

      const video = document.querySelector('video');
      if (video && video.readyState > 0 && !video.error) {
        resetAttempts();
        return;
      }

      if (reloadAttempts >= CONFIG.MAX_RELOAD_ATTEMPTS || globalReloadCount >= GLOBAL_MAX_RELOADS) return;

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
        globalReloadCount++;
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
          if (currentVideo && currentVideo.readyState <= 1) {
            scheduleReload('stalled');
          }
        }, 4000);
      };

      const handleWaiting = () => {
        setTimeout(() => {
          const currentVideo = document.querySelector('video');
          if (currentVideo && currentVideo.readyState <= 1) {
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
        // Detect SDA class mutations on existing elements
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList) {
            for (const cls of target.classList) {
              if (cls.includes('stream-display-ad') || cls.includes('sda-') || cls.includes('pushdown') || cls.includes('video-ad') || cls.includes('ad-')) {
                relevant = true;
                break;
              }
            }
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
          const newPath = location.pathname;
          const newChannelMatch = newPath.match(/^\/(popout\/)?([^/]+)/);
          const newChannel = newChannelMatch?.[2] || '';
          const isChannelChange = newChannel !== currentChannelName;

          if (isChannelChange) {
            lastPath = newPath;
            playerErrorHandler.resetAttempts();
            currentPlayerTypeIdx = 0;
            consecutiveAdM3U8 = 0;
            currentUsherUrl = null;
            if (unsafeWindow.__vat) {
              const vat = unsafeWindow.__vat;
              vat.playerType = PLAYER_TYPE_CASCADE[0];
              log.info('SPA navigation: reset __vat playerType');
            }
            log.info('SPA navigation detected — reset cascade state');
          } else {
            lastPath = newPath;
          }
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
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
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

      log.info('Initializing Optimized Twitch Adblock Fix v59.0.0...');

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

      log.info('Optimized Twitch Adblock Fix v59.0.0 initialized successfully');
    };
  })();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    batchRemover.clear();
  });

  // Inject CSS immediately at document-start to prevent ad flash
  injectCSS();

  // Override enableStreamDisplayAds feature flag to disable SDA overlays
  const patchTwSettings = (el) => {
    try {
      const settings = JSON.parse(el.textContent);
      if (settings) {
        const adFlags = ['enableStreamDisplayAds', 'enablePauseAds', 'enableMidrollAds',
          'enableOutstreamVideoAds', 'enableAudioAds', 'enableSdaEligibility',
          'enableVlmHlsMidrolls', 'enableNabGate', 'enableSdaDynamicDurations',
          'enableMafs', 'enableClientSideAdInsertion',
          'sda_ad_edge_web', 'sda_lowerthird_web', 'sda_lshape_web', 'sda_squeezeback_web',
          'sda_squeeze_reduction', 'AdTrackingEnabled', 'COMMERCIAL_IN_PROGRESS', 'AD_ENABLED'];
        for (const key of Object.keys(settings)) {
          if (adFlags.includes(key)) settings[key] = false;
        }
        el.textContent = JSON.stringify(settings);
      }
    } catch (e) {}
  };
  try {
    const settingsEl = document.querySelector('script[type="application/json"][id="tw-settings"]');
    if (settingsEl) {
      patchTwSettings(settingsEl);
    } else {
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1 && node.matches?.('script[type="application/json"][id="tw-settings"]')) {
              patchTwSettings(node);
              obs.disconnect();
              return;
            }
          }
        }
      });
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
    }
  } catch (e) {}

  // Patch tw-settings via Object.defineProperty to intercept future reads
  try {
    const origDefineProperty = Object.defineProperty;
    const _seen = new WeakSet();
    const patchSettings = (obj) => {
      if (_seen.has(obj)) return;
      _seen.add(obj);
      const adFlags = ['enableStreamDisplayAds', 'enablePauseAds', 'enableMidrollAds',
        'enableOutstreamVideoAds', 'enableAudioAds', 'enableSdaEligibility',
        'enableVlmHlsMidrolls', 'enableNabGate', 'enableSdaDynamicDurations',
        'enableMafs', 'enableClientSideAdInsertion',
        'sda_ad_edge_web', 'sda_lowerthird_web', 'sda_lshape_web', 'sda_squeezeback_web',
        'sda_squeeze_reduction', 'AdTrackingEnabled', 'COMMERCIAL_IN_PROGRESS', 'AD_ENABLED'];
      for (const flag of adFlags) {
        if (flag in obj) {
          try { obj[flag] = false; } catch (e) {}
        }
      }
    };
    Object.defineProperty = function (obj, prop, desc) {
      if (prop === 'twSettings' || prop === 'settings') {
        if (desc && typeof desc.value === 'object' && desc.value !== null) patchSettings(desc.value);
        if (desc && desc.get) {
          const origGet = desc.get;
          desc.get = function () { const v = origGet.call(this); if (v && typeof v === 'object') patchSettings(v); return v; };
        }
      }
      return origDefineProperty.call(this, obj, prop, desc);
    };
    Object.defineProperty.toString = () => origDefineProperty.toString();
  } catch (e) {}

  // Inject experiment_overrides cookie to disable ad experiments before Twitch JS loads
  try {
    const adExperiments = JSON.stringify({
      player_ad: 'off',
      sda_upsell: 'off',
      midroll_enabled: 'off',
      preroll_enabled: 'off',
      postroll_enabled: 'off',
      maf_enabled: 'off',
      force_maf: 'off',
      enableClientSideAdInsertion: 'off',
      video_ad_event_tracking: 'off',
      sda_ad_edge_web: 'off',
      sda_lowerthird_web: 'off',
      sda_lshape_web: 'off',
      sda_squeezeback_web: 'off',
      sda_dynamic_durations: 'off',
      sda_squeeze_reduction: 'off',
      AdTrackingEnabled: 'off',
      COMMERCIAL_IN_PROGRESS: 'off',
      AD_ENABLED: 'off',
    });
    document.cookie = `experiment_overrides=${encodeURIComponent(adExperiments)};path=/;max-age=86400;SameSite=Lax`;
    log.info('Injected experiment_overrides cookie');
  } catch (e) {
    log.debug('experiment_overrides cookie injection failed:', e);
  }

  // Inject eppo_overrides via URL parameter
  try {
    const url = new URL(unsafeWindow.location.href);
    if (!url.searchParams.has('eppo_overrides')) {
      const overrides = JSON.stringify({
        player_ad: { assignment: 'off' },
        sda_upsell: { assignment: 'off' },
        midroll_enabled: { assignment: 'off' },
        preroll_enabled: { assignment: 'off' },
        maf_enabled: { assignment: 'off' },
      });
      url.searchParams.set('eppo_overrides', overrides);
      unsafeWindow.history.replaceState(null, '', url.toString());
      log.info('Injected eppo_overrides URL parameter');
    }
  } catch (e) {
    log.debug('eppo_overrides injection failed:', e);
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
