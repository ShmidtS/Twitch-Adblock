// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      19.1.8
// @description  Блокировка рекламы Twitch через очистку M3U8 и модификацию GQL
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
// @connect      api.twitch.tv
// @connect      github.com
// @connect      raw.githubusercontent.com
// @updateURL    https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @downloadURL  https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '19.1.8'; // Изменена версия для отражения оптимизаций

    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true);
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const BLOCK_NATIVE_ADS_SCRIPT = GM_getValue('TTV_AdBlock_BlockNatScript', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true);
    const HIDE_COOKIE_BANNER = GM_getValue('TTV_AdBlock_HideCookieBanner', true);

    const SHOW_ERRORS_CONSOLE = true;
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', true);
    const LOG_WORKER_INJECTION_DEBUG = GM_getValue('TTV_AdBlock_Debug_WorkerInject', true);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_Debug_PlayerMon', true);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', true);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', true);

    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '2, 3, 4, 9, 10, 1000, 2000, 3000, 4000, 5000, 6001');
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 15000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 30000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 25000);

    const VISIBILITY_RESUME_DELAY_MS = GM_getValue('TTV_AdBlock_VisResumeDelayMs', 1500);
    const WORKER_PING_INTERVAL_MS = GM_getValue('TTV_AdBlock_WorkerPingIntervalMs', 15000);
    const USE_REGEX_M3U8_CLEANING = GM_getValue('TTV_AdBlock_UseRegexM3U8', true);
    const AGGRESSIVE_GQL_SCAN = GM_getValue('TTV_AdBlock_AggressiveGQLScan', false);

    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const GQL_OPERATION_ACCESS_TOKEN_TEMPLATE = 'PlaybackAccessToken_Template';
    const GQL_OPERATION_ACCESS_TOKEN = 'PlaybackAccessToken';
    const GQL_OPERATION_AD_FREE_QUERY = 'AdFreeQuery';
    const GQL_CLIENT_AD_QUERY = 'ClientSideAd';
    const GQL_OPERATIONS_TO_SKIP_MODIFICATION = new Set([
        GQL_OPERATION_ACCESS_TOKEN, GQL_OPERATION_ACCESS_TOKEN_TEMPLATE,
        'ChannelPointsContext', 'ViewerPoints', 'CommunityPointsSettings',
        'ClaimCommunityPoints', 'CreateCommunityPointsReward', 'UpdateCommunityPointsReward',
        'DeleteCommunityPointsReward', 'UpdateCommunityPointsSettings', 'CustomRewardRedemption',
        'RedeemCommunityPointsCustomReward', 'RewardCenter', 'ChannelPointsAutomaticRewards',
        'predictions', 'polls', 'UserFollows', 'VideoComments', 'ChatHighlights',
        'VideoPreviewCard__VideoHover', 'UseLive', 'UseBrowseQueries', 'ViewerCardModLogsMessagesBySender',
        'ComscoreStreamingQuery', 'StreamTags', 'StreamMetadata', 'VideoMetadata', 'ChannelPage_GetChannelStat',
        'Chat_Userlookup', 'RealtimeStreamTagList_Tags', 'UserModStatus', 'FollowButton_FollowUser', 'FollowButton_UnfollowUser',
        'Clips_Popular_ miesiąc', 'PersonalSections', 'RecommendedChannels', 'FrontPage', 'GetHomePageRecommendations', 'VideoComments_SentMessage',
        'UseUserReportModal', 'ReportUserModal_UserReport', 'UserLeaveSquad', 'UserModal_GetFollowersForUser', 'UserModal_GetFollowedChannelsForUser',
        'PlayerOverlaysContext', 'MessageBufferPresences', 'RecentChatMessages', 'ChatRoomState', 'VideoPreviewCard__VideoPlayer',
        'ChannelPage_ChannelInfoBar_User', 'ChannelPage_SetSessionStatus', 'UseSquadStream', 'OnsiteNotifications', 'OnsiteWaffleNotifications',
        'UserActions', 'BitsLeaderboard', 'ChannelLeaderboards', 'PrimeOffer', 'ChannelExtensions', 'ExtensionsForChannel',
        'DropCampaignDetails', 'DropsDashboardPage_GetDropCampaigns', 'StreamEventsSlice', 'StreamElementsService_GetOverlays',
        'StreamElementsService_GetTheme', 'ViewerBounties', 'GiftASubModal_UserGiftEligibility', 'WebGiftSubButton_SubGiftEligibility',
        'CharityCampaign', 'GoalCreateDialog_User', 'GoalsManageOverlay_ChannelGoals', 'PollCreateDialog_User',
        'MultiMonthDiscount', 'FreeSubBenefit', 'SubPrices', 'SubscriptionProductBenefitMessages', 'UserCurrentSubscriptionsContext',
        'VideoPreviewCard_VideoMarkers', 'UpdateVideoMutation', 'DeleteVideos', 'HostModeTargetDetails', 'StreamInformation'
    ]);
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIAL', 'ANNOUNCEMENT'];
    const AD_DATERANGE_REGEX = USE_REGEX_M3U8_CLEANING ? /CLASS="(?:TWITCH-)?STITCHED-AD"/i : null;

    let AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com',
        'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'scorecardresearch.com', 'yandex.ru/clck/', '/ads/', '/advertisement/', 'omnitagjs', 'omnitag',
        'video-ads', 'ads-content', 'adserver', '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads',
        'innovid.com', 'eyewonder.com', 'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com',
        'flashtalking.com', 'contextual.media.net', 'advertising.com', 'adform.net', 'freewheel.tv',
        'stickyadstv.com', 'tremorhub.com', 'aniview.com', 'criteo.com', 'adition.com', 'teads.tv',
        'undertone.com', 'vidible.tv', 'vidoomy.com', 'appnexus.com'
    ];
    if (BLOCK_NATIVE_ADS_SCRIPT) {
        AD_URL_KEYWORDS_BLOCK.push('nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js');
    }
    const blockedUrlKeywordsSet = new Set(AD_URL_KEYWORDS_BLOCK.map(keyword => keyword.toLowerCase()));
    const PLAYER_SELECTORS_IMPROVED = [
        'div[data-a-target="video-player"] video[playsinline]', '.video-player video[playsinline]',
        'div[data-a-player-state] video', 'main video[playsinline][src]', 'video.persistent-player',
        'video[class*="video-player"]', 'video[class*="player-video"]', 'video[src]', 'video'
    ];
    const AD_OVERLAY_SELECTORS_CSS = [
        '.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]',
        'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]',
        '.player-ad-notice', '.ad-interrupt-screen', 'div[data-test-selector="ad-banner-default-text-area"]',
        'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]',
        '[data-test-selector="sad-overlay"]', 'div[class*="video-ad-label"]',
        '.player-ad-overlay', 'div[class*="advertisement"]', 'div[class*="-ad-"]'
    ];
    const COOKIE_BANNER_SELECTOR = '.consent-banner';
    const AD_DOM_ELEMENT_SELECTORS_TO_REMOVE = [
        'div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]',
        'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]',
        'iframe[src*="imasdk.googleapis.com"]', '.player-overlay-ad', '.tw-player-ad-overlay', '.video-ad-display',
        'div[data-ad-placeholder="true"]', '[data-a-target="video-ad-countdown-container"]',
        '.promoted-content-card', 'div[class*="--ad-banner"]', 'div[data-ad-unit]',
        'div[class*="player-ads"]', 'div[data-ad-boundary]'
    ];
    if (HIDE_COOKIE_BANNER) AD_DOM_ELEMENT_SELECTORS_TO_REMOVE.push(COOKIE_BANNER_SELECTOR);
    const AD_DOM_PARENT_INDICATOR_SELECTORS = [
        '.video-player', '.persistent-player', 'div[data-a-target="video-player-layout"]', 'main',
        'div[class*="player-container"]'
    ];

    // *** OPTIMIZATION START: Whitelisted Twitch content domains/patterns ***
    const TWITCH_CONTENT_HOST_REGEX = /\.(ttvnw\.net|twitch\.tv|twitchcdn\.net)$/i;
    const TWITCH_VIDEO_SEGMENT_PATH_REGEX = /(\.ts$|\/segment\/|videochunk|videoplayback)/i; // Added common video segment patterns
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;
    // *** OPTIMIZATION END ***

    let hooksInstalledMain = false;
    let workerHookAttempted = false;
    const hookedWorkers = new Map();
    let playerMonitorIntervalId = null;
    let videoElement = null;
    let lastVideoTimeUpdateTimestamp = 0;
    let lastKnownVideoTime = -1;
    let isWaitingForDataTimestamp = 0;
    let reloadTimeoutId = null;
    let lastReloadTimestamp = 0;
    let cachedQualityValue = null;
    let visibilityResumeTimer = null;
    let playerFinderObserver = null;
    let adRemovalObserver = null;
    let workerPingIntervalId = null;
    const RELOAD_ON_ERROR_CODES = RELOAD_ON_ERROR_CODES_RAW.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const OriginalWorker = unsafeWindow.Worker;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;
    const originalXhrResponseGetter = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'response');
    const originalXhrResponseTextGetter = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'responseText');

    function logError(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logCoreDebug(source, message, ...args) { if (CORE_DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logModuleTrace(moduleFlag, source, message, ...args) { if (moduleFlag) { const truncatedArgs = args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg); console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...truncatedArgs); } }

    logCoreDebug('Main', `Запуск скрипта. Версия: ${SCRIPT_VERSION}.`);

    let cssToInject = '';
    if (HIDE_AD_OVERLAY_ELEMENTS) cssToInject += `${AD_OVERLAY_SELECTORS_CSS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }\n`;
    if (HIDE_COOKIE_BANNER) cssToInject += `${COOKIE_BANNER_SELECTOR} { display: none !important; }\n`;
    if (cssToInject) try { GM_addStyle(cssToInject); } catch (e) { logError('CSSInject', 'Не удалось применить CSS:', e); }

    function setQualitySettings(forceCheck = false) {
        const context = 'QualitySet';
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue;
            }

            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                const valueAfterSet = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                if (valueAfterSet === TARGET_QUALITY_VALUE) {
                    cachedQualityValue = TARGET_QUALITY_VALUE;
                    logCoreDebug(context, `Качество успешно установлено на 'Источник' (было '${currentValue}')`);
                } else {
                    cachedQualityValue = valueAfterSet;
                    logWarn(context, `Попытка установить качество на 'Источник', но localStorage остался '${valueAfterSet}' (был '${currentValue}'). Возможно, другая логика мешает.`);
                }
            } else {
                logModuleTrace(CORE_DEBUG_LOGGING, context, `Качество уже 'Источник'. Проверка пропущена или подтверждена.`);
            }
        } catch (e) {
            logError(context, 'Ошибка при установке качества:', e);
            cachedQualityValue = null;
        }
    }

    try {
        unsafeWindow.localStorage.setItem = function(key, value) {
            const context = 'QualitySet:LocalStorageHook';
            let forcedValue = value;
            if (key === LS_KEY_QUALITY) {
                if (value !== TARGET_QUALITY_VALUE) {
                    logWarn(context, `Попытка изменить '${key}' на '${value}'. Принудительно устанавливается '${TARGET_QUALITY_VALUE}'.`);
                    forcedValue = TARGET_QUALITY_VALUE;
                }
                cachedQualityValue = forcedValue;
            }
            try {
                const args = Array.from(arguments);
                args[1] = forcedValue;
                return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, args);
            } catch (e) {
                logError(context, `Ошибка вызова original localStorage.setItem для '${key}':`, e);
                if (key === LS_KEY_QUALITY) cachedQualityValue = null;
                throw e;
            }
        };
        cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
        setQualitySettings(true);
    } catch(e) {
        logError('QualitySet:LocalStorageHook', 'Критическая ошибка при перехвате localStorage.setItem:', e);
        if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
    }


    function parseAndCleanM3U8(m3u8Text, url = "N/A") {
        const context = 'M3U8 Clean';
        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;

        logCoreDebug(context, `(${urlFilename}): Вход в parseAndCleanM3U8. Длина текста: ${m3u8Text?.length || 0}`);
        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `Полный URL для M3U8: ${url}`);

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logWarn(context, `(${urlFilename}): Некорректный/пустой M3U8 текст.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
        }

        if (LOG_M3U8_CLEANING_DEBUG) {
            const previewLines = m3u8Text.split('\n').slice(0, 25).join('\n');
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) M3U8 Preview (first 25 lines):\n${previewLines}`);
        }

        const upperM3U8Text = m3u8Text.toUpperCase();
        let potentialAdContent = false;
        if (upperM3U8Text.includes("#EXT-X-DATERANGE:") && (upperM3U8Text.includes(AD_SIGNIFIER_DATERANGE_ATTR.toUpperCase()) || AD_DATERANGE_ATTRIBUTE_KEYWORDS.some(kw => upperM3U8Text.includes(kw)))) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-ASSET:")) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-CUE-OUT")) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-TWITCH-AD-SIGNAL")) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:")) {
            potentialAdContent = true;
        } else if (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(m3u8Text)) {
            potentialAdContent = true;
        }
        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): potentialAdContent initial check = ${potentialAdContent}`);


        if (!potentialAdContent) {
            if (upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:")) { // Double check prefetch as it's a strong ad indicator
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): #EXT-X-TWITCH-PREFETCH найден, принудительный парсинг.`);
                potentialAdContent = true;
            } else {
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): Рекламные маркеры не найдены, пропуск глубокой очистки.`);
                return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
            }
        }


        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): Найдены потенциальные маркеры. Парсинг...`);
        const lines = m3u8Text.split('\n');
        const cleanLines = [];
        let isAdSection = false;
        let adsFound = false;
        let linesRemoved = 0;
        let discontinuityPending = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const upperTrimmedLine = trimmedLine.toUpperCase();
            let shouldRemoveLine = false;
            let isAdMarkerLine = false; // Flag if this line itself is an ad marker to be removed
            let reason = '';

            if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE:')) {
                let isAdDateRange = false;
                if (upperTrimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR.toUpperCase()) || (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(trimmedLine))) {
                    isAdDateRange = true; reason = 'DATERANGE (attr/Regex)';
                } else if (AD_DATERANGE_ATTRIBUTE_KEYWORDS.some(kw => upperTrimmedLine.includes(kw))) {
                    isAdDateRange = true; reason = 'DATERANGE (Keyword)';
                }
                if (isAdDateRange) {
                    shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; discontinuityPending = false;
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
                }
            } else if (upperTrimmedLine.startsWith('#EXT-X-ASSET:')) {
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; discontinuityPending = false; reason = 'ASSET';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
            } else if (upperTrimmedLine.startsWith('#EXT-X-CUE-OUT')) { // Marks start of ad break
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; reason = 'CUE-OUT';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
                discontinuityPending = true; // Expect a discontinuity for ads
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-SIGNAL')) { // Twitch specific ad signal
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; discontinuityPending = false; reason = 'AD-SIGNAL';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
            } else if (upperTrimmedLine.startsWith('#EXT-X-SCTE35:')) { // Generic SCTE35 ad marker
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; discontinuityPending = false; reason = 'SCTE35';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH:')) { // Ad prefetch segments
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; reason = 'TWITCH-PREFETCH';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove: ${trimmedLine.substring(0, 100)}`);
            }
            // Logic for lines *within* an ad section (after a CUE-OUT, DATERANGE-AD, etc.)
            else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) { // Marks end of ad break
                    shouldRemoveLine = true; isAdMarkerLine = true; reason = 'CUE-IN'; isAdSection = false; discontinuityPending = false;
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=false (end of ad section)`);
                } else if (upperTrimmedLine.startsWith('#EXTINF:')) { // If #EXTINF appears, assume content has started
                    isAdSection = false; discontinuityPending = false;
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: #EXTINF: found in ad section -> keep, isAdSection=false (assuming content starts)`);
                    // This line (#EXTINF) itself should NOT be removed, so shouldRemoveLine remains false
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                    if (discontinuityPending) { // If we expected a discontinuity for an ad, remove it.
                        shouldRemoveLine = true; isAdMarkerLine = true; reason = 'DISCONTINUITY (after cue-out/ad marker)'; discontinuityPending = false;
                        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove`);
                    } else { // Otherwise, a discontinuity not related to ads, keep it.
                        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: DISCONTINUITY in ad section (not expected for ad) -> keep`);
                    }
                } else if (!trimmedLine.startsWith('#') && trimmedLine !== '') { // This is likely an ad segment URL
                    shouldRemoveLine = true; reason = 'Segment in Ad Section';
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove: ${trimmedLine.substring(0, 100)}`);
                } else { // Other tags within an ad section (e.g., #EXT-X-PROGRAM-DATE-TIME) might be removed or kept depending on policy
                    // For now, let's assume most other # tags are part of ad metadata and should be removed if isAdSection is true
                    // and it's not an explicit content marker like #EXTINF or an unhandled #EXT-X-CUE-IN.
                    // However, this could be too aggressive. For now, only removing segments and known ad markers.
                    if (discontinuityPending && !upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                         // If discontinuity was pending but we hit another tag, reset.
                        discontinuityPending = false;
                    }
                }
            } else { // Not in an ad section
                discontinuityPending = false; // Reset pending discontinuity if we are out of ad section
            }


            if (!shouldRemoveLine) {
                cleanLines.push(line);
            } else {
                linesRemoved++;
            }
        }

        if (isAdSection) { // If loop finished but still in ad section
            logWarn(context, `(${urlFilename}): M3U8 завершился, но скрипт все еще считает, что находится в рекламной секции. Возможно, отсутствует #EXT-X-CUE-IN или #EXTINF: контента.`);
        }

        const cleanedText = cleanLines.join('\n');
        if (adsFound) {
            logCoreDebug(context, `(${urlFilename}): Завершено. Удалено строк: ${linesRemoved}.`);
            if (LOG_M3U8_CLEANING_DEBUG && linesRemoved > 0) {
                 const cleanedPreviewLines = cleanedText.split('\n').slice(0, 25).join('\n');
                 logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) Cleaned M3U8 Preview (first 25 lines):\n${cleanedPreviewLines}`);
            }
        }
        return { cleanedText: cleanedText, adsFound: adsFound, linesRemoved: linesRemoved };
    }


    function getWorkerInjectionCode() {
        const workerCodeString = (function() {
            const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION_WORKER_REPLACE}';
            const CORE_DEBUG_LOGGING_WORKER = '${CORE_DEBUG_LOGGING_WORKER_REPLACE}';
            const LOG_M3U8_CLEANING_DEBUG_WORKER = '${LOG_M3U8_CLEANING_DEBUG_WORKER_REPLACE}';
            const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

            let hooksSuccessfullySignaled = false;

            function workerLogError(message, ...args) { console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
            function workerLogWarn(message, ...args) { console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
            function workerLogCoreDebug(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
            function workerLogM3U8Trace(message, ...args) { if (LOG_M3U8_CLEANING_DEBUG_WORKER) { const truncatedArgs = args.map(arg => typeof arg === 'string' && arg.length > 100 ? arg.substring(0,100)+'...' : arg); console.debug(LOG_PREFIX_WORKER_BASE + ' [M3U8 Relay] TRACE:', message, ...truncatedArgs); } }

            workerLogCoreDebug("--- Worker AdBlock Code Initializing ---");

            function installWorkerFetchHook() {
                const context = 'WorkerInject:FetchHook';
                if (typeof self.fetch !== 'function') {
                    workerLogWarn('[' + context + '] Fetch API not available in this worker.');
                    return false;
                }
                if (self.fetch.hooked_by_adblock_ult) {
                    workerLogCoreDebug('[' + context + '] Fetch already hooked in this worker.');
                    return true;
                }

                const workerRealFetch = self.fetch;
                workerLogCoreDebug('[' + context + '] Installing fetch hook for M3U8 relay...');

                self.fetch = (input, init) => {
                    let requestUrl = (input instanceof Request) ? input.url : String(input);
                    let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
                    const lowerCaseUrl = requestUrl.toLowerCase();
                    const urlShort = requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl;
                    const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort.substring(0,70);

                    // *** OPTIMIZATION START: More precise M3U8 check for workers ***
                    const isM3U8Request = (lowerCaseUrl.endsWith('.m3u8') || (init?.headers?.['Accept'] || '').toLowerCase().includes('mpegurl')) &&
                                          (lowerCaseUrl.includes('usher.ttvnw.net') || lowerCaseUrl.includes('.m3u8')); // Ensure it's likely a playlist
                    // *** OPTIMIZATION END ***

                    workerLogCoreDebug(`[${context}] Intercepted: ${method} ${urlFilename.substring(0,100)} (M3U8: ${isM3U8Request})`);

                    if (method === 'GET' && isM3U8Request && requestUrl.includes('usher.ttvnw.net')) { // Keep specific usher check for relay
                        workerLogM3U8Trace('Relaying M3U8 request to main script: ' + urlFilename);
                        return new Promise((resolveWorkerPromise, rejectWorkerPromise) => {
                            const messageId = 'm3u8_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                            const onMessageFromMain = (event) => {
                                if (event.data && event.data.type === 'ADBLOCK_M3U8_RESPONSE' && event.data.id === messageId) {
                                    self.removeEventListener('message', onMessageFromMain);
                                    if (event.data.error) {
                                        workerLogError('Error from main script processing M3U8 (' + urlFilename + '):', event.data.error);
                                        rejectWorkerPromise(new TypeError(event.data.error));
                                    } else {
                                        workerLogM3U8Trace('Received processed M3U8 from main script for: ' + urlFilename + `. Length: ${event.data.cleanedText?.length}`);
                                        const responseHeaders = new Headers();
                                        if(event.data.headers) { for(const key in event.data.headers) { responseHeaders.append(key, event.data.headers[key]); } }
                                        if (!responseHeaders.has('Content-Type')) { responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl'); }

                                        resolveWorkerPromise(new Response(event.data.cleanedText, {
                                            status: event.data.status,
                                            statusText: event.data.statusText,
                                            headers: responseHeaders
                                        }));
                                    }
                                }
                            };
                            self.addEventListener('message', onMessageFromMain);

                            try {
                                let headersArray = [];
                                if (init && init.headers) {
                                    if (init.headers instanceof Headers) {
                                        headersArray = Array.from(init.headers.entries());
                                    } else if (typeof init.headers === 'object') {
                                        headersArray = Object.entries(init.headers);
                                    }
                                }
                                self.postMessage({
                                    type: 'ADBLOCK_FETCH_M3U8_REQUEST',
                                    url: requestUrl,
                                    initDetails: { headers: headersArray },
                                    id: messageId
                                });
                                workerLogM3U8Trace('Posted M3U8 request to main script: ' + urlFilename);
                            } catch (e) {
                                self.removeEventListener('message', onMessageFromMain);
                                workerLogError('Failed to postMessage M3U8 request to main script:', e);
                                rejectWorkerPromise(e);
                            }
                        });
                    }
                    return workerRealFetch(input, init);
                };
                self.fetch.hooked_by_adblock_ult = true;
                workerLogCoreDebug('[' + context + '] Worker fetch hook installed successfully.');
                return true;
            }

            function attemptHookInstallationAndSignal() {
                const context = 'WorkerInject:Signal';
                workerLogCoreDebug('[' + context + '] Attempting hook installation and signal to main script...');
                if (installWorkerFetchHook()) {
                    try {
                        const signalMethod = hooksSuccessfullySignaled ? 'resignal_after_eval' : 'initial_signal';
                        self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: signalMethod });
                        hooksSuccessfullySignaled = true;
                        workerLogCoreDebug('[' + context + '] Successfully signaled ADBLOCK_WORKER_HOOKS_READY to main script (Method: ' + signalMethod + ').');
                        return true;
                    } catch(e) {
                        workerLogError('[' + context + '] Error sending ADBLOCK_WORKER_HOOKS_READY message:', e);
                        return false;
                    }
                } else {
                    workerLogError('[' + context + '] Failed to install fetch hook during attemptHookInstallationAndSignal!');
                    try {
                        self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'signal_failed_hook_install' });
                    } catch(e) { workerLogError('[' + context + '] Error sending signal_failed_hook_install message:', e); }
                    return false;
                }
            }

            self.addEventListener('message', function(e) {
                if (e.data?.type === 'PING_WORKER_ADBLOCK') { // Changed PING to PING_WORKER_ADBLOCK to avoid conflict
                    self.postMessage({ type: 'PONG_WORKER_ADBLOCK', workerLabel: self.name || 'unknown_worker_name' });
                } else if (e.data?.type === 'EVAL_ADBLOCK_CODE') {
                    workerLogCoreDebug("[WorkerInject:Msg] Received EVAL_ADBLOCK_CODE. Re-attempting hook installation/signal.");
                    attemptHookInstallationAndSignal();
                } else if (e.data && e.data.type !== 'ADBLOCK_M3U8_RESPONSE') {
                    // workerLogCoreDebug("[WorkerInject:Msg] Received other message:", e.data?.type, e.data);
                }
            });

            attemptHookInstallationAndSignal();
            workerLogCoreDebug("--- Worker AdBlock Code Initialized (with signaling logic) ---");

        }).toString()
        .replace(/\${SCRIPT_VERSION_WORKER_REPLACE}/g, SCRIPT_VERSION)
        .replace(/\${CORE_DEBUG_LOGGING_WORKER_REPLACE}/g, String(CORE_DEBUG_LOGGING))
        .replace(/\${LOG_M3U8_CLEANING_DEBUG_WORKER_REPLACE}/g, String(LOG_M3U8_CLEANING_DEBUG))
        .slice(14, -2);
        return workerCodeString;
    }

    function modifyGqlResponse(responseText, url) {
        const context = 'GQL:Modify';
        if (!MODIFY_GQL_RESPONSE || typeof responseText !== 'string' || responseText.length === 0) return responseText;

        const urlShort = url.substring(0, Math.min(url.length, 60));
        logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Проверка GQL ответа от ${urlShort}... Длина: ${responseText.length}`);

        try {
            let data = JSON.parse(responseText);
            let modifiedOverall = false;

            const opDataArray = Array.isArray(data) ? data : [data];

            for (const opData of opDataArray) {
                if (!opData || typeof opData !== 'object') continue;

                const operationName = opData.extensions?.operationName || opData.operationName || 'UnknownGQLOp';
                let currentOpModified = false;

                if (GQL_OPERATIONS_TO_SKIP_MODIFICATION.has(operationName)) {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Пропуск модификации для операции "${operationName}" (в списке пропуска).`);
                }
                else if (operationName === GQL_OPERATION_AD_FREE_QUERY) {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Обработка операции "${operationName}"...`);
                    if (opData.data?.viewerAdFreeConfig?.isAdFree === false) {
                        opData.data.viewerAdFreeConfig.isAdFree = true;
                        currentOpModified = true;
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Операция "${operationName}": viewerAdFreeConfig.isAdFree установлено в true.`);
                    }
                }
                else if (operationName === GQL_CLIENT_AD_QUERY) {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Обработка операции "${operationName}"...`);
                    let modified = false;
                    if (opData.data) {
                        if (opData.data.ads) { opData.data.ads = null; modified = true; }
                        if (opData.data.clientAd) { opData.data.clientAd = null; modified = true; }
                        if (opData.data.companionSlots) { opData.data.companionSlots = null; modified = true; }
                        if (opData.data.playerAdParams) { opData.data.playerAdParams = null; modified = true; }
                        if (modified) {
                            currentOpModified = true;
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Операция "${operationName}": удалены рекламные поля.`);
                        }
                    }
                }
                else if (operationName === "Interstitials") {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Обработка операции "${operationName}"...`);
                    if (opData.data?.stream?.interstitials && Array.isArray(opData.data.stream.interstitials) && opData.data.stream.interstitials.length > 0) {
                        logWarn(context, `Операция "${operationName}": Найдено ${opData.data.stream.interstitials.length} interstitials. Очистка.`);
                        opData.data.stream.interstitials = [];
                        currentOpModified = true;
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Операция "${operationName}": interstitials установлено в [].`);
                    }
                }
                else if (AGGRESSIVE_GQL_SCAN && opData.data && typeof opData.data === 'object') {
                    let aggressivelyModified = false;
                    function scanAndNullify(obj) {
                        for (const key in obj) {
                            if (typeof key === 'string' && (key.toLowerCase().includes('ad') || key.toLowerCase().includes('advertisement') || key.toLowerCase().includes('promo'))) {
                                if (obj[key] !== null) {
                                    logWarn(context, `[AGGR] Операция "${operationName}": Обнуление ключа '${key}'`);
                                    obj[key] = null;
                                    aggressivelyModified = true;
                                }
                            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                scanAndNullify(obj[key]);
                            }
                        }
                    }
                    scanAndNullify(opData.data);
                    if (aggressivelyModified) currentOpModified = true;
                }
                else {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Пропуск GQL (неизвестная или нецелевая операция): ${operationName}.`);
                    if (CORE_DEBUG_LOGGING && LOG_GQL_MODIFY_DEBUG) {
                        const dataSample = JSON.stringify(opData?.data);
                        if (dataSample && !dataSample.includes('"isAdFree":true')) {
                            console.log(`${LOG_PREFIX} [${context}] GQL SKIPPED OP: ${operationName}, Data Sample: ${(dataSample || '').substring(0,200)}...`);
                        }
                    }
                }

                if (currentOpModified) modifiedOverall = true;
            }

            if (modifiedOverall) {
                const finalData = Array.isArray(data) ? opDataArray : opDataArray[0];
                logCoreDebug(context, `GQL ответ ИЗМЕНЕН для ${urlShort}.`);
                return JSON.stringify(finalData);
            }
        } catch (e) {
            logError(context, `Ошибка модификации GQL ответа от ${url}:`, e);
        }
        return responseText;
    }


    async function fetchOverride(input, init) {
        const context = 'NetBlock:Fetch';
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const urlShortForLog = (requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl).substring(0, 100);

        logModuleTrace(CORE_DEBUG_LOGGING, context, `Fetch: ${method} ${urlShortForLog}`);

        // *** OPTIMIZATION START: Whitelist check for fetch ***
        let isWhitelistedTwitchContent = false;
        let requestHostnameForCheck = '';
        try {
            requestHostnameForCheck = new URL(requestUrl).hostname;
        } catch(e) { /*ignore, will be handled by existing logic */ }

        if (requestHostnameForCheck && TWITCH_CONTENT_HOST_REGEX.test(requestHostnameForCheck)) {
            if (TWITCH_VIDEO_SEGMENT_PATH_REGEX.test(lowerCaseUrl) || TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl)) {
                isWhitelistedTwitchContent = true;
            }
        }
        // *** OPTIMIZATION END ***

        if (!isWhitelistedTwitchContent) { // Only apply general keyword blocking if not whitelisted Twitch content
            let isBlockedByKeyword = false;
            try {
                // Use requestHostnameForCheck if available
                const hostnameToCheck = requestHostnameForCheck ? requestHostnameForCheck.toLowerCase() : new URL(requestUrl).hostname.toLowerCase();
                if (blockedUrlKeywordsSet.has(hostnameToCheck) || AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                    if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) {
                        // not blocked
                    } else {
                        logWarn(context, `БЛОКИРОВКА Fetch (${method}) по ключевому слову: ${requestUrl}`);
                        isBlockedByKeyword = true;
                    }
                }
            } catch (urlError) {
                if (!(urlError.message.includes("Invalid URL") && requestUrl.startsWith("blob:"))) {
                    logWarn(context, `URL Parsing Error for Fetch: "${requestUrl}": ${urlError.message}`);
                }
                // Fallback check on URL if parsing failed
                if (AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                    if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) { /* not blocked */ }
                    else { logWarn(context, `БЛОКИРОВКА Fetch (${method}) (fallback on URL parse error): ${requestUrl}`); isBlockedByKeyword = true; }
                }
            }

            if (isBlockedByKeyword) {
                return Promise.resolve(new Response(null, { status: 403, statusText: "Blocked by TTV AdBlock Ultimate" }));
            }
        } else {
             logModuleTrace(CORE_DEBUG_LOGGING, context, `Fetch: Пропуск общей блокировки для ${urlShortForLog} (белый список Twitch контента)`);
        }

        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && lowerCaseUrl.includes('usher.ttvnw.net');
        if (isM3U8RequestToUsher) {
            logCoreDebug(context, `Fetch: Перехват Usher M3U8 для GM_xmlhttpRequest: ${urlShortForLog}`);
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: requestUrl,
                    headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
                    responseType: "text",
                    onload: function(response) {
                        logCoreDebug(context, `Fetch: GM_xmlhttpRequest для M3U8 ${urlShortForLog} onload. Status: ${response.status}, Length: ${response.responseText?.length}`);
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound, linesRemoved } = parseAndCleanM3U8(response.responseText, requestUrl);

                            const newHeaders = new Headers();
                            if (response.responseHeaders) {
                                response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => {
                                    const parts = line.split(': ', 2);
                                    if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') {
                                        newHeaders.append(parts[0], parts[1]);
                                    }
                                });
                            }
                            if (!newHeaders.has('Content-Type')) { newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl'); }

                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders }));
                        } else {
                            logError(context, `Fetch: GM_xmlhttpRequest для ${urlShortForLog} не удался: ${response.status} ${response.statusText}`);
                            reject(new TypeError(`GM_xmlhttpRequest failed: ${response.statusText || response.status}`));
                        }
                    },
                    onerror: function(error) { logError(context, `Fetch: GM_xmlhttpRequest для ${urlShortForLog} ошибка сети:`, error); reject(new TypeError('Network error')); },
                    ontimeout: function() { logError(context, `Fetch: GM_xmlhttpRequest для ${urlShortForLog} таймаут.`); reject(new TypeError('Timeout')); }
                });
            });
        }

        let originalResponse;
        try {
            originalResponse = await originalFetch(input, init);
            logModuleTrace(CORE_DEBUG_LOGGING, context, `Original fetch done for ${urlShortForLog}, Status: ${originalResponse.status}`);

            if (isGqlRequest && method === 'POST' && originalResponse.ok && MODIFY_GQL_RESPONSE) {
                const contextGQL = 'GQL:FetchResp';
                let responseText;
                try {
                    responseText = await originalResponse.clone().text();
                    if (!responseText) return originalResponse;
                } catch (e) {
                    if (e.name === 'AbortError') {
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, contextGQL, `Clone/text aborted for GQL: ${urlShortForLog}`);
                        return originalResponse;
                    } else {
                        logError(contextGQL, `Clone/text error for GQL: ${urlShortForLog}:`, e);
                        return originalResponse;
                    }
                }

                const modifiedText = modifyGqlResponse(responseText, requestUrl);
                if (modifiedText !== responseText) {
                    const newHeaders = new Headers(originalResponse.headers);
                    newHeaders.delete('Content-Length');
                    return new Response(modifiedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                }
            }
            return originalResponse;
        } catch (error) {
            if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Network') || error.message.includes('aborted') || error.message.includes('ERR_BLOCKED_BY_CLIENT') || error.message.includes('ERR_CONNECTION_CLOSED'))) {
                logWarn(context, `Fetch failed for ${urlShortForLog}: ${error.message}`);
                // Avoid returning a Response with status 0, as it might cause issues. Let it rethrow or simulate a more specific error.
                // Consider re-throwing if it's a genuine network issue not caused by our blocking.
                 if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
                    return Promise.resolve(new Response(null, { status: 403, statusText: `Simulated Blocked by Client` }));
                 }
                 // For other network errors, let them propagate or return a specific error if appropriate.
            } else if (error instanceof DOMException && error.name === 'AbortError') {
                logModuleTrace(CORE_DEBUG_LOGGING, context, `Fetch aborted: ${urlShortForLog}`);
                // An aborted fetch should probably just propagate, not return a new Response(null, {status:0})
            }
            else { logError(context, `Unexpected fetch error for ${urlShortForLog}:`, error); }
            throw error; // Re-throw the error if not handled specifically
        }
    }

    const xhrRequestData = new WeakMap();

    function xhrOpenOverride(method, url) {
        const context = 'NetBlock:XHR';
        const urlString = String(url);
        const lowerCaseUrl = urlString.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const urlShortForLog = (urlString.includes('?') ? urlString.substring(0, urlString.indexOf('?')) : urlString).substring(0,100);

        logModuleTrace(CORE_DEBUG_LOGGING, context, `XHR Open: ${method} ${urlShortForLog}`);

        let blocked = false;
        // *** OPTIMIZATION START: Whitelist check for XHR ***
        let isWhitelistedTwitchContent = false;
        let requestHostnameForCheck = '';
        try {
            requestHostnameForCheck = new URL(urlString).hostname;
        } catch(e) { /*ignore*/ }

        if (requestHostnameForCheck && TWITCH_CONTENT_HOST_REGEX.test(requestHostnameForCheck)) {
            if (TWITCH_VIDEO_SEGMENT_PATH_REGEX.test(lowerCaseUrl) || TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl)) {
                isWhitelistedTwitchContent = true;
            }
        }
        // *** OPTIMIZATION END ***

        if (!isWhitelistedTwitchContent) {
            try {
                const hostnameToCheck = requestHostnameForCheck ? requestHostnameForCheck.toLowerCase() : new URL(urlString).hostname.toLowerCase();
                if (blockedUrlKeywordsSet.has(hostnameToCheck) || AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                    if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) { /* not blocked */ }
                    else { logWarn(context, `ПОМЕТКА XHR для блокировки (ключевое слово): ${urlString}`); blocked = true; }
                }
            } catch (urlError) {
                if (!(urlError.message.includes("Invalid URL") && urlString.startsWith("blob:"))) {
                    logWarn(context, `URL Parsing Error for XHR Open: "${urlString}": ${urlError.message}`);
                }
                if (AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                    if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) { /* not blocked */ }
                    else { logWarn(context, `ПОМЕТКА XHR для блокировки (fallback on URL parse error): ${urlString}`); blocked = true; }
                }
            }
        } else {
             logModuleTrace(CORE_DEBUG_LOGGING, context, `XHR Open: Пропуск общей блокировки для ${urlShortForLog} (белый список Twitch контента)`);
        }


        const isM3U8RequestToUsher = method.toUpperCase() === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && urlString.includes('usher.ttvnw.net');
        xhrRequestData.set(this, { method: method.toUpperCase(), url: urlString, urlShort: urlShortForLog, blocked: blocked, isGql: isGqlRequest, isM3U8: isM3U8RequestToUsher });

        if ((isGqlRequest && MODIFY_GQL_RESPONSE) || isM3U8RequestToUsher) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const reqData = xhrRequestData.get(this);
                    if (reqData) {
                        const originalResponseText = this.responseText;
                        if (typeof originalResponseText !== 'string' || originalResponseText.length === 0) return;

                        let modifiedText = originalResponseText;
                        let modificationPerformed = false;
                        const currentContext = reqData.isGql ? 'GQL:XhrResp' : (reqData.isM3U8 ? 'M3U8:XhrResp' : 'XHR:Resp');

                        if (reqData.isGql && MODIFY_GQL_RESPONSE) {
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, currentContext, `Обработка GQL ответа для ${reqData.urlShort}`);
                            const gqlModified = modifyGqlResponse(originalResponseText, reqData.url);
                            if (gqlModified !== originalResponseText) {
                                modifiedText = gqlModified;
                                modificationPerformed = true;
                            }
                        } else if (reqData.isM3U8) { // This specifically refers to isM3U8RequestToUsher
                            logCoreDebug(currentContext, `Обработка M3U8 ответа для ${reqData.urlShort}. Длина: ${originalResponseText.length}`);
                            const { cleanedText, adsFound, linesRemoved } = parseAndCleanM3U8(originalResponseText, reqData.url);
                            if (adsFound) { // Only modify if ads were actually found and removed
                                modifiedText = cleanedText;
                                modificationPerformed = true;
                            }
                        }

                        if (modificationPerformed) {
                            logCoreDebug(currentContext, `Ответ ИЗМЕНЕН для ${reqData.urlShort}. Новая длина: ${modifiedText.length}`);
                            xhrRequestData.set(this, { ...reqData, modifiedResponse: modifiedText });
                        }
                    }
                }
            }, { once: true, passive: true });
        }

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `originalXhrOpen error for ${urlShortForLog}:`, error); throw error; }
        } else {
            // If blocked, we should not proceed with originalXhrOpen.
            // The blocking action will be in xhrSendOverride.
            // However, we need to ensure 'this' is properly initialized if an error occurs during apply.
            try { originalXhrOpen.call(this, method, "about:blank", ...Array.from(arguments).slice(2)); } catch(e) { /* This is a dummy call to satisfy XHR state if original fails */ }
        }
    }


    function xhrSendOverride(data) {
        const context = 'NetBlock:XHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            try { return originalXhrSend.apply(this, arguments); }
            catch(e){ logError(context, "originalXhrSend (bypassed or no requestInfo) error:", e); throw e; }
        }

        const { method, urlShort, blocked } = requestInfo;

        if (blocked) {
            logWarn(context, `БЛОКИРОВКА XHR send: ${urlShort} (URL: ${requestInfo.url})`);
            // Simulate an aborted request or network error
            this.dispatchEvent(new ProgressEvent('error')); // More indicative of a block
            this.dispatchEvent(new ProgressEvent('abort'));
            try {
                // These might not be directly settable or effective on all browsers once send is called.
                Object.defineProperty(this, 'readyState', { value: 4, writable: true, configurable: true }); // Make writable true for a moment
                this.readyState = 4;
                Object.defineProperty(this, 'status', { value: 0, writable: true, configurable: true });
                this.status = 0; // 0 is often used for client-side blocks
                Object.defineProperty(this, 'statusText', { value: "Blocked by TTV AdBlock Ultimate", writable: true, configurable: true });
                this.statusText = "Blocked by TTV AdBlock Ultimate";

                // Ensure readyState and status are not writable after setting if XHR spec requires
                Object.defineProperty(this, 'readyState', { writable: false });
                Object.defineProperty(this, 'status', { writable: false });
                Object.defineProperty(this, 'statusText', { writable: false });

            } catch (e) { logWarn(context, `Не удалось установить статус для заблокированного XHR ${urlShort}: ${e.message}`); }
            // Call onloadend if it exists, as the request effectively "ended"
            if (typeof this.onloadend === 'function') {
                try { this.onloadend(); } catch (e) {}
            }
            return; // Do not call originalXhrSend
        }

        try {
            logModuleTrace(CORE_DEBUG_LOGGING, context, `XHR Send: ${urlShort}`);
            return originalXhrSend.apply(this, arguments);
        } catch (error) {
            if (error.name === 'NetworkError' || error.message?.includes('ERR_BLOCKED_BY_CLIENT') || error.message?.includes('ERR_CONNECTION_CLOSED') ||
                (error.message && (error.message.includes('Failed to execute') ) ) ) {
                logWarn(context, `XHR send failed for ${urlShort}: ${error.message}`);
            } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
                logError(context, `Unknown xhr.send error for ${urlShort}:`, error);
            }
            throw error;
        }
    }

    function hookXhrGetters() {
        const contextGQL = 'GQL:XhrGetter';
        const contextM3U8 = 'M3U8:XhrGetter';

        if (MODIFY_GQL_RESPONSE || true) { // True ensures M3U8 can also use this
            if (originalXhrResponseGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.modifiedResponse !== null && reqData?.modifiedResponse !== undefined &&
                            ( (reqData.isGql && MODIFY_GQL_RESPONSE) || reqData.isM3U8 ) && // isM3U8 for M3U8 responses
                            (this.responseType === '' || this.responseType === 'text')) {
                            const type = reqData.isGql ? 'GQL' : 'M3U8';
                            const logContext = reqData.isGql ? contextGQL : contextM3U8;
                            logModuleTrace(reqData.isGql ? LOG_GQL_MODIFY_DEBUG : LOG_M3U8_CLEANING_DEBUG, logContext, `Возврат модифицированного 'response' (${type}) для ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseGetter.get.call(this); }
                        catch (getterError) { logWarn(reqData?.isGql ? contextGQL : (reqData?.isM3U8 ? contextM3U8 : 'XHR:Getter'), `XHR 'response' getter error for ${reqData?.urlShort || 'unknown XHR'}: ${getterError.message}`); return null;}
                    },
                    configurable: true
                });
            }
            if (originalXhrResponseTextGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.modifiedResponse !== null && reqData?.modifiedResponse !== undefined &&
                            ( (reqData.isGql && MODIFY_GQL_RESPONSE) || reqData.isM3U8 ) ) { // isM3U8 for M3U8 responses
                            const type = reqData.isGql ? 'GQL' : 'M3U8';
                            const logContext = reqData.isGql ? contextGQL : contextM3U8;
                            logModuleTrace(reqData.isGql ? LOG_GQL_MODIFY_DEBUG : LOG_M3U8_CLEANING_DEBUG, logContext, `Возврат модифицированного 'responseText' (${type}) для ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseTextGetter.get.call(this); }
                        catch (getterError) { logWarn(reqData?.isGql ? contextGQL : (reqData?.isM3U8 ? contextM3U8 : 'XHR:Getter'), `XHR 'responseText' getter error for ${reqData?.urlShort || 'unknown XHR'}: ${getterError.message}`); return "";}
                    },
                    configurable: true
                });
            }
            logCoreDebug('XHR:Getters', `XHR геттеры 'response' и 'responseText' перехвачены для GQL и M3U8.`);
        }
    }


    function handleMessageFromWorkerGlobal(event) {
        const msgData = event.data;
        if (msgData && typeof msgData.type === 'string') {
            const workerInstance = event.source; // This is the correct way to get the source worker
            let workerLabel = 'UnknownWorker';

            // Try to find workerLabel based on event.source
            if (workerInstance) {
                for (const [label, state] of hookedWorkers.entries()) {
                    if (state.instance === workerInstance) {
                        workerLabel = label;
                        break;
                    }
                }
            } else if (msgData.workerLabel) { // Fallback to label in message if source not available (less reliable)
                workerLabel = msgData.workerLabel;
            }


            if (msgData.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                logCoreDebug('WorkerInject:Confirm', `Получен сигнал ADBLOCK_WORKER_HOOKS_READY от Worker (${workerLabel}, Method: ${msgData.method || 'N/A'})`);
                const workerState = hookedWorkers.get(workerLabel); // Try direct lookup first
                if (workerState) {
                    workerState.hooksReady = true;
                } else { // If not found by label (e.g. label was from message), iterate to find by instance
                    let found = false;
                    for(const state of hookedWorkers.values()){
                        if(state.instance === workerInstance) {
                            state.hooksReady = true;
                            found = true;
                            break;
                        }
                    }
                    if(!found) {
                        logWarn('WorkerInject:Confirm', `HOOKS_READY от Worker (${workerLabel}), но не найден в hookedWorkers. Возможно, был удален или label/instance не совпал.`);
                    }
                }
            } else if (msgData.type === 'PONG_WORKER_ADBLOCK') { // Changed to PONG_WORKER_ADBLOCK
                const pongWorkerLabel = msgData.workerLabel || workerLabel; // Prefer label from pong message if available
                const workerState = hookedWorkers.get(pongWorkerLabel);
                if (workerState) {
                    workerState.lastPong = Date.now();
                    logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerInject:Pinger', `PONG_WORKER_ADBLOCK received from ${pongWorkerLabel}`);
                } else {
                    logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerInject:Pinger', `PONG_WORKER_ADBLOCK received from unknown/deleted worker ${pongWorkerLabel}`);
                }
            } else if (msgData.type === 'ADBLOCK_FETCH_M3U8_REQUEST') {
                logCoreDebug('MainWorkerComm', `Получен M3U8 запрос от Worker (${workerLabel}): ${msgData.url.substring(0,100)}`);
                const { url, initDetails, id } = msgData;

                if (!workerInstance) {
                    logError('MainWorkerComm', `Не удалось получить workerInstance для ответа Worker'у (${workerLabel}) по M3U8 запросу. Запрос ${id} не будет обработан.`);
                    return;
                }


                GM_xmlhttpRequest({
                    method: "GET", url: url,
                    headers: initDetails?.headers ? Object.fromEntries(initDetails.headers) : undefined,
                    responseType: "text",
                    onload: function(response) {
                        let postData = { type: 'ADBLOCK_M3U8_RESPONSE', id: id };
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound } = parseAndCleanM3U8(response.responseText, url);
                            postData.cleanedText = cleanedText;
                            postData.status = response.status;
                            postData.statusText = response.statusText;

                            const responseHeadersObj = {};
                            if (response.responseHeaders) {
                                response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => {
                                    const parts = line.split(': ', 2);
                                    if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') {
                                        responseHeadersObj[parts[0]] = parts[1];
                                    }
                                });
                            }
                            postData.headers = responseHeadersObj;
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'MainWorkerComm', `Отправка успешного ответа для M3U8 ${id} (AdsFound: ${adsFound}, Worker: ${workerLabel}). Длина: ${cleanedText?.length}`);
                        } else {
                            postData.error = `Failed GM_xmlhttpRequest: ${response.status} ${response.statusText}`;
                            postData.status = response.status;
                            postData.statusText = response.statusText;
                            logError('MainWorkerComm', `GM_xmlhttpRequest ошибка для M3U8 ${id} от Worker (${workerLabel}): ${postData.error}`);
                        }
                        try { workerInstance.postMessage(postData); }
                        catch (e) { logError('MainWorkerComm', `Ошибка postMessage обратно в Worker (${workerLabel}) для M3U8 ${id}: ${e.message}`);}
                    },
                    onerror: function(error) {
                        logError('MainWorkerComm', `Сетевая ошибка GM_xmlhttpRequest для M3U8 ${id} от Worker (${workerLabel}):`, error);
                        try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Network error', status: 0, statusText: 'Network Error' }); }
                        catch (e) { logError('MainWorkerComm', `Ошибка postMessage обратно в Worker (${workerLabel}) для M3U8 ${id}: ${e.message}`);}
                    },
                    ontimeout: function() {
                        logError('MainWorkerComm', `Таймаут GM_xmlhttpRequest для M3U8 ${id} от Worker (${workerLabel}).`);
                        try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Timeout', status: 0, statusText: 'Timeout' }); }
                        catch (e) { logError('MainWorkerComm', `Ошибка postMessage обратно в Worker (${workerLabel}) для M3U8 ${id}: ${e.message}`);}
                    }
                });
            }
        }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;

        // Add main message listener if not already added globally for this worker (handleMessageFromWorkerGlobal does this)
        // workerInstance.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true }); // Already handled by global listener

        workerInstance.addEventListener('error', (e) => {
            logError('WorkerInject:Error', `Ошибка внутри Worker (${label}):`, e.message, `(${e.filename}:${e.lineno}:${e.colno})`);
            // Do not delete hooked worker here, pinger will handle unresponsive ones if needed
            // hookedWorkers.delete(label);
        }, { passive: true });
        workerInstance._listenersAddedByAdblock = true; // Mark that we've attached listeners to this specific instance.
        logCoreDebug('WorkerInject:MsgListenerSetup', `Слушатели ошибок (и глобальный message) активны для Worker (${label})`);
    }


    function hookWorkerConstructor() {
        const context = 'WorkerInject:HookSetup';
        if (!INJECT_INTO_WORKERS) { logWarn(context, "Инъекция в Worker'ы отключена."); return; }
        if (unsafeWindow.Worker?.hooked_by_adblock_ult) { logCoreDebug(context, "Worker конструктор уже перехвачен."); return; }
        if (typeof OriginalWorker === 'undefined') { logError(context, 'OriginalWorker не найден. Невозможно перехватить.'); return; }

        logCoreDebug(context, "Перехват Worker конструктора...");
        workerHookAttempted = true;

        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                let urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                let isBlobURL = urlString.startsWith('blob:');
                const randomId = Math.random().toString(36).substr(2, 5);
                let workerLabel = isBlobURL ? `blob-${randomId}:${urlString.substring(5, 35)}...` : `${(urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 40))}-${randomId}`;
                let isIVSWorker = workerLabel.includes('amazon-ivs-wasmworker') || workerLabel.includes('ivs-wasmworker'); // IVS often uses wasm/blob
                if(isIVSWorker) workerLabel += " (IVS)";

                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Создание нового Worker: ${workerLabel} (Тип: ${isBlobURL ? 'Blob' : 'Script'}${isIVSWorker ? ', IVS Worker' : ''}), URL: ${urlString.substring(0,150)}`);

                let newWorkerInstance;
                try {
                    // For blob URLs, code injection via postMessage + eval is often not possible or desirable.
                    // The expectation is that if a blob worker needs our code, it's created with it.
                    // For script URLs, we can attempt postMessage injection.
                    newWorkerInstance = super(scriptURL, options);
                    newWorkerInstance._workerLabel = workerLabel; // Store label for easier identification
                    newWorkerInstance._createdAt = Date.now(); // Store creation time

                    hookedWorkers.set(workerLabel, {
                        instance: newWorkerInstance,
                        lastPing: 0,
                        lastPong: Date.now(), // Initialize lastPong to now to avoid immediate ping timeout
                        hooksReady: false,
                        url: urlString,
                        isBlob: isBlobURL,
                        isIVS: isIVSWorker
                    });
                    addWorkerMessageListeners(newWorkerInstance, workerLabel); // Attaches error listeners

                    // Only attempt postMessage injection for non-blob, non-IVS workers known not to self-inject.
                    // IVS workers are special and usually shouldn't be tampered with this way.
                    if (!isBlobURL && !isIVSWorker) {
                        setTimeout(() => {
                            const workerState = hookedWorkers.get(workerLabel);
                            if (workerState && !workerState.hooksReady) {
                                logWarn(context, `Worker (${workerLabel}) не прислал сигнал HOOKS_READY в течение 300ms. Попытка инъекции кода через postMessage...`);
                                try {
                                    const codeToInject = getWorkerInjectionCode();
                                    logCoreDebug(context, `Отправка EVAL_ADBLOCK_CODE в Worker (${workerLabel})...`);
                                    newWorkerInstance.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: codeToInject });
                                } catch(e) {
                                    logError(context, `Ошибка postMessage (EVAL_ADBLOCK_CODE) для Worker (${workerLabel}):`, e);
                                    // hookedWorkers.delete(workerLabel); // Avoid aggressive deletion
                                }
                            } else if (workerState && workerState.hooksReady) {
                                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Worker (${workerLabel}) уже прислал HOOKS_READY. Инъекция EVAL_ADBLOCK_CODE не требуется.`);
                            } else if (!workerState) {
                                // logWarn(context, `Worker (${workerLabel}) не найден в hookedWorkers перед отложенной инъекцией.`);
                            }
                        }, 300);
                    } else {
                        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Пропуск инъекции EVAL_ADBLOCK_CODE для ${isBlobURL ? 'Blob' : ''}${isIVSWorker ? 'IVS ' : ''}Worker (${workerLabel}).`);
                         // For blob/IVS, assume they are either not our target or handle themselves.
                         // We still track them in hookedWorkers for potential debugging/identification.
                    }

                } catch (constructorError) {
                    logError(context, `Ошибка конструктора HookedWorker для ${workerLabel} (URL: ${urlString.substring(0,100)}):`, constructorError);
                    throw constructorError;
                }
                return newWorkerInstance;
            }
        };

        try {
            Object.keys(OriginalWorker).forEach(key => { if (!unsafeWindow.Worker.hasOwnProperty(key)) { try { unsafeWindow.Worker[key] = OriginalWorker[key]; } catch(e){} } });
            Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker);
            // Setting prototype of Worker.prototype is tricky and might not be needed if statics are enough
            // Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorker.prototype);
        } catch (e) { logError(context, "Не удалось восстановить прототип/статику Worker:", e); }

        unsafeWindow.Worker.hooked_by_adblock_ult = true;
        logCoreDebug(context, "Worker конструктор успешно перехвачен.");

        unsafeWindow.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true });
        logCoreDebug(context, "Глобальный слушатель 'message' от worker'ов добавлен.");
    }

    function startWorkerPinger() {
        const context = 'WorkerInject:Pinger';
        if (workerPingIntervalId || !INJECT_INTO_WORKERS || WORKER_PING_INTERVAL_MS <= 0) return;

        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Запуск Worker Pinger (интервал: ${WORKER_PING_INTERVAL_MS}ms).`);
        workerPingIntervalId = setInterval(() => {
            const now = Date.now();
            if (hookedWorkers.size === 0 && !LOG_WORKER_INJECTION_DEBUG) { // Less verbose if no workers and debug off
                return;
            }

            hookedWorkers.forEach((state, label) => {
                try {
                    if (state.instance && typeof state.instance.postMessage === 'function') {
                        // *** OPTIMIZATION START: Modified Pinger Logic ***
                        let shouldPing = false;
                        if (state.hooksReady) { // Always ping if hooks are reported ready
                            shouldPing = true;
                        } else if (!state.isBlob && !state.isIVS) { // For non-blob/non-IVS workers, ping if they haven't reported ready for a while
                             const timeSinceCreation = now - (state.instance._createdAt || state.lastPing || now);
                             if (timeSinceCreation > WORKER_PING_INTERVAL_MS * 1.5) { // Give them some time to report
                                 shouldPing = true;
                             }
                        }
                        // Do NOT ping blob or IVS workers unless they explicitly signaled hooksReady,
                        // as they might not have our ping handler and are critical.

                        if (shouldPing) {
                            // Check for timeout only if we expected a pong (i.e., we pinged before)
                            if (state.lastPing > 0 && state.lastPong < state.lastPing && (now - state.lastPing > WORKER_PING_INTERVAL_MS * 2.5) ) {
                                // More lenient timeout check (e.g., 2.5 * interval)
                                // For critical workers (IVS/Blob that *did* signal ready), be cautious with termination.
                                if (state.isIVS || state.isBlob) {
                                    logWarn(context, `Worker (${label}) (IVS/Blob, HooksReady=${state.hooksReady}) не отвечает на пинги (${Math.round((now - state.lastPing)/1000)}s). НЕ УДАЛЯЕТСЯ.`);
                                    // Reset lastPing to avoid continuous warnings for the same unresponsive worker if it's critical
                                    state.lastPing = now + WORKER_PING_INTERVAL_MS; // Effectively skips next few ping cycles for this log
                                } else {
                                    logWarn(context, `Worker (${label}) не отвечает на пинги (${Math.round((now - state.lastPing)/1000)}s). Удаление из списка.`);
                                    try { state.instance.terminate(); } catch(e){ /* ignore termination error */ }
                                    hookedWorkers.delete(label);
                                }
                                return; // Move to next worker
                            }
                            logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `PING_WORKER_ADBLOCK -> ${label}`);
                            state.instance.postMessage({ type: 'PING_WORKER_ADBLOCK' });
                            state.lastPing = now; // Record time of this ping
                        }
                        // *** OPTIMIZATION END ***
                    } else {
                        logWarn(context, `Worker (${label}) не имеет postMessage или отсутствует. Удаление.`);
                        hookedWorkers.delete(label);
                    }
                } catch (e) {
                    logError(context, `Ошибка при отправке PING_WORKER_ADBLOCK в Worker (${label}):`, e.message);
                    if (e.message.includes("terminated")) { // If worker was already terminated
                        hookedWorkers.delete(label);
                    }
                }
            });
        }, WORKER_PING_INTERVAL_MS);
    }

    function stopWorkerPinger() {
        if (workerPingIntervalId) {
            clearInterval(workerPingIntervalId);
            workerPingIntervalId = null;
            logCoreDebug('WorkerInject:Pinger', 'Worker Pinger остановлен.');
        }
    }

    function installHooks() {
        const context = 'MainHooks';
        if (hooksInstalledMain) return;
        logCoreDebug(context, "Установка основных перехватчиков...");

        try { unsafeWindow.fetch = fetchOverride; logCoreDebug(context, "Fetch перехвачен."); }
        catch (e) { logError(context, "Не удалось перехватить Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }

        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            hookXhrGetters();
            logCoreDebug(context, "XMLHttpRequest перехвачен.");
        } catch (e) {
            logError(context, "Не удалось перехватить XMLHttpRequest:", e);
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend;
            if (originalXhrResponseGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', originalXhrResponseGetter); } catch(revertErr) {}
            if (originalXhrResponseTextGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', originalXhrResponseTextGetter); } catch (revertErr) {}
        }

        if (INJECT_INTO_WORKERS) {
            try { hookWorkerConstructor(); }
            catch (e) { logError(context, "Не удалось перехватить Worker конструктор:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; }
        } else {
            workerHookAttempted = false;
        }

        hooksInstalledMain = true;
        logCoreDebug(context, "Основные перехватчики установлены.");
    }

    function removeDOMAdElements(contextNode = document) {
        if (!ATTEMPT_DOM_AD_REMOVAL || !contextNode || typeof contextNode.querySelectorAll !== 'function') return;
        let removedCount = 0;
        AD_DOM_ELEMENT_SELECTORS_TO_REMOVE.forEach(selector => {
            if (selector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) return;
            try {
                const elements = contextNode.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el && el.parentNode) {
                        // More robust check to avoid removing player itself or its core components
                        if (el.querySelector('video') || el.closest(PLAYER_SELECTORS_IMPROVED.join(',')) || el.hasAttribute('data-a-target="video-player') || el.classList.contains('video-player')) {
                            logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMRemove', `Пропуск удаления элемента ("${selector}") внутри или являющегося плеером.`);
                            return;
                        }
                        logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMRemove', `Удаление элемента по селектору: "${selector}"`);
                        try { el.parentNode.removeChild(el); removedCount++; }
                        catch (removeError) {
                            if (!(removeError instanceof DOMException && removeError.name === 'NotFoundError')) { // Ignore if already removed
                                logWarn('DOMRemove', `Ошибка при удалении элемента с селектором "${selector}":`, removeError.message);
                            }
                        }
                    }
                });
            } catch (queryError) {
                logWarn('DOMRemove', `Ошибка при поиске элементов по селектору "${selector}":`, queryError.message);
            }
        });
        if (removedCount > 0) logCoreDebug('DOMRemove', `Удалено ${removedCount} DOM элементов, относящихся к рекламе.`);
    }

    function startAdRemovalObserver() {
        if (!ATTEMPT_DOM_AD_REMOVAL || adRemovalObserver) return;
        const context = 'DOMRemove:Observer';

        let observedNode = document.body;
        // Attempt to find a more specific parent if possible, but default to body
        for (const selector of AD_DOM_PARENT_INDICATOR_SELECTORS) {
            const parentNode = document.querySelector(selector);
            if (parentNode) { observedNode = parentNode; break; }
        }
        if (!observedNode) observedNode = document.body || document.documentElement; // Fallback
        if(!observedNode) {
            logWarn(context, `Не удалось найти узел для наблюдения DOM. Повторная попытка через 200мс.`);
            setTimeout(startAdRemovalObserver, 200); // Retry if body not ready
            return;
        }


        logCoreDebug(context, `Наблюдение за DOM изменениями в:`, observedNode.tagName + (observedNode.id ? '#' + observedNode.id : '') + (observedNode.className ? '.' + String(observedNode.className).split(' ').filter(Boolean).map(c => '.'+c).join('') : ''));

        const observerConfig = { childList: true, subtree: true };
        const callback = function(mutationsList) {
            let potentialAdNodeAdded = false;
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node itself matches any ad selectors
                            for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) {
                                if (adSelector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) continue;
                                try { if (node.matches && node.matches(adSelector)) { potentialAdNodeAdded = true; break; } } catch(e){ /* ignore match errors on some nodes */ }
                            }
                            if (potentialAdNodeAdded) break;

                            // Check if the added node contains any ad selectors
                            if (!potentialAdNodeAdded) {
                                for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) {
                                    if (adSelector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) continue;
                                    try { if (node.querySelector && node.querySelector(adSelector)) { potentialAdNodeAdded = true; break; } }
                                    catch(e){ /* ignore query errors on some nodes */ }
                                }
                            }
                            if (potentialAdNodeAdded) break;

                            // Check for ad iframes by src
                            if (node.tagName === 'IFRAME' && node.src && AD_URL_KEYWORDS_BLOCK.some(keyword => node.src.toLowerCase().includes(keyword))) {
                                potentialAdNodeAdded = true; break;
                            }
                        }
                    }
                }
                if (potentialAdNodeAdded) break;
            }
            if (potentialAdNodeAdded) {
                logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, context, 'Обнаружены потенциальные рекламные узлы, запускается removeDOMAdElements.');
                removeDOMAdElements(observedNode);
            }
        };
        adRemovalObserver = new MutationObserver(callback);
        try {
            adRemovalObserver.observe(observedNode, observerConfig);
            // Initial removal pass
            requestAnimationFrame(() => removeDOMAdElements(observedNode));
            logCoreDebug(context, 'DOM Observer для удаления рекламы запущен.');
        } catch (e) {
            logError(context, 'Не удалось запустить DOM Observer:', e);
            adRemovalObserver = null;
        }
    }
    function stopAdRemovalObserver() {
        if (adRemovalObserver) {
            adRemovalObserver.disconnect();
            adRemovalObserver = null;
            logCoreDebug('DOMRemove:Observer', 'DOM Observer остановлен.');
        }
    }

    function findVideoPlayer() {
        // More robust check for existing video element
        if (videoElement && videoElement.isConnected && document.body.contains(videoElement)) { // Check if still in DOM
            if (videoElement.offsetWidth > 0 && videoElement.offsetHeight > 0 &&
                (videoElement.paused === false || videoElement.seeking === true || videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) ) { // Looser readyState check
                 if (window.getComputedStyle(videoElement).display !== 'none' && videoElement.offsetParent !== null) return videoElement;
            }
        }

        let foundElement = null;
        for (const selector of PLAYER_SELECTORS_IMPROVED) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    // Prioritize video elements with blob src, visible, and with dimensions
                    if (el && el.tagName === 'VIDEO' && el.isConnected &&
                        el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null &&
                        el.hasAttribute('src') && el.src.startsWith('blob:') &&
                        window.getComputedStyle(el).display !== 'none') {
                            foundElement = el;
                            break;
                    }
                }
                if (foundElement) break;
                // Fallback for other connected video elements if blob src not found
                if (!foundElement && elements.length > 0) {
                    for (const el of elements) {
                        if (el && el.tagName === 'VIDEO' && el.isConnected &&
                            el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null &&
                            window.getComputedStyle(el).display !== 'none') {
                                foundElement = el;
                                break;
                        }
                    }
                }
                if (foundElement) break;
            } catch (e) { /* querySelectorAll can fail on pseudo-elements or invalid selectors */ }
        }

        if (foundElement && foundElement !== videoElement) { logCoreDebug('PlayerFind', 'Видео элемент найден/изменился.'); }
        else if (!foundElement && videoElement) { logWarn('PlayerFind', 'Видео элемент потерян (был ранее).'); }
        else if (!foundElement) { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerFind', 'Видео элемент не найден в данный момент.'); }

        videoElement = foundElement;
        return foundElement;
    }

    function observePlayerContainer() {
        if (playerFinderObserver) return; // Already observing
        const targetNode = document.body || document.documentElement;
        if (!targetNode) {
            logWarn('PlayerFind:Observer', 'Тело документа не найдено для MutationObserver. Повторная попытка...');
            setTimeout(observePlayerContainer, 500); return;
        }

        const config = { childList: true, subtree: true };
        const callback = function(mutationsList, observer) {
            if (videoElement && videoElement.isConnected && document.body.contains(videoElement)) return; // Player already found and valid

            // Efficiently check for video tags first if mutations are extensive
            if (targetNode.getElementsByTagName('video').length > 0) {
                const potentialPlayer = findVideoPlayer(); // Use the main finder logic
                if (potentialPlayer) {
                    logCoreDebug('PlayerFind:Observer', 'Обнаружен видеоплеер (возможно, через getElementsByTagName), запуск/перезапуск монитора плеера.');
                    setupPlayerMonitor(); // This will also stop this observer if player found
                    return; // Exit if player found
                }
            }

            // Fallback to checking mutations if getElementsByTagName didn't yield a quick find
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.tagName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                                logCoreDebug('PlayerFind:Observer', 'Обнаружено добавление VIDEO элемента или его родителя, запуск/перезапуск монитора плеера.');
                                setupPlayerMonitor(); // This will also stop this observer if player found
                                return; // Exit if player found or attempt to find it starts
                            }
                        }
                    }
                }
            }
        };
        playerFinderObserver = new MutationObserver(callback);
        try {
            playerFinderObserver.observe(targetNode, config);
            logCoreDebug('PlayerFind:Observer', 'Player Finder Observer (для поиска видео) запущен.');
        } catch (e) {
            logError('PlayerFind:Observer', 'Не удалось запустить Player Finder Observer:', e);
            playerFinderObserver = null;
        }
    }

    function stopObservingPlayerContainer() {
        if (playerFinderObserver) {
            playerFinderObserver.disconnect();
            playerFinderObserver = null;
            logCoreDebug('PlayerFind:Observer', 'Player Finder Observer остановлен.');
        }
    }

    function setupPlayerMonitor() {
        const context = 'PlayerMon:Setup';
        if (!ENABLE_AUTO_RELOAD) {
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners();
            videoElement = null;
            stopObservingPlayerContainer(); // Stop observing if auto-reload is off
            stopAdRemovalObserver(); // Also stop ad removal if player monitor is off
            logCoreDebug(context, 'Авто-перезагрузка отключена, монитор плеера деактивирован.');
            return;
        }

        const currentVideoElement = findVideoPlayer();
        if (!currentVideoElement) {
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); // Stop old interval if player lost
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners(); // Clean up old listeners
            videoElement = null;
            stopAdRemovalObserver(); // Stop ad removal if no player
            if (!playerFinderObserver && document.body) observePlayerContainer(); // Start observing if not already
            logCoreDebug(context, 'Видео элемент не найден. Запущен/продолжает работать MutationObserver для его поиска.');
            return;
        }
        // If player is found, stop the MutationObserver for player search
        stopObservingPlayerContainer();


        if (currentVideoElement !== videoElement || !playerMonitorIntervalId) {
            logCoreDebug(context, `Видео элемент найден/изменился. Инициализация монитора...`);
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            if (videoElement) removePlayerEventListeners(); // Clean up listeners from a previous element

            videoElement = currentVideoElement;
            checkReloadCooldown(context); // Check cooldown from previous session/reload
            addPlayerEventListeners();
            resetMonitorState('Monitor setup/reset');

            if (ATTEMPT_DOM_AD_REMOVAL && !adRemovalObserver && document.body) startAdRemovalObserver();

            if (!document.hidden) {
                playerMonitorIntervalId = setInterval(monitorPlayerState, 2000); // Standard interval 2s
                logCoreDebug(context, 'Интервал мониторинга состояния плеера запущен.');
            } else {
                logCoreDebug(context, 'Вкладка неактивна, интервал мониторинга не запущен (будет запущен при visibilitychange).');
            }
        }
    }

    function triggerReload(reason) {
        const context = 'PlayerMon:Reload';
        const now = Date.now();
        if (!ENABLE_AUTO_RELOAD) return;

        if (reloadTimeoutId) { // A reload is already scheduled
            logWarn(context, `Перезагрузка (${reason}) запрошена, но другая перезагрузка уже запланирована (${reloadTimeoutId._reason || '?'}). Игнорирование нового запроса.`);
            return;
        }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn(context, `Перезагрузка (${reason}) отменена: активен кулдаун перезагрузки (${((RELOAD_COOLDOWN_MS - (now - lastReloadTimestamp))/1000).toFixed(1)}с осталось).`);
            return;
        }
        if (document.hidden) { // Don't reload if tab is hidden
            logWarn(context, `Перезагрузка (${reason}) отменена: вкладка неактивна.`);
            return;
        }

        let playerStateLog = "N/A";
        if (videoElement) {
            let bufferedLog = "N/A";
            try { if (videoElement.buffered && videoElement.buffered.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}]`; }
                } catch(e){}
            playerStateLog = `CT: ${videoElement.currentTime?.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}, Buffered: ${bufferedLog}, Paused: ${videoElement.paused}, Ended: ${videoElement.ended}, Error: ${videoElement.error?.code || 'null'}`;
        }

        logError(context, `!!!!!! ЗАПУСК ПЕРЕЗАГРУЗКИ СТРАНИЦЫ !!!!!! Причина: ${reason}. Состояние плеера: ${playerStateLog}`);
        lastReloadTimestamp = now;
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); } catch (e) { /* session storage might be unavailable */ }

        // Cleanup before reload
        if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
        playerMonitorIntervalId = null;
        removePlayerEventListeners();
        stopObservingPlayerContainer();
        stopAdRemovalObserver();
        stopWorkerPinger(); // Stop pinger too

        // Perform reload
        unsafeWindow.location.reload();
        // Fallback reload if the first one somehow fails (e.g. blocked by onbeforeunload)
        setTimeout(() => { if(unsafeWindow?.location?.reload) unsafeWindow.location.reload(true); }, 2500);
    }

    function scheduleReload(reason, delayMs = 5000) {
        const context = 'PlayerMon:ScheduleReload';
        if (reloadTimeoutId || !ENABLE_AUTO_RELOAD || document.hidden) {
            if (reloadTimeoutId) logWarn(context, `Попытка запланировать перезагрузку (${reason}), но другая уже в очереди (${reloadTimeoutId._reason || '?'}).`);
            else if (document.hidden) logWarn(context, `Попытка запланировать перезагрузку (${reason}), но вкладка не активна.`);
            return;
        }
        logWarn(context, `Планирование перезагрузки через ${(delayMs / 1000).toFixed(1)}с. Причина: ${reason}`);
        reloadTimeoutId = setTimeout(() => {
            const internalReason = reloadTimeoutId?._reason || reason; // Get reason stored at schedule time
            reloadTimeoutId = null; // Clear ID before triggering
            triggerReload(internalReason);
        }, delayMs);
        try { if (reloadTimeoutId) reloadTimeoutId._reason = reason; } catch(e){} // Store reason with timeoutId
    }

    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) {
            const currentReloadReason = reloadTimeoutId._reason || '';
            // Only cancel reload if it's not for a critical error
            if (!currentReloadReason.toLowerCase().includes('error') && !currentReloadReason.toLowerCase().includes('ошибка')) {
                logCoreDebug('PlayerMon:State', `Отмена запланированной перезагрузки (Причина: ${currentReloadReason}) из-за сброса состояния (Причина сброса: ${reason}).`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            } else {
                logCoreDebug('PlayerMon:State', `Сохранение запланированной перезагрузки по ошибке (Причина: ${currentReloadReason}) несмотря на сброс состояния (Причина сброса: ${reason}).`);
            }
        }
        lastVideoTimeUpdateTimestamp = Date.now();
        lastKnownVideoTime = videoElement ? videoElement.currentTime : -1;
        isWaitingForDataTimestamp = 0; // Reset waiting flag
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:State', `Состояние монитора сброшено (Причина: ${reason}). Текущее время видео: ${lastKnownVideoTime > -1 ? lastKnownVideoTime.toFixed(2) : 'N/A'}`);
    }

    function monitorPlayerState() {
        const context = 'PlayerMon:Monitor';
        if (!ENABLE_AUTO_RELOAD || document.hidden) {
            if (playerMonitorIntervalId && document.hidden) {
                logCoreDebug(context, 'Вкладка неактивна, остановка интервала мониторинга.');
                clearInterval(playerMonitorIntervalId);
                playerMonitorIntervalId = null;
            }
            return;
        }

        if (!videoElement || !videoElement.isConnected || !document.body.contains(videoElement)) { // Re-check validity
            logWarn(context, 'Видео элемент потерян во время мониторинга. Перезапуск процедуры настройки монитора.');
            if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); // Stop this interval
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners(); // Clean up old element
            videoElement = null;
            stopAdRemovalObserver(); // Stop ad observer if player lost
            setupPlayerMonitor(); // Attempt to find/re-setup
            return;
        }

        // Ensure quality setting is maintained
        if (videoElement && videoElement.src) { // Check src to ensure it's an active player
            const currentQualityInStorage = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
            if (currentQualityInStorage !== TARGET_QUALITY_VALUE) {
                logWarn(context, `Качество видео в localStorage ('${currentQualityInStorage}') отклонилось от целевого ('${TARGET_QUALITY_VALUE}'). Принудительная установка.`);
                setQualitySettings(true); // Force check and set
            }
        }


        const now = Date.now();
        const currentTime = videoElement.currentTime;
        const readyState = videoElement.readyState;
        const networkState = videoElement.networkState;
        const isSeeking = videoElement.seeking;
        let bufferEnd = 0;
        let bufferStart = 0;
        let bufferedLength = 0;
        try { if (videoElement.buffered?.length > 0) { bufferedLength = videoElement.buffered.length; bufferStart = videoElement.buffered.start(0); bufferEnd = videoElement.buffered.end(bufferedLength - 1); } } catch (e) {}

        let detectedProblemReason = null;
        const stallDebugInfo = `(RS ${readyState}, NS ${networkState}, CT ${currentTime.toFixed(2)}, Buf [${bufferStart.toFixed(2)}-${bufferEnd.toFixed(2)}] (${bufferedLength} parts))`;


        if (!videoElement.paused && !videoElement.ended && !isSeeking && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;
            if (currentTime === lastKnownVideoTime && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                const nearBufferEnd = bufferEnd - currentTime < 1.5; // Is current time close to the end of buffer?
                let isLikelyStalled = false;
                // More specific stall conditions
                if (readyState < videoElement.HAVE_FUTURE_DATA || // Not enough data for future playback
                    networkState === videoElement.NETWORK_IDLE || // Network is idle, not loading
                    networkState === videoElement.NETWORK_EMPTY) { // Network connection lost or no source
                    isLikelyStalled = true;
                } else if (nearBufferEnd && readyState <= videoElement.HAVE_CURRENT_DATA) { // At buffer end and only current data available
                    isLikelyStalled = true;
                }

                // If stalled, but there's actually buffer ahead, maybe it's a micro-stall or player is about to resume.
                // This can prevent reloads if player is just slightly behind but has data.
                if (isLikelyStalled && bufferedLength > 0 && bufferEnd > currentTime + 0.5) { // Check if buffer end is actually ahead
                     logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, context, `Stall detected, but buffer exists ahead: CT ${currentTime.toFixed(2)}, BufEnd ${bufferEnd.toFixed(2)}. Delaying reload decision.`);
                     isLikelyStalled = false; // Don't consider it a hard stall yet
                }

                if (isLikelyStalled) {
                    detectedProblemReason = `Stall: CT не изменилось за ${timeSinceLastUpdate.toFixed(0)}ms ${stallDebugInfo}`;
                }
            } else if (lastKnownVideoTime > 0 && currentTime < (lastKnownVideoTime - 1.5) && Math.abs(currentTime - lastKnownVideoTime) > 0.5) { // Significant jump backwards
                // This could be a stream reset or a major issue.
                detectedProblemReason = `Playback regression: CT откатилось назад с ${lastKnownVideoTime.toFixed(2)} на ${currentTime.toFixed(2)} ${stallDebugInfo}`;
            }

            // If time progressed, reset stall detection variables
            if (currentTime > lastKnownVideoTime) {
                lastVideoTimeUpdateTimestamp = now; // Update timestamp of last progress
                lastKnownVideoTime = currentTime;
                if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; // Clear waiting if time updated

                // If a stall-related reload was scheduled, cancel it as video is progressing
                if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('stall') && !detectedProblemReason) {
                    logCoreDebug(context, `Отмена запланированной перезагрузки по причине 'stall', т.к. currentTime обновился.`);
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                }
            }
        } else { // Player is paused, ended, or seeking
            lastKnownVideoTime = currentTime; // Keep track of time even if paused
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; // Clear waiting if paused/seeking

            // If a non-error reload was scheduled, cancel it
            if (reloadTimeoutId && !reloadTimeoutId._reason?.toLowerCase().includes('error')) {
                logCoreDebug(context, `Отмена запланированной перезагрузки (Причина: ${reloadTimeoutId._reason || '?'}), т.к. плеер на паузе/завершен/перематывается.`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }

        // Check for prolonged buffering state
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            const bufferingDuration = now - isWaitingForDataTimestamp;
            if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS && !detectedProblemReason) { // Only if no other problem detected
                detectedProblemReason = `Buffering: длительная буферизация > ${(bufferingDuration / 1000).toFixed(1)}s ${stallDebugInfo}`;
            }
        }

        // If player is playing and has enough data, clear waiting state and any buffering-related reload
        const isPlayingAndReady = !videoElement.paused && !videoElement.ended && readyState >= videoElement.HAVE_FUTURE_DATA;
        if (isPlayingAndReady && isWaitingForDataTimestamp > 0) {
            logCoreDebug(context, `Выход из состояния буферизации (плеер играет и готов). ${stallDebugInfo}`);
            isWaitingForDataTimestamp = 0;
            if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('buffer')) {
                logCoreDebug(context, `Отмена запланированной перезагрузки по причине 'buffering', т.к. плеер возобновил воспроизведение.`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }


        if (detectedProblemReason && !reloadTimeoutId) { // If a problem is detected and no reload is scheduled
            scheduleReload(detectedProblemReason);
        }
    }


    function checkReloadCooldown(context) {
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const parsedTime = parseInt(sessionReloadTime, 10);
                sessionStorage.removeItem('ttv_adblock_last_reload'); // Consume it
                if (!isNaN(parsedTime)) {
                    const timeSinceLastReload = Date.now() - parsedTime;
                    if (timeSinceLastReload < RELOAD_COOLDOWN_MS && timeSinceLastReload >= 0) {
                        // Restore lastReloadTimestamp to enforce cooldown
                        lastReloadTimestamp = Date.now() - timeSinceLastReload;
                        logWarn(context, `Восстановлен кулдаун перезагрузки. Осталось ${((RELOAD_COOLDOWN_MS - timeSinceLastReload)/1000).toFixed(1)}с.`);
                    }
                }
            }
        } catch (e) { /* sessionStorage might not be available or fail */ }
    }

    function addPlayerEventListeners() {
        if (!videoElement || videoElement._adblockListenersAttached) return;
        logCoreDebug('PlayerMon:Events', 'Добавление слушателей событий плеера.');
        videoElement.addEventListener('error', handlePlayerError, { passive: true });
        videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true });
        videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true });
        videoElement.addEventListener('pause', handlePlayerPause, { passive: true });
        videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true });
        videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true });
        videoElement.addEventListener('abort', handlePlayerAbort, { passive: true });
        videoElement.addEventListener('timeupdate', handlePlayerTimeUpdate, { passive: true });
        videoElement.addEventListener('progress', handlePlayerProgress, { passive: true });
        videoElement._adblockListenersAttached = true;
    }

    function removePlayerEventListeners() {
        if (!videoElement || !videoElement._adblockListenersAttached) return;
        logCoreDebug('PlayerMon:Events', 'Удаление слушателей событий плеера.');
        videoElement.removeEventListener('error', handlePlayerError);
        videoElement.removeEventListener('waiting', handlePlayerWaiting);
        videoElement.removeEventListener('playing', handlePlayerPlaying);
        videoElement.removeEventListener('pause', handlePlayerPause);
        videoElement.removeEventListener('emptied', handlePlayerEmptied);
        videoElement.removeEventListener('loadedmetadata', handlePlayerLoadedMeta);
        videoElement.removeEventListener('abort', handlePlayerAbort);
        videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate);
        videoElement.removeEventListener('progress', handlePlayerProgress);
        delete videoElement._adblockListenersAttached; // Use delete for custom properties
    }

    function handlePlayerError(event) {
        // Ensure videoElement is still the one that fired the event, or is valid
        if (!videoElement || (event.target !== videoElement && !(event.target instanceof HTMLVideoElement)) ) {
             logWarn('PlayerMon:EventError', 'Событие ошибки от неожиданного/устаревшего элемента.');
             return;
        }
        const error = event?.target?.error; // event.target should be the video element
        if (!error) { logWarn('PlayerMon:EventError', 'Событие ошибки плеера без деталей (event.target.error is null).'); return; }

        const errorCode = error.code;
        const errorMessage = error.message || 'Сообщение об ошибке отсутствует';
        logError('PlayerMon:EventError', `Ошибка плеера! Код: ${errorCode}, Сообщение: "${errorMessage}"`);

        let reason = `Ошибка плеера (Код ${errorCode}: ${errorMessage.substring(0,100)})`;

        if (ENABLE_AUTO_RELOAD) {
            let shouldScheduleReload = false;
            let delay = 3500; // Default delay for error reload

            if (RELOAD_ON_ERROR_CODES.includes(errorCode)) {
                shouldScheduleReload = true;
                if (errorCode === 2000) delay = 3000; // Specific delay for error 2000
                // Add other specific delays if needed
            }
            // Check for specific error messages if codes are generic
            else if (errorMessage.toLowerCase().includes('masterplaylist:10') && RELOAD_ON_ERROR_CODES.includes(10)) { // Example
                reason += ` (MasterPlaylist:10)`; shouldScheduleReload = true;
            } else if (errorMessage.toLowerCase().includes('code 5000') && RELOAD_ON_ERROR_CODES.includes(5000)) { // Example
                reason += ` (Code 5000)`; shouldScheduleReload = true;
            }
            // Add more specific error message checks if Twitch API provides them


            if (shouldScheduleReload) {
                logWarn('PlayerMon:EventError', `Обнаружена ошибка плеера (${reason}), для которой настроена перезагрузка. Планирование перезагрузки...`);
                scheduleReload(reason, delay);
            }
        }
        resetMonitorState(`Ошибка плеера ${errorCode}`); // Reset monitor state on any error
    }

    function handlePlayerWaiting() {
        if (videoElement && !videoElement.paused && !videoElement.seeking && isWaitingForDataTimestamp === 0 && !document.hidden) {
            let bufferedLog = "N/A";
            try { if (videoElement.buffered && videoElement.buffered.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}] (${videoElement.buffered.length} parts)`; }
                } catch(e){}
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventWaiting', `Плеер в состоянии 'waiting' (ожидание данных/буферизация)... CT: ${videoElement.currentTime.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}, Buffered: ${bufferedLog}`);
            isWaitingForDataTimestamp = Date.now();
        }
    }
    function handlePlayerPlaying() {
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventPlaying', `Воспроизведение начато/возобновлено.`);
        if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; // Clear waiting flag
        resetMonitorState('Playing event'); // Reset general state, cancel non-error reloads
        setQualitySettings(true); // Ensure quality is correct on playback start
    }
    function handlePlayerPause() {
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventPause', `Воспроизведение приостановлено (pause).`);
        resetMonitorState('Paused event');
    }
    function handlePlayerEmptied() {
        logWarn('PlayerMon:EventEmptied', 'Источник плеера очищен (событие emptied). Сброс монитора и попытка переинициализации.');
        resetMonitorState('Emptied event');
        if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
        playerMonitorIntervalId = null;
        stopAdRemovalObserver(); // Stop related observers
        // Delay setup to allow player to potentially reinitialize itself first
        setTimeout(setupPlayerMonitor, 750);
    }
    function handlePlayerLoadedMeta() {
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventLoadedMeta', `Метаданные видео загружены.`);
        resetMonitorState('Loaded Metadata event');
        setQualitySettings(true); // Good time to check quality
    }
    function handlePlayerAbort() {
        logWarn('PlayerMon:EventAbort', 'Загрузка видео прервана (событие abort). Это может быть вызвано пользователем или ошибкой.');
        resetMonitorState('Aborted event');
    }
    function handlePlayerTimeUpdate() {
        if (videoElement && !videoElement.seeking) { // Only if not actively seeking
            const currentTime = videoElement.currentTime;
            // Check for actual progress, not just tiny floating point differences
            if (Math.abs(currentTime - lastKnownVideoTime) > 0.01) { // Threshold for "actual" time update
                if (currentTime > lastKnownVideoTime) { // Progressing forward
                    lastVideoTimeUpdateTimestamp = Date.now(); // Update progress timestamp
                    lastKnownVideoTime = currentTime;
                    if (isWaitingForDataTimestamp > 0) { // If was waiting, now progressing
                        logCoreDebug('PlayerMon:EventTimeUpdate', 'Выход из состояния буферизации (время видео обновилось).');
                        isWaitingForDataTimestamp = 0;
                    }
                }
                // Log time updates less frequently to avoid console spam
                if (LOG_PLAYER_MONITOR_DEBUG) {
                    const now = Date.now();
                    if (!videoElement._lastTimeUpdateLog || now - videoElement._lastTimeUpdateLog > 10000) { // Log every 10s
                        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventTimeUpdate', `TimeUpdate: CT=${currentTime.toFixed(2)}`);
                        videoElement._lastTimeUpdateLog = now;
                    }
                }
            }
        }
    }
    function handlePlayerProgress() {
        // This event fires as data is downloaded. Can be useful for debugging buffer issues.
        if (LOG_PLAYER_MONITOR_DEBUG && videoElement) {
            let bufferedLog = "N/A";
            try { if (videoElement.buffered && videoElement.buffered.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}] (${videoElement.buffered.length} parts)`; }
                } catch(e){}
            const now = Date.now();
            // Log progress less frequently
            if (!videoElement._lastProgressLog || now - videoElement._lastProgressLog > 5000) { // Log every 5s
                logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventProgress', `Progress: Buffered: ${bufferedLog}, CT: ${videoElement.currentTime.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}`);
                videoElement._lastProgressLog = now;
            }
        }
    }


    function handleVisibilityChange() {
        const context = 'Visibility';
        if (document.hidden) {
            logCoreDebug(context, 'Вкладка стала неактивной (скрыта).');
            if (playerMonitorIntervalId) { // Stop player monitor interval
                clearInterval(playerMonitorIntervalId);
                playerMonitorIntervalId = null;
            }
            if (reloadTimeoutId) { // Cancel any scheduled reloads
                logCoreDebug(context, `Отмена запланированной перезагрузки (Причина: ${reloadTimeoutId._reason || '?'}) из-за скрытия вкладки.`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
            if (visibilityResumeTimer) { // Clear any pending resume timer
                clearTimeout(visibilityResumeTimer);
                visibilityResumeTimer = null;
            }
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; // Reset waiting state
            stopAdRemovalObserver(); // Stop DOM observer
            stopWorkerPinger(); // Stop worker pinger
        } else {
            logCoreDebug(context, 'Вкладка стала активной. Возобновление операций с задержкой ' + VISIBILITY_RESUME_DELAY_MS + 'ms.');
            if (visibilityResumeTimer) clearTimeout(visibilityResumeTimer); // Clear previous timer if any
            visibilityResumeTimer = setTimeout(() => {
                visibilityResumeTimer = null;
                logCoreDebug(context, 'Задержка после возобновления видимости прошла. Переинициализация...');
                setQualitySettings(true); // Re-check quality

                if (ENABLE_AUTO_RELOAD) {
                    resetMonitorState('Visibility resume'); // Reset monitor state variables
                    checkReloadCooldown(context); // Check if we are in a post-reload cooldown
                    setupPlayerMonitor(); // Re-initialize player monitor
                }
                if (ATTEMPT_DOM_AD_REMOVAL && document.body) startAdRemovalObserver(); // Restart DOM observer
                if (INJECT_INTO_WORKERS) startWorkerPinger(); // Restart worker pinger

                // Attempt to autoplay if player was paused and seems ready
                if (videoElement && videoElement.paused && !videoElement.ended && videoElement.readyState >= videoElement.HAVE_FUTURE_DATA) {
                    logCoreDebug(context, 'Плеер на паузе после возобновления видимости. Попытка авто-воспроизведения...');
                    videoElement.play().catch(e => logWarn(context, 'Ошибка авто-воспроизведения после возобновления видимости:', e.message));
                }
            }, VISIBILITY_RESUME_DELAY_MS);
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    installHooks();
    setQualitySettings(true); // Initial quality check

    function initialStart() {
        logCoreDebug('Init', 'Начало первоначального запуска скрипта...');
        setupPlayerMonitor(); // Setup player monitoring and related observers
        if (ATTEMPT_DOM_AD_REMOVAL) {
            if (document.body) { // If body is ready, run immediately
                removeDOMAdElements(document); // Initial pass
                startAdRemovalObserver();
            } else { // Otherwise, wait for DOMContentLoaded
                window.addEventListener('DOMContentLoaded', () => {
                    removeDOMAdElements(document);
                    startAdRemovalObserver();
                }, { once: true, passive: true });
            }
        }
        if (INJECT_INTO_WORKERS) {
            startWorkerPinger();
        }
    }

    // Defer initial start slightly to ensure page scripts have a chance to load
    function deferredInitialStart() {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            requestAnimationFrame(initialStart);
        } else {
            window.addEventListener('DOMContentLoaded', () => requestAnimationFrame(initialStart), { once: true, passive: true });
        }
    }
    deferredInitialStart();


    // Fallback initialization for critical components if they somehow didn't start
    setTimeout(() => {
        if (ENABLE_AUTO_RELOAD && !videoElement && !playerFinderObserver && (document.readyState === 'complete' || document.readyState === 'interactive')) {
            logWarn('Init', 'Фоллбэк: проверка наличия плеера и запуск монитора через 5 секунд...');
            setupPlayerMonitor();
        }
        if (ATTEMPT_DOM_AD_REMOVAL && !adRemovalObserver && document.body) { // Check if body exists now
            logWarn('Init', 'Фоллбэк: запуск AdRemovalObserver через 5 секунд...');
            removeDOMAdElements(document); // One more pass
            startAdRemovalObserver();
        }
        if (INJECT_INTO_WORKERS && !workerPingIntervalId) { // Check pinger ID
            logWarn('Init', 'Фоллбэк: запуск Worker Pinger через 5 секунд...');
            startWorkerPinger();
        }
    }, 5000);

    logCoreDebug('Init', 'Скрипт Twitch Adblock Ultimate инициализирован.');
})();
