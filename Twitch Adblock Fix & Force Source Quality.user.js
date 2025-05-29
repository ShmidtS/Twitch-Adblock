// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      19.2.1
// @description  Блокировка рекламы Twitch через очистку M3U8 и модификацию GQL.
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

    const SCRIPT_VERSION = '19.2.1';

    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true);
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const BLOCK_NATIVE_ADS_SCRIPT = GM_getValue('TTV_AdBlock_BlockNatScript', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true);
    const HIDE_COOKIE_BANNER = GM_getValue('TTV_AdBlock_HideCookieBanner', true);

    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrorsInConsole', false);
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', false);
    const LOG_WORKER_INJECTION_DEBUG = GM_getValue('TTV_AdBlock_Debug_WorkerInject', false);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_Debug_PlayerMon', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', false);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', false);
    const LOG_NETWORK_BLOCKING_DEBUG = GM_getValue('TTV_AdBlock_Debug_NetBlock', false);

    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '2, 3, 4, 9, 10, 403, 1000, 2000, 3000, 4000, 5000, 6001');
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
        'VideoPreviewCard_VideoMarkers', 'UpdateVideoMutation', 'DeleteVideos', 'HostModeTargetDetails', 'StreamInformation',
        'VideoPlayer_StreamAnalytics', 'VideoPlayer_VideoSourceManager', 'VideoPlayerStreamMetadata', 'VideoPlayerStatusOverlayChannel'
    ]);
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIALBREAK'];
    const AD_DATERANGE_REGEX = USE_REGEX_M3U8_CLEANING ? /CLASS="(?:TWITCH-)?STITCHED-AD"/i : null;

    let AD_URL_KEYWORDS_BLOCK = [
        'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com',
        'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org',
        'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com',
        'scorecardresearch.com', 'yandex.ru/clck/',
        'omnitagjs', 'omnitag', 'innovid.com', 'eyewonder.com', 'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com',
        'flashtalking.com', 'contextual.media.net', 'advertising.com', 'adform.net', 'freewheel.tv',
        'stickyadstv.com', 'tremorhub.com', 'aniview.com', 'criteo.com', 'adition.com', 'teads.tv',
        'undertone.com', 'vidible.tv', 'vidoomy.com', 'appnexus.com',
        '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads'
    ];
    if (BLOCK_NATIVE_ADS_SCRIPT) {
        AD_URL_KEYWORDS_BLOCK.push('nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com');
    }
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

    const TWITCH_HOST_REGEX = /^(?:[^.]+\.)?(twitch\.tv|ttvnw\.net|twitchcdn\.net)$/i;
    const TWITCH_VIDEO_SEGMENT_PATH_REGEX = /(\.ts$|\/segment\/|videochunk|videoplayback|stream[0-9]*\.ts)/i;
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;

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
    function logWarn(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logCoreDebug(source, message, ...args) { if (CORE_DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logModuleTrace(moduleFlag, source, message, ...args) { if (moduleFlag) { const truncatedArgs = args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg); console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...truncatedArgs); } }

    if (CORE_DEBUG_LOGGING) logCoreDebug('Main', `Запуск скрипта. Версия: ${SCRIPT_VERSION}.`);

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
                    logWarn(context, `Попытка установить качество на 'Источник', но localStorage остался '${valueAfterSet}' (был '${currentValue}').`);
                }
            } else {
                logModuleTrace(CORE_DEBUG_LOGGING, context, `Качество уже 'Источник'.`);
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
                    logWarn(context, `Попытка изменить '${key}' на '${value}'. Принудительно '${TARGET_QUALITY_VALUE}'.`);
                    forcedValue = TARGET_QUALITY_VALUE;
                }
                cachedQualityValue = forcedValue;
            }
            try {
                const args = Array.from(arguments);
                args[1] = forcedValue;
                return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, args);
            } catch (e) {
                logError(context, `Ошибка original localStorage.setItem для '${key}':`, e);
                if (key === LS_KEY_QUALITY) cachedQualityValue = null;
                throw e;
            }
        };
        cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
        setQualitySettings(true);
    } catch(e) {
        logError('QualitySet:LocalStorageHook', 'Критическая ошибка перехвата localStorage.setItem:', e);
        if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
    }


    function parseAndCleanM3U8(m3u8Text, url = "N/A") {
        const context = 'M3U8 Clean';
        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;

        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): Вход. Длина: ${m3u8Text?.length || 0}`);

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logWarn(context, `(${urlFilename}): Некорректный/пустой M3U8 текст.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: false, errorDuringClean: true };
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
        } else if (upperM3U8Text.includes("#EXT-X-SCTE35:")) {
            potentialAdContent = true;
        } else if (upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:")) {
            potentialAdContent = true;
        } else if (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(m3u8Text)) {
            potentialAdContent = true;
        }
        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): initial potentialAdContent = ${potentialAdContent}`);

        if (!potentialAdContent) {
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): Рекламные маркеры не найдены, пропуск очистки.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: false, errorDuringClean: false };
        }

        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): Найдены потенциальные маркеры. Парсинг...`);
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
            let removalReason = '';

            if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE:')) {
                if (upperTrimmedLine.includes(AD_SIGNIFIER_DATERANGE_ATTR.toUpperCase()) ||
                    (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(trimmedLine)) ||
                    AD_DATERANGE_ATTRIBUTE_KEYWORDS.some(kw => upperTrimmedLine.includes(kw))) {
                    removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                    removalReason = 'DATERANGE (Ad)';
                }
            } else if (upperTrimmedLine.startsWith('#EXT-X-ASSET:')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                removalReason = 'ASSET (Ad)';
            } else if (upperTrimmedLine.startsWith('#EXT-X-CUE-OUT')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                removalReason = 'CUE-OUT (Ad Start)';
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-SIGNAL')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                removalReason = 'TWITCH-AD-SIGNAL';
            } else if (upperTrimmedLine.startsWith('#EXT-X-SCTE35:')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
                removalReason = 'SCTE35 (Ad)';
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                removeThisLine = true; currentLineIsAdMarker = true; adsFoundOverall = true;
                removalReason = 'TWITCH-PREFETCH (Ad Segment)';
            }
            else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) {
                    removeThisLine = true; currentLineIsAdMarker = true; isAdSection = false; discontinuityShouldBeRemoved = false;
                    removalReason = 'CUE-IN (Ad End)';
                } else if (upperTrimmedLine.startsWith('#EXTINF:')) {
                    isAdSection = false; discontinuityShouldBeRemoved = false;
                    removalReason = 'Content #EXTINF encountered, ending ad section';
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${removalReason}`);
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                    if (discontinuityShouldBeRemoved) {
                        removeThisLine = true; currentLineIsAdMarker = true; discontinuityShouldBeRemoved = false;
                        removalReason = 'DISCONTINUITY (Ad Related)';
                    }
                } else if (!trimmedLine.startsWith('#') && trimmedLine !== '') {
                    removeThisLine = true;
                    removalReason = 'Segment URL in Ad Section';
                }
            }

            if (removeThisLine) {
                linesRemovedCount++;
                if (currentLineIsAdMarker) adsFoundOverall = true;
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: REMOVING (${removalReason}): ${trimmedLine.substring(0, 100)}`);
            } else {
                cleanLines.push(line);
                if(isAdSection && !trimmedLine.startsWith('#EXT-X-CUE-IN') && !trimmedLine.startsWith('#EXTINF:') && !trimmedLine.startsWith('#EXT-X-DISCONTINUITY') && trimmedLine.length > 0 && trimmedLine.startsWith('#')) {
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: KEPT (in Ad Section, unexpected tag?): ${trimmedLine.substring(0, 100)}`);
                }
            }
        }

        if (isAdSection && adsFoundOverall) {
            logWarn(context, `(${urlFilename}): M3U8 завершился, но в рекламной секции.`);
        }

        const cleanedText = cleanLines.join('\n');

        if (adsFoundOverall && linesRemovedCount > 0) {
            let segmentCount = 0;
            for (const line of cleanLines) {
                if (line.trim().length > 0 && !line.trim().startsWith('#')) { // Считаем строки, которые являются URL сегментов
                    segmentCount++;
                }
            }

            if (segmentCount < 2 && !cleanedText.includes("#EXT-X-ENDLIST")) { // Если меньше 2 сегментов (1 может быть префетчем или очень коротким)
                logError(context, `(${urlFilename}): После очистки плейлист содержит слишком мало сегментов (${segmentCount}) и без ENDLIST. ВОЗВРАТ ОРИГИНАЛА. Удалено: ${linesRemovedCount}.`);
                return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: true, errorDuringClean: true };
            }
            logCoreDebug(context, `(${urlFilename}): Завершено. Удалено строк: ${linesRemovedCount}. Сегментов в очищенном: ${segmentCount}.`);
        }
        return { cleanedText: cleanedText, adsFound: adsFoundOverall, linesRemoved: linesRemovedCount, wasPotentiallyAd: potentialAdContent, errorDuringClean: false };
    }


    function getWorkerInjectionCode() {
        const workerCodeString = (function() {
            const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION_WORKER_REPLACE}';
            const CORE_DEBUG_LOGGING_WORKER = '${CORE_DEBUG_LOGGING_WORKER_REPLACE}';
            const LOG_M3U8_CLEANING_DEBUG_WORKER = '${LOG_M3U8_CLEANING_DEBUG_WORKER_REPLACE}';
            const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

            let hooksSuccessfullySignaled = false;

            function workerLogError(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
            function workerLogWarn(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
            function workerLogCoreDebug(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
            function workerLogM3U8Trace(message, ...args) { if (LOG_M3U8_CLEANING_DEBUG_WORKER) { const truncatedArgs = args.map(arg => typeof arg === 'string' && arg.length > 100 ? arg.substring(0,100)+'...' : arg); console.debug(LOG_PREFIX_WORKER_BASE + ' [M3U8 Relay] TRACE:', message, ...truncatedArgs); } }

            if (CORE_DEBUG_LOGGING_WORKER) workerLogCoreDebug("--- Worker AdBlock Code Initializing ---");

            function installWorkerFetchHook() {
                const context = 'WorkerInject:FetchHook';
                if (typeof self.fetch !== 'function') {
                    workerLogWarn('[' + context + '] Fetch API not available.');
                    return false;
                }
                if (self.fetch.hooked_by_adblock_ult) {
                    workerLogCoreDebug('[' + context + '] Fetch already hooked.');
                    return true;
                }

                const workerRealFetch = self.fetch;
                workerLogCoreDebug('[' + context + '] Installing fetch hook...');

                self.fetch = (input, init) => {
                    let requestUrl = (input instanceof Request) ? input.url : String(input);
                    let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
                    const lowerCaseUrl = requestUrl.toLowerCase();
                    const urlShort = requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl;
                    const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort.substring(0,70);

                    const isM3U8Request = (lowerCaseUrl.endsWith('.m3u8') || (init?.headers?.['Accept'] || '').toLowerCase().includes('mpegurl')) &&
                          (lowerCaseUrl.includes('usher.ttvnw.net') || lowerCaseUrl.includes('.m3u8'));

                    workerLogCoreDebug(`[${context}] Intercepted: ${method} ${urlFilename.substring(0,100)} (M3U8: ${isM3U8Request})`);

                    if (method === 'GET' && isM3U8Request && requestUrl.includes('usher.ttvnw.net')) {
                        workerLogM3U8Trace('Relaying M3U8 to main: ' + urlFilename);
                        return new Promise((resolveWorkerPromise, rejectWorkerPromise) => {
                            const messageId = 'm3u8_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                            const onMessageFromMain = (event) => {
                                if (event.data && event.data.type === 'ADBLOCK_M3U8_RESPONSE' && event.data.id === messageId) {
                                    self.removeEventListener('message', onMessageFromMain);
                                    if (event.data.error) {
                                        workerLogError('Error from main M3U8 (' + urlFilename + '):', event.data.error);
                                        rejectWorkerPromise(new TypeError(event.data.error));
                                    } else {
                                        workerLogM3U8Trace('Received M3U8 from main for: ' + urlFilename + `. Len: ${event.data.cleanedText?.length}`);
                                        const responseHeaders = new Headers();
                                        if(event.data.headers) { for(const key in event.data.headers) { responseHeaders.append(key, event.data.headers[key]); } }
                                        if (!responseHeaders.has('Content-Type')) { responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl'); }
                                        if (event.data.cleanedText === undefined) {
                                            workerLogError('Undefined cleanedText from main for M3U8 (' + urlFilename + ').');
                                            rejectWorkerPromise(new TypeError('Undefined M3U8 content'));
                                            return;
                                        }
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
                                workerLogM3U8Trace('Posted M3U8 request to main: ' + urlFilename);
                            } catch (e) {
                                self.removeEventListener('message', onMessageFromMain);
                                workerLogError('Failed to postMessage M3U8 request:', e);
                                rejectWorkerPromise(e);
                            }
                        });
                    }
                    return workerRealFetch(input, init);
                };
                self.fetch.hooked_by_adblock_ult = true;
                workerLogCoreDebug('[' + context + '] Worker fetch hook installed.');
                return true;
            }

            function attemptHookInstallationAndSignal() {
                const context = 'WorkerInject:Signal';
                workerLogCoreDebug('[' + context + '] Attempting hook install & signal...');
                if (installWorkerFetchHook()) {
                    try {
                        const signalMethod = hooksSuccessfullySignaled ? 'resignal_after_eval' : 'initial_signal';
                        self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: signalMethod });
                        hooksSuccessfullySignaled = true;
                        workerLogCoreDebug('[' + context + '] Signaled ADBLOCK_WORKER_HOOKS_READY (Method: ' + signalMethod + ').');
                        return true;
                    } catch(e) {
                        workerLogError('[' + context + '] Error sending ADBLOCK_WORKER_HOOKS_READY:', e);
                        return false;
                    }
                } else {
                    workerLogError('[' + context + '] Failed to install fetch hook!');
                    try {
                        self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'signal_failed_hook_install' });
                    } catch(e) { workerLogError('[' + context + '] Error sending signal_failed_hook_install:', e); }
                    return false;
                }
            }

            self.addEventListener('message', function(e) {
                if (e.data?.type === 'PING_WORKER_ADBLOCK') {
                    self.postMessage({ type: 'PONG_WORKER_ADBLOCK', workerLabel: self.name || 'unknown_worker_name' });
                } else if (e.data?.type === 'EVAL_ADBLOCK_CODE') {
                    workerLogCoreDebug("[WorkerInject:Msg] Received EVAL_ADBLOCK_CODE. Re-attempting.");
                    attemptHookInstallationAndSignal();
                }
            });

            attemptHookInstallationAndSignal();
            if (CORE_DEBUG_LOGGING_WORKER) workerLogCoreDebug("--- Worker AdBlock Code Initialized ---");

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

        const urlShort = url.substring(0, Math.min(url.length, 70));
        logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Проверка GQL от ${urlShort}... Len: ${responseText.length}`);

        try {
            let data = JSON.parse(responseText);
            let modifiedOverall = false;
            const opDataArray = Array.isArray(data) ? data : [data];

            for (const opData of opDataArray) {
                if (!opData || typeof opData !== 'object') continue;
                const operationName = opData.extensions?.operationName || opData.operationName || 'UnknownGQLOp';
                let currentOpModified = false;

                if (GQL_OPERATIONS_TO_SKIP_MODIFICATION.has(operationName)) {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Skip op "${operationName}" (whitelist).`);
                }
                else if (operationName === GQL_OPERATION_AD_FREE_QUERY) {
                    if (opData.data?.viewerAdFreeConfig?.isAdFree === false) {
                        opData.data.viewerAdFreeConfig.isAdFree = true;
                        currentOpModified = true;
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Op "${operationName}": isAdFree -> true.`);
                    }
                }
                else if (operationName === GQL_CLIENT_AD_QUERY) {
                    let modified = false;
                    if (opData.data) {
                        if (opData.data.ads) { opData.data.ads = []; modified = true; }
                        if (opData.data.clientAd) { opData.data.clientAd = null; modified = true; }
                        if (opData.data.companionSlots) { opData.data.companionSlots = []; modified = true; }
                        if (opData.data.playerAdParams) { opData.data.playerAdParams = null; modified = true; }
                        if (modified) {
                            currentOpModified = true;
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Op "${operationName}": ad fields cleared.`);
                        }
                    }
                }
                else if (operationName === "Interstitials") {
                    if (opData.data?.stream?.interstitials && Array.isArray(opData.data.stream.interstitials) && opData.data.stream.interstitials.length > 0) {
                        logWarn(context, `Op "${operationName}": Found ${opData.data.stream.interstitials.length} interstitials. Clearing.`);
                        opData.data.stream.interstitials = [];
                        currentOpModified = true;
                    }
                }
                else if (opData.data?.stream?.playbackAccessToken && typeof opData.data.stream.playbackAccessToken.value === 'string') {
                    try {
                        const tokenValue = JSON.parse(opData.data.stream.playbackAccessToken.value);
                        let tokenModified = false;
                        if (tokenValue.hide_ads === false) { tokenValue.hide_ads = true; tokenModified = true; }
                        if (tokenValue.show_ads === true ) { tokenValue.show_ads = false; tokenModified = true;}
                        if (tokenValue.hasOwnProperty('ad_indicator')) { delete tokenValue.ad_indicator; tokenModified = true; }
                        if (tokenValue.hasOwnProperty('ads_on_stream')) { tokenValue.ads_on_stream = 0; tokenModified = true; }
                        if (tokenValue.hasOwnProperty('roll_type')) { delete tokenValue.roll_type; tokenModified = true; }
                        if (tokenModified) {
                            opData.data.stream.playbackAccessToken.value = JSON.stringify(tokenValue);
                            currentOpModified = true;
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Op "${operationName}": playbackAccessToken.value modified for ad flags.`);
                        }
                    } catch (e) {
                        logWarn(context, `Error parsing/modifying playbackAccessToken.value for "${operationName}":`, e.message);
                    }
                }
                else if (AGGRESSIVE_GQL_SCAN && opData.data && typeof opData.data === 'object') {
                    let aggressivelyModified = false;
                    function scanAndNullify(obj, path = '') {
                        for (const key in obj) {
                            const currentPath = path ? `${path}.${key}` : key;
                            if (typeof key === 'string' && (key.toLowerCase().includes('ad') || key.toLowerCase().includes('advertisement') || key.toLowerCase().includes('promo'))) {
                                if (obj[key] !== null && !(Array.isArray(obj[key]) && obj[key].length === 0) ) {
                                    logWarn(context, `[AGGR] Op "${operationName}": Nullifying '${currentPath}'`);
                                    obj[key] = null;
                                    aggressivelyModified = true;
                                }
                            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                scanAndNullify(obj[key], currentPath);
                            }
                        }
                    }
                    scanAndNullify(opData.data);
                    if (aggressivelyModified) currentOpModified = true;
                }
                else {
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Skip GQL (unknown/targetless op): ${operationName}.`);
                }
                if (currentOpModified) modifiedOverall = true;
            }

            if (modifiedOverall) {
                const finalData = Array.isArray(data) ? opDataArray : opDataArray[0];
                logCoreDebug(context, `GQL response MODIFIED for ${urlShort}.`);
                return JSON.stringify(finalData);
            }
        } catch (e) {
            logError(context, `Error modifying GQL response from ${url}:`, e);
        }
        return responseText;
    }


    async function fetchOverride(input, init) {
        const context = 'NetBlock:Fetch';
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const urlShortForLog = (requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl).substring(0, 120);

        logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `Fetch: ${method} ${urlShortForLog}`);

        let isKnownTwitchDomain = false;
        let requestHostname = '';
        try {
            requestHostname = new URL(requestUrl).hostname;
            if (TWITCH_HOST_REGEX.test(requestHostname)) {
                isKnownTwitchDomain = true;
            }
        } catch(e) { /* ignore */ }

        let isWhitelistedTwitchContentStream = false;
        if (isKnownTwitchDomain && (TWITCH_VIDEO_SEGMENT_PATH_REGEX.test(lowerCaseUrl) || TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl))) {
            isWhitelistedTwitchContentStream = true;
        }

        if (!isGqlRequest) {
            let isBlockedByKeyword = false;
            let blockingKeyword = null;
            if (!isKnownTwitchDomain || (isKnownTwitchDomain && !isWhitelistedTwitchContentStream)) {
                for (const keyword of AD_URL_KEYWORDS_BLOCK) {
                    if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                        if (keyword === 'nat.min.js' && !BLOCK_NATIVE_ADS_SCRIPT) continue;
                        isBlockedByKeyword = true;
                        blockingKeyword = keyword;
                        break;
                    }
                }
            }
            if (isBlockedByKeyword) {
                logWarn(context, `BLOCKING Fetch (${method}) by keyword '${blockingKeyword}': ${requestUrl}`);
                return Promise.resolve(new Response(null, { status: 403, statusText: "Blocked by TTV AdBlock Ultimate (Keyword)" }));
            }
        }

        if (isWhitelistedTwitchContentStream) {
            logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `Fetch: Skip general block for ${urlShortForLog} (Twitch stream content)`);
        }

        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && lowerCaseUrl.includes('usher.ttvnw.net');
        if (isM3U8RequestToUsher) {
            logCoreDebug(context, `Fetch: Intercept Usher M3U8 for GM_xmlhttpRequest: ${urlShortForLog}`);
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: requestUrl,
                    headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
                    responseType: "text",
                    onload: function(response) {
                        logCoreDebug(context, `Fetch: GM_xmlhttpRequest M3U8 ${urlShortForLog} onload. Status: ${response.status}, Len: ${response.responseText?.length}`);
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound, linesRemoved, errorDuringClean, wasPotentiallyAd } = parseAndCleanM3U8(response.responseText, requestUrl);
                            const newHeaders = new Headers();
                            if (response.responseHeaders) {
                                response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => {
                                    const parts = line.split(': ', 2);
                                    if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') newHeaders.append(parts[0], parts[1]);
                                });
                            }
                            if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
                            if (errorDuringClean) logWarn(context, `M3U8 (${urlShortForLog}): Error during clean, original returned. AdsFound: ${adsFound}, LinesRemoved: ${linesRemoved}`);
                            else if (adsFound) logCoreDebug(context, `M3U8 (${urlShortForLog}): Cleaned. AdsFound: ${adsFound}, LinesRemoved: ${linesRemoved}`);
                            else if (wasPotentiallyAd) logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `M3U8 (${urlShortForLog}): Potential markers, but no ads removed. LinesRemoved: ${linesRemoved}`);
                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders }));
                        } else {
                            logError(context, `Fetch: GM_xmlhttpRequest M3U8 ${urlShortForLog} failed: ${response.status} ${response.statusText}`);
                            reject(new TypeError(`GM_xmlhttpRequest failed: ${response.statusText || response.status}`));
                        }
                    },
                    onerror: function(error) { logError(context, `Fetch: GM_xmlhttpRequest M3U8 ${urlShortForLog} network error:`, error); reject(new TypeError('Network error')); },
                    ontimeout: function() { logError(context, `Fetch: GM_xmlhttpRequest M3U8 ${urlShortForLog} timeout.`); reject(new TypeError('Timeout')); }
                });
            });
        }

        let originalResponse;
        try {
            originalResponse = await originalFetch(input, init);
            logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `Original fetch done for ${urlShortForLog}, Status: ${originalResponse.status}`);

            if (isGqlRequest && method === 'POST' && originalResponse.ok && MODIFY_GQL_RESPONSE) {
                const contextGQL = 'GQL:FetchResp';
                let responseText;
                try {
                    responseText = await originalResponse.clone().text();
                    if (!responseText) return originalResponse;
                } catch (e) {
                    if (e.name === 'AbortError') logModuleTrace(LOG_GQL_MODIFY_DEBUG, contextGQL, `Clone/text aborted for GQL: ${urlShortForLog}`);
                    else logError(contextGQL, `Clone/text error for GQL: ${urlShortForLog}:`, e);
                    return originalResponse;
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
            if (error.message && error.message.includes('ERR_BLOCKED_BY_CLIENT')) logWarn(context, `Fetch ${urlShortForLog} ERR_BLOCKED_BY_CLIENT. External?`);
            else if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Network') || error.message.includes('aborted') || error.message.includes('ERR_CONNECTION_CLOSED')  || error.message.includes('ERR_CONNECTION_RESET'))) logWarn(context, `Fetch ${urlShortForLog}: ${error.message}`);
            else if (error instanceof DOMException && error.name === 'AbortError') logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `Fetch aborted: ${urlShortForLog}`);
            else logError(context, `Unexpected fetch error ${urlShortForLog}:`, error);
            throw error;
        }
    }

    const xhrRequestData = new WeakMap();

    function xhrOpenOverride(method, url) {
        const context = 'NetBlock:XHR';
        const urlString = String(url);
        const lowerCaseUrl = urlString.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const urlShortForLog = (urlString.includes('?') ? urlString.substring(0, urlString.indexOf('?')) : urlString).substring(0,120);

        logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `XHR Open: ${method} ${urlShortForLog}`);

        let blocked = false;
        let blockingKeyword = null;
        let isKnownTwitchDomain = false;
        let requestHostname = '';
        try {
            requestHostname = new URL(urlString).hostname;
            if (TWITCH_HOST_REGEX.test(requestHostname)) isKnownTwitchDomain = true;
        } catch(e) { /* ignore */ }

        let isWhitelistedTwitchContentStream = false;
        if (isKnownTwitchDomain && (TWITCH_VIDEO_SEGMENT_PATH_REGEX.test(lowerCaseUrl) || TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl))) {
            isWhitelistedTwitchContentStream = true;
        }

        if (!isGqlRequest) {
            if (!isKnownTwitchDomain || (isKnownTwitchDomain && !isWhitelistedTwitchContentStream)) {
                for (const keyword of AD_URL_KEYWORDS_BLOCK) {
                    if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                        if (keyword === 'nat.min.js' && !BLOCK_NATIVE_ADS_SCRIPT) continue;
                        blocked = true;
                        blockingKeyword = keyword;
                        break;
                    }
                }
            }
        }

        if (blocked) logWarn(context, `MARK XHR for block (keyword '${blockingKeyword}'): ${urlString}`);
        else if (isWhitelistedTwitchContentStream) logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `XHR Open: Skip general block for ${urlShortForLog} (Twitch stream content)`);

        const isM3U8RequestToUsher = method.toUpperCase() === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && urlString.includes('usher.ttvnw.net');
        xhrRequestData.set(this, { method: method.toUpperCase(), url: urlString, urlShort: urlShortForLog, blocked: blocked, isGql: isGqlRequest, isM3U8: isM3U8RequestToUsher, blockingKeyword });

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
                            const gqlModified = modifyGqlResponse(originalResponseText, reqData.url);
                            if (gqlModified !== originalResponseText) { modifiedText = gqlModified; modificationPerformed = true; }
                        } else if (reqData.isM3U8) {
                            const { cleanedText, adsFound, linesRemoved, errorDuringClean, wasPotentiallyAd } = parseAndCleanM3U8(originalResponseText, reqData.url);
                            if (errorDuringClean) logWarn(currentContext, `M3U8 (${reqData.urlShort}): Error during clean, original used.`);
                            else if (adsFound) { modifiedText = cleanedText; modificationPerformed = true; }
                            else if (wasPotentiallyAd) logModuleTrace(LOG_M3U8_CLEANING_DEBUG, currentContext, `M3U8 (${reqData.urlShort}): Potential markers, no ads removed.`);
                        }

                        if (modificationPerformed) {
                            logCoreDebug(currentContext, `Response MODIFIED for ${reqData.urlShort}. New len: ${modifiedText.length}`);
                            xhrRequestData.set(this, { ...reqData, modifiedResponse: modifiedText });
                        }
                    }
                }
            }, { once: true, passive: true });
        }

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `originalXhrOpen error ${urlShortForLog}:`, error); throw error; }
        } else {
            try { originalXhrOpen.call(this, method, "about:blank?blocked=true", ...Array.from(arguments).slice(2)); } catch(e) { /* dummy */ }
        }
    }


    function xhrSendOverride(data) {
        const context = 'NetBlock:XHR';
        const requestInfo = xhrRequestData.get(this);

        if (!requestInfo) {
            try { return originalXhrSend.apply(this, arguments); }
            catch(e){ logError(context, "originalXhrSend (no requestInfo) error:", e); throw e; }
        }

        const { method, urlShort, blocked, blockingKeyword } = requestInfo;

        if (blocked) {
            logWarn(context, `BLOCKING XHR send (keyword '${blockingKeyword}'): ${urlShort} (URL: ${requestInfo.url})`);
            try {
                Object.defineProperty(this, 'readyState', { value: 4, writable: true, configurable: true }); this.readyState = 4;
                Object.defineProperty(this, 'status', { value: 0, writable: true, configurable: true }); this.status = 0;
                Object.defineProperty(this, 'statusText', { value: `Blocked by TTV AdBlock Ultimate (Keyword: ${blockingKeyword})`, writable: true, configurable: true }); this.statusText = `Blocked by TTV AdBlock Ultimate (Keyword: ${blockingKeyword})`;
                Object.defineProperty(this, 'readyState', { writable: false }); Object.defineProperty(this, 'status', { writable: false }); Object.defineProperty(this, 'statusText', { writable: false });
            } catch (e) { logWarn(context, `Failed to set status for blocked XHR ${urlShort}: ${e.message}`); }
            if (typeof this.onerror === 'function') { try { this.onerror(new ProgressEvent('error')); } catch(e) {} }
            if (typeof this.onloadend === 'function') { try { this.onloadend(new ProgressEvent('loadend')); } catch (e) {} }
            return;
        }

        try {
            logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, context, `XHR Send: ${urlShort}`);
            return originalXhrSend.apply(this, arguments);
        } catch (error) {
            if (error.name === 'NetworkError' || error.message?.includes('ERR_BLOCKED_BY_CLIENT') || error.message?.includes('ERR_CONNECTION_CLOSED') || (error.message && error.message.includes('Failed to execute'))) logWarn(context, `XHR send failed ${urlShort}: ${error.message}. External?`);
            else if (!(error instanceof DOMException && error.name === 'AbortError')) logError(context, `Unknown xhr.send error ${urlShort}:`, error);
            throw error;
        }
    }

    function hookXhrGetters() {
        const contextGQL = 'GQL:XhrGetter';
        const contextM3U8 = 'M3U8:XhrGetter';

        if (MODIFY_GQL_RESPONSE || true) { // Always hook if M3U8 cleaning is also via XHR
            if (originalXhrResponseGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.modifiedResponse !== null && reqData?.modifiedResponse !== undefined && ((reqData.isGql && MODIFY_GQL_RESPONSE) || reqData.isM3U8) && (this.responseType === '' || this.responseType === 'text')) {
                            const type = reqData.isGql ? 'GQL' : 'M3U8'; const logContext = reqData.isGql ? contextGQL : contextM3U8;
                            logModuleTrace(reqData.isGql ? LOG_GQL_MODIFY_DEBUG : LOG_M3U8_CLEANING_DEBUG, logContext, `Return modified 'response' (${type}) for ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseGetter.get.call(this); }
                        catch (getterError) { logWarn(reqData?.isGql ? contextGQL : (reqData?.isM3U8 ? contextM3U8 : 'XHR:Getter'), `XHR 'response' getter error ${reqData?.urlShort || 'unknown'}: ${getterError.message}`); return null;}
                    }, configurable: true
                });
            }
            if (originalXhrResponseTextGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.modifiedResponse !== null && reqData?.modifiedResponse !== undefined && ((reqData.isGql && MODIFY_GQL_RESPONSE) || reqData.isM3U8) ) {
                            const type = reqData.isGql ? 'GQL' : 'M3U8'; const logContext = reqData.isGql ? contextGQL : contextM3U8;
                            logModuleTrace(reqData.isGql ? LOG_GQL_MODIFY_DEBUG : LOG_M3U8_CLEANING_DEBUG, logContext, `Return modified 'responseText' (${type}) for ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseTextGetter.get.call(this); }
                        catch (getterError) { logWarn(reqData?.isGql ? contextGQL : (reqData?.isM3U8 ? contextM3U8 : 'XHR:Getter'), `XHR 'responseText' getter error ${reqData?.urlShort || 'unknown'}: ${getterError.message}`); return "";}
                    }, configurable: true
                });
            }
            logCoreDebug('XHR:Getters', `XHR 'response' & 'responseText' getters hooked.`);
        }
    }

    function handleMessageFromWorkerGlobal(event) {
        const msgData = event.data;
        if (msgData && typeof msgData.type === 'string') {
            const workerInstance = event.source;
            let workerLabel = msgData.workerLabel || 'UnknownWorker';
            if (workerInstance) { for (const [label, state] of hookedWorkers.entries()) { if (state.instance === workerInstance) { workerLabel = label; break; } } }

            if (msgData.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                logCoreDebug('WorkerInject:Confirm', `ADBLOCK_WORKER_HOOKS_READY from Worker (${workerLabel}, Method: ${msgData.method || 'N/A'})`);
                const workerState = hookedWorkers.get(workerLabel) || Array.from(hookedWorkers.values()).find(s => s.instance === workerInstance);
                if (workerState) workerState.hooksReady = true;
                else logWarn('WorkerInject:Confirm', `HOOKS_READY from Worker (${workerLabel}), but not found.`);
            } else if (msgData.type === 'PONG_WORKER_ADBLOCK') {
                const pongWorkerLabel = msgData.workerLabel || workerLabel;
                const workerState = hookedWorkers.get(pongWorkerLabel);
                if (workerState) { workerState.lastPong = Date.now(); logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerInject:Pinger', `PONG_WORKER_ADBLOCK from ${pongWorkerLabel}`); }
                else logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerInject:Pinger', `PONG_WORKER_ADBLOCK from unknown/deleted worker ${pongWorkerLabel}`);
            } else if (msgData.type === 'ADBLOCK_FETCH_M3U8_REQUEST') {
                logCoreDebug('MainWorkerComm', `M3U8 request from Worker (${workerLabel}): ${msgData.url.substring(0,100)}`);
                const { url, initDetails, id } = msgData;
                if (!workerInstance) { logError('MainWorkerComm', `No workerInstance for M3U8 req ${id} from ${workerLabel}.`); return; }

                GM_xmlhttpRequest({
                    method: "GET", url: url, headers: initDetails?.headers ? Object.fromEntries(initDetails.headers) : undefined, responseType: "text",
                    onload: function(response) {
                        let postData = { type: 'ADBLOCK_M3U8_RESPONSE', id: id };
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound, errorDuringClean, wasPotentiallyAd } = parseAndCleanM3U8(response.responseText, url);
                            postData.cleanedText = cleanedText; postData.status = response.status; postData.statusText = response.statusText;
                            const responseHeadersObj = {};
                            if (response.responseHeaders) { response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => { const parts = line.split(': ', 2); if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') responseHeadersObj[parts[0]] = parts[1]; }); }
                            postData.headers = responseHeadersObj;
                            let logMsg = `Send response M3U8 ${id} (Worker: ${workerLabel}). Len: ${cleanedText?.length}.`;
                            if (errorDuringClean) logMsg += " Clean error, original sent."; else if (adsFound) logMsg += ` Ads found/removed.`; else if (wasPotentiallyAd) logMsg += ` Potential ads, no removal.`;
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'MainWorkerComm', logMsg);
                        } else {
                            postData.error = `Failed GM_xmlhttpRequest: ${response.status} ${response.statusText}`; postData.status = response.status; postData.statusText = response.statusText;
                            logError('MainWorkerComm', `GM_xmlhttpRequest error M3U8 ${id} from Worker (${workerLabel}): ${postData.error}`);
                        }
                        try { workerInstance.postMessage(postData); } catch (e) { logError('MainWorkerComm', `Error postMessage M3U8 ${id} to Worker (${workerLabel}): ${e.message}`);}
                    },
                    onerror: function(error) { logError('MainWorkerComm', `Network error GM_xmlhttpRequest M3U8 ${id} from Worker (${workerLabel}):`, error); try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Network error', status: 0, statusText: 'Network Error' }); } catch (e) { logError('MainWorkerComm', `Error postMessage M3U8 ${id} to Worker (${workerLabel}): ${e.message}`);} },
                    ontimeout: function() { logError('MainWorkerComm', `Timeout GM_xmlhttpRequest M3U8 ${id} from Worker (${workerLabel}).`); try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Timeout', status: 0, statusText: 'Timeout' }); } catch (e) { logError('MainWorkerComm', `Error postMessage M3U8 ${id} to Worker (${workerLabel}): ${e.message}`);} }
                });
            }
        }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance.addEventListener('error', (e) => { logError('WorkerInject:Error', `Error in Worker (${label}):`, e.message, `(${e.filename}:${e.lineno}:${e.colno})`); }, { passive: true });
        workerInstance._listenersAddedByAdblock = true;
        logCoreDebug('WorkerInject:MsgListenerSetup', `Error listeners active for Worker (${label})`);
    }

    function hookWorkerConstructor() {
        const context = 'WorkerInject:HookSetup';
        if (!INJECT_INTO_WORKERS) { logWarn(context, "Worker injection disabled."); return; }
        if (unsafeWindow.Worker?.hooked_by_adblock_ult) { logCoreDebug(context, "Worker constructor already hooked."); return; }
        if (typeof OriginalWorker === 'undefined') { logError(context, 'OriginalWorker not found.'); return; }

        logCoreDebug(context, "Hooking Worker constructor...");
        workerHookAttempted = true;

        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                let urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                let isBlobURL = urlString.startsWith('blob:');
                const randomId = Math.random().toString(36).substr(2, 5);
                let workerLabel = isBlobURL ? `blob-${randomId}:${urlString.substring(5, 35)}...` : `${(urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 40))}-${randomId}`;
                let isIVSWorker = workerLabel.includes('amazon-ivs-wasmworker') || workerLabel.includes('ivs-wasmworker');
                if(isIVSWorker) workerLabel += " (IVS)";

                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `New Worker: ${workerLabel} (Type: ${isBlobURL ? 'Blob' : 'Script'}${isIVSWorker ? ', IVS' : ''}), URL: ${urlString.substring(0,150)}`);
                let newWorkerInstance;
                try {
                    newWorkerInstance = super(scriptURL, options);
                    newWorkerInstance._workerLabel = workerLabel; newWorkerInstance._createdAt = Date.now();
                    hookedWorkers.set(workerLabel, { instance: newWorkerInstance, lastPing: 0, lastPong: Date.now(), hooksReady: false, url: urlString, isBlob: isBlobURL, isIVS: isIVSWorker });
                    addWorkerMessageListeners(newWorkerInstance, workerLabel);
                    if (!isBlobURL && !isIVSWorker) { // Do not inject into IVS workers or generic blobs initially
                        setTimeout(() => {
                            const workerState = hookedWorkers.get(workerLabel);
                            if (workerState && !workerState.hooksReady) {
                                logWarn(context, `Worker (${workerLabel}) no HOOKS_READY signal in 300ms. Attempting postMessage injection...`);
                                try { const codeToInject = getWorkerInjectionCode(); newWorkerInstance.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: codeToInject }); }
                                catch(e) { logError(context, `Error postMessage (EVAL_ADBLOCK_CODE) for Worker (${workerLabel}):`, e); }
                            } else if (workerState && workerState.hooksReady) logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Worker (${workerLabel}) already sent HOOKS_READY.`);
                        }, 300);
                    } else logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Skipping initial EVAL_ADBLOCK_CODE for ${isBlobURL ? 'Blob' : ''}${isIVSWorker ? 'IVS ' : ''}Worker (${workerLabel}).`);
                } catch (constructorError) { logError(context, `HookedWorker constructor error for ${workerLabel}:`, constructorError); throw constructorError; }
                return newWorkerInstance;
            }
        };
        try { Object.keys(OriginalWorker).forEach(key => { if (!unsafeWindow.Worker.hasOwnProperty(key)) { try { unsafeWindow.Worker[key] = OriginalWorker[key]; } catch(e){} } }); Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker); }
        catch (e) { logError(context, "Failed to restore Worker prototype/statics:", e); }
        unsafeWindow.Worker.hooked_by_adblock_ult = true;
        logCoreDebug(context, "Worker constructor hooked.");
        unsafeWindow.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true });
        logCoreDebug(context, "Global 'message' listener for workers added.");
    }

    function startWorkerPinger() {
        const context = 'WorkerInject:Pinger';
        if (workerPingIntervalId || !INJECT_INTO_WORKERS || WORKER_PING_INTERVAL_MS <= 0) return;
        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Starting Worker Pinger (interval: ${WORKER_PING_INTERVAL_MS}ms).`);
        workerPingIntervalId = setInterval(() => {
            const now = Date.now();
            if (hookedWorkers.size === 0 && !LOG_WORKER_INJECTION_DEBUG) return; // Optimization if no workers and debug off
            hookedWorkers.forEach((state, label) => {
                try {
                    if (state.instance && typeof state.instance.postMessage === 'function') {
                        let shouldPing = false;
                        if (state.hooksReady) shouldPing = true; // Ping if hooks are ready
                        else if (!state.isBlob && !state.isIVS) { // For non-blob/non-IVS workers, ping if no hooks_ready yet
                            const timeSinceCreation = now - (state.instance._createdAt || state.lastPing || now);
                            if (timeSinceCreation > WORKER_PING_INTERVAL_MS * 1.5) shouldPing = true;
                        }
                        // For IVS/Blob workers, only ping if hooksReady was true, or if explicitly requested by future logic
                        // Currently, they don't get injected by default, so hooksReady will be false.

                        if (shouldPing) {
                            if (state.lastPing > 0 && state.lastPong < state.lastPing && (now - state.lastPing > WORKER_PING_INTERVAL_MS * 2.5) ) {
                                // More lenient with IVS/Blob workers if they were supposed to be hooked but aren't responding
                                if (state.isIVS || state.isBlob) logWarn(context, `Worker (${label}) (IVS/Blob, HooksReady=${state.hooksReady}) not responding to PING (${Math.round((now - state.lastPing)/1000)}s). NOT removing.`);
                                else { logWarn(context, `Worker (${label}) not responding to PING (${Math.round((now - state.lastPing)/1000)}s). Removing.`); try { state.instance.terminate(); } catch(e){ /* ignore */ } hookedWorkers.delete(label); }
                                return;
                            }
                            logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `PING_WORKER_ADBLOCK -> ${label}`);
                            state.instance.postMessage({ type: 'PING_WORKER_ADBLOCK' }); state.lastPing = now;
                        }
                    } else { logWarn(context, `Worker (${label}) no postMessage or instance. Removing.`); hookedWorkers.delete(label); }
                } catch (e) { logError(context, `Error PING_WORKER_ADBLOCK to Worker (${label}):`, e.message); if (e.message.includes("terminated") || e.message.includes("detached")) hookedWorkers.delete(label); }
            });
        }, WORKER_PING_INTERVAL_MS);
    }

    function stopWorkerPinger() {
        if (workerPingIntervalId) { clearInterval(workerPingIntervalId); workerPingIntervalId = null; logCoreDebug('WorkerInject:Pinger', 'Worker Pinger stopped.'); }
    }

    function installHooks() {
        const context = 'MainHooks';
        if (hooksInstalledMain) return;
        logCoreDebug(context, "Installing main hooks...");
        try { unsafeWindow.fetch = fetchOverride; logCoreDebug(context, "Fetch hooked."); }
        catch (e) { logError(context, "Failed to hook Fetch:", e); if (originalFetch) unsafeWindow.fetch = originalFetch; }
        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; hookXhrGetters(); logCoreDebug(context, "XMLHttpRequest hooked."); }
        catch (e) { logError(context, "Failed to hook XMLHttpRequest:", e); if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; if (originalXhrResponseGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', originalXhrResponseGetter); } catch(revertErr) {} if (originalXhrResponseTextGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', originalXhrResponseTextGetter); } catch (revertErr) {} }
        if (INJECT_INTO_WORKERS) { try { hookWorkerConstructor(); } catch (e) { logError(context, "Failed to hook Worker constructor:", e); if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; } }
        else workerHookAttempted = false;
        hooksInstalledMain = true;
        logCoreDebug(context, "Main hooks installed.");
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
                        if (el.querySelector('video') || el.closest(PLAYER_SELECTORS_IMPROVED.join(',')) || el.hasAttribute('data-a-target="video-player') || el.classList.contains('video-player')) { logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMRemove', `Skip remove element ("${selector}") inside/is player.`); return; }
                        logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMRemove', `Removing element by selector: "${selector}"`);
                        try { el.parentNode.removeChild(el); removedCount++; }
                        catch (removeError) { if (!(removeError instanceof DOMException && removeError.name === 'NotFoundError')) logWarn('DOMRemove', `Error removing element "${selector}":`, removeError.message); }
                    }
                });
            } catch (queryError) { logWarn('DOMRemove', `Error querying elements by "${selector}":`, queryError.message); }
        });
        if (removedCount > 0) logCoreDebug('DOMRemove', `Removed ${removedCount} ad-related DOM elements.`);
    }

    function startAdRemovalObserver() {
        if (!ATTEMPT_DOM_AD_REMOVAL || adRemovalObserver) return;
        const context = 'DOMRemove:Observer';
        let observedNode = document.body;
        for (const selector of AD_DOM_PARENT_INDICATOR_SELECTORS) { const parentNode = document.querySelector(selector); if (parentNode) { observedNode = parentNode; break; } }
        if (!observedNode) observedNode = document.body || document.documentElement;
        if(!observedNode) { logWarn(context, `DOM node for observer not found. Retrying...`); setTimeout(startAdRemovalObserver, 200); return; }
        logCoreDebug(context, `Observing DOM changes in:`, observedNode.tagName + (observedNode.id ? '#' + observedNode.id : '') + (observedNode.className ? '.' + String(observedNode.className).split(' ').filter(Boolean).map(c => '.'+c).join('') : ''));
        const observerConfig = { childList: true, subtree: true };
        const callback = function(mutationsList) {
            let potentialAdNodeAdded = false;
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) { if (adSelector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) continue; try { if (node.matches && node.matches(adSelector)) { potentialAdNodeAdded = true; break; } } catch(e){ /*ignore*/ } } if (potentialAdNodeAdded) break;
                            if (!potentialAdNodeAdded) { for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) { if (adSelector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) continue; try { if (node.querySelector && node.querySelector(adSelector)) { potentialAdNodeAdded = true; break; } } catch(e){ /*ignore*/ } } } if (potentialAdNodeAdded) break;
                            if (node.tagName === 'IFRAME' && node.src && AD_URL_KEYWORDS_BLOCK.some(keyword => node.src.toLowerCase().includes(keyword))) { potentialAdNodeAdded = true; break; }
                        }
                    }
                } if (potentialAdNodeAdded) break;
            }
            if (potentialAdNodeAdded) { logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, context, 'Potential ad nodes detected, running removeDOMAdElements.'); removeDOMAdElements(observedNode); }
        };
        adRemovalObserver = new MutationObserver(callback);
        try { adRemovalObserver.observe(observedNode, observerConfig); requestAnimationFrame(() => removeDOMAdElements(observedNode)); logCoreDebug(context, 'DOM Ad Removal Observer started.'); }
        catch (e) { logError(context, 'Failed to start DOM Observer:', e); adRemovalObserver = null; }
    }
    function stopAdRemovalObserver() { if (adRemovalObserver) { adRemovalObserver.disconnect(); adRemovalObserver = null; logCoreDebug('DOMRemove:Observer', 'DOM Observer stopped.'); } }

    function findVideoPlayer() {
        if (videoElement && videoElement.isConnected && document.body.contains(videoElement)) {
            const style = window.getComputedStyle(videoElement);
            if (style.display !== 'none' && style.visibility !== 'hidden' && videoElement.offsetParent !== null && (videoElement.paused === false || videoElement.seeking === true || videoElement.readyState >= videoElement.HAVE_METADATA) ) return videoElement;
        }
        let foundElement = null;
        for (const selector of PLAYER_SELECTORS_IMPROVED) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) { if (el && el.tagName === 'VIDEO' && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null && el.hasAttribute('src') && (el.src.startsWith('blob:') || el.src.includes('.m3u8')) && window.getComputedStyle(el).display !== 'none') { foundElement = el; break; } } if (foundElement) break;
                if (!foundElement && elements.length > 0) { for (const el of elements) { if (el && el.tagName === 'VIDEO' && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null && window.getComputedStyle(el).display !== 'none') { foundElement = el; break; } } } if (foundElement) break;
            } catch (e) { /*ignore*/ }
        }
        if (foundElement && foundElement !== videoElement) logCoreDebug('PlayerFind', 'Video element found/changed.');
        else if (!foundElement && videoElement) logWarn('PlayerFind', 'Video element lost.');
        else if (!foundElement) logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerFind', 'Video element not found.');
        videoElement = foundElement; return foundElement;
    }

    function observePlayerContainer() {
        if (playerFinderObserver) return;
        const targetNode = document.body || document.documentElement;
        if (!targetNode) { logWarn('PlayerFind:Observer', 'Document body not found. Retrying...'); setTimeout(observePlayerContainer, 500); return; }
        const config = { childList: true, subtree: true };
        const callback = function(mutationsList, observer) {
            if (videoElement && videoElement.isConnected && document.body.contains(videoElement)) return;
            if (targetNode.getElementsByTagName('video').length > 0) { const potentialPlayer = findVideoPlayer(); if (potentialPlayer) { logCoreDebug('PlayerFind:Observer', 'Player detected, (re)starting player monitor.'); setupPlayerMonitor(); return; } }
            for (const mutation of mutationsList) { if (mutation.type === 'childList' && mutation.addedNodes.length > 0) { for (const node of mutation.addedNodes) { if (node.nodeType === Node.ELEMENT_NODE) { if (node.tagName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) { logCoreDebug('PlayerFind:Observer', 'VIDEO element or parent added, (re)starting player monitor.'); setupPlayerMonitor(); return; } } } } }
        };
        playerFinderObserver = new MutationObserver(callback);
        try { playerFinderObserver.observe(targetNode, config); logCoreDebug('PlayerFind:Observer', 'Player Finder Observer started.'); }
        catch (e) { logError('PlayerFind:Observer', 'Failed to start Player Finder Observer:', e); playerFinderObserver = null; }
    }
    function stopObservingPlayerContainer() { if (playerFinderObserver) { playerFinderObserver.disconnect(); playerFinderObserver = null; logCoreDebug('PlayerFind:Observer', 'Player Finder Observer stopped.'); } }

    function setupPlayerMonitor() {
        const context = 'PlayerMon:Setup';
        if (!ENABLE_AUTO_RELOAD) { if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; if (videoElement) removePlayerEventListeners(); videoElement = null; stopObservingPlayerContainer(); stopAdRemovalObserver(); logCoreDebug(context, 'Auto-reload disabled, player monitor deactivated.'); return; }
        const currentVideoElement = findVideoPlayer();
        if (!currentVideoElement) { if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; if (videoElement) removePlayerEventListeners(); videoElement = null; stopAdRemovalObserver(); if (!playerFinderObserver && document.body) observePlayerContainer(); logCoreDebug(context, 'Video element not found. Player Finder Observer active.'); return; }
        stopObservingPlayerContainer();
        if (currentVideoElement !== videoElement || !playerMonitorIntervalId) {
            logCoreDebug(context, `Video element found/changed. Initializing monitor...`);
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); if (videoElement) removePlayerEventListeners();
            videoElement = currentVideoElement; checkReloadCooldown(context); addPlayerEventListeners(); resetMonitorState('Monitor setup/reset');
            if (ATTEMPT_DOM_AD_REMOVAL && !adRemovalObserver && document.body) startAdRemovalObserver();
            if (!document.hidden) { playerMonitorIntervalId = setInterval(monitorPlayerState, 2000); logCoreDebug(context, 'Player monitor interval started.'); }
            else logCoreDebug(context, 'Tab inactive, monitor interval not started (will start on visibilitychange).');
        }
    }

    function triggerReload(reason) {
        const context = 'PlayerMon:Reload'; const now = Date.now(); if (!ENABLE_AUTO_RELOAD) return;
        if (reloadTimeoutId) { logWarn(context, `Reload (${reason}) requested, but another is scheduled (${reloadTimeoutId._reason || '?'}). Ignoring.`); return; }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) { logWarn(context, `Reload (${reason}) cancelled: cooldown active (${((RELOAD_COOLDOWN_MS - (now - lastReloadTimestamp))/1000).toFixed(1)}s left).`); return; }
        if (document.hidden) { logWarn(context, `Reload (${reason}) cancelled: tab inactive.`); return; }
        let playerStateLog = "N/A";
        if (videoElement) { let bufferedLog = "N/A"; try { if (videoElement.buffered?.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}]`; } } catch(e){} playerStateLog = `CT: ${videoElement.currentTime?.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}, Buffered: ${bufferedLog}, Paused: ${videoElement.paused}, Ended: ${videoElement.ended}, Error: ${videoElement.error?.code || 'null'}, Src: ${videoElement.src?.substring(0,50)}...`; }
        logError(context, `!!!!!! PAGE RELOAD TRIGGERED !!!!!! Reason: ${reason}. Player state: ${playerStateLog}`);
        lastReloadTimestamp = now; try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); } catch (e) { /*ignore*/ }
        if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; removePlayerEventListeners(); stopObservingPlayerContainer(); stopAdRemovalObserver(); stopWorkerPinger();
        unsafeWindow.location.reload(); setTimeout(() => { if(unsafeWindow?.location?.reload) unsafeWindow.location.reload(true); }, 2500);
    }

    function scheduleReload(reason, delayMs = 5000) {
        const context = 'PlayerMon:ScheduleReload';
        if (reloadTimeoutId || !ENABLE_AUTO_RELOAD || document.hidden) { if (reloadTimeoutId) logWarn(context, `Attempt to schedule reload (${reason}), but another is queued (${reloadTimeoutId._reason || '?'}).`); else if (document.hidden) logWarn(context, `Attempt to schedule reload (${reason}), but tab is hidden.`); return; }
        logWarn(context, `Scheduling reload in ${(delayMs / 1000).toFixed(1)}s. Reason: ${reason}`);
        reloadTimeoutId = setTimeout(() => { const internalReason = reloadTimeoutId?._reason || reason; reloadTimeoutId = null; triggerReload(internalReason); }, delayMs);
        try { if (reloadTimeoutId) reloadTimeoutId._reason = reason; } catch(e){}
    }

    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) {
            const currentReloadReason = reloadTimeoutId._reason || '';
            // Check if currentReloadReason contains specific error codes or general error terms
            const isCriticalErrorReload = RELOAD_ON_ERROR_CODES.some(code => currentReloadReason.includes(`(Code ${code}`) || currentReloadReason.includes(`Effective ${code}`)) ||
                  currentReloadReason.toLowerCase().includes('error') ||
                  currentReloadReason.toLowerCase().includes('ошибка') ||
                  currentReloadReason.toLowerCase().includes('critical state'); // Include new critical state reason

            if (!isCriticalErrorReload) {
                logCoreDebug('PlayerMon:State', `Cancelling scheduled reload (Reason: ${currentReloadReason}) due to state reset (Reset reason: ${reason}).`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            } else {
                logCoreDebug('PlayerMon:State', `Keeping scheduled critical error reload (Reason: ${currentReloadReason}) despite state reset (Reset reason: ${reason}).`);
            }
        }
        lastVideoTimeUpdateTimestamp = Date.now(); lastKnownVideoTime = videoElement ? videoElement.currentTime : -1; isWaitingForDataTimestamp = 0;
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:State', `Monitor state reset (Reason: ${reason}). CT: ${lastKnownVideoTime > -1 ? lastKnownVideoTime.toFixed(2) : 'N/A'}`);
    }

    function monitorPlayerState() {
        const context = 'PlayerMon:Monitor';
        if (!ENABLE_AUTO_RELOAD || document.hidden) { if (playerMonitorIntervalId && document.hidden) { logCoreDebug(context, 'Tab inactive, stopping monitor interval.'); clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; } return; }
        if (!videoElement || !videoElement.isConnected || !document.body.contains(videoElement)) { logWarn(context, 'Video element lost during monitoring. Restarting monitor setup.'); if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; if (videoElement) removePlayerEventListeners(); videoElement = null; stopAdRemovalObserver(); setupPlayerMonitor(); return; }
        if (videoElement && videoElement.src) { const currentQualityInStorage = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY); if (currentQualityInStorage !== TARGET_QUALITY_VALUE) { logWarn(context, `Stored quality ('${currentQualityInStorage}') differs from target ('${TARGET_QUALITY_VALUE}'). Forcing set.`); setQualitySettings(true); } }

        const now = Date.now(); const currentTime = videoElement.currentTime; const readyState = videoElement.readyState; const networkState = videoElement.networkState; const isSeeking = videoElement.seeking;
        let bufferEnd = 0, bufferStart = 0, bufferedLength = 0; try { if (videoElement.buffered?.length > 0) { bufferedLength = videoElement.buffered.length; bufferStart = videoElement.buffered.start(0); bufferEnd = videoElement.buffered.end(bufferedLength - 1); } } catch (e) {}
        let detectedProblemReason = null; const stallDebugInfo = `(RS ${readyState}, NS ${networkState}, CT ${currentTime.toFixed(2)}, Buf [${bufferStart.toFixed(2)}-${bufferEnd.toFixed(2)}] (${bufferedLength}p))`;

        if (!videoElement.paused && !videoElement.ended && !isSeeking && RELOAD_STALL_THRESHOLD_MS > 0) {
            const timeSinceLastUpdate = now - lastVideoTimeUpdateTimestamp;
            if (currentTime === lastKnownVideoTime && timeSinceLastUpdate > RELOAD_STALL_THRESHOLD_MS) {
                let isLikelyStalled = false;
                if (readyState < videoElement.HAVE_FUTURE_DATA || networkState === videoElement.NETWORK_IDLE || networkState === videoElement.NETWORK_EMPTY) isLikelyStalled = true;
                else if (bufferEnd - currentTime < 1.5 && readyState <= videoElement.HAVE_CURRENT_DATA) isLikelyStalled = true;
                if (isLikelyStalled && bufferedLength > 0 && bufferEnd > currentTime + 0.5) { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, context, `Stall detected, but buffer ahead: CT ${currentTime.toFixed(2)}, BufEnd ${bufferEnd.toFixed(2)}. Delaying reload.`); isLikelyStalled = false; }
                if (isLikelyStalled) detectedProblemReason = `Stall: CT unchanged for ${timeSinceLastUpdate.toFixed(0)}ms ${stallDebugInfo}`;
            } else if (lastKnownVideoTime > 0 && currentTime < (lastKnownVideoTime - 1.5) && Math.abs(currentTime - lastKnownVideoTime) > 0.5) detectedProblemReason = `Playback regression: CT jumped back from ${lastKnownVideoTime.toFixed(2)} to ${currentTime.toFixed(2)} ${stallDebugInfo}`;
            if (currentTime > lastKnownVideoTime) { lastVideoTimeUpdateTimestamp = now; lastKnownVideoTime = currentTime; if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('stall') && !detectedProblemReason) { logCoreDebug(context, `Cancelling 'stall' reload, CT updated.`); clearTimeout(reloadTimeoutId); reloadTimeoutId = null; } }
        } else { lastKnownVideoTime = currentTime; if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; if (reloadTimeoutId && !reloadTimeoutId._reason?.toLowerCase().includes('error') && !reloadTimeoutId._reason?.toLowerCase().includes('critical state')) { logCoreDebug(context, `Cancelling reload (Reason: ${reloadTimeoutId._reason || '?'}), player paused/ended/seeking.`); clearTimeout(reloadTimeoutId); reloadTimeoutId = null; } }
        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) { const bufferingDuration = now - isWaitingForDataTimestamp; if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS && !detectedProblemReason) detectedProblemReason = `Buffering: prolonged > ${(bufferingDuration / 1000).toFixed(1)}s ${stallDebugInfo}`; }
        const isPlayingAndReady = !videoElement.paused && !videoElement.ended && readyState >= videoElement.HAVE_FUTURE_DATA;
        if (isPlayingAndReady && isWaitingForDataTimestamp > 0) { logCoreDebug(context, `Exited buffering state. ${stallDebugInfo}`); isWaitingForDataTimestamp = 0; if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('buffer')) { logCoreDebug(context, `Cancelling 'buffering' reload, player resumed.`); clearTimeout(reloadTimeoutId); reloadTimeoutId = null; } }
        if (detectedProblemReason && !reloadTimeoutId) scheduleReload(detectedProblemReason);
    }

    function checkReloadCooldown(context) { try { const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload'); if (sessionReloadTime) { const parsedTime = parseInt(sessionReloadTime, 10); sessionStorage.removeItem('ttv_adblock_last_reload'); if (!isNaN(parsedTime)) { const timeSinceLastReload = Date.now() - parsedTime; if (timeSinceLastReload < RELOAD_COOLDOWN_MS && timeSinceLastReload >= 0) { lastReloadTimestamp = Date.now() - timeSinceLastReload; logWarn(context, `Reload cooldown restored. ${((RELOAD_COOLDOWN_MS - timeSinceLastReload)/1000).toFixed(1)}s remaining.`); } } } } catch (e) { /*ignore*/ } }

    function addPlayerEventListeners() {
        if (!videoElement || videoElement._adblockListenersAttached) return;
        logCoreDebug('PlayerMon:Events', 'Adding player event listeners.');
        videoElement.addEventListener('error', handlePlayerError, { passive: true }); videoElement.addEventListener('waiting', handlePlayerWaiting, { passive: true }); videoElement.addEventListener('playing', handlePlayerPlaying, { passive: true }); videoElement.addEventListener('pause', handlePlayerPause, { passive: true }); videoElement.addEventListener('emptied', handlePlayerEmptied, { passive: true }); videoElement.addEventListener('loadedmetadata', handlePlayerLoadedMeta, { passive: true }); videoElement.addEventListener('abort', handlePlayerAbort, { passive: true }); videoElement.addEventListener('timeupdate', handlePlayerTimeUpdate, { passive: true }); videoElement.addEventListener('progress', handlePlayerProgress, { passive: true });
        videoElement._adblockListenersAttached = true;
    }
    function removePlayerEventListeners() {
        if (!videoElement || !videoElement._adblockListenersAttached) return;
        logCoreDebug('PlayerMon:Events', 'Removing player event listeners.');
        videoElement.removeEventListener('error', handlePlayerError); videoElement.removeEventListener('waiting', handlePlayerWaiting); videoElement.removeEventListener('playing', handlePlayerPlaying); videoElement.removeEventListener('pause', handlePlayerPause); videoElement.removeEventListener('emptied', handlePlayerEmptied); videoElement.removeEventListener('loadedmetadata', handlePlayerLoadedMeta); videoElement.removeEventListener('abort', handlePlayerAbort); videoElement.removeEventListener('timeupdate', handlePlayerTimeUpdate); videoElement.removeEventListener('progress', handlePlayerProgress);
        delete videoElement._adblockListenersAttached;
    }

    function handlePlayerError(event) {
        if (!videoElement || (event.target !== videoElement && !(event.target instanceof HTMLVideoElement)) ) { logWarn('PlayerMon:EventError', 'Error event from unexpected/stale element.'); return; }
        const error = event?.target?.error; if (!error) { logWarn('PlayerMon:EventError', 'Player error event without details.'); return; }
        const errorCode = error.code; let errorMessage = error.message || 'No error message';
        if (error.data && error.data.length > 0 && typeof error.data[0] === 'object' && error.data[0] !== null && error.data[0].message) errorMessage = error.data[0].message + ` (Original code: ${errorCode})`;
        const networkErrorCodeMatch = errorMessage.match(/ErrorNetwork code (\d+)/i); let effectiveErrorCode = errorCode;
        if (networkErrorCodeMatch && networkErrorCodeMatch[1]) { effectiveErrorCode = parseInt(networkErrorCodeMatch[1], 10); errorMessage += ` (Effective Network Code: ${effectiveErrorCode})`; }
        logError('PlayerMon:EventError', `Player error! Code: ${errorCode} (Effective: ${effectiveErrorCode}), Msg: "${errorMessage}"`);
        let reason = `Player error (Code ${errorCode}, Effective ${effectiveErrorCode}: ${errorMessage.substring(0,100)})`;
        if (ENABLE_AUTO_RELOAD) {
            let shouldScheduleReload = false; let delay = 3500;
            if (RELOAD_ON_ERROR_CODES.includes(effectiveErrorCode) || RELOAD_ON_ERROR_CODES.includes(errorCode)) { shouldScheduleReload = true; if (effectiveErrorCode === 403 || errorCode === 403) delay = 2500; if (effectiveErrorCode === 2000 || errorCode === 2000) delay = 3000; }
            else if (errorMessage.toLowerCase().includes('masterplaylist:10') && (RELOAD_ON_ERROR_CODES.includes(10) || RELOAD_ON_ERROR_CODES.includes(errorCode))) { reason += ` (MasterPlaylist:10)`; shouldScheduleReload = true; }
            else if (errorMessage.toLowerCase().includes('code 5000') && (RELOAD_ON_ERROR_CODES.includes(5000) || RELOAD_ON_ERROR_CODES.includes(errorCode))) { reason += ` (Code 5000)`; shouldScheduleReload = true; }
            if (shouldScheduleReload) { logWarn('PlayerMon:EventError', `Detected player error (${reason}) configured for reload. Scheduling reload...`); scheduleReload(reason, delay); }
        }
        resetMonitorState(`Player error ${errorCode} / ${effectiveErrorCode}`);
    }
    function handlePlayerWaiting() {
        if (videoElement && !videoElement.paused && !videoElement.seeking && isWaitingForDataTimestamp === 0 && !document.hidden) {
            let bufferedLog = "N/A"; try { if (videoElement.buffered?.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}] (${videoElement.buffered.length}p)`; } } catch(e){}
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventWaiting', `Player 'waiting'... CT: ${videoElement.currentTime.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}, Buf: ${bufferedLog}`);
            isWaitingForDataTimestamp = Date.now();
        }
    }
    function handlePlayerPlaying() { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventPlaying', `Playback started/resumed.`); if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0; resetMonitorState('Playing event'); setQualitySettings(true); }
    function handlePlayerPause() { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventPause', `Playback paused.`); resetMonitorState('Paused event'); }

    function handlePlayerEmptied() {
        const context = 'PlayerMon:EventEmptied';
        logWarn(context, 'Player source emptied. Resetting monitor.');
        resetMonitorState('Emptied event');
        if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
        playerMonitorIntervalId = null;
        stopAdRemovalObserver();

        let criticalErrorCondition = false;
        if (videoElement) {
            const readyState = videoElement.readyState;
            const networkState = videoElement.networkState;
            if (networkState === videoElement.NETWORK_NO_SOURCE || networkState === videoElement.NETWORK_EMPTY || readyState === videoElement.HAVE_NOTHING) {
                criticalErrorCondition = true;
                logWarn(context, `Source emptied with critical player state (RS: ${readyState}, NS: ${networkState}). Potential network/access error aftermath.`);
            }
        } else {
            criticalErrorCondition = true; // If videoElement is gone, assume critical
            logWarn(context, `Source emptied and videoElement is null. Assuming critical error.`);
        }

        if (criticalErrorCondition && ENABLE_AUTO_RELOAD) {
            const reason = "Player emptied with critical state (suspected network/access error)";
            logWarn(context, `Scheduling reload due to: ${reason}`);
            if (!reloadTimeoutId) { // Do not schedule if another reload (especially error-based) is already pending
                scheduleReload(reason, 1500); // Shorter delay for critical situations
            } else {
                logWarn(context, `Reload for "${reason}" skipped, another reload already scheduled: ${reloadTimeoutId._reason || '?'}`);
            }
        } else {
            setTimeout(setupPlayerMonitor, 750);
        }
    }

    function handlePlayerLoadedMeta() { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventLoadedMeta', `Video metadata loaded.`); resetMonitorState('Loaded Metadata event'); setQualitySettings(true); }
    function handlePlayerAbort() { logWarn('PlayerMon:EventAbort', 'Video load aborted.'); resetMonitorState('Aborted event'); } // Consider if Abort should also check criticalErrorCondition like Emptied
    function handlePlayerTimeUpdate() {
        if (videoElement && !videoElement.seeking) {
            const currentTime = videoElement.currentTime;
            if (Math.abs(currentTime - lastKnownVideoTime) > 0.01) {
                if (currentTime > lastKnownVideoTime) { lastVideoTimeUpdateTimestamp = Date.now(); lastKnownVideoTime = currentTime; if (isWaitingForDataTimestamp > 0) { logCoreDebug('PlayerMon:EventTimeUpdate', 'Exited buffering (time updated).'); isWaitingForDataTimestamp = 0; } }
                if (LOG_PLAYER_MONITOR_DEBUG) { const now = Date.now(); if (!videoElement._lastTimeUpdateLog || now - videoElement._lastTimeUpdateLog > 10000) { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventTimeUpdate', `TimeUpdate: CT=${currentTime.toFixed(2)}`); videoElement._lastTimeUpdateLog = now; } }
            }
        }
    }
    function handlePlayerProgress() {
        if (LOG_PLAYER_MONITOR_DEBUG && videoElement) {
            let bufferedLog = "N/A"; try { if (videoElement.buffered?.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}] (${videoElement.buffered.length}p)`; } } catch(e){}
            const now = Date.now(); if (!videoElement._lastProgressLog || now - videoElement._lastProgressLog > 5000) { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventProgress', `Progress: Buf: ${bufferedLog}, CT: ${videoElement.currentTime.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}`); videoElement._lastProgressLog = now; }
        }
    }

    function handleVisibilityChange() {
        const context = 'Visibility';
        if (document.hidden) {
            logCoreDebug(context, 'Tab hidden.');
            if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
            if (reloadTimeoutId) { logCoreDebug(context, `Cancelling reload (Reason: ${reloadTimeoutId._reason || '?'}) due to hidden tab.`); clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
            if (visibilityResumeTimer) { clearTimeout(visibilityResumeTimer); visibilityResumeTimer = null; }
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
            stopAdRemovalObserver(); stopWorkerPinger();
        } else {
            logCoreDebug(context, 'Tab active. Resuming ops with delay ' + VISIBILITY_RESUME_DELAY_MS + 'ms.');
            if (visibilityResumeTimer) clearTimeout(visibilityResumeTimer);
            visibilityResumeTimer = setTimeout(() => {
                visibilityResumeTimer = null; logCoreDebug(context, 'Visibility resume delay passed. Re-initializing...');
                setQualitySettings(true);
                if (ENABLE_AUTO_RELOAD) { resetMonitorState('Visibility resume'); checkReloadCooldown(context); setupPlayerMonitor(); }
                if (ATTEMPT_DOM_AD_REMOVAL && document.body) startAdRemovalObserver();
                if (INJECT_INTO_WORKERS) startWorkerPinger();
                if (videoElement && videoElement.paused && !videoElement.ended && videoElement.readyState >= videoElement.HAVE_FUTURE_DATA) { logCoreDebug(context, 'Player paused on visibility resume. Attempting autoplay...'); videoElement.play().catch(e => logWarn(context, 'Autoplay error on visibility resume:', e.message)); }
            }, VISIBILITY_RESUME_DELAY_MS);
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    installHooks();
    setQualitySettings(true);

    function initialStart() {
        if (CORE_DEBUG_LOGGING) logCoreDebug('Init', 'Initial script start...');
        setupPlayerMonitor();
        if (ATTEMPT_DOM_AD_REMOVAL) {
            if (document.body) { removeDOMAdElements(document); startAdRemovalObserver(); }
            else window.addEventListener('DOMContentLoaded', () => { removeDOMAdElements(document); startAdRemovalObserver(); }, { once: true, passive: true });
        }
        if (INJECT_INTO_WORKERS) startWorkerPinger();
    }

    function deferredInitialStart() {
        if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => requestAnimationFrame(initialStart), { once: true, passive: true });
        else requestAnimationFrame(initialStart);
    }
    deferredInitialStart();

    setTimeout(() => {
        if (ENABLE_AUTO_RELOAD && !videoElement && !playerFinderObserver && (document.readyState === 'complete' || document.readyState === 'interactive')) { logWarn('Init', 'Fallback: Checking for player and starting monitor after 5s...'); setupPlayerMonitor(); }
        if (ATTEMPT_DOM_AD_REMOVAL && !adRemovalObserver && document.body) { logWarn('Init', 'Fallback: Starting AdRemovalObserver after 5s...'); removeDOMAdElements(document); startAdRemovalObserver(); }
        if (INJECT_INTO_WORKERS && !workerPingIntervalId) { logWarn('Init', 'Fallback: Starting Worker Pinger after 5s...'); startWorkerPinger(); }
    }, 5000);

    if (CORE_DEBUG_LOGGING) logCoreDebug('Init', 'Twitch Adblock Ultimate (Release) initialized.');
})();