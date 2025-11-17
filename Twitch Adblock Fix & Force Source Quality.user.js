// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      34.0.5
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

    // CONFIG
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
            'edge.ads.twitch.tv', 'amazon-adsystem.com', 'scorecardresearch.com', 'sq-tungsten-ts.amazon-adsystem.com',
            'ads.ttvnw.net', 'ad.twitch.tv', 'video.ad.twitch.tv', 'stream-display-ad.twitch.tv', 'doubleclick.net',
            'googlesyndication.com', 'criteo.com', 'taboola.com', 'outbrain.com'
        ],
        CHAT_PROTECTION_PATTERNS: [
            'wss://irc-ws.chat.twitch.tv', '/chat/room', 'chat.twitch.tv', 'tmi.twitch.tv', 'usher.ttvnw.net/api/channel/hls',
            '/gql POST', 'passport.twitch.tv', 'id.twitch.tv', 'oauth2', '/login', '/auth', 'access_token', 'scope=chat'
        ],
        CHAT_SELECTORS: [
            '[data-a-target*="chat"]', '[data-test-selector*="chat"]', '.chat-line__', '.chat-input', '[role="log"]',
            '[data-a-target="login-button"]', '[data-a-target="auth-button"]', 'input[type="password"]', 'a[href*="/login"]'
        ],
        AD_DOM_SELECTORS: [
            '[data-test-selector*="ad-"]', '[data-a-target*="ad-"]', '.stream-display-ad', '.video-ad-countdown',
            '.player-ad-overlay', '.player-ad-notice', '.consent-banner', '[data-a-target="consent-banner-accept"]',
            '.ivs-ad-container', '.ivs-ad-overlay', '.ivs-ad-skip-button'
        ],
        M3U8_AD_MARKERS: ['CUE-OUT', 'CUE-IN', 'SCTE35', 'EXT-X-TWITCH-AD', 'STREAM-DISPLAY-AD', 'EXT-X-AD'],
        PERFORMANCE: {
            DEBOUNCE_DELAY: SETTINGS.PERFORMANCE_MODE ? 200 : 100,
            INTERVAL: SETTINGS.PERFORMANCE_MODE ? 30000 : 15000,
        },
    };

    const LOG_PREFIX = `[TTV ADBLOCK REFORGED v34.0.5]`;
    const log = {
        info: SETTINGS.ENABLE_DEBUG ? (...args) => console.info(LOG_PREFIX, ...args) : () => {},
        warn: (...args) => console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args),
    };

    // UTILITIES
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    };

    const isChatOrAuthUrl = (url) => CONFIG.CHAT_PROTECTION_PATTERNS.some(p => url.toLowerCase().includes(p.toLowerCase()));
    const isChatElement = (el) => {
        if (!el) return false;
        return CONFIG.CHAT_SELECTORS.some(s => el.matches && el.matches(s)) ||
            (el.parentElement && isChatElement(el.parentElement));
    };

    class BatchRemover {
        static elements = new Set();
        static timeout = null;
        static add(el) {
            if (el && !isChatElement(el) && el.parentNode) {
                this.elements.add(el);
                if (!this.timeout) this.timeout = setTimeout(this.flush, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);
            }
        }
        static flush() {
            try {
                if (!(this.elements instanceof Set)) this.elements = new Set();
                for (let el of this.elements) {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }
            } catch (e) {
                log.error('Batch flush error:', e);
            }
            this.elements.clear();
            this.timeout = null;
        }
    }

    // GQL MODIFICATION
    function modifyGQLRequest(body) {
        if (typeof body !== 'object' || !body) return null;
        const operations = Array.isArray(body) ? body : [body];
        let modified = false;
        operations.forEach(op => {
            if (!op || typeof op.operationName !== 'string') return;
            if (op.operationName === 'PlaybackAccessToken' || op.operationName.includes('Ad') || op.operationName === 'StreamDisplayAd') {
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
                op.variables = vars;
                modified = true;
                log.info(`Modified GQL for chunked: ${op.operationName}`);
            }
        });
        return modified ? operations : null;
    }

    // M3U8 CLEANING + FORCE CHUNKED
    function cleanM3U8(text) {
        let cleaned = text.split('\n').filter(line => !CONFIG.M3U8_AD_MARKERS.some(m => line.includes(m))).join('\n');
        if (SETTINGS.FORCE_CHUNKED) {
            const lines = cleaned.split('\n');
            let chunkedUrl = null;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('#EXT-X-STREAM-INF') && (lines[i].includes('VIDEO="chunked"') || lines[i].includes('NAME="Source"') || lines[i].includes('NAME="(исходное)"'))) {
                    chunkedUrl = lines[++i]?.trim();
                    if (chunkedUrl && !chunkedUrl.startsWith('#')) break;
                }
            }
            if (chunkedUrl) {
                cleaned = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=9999999,VIDEO="chunked"\n${chunkedUrl}`;
                log.info('Forced chunked M3U8 from server');
            }
        }
        return cleaned;
    }

    // FETCH OVERRIDE
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async (input, init = {}) => {
        const url = (input instanceof Request ? input.url : input)?.toString() || '';
        if (isChatOrAuthUrl(url)) return originalFetch(input, init);

        if (CONFIG.AD_DOMAINS.some(d => url.includes(d))) {
            log.info(`Blocked ad domain: ${url}`);
            return new Response(null, { status: 204 });
        }

        if (url.includes('gql.twitch.tv')) {
            const bodyText = (input instanceof Request ? await input.clone().text() : init.body) || '{}';
            try {
                const body = JSON.parse(bodyText);
                const modifiedBody = modifyGQLRequest(body);
                if (modifiedBody) {
                    const newBody = JSON.stringify(modifiedBody);
                    init = { ...init, body: newBody };
                    if (input instanceof Request) input = new Request(input, { body: newBody });
                }
            } catch (e) {
                log.warn('GQL parse error:', e);
            }
        }

        if (url.includes('.m3u8') || url.includes('usher.ttvnw.net')) {
            const response = await originalFetch(input, init);
            if (response.ok) {
                const text = await response.clone().text();
                if (text.includes('#EXTM3U') || text.includes('#EXT-X')) {
                    const cleaned = cleanM3U8(text);
                    if (cleaned !== text) {
                        return new Response(new Blob([cleaned]), {
                            status: response.status,
                            headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'application/vnd.apple.mpegurl' }
                        });
                    }
                }
            }
            return response;
        }

        return originalFetch(input, init);
    };

    // CSS INJECTION
    function injectCSS() {
        const css = `
            ${CONFIG.AD_DOM_SELECTORS.join(', ')} {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;
        GM_addStyle(css);
        log.info('Injected CSS for ad hiding');
    }

    // DOM CLEANUP
    const removeAds = debounce(() => {
        CONFIG.AD_DOM_SELECTORS.forEach(s => document.querySelectorAll(s).forEach(el => BatchRemover.add(el)));
        BatchRemover.flush();
    }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);

    // AUTO-RELOAD ON PLAYER ERRORS
    let reloadAttempts = 0;
    let currentPathForReload = location.pathname;

    function resetReloadAttempts() {
        reloadAttempts = 0;
        currentPathForReload = location.pathname;
        log.info('Auto-reload attempts reset');
    }

    function scheduleReload(reason) {
        if (!SETTINGS.AUTO_RELOAD_ON_PLAYER_ERROR) return;
        if (location.pathname !== currentPathForReload) resetReloadAttempts();
        if (reloadAttempts >= SETTINGS.AUTO_RELOAD_MAX_ATTEMPTS) {
            log.warn('Max auto-reload attempts reached, not reloading.', reloadAttempts, reason);
            return;
        }
        const delay = Math.min(SETTINGS.AUTO_RELOAD_BASE_DELAY_MS * Math.pow(2, reloadAttempts), SETTINGS.AUTO_RELOAD_MAX_DELAY_MS);
        reloadAttempts++;
        log.warn(`Scheduling page reload (attempt ${reloadAttempts}) in ${delay}ms due to:`, reason);
        setTimeout(() => {
            try {
                const v = document.querySelector('video');
                if (v && !v.error && !v.paused && !v.readyState === 0) {
                    log.info('Video recovered before reload — skipping reload');
                    resetReloadAttempts();
                    return;
                }
            } catch (e) { /* ignore */ }
            log.warn('Reloading page now due to player error:', reason);
            try { window.location.reload(); } catch (e) { log.error('Reload failed', e); }
        }, delay);
    }

    function attachPlayerErrorHandlers(video) {
        if (!video || video.__ttv_reload_attached) return;
        video.__ttv_reload_attached = true;

        video.addEventListener('error', (ev) => {
            try {
                const code = (video && video.error && video.error.code) ? video.error.code : 'unknown';
                log.warn('Video element error event', code, ev);
                scheduleReload(`video:error code=${code}`);
            } catch (e) { log.error('Error handler failed', e); }
        });

        const onStalled = debounce(() => {
            log.warn('Video stalled/waiting detected');
            scheduleReload('video:stalled_or_waiting');
        }, 2500);
        video.addEventListener('stalled', onStalled);
        video.addEventListener('waiting', onStalled);

        video.addEventListener('playing', () => {
            log.info('Video playing — reset auto-reload attempts');
            resetReloadAttempts();
        });

        const obs = new MutationObserver(() => {
            if (!document.contains(video)) {
                try { obs.disconnect(); } catch(e){}
                video.__ttv_reload_attached = false;
            }
        });
        obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }

    function watchForVideoElements() {
        const tryAttach = () => {
            const v = document.querySelector('video');
            if (v) attachPlayerErrorHandlers(v);
        };
        tryAttach();
        const observer = new MutationObserver(debounce(() => {
            tryAttach();
        }, 300));
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Stream Switch Detector
    function setupSwitchDetector() {
        if (!SETTINGS.SWITCH_FIX) return;
        let lastPath = location.pathname;
        const observer = new MutationObserver(debounce(() => {
            if (location.pathname !== lastPath) {
                lastPath = location.pathname;
                resetReloadAttempts();
                setTimeout(() => {
                    const video = document.querySelector('video');
                    if (video) {
                        video.pause();
                        video.src = '';
                        video.load();
                        attachPlayerErrorHandlers(video);
                    }
                    removeAds();
                }, 500);
            }
        }, 200));
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }

    // INITIALIZATION
    function initialize() {
        log.info('Running v34.0.5 - Chunked from server + auto-reload');
        injectCSS();
        setInterval(removeAds, 5000);
        setupSwitchDetector();
        watchForVideoElements();

        const mutObserver = new MutationObserver(removeAds);
        mutObserver.observe(document.body, { childList: true, subtree: true });
    }

    // CLEANUP
    window.addEventListener('beforeunload', () => BatchRemover.flush());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
