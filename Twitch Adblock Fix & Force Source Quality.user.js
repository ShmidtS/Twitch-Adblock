// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      26.0.5
// @description  Комплексная блокировка рекламы Twitch.
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

    // --- НАСТРОЙКИ СКРИПТА (можно изменить через меню Tampermonkey) ---
    const SCRIPT_VERSION = '26.0.5';
    const PROACTIVE_TOKEN_SWAP_ENABLED = GM_getValue('TTV_AdBlock_ProactiveTokenSwap', true);
    const ENABLE_MIDROLL_RECOVERY = GM_getValue('TTV_AdBlock_EnableMidrollRecovery', true);
    const FORCE_MAX_QUALITY_IN_BACKGROUND = GM_getValue('TTV_AdBlock_ForceMaxQuality', true);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true);
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true);
    const HIDE_COOKIE_BANNER = GM_getValue('TTV_AdBlock_HideCookieBanner', true);

    // --- НАСТРОЙКИ ОТЛАДКИ ---
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true);
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', false);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_Debug_PlayerMon', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', false);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', false);
    const LOG_NETWORK_BLOCKING_DEBUG = GM_getValue('TTV_AdBlock_Debug_NetBlock', false);
    const LOG_TOKEN_SWAP_DEBUG = GM_getValue('TTV_AdBlock_Debug_TokenSwap', false);

    // --- ПРОДВИНУТЫЕ НАСТРОЙКИ ---
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 15000);
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 15000);
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);
    const MAX_RELOADS_PER_SESSION = GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 5);
    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', "0,2,3,4,9,10,403,1000,2000,3000,4000,5000,6001,500,502,503,504");

    // --- КОНСТАНТЫ И ФИЛЬТРЫ ---
    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;

    const AD_URL_KEYWORDS_BLOCK = [
        'nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com',
        'adservice.google.com', 'doubleclick.net', 'googlesyndication.com',
        'pubads.g.doubleclick.net', 'adnxs.com', 'amazon-adsystem.com', 'taboola.com',
        'outbrain.com', 'taboolacdn.com', 'yieldmo.com', 'criteo.com', 'smartadserver.com',
        'rubiconproject.com', 'appier.net', 'inmobi.com', 'adform.net', 'ads.ttvnw.net',
        'adserver.ttvnw.net', 'beacon.ads.ttvnw.net', 'mraid.googleapis.com',
        'securepubads.g.doubleclick.net', 'googleads.g.doubleclick.net', 'twitchads.net',
        'ad.twitch.tv', 'analytics.twitch.tv', 'beacon.twist.tv', 'sentry.io',
        'ext-twitch.tv', 'supervisor.ext-twitch.tv'
    ];

    const AD_OVERLAY_SELECTORS_CSS = [
        'div[data-a-target="request-ad-block-disable-modal"]', '.video-player__ad-info-container',
        'span[data-a-target="video-ad-label"]', 'span[data-a-target="video-ad-countdown"]',
        'button[aria-label*="feedback for this Ad"]', '.player-ad-notice', '.ad-interrupt-screen',
        'div[data-test-selector="ad-banner-default-text-area"]', 'div[data-test-selector="ad-display-root"]',
        '.persistent-player__ad-container', '[data-a-target="advertisement-notice"]',
        'div[data-a-target="ax-overlay"]', '[data-test-selector="sad-overlay"]',
        'div[class*="video-ad-label"]', '.player-ad-overlay', 'div[class*="advertisement"]',
        'div[class*="-ad-"]', 'div[data-a-target="sad-overlay-container"]',
        'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]',
        'div[data-a-target*="ad-block-nag"]', 'div[data-test-selector*="ad-block-nag"]',
        'div[data-a-target*="disable-adblocker-modal"]', 'div[data-test-id="ad-break"]',
        '.ad-break-ui-container', '.ad-break-overlay', 'div[data-a-target="ad-break-countdown"]',
        'div[data-test-id="ad-break-countdown"]', 'div[data-a-target="ad-break-skip-button"]',
        'div[data-test-id="ad-break-skip-button"]', '[data-a-target="ad-banner"]',
        '[data-test-id="ad-overlay"]', '.promoted-content-card', '[data-ad-placeholder="true"]',
        '.video-ad-display__container', '[data-ad-overlay]'
    ];

    const AD_SIGNIFIER_DATERANGE_ATTR = "Twitch-Ad-Signal";
    const AD_DATERANGE_ATTRIBUTE_KEYWORDS = [
        "AD-ID=", "CUE-OUT", "SCTE35", "Twitch-Ad-Signal", "Twitch-Prefetch",
        "Twitch-Ad-Hide", "Twitch-Ads", "X-CUSTOM", "X-AD", "X-TWITCH-AD"
    ];

    const COOKIE_BANNER_SELECTOR = '.consent-banner';

    const AD_DOM_REMOVAL_SELECTOR_STRING = [
        ...AD_OVERLAY_SELECTORS_CSS,
        'div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]',
        'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]',
        'iframe[src*="imasdk.googleapis.com"]', '.player-overlay-ad', '.tw-player-ad-overlay',
        '.video-ad-display', 'div[data-ad-placeholder="true"]', '[data-a-target="video-ad-countdown-container"]',
        'div[class*="--ad-banner"]', 'div[data-ad-unit]', 'div[class*="player-ads"]', 'div[data-ad-boundary]',
        (HIDE_COOKIE_BANNER ? COOKIE_BANNER_SELECTOR : '')
    ].filter(Boolean).join(',');

    const GQL_AD_KEYWORDS_CHECK = /adFree|PlaybackAccessToken|clientAd|Interstitials/i;


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
    const PLAYER_CONTAINER_SELECTORS = ['div[data-a-target="video-player"]', '.video-player', 'div[data-a-player-state]', 'main', '.persistent-player'];

    let hooksInstalledMain = false;
    let adRemovalObserver = null;
    let errorScreenObserver = null;
    let videoPlayerMutationObserver = null;
    const RELOAD_ON_ERROR_CODES = RELOAD_ON_ERROR_CODES_RAW.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;
    let videoElement = null;
    const attachedListeners = new WeakMap();
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
        if (HIDE_COOKIE_BANNER && !AD_DOM_REMOVAL_SELECTOR_STRING.includes(COOKIE_BANNER_SELECTOR)) {
            cssToInject += `${COOKIE_BANNER_SELECTOR} { display: none !important; }\n`;
        }
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
        } else if (upperM3U8Text.includes("#EXT-X-ASSET:") || upperM3U8Text.includes("#EXT-X-CUE-OUT") || upperM3U8Text.includes("#EXT-X-TWITCH-AD-SIGNAL") || upperM3U8Text.includes("#EXT-X-SCTE35:") || upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:") || upperM3U8Text.includes("#EXT-X-TWITCH-AD-HIDE")) {
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
        url.searchParams.set('player_version', '1.20.0');
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
                cachedCleanToken = null;
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
                                        cleanedText = finalCleanedResult.cleanedText;
                                    }
                                } catch (e) {
                                    logError('MidrollRecovery', `(3/3) Mid-roll recovery for ${urlShortForLog} failed. Reverting to initial cleaning. Reason: ${e}`);
                                }
                            } else if (errorDuringClean) {
                                logWarn('FetchM3U8', `Initial M3U8 cleaning for ${urlShortForLog} resulted in an error (e.g. too few segments). Using original M3U8.`);
                                cleanedText = response.responseText;
                            }

                            const newHeaders = new Headers();
                            if (response.responseHeaders) response.responseHeaders.trim().split(/[\r\n]+/).forEach(line => { const parts = line.split(': ', 2); if (parts.length === 2 && parts[0].toLowerCase() !== 'content-length') newHeaders.append(parts[0], parts[1]); });
                            if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
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

            if (GQL_AD_KEYWORDS_CHECK.test(responseText)) {
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
                this.dispatchEvent(new Event('error'));
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
                        'status': { value: 0, configurable: true },
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
                    if (typeof originalResponseText === 'string' && GQL_AD_KEYWORDS_CHECK.test(originalResponseText)) {
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

    function installHooks() {
        if (hooksInstalledMain) return;
        try { unsafeWindow.fetch = fetchOverride; } catch (e) { logError('HookInstall', 'Failed to hook fetch:', e); }
        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
        } catch (e) { logError('HookInstall', 'Failed to hook XHR:', e); }
        hooksInstalledMain = true;
        logCoreDebug('HookInstall', 'Network hooks installed.');
    }

    function removeDOMAdElements(nodes) {
        if (!ATTEMPT_DOM_AD_REMOVAL || !nodes || nodes.length === 0) return;

        for (const node of nodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches(AD_DOM_REMOVAL_SELECTOR_STRING)) {
                    logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'DOMAdRemoval', 'Removing matched ad node:', node);
                    node.remove();
                }
                const adElements = node.querySelectorAll(AD_DOM_REMOVAL_SELECTOR_STRING);
                if (adElements.length > 0) {
                    adElements.forEach(el => {
                        logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'DOMAdRemoval', 'Removing matched ad child node:', el);
                        el.remove();
                    });
                }
            }
        }
    }

    function setupDOMAdRemovalObserver() {
        if (!ATTEMPT_DOM_AD_REMOVAL || adRemovalObserver) return;

        adRemovalObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    removeDOMAdElements(mutation.addedNodes);
                }
            }
        });

        const observeTarget = document.documentElement;
        adRemovalObserver.observe(observeTarget, { childList: true, subtree: true });
        logCoreDebug('DOMAdRemoval', 'Optimized MutationObserver for DOM ad removal started.');
        removeDOMAdElements([document.body]);
    }

    function isValidPlayerVideo(videoEl) {
        if (!videoEl) return false;
        if (videoEl.src && videoEl.src.startsWith('blob:')) {
            return true;
        }
        if (videoEl.hasAttribute('poster') || videoEl.loop) {
            return false;
        }
        return PLAYER_CONTAINER_SELECTORS.some(selector => videoEl.closest(selector));
    }

    function setupVideoPlayerMonitor() {
        if (videoPlayerMutationObserver) return;

        const initialVideoEl = document.querySelector('video');
        if (initialVideoEl && isValidPlayerVideo(initialVideoEl)) {
            videoElement = initialVideoEl;
            logCoreDebug('PlayerMonitor', 'Found initial valid video element.');
            attachVideoEventListeners(videoElement);
        }

        videoPlayerMutationObserver = new MutationObserver((mutationsList) => {
            if (videoElement && !document.body.contains(videoElement)) {
                logCoreDebug('PlayerMonitor', 'Current video element was removed from DOM (channel switched?). Resetting.');
                detachVideoEventListeners(videoElement);
                videoElement = null;
            }

            if (videoElement) return;

            for (const mutation of mutationsList) {
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newVideoElement = node.matches('video') ? node : node.querySelector('video');
                            if (newVideoElement && isValidPlayerVideo(newVideoElement)) {
                                logCoreDebug('PlayerMonitor', 'Found new valid video element.');
                                videoElement = newVideoElement;
                                attachVideoEventListeners(videoElement);
                                return;
                            }
                        }
                    }
                }
            }
        });

        const observeTarget = document.body || document.documentElement;
        videoPlayerMutationObserver.observe(observeTarget, { childList: true, subtree: true });
        logCoreDebug('PlayerMonitor', 'Video player mutation observer started.');
    }

    function detachVideoEventListeners(vidElement) {
        if (!vidElement || !attachedListeners.has(vidElement)) return;
        const listeners = attachedListeners.get(vidElement);
        for (const eventName in listeners) {
            vidElement.removeEventListener(eventName, listeners[eventName]);
        }
        attachedListeners.delete(vidElement);
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Detached event listeners from video element:', vidElement);
    }

    function attachVideoEventListeners(vidElement) {
        if (!vidElement || attachedListeners.has(vidElement)) return;

        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Attaching event listeners to video element:', vidElement);

        const listeners = {};

        listeners.play = () => {
            if (vidElement && vidElement.paused) {
                logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'Autoplay', 'Proactively trying to play video element.');
                const playPromise = vidElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        if (e.name !== 'NotAllowedError') {
                            logWarn('Autoplay', `Failed to autoplay video: ${e.name} - ${e.message}. User interaction might be required.`);
                        }
                    });
                }
            }
        };

        listeners.error = (e) => {
            const error = e?.target?.error;
            const errorCode = error?.code;
            const errorMessage = error?.message;
            logError('PlayerMonitor', `Player error event. Code: ${errorCode || 'N/A'}, Message: "${errorMessage || 'N/A'}"`);
            if (errorCode && RELOAD_ON_ERROR_CODES.includes(errorCode)) {
                logError('PlayerMonitor', `Player error code ${errorCode} is in critical list. Triggering reload.`);
                triggerReload(`Player error code ${errorCode}`);
            }
        };

        let lastTimeUpdate = Date.now();
        listeners.timeupdate = () => { lastTimeUpdate = Date.now(); };

        listeners.waiting = () => {
            logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMonitor', 'Video event: waiting (buffering)');
            lastTimeUpdate = Date.now();
            if (RELOAD_BUFFERING_THRESHOLD_MS > 0) {
                setTimeout(() => {
                    if (!vidElement || vidElement.paused || vidElement.seeking || vidElement.readyState >= 3) return;
                    if (Date.now() - lastTimeUpdate > RELOAD_BUFFERING_THRESHOLD_MS) {
                        logWarn('PlayerMonitor', `Video appears stuck buffering for over ${RELOAD_BUFFERING_THRESHOLD_MS / 1000}s. Triggering reload.`);
                        triggerReload('Video buffering timeout');
                    }
                }, RELOAD_BUFFERING_THRESHOLD_MS + 1000);
            }
        };

        listeners.stalled = () => {
            logWarn('PlayerMonitor', 'Video event: stalled (browser unable to fetch data).');
            if (RELOAD_STALL_THRESHOLD_MS > 0) {
                setTimeout(() => {
                    if (!vidElement || vidElement.paused || vidElement.seeking || vidElement.readyState >= 3) return;
                    if (Date.now() - lastTimeUpdate > RELOAD_STALL_THRESHOLD_MS) {
                        logWarn('PlayerMonitor', `Video appears stalled for over ${RELOAD_STALL_THRESHOLD_MS / 1000}s. Triggering reload.`);
                        triggerReload('Video stall timeout');
                    }
                }, RELOAD_STALL_THRESHOLD_MS + 1000);
            }
        };

        vidElement.addEventListener('canplay', listeners.play, { once: true, passive: true });
        vidElement.addEventListener('error', listeners.error, { passive: true });
        vidElement.addEventListener('timeupdate', listeners.timeupdate, { passive: true });
        vidElement.addEventListener('waiting', listeners.waiting, { passive: true });
        vidElement.addEventListener('stalled', listeners.stalled, { passive: true });

        attachedListeners.set(vidElement, listeners);
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
            '[data-a-target="player-error-screen"]',
            '.content-overlay-gate__content',
            'div[data-test-selector="content-overlay-gate-text"]'
        ];

        errorScreenObserver = new MutationObserver(() => {
            for (const selector of errorScreenSelectors) {
                const errorScreenElement = document.querySelector(selector);
                if (errorScreenElement && (errorScreenElement.offsetParent !== null || errorScreenElement.classList.contains('content-overlay-gate--active'))) {
                    logError('ErrorScreenObserver', `Twitch error screen detected (selector: ${selector}). Triggering reload.`);
                    triggerReload(`Detected player error screen: ${selector}`);
                    return;
                }
            }
        });
        const observeTarget = document.body || document.documentElement;
        if (observeTarget) {
            errorScreenObserver.observe(observeTarget, { childList: true, subtree: true });
            logCoreDebug('ErrorScreenObserver', 'Observer for player error screens started.');
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                const target = document.body || document.documentElement;
                if (target) errorScreenObserver.observe(target, { childList: true, subtree: true });
                logCoreDebug('ErrorScreenObserver', 'Observer for player error screens started (DOMContentLoaded).');
            }, { once: true });
        }
    }

    function initializeScript() {
        logCoreDebug('Initialize', `Twitch Adblock Ultimate v${SCRIPT_VERSION} initializing...`);
        injectCSS();
        if (FORCE_MAX_QUALITY_IN_BACKGROUND) forceMaxQuality();
        hookQualitySettings();
        installHooks();
        setupDOMAdRemovalObserver();
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