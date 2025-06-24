// ==UserScript==
// @name         Twitch Adblock Ultimate (Исправлено)
// @namespace    TwitchAdblockUltimate
// @version      20.1.1
// @description  Блокировка рекламы Twitch, с автовоспроизведением. Исправленная версия.
// @author       ShmidtS (исправления от AI)
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
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- START OF CONFIGURATION ---
    const SCRIPT_VERSION = '20.1.1'; // Новый номер версии
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
    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '0,2,3,4,9,10,403,1000,2000,3000,4000,5000,6001');
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 20000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 45000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);
    const VISIBILITY_RESUME_DELAY_MS = GM_getValue('TTV_AdBlock_VisResumeDelayMs', 1500);
    const WORKER_PING_INTERVAL_MS = GM_getValue('TTV_AdBlock_WorkerPingIntervalMs', 20000);
    const USE_REGEX_M3U8_CLEANING = GM_getValue('TTV_AdBlock_UseRegexM3U8', true);
    const AGGRESSIVE_GQL_SCAN = GM_getValue('TTV_AdBlock_AggressiveGQLScan', false);
    // --- END OF CONFIGURATION ---

    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const GQL_OPERATIONS_TO_SKIP_MODIFICATION = new Set(['PlaybackAccessToken', 'PlaybackAccessToken_Template', 'ChannelPointsContext', 'ViewerPoints', 'CommunityPointsSettings', 'ClaimCommunityPoints', 'CreateCommunityPointsReward', 'UpdateCommunityPointsReward', 'DeleteCommunityPointsReward', 'UpdateCommunityPointsSettings', 'CustomRewardRedemption', 'RedeemCommunityPointsCustomReward', 'RewardCenter', 'ChannelPointsAutomaticRewards', 'predictions', 'polls', 'UserFollows', 'VideoComments', 'ChatHighlights', 'VideoPreviewCard__VideoHover', 'UseLive', 'UseBrowseQueries', 'ViewerCardModLogsMessagesBySender', 'ComscoreStreamingQuery', 'StreamTags', 'StreamMetadata', 'VideoMetadata', 'ChannelPage_GetChannelStat', 'Chat_Userlookup', 'RealtimeStreamTagList_Tags', 'UserModStatus', 'FollowButton_FollowUser', 'FollowButton_UnfollowUser', 'Clips_Popular_ miesiąc', 'PersonalSections', 'RecommendedChannels', 'FrontPage', 'GetHomePageRecommendations', 'VideoComments_SentMessage', 'UseUserReportModal', 'ReportUserModal_UserReport', 'UserLeaveSquad', 'UserModal_GetFollowersForUser', 'UserModal_GetFollowedChannelsForUser', 'PlayerOverlaysContext', 'MessageBufferPresences', 'RecentChatMessages', 'ChatRoomState', 'VideoPreviewCard__VideoPlayer', 'ChannelPage_ChannelInfoBar_User', 'ChannelPage_SetSessionStatus', 'UseSquadStream', 'OnsiteNotifications', 'OnsiteWaffleNotifications', 'UserActions', 'BitsLeaderboard', 'ChannelLeaderboards', 'PrimeOffer', 'ChannelExtensions', 'ExtensionsForChannel', 'DropCampaignDetails', 'DropsDashboardPage_GetDropCampaigns', 'StreamEventsSlice', 'StreamElementsService_GetOverlays', 'StreamElementsService_GetTheme', 'ViewerBounties', 'GiftASubModal_UserGiftEligibility', 'WebGiftSubButton_SubGiftEligibility', 'CharityCampaign', 'GoalCreateDialog_User', 'GoalsManageOverlay_ChannelGoals', 'PollCreateDialog_User', 'MultiMonthDiscount', 'FreeSubBenefit', 'SubPrices', 'SubscriptionProductBenefitMessages', 'UserCurrentSubscriptionsContext', 'VideoPreviewCard_VideoMarkers', 'UpdateVideoMutation', 'DeleteVideos', 'HostModeTargetDetails', 'StreamInformation', 'VideoPlayer_StreamAnalytics', 'VideoPlayer_VideoSourceManager', 'VideoPlayerStreamMetadata', 'VideoPlayerStatusOverlayChannel']);
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIALBREAK'];
    const AD_DATERANGE_REGEX = USE_REGEX_M3U8_CLEANING ? /CLASS="(?:TWITCH-)?STITCHED-AD"/i : null;
    let AD_URL_KEYWORDS_BLOCK = ['d2v02itv0y9u9t.cloudfront.net', 'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com', 'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org', 'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com', 'scorecardresearch.com', 'yandex.ru/clck/', 'omnitagjs', 'omnitag', 'innovid.com', 'eyewonder.com', 'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com', 'flashtalking.com', 'contextual.media.net', 'advertising.com', 'adform.net', 'freewheel.tv', 'stickyadstv.com', 'tremorhub.com', 'aniview.com', 'criteo.com', 'adition.com', 'teads.tv', 'undertone.com', 'vidible.tv', 'vidoomy.com', 'appnexus.com', '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads'];
    if (BLOCK_NATIVE_ADS_SCRIPT) AD_URL_KEYWORDS_BLOCK.push('nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com');
    const PLAYER_CONTAINER_SELECTORS = ['div[data-a-target="video-player"]', '.video-player', 'div[data-a-player-state]', 'main', '.persistent-player'];
    const AD_OVERLAY_SELECTORS_CSS = ['.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]', 'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]', '.player-ad-notice', '.ad-interrupt-screen', 'div[data-test-selector="ad-banner-default-text-area"]', 'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container', '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]', '[data-test-selector="sad-overlay"]', 'div[class*="video-ad-label"]', '.player-ad-overlay', 'div[class*="advertisement"]', 'div[class*="-ad-"]', 'div[data-a-target="sad-overlay-container"]', 'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]'];
    const COOKIE_BANNER_SELECTOR = '.consent-banner';

    const AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST = [
        'div[data-a-target="player-ad-overlay"]',
        'div[data-test-selector="ad-interrupt-overlay__player-container"]',
        'div[aria-label="Advertisement"]',
        'iframe[src*="amazon-adsystem.com"]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="imasdk.googleapis.com"]',
        '.player-overlay-ad',
        '.tw-player-ad-overlay',
        '.video-ad-display',
        'div[data-ad-placeholder="true"]',
        '[data-a-target="video-ad-countdown-container"]',
        '.promoted-content-card',
        'div[class*="--ad-banner"]',
        'div[data-ad-unit]',
        'div[class*="player-ads"]',
        'div[data-ad-boundary]',
        'div[data-a-target="sad-overlay-container"]',
        'div[data-test-selector="sad-overlay-v-one-container"]',
        'div[data-test-selector*="sad-overlay"]'
    ];
    if (HIDE_COOKIE_BANNER) AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST.push(COOKIE_BANNER_SELECTOR);

    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;
    let hooksInstalledMain = false;
    let adRemovalObserver = null;
    let errorScreenObserver = null;
    const RELOAD_ON_ERROR_CODES = RELOAD_ON_ERROR_CODES_RAW.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const MAX_RELOADS_PER_SESSION = 5;
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

    function logError(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args); }
    function logWarn(source, message, ...args) { if (SHOW_ERRORS_CONSOLE) console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args); }
    function logCoreDebug(source, message, ...args) { if (CORE_DEBUG_LOGGING) console.debug(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args); }
    function logModuleTrace(moduleFlag, source, message, ...args) { if (moduleFlag) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg)); }

    function injectCSS() {
        let cssToInject = '';
        if (HIDE_AD_OVERLAY_ELEMENTS) cssToInject += `${AD_OVERLAY_SELECTORS_CSS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }\n`;
        if (HIDE_COOKIE_BANNER) cssToInject += `${COOKIE_BANNER_SELECTOR} { display: none !important; }\n`;
        if (cssToInject) try { GM_addStyle(cssToInject); } catch (e) { logError('CSSInject', 'CSS apply failed:', e); }
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
                    forcedValue = TARGET_QUALITY_VALUE;
                    cachedQualityValue = forcedValue;
                }
                try {
                    const args = Array.from(arguments);
                    args[1] = forcedValue;
                    return originalLocalStorageSetItem.apply(unsafeWindow.localStorage, args);
                } catch (e) {
                    logError('QualitySet:LocalStorageHook', `localStorage.setItem error for '${key}':`, e);
                    if (key === LS_KEY_QUALITY) cachedQualityValue = null;
                    throw e;
                }
            };
            cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
            setQualitySettings(true);
        } catch(e) {
            logError('QualitySet:LocalStorageHook', 'localStorage.setItem hook error:', e);
            if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
        }
    }

    function parseAndCleanM3U8(m3u8Text, url = "N/A") {
        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;
        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logError('M3U8Clean', `Invalid M3U8 content for ${urlFilename}`);
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
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'M3U8Clean', `No ad content detected in ${urlFilename}`);
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
            } else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) {
                    removeThisLine = true; currentLineIsAdMarker = true; isAdSection = false; discontinuityShouldBeRemoved = false;
                } else if (upperTrimmedLine.startsWith('#EXTINF')) {
                    isAdSection = false; discontinuityShouldBeRemoved = false;
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                    if (discontinuityShouldBeRemoved) {
                        removeThisLine = true; currentLineIsAdMarker = true; discontinuityShouldBeRemoved = false;
                    }
                } else if (!trimmedLine.startsWith('#') && trimmedLine !== '') {
                    removeThisLine = true;
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
            logWarn('M3U8Clean', `Insufficient segments after cleaning ${urlFilename}, reverting to original`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: true, errorDuringClean: true };
        }
        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'M3U8Clean', `Cleaned ${urlFilename}: ${linesRemovedCount} lines removed, ${segmentCount} segments remain`);
        return { cleanedText: cleanedText, adsFound: adsFoundOverall, linesRemoved: linesRemovedCount, wasPotentiallyAd: potentialAdContent, errorDuringClean: false };
    }

    function _universalParseAndCleanM3U8(m3u8Text, url = "N/A", debugLogging = false) {
        // This is a self-contained version for worker injection.
        const AD_SIGNIFIER_DATERANGE_ATTR_WORKER = 'twitch-stitched-ad';
        const AD_DATERANGE_ATTRIBUTE_KEYWORDS_WORKER = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIALBREAK'];
        const AD_DATERANGE_REGEX_WORKER = /CLASS="(?:TWITCH-)?STITCHED-AD"/i;

        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;

        if (!m3u8Text || typeof m3u8Text !== 'string') {
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
            } else if (upperTrimmedLine.startsWith('#EXT-X-ASSET') || upperTrimmedLine.startsWith('#EXT-X-CUE-OUT') || upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-HIDE') || upperTrimmedLine.startsWith('#EXT-X-SCTE35') || upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH')) {
                removeThisLine = true; adsFoundOverall = true; isAdSection = true; discontinuityShouldBeRemoved = true;
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

            if (!removeThisLine) {
                cleanLines.push(line);
            }
        }

        const cleanedText = cleanLines.join('\n');
        return { cleanedText: cleanedText, adsFound: adsFoundOverall };
    }

    function getWorkerInjectionCode() {
        const _universalParseAndCleanM3U8String = _universalParseAndCleanM3U8.toString();
        return `
            const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
            const CORE_DEBUG_LOGGING_WORKER = ${CORE_DEBUG_LOGGING};
            const LOG_M3U8_CLEANING_WORKER = ${LOG_M3U8_CLEANING_DEBUG};
            const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';

            ${_universalParseAndCleanM3U8String}

            (function() {
                function workerLogError(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
                function workerLogM3U8Trace(message, ...args) { if (LOG_M3U8_CLEANING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' [M3U8 Relay] TRACE:', message, ...args); }

                const originalFetch = self.fetch;
                if (typeof self.fetch === 'function' && !self.fetch.hooked_by_adblock_ult_worker) {
                    self.fetch = async function(input, init) {
                        let requestUrl = (input instanceof Request) ? input.url : String(input);
                        const lowerCaseUrl = requestUrl.toLowerCase();
                        const isM3U8Request = lowerCaseUrl.endsWith('.m3u8') && lowerCaseUrl.includes('usher.ttvnw.net');

                        if (isM3U8Request) {
                            workerLogM3U8Trace('Worker Fetch: Intercepted M3U8 request', requestUrl);
                            try {
                                const response = await originalFetch.apply(this, arguments);
                                if (response.ok) {
                                    const text = await response.clone().text();
                                    const { cleanedText, adsFound } = _universalParseAndCleanM3U8(text, requestUrl, LOG_M3U8_CLEANING_WORKER);
                                    if (adsFound) {
                                        const newHeaders = new Headers(response.headers);
                                        newHeaders.delete('Content-Length');
                                        return new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders });
                                    }
                                }
                                return response;
                            } catch (e) {
                                workerLogError('Worker Fetch M3U8 Error:', e, requestUrl);
                                return originalFetch.apply(this, arguments);
                            }
                        }
                        return originalFetch.apply(this, arguments);
                    };
                    self.fetch.hooked_by_adblock_ult_worker = true;
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
                    continue;
                } else if (operationName === 'AdFreeQuery') {
                    if (opData.data?.viewerAdFreeConfig?.isAdFree === false) {
                        opData.data.viewerAdFreeConfig.isAdFree = true;
                        currentOpModified = true;
                    }
                } else if (operationName === 'ClientSideAd') {
                    let modified = false;
                    if (opData.data) {
                        if (opData.data.ads) { opData.data.ads = []; modified = true; }
                        if (opData.data.clientAd) { opData.data.clientAd = null; modified = true; }
                        if (opData.data.companionSlots) { opData.data.companionSlots = []; modified = true; }
                        if (opData.data.playerAdParams) { opData.data.playerAdParams = null; modified = true; }
                        if (modified) currentOpModified = true;
                    }
                } else if (operationName === "Interstitials") {
                    if (opData.data?.stream?.interstitials && Array.isArray(opData.data.stream.interstitials) && opData.data.stream.interstitials.length > 0) {
                        opData.data.stream.interstitials = [];
                        currentOpModified = true;
                    }
                } else if (opData.data?.stream?.playbackAccessToken && typeof opData.data.stream.playbackAccessToken.value === 'string') {
                    try {
                        const tokenValue = JSON.parse(opData.data.stream.playbackAccessToken.value);
                        let tokenModified = false;
                        if (tokenValue.hide_ads === false) { tokenValue.hide_ads = true; tokenModified = true; }
                        if (tokenValue.show_ads === true) { tokenValue.show_ads = false; tokenModified = true; }
                        if (tokenValue.hasOwnProperty('ad_indicator')) { delete tokenValue.ad_indicator; tokenModified = true; }
                        if (tokenValue.hasOwnProperty('ads_on_stream')) { tokenValue.ads_on_stream = 0; tokenModified = true; }
                        if (tokenValue.hasOwnProperty('roll_type')) { delete tokenValue.roll_type; tokenModified = true; }
                        if (tokenModified) {
                            opData.data.stream.playbackAccessToken.value = JSON.stringify(tokenValue);
                            currentOpModified = true;
                        }
                    } catch (e) {}
                }
                if (currentOpModified) modifiedOverall = true;
            }
            if (modifiedOverall) {
                logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'GQLModify', `Modified GQL response for ${url}`);
                return JSON.stringify(Array.isArray(data) ? opDataArray : opDataArray[0]);
            }
        } catch (e) {
            logError('GQLModify', `Error modifying GQL response for ${url}:`, e);
        }
        return responseText;
    }

    async function fetchOverride(input, init) {
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
        const lowerCaseUrl = requestUrl.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const urlShortForLog = (requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl).substring(0, 120);

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'FetchBlock', `Blocked fetch request to ${urlShortForLog} (Keyword: ${keyword})`);
                return new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock Ultimate (Keyword: ${keyword})` });
            }
        }

        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && lowerCaseUrl.includes('usher.ttvnw.net');
        if (isM3U8RequestToUsher) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: requestUrl, headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined, responseType: "text",
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText } = parseAndCleanM3U8(response.responseText, requestUrl);
                            const newHeaders = new Headers();
                            if (response.responseHeaders) response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => { const parts = line.split(': ', 2); if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') newHeaders.append(parts[0], parts[1]); });
                            if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'MainFetchM3U8', `Processed M3U8 for ${urlShortForLog}`);
                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders }));
                        } else {
                            logError('MainFetchM3U8', `GM_xmlhttpRequest failed for ${urlShortForLog}: ${response.statusText || response.status}`);
                            reject(new TypeError(`GM_xmlhttpRequest failed: ${response.statusText || response.status}`));
                        }
                    },
                    onerror: function(error) {
                        logError('MainFetchM3U8', `Network error for ${urlShortForLog}:`, error);
                        reject(new TypeError('Network error'));
                    }
                });
            });
        }

        const originalResponse = await originalFetch(input, init);
        if (isGqlRequest && method === 'POST' && originalResponse.ok && MODIFY_GQL_RESPONSE) {
            let responseText;
            try { responseText = await originalResponse.clone().text(); if (!responseText) return originalResponse; } catch (e) { return originalResponse; }
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
        const lowerCaseUrl = urlString.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && urlString.includes('usher.ttvnw.net');

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'XHRBlock', `Blocked XHR to ${urlString.substring(0,100)}`);
                this.dispatchEvent(new Event('error'));
                return;
            }
        }

        if (isM3U8RequestToUsher) {
            const xhr = this;
            GM_xmlhttpRequest({
                method: method, url: urlString, responseType: "text",
                onload: function(response) {
                    const { cleanedText } = parseAndCleanM3U8(response.responseText, urlString);
                    Object.defineProperties(xhr, {
                        'responseText': { value: cleanedText, configurable: true },
                        'response': { value: cleanedText, configurable: true },
                        'status': { value: response.status, configurable: true },
                        'statusText': { value: response.statusText, configurable: true },
                        'readyState': { value: 4, configurable: true }
                    });
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'MainXHR_M3U8', `Processed M3U8 for ${urlString.substring(0,100)}`);
                    xhr.dispatchEvent(new Event('load'));
                    xhr.dispatchEvent(new Event('loadend'));
                },
                onerror: function(error) {
                    logError('MainXHR_M3U8', `GM_xmlhttpRequest error for ${urlString.substring(0,100)}:`, error);
                    xhr.dispatchEvent(new Event('error'));
                }
            });
            return;
        }

        if (isGqlRequest && method === 'POST' && MODIFY_GQL_RESPONSE) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const originalResponseText = this.responseText;
                    const modifiedText = modifyGqlResponse(originalResponseText, urlString);
                    if (modifiedText !== originalResponseText) {
                        Object.defineProperty(this, 'responseText', { value: modifiedText, configurable: true });
                        Object.defineProperty(this, 'response', { value: modifiedText, configurable: true });
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'MainXHR_GQL', `Modified GQL for ${urlString.substring(0,100)}`);
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
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'WorkerFallback', `Worker M3U8 fetch failed, main handling: ${msg.url.substring(0,100)}`);
            GM_xmlhttpRequest({
                method: "GET", url: msg.url, responseType: "text",
                onload: (response) => {
                    const { cleanedText } = parseAndCleanM3U8(response.responseText, msg.url);
                    const headers = {};
                    if (response.responseHeaders) response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => {
                        const parts = line.split(': ', 2); if (parts.length === 2) headers[parts[0].toLowerCase()] = parts[1];
                    });
                    workerPort.postMessage({ adblock_message_response: true, id: msg.id, body: cleanedText, status: response.status, statusText: response.statusText, headers });
                },
                onerror: () => workerPort.postMessage({ adblock_message_response: true, id: msg.id, error: 'GM_XHR Network Error', status: 0 })
            });
        }
    }

    function hookWorkerConstructor() {
        if (!INJECT_INTO_WORKERS || unsafeWindow.Worker.hooked_by_adblock_ult) return;
        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                const urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                const workerCode = getWorkerInjectionCode();
                const blob = new Blob([workerCode, `\nimportScripts("${urlString}");`], { type: 'application/javascript' });
                const newScriptURL = URL.createObjectURL(blob);
                const workerInstance = super(newScriptURL, options);
                URL.revokeObjectURL(newScriptURL);
                logCoreDebug('WorkerHook', `Intercepted Worker creation for: ${urlString.substring(0, 100)}`);
                return workerInstance;
            }
        };
        unsafeWindow.Worker.hooked_by_adblock_ult = true;
        unsafeWindow.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true });
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
        logCoreDebug('HookInstall', 'Main hooks installed.');
    }

    function removeDOMAdElements(selectorsToRemove) {
        if (!ATTEMPT_DOM_AD_REMOVAL) return;
        if (!adRemovalObserver) {
            adRemovalObserver = new MutationObserver(() => removeDOMAdElements(selectorsToRemove));
            adRemovalObserver.observe(document.body, { childList: true, subtree: true });
            logCoreDebug('DOMAdRemoval', 'MutationObserver for ad removal started.');
        }
        selectorsToRemove.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (el && el.parentNode) {
                    try { el.parentNode.removeChild(el); } catch (e) {}
                }
            });
        });
    }

    let videoPlayerMutationObserver = null;
    function setupVideoPlayerMonitor() {
        if (videoPlayerMutationObserver) return;
        videoPlayerMutationObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newVideoElement = node.querySelector('video') || (node.tagName === 'VIDEO' ? node : null);
                            if (newVideoElement && newVideoElement !== videoElement) {
                                videoElement = newVideoElement;
                                logCoreDebug('PlayerMonitor', 'Found new video element.');
                                const attemptPlay = () => {
                                    if (videoElement && videoElement.paused) {
                                        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'Autoplay', 'Proactively playing newly discovered video element.');
                                        videoElement.play().catch(e => {
                                            logWarn('Autoplay', `Failed to autoplay video: ${e.message}. User interaction may be required.`);
                                        });
                                    }
                                };
                                setTimeout(attemptPlay, 1000);
                                videoElement.addEventListener('play', attemptPlay, { once: true, passive: true });
                                videoElement.addEventListener('click', attemptPlay, { once: true, passive: true });
                                videoElement.addEventListener('error', (e) => {
                                    const errorCode = e?.target?.error?.code;
                                    if (errorCode && RELOAD_ON_ERROR_CODES.includes(errorCode)) {
                                        logError('PlayerMonitor', `Player error code ${errorCode} detected. Reloading.`);
                                        triggerReload(`Player error code ${errorCode}`);
                                    }
                                }, { passive: true });
                                return;
                            }
                        }
                    }
                }
            }
        });
        videoPlayerMutationObserver.observe(document.body, { childList: true, subtree: true });
        logCoreDebug('PlayerMonitor', 'Video player mutation observer started.');
    }

    function triggerReload(reason) {
        if (!ENABLE_AUTO_RELOAD) return;
        const now = Date.now();
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS || reloadCount >= MAX_RELOADS_PER_SESSION) {
            logWarn('ReloadTrigger', `Reload skipped: ${reason} (cooldown or max reloads reached)`);
            return;
        }
        lastReloadTimestamp = now;
        reloadCount++;
        logCoreDebug('ReloadTrigger', `Reloading page: ${reason}`);
        unsafeWindow.location.reload();
    }

    function startErrorScreenObserver() {
        if (!ENABLE_AUTO_RELOAD || errorScreenObserver) return;
        errorScreenObserver = new MutationObserver(() => {
            if (document.querySelector('[data-a-target="player-error-screen"]')) {
                logError('ErrorScreenObserver', 'Twitch error screen detected. Reloading.');
                triggerReload('Detected player error screen');
            }
        });
        errorScreenObserver.observe(document.body, { childList: true, subtree: true });
        logCoreDebug('ErrorScreenObserver', 'Observer for player error screen started.');
    }

    function initializeScript() {
        injectCSS();
        hookQualitySettings();
        installHooks();
        removeDOMAdElements(AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST);
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