// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      26.1.0
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

    // --- Script Configuration ---
    const CONFIG = {
        SCRIPT_VERSION: '26.1.0',
        SETTINGS: {
            PROACTIVE_TOKEN_SWAP: GM_getValue('TTV_AdBlock_ProactiveTokenSwap', true),
            ENABLE_MIDROLL_RECOVERY: GM_getValue('TTV_AdBlock_EnableMidrollRecovery', true),
            FORCE_MAX_QUALITY: GM_getValue('TTV_AdBlock_ForceMaxQuality', true),
            MODIFY_GQL_RESPONSE: GM_getValue('TTV_AdBlock_ModifyGQL', true),
            ENABLE_AUTO_RELOAD: GM_getValue('TTV_AdBlock_EnableAutoReload', true),
            HIDE_AD_OVERLAY: GM_getValue('TTV_AdBlock_HideAdOverlay', true),
            ATTEMPT_DOM_AD_REMOVAL: GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true),
            HIDE_COOKIE_BANNER: GM_getValue('TTV_AdBlock_HideCookieBanner', true),
        },
        DEBUG: {
            SHOW_ERRORS: GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true),
            CORE: GM_getValue('TTV_AdBlock_Debug_Core', true),
            PLAYER_MONITOR: GM_getValue('TTV_AdBlock_Debug_PlayerMon', true),
            M3U8_CLEANING: GM_getValue('TTV_AdBlock_Debug_M3U8', true),
            GQL_MODIFY: GM_getValue('TTV_AdBlock_Debug_GQL', true),
            NETWORK_BLOCKING: GM_getValue('TTV_AdBlock_Debug_NetBlock', true),
            TOKEN_SWAP: GM_getValue('TTV_AdBlock_Debug_TokenSwap', true),
        },
        ADVANCED: {
            RELOAD_STALL_THRESHOLD_MS: GM_getValue('TTV_AdBlock_StallThresholdMs', 20000),
            RELOAD_BUFFERING_THRESHOLD_MS: GM_getValue('TTV_AdBlock_BufferingThresholdMs', 45000),
            RELOAD_COOLDOWN_MS: GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000),
            VISIBILITY_RESUME_DELAY_MS: GM_getValue('TTV_AdBlock_VisResumeDelayMs', 1500),
            MAX_RELOADS_PER_SESSION: GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 5),
            RELOAD_ON_ERROR_CODES: GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', "0,2,3,4,9,10,403,1000,2000,3000,4000,5000,6001,500,502,503,504")
                .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
            MAX_TOKEN_FETCH_RETRIES: 3,
            TOKEN_FETCH_RETRY_DELAY_MS: 1000,
        },
    };

    // --- Constants ---
    const LOG_PREFIX = `[TTV ADBLOCK ULT v${CONFIG.SCRIPT_VERSION}]`;
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';

    const AD_URL_KEYWORDS_BLOCK = [
        'nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com',
        'adservice.google.com', 'doubleclick.net', 'googlesyndication.com',
        'pubads.g.doubleclick.net', 'adnxs.com', 'amazon-adsystem.com', 'taboola.com',
        'outbrain.com', 'taboolacdn.com', 'yieldmo.com', 'criteorumble.com',
        'rubiconproject.com', 'appier.net', 'inmobi.com', 'adform.net', 'ads.ttvnw.net',
        'adserver.ttvnw.net', 'beacon.ads.ttvnw.net', 'mraid.googleapis.com',
        'securepubads.g.doubleclick.net', 'googleads.g.doubleclick.net', 'twitchads.net',
        'ad.twitch.tv', 'analytics.twitch.tv', 'beacon.twist.tv', 'sentry.io',
        'sprig.com', 'scorecardresearch.com', 'cast_sender.js', 'v6s.js',
        'cloudfront.net', 'gstatic.com', 'yandex.ru',
    ];

    const AD_DOM_SELECTORS = [
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
        '.video-ad-display__container', '[role="advertisement"]', '[data-ad-overlay]',
        'div[class*="ad-overlay"]', 'div[class*="ad-container"]', 'div[data-a-target="player-ad-overlay"]',
        'div[data-test-selector="ad-interrupt-overlay__player-container"]', 'div[aria-label="Advertisement"]',
        'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]', 'iframe[src*="imasdk.googleapis.com"]',
        '.player-overlay-ad', '.tw-player-ad-overlay', '.video-ad-display', 'div[data-a-target="video-ad-countdown-container"]',
        'div[class*="--ad-banner"]', 'div[data-ad-unit]', 'div[class*="player-ads"]', 'div[data-ad-boundary]',
        'div[class*="ad-module"]', 'div[data-test-selector="ad-module"]',
        ...(CONFIG.SETTINGS.HIDE_COOKIE_BANNER ? ['.consent-banner'] : []),
    ];

    const AD_DATERANGE_KEYWORDS = [
        'AD-ID=', 'CUE-OUT', 'SCTE35', 'Twitch-Ad-Signal', 'Twitch-Prefetch',
        'Twitch-Ad-Hide', 'Twitch-Ads', 'X-CUSTOM', 'X-AD', 'X-TWITCH-AD', 'EXT-X-TWITCH-INFO'
    ];

    const PLAYER_CONTAINER_SELECTORS = [
        '.video-player', '[data-a-target="video-player"]', '.player-container',
        '[data-test-selector="video-player__video-container"]', 'div[class*="player-core"]'
    ];

    const GQL_OPERATIONS_TO_SKIP = new Set([
        'PlaybackAccessToken', 'PlaybackAccessToken_Template', 'ChannelPointsContext', 'ViewerPoints',
        'CommunityPointsSettings', 'ClaimCommunityPoints', 'CreateCommunityPointsReward',
        'UpdateCommunityPointsReward', 'DeleteCommunityPointsReward', 'UpdateCommunityPointsSettings',
        'CustomRewardRedemption', 'RedeemCommunityPointsCustomReward', 'RewardCenter',
        'ChannelPointsAutomaticRewards', 'ChannelRoot_AboutPanel', 'predictions', 'polls', 'UserFollows',
        'VideoComments', 'ChatHighlights', 'VideoPreviewCard__VideoHover', 'UseLive', 'UseBrowseQueries',
        'ViewerCardModLogsMessagesBySender', 'ComscoreStreamingQuery', 'StreamTags', 'StreamMetadata',
        'VideoMetadata', 'ChannelPage_GetChannelStat', 'Chat_Userlookup', 'RealtimeStreamTagList_Tags',
        'UserModStatus', 'FollowButton_FollowUser', 'FollowButton_UnfollowUser', 'Clips_Popular_month',
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
        'VideoPlayer_VideoSourceManager', 'VideoPlayerStreamMetadata', 'VideoPlayerStatusOverlayChannel',
        'VideoPlayer_PlayerHeartbeat'
    ]);

    // --- State Variables ---
    let hooksInstalled = false;
    let adRemovalObserver = null;
    let errorScreenObserver = null;
    let videoPlayerObserver = null;
    let videoElement = null;
    let lastReloadTimestamp = 0;
    let reloadCount = 0;
    let cachedQualityValue = null;
    let cachedCleanToken = null;
    const originalFetch = unsafeWindow.fetch;
    const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXhrSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const originalLocalStorageSetItem = unsafeWindow.localStorage.setItem;
    const originalLocalStorageGetItem = unsafeWindow.localStorage.getItem;

    // --- Logging Functions ---
    const logError = (source, message, ...args) => {
        if (CONFIG.DEBUG.SHOW_ERRORS) console.error(`${LOG_PREFIX} [${source}] ERROR:`, message, ...args);
    };

    const logWarn = (source, message, ...args) => {
        if (CONFIG.DEBUG.SHOW_ERRORS) console.warn(`${LOG_PREFIX} [${source}] WARN:`, message, ...args);
    };

    const logDebug = (source, message, ...args) => {
        if (CONFIG.DEBUG.CORE) console.info(`${LOG_PREFIX} [${source}] DEBUG:`, message, ...args);
    };

    const logTrace = (flag, source, message, ...args) => {
        if (flag) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg));
    };

    // --- Utility Functions ---
    const injectCSS = () => {
        let css = '';
        if (CONFIG.SETTINGS.HIDE_AD_OVERLAY) {
            css += `${AD_DOM_SELECTORS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }\n`;
        }
        if (css) {
            try {
                GM_addStyle(css);
                logDebug('CSSInject', 'CSS styles applied successfully.');
            } catch (e) {
                logError('CSSInject', 'Failed to apply CSS:', e);
            }
        }
    };

    const forceMaxQuality = () => {
        try {
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
            logDebug('ForceQuality', 'Background quality forcing activated.');
        } catch (e) {
            logError('ForceQuality', 'Failed to force max quality:', e);
        }
    };

    const setQualitySettings = (forceCheck = false) => {
        try {
            let currentValue = cachedQualityValue;
            if (currentValue === null || forceCheck) {
                currentValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
                cachedQualityValue = currentValue;
            }
            if (currentValue !== TARGET_QUALITY_VALUE) {
                originalLocalStorageSetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY, TARGET_QUALITY_VALUE);
                cachedQualityValue = TARGET_QUALITY_VALUE;
                logDebug('QualitySet', `Forced video quality to "chunked". Previous: ${currentValue || 'none'}`);
            }
        } catch (e) {
            logError('QualitySet', 'Failed to set quality:', e);
            cachedQualityValue = null;
        }
    };

    const hookQualitySettings = () => {
        try {
            unsafeWindow.localStorage.setItem = function(key, value) {
                let forcedValue = value;
                if (key === LS_KEY_QUALITY && value !== TARGET_QUALITY_VALUE) {
                    logTrace(CONFIG.DEBUG.CORE, 'QualitySet:Hook', `Intercepted localStorage.setItem for '${key}'. Forcing: '${TARGET_QUALITY_VALUE}'`);
                    forcedValue = TARGET_QUALITY_VALUE;
                    cachedQualityValue = forcedValue;
                }
                try {
                    return originalLocalStorageSetItem.call(unsafeWindow.localStorage, key, forcedValue);
                } catch (e) {
                    logError('QualitySet:Hook', `localStorage.setItem error for '${key}':`, e);
                    cachedQualityValue = null;
                    throw e;
                }
            };
            cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
            setQualitySettings(true);
        } catch (e) {
            logError('QualitySet:Hook', 'Failed to hook localStorage.setItem:', e);
            unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
        }
    };

    const parseAndCleanM3U8 = (m3u8Text, url = 'N/A') => {
        const urlShort = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const urlFilename = urlShort.substring(urlShort.lastIndexOf('/') + 1) || urlShort;

        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logError('M3U8Clean', `Invalid M3U8 content for ${urlFilename}. Type: ${typeof m3u8Text}`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: false, errorDuringClean: true };
        }

        const upperM3U8Text = m3u8Text.toUpperCase();
        let potentialAdContent = false;

        if (AD_DATERANGE_KEYWORDS.some(kw => upperM3U8Text.includes(kw))) {
            potentialAdContent = true;
        }

        if (!potentialAdContent) {
            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'M3U8Clean', `No ad markers in ${urlFilename}.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: false, errorDuringClean: false };
        }

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
            let skipLine = false;

            if (upperTrimmedLine.startsWith('#EXT-X-DATERANGE') ||
                upperTrimmedLine.startsWith('#EXT-X-TWITCH-INFO') ||
                upperTrimmedLine.startsWith('#EXT-X-ASSET') ||
                upperTrimmedLine.startsWith('#EXT-X-CUE-OUT') ||
                upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-HIDE') ||
                upperTrimmedLine.startsWith('#EXT-X-SCTE35')) {
                if (AD_DATERANGE_KEYWORDS.some(kw => upperTrimmedLine.includes(kw))) {
                    skipLine = true;
                    adsFound = true;
                    isAdSection = true;
                    discontinuityPending = true;
                }
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH')) {
                skipLine = true;
                adsFound = true;
                if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('#')) {
                    lines[i + 1] = '';
                }
            } else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) {
                    skipLine = true;
                    isAdSection = false;
                    discontinuityPending = false;
                } else if (upperTrimmedLine.startsWith('#EXTINF')) {
                    isAdSection = false;
                    discontinuityPending = false;
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY') && discontinuityPending) {
                    skipLine = true;
                    discontinuityPending = false;
                } else if (!trimmedLine.startsWith('#') && trimmedLine) {
                    skipLine = true;
                }
            }

            if (skipLine) {
                linesRemoved++;
            } else if (trimmedLine) {
                cleanLines.push(line);
            }
        }

        const cleanedText = cleanLines.join('\n');
        const segmentCount = cleanLines.filter(line => line.trim() && !line.trim().startsWith('#')).length;

        if (adsFound && segmentCount < 3 && !cleanedText.includes('#EXT-X-ENDLIST')) {
            logWarn('M3U8Clean', `Insufficient segments (${segmentCount}) in ${urlFilename}. Reverting to original. Removed: ${linesRemoved}`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0, wasPotentiallyAd: true, errorDuringClean: true };
        }

        if (adsFound) {
            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'M3U8Clean', `Cleaned ${urlFilename}: ${linesRemoved} lines removed. ${segmentCount} segments remain.`);
        } else if (potentialAdContent) {
            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'M3U8Clean', `Processed ${urlFilename}: Potential ad markers found, no lines removed.`);
        }

        return { cleanedText, adsFound, linesRemoved, wasPotentiallyAd: potentialAdContent, errorDuringClean: false };
    };

    const modifyGqlResponse = (responseText, url) => {
        if (!CONFIG.SETTINGS.MODIFY_GQL_RESPONSE || typeof responseText !== 'string' || !responseText) {
            return responseText;
        }

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            logError('GQLModify', `Failed to parse GQL JSON: ${url.slice(0, 100)}...`, e);
            return responseText;
        }

        let modified = false;
        const opDataArray = Array.isArray(data) ? data : [data];

        for (const opData of opDataArray) {
            if (!opData || typeof opData !== 'object' || !opData.data) continue;

            const operationName = opData.extensions?.operationName || 'UnknownGQLOp';

            if (GQL_OPERATIONS_TO_SKIP.has(operationName)) {
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Skipping GQL operation: ${operationName}`);
                continue;
            }

            const processToken = (tokenHolder) => {
                if (!tokenHolder?.value || typeof tokenHolder.value !== 'string') return false;
                try {
                    const token = JSON.parse(tokenHolder.value);
                    let changed = false;

                    if (token.hide_ads === false) { token.hide_ads = true; changed = true; }
                    if (token.show_ads === true) { token.show_ads = false; changed = true; }
                    if (token.ad_block_gate_overlay_enabled === true) { token.ad_block_gate_overlay_enabled = false; changed = true; }
                    if (token.is_ad_enabled_on_stream === true) { token.is_ad_enabled_on_stream = false; changed = true; }
                    if (token.is_reward_ad_on_cooldown === false) { token.is_reward_ad_on_cooldown = true; changed = true; }

                    if (changed) {
                        tokenHolder.value = JSON.stringify(token);
                        return true;
                    }
                } catch (e) {
                    logWarn('GQLModify', `Failed to modify token for ${operationName}:`, e);
                }
                return false;
            };

            if (opData.data.streamPlaybackAccessToken && processToken(opData.data.streamPlaybackAccessToken)) {
                modified = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Modified streamPlaybackAccessToken for ${operationName}`);
            }

            if (opData.data.videoPlaybackAccessToken && processToken(opData.data.videoPlaybackAccessToken)) {
                modified = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Modified videoPlaybackAccessToken for ${operationName}`);
            }

            if (opData.data.adSlots) {
                opData.data.adSlots = [];
                modified = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Cleared adSlots for ${operationName}`);
            }

            if (opData.data.viewer?.adBlock?.isAdBlockActive === true) {
                opData.data.viewer.adBlock.isAdBlockActive = false;
                modified = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Set isAdBlockActive to false for ${operationName}`);
            }

            if (opData.data.user?.broadcastSettings?.isAdFree === false) {
                opData.data.user.broadcastSettings.isAdFree = true;
                modified = true;
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Set isAdFree to true for ${operationName}`);
            }
        }

        if (modified) {
            try {
                const result = JSON.stringify(Array.isArray(data) ? opDataArray : opDataArray[0]);
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQLModify', `Modified GQL response: ${url.slice(0, 100)}...`);
                return result;
            } catch (e) {
                logError('GQLModify', `Failed to stringify modified GQL: ${url.slice(0, 100)}...`, e);
            }
        }

        return responseText;
    };

    const fetchNewPlaybackAccessToken = async (channelName, deviceId, retryCount = 0) => {
        logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'TokenSwap', `(1/3) Requesting token for ${channelName}, DeviceID: ${deviceId || 'N/A'}, Attempt: ${retryCount + 1}`);
        const payload = {
            operationName: 'PlaybackAccessToken_Template',
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {\nstreamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {\nvalue\nsignature\nauthorization { isForbidden forbiddenReasonCode }\n__typename\n}\nvideoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {\nvalue\nsignature\n__typename\n}\n}',
            variables: { isLive: true, login: channelName, isVod: false, vodID: '', playerType: 'site' }
        };
        const headers = {
            'Content-Type': 'application/json',
            'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
            ...(deviceId && { 'Device-ID': deviceId }),
        };

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: GQL_URL,
                headers,
                data: JSON.stringify(payload),
                responseType: 'json',
                onload: async (response) => {
                    if (response.status >= 200 && response.status < 300 && response.response) {
                        const token = response.response?.data?.streamPlaybackAccessToken;
                        if (token?.value && token.signature) {
                            try {
                                const tokenValue = JSON.parse(token.value);
                                if (tokenValue.show_ads || !tokenValue.hide_ads) {
                                    if (retryCount < CONFIG.ADVANCED.MAX_TOKEN_FETCH_RETRIES - 1) {
                                        logWarn('TokenSwap', `Token for ${channelName} contains ads. Retrying (${retryCount + 2}/${CONFIG.ADVANCED.MAX_TOKEN_FETCH_RETRIES})...`);
                                        await new Promise(r => setTimeout(r, CONFIG.ADVANCED.TOKEN_FETCH_RETRY_DELAY_MS));
                                        return fetchNewPlaybackAccessToken(channelName, deviceId, retryCount + 1)
                                            .then(resolve)
                                            .catch(reject);
                                    }
                                    logWarn('TokenSwap', `Token for ${channelName} still contains ads after retries.`);
                                } else {
                                    logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'TokenSwap', `Clean token for ${channelName} retrieved.`);
                                }
                                resolve(token);
                            } catch (e) {
                                logError('TokenSwap', `Failed to parse token for ${channelName}:`, e);
                                reject(`Invalid token JSON: ${e.message}`);
                            }
                        } else {
                            logError('TokenSwap', `No valid token in response for ${channelName}.`);
                            reject(`No valid token in response.`);
                        }
                    } else {
                        logError('TokenSwap', `GQL request failed for ${channelName}. Status: ${response.status}`);
                        if (retryCount < CONFIG.ADVANCED.MAX_TOKEN_FETCH_RETRIES - 1) {
                            await new Promise(r => setTimeout(r, CONFIG.ADVANCED.TOKEN_FETCH_RETRY_DELAY_MS));
                            return fetchNewPlaybackAccessToken(channelName, deviceId, retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }
                        reject(`GQL request failed: status ${response.status}`);
                    }
                },
                onerror: (error) => {
                    logError('TokenSwap', `Network error for ${channelName}:`, error);
                    if (retryCount < CONFIG.ADVANCED.MAX_TOKEN_FETCH_RETRIES - 1) {
                        setTimeout(() => {
                            fetchNewPlaybackAccessToken(channelName, deviceId, retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, CONFIG.ADVANCED.TOKEN_FETCH_RETRY_DELAY_MS);
                    } else {
                        reject(`Network error: ${error.error || 'Unknown'}`);
                    }
                }
            });
        });
    };

    const fetchNewUsherM3U8 = async (originalUrl, token, channelName) => {
        logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'MidrollRecovery', `(2/3) Fetching M3U8 for ${channelName}.`);
        const url = new URL(originalUrl);
        url.searchParams.set('token', token.value);
        url.searchParams.set('sig', token.signature);
        url.searchParams.set('player_version', '1.20.0');
        url.searchParams.set('allow_source', 'true');
        url.searchParams.set('allow_audio_only', 'true');

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url.href,
                responseType: 'text',
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300 && response.responseText) {
                        logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'MidrollRecovery', `(2/3) M3U8 retrieved for ${channelName}.`);
                        resolve(response.responseText);
                    } else {
                        logError('MidrollRecovery', `(2/3) M3U8 request failed for ${channelName}. Status: ${response.status}`);
                        reject(`M3U8 request failed: status ${response.status}`);
                    }
                },
                onerror: (error) => {
                    logError('MidrollRecovery', `(2/3) Network error for ${channelName}:`, error);
                    reject(`Network error: ${error.error || 'Unknown'}`);
                }
            });
        });
    };

    const fetchOverride = async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const method = (input instanceof Request ? input.method : init?.method || 'GET').toUpperCase();
        const lowerUrl = requestUrl.toLowerCase();
        const urlShort = (requestUrl.includes('?') ? requestUrl.substring(0, requestUrl.indexOf('?')) : requestUrl).slice(0, 120);

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerUrl.includes(keyword.toLowerCase())) {
                logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'FetchBlock', `Blocked fetch to ${urlShort} (Keyword: ${keyword})`);
                return new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock (Keyword: ${keyword})` });
            }
        }

        const isM3U8Request = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerUrl) && lowerUrl.includes('usher.ttvnw.net');

        if (isM3U8Request) {
            let url = requestUrl;
            if (CONFIG.SETTINGS.PROACTIVE_TOKEN_SWAP && cachedCleanToken) {
                logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'TokenSwap', `Swapping token for ${urlShort}`);
                const newUrl = new URL(url);
                newUrl.searchParams.set('token', cachedCleanToken.value);
                newUrl.searchParams.set('sig', cachedCleanToken.signature);
                url = newUrl.href;
                cachedCleanToken = null;
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
                    responseType: 'text',
                    onload: async (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            let { cleanedText, adsFound, errorDuringClean } = parseAndCleanM3U8(response.responseText, url);

                            if (adsFound && CONFIG.SETTINGS.ENABLE_MIDROLL_RECOVERY && !errorDuringClean) {
                                logWarn('MidrollRecovery', `Ads in M3U8 for ${urlShort}. Starting recovery...`);
                                try {
                                    const urlParams = new URL(url).searchParams;
                                    const channelName = urlParams.get('login') || urlParams.get('channel') ||
                                        unsafeWindow.location.pathname.match(/\/([a-zA-Z0-9_]+)$/)?.[1] || 'unknown';
                                    const deviceId = init?.headers?.get('Device-ID') || unsafeWindow.localStorage.getItem('twilight.deviceID');

                                    const token = await fetchNewPlaybackAccessToken(channelName, deviceId);
                                    const newM3U8 = await fetchNewUsherM3U8(url, token, channelName);
                                    const result = parseAndCleanM3U8(newM3U8, `RECOVERY_${channelName}`);

                                    if (!result.adsFound || result.errorDuringClean) {
                                        logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'MidrollRecovery', `(3/3) Recovery successful for ${channelName}. Ads: ${result.adsFound}`);
                                        cleanedText = result.cleanedText;
                                    } else {
                                        logWarn('MidrollRecovery', `(3/3) Recovery for ${channelName} still contains ads.`);
                                        cleanedText = result.cleanedText;
                                    }
                                } catch (e) {
                                    logError('MidrollRecovery', `(3/3) Recovery failed for ${urlShort}: ${e}`);
                                }
                            } else if (errorDuringClean) {
                                logWarn('FetchM3U8', `M3U8 cleaning error for ${urlShort}. Using original.`);
                                cleanedText = response.responseText;
                            }

                            const headers = new Headers();
                            response.responseHeaders?.trim().split(/[\r\n]+/).forEach(line => {
                                const [key, value] = line.split(': ', 2);
                                if (key.toLowerCase() !== 'content-length' && value) headers.append(key, value);
                            });
                            headers.set('Content-Type', 'application/vnd.apple.mpegurl');
                            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'FetchM3U8', `Processed M3U8 for ${urlShort}.`);
                            resolve(new Response(cleanedText, { status: response.status, statusText: response.statusText, headers }));
                        } else {
                            logError('FetchM3U8', `Fetch failed for ${urlShort}: ${response.status}`);
                            reject(new TypeError(`Fetch failed: ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        logError('FetchM3U8', `Network error for ${urlShort}:`, error);
                        reject(new TypeError(`Network error: ${error.error || 'Unknown'}`));
                    }
                });
            });
        }

        const response = await originalFetch(input, init).catch(e => {
            logError('FetchOverride', `Fetch failed for ${urlShort}:`, e);
            throw e;
        });

        if (lowerUrl.startsWith(GQL_URL) && method === 'POST' && response.ok && CONFIG.SETTINGS.MODIFY_GQL_RESPONSE) {
            let text;
            try {
                text = await response.clone().text();
                if (!text) return response;
            } catch (e) {
                logError('FetchGQL', 'Failed to read GQL response:', e);
                return response;
            }

            if (CONFIG.SETTINGS.PROACTIVE_TOKEN_SWAP) {
                try {
                    const data = JSON.parse(text);
                    const operations = Array.isArray(data) ? data : [data];
                    for (const op of operations) {
                        const opName = op.extensions?.operationName;
                        if (opName === 'PlaybackAccessToken' || opName === 'PlaybackAccessToken_Template') {
                            const channelName = op.data?.streamPlaybackAccessToken?.variables?.login ||
                                op.data?.videoPlaybackAccessToken?.variables?.login;
                            if (channelName) {
                                const deviceId = init?.headers?.get('Device-ID') || unsafeWindow.localStorage.getItem('twilight.deviceID');
                                fetchNewPlaybackAccessToken(channelName, deviceId)
                                    .then(token => {
                                        cachedCleanToken = token;
                                        logTrace(CONFIG.DEBUG.TOKEN_SWAP, 'TokenSwap', `Cached token for ${channelName}.`);
                                    })
                                    .catch(e => logError('TokenSwap', `Failed to fetch token for ${channelName}:`, e));
                            }
                            break;
                        }
                    }
                } catch (e) {
                    logWarn('TokenSwap', 'Error parsing GQL for token:', e);
                }
            }

            const modifiedText = modifyGqlResponse(text, requestUrl);
            if (modifiedText !== text) {
                const headers = new Headers(response.headers);
                headers.delete('Content-Length');
                return new Response(modifiedText, { status: response.status, statusText: response.statusText, headers });
            }
        }

        return response;
    };

    const xhrOpenOverride = function(method, url, ...args) {
        this._hooked_url = String(url);
        this._hooked_method = method.toUpperCase();
        originalXhrOpen.apply(this, [method, url, ...args]);
    };

    const xhrSendOverride = function(data, ...args) {
        const url = this._hooked_url;
        const method = this._hooked_method;
        if (!url) {
            return originalXhrSend.apply(this, [data, ...args]);
        }
        const lowerUrl = url.toLowerCase();
        const urlShort = (url.includes('?') ? url.substring(0, url.indexOf('?')) : url).slice(0, 120);

        for (const keyword of AD_URL_KEYWORDS_BLOCK) {
            if (lowerUrl.includes(keyword.toLowerCase())) {
                logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'XHRBlock', `Blocked XHR ${method} to ${urlShort} (Keyword: ${keyword})`);
                this.dispatchEvent(new Event('error'));
                return;
            }
        }

        const isM3U8Request = method === 'GET' && TWITCH_MANIFEST_PATH_REGEX.test(lowerUrl) && lowerUrl.includes('usher.ttvnw.net');

        if (isM3U8Request) {
            GM_xmlhttpRequest({
                method,
                url,
                responseType: 'text',
                onload: (response) => {
                    let responseText = response.responseText;
                    if (response.status >= 200 && response.status < 300) {
                        const { cleanedText, adsFound, errorDuringClean } = parseAndCleanM3U8(responseText, url);
                        if (adsFound && !errorDuringClean) {
                            responseText = cleanedText;
                            logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'XHR_M3U8', `Cleaned M3U8 for ${urlShort}`);
                        } else if (errorDuringClean) {
                            logWarn('XHR_M3U8', `M3U8 cleaning error for ${urlShort}. Using original.`);
                        }
                    }
                    Object.defineProperties(this, {
                        responseText: { value: responseText, configurable: true, writable: true },
                        response: { value: responseText, configurable: true, writable: true },
                        status: { value: response.status, configurable: true },
                        statusText: { value: response.statusText, configurable: true },
                        readyState: { value: 4, configurable: true },
                    });
                    logTrace(CONFIG.DEBUG.M3U8_CLEANING, 'XHR_M3U8', `Processed M3U8 for ${urlShort}. Status: ${response.status}`);
                    this.dispatchEvent(new Event('load'));
                    this.dispatchEvent(new Event('loadend'));
                },
                onerror: (error) => {
                    logError('XHR_M3U8', `XHR error for ${urlShort}:`, error);
                    Object.defineProperties(this, {
                        status: { value: 0, configurable: true },
                        readyState: { value: 4, configurable: true },
                    });
                    this.dispatchEvent(new Event('error'));
                    this.dispatchEvent(new Event('loadend'));
                },
            });
            return;
        }

        if (lowerUrl.startsWith(GQL_URL) && method === 'POST' && CONFIG.SETTINGS.MODIFY_GQL_RESPONSE) {
            this.addEventListener('load', () => {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300 && typeof this.responseText === 'string') {
                    const modifiedText = modifyGqlResponse(this.responseText, url);
                    if (modifiedText !== this.responseText) {
                        Object.defineProperties(this, {
                            responseText: { value: modifiedText, configurable: true, writable: true },
                            response: { value: modifiedText, configurable: true, writable: true },
                        });
                        logTrace(CONFIG.DEBUG.GQL_MODIFY, 'XHR_GQL', `Modified GQL for ${url.slice(0, 100)}`);
                    }
                }
            }, { once: true });
        }

        originalXhrSend.apply(this, [data, ...args]);
    };

    const installHooks = () => {
        if (hooksInstalled) return;
        try {
            unsafeWindow.fetch = fetchOverride;
            logDebug('HookInstall', 'Fetch hook installed.');
        } catch (e) {
            logError('HookInstall', 'Failed to hook fetch:', e);
        }
        try {
            unsafeWindow.XMLHttpRequest.prototype.open = xhrOpenOverride;
            unsafeWindow.XMLHttpRequest.prototype.send = xhrSendOverride;
            logDebug('HookInstall', 'XHR hooks installed.');
        } catch (e) {
            logError('HookInstall', 'Failed to hook XHR:', e);
        }
        hooksInstalled = true;
        logDebug('HookInstall', 'All network hooks installed.');
    };

    const removeDOMAdElements = () => {
        if (!CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL) return;
        if (!adRemovalObserver) {
            adRemovalObserver = new MutationObserver(removeDOMAdElements);
            const target = document.body || document.documentElement;
            if (target) {
                adRemovalObserver.observe(target, { childList: true, subtree: true });
                logDebug('DOMAdRemoval', 'MutationObserver for ad removal started.');
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    const target = document.body || document.documentElement;
                    if (target) {
                        adRemovalObserver.observe(target, { childList: true, subtree: true });
                        logDebug('DOMAdRemoval', 'MutationObserver for ad removal started (DOMContentLoaded).');
                    }
                }, { once: true });
            }
        }

        AD_DOM_SELECTORS.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el?.parentNode?.removeChild) {
                        el.parentNode.removeChild(el);
                        logTrace(CONFIG.DEBUG.CORE, 'DOMAdRemoval', `Removed element: ${selector}`);
                    } else {
                        logWarn('DOMAdRemoval', `Cannot remove element for ${selector}: invalid parentNode.`);
                    }
                });
            } catch (e) {
                logError('DOMAdRemoval', `Error removing ${selector}:`, e);
            }
        });
    };

    const setupVideoPlayerMonitor = () => {
        if (videoPlayerObserver) return;

        const attachListeners = (vid) => {
            if (!vid || vid._adblock_listeners_attached) return;
            logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'PlayerMonitor', 'Attaching listeners to video element:', vid);

            const attemptPlay = () => {
                if (vid.paused) {
                    logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'Autoplay', 'Attempting to play video.');
                    vid.play().catch(e => {
                        if (e.name !== 'NotAllowedError') {
                            logWarn('Autoplay', `Autoplay failed: ${e.name} - ${e.message}`);
                        }
                    });
                }
            };

            setTimeout(attemptPlay, CONFIG.ADVANCED.VISIBILITY_RESUME_DELAY_MS);
            vid.addEventListener('canplay', attemptPlay, { once: true, passive: true });

            let lastTimeUpdate = Date.now();
            vid.addEventListener('timeupdate', () => {
                lastTimeUpdate = Date.now();
            }, { passive: true });

            vid.addEventListener('error', (e) => {
                const error = e.target?.error;
                const code = error?.code;
                logError('PlayerMonitor', `Player error. Code: ${code || 'N/A'}, Message: ${error?.message || 'N/A'}`);
                if (code && CONFIG.ADVANCED.RELOAD_ON_ERROR_CODES.includes(code)) {
                    logError('PlayerMonitor', `Error code ${code} requires reload.`);
                    triggerReload(`Error code ${code}`);
                }
            }, { passive: true });

            vid.addEventListener('waiting', () => {
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR, 'PlayerMonitor', 'Video buffering.');
                lastTimeUpdate = Date.now();
                if (CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS > 0) {
                    setTimeout(() => {
                        if (vid.paused || vid.seeking || vid.readyState >= 3) return;
                        if (Date.now() - lastTimeUpdate > CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS) {
                            logWarn('PlayerMonitor', `Buffering timeout after ${CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS / 1000}s. Reloading.`);
                            triggerReload('Buffering timeout');
                        }
                    }, CONFIG.ADVANCED.RELOAD_BUFFERING_THRESHOLD_MS + 1000);
                }
            }, { passive: true });

            vid.addEventListener('stalled', () => {
                logWarn('PlayerMonitor', 'Video stalled.');
                if (CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS > 0) {
                    setTimeout(() => {
                        if (vid.paused || vid.seeking || vid.readyState >= 3) return;
                        if (Date.now() - lastTimeUpdate > CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS) {
                            logWarn('PlayerMonitor', `Stalled for ${CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS / 1000}s. Reloading.`);
                            triggerReload('Stall timeout');
                        }
                    }, CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS + 1000);
                }
            }, { passive: true });

            vid._adblock_listeners_attached = true;
        };

        PLAYER_CONTAINER_SELECTORS.forEach(selector => {
            if (videoElement) return;
            const container = document.querySelector(selector);
            if (container) {
                const vid = container.querySelector('video');
                if (vid) {
                    videoElement = vid;
                    logDebug('PlayerMonitor', `Found video element in ${selector}`);
                    attachListeners(videoElement);
                }
            }
        });

        if (!videoElement) {
            videoElement = document.querySelector('video');
            if (videoElement) {
                logDebug('PlayerMonitor', 'Found video element via direct query.');
                attachListeners(videoElement);
            }
        }

        videoPlayerObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newVideo = node.tagName === 'VIDEO' ? node : node.querySelector('video');
                            if (newVideo && newVideo !== videoElement) {
                                logDebug('PlayerMonitor', 'New video element detected.');
                                if (videoElement) {
                                    logDebug('PlayerMonitor', 'Removing listeners from old video.');
                                    videoElement._adblock_listeners_attached = false;
                                }
                                videoElement = newVideo;
                                attachListeners(videoElement);
                                return;
                            }
                        }
                    }
                }
            }
        });

        const target = document.body || document.documentElement;
        if (target) {
            videoPlayerObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-player-error'] });
            logDebug('PlayerMonitor', 'Video player observer started.');
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                const target = document.body || document.documentElement;
                if (target) {
                    videoPlayerObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-player-error'] });
                    logDebug('PlayerMonitor', 'Video player observer started (DOMContentLoaded).');
                }
            }, { once: true });
        }
    };

    const triggerReload = (reason) => {
        if (!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD) {
            logDebug('ReloadTrigger', `Auto-reload disabled: ${reason}`);
            return;
        }
        const now = Date.now();
        if (reloadCount >= CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION) {
            logWarn('ReloadTrigger', `Max reloads (${CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION}) reached: ${reason}`);
            return;
        }
        if (now - lastReloadTimestamp < CONFIG.ADVANCED.RELOAD_COOLDOWN_MS) {
            logWarn('ReloadTrigger', `Reload cooldown active: ${reason}`);
            return;
        }

        lastReloadTimestamp = now;
        reloadCount++;
        logDebug('ReloadTrigger', `Reloading (${reloadCount}/${CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION}): ${reason}`);
        try {
            unsafeWindow.location.reload();
        } catch (e) {
            logError('ReloadTrigger', `Reload error:`, e);
        }
    };

    const startErrorScreenObserver = () => {
        if (!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD || errorScreenObserver) return;

        const selectors = [
            '[data-a-target="player-error-screen"]',
            '.content-overlay-gate__content',
            'div[data-test-selector="content-overlay-gate-text"]'
        ];

        errorScreenObserver = new MutationObserver(() => {
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && (element.offsetParent || element.classList.contains('content-overlay-gate--active'))) {
                    logError('ErrorScreenObserver', `Error screen detected: ${selector}`);
                    triggerReload(`Error screen: ${selector}`);
                    return;
                }
            }
        });

        const target = document.body || document.documentElement;
        if (target) {
            errorScreenObserver.observe(target, { childList: true, subtree: true });
            logDebug('ErrorScreenObserver', 'Error screen observer started.');
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                const target = document.body || document.documentElement;
                if (target) {
                    errorScreenObserver.observe(target, { childList: true, subtree: true });
                    logDebug('ErrorScreenObserver', 'Error screen observer started (DOMContentLoaded).');
                }
            }, { once: true });
        }
    };

    const initialize = () => {
        logDebug('Initialize', `Twitch Adblock Ultimate v${CONFIG.SCRIPT_VERSION} initializing...`);
        injectCSS();
        if (CONFIG.SETTINGS.FORCE_MAX_QUALITY) forceMaxQuality();
        hookQualitySettings();
        installHooks();
        removeDOMAdElements();
        startErrorScreenObserver();
        setupVideoPlayerMonitor();
        logDebug('Initialize', 'Script initialized.');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();