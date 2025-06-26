// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      26.0.1
// @description  Комплексная блокировка рекламы Twitch с проактивной заменой токенов, восстановлением после мид-роллов, принудительным качеством, очисткой M3U8 и другими оптимизациями.
// @author       ShmidtS
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @match        https://player.twitch.tv/*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      usher.ttvnw.net
// @connect      *.ttvnw.net
// @connect      *.twitch.tv
// @connect      gql.twitch.tv
// @connect      github.com
// @connect      raw.githubusercontent.com
// @updateURL    https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @downloadURL  https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '26.0.1'; // Обновлена версия
    const PROACTIVE_TOKEN_SWAP_ENABLED = GM_getValue('TTV_AdBlock_ProactiveTokenSwap', true);
    const ENABLE_MIDROLL_RECOVERY = GM_getValue('TTV_AdBlock_EnableMidrollRecovery', true);
    const FORCE_MAX_QUALITY_IN_BACKGROUND = GM_getValue('TTV_AdBlock_ForceMaxQuality', true);
    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true);
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const BLOCK_NATIVE_ADS_SCRIPT = GM_getValue('TTV_AdBlock_BlockNatScript', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true);
    const HIDE_COOKIE_BANNER = GM_getValue('TTV_AdBlock_HideCookieBanner', true);
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true);
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', false);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_Debug_PlayerMon', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', false);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', false);
    const LOG_NETWORK_BLOCKING_DEBUG = GM_getValue('TTV_AdBlock_Debug_NetBlock', false);
    const LOG_TOKEN_SWAP_DEBUG = GM_getValue('TTV_AdBlock_Debug_TokenSwap', false);
    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '0,2,3,4,9,10,403,1000,2000,3000,4000,5000,6001');
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 20000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 45000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);
    const VISIBILITY_RESUME_DELAY_MS = GM_getValue('TTV_AdBlock_VisResumeDelayMs', 1500);
    const USE_REGEX_M3U8_CLEANING = GM_getValue('TTV_AdBlock_UseRegexM3U8', false);
    const MAX_RELOADS_PER_SESSION = GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 5);

    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;

    const GQL_OPERATIONS_TO_SKIP_MODIFICATION = new Set([
        'PlaybackAccessToken', 'PlaybackAccessToken_Template', 'ChannelPointsContext', 'ViewerPoints',
        'CommunityPointsSettings', 'ClaimCommunityPoints', 'CreateCommunityPointsReward',
        'UpdateCommunityPointsReward', 'DeleteCommunityPointsReward', 'UpdateCommunityPointsSettings',
        'CustomRewardRedemption', 'RedeemCommunityPointsCustomReward', 'RewardCenter',
        'ChannelPointsAutomaticRewards', 'predictions', 'polls', 'UserFollows', 'VideoComments',
        'ChatHighlights', 'VideoPreviewCard__VideoHover', 'UseLive', 'UseBrowseQueries',
        'ViewerCardModLogsMessagesBySender', 'ComscoreStreamingQuery', 'StreamTags', 'StreamMetadata',
        'VideoMetadata', 'ChannelPage_GetChannelStat', 'Chat_Userlookup', 'RealtimeStreamTagList_Tags',
        'UserModStatus', 'FollowButton_FollowUser', 'FollowButton_UnfollowUser', 'Clips_Popular_ miesiąc',
        'PersonalSections', 'RecommendedChannels', 'FrontPage', 'GetHomePageRecommendations',
        'VideoComments_SentMessage', 'UseUserReportModal', 'ReportUserModal_UserReport', 'UserLeaveSquad',
        'UserModal_GetFollowersForUser', 'UserModal_GetFollowedChannelsForUser', 'PlayerOverlaysContext',
        'MessageBufferPresences', 'RecentChatMessages', 'ChatRoomState', 'VideoPreviewCard__VideoPlayer',
        'ChannelPage_ChannelInfoBar_User', 'ChannelPage_SetSessionStatus', 'UseSquadStream',
        'OnsiteNotifications', 'OnsiteWaffleNotifications', 'UserActions', 'BitsLeaderboard',
        'ChannelLeaderboards', 'PrimeOffer', 'ChannelExtensions', 'ExtensionsForChannel',
        'DropCampaignDetails', 'DropsDashboardPage_GetDropCampaigns', 'StreamEventsSlice',
        'StreamElementsService_GetOverlays', 'StreamElementsService_GetTheme', 'ViewerBounties',
        'GiftASubModal_UserGiftEligibility', 'WebGiftSubButton_SubGiftEligibility', 'CharityCampaign',
        'GoalCreateDialog_User', 'GoalsManageOverlay_ChannelGoals', 'PollCreateDialog_User',
        'MultiMonthDiscount', 'FreeSubBenefit', 'SubPrices', 'SubscriptionProductBenefitMessages',
        'UserCurrentSubscriptionsContext', 'VideoPreviewCard_VideoMarkers', 'UpdateVideoMutation',
        'DeleteVideos', 'HostModeTargetDetails', 'StreamInformation', 'VideoPlayer_StreamAnalytics',
        'VideoPlayer_VideoSourceManager', 'VideoPlayerStreamMetadata', 'VideoPlayerStatusOverlayChannel'
    ]);

    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIALBREAK'];
    const AD_DATERANGE_REGEX = USE_REGEX_M3U8_CLEANING ? /CLASS="(?:TWITCH-)?STITCHED-AD"/i : null;

    let AD_URL_KEYWORDS_BLOCK = [
        'd2v02itv0y9u9t.cloudfront.net', 'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com',
        'googletagservices.com', 'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'scorecardresearch.com', 'yandex.ru/clck/', 'omnitagjs', 'omnitag', 'innovid.com', 'eyewonder.com',
        'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com', 'flashtalking.com',
        'contextual.media.net', 'advertising.com', 'adform.net', 'freewheel.tv', 'stickyadstv.com',
        'tremorhub.com', 'aniview.com', 'criteo.com', 'adition.com', 'teads.tv', 'undertone.com',
        'vidible.tv', 'vidoomy.com', 'appnexus.com', '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads'
    ];
    if (BLOCK_NATIVE_ADS_SCRIPT) AD_URL_KEYWORDS_BLOCK.push('nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com', 'amazon-ads.com');

    const AD_OVERLAY_SELECTORS_CSS = [
        'div[data-a-target="request-ad-block-disable-modal"]',
        '.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]',
        'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]',
        '.player-ad-notice', '.ad-interrupt-screen', 'div[data-test-selector="ad-banner-default-text-area"]',
        'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]',
        '[data-test-selector="sad-overlay"]', 'div[class*="video-ad-label"]', '.player-ad-overlay',
        'div[class*="advertisement"]', 'div[class*="-ad-"]', 'div[data-a-target="sad-overlay-container"]',
        'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]',
        // Новые селекторы для большей гибкости
        'div[data-a-target*="ad-block-nag"]',
        'div[data-test-selector*="ad-block-nag"]',
        'div[data-a-target*="disable-adblocker-modal"]'
    ];
    const COOKIE_BANNER_SELECTOR = '.consent-banner';

    const AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST = [
        'div[data-a-target="request-ad-block-disable-modal"]',
        'div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]',
        'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]',
        'iframe[src*="imasdk.googleapis.com"]', '.player-overlay-ad', '.tw-player-ad-overlay',
        '.video-ad-display', 'div[data-ad-placeholder="true"]', '[data-a-target="video-ad-countdown-container"]',
        '.promoted-content-card', 'div[class*="--ad-banner"]', 'div[data-ad-unit]', 'div[class*="player-ads"]',
        'div[data-ad-boundary]', 'div[data-a-target="sad-overlay-container"]',
        'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]',
        // Новые селекторы
        'div[data-a-target*="ad-block-nag"]',
        'div[data-test-selector*="ad-block-nag"]',
        'div[data-a-target*="disable-adblocker-modal"]'
    ];

    // Ключевые слова для поиска оверлеев с просьбой отключить блокировщик
    const AD_NAG_TEXT_KEYWORDS = [
        "отключив блокировщик рекламы", "disable your ad blocker", "disable adblocker",
        "помогите каналу", "support the channel by disabling", "поддержите канал",
        "ad blocker may be causing issues", "обнаружен блокировщик", "adblocker detected"
    ];

    const PLAYER_CONTAINER_SELECTORS = ['div[data-a-target="video-player"]', '.video-player', 'div[data-a-player-state]', 'main', '.persistent-player'];

    let hooksInstalledMain = false;
    let adRemovalObserver = null;
    let errorScreenObserver = null;
    let videoPlayerMutationObserver = null;
    const RELOAD_ON_ERROR_CODES = RELOAD_ON_ERROR_CODES_RAW.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;
    let videoElement = null;
    let lastReloadTimestamp = 0;
    let reloadCount = 0;
    let cachedQualityValue = null;
    let cachedCleanToken = null;

    function logError(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logCoreDebug(source, message, ...args) { if (CORE_DEBUG_LOGGING) console.info(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logModuleTrace(moduleFlag, source, message, ...args) {
        if (moduleFlag) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg));
    }

    function injectCSS() {
        let cssToInject = '';
        if (HIDE_AD_OVERLAY_ELEMENTS) cssToInject += `${AD_OVERLAY_SELECTORS_CSS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }\n`;
        if (HIDE_COOKIE_BANNER) cssToInject += `${COOKIE_BANNER_SELECTOR} { display: none !important; }\n`;
        if (cssToInject) try { GM_addStyle(cssToInject); } catch (e) { logError('CSSInject', 'CSS apply failed:', e); }
    }

    function forceMaxQuality() {
        try {
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
            logCoreDebug('ForceQuality', 'Background quality forcing activated.');
        } catch (e) { logError('ForceQuality', 'Failed to activate quality forcing:', e); }
    }

    function setQualitySettings(forceCheck = false) {
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue;
            }
            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE;
                logCoreDebug('QualitySet', `Forced video quality to "chunked". Previous: ${currentValue}`);
            }
        } catch (e) {
            logError('QualitySet', 'Set quality error:', e);
            cachedQualityValue = null;
        }
    }

    function hookQualitySettings() {
        try {
            unsafeWindow.localStorage.setItem = function(key, value) {
                let forcedValue = value;
                if (key === LS_KEY_QUALITY && value !== TARGET_QUALITY_VALUE) {
                    logModuleTrace(CORE_DEBUG_LOGGING, 'QualitySet:Hook', `Intercepted localStorage.setItem for '${key}'. Original: '${value}', Forcing: '${TARGET_QUALITY_VALUE}'`);
                    forcedValue = TARGET_QUALITY_VALUE;
                    cachedQualityValue = forcedValue;
                }
                try {
                    const args = Array.from(arguments);
                    args[1] = forcedValue;
                    return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, args);
                } catch (e) {
                    logError('QualitySet:Hook', `localStorage.setItem error for '${key}':`, e);
                    if (key === LS_KEY_QUALITY) cachedQualityValue = null;
                    throw e;
                }
            };
            cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
            setQualitySettings(true);
        } catch(e) {
            logError('QualitySet:Hook', 'localStorage.setItem hook error:', e);
            if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
        }
    }

    function parseAndCleanM3U8(m3u8Text, url = "N/A") {
        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logError('M3U8Clean', `Invalid M3U8 content for ${urlFilename}. Content type: ${typeof m3u8Text}`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: false, errorDuringClean: true };
        }

        const upperM3U8Text = m3u8Text.toUpperCase();
        let potentialAdContent = false;

        if (upperM3U8Text.includes("#EXT-X-DATERANGE:") && (upperM3U8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR.toUpperCase()) || AD_DATERANGE_ATTRIBUTE_KEYWORDS.some(kw => upperM3U8Text.includes(kw)))) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-ASSET:") || upperM3U8Text.includes("#EXT-X-CUE-OUT") || upperM3U8Text.includes("#EXT-X-TWITCH-AD-SIGNAL") || upperM3U8Text.includes("#EXT-X-SCTE35:") || upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:")) {
            potentialAdContent = true;
        } else if (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(m3u8Text)) {
            potentialAdContent = true;
        }

        if (!potentialAdContent) {
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'M3U8Clean', `No ad markers detected in ${urlFilename}.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: false, errorDuringClean: false };
        }

        const lines = m3u8Text.split('\n');
        const cleanLines = [];
        let isAdSection = false;
        let adsFoundOverall = false;
        let linesRemovedCount = 0;
        let discontinuityShouldBeRemoved = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const upperTrimmedLine = trimmedLine.toUpperCase();
            let removeThisLine = false;
            let currentLineIsAdMarker = false;

            if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE')) {
                if (upperTrimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR.toUpperCase()) ||
                    (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(trimmedLine)) ||
                    AD_DATERANGE_ATTRIBUTE_KEYWORDS.some(kw => upperTrimmedLine.includes(kw))) {
                    removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                }
            } else if (upperTrimmedLine.startsWith('#EXT-X-ASSET')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
            } else if (upperTrimmedLine.startsWith('#EXT-X-CUE-OUT')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-HIDE')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
            } else if (upperTrimmedLine.startsWith('#EXT-X-SCTE35')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true;
                // PREFETCH не должен сам по себе начинать секцию с удалением контента или discontinuity,
                // поэтому isAdSection и discontinuityShouldBeRemoved не меняются на true здесь.
            } else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) {
                    removeThisLine = true; currentLineIsAdMarker = true; isAdSection = false; discontinuityShouldBeRemoved = false;
                } else if (upperTrimmedLine.startsWith('#EXTINF')) {
                    // Если после рекламного маркера идет #EXTINF, значит, это уже не рекламный сегмент
                    isAdSection = false; discontinuityShouldBeRemoved = false;
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                    if (discontinuityShouldBeRemoved) {
                        removeThisLine = true; currentLineIsAdMarker = true; discontinuityShouldBeRemoved = false;
                    }
                } else if (!trimmedLine.startsWith('#') && trimmedLine !== '') { // Это URL сегмента
                    removeThisLine = true; // Удаляем URL сегмента, если он внутри isAdSection
                }
            }

            if (removeThisLine) {
                linesRemovedCount++;
                if (currentLineIsAdMarker) adsFoundOverall = true;
            } else {
                cleanLines.push(line);
            }
        }

        const cleanedText = cleanLines.join('\n');

        let segmentCount = 0;
        for (const line of cleanLines) {
            if (line.trim().length > 0 && !line.trim().startsWith('#')) {
                segmentCount++;
            }
        }

        if (adsFoundOverall && segmentCount < 3 && !cleanedText.includes('#EXT-X-ENDLIST')) {
            logWarn('M3U8Clean', `Insufficient segments (${segmentCount}) after cleaning ${urlFilename}, potentially problematic. Reverting to original. Lines removed: ${linesRemovedCount}`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: true, errorDuringClean: true };
        }

        if (adsFoundOverall) {
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'M3U8Clean', `Cleaned ${urlFilename}: ${linesRemovedCount} lines removed. Ads were present. ${segmentCount} segments remain.`);
        } else if (potentialAdContent) {
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'M3U8Clean', `Processed ${urlFilename}: Potential ad markers found, but no lines removed by current logic. Outputting original.`);
        }

        return { cleanedText: cleanedText, adsFound: adsFoundOverall, linesRemoved: linesRemovedCount, wasPotentiallyAd: potentialAdContent, errorDuringClean: false };
    }

    function _universalParseAndCleanM3U8_WorkerLogic(m3u8Text, url = "N/A", debugLogging = false) {
        const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = 'twitch-stitched-ad';
        const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIALBREAK'];
        const AD_DATERANGE_REGEX_WORKER_STR = '/CLASS="(?:TWITCH-)?STITCHED-AD"/i';
        const USE_REGEX_M3U8_CLEANING_WORKER = false;
        const AD_DATERANGE_REGEX_WORKER = USE_REGEX_M3U8_CLEANING_WORKER ? new RegExp(AD_DATERANGE_REGEX_WORKER_STR.slice(1, -2), AD_DATERANGE_REGEX_WORKER_STR.slice(-1)) : null;

        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            if (debugLogging) console.log(`[WORKER M3U8Clean] Invalid M3U8 content for ${urlFilename}`);
            return { cleanedText: m3u8Text, adsFound: false };
        }

        const upperM3U8Text = m3u8Text.toUpperCase();
        let potentialAdContent = false;
        if (upperM3U8Text.includes("#EXT-X-DATERANGE:") && (upperM3U8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER.toUpperCase()) || AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperM3U8Text.includes(kw)))) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-ASSET:") || upperM3U8Text.includes("#EXT-X-CUE-OUT") || upperM3U8Text.includes("#EXT-X-TWITCH-AD-SIGNAL") || upperM3U8Text.includes("#EXT-X-SCTE35:") || upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:")) {
            potentialAdContent = true;
        } else if (AD_DATERANGE_REGEX_WORKER && AD_DATERANGE_REGEX_WORKER.test(m3u8Text)) {
            potentialAdContent = true;
        }

        if (!potentialAdContent) {
            return { cleanedText: m3u8Text, adsFound: false };
        }

        const lines = m3u8Text.split('\n');
        const cleanLines = [];
        let isAdSection = false;
        let adsFoundOverall = false;
        let discontinuityShouldBeRemoved = false;
        let linesRemovedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const upperTrimmedLine = trimmedLine.toUpperCase();
            let removeThisLine = false;

            if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE')) {
                if (upperTrimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR_WORKER.toUpperCase()) ||
                    (AD_DATERANGE_REGEX_WORKER && AD_DATERANGE_REGEX_WORKER.test(trimmedLine)) ||
                    AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER.some(kw => upperTrimmedLine.includes(kw))) {
                    removeThisLine = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                }
            } else if (upperTrimmedLine.startsWith('#EXT-X-ASSET') || upperTrimmedLine.startsWith('#EXT-X-CUE-OUT') || upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-HIDE') || upperTrimmedLine.startsWith('#EXT-X-SCTE35')) {
                removeThisLine = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH')) {
                 removeThisLine = true; adsFoundOverall = true;
            } else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) {
                    removeThisLine = true; isAdSection = false; discontinuityShouldBeRemoved = false;
                } else if (upperTrimmedLine.startsWith('#EXTINF')) {
                    isAdSection = false; discontinuityShouldBeRemoved = false;
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                    if (discontinuityShouldBeRemoved) {
                        removeThisLine = true; discontinuityShouldBeRemoved = false;
                    }
                } else if (!trimmedLine.startsWith('#') && trimmedLine !== '') {
                    removeThisLine = true;
                }
            }

            if (removeThisLine) {
                linesRemovedCount++;
            } else {
                cleanLines.push(line);
            }
        }
        const cleanedText = cleanLines.join('\n');
        if (debugLogging && adsFoundOverall) {
            console.log(`[WORKER M3U8Clean] Cleaned ${urlFilename}: ${linesRemovedCount} lines removed.`);
        }
        return { cleanedText: cleanedText, adsFound: adsFoundOverall };
    }

    function getWorkerInjectionCode() {
        const _universalParseAndCleanM3U8String = _universalParseAndCleanM3U8_WorkerLogic.toString();

        return `
            const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
            const CORE_DEBUG_LOGGING_WORKER = ${CORE_DEBUG_LOGGING};
            const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING_DEBUG};
            const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

            ${_universalParseAndCleanM3U8String}

            (function() {
                function workerLogError(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
                function workerLogM3U8Trace(message, ...args) { if (LOG_M3U8_CLEANING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' [M3U8 Relay] TRACE:', message, ...args.map(arg => typeof arg === 'string' && arg.length > 100 ? arg.substring(0, 100) + '...' : arg)); }

                const originalFetch = self.fetch;
                if (typeof self.fetch === 'function' && !self.fetch.hooked_by_adblock_ult_worker) {
                    self.fetch = async function(input, init) {
                        let requestUrl = (input instanceof Request) ? input.url : String(input);
                        const lowerCaseUrl = requestUrl.toLowerCase();
                        const isM3U8Request = (lowerCaseUrl.endsWith('.m3u8') || lowerCaseUrl.includes('.m3u8?')) && lowerCaseUrl.includes('usher.ttvnw.net');

                        if (isM3U8Request) {
                            workerLogM3U8Trace('Worker Fetch: Intercepted M3U8 request', requestUrl);
                            try {
                                const response = await originalFetch.apply(this, arguments);
                                if (response.ok) {
                                    const text = await response.clone().text();
                                    const { cleanedText, adsFound } = _universalParseAndCleanM3U8_WorkerLogic(text, requestUrl, LOG_M3U8_CLEANING_WORKER);

                                    if (adsFound) {
                                        workerLogM3U8Trace('Worker Fetch: Ads found and M3U8 cleaned for', requestUrl);
                                        const newHeaders = new Headers(response.headers);
                                        newHeaders.delete('Content-Length');
                                        return new Response(cleanedText, {
                                            status: response.status,
                                            statusText: response.statusText,
                                            headers: newHeaders
                                        });
                                    }
                                }
                                return response;
                            } catch (e) {
                                workerLogError('Worker Fetch M3U8 Error:', e, requestUrl);
                                const requestId = 'worker_fetch_' + Date.now() + Math.random();
                                self.postMessage({
                                    adblock_message_request: true,
                                    type: 'WORKER_FETCH_M3U8_FALLBACK',
                                    url: requestUrl,
                                    id: requestId,
                                    init: init
                                });
                                return new Promise((resolve, reject) => {
                                    const listener = (event) => {
                                        if (event.data && event.data.adblock_message_response && event.data.id === requestId) {
                                            self.removeEventListener('message', listener);
                                            if (event.data.error) {
                                                workerLogError('Worker Fetch M3U8 Fallback Error from Main:', event.data.error, requestUrl);
                                                reject(new Error(event.data.error));
                                            } else {
                                                workerLogM3U8Trace('Worker Fetch: M3U8 Fallback from Main successful for', requestUrl);
                                                const headers = new Headers();
                                                for(const key in event.data.headers) headers.append(key, event.data.headers[key]);
                                                if(!headers.has('content-type')) headers.set('content-type', 'application/vnd.apple.mpegurl');
                                                resolve(new Response(event.data.body, { status: event.data.status, statusText: event.data.statusText, headers: headers }));
                                            }
                                        }
                                    };
                                    self.addEventListener('message', listener);
                                });
                            }
                        }
                        return originalFetch.apply(this, arguments);
                    };
                    self.fetch.hooked_by_adblock_ult_worker = true;
                    if (CORE_DEBUG_LOGGING_WORKER) console.log(LOG_PREFIX_WORKER_BASE, 'Fetch API in worker hooked.');
                }
            })();
        `;
    }

    function modifyGqlResponse(responseText, url) {
        if (!MODIFY_GQL_RESPONSE || typeof responseText !== 'string' || responseText.length === 0) return responseText;
        try {
            let data = JSON.parse(responseText);
            let modifiedOverall = false;
            const opDataArray = Array.isArray(data) ? data : [data];

            for (const opData of opDataArray) {
                if (!opData || typeof opData !== 'object') continue;

                const operationName = opData.extensions?.operationName || opData.operationName || 'UnknownGQLOp';
                let currentOpModified = false;

                if (GQL_OPERATIONS_TO_SKIP_MODIFICATION.has(operationName)) {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Skipping GQL modification for whitelisted operation: ${operationName}`);
                    continue;
                }

                if (operationName === 'AdFreeQuery') {
                    if (opData.data?.viewerAdFreeConfig?.isAdFree === false) {
                        opData.data.viewerAdFreeConfig.isAdFree = true;
                        currentOpModified = true;
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Set AdFreeQuery.isAdFree to true for ${operationName}`);
                    }
                } else if (operationName === 'ClientSideAd') {
                    let modified = false;
                    if (opData.data) {
                        if (opData.data.ads) { opData.data.ads = []; modified = true; }
                        if (opData.data.clientAd) { opData.data.clientAd = null; modified = true; }
                        if (opData.data.companionSlots) { opData.data.companionSlots = []; modified = true; }
                        if (opData.data.playerAdParams) { opData.data.playerAdParams = null; modified = true; }
                        if (modified) {
                            currentOpModified = true;
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Cleared ad fields in ClientSideAd for ${operationName}`);
                        }
                    }
                } else if (operationName === "Interstitials") {
                    if (opData.data?.stream?.interstitials && Array.isArray(opData.data.stream.interstitials) && opData.data.stream.interstitials.length > 0) {
                        opData.data.stream.interstitials = [];
                        currentOpModified = true;
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Cleared stream.interstitials for ${operationName}`);
                    }
                }

                if (opData.data?.stream?.playbackAccessToken?.value && typeof opData.data.stream.playbackAccessToken.value === 'string') {
                    try {
                        const tokenValueStr = opData.data.stream.playbackAccessToken.value;
                        const tokenValueJson = JSON.parse(tokenValueStr);
                        let tokenModified = false;

                        if (tokenValueJson.hide_ads === false) { tokenValueJson.hide_ads = true; tokenModified = true; }
                        if (tokenValueJson.show_ads === true) { tokenValueJson.show_ads = false; tokenModified = true; }
                        if (tokenValueJson.hasOwnProperty('ad_indicator')) { delete tokenValueJson.ad_indicator; tokenModified = true; }
                        if (tokenValueJson.hasOwnProperty('ads_on_stream')) { tokenValueJson.ads_on_stream = 0; tokenModified = true; }
                        if (tokenValueJson.hasOwnProperty('roll_type')) { delete tokenValueJson.roll_type; tokenModified = true; }
                        if (tokenValueJson.hasOwnProperty('is_ad_enabled_on_stream')) { tokenValueJson.is_ad_enabled_on_stream = false; tokenModified = true; }

                        if (tokenModified) {
                            opData.data.stream.playbackAccessToken.value = JSON.stringify(tokenValueJson);
                            currentOpModified = true;
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Modified PlaybackAccessToken JSON value for ${operationName}`);
                        }
                    } catch (e) {
                        logWarn('GQLModify', `Failed to parse/modify PlaybackAccessToken JSON value for ${operationName}:`, e);
                    }
                }

                if (currentOpModified) modifiedOverall = true;
            }

            if (modifiedOverall) {
                logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Modified GQL response for URL: ${url.substring(0,100)}...`);
                return JSON.stringify(Array.isArray(data) ? opDataArray : opDataArray[0]);
            }
        } catch (e) {
            logError('GQLModify', `Error modifying GQL response for ${url.substring(0,100)}...:`, e, responseText.substring(0, 200) + "...");
        }
        return responseText;
    }

    async function fetchNewPlaybackAccessToken(channelName, deviceId) {
        logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'TokenSwap', `(1/3) Requesting ANONYMOUS PlaybackAccessToken for channel: ${channelName}, DeviceID: ${deviceId || 'N/A'}`);
        const requestPayload = {
            operationName: 'PlaybackAccessToken_Template',
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {\nstreamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {\nvalue\nsignature\nauthorization { isForbidden forbiddenReasonCode }\n__typename\n}\nvideoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {\nvalue\nsignature\n__typename\n}\n}',
            variables: { isLive: true, login: channelName, isVod: false, vodID: '', playerType: 'site' }
        };
        const headers = { 'Content-Type': 'application/json', 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' };
        if (deviceId) headers['Device-ID'] = deviceId;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url: GQL_URL, headers, data: JSON.stringify(requestPayload), responseType: 'json',
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300 && response.response) {
                        const tokenData = response.response;
                        const token = tokenData?.data?.streamPlaybackAccessToken;
                        if (token && token.value && token.signature) {
                            try {
                                const parsedTokenValue = JSON.parse(token.value);
                                if (parsedTokenValue.show_ads === true || parsedTokenValue.hide_ads === false) {
                                    logWarn('TokenSwap', `(1/3) Anonymous token for ${channelName} still indicates ads. Proceeding, but may not be fully effective. Token: ${token.value.substring(0,50)}...`);
                                } else {
                                    logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'TokenSwap', `(1/3) Anonymous token for ${channelName} retrieved successfully and appears clean.`);
                                }
                            } catch (e) { /* ignore parsing error for logging */ }
                            resolve(token);
                        } else {
                            logError('TokenSwap', `(1/3) Anonymous token not found or invalid in GQL response for ${channelName}. Response:`, response.responseText?.substring(0, 200));
                            reject(`Anonymous token not found in GQL response for ${channelName}.`);
                        }
                    } else {
                        logError('TokenSwap', `(1/3) GQL request for anonymous token failed for ${channelName}. Status: ${response.status}. Response:`, response.responseText?.substring(0, 200));
                        reject(`GQL request error for anonymous token: status ${response.status}`);
                    }
                },
                onerror: (error) => {
                    logError('TokenSwap', `(1/3) Network error during GQL request for anonymous token for ${channelName}:`, error);
                    reject(`Network error during GQL request for anonymous token: ${error.error || 'Unknown network error'}`);
                }
            });
        });
    }

    async function fetchNewUsherM3U8(originalUsherUrl, newAccessToken, channelName) {
        logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'MidrollRecovery', `(2/3) Requesting new M3U8 manifest for ${channelName} using swapped token.`);
        const url = new URL(originalUsherUrl);
        url.searchParams.set('token', newAccessToken.value);
        url.searchParams.set('sig', newAccessToken.signature);
        url.searchParams.set('player_version', '1.20.0'); // Use a known good player version
        url.searchParams.set('allow_source', 'true');
        url.searchParams.set('allow_audio_only', 'true');

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: url.href, responseType: 'text',
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300 && response.responseText) {
                        logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'MidrollRecovery', `(2/3) New M3U8 manifest for ${channelName} retrieved successfully.`);
                        resolve(response.responseText);
                    } else {
                        logError('MidrollRecovery', `(2/3) New M3U8 request for ${channelName} failed. Status: ${response.status}. URL: ${url.href}`);
                        reject(`New M3U8 request error: status ${response.status}`);
                    }
                },
                onerror: (error) => {
                    logError('MidrollRecovery', `(2/3) Network error during new M3U8 request for ${channelName}:`, error);
                    reject(`Network error during new M3U8 request: ${error.error || 'Unknown network error'}`);
                }
            });
        });
    }

    async function fetchOverride(input, init) {
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();
        const urlShortForLog = (requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl).substring(0, 120);

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'FetchBlock', `Blocked fetch request to ${urlShortForLog} (Keyword: ${keyword})`);
                return new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock Ultimate (Keyword: ${keyword})` });
            }
        }

        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && lowerCaseUrl.includes('usher.ttvnw.net');

        if (isM3U8RequestToUsher) {
            let actualRequestUrl = requestUrl;
            if (PROACTIVE_TOKEN_SWAP_ENABLED && cachedCleanToken) {
                logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'TokenSwap', `(Proactive) Swapping token in URL for ${urlShortForLog}`);
                const url = new URL(requestUrl);
                url.searchParams.set('token', cachedCleanToken.value);
                url.searchParams.set('sig', cachedCleanToken.signature);
                actualRequestUrl = url.href;
                cachedCleanToken = null; // Consume the token
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: actualRequestUrl, headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined, responseType: "text",
                    onload: async function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            let { cleanedText, adsFound, errorDuringClean } = parseAndCleanM3U8(response.responseText, actualRequestUrl);

                            if (adsFound && ENABLE_MIDROLL_RECOVERY && !errorDuringClean) {
                                logWarn('MidrollRecovery', `Ads detected in M3U8 for ${urlShortForLog}. Initiating mid-roll recovery...`);
                                try {
                                    const urlParams = new URL(actualRequestUrl).searchParams;
                                    const channelName = urlParams.get('login') || urlParams.get('channel') || unsafeWindow.location.pathname.match(/\/([a-zA-Z0-9_]+)$/)?.[1];

                                    if (!channelName) {
                                        logWarn('MidrollRecovery', 'Could not determine channel name from M3U8 URL or page URL for recovery.');
                                        throw new Error('Could not determine channel name from URL.');
                                    }
                                    const deviceId = init?.headers ? new Headers(init.headers).get('Device-ID') : unsafeWindow.localStorage.getItem('twilight.deviceID');

                                    const newAccessToken = await fetchNewPlaybackAccessToken(channelName, deviceId);
                                    const newM3u8Text = await fetchNewUsherM3U8(actualRequestUrl, newAccessToken, channelName);
                                    const finalCleanedResult = parseAndCleanM3U8(newM3u8Text, `RECOVERY_URL_FOR_${channelName}`);

                                    if (!finalCleanedResult.adsFound || finalCleanedResult.errorDuringClean) {
                                        logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'MidrollRecovery', `(3/3) Mid-roll recovery for ${channelName} successful. Using new manifest. Ads found in new: ${finalCleanedResult.adsFound}`);
                                        cleanedText = finalCleanedResult.cleanedText;
                                    } else {
                                        logWarn('MidrollRecovery', `(3/3) Mid-roll recovery for ${channelName} still resulted in an M3U8 with ads. Using this potentially ad-laden M3U8.`);
                                        cleanedText = finalCleanedResult.cleanedText; // Use the recovered M3U8 even if it still has ads, it might be better
                                    }
                                } catch (e) {
                                    logError('MidrollRecovery', `(3/3) Mid-roll recovery for ${urlShortForLog} failed. Reverting to initial cleaning. Reason: ${e}`);
                                    // cleanedText remains the result of the initial cleaning
                                }
                            } else if (errorDuringClean) {
                                logWarn('FetchM3U8', `Initial M3U8 cleaning for ${urlShortForLog} resulted in an error (e.g. too few segments). Using original M3U8.`);
                                cleanedText = response.responseText; // Revert to original on cleaning error
                            }

                            const newHeaders = new Headers();
                            if (response.responseHeaders) response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => { const parts = line.split(': ', 2); if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') newHeaders.append(parts[0], parts[1]); });
                            if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl'); // Ensure correct content type
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'FetchM3U8', `Processed M3U8 for ${urlShortForLog} (via GM_XHR in Fetch).`);
                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders }));
                        } else {
                            logError('FetchM3U8', `GM_xmlhttpRequest failed for ${urlShortForLog}: ${response.statusText || response.status}`);
                            reject(new TypeError(`GM_xmlhttpRequest failed for M3U8: ${response.statusText || response.status}`));
                        }
                    },
                    onerror: function(error) {
                        logError('FetchM3U8', `Network error for ${urlShortForLog} (GM_XHR in Fetch):`, error);
                        reject(new TypeError('Network error for M3U8 fetch'));
                    }
                });
            });
        }

        const originalResponse = await originalFetch(input, init);

        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        if (isGqlRequest && method === 'POST' && originalResponse.ok && MODIFY_GQL_RESPONSE) {
            let responseText;
            try { responseText = await originalResponse.clone().text(); if (!responseText) return originalResponse; } catch (e) { return originalResponse; }

            if (PROACTIVE_TOKEN_SWAP_ENABLED) {
                try {
                    const gqlData = JSON.parse(responseText);
                    const operations = Array.isArray(gqlData) ? gqlData : [gqlData];
                    for (const op of operations) {
                        const operationName = op.extensions?.operationName;
                        if (operationName === 'PlaybackAccessToken' || operationName === 'PlaybackAccessToken_Template') {
                            const channelName = op.data?.streamPlaybackAccessToken ? op.variables?.login : (op.data?.videoPlaybackAccessToken ? op.variables?.login : null);
                            if (channelName) {
                                const deviceId = init?.headers ? new Headers(init.headers).get('Device-ID') : unsafeWindow.localStorage.getItem('twilight.deviceID');
                                fetchNewPlaybackAccessToken(channelName, deviceId)
                                    .then(token => {
                                    cachedCleanToken = token;
                                    logModuleTrace(LOG_TOKEN_SWAP_DEBUG, 'TokenSwap', `(Proactive) Successfully fetched and cached new ANONYMOUS token for ${channelName}.`);
                                })
                                    .catch(e => logError('TokenSwap', `(Proactive) Failed to fetch ANONYMOUS token for ${channelName}:`, e));
                            }
                            break;
                        }
                    }
                } catch (e) { logWarn('TokenSwap', '(Proactive) Error parsing GQL for PlaybackAccessToken hook:', e); }
            }

            const modifiedText = modifyGqlResponse(responseText, requestUrl);
            if (modifiedText !== responseText) {
                const newHeaders = new Headers(originalResponse.headers);
                newHeaders.delete('Content-Length');
                return new Response(modifiedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
            }
        }
        return originalResponse;
    }

    function xhrOpenOverride(method, url) {
        this._hooked_url = String(url);
        this._hooked_method = method.toUpperCase();
        originalXhrOpen.apply(this, arguments);
    }

    function xhrSendOverride(data) {
        const urlString = this._hooked_url;
        const method = this._hooked_method;
        if (!urlString) {
            originalXhrSend.apply(this, arguments);
            return;
        }
        const lowerCaseUrl = urlString.toLowerCase();
        const urlShortForLog = (urlString.includes('?') ? urlString.substring(0, urlString.indexOf('?')) : urlString).substring(0, 120);

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'XHRBlock', `Blocked XHR ${method} request to ${urlShortForLog} (Keyword: ${keyword})`);
                this.dispatchEvent(new Event('error')); // Simulate network error
                return;
            }
        }

        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && lowerCaseUrl.includes('usher.ttvnw.net');

        if (isM3U8RequestToUsher) {
            const xhr = this;
            GM_xmlhttpRequest({
                method: method, url: urlString, responseType: "text",
                onload: function(response) {
                    let finalResponseText = response.responseText;
                    if (response.status >= 200 && response.status < 300) {
                        const { cleanedText, adsFound, errorDuringClean } = parseAndCleanM3U8(response.responseText, urlString);
                        if (adsFound && !errorDuringClean) {
                            finalResponseText = cleanedText;
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'XHR_M3U8', `Cleaned M3U8 for ${urlShortForLog}`);
                        } else if (errorDuringClean) {
                            logWarn('XHR_M3U8', `M3U8 cleaning error for ${urlShortForLog}, using original.`);
                        }
                    }
                    Object.defineProperties(xhr, {
                        'responseText': { value: finalResponseText, configurable: true, writable: true },
                        'response': { value: finalResponseText, configurable: true, writable: true },
                        'status': { value: response.status, configurable: true },
                        'statusText': { value: response.statusText, configurable: true },
                        'readyState': { value: 4, configurable: true }
                    });
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'XHR_M3U8', `Processed M3U8 for ${urlShortForLog} (via GM_XHR in XHR Send). Status: ${response.status}`);
                    xhr.dispatchEvent(new Event('load'));
                    xhr.dispatchEvent(new Event('loadend'));
                },
                onerror: function(error) {
                    logError('XHR_M3U8', `GM_xmlhttpRequest error for ${urlShortForLog}:`, error);
                    Object.defineProperties(xhr, {
                        'status': { value: 0, configurable: true }, // Indicate error
                        'readyState': { value: 4, configurable: true }
                    });
                    xhr.dispatchEvent(new Event('error'));
                    xhr.dispatchEvent(new Event('loadend'));
                }
            });
            return;
        }

        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        if (isGqlRequest && method === 'POST' && MODIFY_GQL_RESPONSE) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const originalResponseText = this.responseText;
                    if (typeof originalResponseText === 'string') {
                        const modifiedText = modifyGqlResponse(originalResponseText, this._hooked_url);
                        if (modifiedText !== originalResponseText) {
                            Object.defineProperty(this, 'responseText', { value: modifiedText, configurable: true, writable: true });
                            Object.defineProperty(this, 'response', { value: modifiedText, configurable: true, writable: true });
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'XHR_GQL', `Modified GQL for ${this._hooked_url.substring(0,100)}`);
                        }
                    }
                }
            }, { once: true });
        }
        originalXhrSend.apply(this, arguments);
    }

    function handleMessageFromWorkerGlobal(event) {
        const msg = event.data;
        if (msg?.adblock_message_request && msg.type === 'WORKER_FETCH_M3U8_FALLBACK') {
            const workerPort = event.source;
            if (!workerPort) return;

            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'WorkerFallback', `Main: Received M3U8 fetch fallback request from worker for: ${msg.url.substring(0,100)}`);
            GM_xmlhttpRequest({
                method: "GET",
                url: msg.url,
                responseType: "text",
                onload: (response) => {
                    let bodyToWorker = response.responseText;
                    if (response.status >= 200 && response.status < 300) {
                        const { cleanedText, adsFound, errorDuringClean } = parseAndCleanM3U8(response.responseText, msg.url);
                        if (adsFound && !errorDuringClean) bodyToWorker = cleanedText;
                        else if (errorDuringClean) logWarn('WorkerFallback', `M3U8 cleaning error during worker fallback for ${msg.url.substring(0,100)}, sending original.`);
                    }

                    const responseHeaders = {};
                    if (response.responseHeaders) {
                        response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => {
                            const parts = line.split(': ', 2);
                            if (parts.length === 2) responseHeaders[parts[0].toLowerCase()] = parts[1];
                        });
                    }
                    workerPort.postMessage({
                        adblock_message_response: true, id: msg.id,
                        body: bodyToWorker, status: response.status,
                        statusText: response.statusText, headers: responseHeaders
                    });
                },
                onerror: (error) => {
                    logError('WorkerFallback', `Main: GM_XHR Network Error during worker fallback for ${msg.url.substring(0,100)}:`, error);
                    workerPort.postMessage({
                        adblock_message_response: true, id: msg.id,
                        error: `GM_XHR Network Error: ${error.error || 'Unknown'}`, status: 0
                    });
                }
            });
        }
    }

    function hookWorkerConstructor() {
        if (!INJECT_INTO_WORKERS || unsafeWindow.Worker.hooked_by_adblock_ult) return;
        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                const urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                logCoreDebug('WorkerHook', `Attempting to intercept Worker creation for: ${urlString.substring(0, 100)}...`);

                if (urlString.startsWith('blob:')) {
                    logCoreDebug('WorkerHook', `Skipping injection for blob URL: ${urlString.substring(0,100)}`);
                    super(scriptURL, options);
                    return;
                }

                try {
                    const workerCodeToInject = getWorkerInjectionCode();
                    const blob = new Blob([workerCodeToInject, `\ntry { importScripts("${urlString}"); } catch(e) { console.error("${LOG_PREFIX} [WORKER] Failed to import original script ${urlString}:", e); throw e; }`], { type: 'application/javascript' });
                    const newScriptURL = URL.createObjectURL(blob);
                    const workerInstance = super(newScriptURL, options);
                    URL.revokeObjectURL(newScriptURL);
                    logCoreDebug('WorkerHook', `Successfully intercepted and injected code into Worker for: ${urlString.substring(0, 100)}`);
                    return workerInstance;
                } catch (e) {
                    logError('WorkerHook', `Failed to create hooked worker for ${urlString.substring(0,100)}:`, e);
                    return new OriginalWorker(scriptURL, options);
                }
            }
        };
        unsafeWindow.Worker.hooked_by_adblock_ult = true;
        unsafeWindow.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true });
        logCoreDebug('WorkerHook', 'Worker constructor hooked. Listening for M3U8 fallbacks.');
    }

    function installHooks() {
        if (hooksInstalledMain) return;
        try { unsafeWindow.fetch = fetchOverride; } catch (e) { logError('HookInstall', 'Failed to hook fetch:', e); }
        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
        } catch (e) { logError('HookInstall', 'Failed to hook XHR:', e); }
        try { hookWorkerConstructor(); } catch (e) { logError('HookInstall', 'Failed to hook Worker:', e); }
        hooksInstalledMain = true;
        logCoreDebug('HookInstall', 'All network and worker hooks installed.');
    }

    function removeDOMAdElementsImproved() {
        if (!ATTEMPT_DOM_AD_REMOVAL) return;

        const AD_NAG_TEXT_LOWERCASE = AD_NAG_TEXT_KEYWORDS.map(k => k.toLowerCase());

        const checkAndRemoveNode = (node) => {
            if (node.nodeType !== Node.ELEMENT_NODE || !node.parentNode) {
                return false; // Not an element or already removed
            }

            // 1. Проверка по селекторам из списка
            for (const selector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST) {
                if (node.matches(selector)) {
                    node.parentNode.removeChild(node);
                    logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMAdRemoval', `Removed element by selector: ${selector}`);
                    return true; // Node removed
                }
            }

            // 2. Проверка по тексту
            // textContent может быть null, поэтому ?.
            const nodeText = node.textContent?.toLowerCase() || "";
            if (AD_NAG_TEXT_LOWERCASE.some(keyword => nodeText.includes(keyword))) {
                const role = node.getAttribute('role');
                const ariaModal = node.getAttribute('aria-modal');
                const dataTestSelector = node.getAttribute('data-test-selector');
                const hasVideoPlayerChild = node.querySelector('video') !== null;

                // Эвристики для определения, что это действительно оверлей/модальное окно
                if (!hasVideoPlayerChild && // Не удалять, если внутри есть видео (защита от удаления плеера)
                    (
                        (role === 'dialog' || role === 'alertdialog' || ariaModal === 'true') || // Стандартные атрибуты модальных окон
                        (dataTestSelector && (dataTestSelector.includes('ad') || dataTestSelector.includes('nag') || dataTestSelector.includes('modal'))) || // Twitch-специфичные тестовые селекторы
                        (node.classList && Array.from(node.classList).some(cls => cls.includes('modal') || cls.includes('overlay') || cls.includes('nag-banner') || cls.includes('interstitial'))) // Общие классы для оверлеев
                    )
                   ) {
                    const matchedKeyword = AD_NAG_TEXT_LOWERCASE.find(k => nodeText.includes(k)) || "unknown";
                    logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMAdRemoval', `Removing element by text content (keyword: "${matchedKeyword}"). Role: ${role}, aria-modal: ${ariaModal}, data-test: ${dataTestSelector}, Classes: ${node.className.substring(0,50)}`);
                    node.parentNode.removeChild(node);
                    return true; // Node removed
                }
            }
            return false; // Node not removed by this function call
        };

        // Начальное сканирование существующих элементов
        AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (el.parentNode) { // Дополнительная проверка, вдруг элемент уже удален другим правилом
                    el.parentNode.removeChild(el);
                    logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMAdRemoval', `Initial DOM scan: Removed element by selector: ${selector}`);
                }
            });
        });
        // Начальное сканирование по тексту для элементов, которые могли быть не пойманы селекторами
        // Ограничиваем начальный поиск потенциальными контейнерами, чтобы не сканировать весь DOM слишком агрессивно
        document.querySelectorAll('div[role="dialog"], div[aria-modal="true"], div[class*="modal"], div[class*="overlay"], div[data-a-target]').forEach(checkAndRemoveNode);


        if (!adRemovalObserver) {
            adRemovalObserver = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.addedNodes) {
                        mutation.addedNodes.forEach(addedNode => {
                            if (addedNode.nodeType === Node.ELEMENT_NODE) {
                                // Сначала проверяем сам добавленный узел
                                if (!checkAndRemoveNode(addedNode)) {
                                    // Если сам узел не удален, проверяем его прямых потомков (неглубокий поиск)
                                    // Это компромисс между производительностью и полнотой
                                    if (addedNode.children && addedNode.children.length > 0) {
                                    // Преобразуем в массив, так как коллекция может изменяться при удалении
                                    const children = Array.from(addedNode.children);
                                    for(const child of children){
                                        if (child.nodeType === Node.ELEMENT_NODE) {
                                             checkAndRemoveNode(child); // Не важно, удалился ли ребенок, основной узел `addedNode` остается
                                        }
                                    }
                                    }
                                }
                            }
                        });
                    }
                }
            });

            try {
                adRemovalObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
                logCoreDebug('DOMAdRemoval', 'MutationObserver for DOM ad removal started on documentElement.');
            } catch (e) {
                logError('DOMAdRemoval', 'Failed to start MutationObserver for DOM ad removal:', e);
            }
        }
    }


    function setupVideoPlayerMonitor() {
        if (videoPlayerMutationObserver) return;

        PLAYER_CONTAINER_SELECTORS.forEach(selector => {
            if (videoElement) return;
            const container = document.querySelector(selector);
            if (container) {
                const vid = container.querySelector('video');
                if (vid) {
                    videoElement = vid;
                    logCoreDebug('PlayerMonitor', 'Found initial video element in container:', selector);
                    attachVideoEventListeners(videoElement);
                }
            }
        });
        if (!videoElement) {
            videoElement = document.querySelector('video');
            if(videoElement) {
                logCoreDebug('PlayerMonitor', 'Found initial video element via direct query.');
                attachVideoEventListeners(videoElement);
            }
        }

        videoPlayerMutationObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newVideoElement = node.querySelector('video') || (node.tagName === 'VIDEO' ? node : null);
                            if (newVideoElement && newVideoElement !== videoElement) {
                                logCoreDebug('PlayerMonitor', 'New video element detected through mutation.');
                                if (videoElement) {
                                    logCoreDebug('PlayerMonitor', 'Removing listeners from old video element.');
                                    // Тут можно было бы удалить старые слушатели, но т.к. videoElement перезаписывается,
                                    // и мы проверяем vidElement._adblock_listeners_attached, это не так критично.
                                }
                                videoElement = newVideoElement;
                                attachVideoEventListeners(videoElement);
                                return; // Выходим после обработки первого нового видеоэлемента
                            }
                        }
                    }
                }
                // Можно добавить обработку изменения атрибута data-player-error, если это необходимо
                // if (mutation.type === 'attributes' && mutation.target === videoElement && mutation.attributeName === 'data-player-error') {
                //    const errorVal = videoElement.getAttribute('data-player-error');
                //    if (errorVal && errorVal !== 'false') { /* ... */ }
                // }
            }
        });

        // Наблюдаем за body, т.к. плеер может быть пересоздан в любом месте
        videoPlayerMutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-player-error'] });
        logCoreDebug('PlayerMonitor', 'Video player mutation observer started.');
    }

    function attachVideoEventListeners(vidElement) {
        if (!vidElement || vidElement._adblock_listeners_attached) return;

        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Attaching event listeners to video element:', vidElement);

        const attemptPlay = () => {
            if (vidElement && vidElement.paused) {
                logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'Autoplay', 'Proactively trying to play video element.');
                vidElement.play().catch(e => {
                    // NotAllowedError часто возникает, если нет взаимодействия пользователя, это нормально.
                    // Другие ошибки могут быть более значимыми.
                    if (e.name !== 'NotAllowedError') {
                        logWarn('Autoplay', `Failed to autoplay video: ${e.name} - ${e.message}. User interaction might be required.`);
                    }
                });
            }
        };

        // Небольшая задержка перед первой попыткой воспроизведения, если страница только загрузилась
        setTimeout(attemptPlay, VISIBILITY_RESUME_DELAY_MS);
        vidElement.addEventListener('canplay', attemptPlay, { once: true, passive: true }); // Попробовать воспроизвести, когда видео готово

        vidElement.addEventListener('error', (e) => {
            const error = e?.target?.error; // HTMLMediaElement.error
            const errorCode = error?.code;
            const errorMessage = error?.message;
            logError('PlayerMonitor', `Player error event. Code: ${errorCode || 'N/A'}, Message: "${errorMessage || 'N/A'}"`);
            if (errorCode && RELOAD_ON_ERROR_CODES.includes(errorCode)) {
                logError('PlayerMonitor', `Player error code ${errorCode} is in critical list. Triggering reload.`);
                triggerReload(`Player error code ${errorCode}`);
            }
        }, { passive: true });

        let lastTimeUpdate = Date.now();
        vidElement.addEventListener('timeupdate', () => {
            lastTimeUpdate = Date.now();
        }, { passive: true });

        vidElement.addEventListener('waiting', () => {
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Video event: waiting (buffering)');
            lastTimeUpdate = Date.now(); // Обновляем время последнего события, чтобы таймаут считался от начала 'waiting'
            if (RELOAD_BUFFERING_THRESHOLD_MS > 0) {
                setTimeout(() => {
                    // Проверяем, не было ли воспроизведение возобновлено (paused), не было ли перемотки (seeking),
                    // и достаточно ли данных для воспроизведения (readyState < 3).
                    if (vidElement.paused || vidElement.seeking || vidElement.readyState >= 3) return;
                    if (Date.now() - lastTimeUpdate > RELOAD_BUFFERING_THRESHOLD_MS) {
                        logWarn('PlayerMonitor', `Video appears stuck buffering for over ${RELOAD_BUFFERING_THRESHOLD_MS / 1000}s. Triggering reload.`);
                        triggerReload('Video buffering timeout');
                    }
                }, RELOAD_BUFFERING_THRESHOLD_MS + 1000); // Проверяем чуть позже порога
            }
        }, { passive: true });

        vidElement.addEventListener('stalled', () => {
            logWarn('PlayerMonitor', 'Video event: stalled (browser unable to fetch data).');
            // 'stalled' само по себе может не означать зависание, поэтому используем таймаут.
            if (RELOAD_STALL_THRESHOLD_MS > 0) {
                setTimeout(() => {
                    if (vidElement.paused || vidElement.seeking || vidElement.readyState >= 3) return;
                    if (Date.now() - lastTimeUpdate > RELOAD_STALL_THRESHOLD_MS) {
                        logWarn('PlayerMonitor', `Video appears stalled for over ${RELOAD_STALL_THRESHOLD_MS / 1000}s. Triggering reload.`);
                        triggerReload('Video stall timeout');
                    }
                }, RELOAD_STALL_THRESHOLD_MS + 1000);
            }
        }, { passive: true });

        vidElement._adblock_listeners_attached = true;
    }

    function triggerReload(reason) {
        if (!ENABLE_AUTO_RELOAD) {
            logCoreDebug('ReloadTrigger', `Auto-reload disabled. Suppressing reload for: ${reason}`);
            return;
        }
        const now = Date.now();
        if (reloadCount >= MAX_RELOADS_PER_SESSION) {
            logWarn('ReloadTrigger', `Max reloads (${MAX_RELOADS_PER_SESSION}) reached for this session. Suppressing reload for: ${reason}`);
            return;
        }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn('ReloadTrigger', `Reload cooldown active. Suppressing reload for: ${reason}`);
            return;
        }

        lastReloadTimestamp = now;
        reloadCount++;
        logCoreDebug('ReloadTrigger', `Reloading page (Attempt ${reloadCount}/${MAX_RELOADS_PER_SESSION}). Reason: ${reason}`);
        try {
            unsafeWindow.location.reload();
        } catch (e) {
            logError('ReloadTrigger', 'Exception during location.reload():', e);
        }
    }

    function startErrorScreenObserver() {
        if (!ENABLE_AUTO_RELOAD || errorScreenObserver) return;

        const errorScreenSelectors = [
            '[data-a-target="player-error-screen"]', // Стандартный экран ошибки плеера
            '.content-overlay-gate__content',       // Оверлей возрастного ограничения или других блокировок контента
            'div[data-test-selector="content-overlay-gate-text"]' // Текст внутри такого оверлея
        ];

        errorScreenObserver = new MutationObserver(() => {
            for (const selector of errorScreenSelectors) {
                const errorScreenElement = document.querySelector(selector);
                // Проверяем, что элемент видим (offsetParent !== null) или имеет активный класс для оверлеев
                if (errorScreenElement && (errorScreenElement.offsetParent !== null || errorScreenElement.classList.contains('content-overlay-gate--active'))) {
                    logError('ErrorScreenObserver', `Twitch error screen detected (selector: ${selector}). Triggering reload.`);
                    triggerReload(`Detected player error screen: ${selector}`);
                    return; // Перезагружаемся при первом обнаружении
                }
            }
        });
        errorScreenObserver.observe(document.body, { childList: true, subtree: true });
        logCoreDebug('ErrorScreenObserver', 'Observer for player error screens started.');
    }

    function initializeScript() {
        logCoreDebug('Initialize', `Twitch Adblock Ultimate v${SCRIPT_VERSION} initializing...`);
        injectCSS();
        if (FORCE_MAX_QUALITY_IN_BACKGROUND) forceMaxQuality();
        hookQualitySettings();
        installHooks();
        removeDOMAdElementsImproved(); // Используем улучшенную функцию
        startErrorScreenObserver();
        setupVideoPlayerMonitor();
        logCoreDebug('Initialize', 'Script initialized successfully.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript, { once: true });
    } else {
        initializeScript();
    }
})();