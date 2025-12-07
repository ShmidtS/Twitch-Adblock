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

  const SETTINGS = {
    ENABLE_DEBUG: GM_getValue('TTV_EnableDebug', false),
    PERFORMANCE_MODE: GM_getValue('TTV_PerformanceMode', false),
    SWITCH_FIX: true,
    FORCE_CHUNKED: true,
    AUTO_RELOAD_ON_PLAYER_ERROR: GM_getValue('TTV_AutoReload', true),
    AUTO_RELOAD_MAX_ATTEMPTS: GM_getValue('TTV_AutoReloadMax', 6),
    AUTO_RELOAD_BASE_DELAY_MS: GM_getValue('TTV_AutoReloadBaseDelay', 2000),
    AUTO_RELOAD_MAX_DELAY_MS: GM_getValue('TTV_AutoReloadMaxDelay', 60000),
    AUTO_RELOAD_ON_AD_DETECTED: GM_getValue('TTV_AutoReloadOnAd', true),
    AUTO_RELOAD_AD_CHECK_INTERVAL: GM_getValue('TTV_AdCheckInterval', 3000),
    AUTO_RELOAD_AD_MAX_ATTEMPTS: GM_getValue('TTV_AdReloadMax', 3),
  };

  const CONFIG = {
    AD_DOMAINS: [
      'edge.ads.twitch.tv', 'amazon-adsystem.com', 'scorecardresearch.com',
      'sq-tungsten-ts.amazon-adsystem.com', 'ads.ttvnw.net', 'ad.twitch.tv',
      'video.ad.twitch.tv', 'stream-display-ad.twitch.tv', 'doubleclick.net',
      'googlesyndication.com', 'criteo.com', 'taboola.com', 'outbrain.com',
      'imasdk.googleapis.com', 'cdn.segment.com',
      'sponsored-content.twitch.tv', 'promotions.twitch.tv', 'marketing.twitch.tv',
      'partners.twitch.tv', 'sponsors.twitch.tv'
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
      // Основные рекламные селекторы
      '[data-test-selector*="ad-"]', '[data-a-target*="ad-"]', '.stream-display-ad',
      '.video-ad-countdown', '.player-ad-overlay', '.player-ad-notice',
      '.consent-banner', '[data-a-target="consent-banner-accept"]',
      '.ivs-ad-container', '.ivs-ad-overlay', '.ivs-ad-skip-button',
      'div[data-a-target="video-ad-countdown"]',
      'div.ramp-up-ad-active',
      // Обновленные селекторы для современного Twitch
      '[data-component="AdContainer"]', '.ad-overlay-modern', '.sponsored-highlight',
      '.promo-banner-inline', '[data-a-target="ad-content"]', '.native-ad-container',
      '.ad-banner', '.top-ad-banner', '.promo-card', '.prime-takeover',
      '[data-test-selector*="sponsored"]', '[data-test-selector*="promotion"]',
      '[data-a-target*="sponsored"]', '[data-a-target*="promotion"]',
      '.home-page-ad-card', '.content-card-sponsored', '.inline-ad-container',
      // Дополнительные селекторы 2025
      '[data-test-selector*="sponsored-content"]', '[data-test-selector*="marketing"]',
      '[class*="ad-"]:not(.chat-ad)', '[class*="sponsor"]:not(.chat-sponsor)',
      '[data-a-target*="marketing"]', '[data-a-target*="sponsored-content"]',
      '.tw-ad', '.tw-sponsored', '.tw-promo-card', '.tw-marketing-card',
      '[data-test-selector*="promotional"]', '.commercial-container',
      '.player-ad-container', '.overlay-ad', '.preroll-ad', '.midroll-ad',
      '.postroll-ad', '.display-ad', '.video-ads-overlay'
    ],
    FALLBACK_KEYWORDS: [
      'ad', 'sponsor', 'sponsored', 'promotion', 'promotional', 'advertisement',
      'marketing', 'adcontent', 'commercial', 'sponsor content', 'promoted'
    ],
    M3U8_AD_MARKERS: [
      'CUE-OUT', 'CUE-IN', 'SCTE35', 'EXT-X-TWITCH-AD', 'STREAM-DISPLAY-AD',
      'EXT-X-AD', 'EXT-X-DATERANGE', 'EXT-X-ASSET', 'EXT-X-TWITCH-PREROLL-AD',
      'EXT-X-TWITCH-MIDROLL-AD', 'EXT-X-TWITCH-POSTROLL-AD'
    ],
    PERFORMANCE: {
      DEBOUNCE_DELAY: SETTINGS.PERFORMANCE_MODE ? 200 : 100,
      INTERVAL: SETTINGS.PERFORMANCE_MODE ? 30000 : 15000,
    },
  };

  const LOG_PREFIX = `[TTV ADBLOCK FIX v35.2.1]`;
  const log = {
    info: SETTINGS.ENABLE_DEBUG ? (...a) => console.info(LOG_PREFIX, ...a) : () => { },
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
        if (this.elements.size === 0) return;

        // Используем DocumentFragment для более эффективного удаления
        const fragment = document.createDocumentFragment();
        let removedCount = 0;

        for (let el of this.elements) {
          if (el.parentNode) {
            // Перемещаем элемент в fragment для оптимизации
            fragment.appendChild(el);
            removedCount++;
          }
        }

        // Очищаем fragment после перемещения элементов
        if (removedCount > 0) {
          log.info(`Removed ${removedCount} ad elements via optimized batch removal`);
        }
      } catch (e) {
        log.error('Batch flush error:', e);
        // Fallback к простому удалению при ошибке
        for (let el of this.elements) {
          try {
            if (el.parentNode) el.remove();
          } catch (fallbackError) {
            log.warn('Fallback removal failed:', fallbackError);
          }
        }
      }
      this.elements.clear();
      this.timeout = null;
    }
  }

  function modifyGQLRequest(body) {
    if (typeof body !== 'object' || !body) return null;
    const ops = Array.isArray(body) ? body : [body];
    let modified = false;

    try {
      ops.forEach((op, index) => {
        if (!op?.operationName) {
          if (SETTINGS.ENABLE_DEBUG) {
            log.info(`Skipping operation ${index}: no operationName`);
          }
          return;
        }

        const needsPatch =
          op.operationName === 'PlaybackAccessToken' ||
          op.operationName === 'StreamDisplayAd' ||
          op.operationName.includes('Ad') ||
          op.operationName.includes('Commercial') ||
          op.operationName.includes('Sponsorship') ||
          op.operationName.includes('Marketing') ||
          op.operationName.includes('Promotion');

        if (needsPatch) {
          const vars = op.variables || {};

          if (SETTINGS.ENABLE_DEBUG) {
            log.info(`Patching GQL operation: ${op.operationName}`, {
              originalVars: vars,
              hasParams: !!vars.params
            });
          }

          // Основные параметры для отключения рекламы
          vars.isLive = true;
          vars.playerType = 'embed';
          vars.playerBackend = 'mediaplayer';
          vars.platform = 'web';
          vars.adblock = false;
          vars.adsEnabled = false;
          vars.isAd = false;
          vars.adBreaksEnabled = false;
          vars.disableAds = true;

          // Параметры качества и производительности
          vars.params = vars.params || {};
          vars.params.allow_source = true;
          vars.params.allow_audio_only = true;
          vars.params.fast_bread = true;
          vars.params.playlist_include_framerate = true;
          vars.params.include_denylist_categories = false;
          vars.params.include_optional = true;

          // Очистка рекламных идентификаторов
          vars.params.client_ad_id = null;
          vars.params.ad_session_id = null;
          vars.params.reftoken = null;
          vars.params.player_ad_id = null;
          vars.params.ad_id = null;
          vars.params.ad_conv_id = null;
          vars.params.ad_personalization_id = null;

          // Дополнительные параметры для современного API
          vars.enableAdblock = false;
          vars.showAds = false;
          vars.skipAds = true;
          vars.personalizedAds = false;

          op.variables = vars;
          modified = true;

          if (SETTINGS.ENABLE_DEBUG) {
            log.info(`Successfully patched GQL operation: ${op.operationName}`);
          }
        }
      });
    } catch (e) {
      log.error('Error processing GQL operations:', {
        error: e.message,
        stack: e.stack,
        bodyLength: JSON.stringify(body).length,
        operationCount: ops.length
      });
    }

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

    // Fallback механизм - поиск элементов с ключевыми словами
    if (CONFIG.FALLBACK_KEYWORDS.length > 0) {
      try {
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
          if (el.childElementCount === 0 && el.textContent) {
            const text = el.textContent.toLowerCase();
            for (let keyword of CONFIG.FALLBACK_KEYWORDS) {
              if (text.includes(keyword) &&
                !isChatElement(el) &&
                !CONFIG.AD_DOM_SELECTORS.some(sel => el.matches?.(sel))) {

                // Проверяем, что элемент не является навигацией или UI элементом
                if (!el.closest('.chat') &&
                  !el.closest('[data-a-target*="nav"]') &&
                  el.offsetWidth > 0 && el.offsetHeight > 0) {

                  log.info(`Fallback ad detected via keyword "${keyword}":`, el);
                  BatchRemover.add(el);
                }
                break;
              }
            }
          }
        }
      } catch (e) {
        log.error('Fallback mechanism error:', e);
      }
    }

    BatchRemover.flush();
  }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY);

  function dynamicSelectorDiscovery() {
    if (!SETTINGS.ENABLE_DEBUG) return;

    log.info('Starting dynamic selector discovery...');

    const newSelectors = [];
    const processedTags = new Set();

    try {
      // Ограничиваем количество элементов для проверки для производительности
      const allElements = document.querySelectorAll('*');
      const maxElementsToCheck = Math.min(allElements.length, 1000); // Максимум 1000 элементов

      let checkedElements = 0;

      for (let el of allElements) {
        if (checkedElements >= maxElementsToCheck) break;

        if (el.childElementCount === 0 && el.textContent && el.offsetWidth > 0) {
          checkedElements++;
          const text = el.textContent.toLowerCase().trim();

          // Ищем элементы с рекламным содержимым (сокращенный список для производительности)
          for (let keyword of ['ad', 'sponsor', 'promotion']) {
            if (text.includes(keyword) && !isChatElement(el)) {
              const tagName = el.tagName.toLowerCase();

              // Создаем селектор на основе атрибутов
              let selector = tagName;

              if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ')
                  .filter(c => c.length > 0 && c.length < 20) // Фильтруем длинные классы
                  .slice(0, 1) // Максимум 1 класс для производительности
                  .map(c => `.${c}`)
                  .join('');
                if (classes) selector += classes;
              }

              // Добавляем только один data-атрибут для производительности
              for (let attr of el.attributes) {
                if (attr.name.startsWith('data-') &&
                  (attr.value.includes(keyword) || attr.name.includes(keyword))) {
                  selector += `[${attr.name}*="${keyword}"]`;
                  break;
                }
              }

              if (processedTags.has(selector)) continue;
              processedTags.add(selector);

              // Проверяем уникальность и полезность селектора
              const matched = document.querySelectorAll(selector);
              if (matched.length > 0 && matched.length < 50) { // Увеличиваем лимит
                newSelectors.push(selector);
                log.info(`Discovered new selector: ${selector} (${matched.length} matches)`);
              }
              break;
            }
          }
        }
      }

      if (newSelectors.length > 0) {
        CONFIG.AD_DOM_SELECTORS.push(...newSelectors);
        log.info(`Added ${newSelectors.length} new selectors:`, newSelectors);

        // Сразу применяем новые селекторы
        removeAds();
      }

    } catch (e) {
      log.error('Dynamic selector discovery error:', e);
    }
  }

  let reloadAttempts = 0;
  let lastPath = location.pathname;
  let adReloadAttempts = 0;
  let lastAdCheckTime = 0;
  let adDetectionInterval = null;
  let lastReloadTime = 0;
  let consecutiveAdReloads = 0;
  let stableVideoTime = 0;
  let previousVideoTime = 0;
  let lastUserInteractionTime = 0;
  let userInteractionTimeout = null;

  function resetReloadAttempts() {
    reloadAttempts = 0;
    lastPath = location.pathname;
    lastReloadTime = 0;
  }

  function resetAdReloadAttempts() {
    adReloadAttempts = 0;
    lastAdCheckTime = Date.now();
    consecutiveAdReloads = 0;
    stableVideoTime = 0;
    previousVideoTime = 0;
    lastUserInteractionTime = 0;
  }

  // Track user interactions to distinguish manual pause from ad-related issues
  function setupUserInteractionTracking() {
    const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];

    function handleUserInteraction() {
      lastUserInteractionTime = Date.now();

      // Clear previous timeout
      if (userInteractionTimeout) {
        clearTimeout(userInteractionTimeout);
        userInteractionTimeout = null;
      }

      // Reset interaction time after 30 seconds of inactivity
      userInteractionTimeout = setTimeout(() => {
        lastUserInteractionTime = 0;
      }, 30000);
    }

    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { passive: true });
    });

    // Also track video-specific interactions
    const video = document.querySelector('video');
    if (video) {
      video.addEventListener('play', handleUserInteraction);
      video.addEventListener('pause', handleUserInteraction);
      video.addEventListener('seeking', handleUserInteraction);
      video.addEventListener('seeked', handleUserInteraction);
    }
  }

  // Clean up function to prevent memory leaks
  function cleanupUserInteractionTracking() {
    if (userInteractionTimeout) {
      clearTimeout(userInteractionTimeout);
      userInteractionTimeout = null;
    }
    lastUserInteractionTime = 0;
  }

  function isAdDetected() {
    try {
      const adElements = document.querySelectorAll(CONFIG.AD_DOM_SELECTORS.join(', '));
      if (adElements.length > 0) {
        return true;
      }

      // Дополнительная проверка на основе видео состояния
      const video = document.querySelector('video');
      if (video && video.readyState > 0) {
        const currentTime = video.currentTime;

        // Проверяем на паузу в воспроизведении (может указывать на рекламу)
        // Но только если пауза не была вызвана пользователем вручную
        if (video.paused && !video.ended) {
          const timeSinceLastInteraction = Date.now() - lastUserInteractionTime;

          // Если пользователь взаимодействовал с видео менее 2 секунд назад,
          // вероятно, это ручная пауза - не считаем за рекламу
          if (timeSinceLastInteraction < 2000) {
            log.info('Video paused by user, not triggering ad detection');
            return false;
          }

          return true;
        }

        // Проверяем на подозрительные изменения времени
        if (previousVideoTime && Math.abs(currentTime - previousVideoTime) < 0.1 && !video.paused) {
          stableVideoTime++;
          if (stableVideoTime > 10) { // Стабильное время более 10 циклов
            return true;
          }
        } else {
          stableVideoTime = 0;
        }

        previousVideoTime = currentTime;
      }

      return false;
    } catch (e) {
      log.error('Error in ad detection:', e);
      return false;
    }
  }

  function handleAdDetection() {
    if (!SETTINGS.AUTO_RELOAD_ON_AD_DETECTED) return;

    const video = document.querySelector('video');
    const now = Date.now();

    // Защита от слишком частых проверок
    if (now - lastAdCheckTime < SETTINGS.AUTO_RELOAD_AD_CHECK_INTERVAL) {
      return;
    }

    // Если видео работает нормально, сбрасываем счетчики
    if (video && video.readyState > 0 && !video.paused && !video.ended && video.currentTime > 0) {
      resetAdReloadAttempts();
      return;
    }

    // Проверяем, не было ли недавнего пользовательского взаимодействия
    const timeSinceLastInteraction = Date.now() - lastUserInteractionTime;

    // Если пользователь недавно взаимодействовал (менее 5 секунд назад),
    // вероятно, это не реклама - пропускаем проверку
    if (timeSinceLastInteraction < 5000) {
      log.info('Recent user interaction detected, skipping ad check');
      return;
    }

    // Проверяем лимит попыток
    if (adReloadAttempts >= SETTINGS.AUTO_RELOAD_AD_MAX_ATTEMPTS ||
      consecutiveAdReloads >= Math.floor(SETTINGS.AUTO_RELOAD_AD_MAX_ATTEMPTS / 2)) {

      log.warn('Max ad reload attempts reached, temporarily disabling auto-reload');
      if (adDetectionInterval) {
        clearInterval(adDetectionInterval);
        // Запускаем проверку реже после достижения лимита
        adDetectionInterval = setInterval(handleAdDetection, SETTINGS.AUTO_RELOAD_AD_CHECK_INTERVAL * 2);
      }
      return;
    }

    // Защита от слишком частых перезагрузок
    if (now - lastReloadTime < 30000) { // Минимум 30 секунд между перезагрузками
      return;
    }

    if (isAdDetected()) {
      log.warn(`Ad detected, attempting reload (${adReloadAttempts + 1}/${SETTINGS.AUTO_RELOAD_AD_MAX_ATTEMPTS})`);
      adReloadAttempts++;
      consecutiveAdReloads++;
      lastAdCheckTime = now;

      setTimeout(() => {
        // Двойная проверка перед перезагрузкой
        if (isAdDetected()) {
          log.info('Reloading page due to persistent ad detection');
          lastReloadTime = Date.now();
          window.location.reload();
        } else {
          resetAdReloadAttempts();
        }
      }, 1000);
    } else {
      resetAdReloadAttempts();
    }
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
      resetAdReloadAttempts();
    });
  }

  function watchForVideo() {
    const tryAttach = () => {
      const v = document.querySelector('video');
      if (v) attachPlayerErrorHandlers(v);
    };

    tryAttach();

    new MutationObserver(debounce(() => {
      tryAttach();
    }, 300))
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
          resetAdReloadAttempts();
        }, 300);
      }
    }, 150))
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  // INIT
  function init() {
    log.info('Initializing Twitch Adblock Fix v35.2.1...');

    injectCSS();

    // Первичное удаление рекламы
    removeAds();

    // Основные интервалы (оптимизированы)
    const mainInterval = setInterval(removeAds, CONFIG.PERFORMANCE.INTERVAL);

    setupSwitchDetector();
    watchForVideo();

    // Настройка отслеживания пользовательских взаимодействий
    setupUserInteractionTracking();

    // Динамическое обнаружение только в debug режиме и реже
    if (SETTINGS.ENABLE_DEBUG) {
      setInterval(() => {
        dynamicSelectorDiscovery();
      }, 60000); // Каждую минуту вместо 30 секунд
    }

    if (SETTINGS.AUTO_RELOAD_ON_AD_DETECTED) {
      adDetectionInterval = setInterval(handleAdDetection, SETTINGS.AUTO_RELOAD_AD_CHECK_INTERVAL);
    }

    // Оптимизированный MutationObserver
    const adObserver = new MutationObserver(debounce(() => {
      removeAds();
    }, CONFIG.PERFORMANCE.DEBOUNCE_DELAY));

    adObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false, // Не отслеживаем атрибуты для производительности
      attributeOldValue: false,
      characterData: false,
      characterDataOldValue: false
    });

    log.info('Twitch Adblock Fix initialized successfully');
  }

  // Очистка при завершении работы (если пользователь покидает страницу)
  window.addEventListener('beforeunload', cleanupUserInteractionTracking);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();

})();
