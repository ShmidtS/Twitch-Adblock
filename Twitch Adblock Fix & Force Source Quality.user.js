// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      35.0.0
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

    const SETTINGS = {
        ENABLE_DEBUG: GM_getValue('TTV_EnableDebug', false),
        PERFORMANCE_MODE: GM_getValue('TTV_PerformanceMode', false),
        SWITCH_FIX: true,
        FORCE_CHUNKED: true,
        AUTO_RELOAD_ON_PLAYER_ERROR: GM_getValue('TTV_AutoReload', true),
        AUTO_RELOAD_MAX_ATTEMPTS: GM_getValue('TTV_AutoReloadMax', 6),
        AUTO_RELOAD_BASE_DELAY_MS: GM_getValue('TTV_AutoReloadBaseDelay', 2000),
        AUTO_RELOAD_MAX_DELAY_MS: GM_getValue('TTV_AutoReloadMaxDelay', 60000),
    };

    const CONFIG = {
        AD_DOMAINS: [
            'edge.ads.twitch.tv', 'amazon-adsystem.com', 'scorecardresearch.com',
            'sq-tungsten-ts.amazon-adsystem.com', 'ads.ttvnw.net', 'ad.twitch.tv',
            'video.ad.twitch.tv', 'stream-display-ad.twitch.tv', 'doubleclick.net',
            'googlesyndication.com', 'criteo.com', 'taboola.com', 'outbrain.com',
            'imasdk.googleapis.com', 'cdn.segment.com'
        ],
        CHAT_PROTECTION_PATTERNS: [
            'wss://irc-ws.chat.twitch.tv', '/chat/room', 'chat.twitch.tv', 'tmi.twitch.tv',
            'usher.ttvnw.net/api/channel/hls', '/gql POST', 'passport.twitch.tv',
            'id.twitch.tv', 'oauth2', '/login', '/auth', 'access_token', 'scope=chat',
            'login.twitch.tv'
        ],
        CHAT_SELECTORS: [
            '[data-a-target*="chat"]', '[data-test-selector*="chat"]',
            '.chat-line__', '.chat-input', '[role="log"]',
            '[data-a-target="login-button"]', '[data-a-target="auth-button"]',
            'input[type="password"]', 'a[href*="/login"]',
            '.tw-channel-status-bar__chat-toggle', '.chat-room__header'
        ],
        AD_DOM_SELECTORS: [
            '[data-test-selector*="ad-"]', '[data-a-target*="ad-"]', '.stream-display-ad',
            '.video-ad-countdown', '.player-ad-overlay', '.player-ad-notice',
            '.consent-banner', '[data-a-target="consent-banner-accept"]',
            '.ivs-ad-container', '.ivs-ad-overlay', '.ivs-ad-skip-button',
            'div[data-a-target="video-ad-countdown"]',
            'div.ramp-up-ad-active',
            '.ad-banner', '.top-ad-banner', '.promo-card', '.prime-takeover'
        ],
        M3U8_AD_MARKERS: ['CUE-OUT', 'CUE-IN', 'SCTE35', 'EXT-X-TWITCH-AD', 'STREAM-DISPLAY-AD', 'EXT-X-AD',
                          'EXT-X-DATERANGE', 'EXT-X-ASSET', 'EXT-X-TWITCH-PREROLL-AD'],
        PERFORMANCE: {
            DEBOUNCE_DELAY: SETTINGS.PERFORMANCE_MODE ? 200 : 100,
            INTERVAL: SETTINGS.PERFORMANCE_MODE ? 30000 : 15000,
        },
    };

    const LOG_PREFIX = `[TTV ADBLOCK FIX v35.0.0]`;
    const log = {
        info: SETTINGS.ENABLE_DEBUG ? (...a) => console.info(LOG_PREFIX, ...a) : () => {},
        warn: (...a) => console.warn(LOG_PREFIX, ...a),
        error: (...a) => console.error(LOG_PREFIX, ...a),
    };

    const debounce = (fn, d) => {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), d);
        };
    };

    const isChatOrAuthUrl = (url) =>
        CONFIG.CHAT_PROTECTION_PATTERNS.some(p => url.toLowerCase().includes(p.toLowerCase()));

    const isChatElement = (el) => {
        if (!el) return false;
        return CONFIG.CHAT_SELECTORS.some(s => el.matches?.(s)) ||
            (el.parentElement && isChatElement(el.parentElement));
    };

    class BatchRemover {
        static elements = new Set();
        static timeout = null;
        static add(el) {
            if (!el || isChatElement(el) || !el.parentNode) return;
            this.elements.add(el);
            if (!this.timeout) {
                this.timeout = setTimeout(() => this.flush(), CONFIG.PERFORMANCE.DEBOUNCE_DELAY);
            }
        }
        static flush() {
            try {
                for (let el of this.elements) {
                    if (el.parentNode) el.remove();
                }
            } catch (e) {
                log.error('Batch flush error:', e);
            }
            this.elements.clear();
            this.timeout = null;
        }
    }

    function modifyGQLRequest(body) {
        if (typeof body !== 'object' || !body) return null;
        const ops = Array.isArray(body) ? body : [body];
        let modified = false;

        ops.forEach(op => {
            if (!op?.operationName) return;

            const needsPatch =
                op.operationName === 'PlaybackAccessToken' ||
                op.operationName.includes('Ad') ||
                op.operationName === 'StreamDisplayAd';

            if (needsPatch) {
                const vars = op.variables || {};
                vars.isLive = true;
                vars.playerType = 'embed';
                vars.playerBackend = 'mediaplayer';
                vars.platform = 'web';
                vars.params = vars.params || {};
                vars.params.allow_source = true;
                vars.params.allow_audio_only = true;
                vars.params.fast_bread = true;
                vars.params.playlist_include_framerate = true;
                vars.adblock = false;
                vars.adsEnabled = false;
                vars.isAd = false;
                vars.params.client_ad_id = null;
                vars.params.ad_session_id = null;
                vars.params.reftoken = null;
                vars.params.player_ad_id = null;

                op.variables = vars;
                modified = true;
            }
        });

        return modified ? ops : null;
    }

    function cleanM3U8(text) {
        let cleaned = text
            .split('\n')
            .filter(line => !CONFIG.M3U8_AD_MARKERS.some(m => line.includes(m)))
            .join('\n');

        if (SETTINGS.FORCE_CHUNKED) {
            const lines = cleaned.split('\n');
            let chunkedUrl = null;

            for (let i = 0; i < lines.length; i++) {
                if (
                    lines[i].includes('#EXT-X-STREAM-INF') &&
                    (lines[i].includes('VIDEO="chunked"') ||
                     lines[i].includes('NAME="Source"') ||
                     lines[i].includes('исходное'))
                ) {
                    chunkedUrl = lines[i + 1]?.trim();
                    break;
                }
            }

            if (chunkedUrl) {
                cleaned =
                    `#EXTM3U\n#EXT-X-VERSION:3\n` +
                    `#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO="chunked"\n${chunkedUrl}`;
            }
        }

        return cleaned;
    }

    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async (input, init = {}) => {
        const url = (input instanceof Request ? input.url : input) + '';

        if (isChatOrAuthUrl(url)) return originalFetch(input, init);

        if (CONFIG.AD_DOMAINS.some(d => url.includes(d))) {
            return new Response(null, { status: 204 });
        }

        if (url.includes('gql.twitch.tv')) {
            try {
                const bodyTxt = input instanceof Request
                    ? await input.clone().text()
                    : init.body ?? '{}';

                const body = JSON.parse(bodyTxt);
                const modified = modifyGQLRequest(body);

                if (modified) {
                    const newBody = JSON.stringify(modified);
                    init = { ...init, body: newBody };
                    if (input instanceof Request) {
                        input = new Request(input, { body: newBody });
                    }
                }
            } catch (e) {
                log.warn('GQL error:', e);
            }
        }

        if (url.includes('.m3u8') || url.includes('usher.ttvnw.net')) {
            const resp = await originalFetch(input, init);
            if (!resp.ok) return resp;

            const txt = await resp.clone().text();
            if (txt.includes('#EXTM3U')) {
                const cleaned = cleanM3U8(txt);
                if (cleaned !== txt) {
                    return new Response(
                        new Blob([cleaned]),
                        {
                            status: resp.status,
                            headers: { ...Object.fromEntries(resp.headers), 'Content-Type': 'application/vnd.apple.mpegurl' }
                        }
                    );
                }
            }
            return resp;
        }

        return originalFetch(input, init);
    };

    function injectCSS() {
        GM_addStyle(`
            ${CONFIG.AD_DOM_SELECTORS.join(', ')} {
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `);
    }

    const removeAds = debounce(() => {
        CONFIG.AD_DOM_SELECTORS.forEach(s =>
            document.querySelectorAll(s).forEach(el => BatchRemover.add(el))
        );
        BatchRemover.flush();
    }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);

    let reloadAttempts = 0;
    let lastPath = location.pathname;

    function resetReloadAttempts() {
        reloadAttempts = 0;
        lastPath = location.pathname;
    }

    function scheduleReload(reason) {
        if (!SETTINGS.AUTO_RELOAD_ON_PLAYER_ERROR) return;

        const v = document.querySelector('video');
        if (v && v.readyState > 0 && !v.error) {
            resetReloadAttempts();
            return;
        }

        if (reloadAttempts >= SETTINGS.AUTO_RELOAD_MAX_ATTEMPTS) return;

        const delay = Math.min(
            SETTINGS.AUTO_RELOAD_BASE_DELAY_MS * (2 ** reloadAttempts),
            SETTINGS.AUTO_RELOAD_MAX_DELAY_MS
        );

        reloadAttempts++;

        setTimeout(() => {
            const v2 = document.querySelector('video');
            if (v2 && v2.readyState > 0 && !v2.error) {
                resetReloadAttempts();
                return;
            }
            window.location.reload();
        }, delay);
    }

    function attachPlayerErrorHandlers(video) {
        if (!video || video.___ttv_hooked) return;
        video.___ttv_hooked = true;

        video.addEventListener('error', () => {
            scheduleReload('fatal video error');
        });

        let stallTimer = null;

        video.addEventListener('stalled', () => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
                if (video.readyState === 0) {
                    scheduleReload('stalled');
                }
            }, 4000);
        });

        video.addEventListener('waiting', () => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
                if (video.readyState === 0) {
                    scheduleReload('waiting');
                }
            }, 5000);
        });

        video.addEventListener('playing', () => {
            clearTimeout(stallTimer);
            resetReloadAttempts();
        });
    }

    function watchForVideo() {
        const tryAttach = () => {
            const v = document.querySelector('video');
            if (v) attachPlayerErrorHandlers(v);
        };

        tryAttach();

        new MutationObserver(debounce(() => tryAttach(), 300))
            .observe(document.documentElement, { childList: true, subtree: true });
    }

    function setupSwitchDetector() {
        if (!SETTINGS.SWITCH_FIX) return;

        let last = location.pathname;
        new MutationObserver(debounce(() => {
            if (location.pathname !== last) {
                last = location.pathname;
                resetReloadAttempts();

                setTimeout(() => {
                    const v = document.querySelector('video');
                    if (v) {
                        v.pause();
                        v.src = '';
                        v.load();
                    }
                    removeAds();
                }, 300);
            }
        }, 150))
        .observe(document.documentElement, { childList: true, subtree: true });
    }

    // INIT
    function init() {
        injectCSS();
        removeAds();
        setInterval(removeAds, 5000);

        setupSwitchDetector();
        watchForVideo();

        new MutationObserver(removeAds)
            .observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else init();

})();
