// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      19.2.3
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

    const SCRIPT_VERSION = '19.2.3';
    const INJECT_INTO_WORKERS = GM_getValue('TT sprechen Sie Deutsch? V_AdBlock_InjectWorkers', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true);
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const BLOCK_NATIVE_ADS_SCRIPT = GM_getValue('TTV_AdBlock_BlockNatScript', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true);
    const HIDE_COOKIE_BANNER = GM_getValue('TTV_AdBlock_HideCookieBanner', true);
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true);
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', false);
    const LOG_WORKER_INJECTION_DEBUG = GM_getValue('TTV_AdBlock_Debug_WorkerInject', false);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_Debug_PlayerMon', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', false);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', false);
    const LOG_NETWORK_BLOCKING_DEBUG = GM_getValue('TTV_AdBlock_Debug_NetBlock', false);
    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '2,3,4,9,10,403,1000,3000,4000,5000,6001');
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 20000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 45000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 30000);
    const VISIBILITY_RESUME_DELAY_MS = GM_getValue('TTV_AdBlock_VisResumeDelayMs', 1500);
    const WORKER_PING_INTERVAL_MS = GM_getValue('TTV_AdBlock_WorkerPingIntervalMs', 20000);
    const USE_REGEX_M3U8_CLEANING = GM_getValue('TTV_AdBlock_UseRegexM3U8', true);
    const AGGRESSIVE_GQL_SCAN = GM_getValue('TTV_AdBlock_AggressiveGQLScan', false);
    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const GQL_OPERATIONS_TO_SKIP_MODIFICATION = new Set(['PlaybackAccessToken', 'PlaybackAccessToken_Template', 'ChannelPointsContext', 'ViewerPoints', 'CommunityPointsSettings', 'ClaimCommunityPoints', 'CreateCommunityPointsReward', 'UpdateCommunityPointsReward', 'DeleteCommunityPointsReward', 'UpdateCommunityPointsSettings', 'CustomRewardRedemption', 'RedeemCommunityPointsCustomReward', 'RewardCenter', 'ChannelPointsAutomaticRewards', 'predictions', 'polls', 'UserFollows', 'VideoComments', 'ChatHighlights', 'VideoPreviewCard__VideoHover', 'UseLive', 'UseBrowseQueries', 'ViewerCardModLogsMessagesBySender', 'ComscoreStreamingQuery', 'StreamTags', 'StreamMetadata', 'VideoMetadata', 'ChannelPage_GetChannelStat', 'Chat_Userlookup', 'RealtimeStreamTagList_Tags', 'UserModStatus', 'FollowButton_FollowUser', 'FollowButton_UnfollowUser', 'Clips_Popular_ miesiąc', 'PersonalSections', 'RecommendedChannels', 'FrontPage', 'GetHomePageRecommendations', 'VideoComments_SentMessage', 'UseUserReportModal', 'ReportUserModal_UserReport', 'UserLeaveSquad', 'UserModal_GetFollowersForUser', 'UserModal_GetFollowedChannelsForUser', 'PlayerOverlaysContext', 'MessageBufferPresences', 'RecentChatMessages', 'ChatRoomState', 'VideoPreviewCard__VideoPlayer', 'ChannelPage_ChannelInfoBar_User', 'ChannelPage_SetSessionStatus', 'UseSquadStream', 'OnsiteNotifications', 'OnsiteWaffleNotifications', 'UserActions', 'BitsLeaderboard', 'ChannelLeaderboards', 'PrimeOffer', 'ChannelExtensions', 'ExtensionsForChannel', 'DropCampaignDetails', 'DropsDashboardPage_GetDropCampaigns', 'StreamEventsSlice', 'StreamElementsService_GetOverlays', 'StreamElementsService_GetTheme', 'ViewerBounties', 'GiftASubModal_UserGiftEligibility', 'WebGiftSubButton_SubGiftEligibility', 'CharityCampaign', 'GoalCreateDialog_User', 'GoalsManageOverlay_ChannelGoals', 'PollCreateDialog_User', 'MultiMonthDiscount', 'FreeSubBenefit', 'SubPrices', 'SubscriptionProductBenefitMessages', 'UserCurrentSubscriptionsContext', 'VideoPreviewCard_VideoMarkers', 'UpdateVideoMutation', 'DeleteVideos', 'HostModeTargetDetails', 'StreamInformation', 'VideoPlayer_StreamAnalytics', 'VideoPlayer_VideoSourceManager', 'VideoPlayerStreamMetadata', 'VideoPlayerStatusOverlayChannel']);
    const AD_SIGNIFIER_DATERANGE_ATTR = 'twitch-stitched-ad';
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = ['ADVERTISING', 'ADVERTISEMENT', 'PROMOTIONAL', 'SPONSORED', 'COMMERCIALBREAK'];
    const AD_DATERANGE_REGEX = USE_REGEX_M3U8_CLEANING ? /CLASS="(?:TWITCH-)?STITCHED-AD"/i : null;
    let AD_URL_KEYWORDS_BLOCK = ['amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com', 'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org', 'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com', 'scorecardresearch.com', 'yandex.ru/clck/', 'omnitagjs', 'omnitag', 'innovid.com', 'eyewonder.com', 'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com', 'flashtalking.com', 'contextual.media.net', 'advertising.com', 'adform.net', 'freewheel.tv', 'stickyadstv.com', 'tremorhub.com', 'aniview.com', 'criteo.com', 'adition.com', 'teads.tv', 'undertone.com', 'vidible.tv', 'vidoomy.com', 'appnexus.com', '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads'];
    if (BLOCK_NATIVE_ADS_SCRIPT) AD_URL_KEYWORDS_BLOCK.push('nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com');
    const PLAYER_SELECTORS_IMPROVED = ['div[data-a-target="video-player"] video[playsinline]', '.video-player video[playsinline]', 'div[data-a-player-state] video', 'main video[playsinline][src]', 'video.persistent-player', 'video[class*="video-player"]', 'video[class*="player-video"]', 'video[src]', 'video'];
    const AD_OVERLAY_SELECTORS_CSS = ['.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]', 'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]', '.player-ad-notice', '.ad-interrupt-screen', 'div[data-test-selector="ad-banner-default-text-area"]', 'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container', '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]', '[data-test-selector="sad-overlay"]', 'div[class*="video-ad-label"]', '.player-ad-overlay', 'div[class*="advertisement"]', 'div[class*="-ad-"]'];
    const COOKIE_BANNER_SELECTOR = '.consent-banner';
    const AD_DOM_ELEMENT_SELECTORS_TO_REMOVE = ['div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]', 'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]', 'iframe[src*="imasdk.googleapis.com"]', '.player-overlay-ad', '.tw-player-ad-overlay', '.video-ad-display', 'div[data-ad-placeholder="true"]', '[data-a-target="video-ad-countdown-container"]', '.promoted-content-card', 'div[class*="--ad-banner"]', 'div[data-ad-unit]', 'div[class*="player-ads"]', 'div[data-ad-boundary]'];
    if (HIDE_COOKIE_BANNER) AD_DOM_ELEMENT_SELECTORS_TO_REMOVE.push(COOKIE_BANNER_SELECTOR);
    const AD_DOM_PARENT_INDICATOR_SELECTORS = ['.video-player', '.persistent-player', 'div[data-a-target="video-player-layout"]', 'main', 'div[class*="player-container"]'];
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
    let reloadCount = 0;
    let cachedQualityValue = null;
    let visibilityResumeTimer = null;
    let playerFinderObserver = null;
    let adRemovalObserver = null;
    let workerPingIntervalId = null;
    const RELOAD_ON_ERROR_CODES = RELOAD_ON_ERROR_CODES_RAW.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const MAX_RELOADS_PER_SESSION = 5;
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
    function logModuleTrace(moduleFlag, source, message, ...args) { if (moduleFlag) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg)); }

    let cssToInject = '';
    if (HIDE_AD_OVERLAY_ELEMENTS) cssToInject += `${AD_OVERLAY_SELECTORS_CSS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }\n`;
    if (HIDE_COOKIE_BANNER) cssToInject += `${COOKIE_BANNER_SELECTOR} { display: none !important; }\n`;
    if (cssToInject) try { GM_addStyle(cssToInject); } catch (e) { logError('CSSInject', 'CSS apply failed:', e); }

    function setQualitySettings(forceCheck = false) {
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue;
            }
            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                const valueAfterSet = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = valueAfterSet;
            }
        } catch (e) {
            logError('QualitySet', 'Set quality error:', e);
            cachedQualityValue = null;
        }
    }

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

    function getWorkerInjectionCode() {
        return (function() {
            const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION_WORKER_REPLACE}';
            const CORE_DEBUG_LOGGING_WORKER = '${CORE_LOGGING_LOGGINGWORKER_REPLACE}';
            const LOG_M3U8_CLEANING_WORKER = '${worker_LOG_M3U8_CLEANING_WORKER_REPLACE}';
            const LOG_PREFIX_WORKER_BASE = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';
            let hooksSuccessfullySignaled = false;
            function workerLogError(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.error(LOG_PREFIX_WORKER_BASE + ' ERROR:', message, ...args); }
            function workerLogWarn(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.warn(LOG_PREFIX_WORKER_BASE + ' WARN:', message, ...args); }
            function workerLogCoreDebug(message, ...args) { if (CORE_DEBUG_LOGGING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' DEBUG:', message, ...args); }
            function workerLogM3U8Trace(message, ...args) { if (LOG_M3U8_CLEANING_WORKER) console.debug(LOG_PREFIX_WORKER_BASE + ' [M3U8 Relay] TRACE:', message, ...args); }
            function installWorkerFetchHook() {
                if (typeof self.fetch !== 'function') return false;
                if (self.fetch.hooked_by_adblock_ult) return true;
                const workerRealFetch = self.fetch;
                self.fetch = async function(input, init) {
                    let requestUrl = (input instanceof Request) ? input.url : String(input);
                    let method = ((input instanceof Request) ? input.method : (init?.method || 'GET')).toUpperCase();
                    const lowerCaseUrl = requestUrl.toLowerCase();
                    const urlShort = requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl;
                    const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort.substring(0,70);
                    const isM3U8Request = (lowerCaseUrl.endsWith('.m3u8') || (init?.headers?.['Accept'] || '').toLowerCase().includes('mpegurl')) && (lowerCaseUrl.includes('usher.ttvnw.net') || lowerCaseUrl.includes('.m3u8'));
                    if (method === 'GET' && isM3U8Request && requestUrl.includes('usher.ttvnw.net')) {
                        return new Promise((resolveWorkerPromise, rejectWorkerPromise) => {
                            const messageId = 'm3u8_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                            const onMessageFromMain = (event) => {
                                if (event.data && event.data.type === 'ADBLOCK_M3U8_RESPONSE' && event.data.id === messageId) {
                                    self.removeEventListener('message', onMessageFromMain);
                                    if (event.data.error) {
                                        rejectWorkerPromise(new TypeError(event.data.error));
                                    } else {
                                        const responseHeaders = new Headers();
                                        if(event.data.headers) { for(const key in event.data.headers) { responseHeaders.append(key, event.data.headers[key]); } }
                                        if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
                                        if (event.data.cleanedText === undefined) {
                                            rejectWorkerPromise(new TypeError('Undefined M3U8 content'));
                                            return;
                                        }
                                        resolveWorkerPromise(new Response(event.data.cleanedText, { status: event.data.status, statusText: event.data.statusText, headers: responseHeaders }));
                                    }
                                }
                            };
                            self.addEventListener('message', onMessageFromMain);
                            try {
                                let headersArray = [];
                                if (init && init.headers) {
                                    if (init.headers instanceof Headers) headersArray = Array.from(init.headers.entries());
                                    else if (typeof init.headers === 'object') headersArray = Object.entries(init.headers);
                                }
                                self.postMessage({ type: 'ADBLOCK_FETCH_M3U8_REQUEST', url: requestUrl, initDetails: { headers: headersArray }, id: messageId });
                            } catch (e) {
                                self.removeEventListener('message', onMessageFromMain);
                                rejectWorkerPromise(e);
                            }
                        });
                    }
                    return workerRealFetch(input, init);
                };
                self.fetch.hooked_by_adblock_ult = true;
                return true;
            }
            function attemptHookInstallationAndSignal() {
                if (installWorkerFetchHook()) {
                    try {
                        self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: hooksSuccessfullySignaled ? 'resignal_after_eval' : 'initial_signal' });
                        hooksSuccessfullySignaled = true;
                        return true;
                    } catch(e) { return false; }
                } else {
                    try { self.postMessage({ type: 'ADBLOCK_WORKER_HOOKS_READY', method: 'signal_failed_hook_install' }); } catch(e) {}
                    return false;
                }
            }
            self.addEventListener('message', function(e) {
                if (e.data?.type === 'PING_WORKER_ADBLOCK') {
                    self.postMessage({ type: 'PONG_WORKER_ADBLOCK', workerLabel: self.name || 'unknown_worker_name' });
                } else if (e.data?.type === 'EVAL_ADBLOCK_CODE') {
                    attemptHookInstallationAndSignal();
                }
            });
            attemptHookInstallationAndSignal();
        }).toString()
            .replace(/\${SCRIPT_VERSION_WORKER_REPLACE}/g, SCRIPT_VERSION)
            .replace(/\${CORE_DEBUG_LOGGING_WORKER_REPLACE}/g, String(CORE_DEBUG_LOGGING))
            .replace(/\${LOG_M3U8_CLEANING_WORKER_REPLACE}/g, String(LOG_M3U8_CLEANING_DEBUG))
            .slice(14, -2);
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
                } else if (AGGRESSIVE_GQL_SCAN && opData.data && typeof opData.data === 'object') {
                    let aggressivelyModified = false;
                    function scanAndNullify(obj, path = '') {
                        for (const key in obj) {
                            const currentPath = path ? `${path}.${key}` : key;
                            if (typeof key === 'string' && (key.toLowerCase().includes('ad') || key.toLowerCase().includes('advertisement') || key.toLowerCase().includes('promo'))) {
                                if (obj[key] !== null && !(Array.isArray(obj[key]) && obj[key].length === 0)) {
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
        let isKnownTwitchDomain = false;
        let requestHostname = '';
        try {
            requestHostname = new URL(requestUrl).hostname;
            if (TWITCH_HOST_REGEX.test(requestHostname)) isKnownTwitchDomain = true;
        } catch(e) {}
        let isWhitelistedTwitchContentStream = isKnownTwitchDomain && (TWITCH_VIDEO_SEGMENT_PATH_REGEX.test(lowerCaseUrl) || TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl));
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
            if (isBlockedByKeyword && !lowerCaseUrl.includes('.ts')) {
                logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'FetchBlock', `Blocked fetch request to ${urlShortForLog} (Keyword: ${blockingKeyword})`);
                return Promise.resolve(new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock Ultimate (Keyword: ${blockingKeyword})` }));
            }
        }
        const isM3U8RequestToUsher = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && lowerCaseUrl.includes('usher.ttvnw.net');
        if (isM3U8RequestToUsher) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: requestUrl, headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined, responseType: "text",
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound, linesRemoved, errorDuringClean } = parseAndCleanM3U8(response.responseText, requestUrl);
                            const newHeaders = new Headers();
                            if (response.responseHeaders) response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => { const parts = line.split(': ', 2); if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') newHeaders.append(parts[0], parts[1]); });
                            if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'FetchM3U8', `Processed M3U8 for ${urlShortForLog}: adsFound=${adsFound}, linesRemoved=${linesRemoved}`);
                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders }));
                        } else {
                            logError('FetchM3U8', `GM_xmlhttpRequest failed for ${urlShortForLog}: ${response.statusText || response.status}`);
                            reject(new TypeError(`GM_xmlhttpRequest failed: ${response.statusText || response.status}`));
                        }
                    },
                    onerror: function(error) {
                        logError('FetchM3U8', `Network error for ${urlShortForLog}`);
                        reject(new TypeError('Network error'));
                    },
                    ontimeout: function() {
                        logError('FetchM3U8', `Timeout for ${urlShortForLog}`);
                        reject(new TypeError('Timeout'));
                    }
                });
            });
        }
        try {
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
        } catch (error) {
            logError('FetchOverride', `Error fetching ${urlShortForLog}:`, error);
            throw error;
        }
    }

    const xhrRequestData = new WeakMap();
    function xhrOpenOverride(method, url) {
        const urlString = String(url);
        const lowerCaseUrl = urlString.toLowerCase();
        const isGqlRequest = lowerCaseUrl.startsWith(GQL_URL);
        const urlShortForLog = (urlString.includes('?') ? urlString.substring(0, urlString.indexOf('?')) : urlString).substring(0,120);
        let blocked = false;
        let blockingKeyword = null;
        let isKnownTwitchDomain = false;
        let requestHostname = '';
        try { requestHostname = new URL(urlString).hostname; if (TWITCH_HOST_REGEX.test(requestHostname)) isKnownTwitchDomain = true; } catch(e) {}
        let isWhitelistedTwitchContentStream = isKnownTwitchDomain && (TWITCH_VIDEO_SEGMENT_PATH_REGEX.test(lowerCaseUrl) || TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl));
        if (!isGqlRequest) {
            if (!isKnownTwitchDomain || (isKnownTwitchDomain && !isWhitelistedTwitchContentStream)) {
                for (const keyword of AD_URL_KEYWORDS_BLOCK) {
                    if (lowerCaseUrl.includes(keyword.toLowerCase())) {
                        if (keyword === 'nat.min.js' && !BLOCK_NATIVE_ADS_SCRIPT) continue;
                        if (lowerCaseUrl.includes('.ts')) continue; // Allow .ts segments to prevent stream interruptions
                        blocked = true;
                        blockingKeyword = keyword;
                        break;
                    }
                }
            }
        }
        const isM3U8RequestToUsher = method.toUpperCase() === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl) && urlString.includes('usher.ttvnw.net');
        xhrRequestData.set(this, { method: method.toUpperCase(), url: urlString, urlShort: urlShortForLog, blocked, isGql: isGqlRequest, isM3U8: isM3U8RequestToUsher, blockingKeyword });
        if ((isGqlRequest && MODIFY_GQL_RESPONSE) || isM3U8RequestToUsher) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const reqData = xhrRequestData.get(this);
                    if (reqData) {
                        const originalResponseText = this.responseText;
                        if (typeof originalResponseText !== 'string' || originalResponseText.length === 0) return;
                        let modifiedText = originalResponseText;
                        let modificationPerformed = false;
                        if (reqData.isGql && MODIFY_GQL_RESPONSE) {
                            const gqlModified = modifyGqlResponse(originalResponseText, reqData.url);
                            if (gqlModified !== originalResponseText) { modifiedText = gqlModified; modificationPerformed = true; }
                        } else if (reqData.isM3U8) {
                            const { cleanedText, adsFound, linesRemoved, errorDuringClean } = parseAndCleanM3U8(originalResponseText, reqData.url);
                            if (!errorDuringClean && adsFound) { modifiedText = cleanedText; modificationPerformed = true; }
                        }
                        if (modificationPerformed) xhrRequestData.set(this, { ...reqData, modifiedResponse: modifiedText });
                    }
                }
            }, { once: true, passive: true });
        }
        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); } catch (error) { throw error; }
        } else {
            logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'XHROpenBlock', `Blocked XHR to ${urlShortForLog} (Keyword: ${blockingKeyword})`);
            try { originalXhrOpen.call(this, method, "about:blank?blocked=true", ...Array.from(arguments).slice(2)); } catch(e) {}
        }
    }

    function xhrSendOverride(data) {
        const requestInfo = xhrRequestData.get(this);
        if (!requestInfo) {
            try { return originalXhrSend.apply(this, arguments); } catch(e){ throw e; }
        }
        const { method, urlShort, blocked, blockingKeyword } = requestInfo;
        if (blocked) {
            try {
                Object.defineProperty(this, 'readyState', { value: 4, writable: true, configurable: true }); this.readyState = 4;
                Object.defineProperty(this, 'status', { value: 0, writable: true, configurable: true }); this.status = 0;
                Object.defineProperty(this, 'statusText', { value: `Blocked by TTV AdBlock Ultimate (Keyword: ${blockingKeyword})`, writable: true, configurable: true }); this.statusText = `Blocked by TTV AdBlock Ultimate (Keyword: ${blockingKeyword})`;
                Object.defineProperty(this, 'readyState', { writable: false }); Object.defineProperty(this, 'status', { writable: false }); Object.defineProperty(this, 'statusText', { writable: false });
            } catch (e) {}
            if (typeof this.onerror === 'function') { try { this.onerror(new ProgressEvent('error')); } catch(e) {} }
            if (typeof this.onloadend === 'function') { try { this.onloadend(new ProgressEvent('loadend')); } catch (e) {} }
            return;
        }
        try { return originalXhrSend.apply(this, arguments); } catch (error) { throw error; }
    }

    function hookXhrGetters() {
        if (MODIFY_GQL_RESPONSE || true) {
            if (originalXhrResponseGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.modifiedResponse !== null && reqData?.modifiedResponse !== undefined && ((reqData.isGql && MODIFY_GQL_RESPONSE) || reqData.isM3U8) && (this.responseType === '' || this.responseType === 'text')) {
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseGetter.get.call(this); } catch (getterError) { return null; }
                    }, configurable: true
                });
            }
            if (originalXhrResponseTextGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.modifiedResponse !== null && reqData?.modifiedResponse !== undefined &&
                            ((reqData.isGql && MODIFY_GQL_RESPONSE) || reqData.isM3U8)) {
                            return reqData.modifiedResponse;
                        }
                        try {
                            return originalXhrResponseTextGetter.get.call(this);
                        } catch (getterError) {
                            return "";
                        }
                    }, configurable: true
                });
            }
        }
    }

    function handleMessageFromWorkerGlobal(event) {
        const msgData = event.data;
        if (msgData && typeof msgData.type === 'string') {
            const workerInstance = event.source;
            let workerLabel = msgData.workerLabel || 'UnknownWorker';
            if (workerInstance) { for (const [label, state] of hookedWorkers.entries()) { if (state.instance === workerInstance) { workerLabel = label; break; } } }

            if (msgData.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                const workerState = hookedWorkers.get(workerLabel) || Array.from(hookedWorkers.values()).find(s => s.instance === workerInstance);
                if (workerState) workerState.hooksReady = true;
                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerHook', `Worker hooks ready: ${workerLabel}`);
            } else if (msgData.type === 'PONG_WORKER_ADBLOCK') {
                const workerState = hookedWorkers.get(workerLabel);
                if (workerState) workerState.lastPong = Date.now();
                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerPing', `Received pong from ${workerLabel}`);
            } else if (msgData.type === 'ADBLOCK_FETCH_M3U8_REQUEST') {
                const { url, initDetails, id } = msgData;
                if (!workerInstance) return;
                GM_xmlhttpRequest({
                    method: "GET", url: url, headers: initDetails?.headers ? Object.fromEntries(initDetails.headers) : undefined, responseType: "text",
                    onload: function(response) {
                        let postData = { type: 'ADBLOCK_M3U8_RESPONSE', id: id };
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound, errorDuringClean } = parseAndCleanM3U8(response.responseText, url);
                            postData.cleanedText = cleanedText; postData.status = response.status; postData.statusText = response.statusText;
                            const responseHeadersObj = {};
                            if (response.responseHeaders) response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => { const parts = line.split(': ', 2); if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') responseHeadersObj[parts[0]] = parts[1]; });
                            postData.headers = responseHeadersObj;
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'WorkerM3U8', `Processed M3U8 for ${url}: adsFound=${adsFound}`);
                        } else {
                            postData.error = `Failed: ${response.status} ${response.statusText}`; postData.status = response.status; postData.statusText = response.statusText;
                            logError('WorkerM3U8', `Worker M3U8 request failed for ${url}: ${response.statusText}`);
                        }
                        try { workerInstance.postMessage(postData); } catch (e) {
                            logError('WorkerM3U8', `Failed to post message to worker: ${e.message}`);
                        }
                    },
                    onerror: function(error) {
                        try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Network error', status: 0, statusText: 'Network Error' }); } catch (e) {}
                        logError('WorkerM3U8', `Network error in worker M3U8 request for ${url}`);
                    },
                    ontimeout: function() {
                        try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Timeout', status: 0, statusText: 'Timeout' }); } catch (e) {}
                        logError('WorkerM3U8', `Timeout in worker M3U8 request for ${url}`);
                    }
                });
            }
        }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance.addEventListener('error', (e) => {
            logError('WorkerError', `Worker ${label} error: ${e.message}`);
        }, { passive: true });
        workerInstance._listenersAddedByAdblock = true;
    }

    function hookWorkerConstructor() {
        if (!INJECT_INTO_WORKERS || unsafeWindow.Worker?.hooked_by_adblock_ult || typeof OriginalWorker === 'undefined') return;
        workerHookAttempted = true;
        unsafeWindow.Worker = class HookedWorker extends OriginalWorker {
            constructor(scriptURL, options) {
                let urlString = (scriptURL instanceof URL) ? scriptURL.href : String(scriptURL);
                let isBlobURL = urlString.startsWith('blob:');
                const randomId = Math.random().toString(36).substr(2, 5);
                let workerLabel = isBlobURL ? `blob-${randomId}:${urlString.substring(5, 35)}...` : `${(urlString.split(/[0-9]/)[0].split('/').pop() || urlString.substring(0, 40))}-${randomId}`;
                let isIVSWorker = workerLabel.includes('amazon-ivs-wasmworker') || workerLabel.includes('ivs-wasmworker');
                if(isIVSWorker) workerLabel += " (IVS)";
                let newWorkerInstance;
                try {
                    newWorkerInstance = super(scriptURL, options);
                    newWorkerInstance._workerLabel = workerLabel; newWorkerInstance._createdAt = Date.now();
                    hookedWorkers.set(workerLabel, { instance: newWorkerInstance, lastPing: 0, lastPong: Date.now(), hooksReady: false, url: urlString, isBlob: isBlobURL, isIVS: isIVSWorker });
                    addWorkerMessageListeners(newWorkerInstance, workerLabel);
                    if (!isBlobURL && !isIVSWorker) {
                        setTimeout(() => {
                            const workerState = hookedWorkers.get(workerLabel);
                            if (workerState && !workerState.hooksReady) {
                                try { const codeToInject = getWorkerInjectionCode(); newWorkerInstance.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: codeToInject }); } catch(e) {
                                    logError('WorkerHook', `Failed to inject code into worker ${workerLabel}: ${e.message}`);
                                }
                            }
                        }, 300);
                    }
                } catch (constructorError) {
                    logError('WorkerHook', `Worker constructor error for ${workerLabel}: ${constructorError.message}`);
                    throw constructorError;
                }
                return newWorkerInstance;
            }
        };
        try { Object.keys(OriginalWorker).forEach(key => { if (!unsafeWindow.Worker.hasOwnProperty(key)) try { unsafeWindow.Worker[key] = OriginalWorker[key]; } catch(e){} }); Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker); } catch (e) {}
        unsafeWindow.Worker.hooked_by_adblock_ult = true;
        unsafeWindow.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true });
        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerHook', 'Worker constructor hooked');
    }

    function startWorkerPinger() {
        if (workerPingIntervalId || !INJECT_INTO_WORKERS || WORKER_PING_INTERVAL_MS <= 0) return;
        workerPingIntervalId = setInterval(() => {
            const now = Date.now();
            if (hookedWorkers.size === 0 && !LOG_WORKER_INJECTION_DEBUG) return;
            hookedWorkers.forEach((state, label) => {
                try {
                    if (state.instance && typeof state.instance.postMessage === 'function') {
                        let shouldPing = false;
                        if (state.hooksReady) shouldPing = true;
                        else if (!state.isBlob && !state.isIVS) {
                            const timeSinceCreation = now - (state.instance._createdAt || state.lastPing || now);
                            if (timeSinceCreation > WORKER_PING_INTERVAL_MS * 1.5) shouldPing = true;
                        }
                        if (shouldPing) {
                            if (state.lastPing > 0 && state.lastPong < state.lastPing && (now - state.lastPing > WORKER_PING_INTERVAL_MS * 2.5)) {
                                if (!state.isIVS && !state.isBlob) { try { state.instance.terminate(); } catch(e){} hookedWorkers.delete(label); }
                                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerPing', `Terminated unresponsive worker ${label}`);
                                return;
                            }
                            state.instance.postMessage({ type: 'PING_WORKER_ADBLOCK' }); state.lastPing = now;
                            logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerPing', `Sent ping to ${label}`);
                        }
                    } else { hookedWorkers.delete(label); }
                } catch (e) { if (e.message.includes("terminated") || e.message.includes("detached")) hookedWorkers.delete(label); }
            });
        }, WORKER_PING_INTERVAL_MS);
    }

    function stopWorkerPinger() {
        if (workerPingIntervalId) { clearInterval(workerPingIntervalId); workerPingIntervalId = null; }
    }

    function installHooks() {
        if (hooksInstalledMain) return;
        try { unsafeWindow.fetch = fetchOverride; } catch (e) { if (originalFetch) unsafeWindow.fetch = originalFetch; logError('HookInstall', 'Failed to hook fetch:', e); }
        try { unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride; unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride; hookXhrGetters(); } catch (e) { 
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen; 
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend; 
            if (originalXhrResponseGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', originalXhrResponseGetter); } catch(revertErr) {} 
            if (originalXhrResponseTextGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', originalXhrResponseTextGetter); } catch (revertErr) {} 
            logError('HookInstall', 'Failed to hook XHR:', e);
        }
        if (INJECT_INTO_WORKERS) try { hookWorkerConstructor(); } catch (e) { if (OriginalWorker) unsafeWindow.Worker = OriginalWorker; logError('HookInstall', 'Failed to hook Worker:', e); }
        else workerHookAttempted = false;
        hooksInstalledMain = true;
        logCoreDebug('HookInstall', 'Main hooks installed');
    }

    function removeDOMAdElements(contextNode = document) {
        if (!ATTEMPT_DOM_AD_REMOVAL || !contextNode || typeof contextNode.querySelectorAll !== 'function') return;
        let removedCount = 0;
        AD_DOM_ELEMENT_SELECTORS_TO_REMOVE.forEach(selector => {
            if (selector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) return;
            try {
                const elements = contextNode.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el && el.parentNode && !el.querySelector('video') && !el.closest(PLAYER_SELECTORS_IMPROVED.join(','))) {
                        try { el.parentNode.removeChild(el); removedCount++; } catch (removeError) {}
                    }
                });
            } catch (queryError) {}
        });
        if (removedCount > 0) logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'DOMAdRemoval', `Removed ${removedCount} ad elements`);
    }

    function startAdRemovalObserver() {
        if (!ATTEMPT_DOM_AD_REMOVAL || adRemovalObserver) return;
        let observedNode = document.body;
        for (const selector of AD_DOM_PARENT_INDICATOR_SELECTORS) { const parentNode = document.querySelector(selector); if (parentNode) { observedNode = parentNode; break; } }
        if (!observedNode) observedNode = document.body || document.documentElement;
        if (!observedNode) { setTimeout(startAdRemovalObserver, 1000); return; }
        adRemovalObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) mutation.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) removeDOMAdElements(node); });
            });
        });
        try { adRemovalObserver.observe(observedNode, { childList: true, subtree: true }); } catch (e) { adRemovalObserver = null; logError('AdRemovalObserver', 'Failed to start observer:', e); }
    }

    function findVideoElement() {
        if (videoElement && !videoElement.paused && document.contains(videoElement)) return videoElement;
        for (const selector of PLAYER_SELECTORS_IMPROVED) {
            try {
                const foundElement = document.querySelector(selector);
                if (foundElement && foundElement.tagName.toLowerCase() === 'video' && document.contains(foundElement)) {
                    videoElement = foundElement;
                    logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'VideoFinder', `Found video element with selector: ${selector}`);
                    return videoElement;
                }
            } catch (e) {}
        }
        videoElement = null;
        return null;
    }

    function startPlayerFinderObserver() {
        if (playerFinderObserver) return;
        playerFinderObserver = new MutationObserver(() => {
            if (!videoElement) {
                const newVideo = findVideoElement();
                if (newVideo) setupVideoPlayerMonitor(newVideo);
            }
        });
        try { playerFinderObserver.observe(document.documentElement || document.body, { childList: true, subtree: true }); } catch (e) { playerFinderObserver = null; logError('PlayerFinderObserver', 'Failed to start observer:', e); }
    }

    function checkPlayerState() {
        const now = performance.now();
        if (!videoElement || !document.contains(videoElement)) { videoElement = null; return false; }
        const isPlaying = !videoElement.paused && videoElement.currentTime > 0;
        let bufferedEnd = 0;
        for (let i = 0; i < videoElement.buffered.length; i++) {
            if (videoElement.currentTime >= videoElement.buffered.start(i) && videoElement.currentTime <= videoElement.buffered.end(i)) {
                bufferedEnd = videoElement.buffered.end(i);
                break;
            }
        }
        const bufferAhead = bufferedEnd - videoElement.currentTime;
        if (isPlaying && videoElement.currentTime === lastKnownVideoTime && lastKnownVideoTime > 0) {
            if (isWaitingForDataTimestamp && (now - isWaitingForDataTimestamp) > RELOAD_BUFFERING_THRESHOLD_MS && bufferAhead < 5) {
                triggerReload('Player stuck, insufficient buffer');
            }
        } else if (!isPlaying && !videoElement.paused && isWaitingForDataTimestamp && (now - isWaitingForDataTimestamp) > RELOAD_STALL_THRESHOLD_MS) {
            triggerReload('Player waiting for data');
        } else {
            lastKnownVideoTime = videoElement.currentTime;
            isWaitingForDataTimestamp = 0;
        }
        return isPlaying;
    }

    function handleErrorEvent(event) {
        if (!event.target || !event.target.error) return;
        const errorCode = event.target.error.code;
        if (RELOAD_ON_ERROR_CODES.includes(errorCode)) {
            logError('PlayerMonitor', `Triggering reload due to error code ${errorCode}`);
            triggerReload(`Player error code ${errorCode}`);
        }
    }

    function handleWaitingEvent() {
        if (!isWaitingForDataTimestamp) {
            isWaitingForDataTimestamp = performance.now();
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Video waiting event triggered');
        }
    }

    function handleTimeUpdateEvent() {
        if (videoElement) {
            lastKnownVideoTime = videoElement.currentTime;
            lastVideoTimeUpdateTimestamp = performance.now();
            isWaitingForDataTimestamp = 0;
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', `Time update: ${lastKnownVideoTime}`);
        }
    }

    function setupVideoPlayerMonitor(videoEl) {
        if (!videoEl || videoEl._adblockMonitored) return;
        try {
            videoEl.addEventListener('error', handleErrorEvent, { passive: true });
            videoEl.addEventListener('waiting', handleWaitingEvent, { passive: true });
            videoEl.addEventListener('timeupdate', handleTimeUpdateEvent, { passive: true });
            videoEl._adblockMonitored = true;
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Video player monitor setup');
        } catch (e) {
            logError('PlayerMonitor', 'Failed to setup video player monitor:', e);
        }
    }

    function startPlayerMonitor() {
        if (playerMonitorIntervalId || !ENABLE_AUTO_RELOAD) return;
        playerMonitorIntervalId = setInterval(() => {
            if (document.hidden) return;
            if (!videoElement || !document.contains(videoElement)) {
                videoElement = findVideoElement();
                if (videoElement) setupVideoPlayerMonitor(videoElement);
            }
            if (videoElement) checkPlayerState();
        }, 1000);
        startPlayerFinderObserver();
        logCoreDebug('PlayerMonitor', 'Started player monitor');
    }

    function stopPlayerMonitor() {
        if (playerMonitorIntervalId) { clearInterval(playerMonitorIntervalId); playerMonitorIntervalId = null; }
        if (playerFinderObserver) { playerFinderObserver.disconnect(); playerFinderObserver = null; }
        logCoreDebug('PlayerMonitor', 'Stopped player monitor');
    }

    function triggerReload(reason) {
        const now = Date.now();
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS || reloadCount >= MAX_RELOADS_PER_SESSION) {
            logWarn('ReloadTrigger', `Reload skipped: ${reason} (cooldown or max reloads reached)`);
            return;
        }
        if (reloadTimeoutId) { clearTimeout(reloadTimeoutId); reloadTimeoutId = null; }
        reloadTimeoutId = setTimeout(() => {
            lastReloadTimestamp = now;
            reloadCount++;
            logCoreDebug('ReloadTrigger', `Reloading page: ${reason}`);
            try { window.location.reload(); } catch (e) {
                logError('ReloadTrigger', `Failed to reload: ${e.message}`);
            }
        }, 500);
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stopPlayerMonitor();
            stopWorkerPinger();
        } else {
            if (visibilityResumeTimer) clearTimeout(visibilityResumeTimer);
            visibilityResumeTimer = setTimeout(() => {
                startPlayerMonitor();
                startWorkerPinger();
                setQualitySettings();
            }, VISIBILITY_RESUME_DELAY_MS);
        }
    }

    function initializeScript() {
        installHooks();
        startPlayerMonitor();
        startWorkerPinger();
        startAdRemovalObserver();
        setQualitySettings(true);
        try { document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true }); } catch (e) {
            logError('Initialize', 'Failed to add visibilitychange listener:', e);
        }
        removeDOMAdElements();
        logCoreDebug('Initialize', 'Script initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript, { once: true });
    } else {
        initializeScript();
    }
})();
