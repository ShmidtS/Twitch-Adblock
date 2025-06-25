// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      25.0.5
// @description  Комплексная блокировка рекламы: проактивная замена токена, механизм восстановления, форсирование качества и классические оптимизации.
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

    // --- START OF CONFIGURATION ---
    const SCRIPT_VERSION = '25.0.5-fixed';
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
    // Отладка
    const SHOW_ERRORS_CONSOLE = GM_getValue('TTV_AdBlock_ShowErrorsInConsole', false);
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', false);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', false);
    const LOG_NETWORK_BLOCKING_DEBUG = GM_getValue('TTV_AdBlock_Debug_NetBlock', false);
    // Настройки перезагрузки
    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '1000,2000,3000,4000,5000');
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 15000);
    const MAX_RELOADS_PER_SESSION = 5;
    // --- END OF CONFIGURATION ---

    const LOG_PREFIX = `[TTV ADBLOCK ULT v${SCRIPT_VERSION}]`;
    const LS_KEY_QUALITY = 'video-quality';
    const TARGET_QUALITY_VALUE = '{"default":"chunked"}';
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const GQL_OPERATIONS_TO_SKIP_MODIFICATION = new Set(['PlaybackAccessToken', 'PlaybackAccessToken_Template', 'ChannelPointsContext', 'ViewerPoints', 'CommunityPointsSettings', 'ClaimCommunityPoints', 'CreateCommunityPointsReward', 'UpdateCommunityPointsReward', 'DeleteCommunityPointsReward', 'UpdateCommunityPointsSettings', 'CustomRewardRedemption', 'RedeemCommunityPointsCustomReward', 'RewardCenter', 'ChannelPointsAutomaticRewards', 'predictions', 'polls', 'UserFollows', 'VideoComments', 'ChatHighlights', 'VideoPreviewCard__VideoHover', 'UseLive', 'UseBrowseQueries', 'ViewerCardModLogsMessagesBySender', 'ComscoreStreamingQuery', 'StreamTags', 'StreamMetadata', 'VideoMetadata', 'ChannelPage_GetChannelStat', 'Chat_Userlookup', 'RealtimeStreamTagList_Tags', 'UserModStatus', 'FollowButton_FollowUser', 'FollowButton_UnfollowUser', 'Clips_Popular_ miesiąc', 'PersonalSections', 'RecommendedChannels', 'FrontPage', 'GetHomePageRecommendations', 'VideoComments_SentMessage', 'UseUserReportModal', 'ReportUserModal_UserReport', 'UserLeaveSquad', 'UserModal_GetFollowersForUser', 'UserModal_GetFollowedChannelsForUser', 'PlayerOverlaysContext', 'MessageBufferPresences', 'RecentChatMessages', 'ChatRoomState', 'VideoPreviewCard__VideoPlayer', 'ChannelPage_ChannelInfoBar_User', 'ChannelPage_SetSessionStatus', 'UseSquadStream', 'OnsiteNotifications', 'OnsiteWaffleNotifications', 'UserActions', 'BitsLeaderboard', 'ChannelLeaderboards', 'PrimeOffer', 'ChannelExtensions', 'ExtensionsForChannel', 'DropCampaignDetails', 'DropsDashboardPage_GetDropCampaigns', 'StreamEventsSlice', 'StreamElementsService_GetOverlays', 'StreamElementsService_GetTheme', 'ViewerBounties', 'GiftASubModal_UserGiftEligibility', 'WebGiftSubButton_SubGiftEligibility', 'CharityCampaign', 'GoalCreateDialog_User', 'GoalsManageOverlay_ChannelGoals', 'PollCreateDialog_User', 'MultiMonthDiscount', 'FreeSubBenefit', 'SubPrices', 'SubscriptionProductBenefitMessages', 'UserCurrentSubscriptionsContext', 'VideoPreviewCard_VideoMarkers', 'UpdateVideoMutation', 'DeleteVideos', 'HostModeTargetDetails', 'StreamInformation', 'VideoPlayer_StreamAnalytics', 'VideoPlayer_VideoSourceManager', 'VideoPlayerStreamMetadata', 'VideoPlayerStatusOverlayChannel']);
    let AD_URL_KEYWORDS_BLOCK = ['d2v02itv0y9u9t.cloudfront.net', 'amazon-adsystem.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com', 'imasdk.googleapis.com', 'pubmatic.com', 'rubiconproject.com', 'adsrvr.org', 'adnxs.com', 'taboola.com', 'outbrain.com', 'ads.yieldmo.com', 'ads.adaptv.advertising.com', 'scorecardresearch.com', 'yandex.ru/clck/', 'omnitagjs', 'omnitag', 'innovid.com', 'eyewonder.com', 'serverbid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com', 'flashtalking.com', 'contextual.media.net', 'advertising.com', 'adform.net', 'freewheel.tv', 'stickyadstv.com', 'tremorhub.com', 'aniview.com', 'criteo.com', 'adition.com', 'teads.tv', 'undertone.com', 'vidible.tv', 'vidoomy.com', 'appnexus.com', '.google.com/pagead/conversion/', '.youtube.com/api/stats/ads'];
    if (BLOCK_NATIVE_ADS_SCRIPT) AD_URL_KEYWORDS_BLOCK.push('nat.min.js', 'twitchAdServer.js', 'player-ad-aws.js', 'assets.adobedtm.com');
    const AD_OVERLAY_SELECTORS_CSS = ['.video-player__ad-info-container', 'span[data-a-target="video-ad-label"]', 'span[data-a-target="video-ad-countdown"]', 'button[aria-label*="feedback for this Ad"]', '.player-ad-notice', '.ad-interrupt-screen', 'div[data-test-selector="ad-banner-default-text-area"]', 'div[data-test-selector="ad-display-root"]', '.persistent-player__ad-container', '[data-a-target="advertisement-notice"]', 'div[data-a-target="ax-overlay"]', '[data-test-selector="sad-overlay"]', 'div[class*="video-ad-label"]', '.player-ad-overlay', 'div[class*="advertisement"]', 'div[class*="-ad-"]', 'div[data-a-target="sad-overlay-container"]', 'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]', 'div[data-a-target="request-ad-block-disable-modal"]'];
    const AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST = ['div[data-a-target="player-ad-overlay"]', 'div[data-test-selector="ad-interrupt-overlay__player-container"]', 'div[aria-label="Advertisement"]', 'iframe[src*="amazon-adsystem.com"]', 'iframe[src*="doubleclick.net"]', 'iframe[src*="imasdk.googleapis.com"]', '.player-overlay-ad', '.tw-player-ad-overlay', '.video-ad-display', 'div[data-ad-placeholder="true"]', '[data-a-target="video-ad-countdown-container"]', '.promoted-content-card', 'div[class*="--ad-banner"]', 'div[data-ad-unit]', 'div[class*="player-ads"]', 'div[data-ad-boundary]', 'div[data-a-target="sad-overlay-container"]', 'div[data-test-selector="sad-overlay-v-one-container"]', 'div[data-test-selector*="sad-overlay"]', 'div[data-a-target="request-ad-block-disable-modal"]']; // <<< ИСПРАВЛЕНИЕ: Добавлен селектор сюда
    if (HIDE_COOKIE_BANNER) AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST.push('.consent-banner');
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;

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
    function logModuleTrace(moduleFlag, source, message, ...args) { if (moduleFlag) console.debug(`${LOG_PREFIX} [${source}] TRACE:`, message, ...args.map(arg => typeof arg === 'string' && arg.length > 150 ? arg.substring(0, 150) + '...' : arg)); }

    function injectCSS() {
        let cssToInject = '';
        if (HIDE_AD_OVERLAY_ELEMENTS) cssToInject += `${AD_OVERLAY_SELECTORS_CSS.join(',\n')} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }\n`;
        if (HIDE_COOKIE_BANNER) cssToInject += `.consent-banner { display: none !important; }\n`;
        if (cssToInject) try { GM_addStyle(cssToInject); } catch (e) { logError('CSSInject', 'CSS apply failed:', e); }
    }

    function forceMaxQuality() {
        try {
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
            logCoreDebug('ForceQuality', 'Механизм форсирования качества в фоне активирован.');
        } catch (e) { logError('ForceQuality', 'Не удалось активировать форсирование качества.', e); }
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
                logCoreDebug('QualitySet', 'Forced video quality to "chunked".');
            }
        } catch (e) {
            logError('QualitySet', 'Set quality error:', e);
            cachedQualityValue = null;
        }
    }

    function hookQualitySettings() {
        try {
            unsafeWindow.localStorage.setItem = function(key, value) {
                if (key === LS_KEY_QUALITY && value !== TARGET_QUALITY_VALUE) {
                    cachedQualityValue = TARGET_QUALITY_VALUE;
                    return originalLocalStorageSetItem.call(unsafeWindow.localStorage, key, TARGET_QUALITY_VALUE);
                }
                return originalLocalStorageSetItem.apply(this, arguments);
            };
            cachedQualityValue = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
            setQualitySettings(true);
        } catch(e) {
            logError('QualitySet:Hook', 'localStorage.setItem hook error:', e);
            if(originalLocalStorageSetItem) unsafeWindow.localStorage.setItem = originalLocalStorageSetItem;
        }
    }

    function parseAndCleanM3U8(m3u8Text, url = "N/A") {
        const adFound = /#EXT-X-DATERANGE:.*(stitched-ad|TWITCH-AD-SIGNAL|ADVERTISING|PROMOTIONAL|SPONSORED)/.test(m3u8Text) || /#EXT-X-ASSET:/.test(m3u8Text);
        if (!adFound) return { cleanedText: m3u8Text, adFound: false };

        const lines = m3u8Text.split('\n');
        const cleanLines = [];
        let isAdSection = false;

        for (const line of lines) {
            if (line.includes('stitched-ad') || line.includes('TWITCH-AD-SIGNAL')) {
                isAdSection = true;
                continue;
            } else if (isAdSection && (line.startsWith('#EXTINF') || line.startsWith('#EXT-X-CUE-IN'))) {
                isAdSection = false;
            }
            if (!isAdSection) {
                cleanLines.push(line);
            }
        }
        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'M3U8Clean', `M3U8 содержал рекламу и был очищен. URL: ${url}`);
        return { cleanedText: cleanLines.join('\n'), adFound: true };
    }

    function getWorkerInjectionCode() {
        return `
        const SCRIPT_VERSION_WORKER = '${SCRIPT_VERSION}';
        const LOG_PREFIX_WORKER = '[TTV ADBLOCK ULT v' + SCRIPT_VERSION_WORKER + '] [WORKER]';
        const originalFetch = self.fetch;

        self.fetch = async function(input, init) {
            let requestUrl = (input instanceof Request) ? input.url : String(input);
            if (requestUrl.toLowerCase().endsWith('.m3u8') && requestUrl.includes('usher.ttvnw.net')) {
                try {
                    const response = await originalFetch.apply(this, arguments);
                    if (response.ok) {
                        let text = await response.clone().text();
                        if (/#EXT-X-DATERANGE:.*(stitched-ad|TWITCH-AD-SIGNAL)/.test(text) || /#EXT-X-ASSET:/.test(text)) {
                            const cleanLines = text.split('\\n').filter(line => !line.includes('stitched-ad') && !line.includes('TWITCH-AD-SIGNAL') && !line.includes('#EXT-X-ASSET'));
                            text = cleanLines.join('\\n');
                            const newHeaders = new Headers(response.headers);
                            newHeaders.delete('Content-Length');
                            return new Response(text, { status: response.status, statusText: response.statusText, headers: newHeaders });
                        }
                    }
                    return response;
                } catch (e) {
                    return originalFetch.apply(this, arguments);
                }
            }
            return originalFetch.apply(this, arguments);
        };
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
                    if (opData.data) {
                        opData.data.ads = []; opData.data.clientAd = null; opData.data.companionSlots = []; opData.data.playerAdParams = null;
                        currentOpModified = true;
                    }
                } else if (operationName === "Interstitials") {
                    if (opData.data?.stream?.interstitials?.length > 0) {
                        opData.data.stream.interstitials = [];
                        currentOpModified = true;
                    }
                } else if (opData.data?.stream?.playbackAccessToken && typeof opData.data.stream.playbackAccessToken.value === 'string') {
                    try {
                        const tokenValue = JSON.parse(opData.data.stream.playbackAccessToken.value);
                        if (tokenValue.hide_ads === false || tokenValue.show_ads === true) {
                            tokenValue.hide_ads = true;
                            tokenValue.show_ads = false;
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

    async function fetchNewPlaybackAccessToken(channelName, deviceId) {
        logCoreDebug('TokenSwap', `(1/2) Запрос анонимного PlaybackAccessToken для канала: ${channelName}`);
        const requestPayload = {
            operationName: "PlaybackAccessToken_Template",
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature authorization { isForbidden forbiddenReasonCode } __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }}',
            variables: { isLive: true, login: channelName, isVod: false, vodID: "", playerType: "site" }
        };
        const headers = { 'Content-Type': 'application/json', 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' };
        if (deviceId) headers['Device-ID'] = deviceId;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", url: GQL_URL, headers: headers, data: JSON.stringify(requestPayload),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const token = JSON.parse(response.responseText)?.data?.streamPlaybackAccessToken;
                            if (token) {
                                logCoreDebug('TokenSwap', `(1/2) Успешно получен анонимный токен.`);
                                resolve(token);
                            } else { reject('Анонимный токен не найден в ответе GraphQL.'); }
                        } catch (e) { reject(`Ошибка парсинга ответа GraphQL: ${e}`); }
                    } else { reject(`Ошибка запроса GraphQL: статус ${response.status}`); }
                },
                onerror: (error) => reject(`Сетевая ошибка при запросе GraphQL: ${error}`)
            });
        });
    }

    async function fetchNewUsherM3U8(originalUsherUrl, newAccessToken) {
        logCoreDebug('MidrollRecovery', `(2/3) Запрос нового M3U8 манифеста.`);
        const url = new URL(originalUsherUrl);
        url.searchParams.set('token', newAccessToken.value);
        url.searchParams.set('sig', newAccessToken.signature);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url: url.href, responseType: "text",
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        logCoreDebug('MidrollRecovery', `(2/3) Успешно получен новый M3U8 манифест.`);
                        resolve(response.responseText);
                    } else { reject(`Ошибка запроса нового M3U8: статус ${response.status}`); }
                },
                onerror: (error) => reject(`Сетевая ошибка при запросе нового M3U8: ${error}`)
            });
        });
    }

    async function fetchOverride(input, init) {
        let requestUrl = (input instanceof Request) ? input.url : String(input);
        const lowerCaseUrl = requestUrl.toLowerCase();

        if (AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()))) {
            logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'FetchBlock', `Заблокирован fetch-запрос к ${requestUrl}`);
            return new Response(null, { status: 403, statusText: 'Blocked by TTV Adblock Ultimate' });
        }

        if (lowerCaseUrl.includes('usher.ttvnw.net') && TWITCH_MANIFEST_PATH_REGEX.test(lowerCaseUrl)) {
            if (PROACTIVE_TOKEN_SWAP_ENABLED && cachedCleanToken) {
                logCoreDebug('TokenSwap', `(2/2) Подменяем токен в URL для usher.ttvnw.net`);
                const url = new URL(requestUrl);
                url.searchParams.set('token', cachedCleanToken.value);
                url.searchParams.set('sig', cachedCleanToken.signature);
                requestUrl = url.href;
                cachedCleanToken = null;
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: requestUrl, responseType: "text",
                    onload: async (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            let { cleanedText, adFound } = parseAndCleanM3U8(response.responseText, requestUrl);
                            if (adFound && ENABLE_MIDROLL_RECOVERY) {
                                logWarn('MidrollRecovery', `Обнаружена реклама в M3U8. Запускаю механизм восстановления...`);
                                try {
                                    const urlParams = new URL(requestUrl).searchParams;
                                    const channelName = urlParams.get('login') || urlParams.get('channel');
                                    if (!channelName) throw new Error("Не удалось определить имя канала из URL.");
                                    const deviceId = new Headers(init?.headers).get('Device-ID');
                                    const newAccessToken = await fetchNewPlaybackAccessToken(channelName, deviceId);
                                    const newM3u8Text = await fetchNewUsherM3U8(requestUrl, newAccessToken);
                                    const finalCleanedResult = parseAndCleanM3U8(newM3u8Text, "RECOVERY_URL");
                                    logCoreDebug('MidrollRecovery', `(3/3) Восстановление успешно. Используется новый, чистый манифест.`);
                                    cleanedText = finalCleanedResult.cleanedText;
                                } catch (e) {
                                    logError('MidrollRecovery', `Ошибка восстановления, возврат к простой очистке. Причина: ${e}`);
                                }
                            }
                            resolve(new Response(cleanedText, { status: 200, statusText: "OK", headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }));
                        } else { reject(new TypeError(`GM_xmlhttpRequest failed: ${response.statusText || response.status}`)); }
                    },
                    onerror: (error) => reject(new TypeError('Network error'))
                });
            });
        }

        const originalResponse = await originalFetch(input, init);

        if (lowerCaseUrl.startsWith(GQL_URL) && originalResponse.ok) {
            const responseText = await originalResponse.clone().text();
            try {
                const data = JSON.parse(responseText);
                const operationName = Array.isArray(data) ? data[0]?.extensions?.operationName : data.extensions?.operationName;
                const deviceId = new Headers(init?.headers).get('Device-ID');

                if (PROACTIVE_TOKEN_SWAP_ENABLED && (operationName === 'PlaybackAccessToken' || operationName === 'PlaybackAccessToken_Template')) {
                    const channelName = (Array.isArray(data) ? data[0]?.data?.streamPlaybackAccessToken : data.data?.streamPlaybackAccessToken) ? (Array.isArray(data) ? data[0]?.variables?.login : data.variables?.login) : null;
                    if (channelName) {
                        fetchNewPlaybackAccessToken(channelName, deviceId)
                            .then(token => { cachedCleanToken = token; })
                            .catch(e => logError('TokenSwap', 'Не удалось проактивно получить чистый токен.', e));
                    }
                }

                const modifiedText = modifyGqlResponse(responseText, requestUrl);
                if (modifiedText !== responseText) {
                    const newHeaders = new Headers(originalResponse.headers);
                    newHeaders.delete('Content-Length');
                    return new Response(modifiedText, { status: originalResponse.status, statusText: originalResponse.statusText, headers: newHeaders });
                }
            } catch (e) { /* Игнорируем ошибки парсинга */ }
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

        if (AD_URL_KEYWORDS_BLOCK.some(keyword => lowerCaseUrl.includes(keyword.toLowerCase()))) {
            logModuleTrace(LOG_NETWORK_BLOCKING_DEBUG, 'XHRBlock', `Blocked XHR to ${urlString}`);
            this.dispatchEvent(new Event('error'));
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
                        logModuleTrace(LOG_GQL_MODIFY_DEBUG, 'MainXHR_GQL', `Modified GQL for ${urlString}`);
                    }
                }
            }, { once: true });
        }
        originalXhrSend.apply(this, arguments);
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
                logCoreDebug('WorkerHook', `Intercepted Worker creation for: ${urlString}`);
                return workerInstance;
            }
        };
        unsafeWindow.Worker.hooked_by_adblock_ult = true;
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
        logCoreDebug('HookInstall', 'Все хуки успешно установлены.');
    }

    function removeDOMAdElements() {
        if (!ATTEMPT_DOM_AD_REMOVAL) return;
        if (!adRemovalObserver) {
            adRemovalObserver = new MutationObserver(() => removeDOMAdElements());
            adRemovalObserver.observe(document.body, { childList: true, subtree: true });
        }
        AD_DOM_ELEMENT_SELECTORS_TO_REMOVE_LIST.forEach(selector => document.querySelectorAll(selector).forEach(el => el.remove()));
    }

    function triggerReload(reason) {
        if (!ENABLE_AUTO_RELOAD) return;
        const now = Date.now();
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS || reloadCount >= MAX_RELOADS_PER_SESSION) {
            logWarn('ReloadTrigger', `Перезагрузка пропущена: ${reason} (слишком часто или превышен лимит)`);
            return;
        }
        lastReloadTimestamp = now;
        reloadCount++;
        logCoreDebug('ReloadTrigger', `Перезагрузка страницы: ${reason}`);
        unsafeWindow.location.reload();
    }

    function setupVideoPlayerMonitor() {
        if (videoPlayerMutationObserver || !ENABLE_AUTO_RELOAD) return;
        videoPlayerMutationObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newVideoElement = node.querySelector('video') || (node.tagName === 'VIDEO' ? node : null);
                            if (newVideoElement && newVideoElement !== videoElement) {
                                videoElement = newVideoElement;
                                logCoreDebug('PlayerMonitor', 'Обнаружен новый элемент <video>.');
                                videoElement.addEventListener('error', (e) => {
                                    const errorCode = e?.target?.error?.code;
                                    if (errorCode && RELOAD_ON_ERROR_CODES.includes(errorCode)) {
                                        logError('PlayerMonitor', `Ошибка плеера с кодом ${errorCode}. Перезагрузка.`);
                                        triggerReload(`Ошибка плеера (код ${errorCode})`);
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
        logCoreDebug('PlayerMonitor', 'MutationObserver для видеоплеера запущен.');
    }

    function startErrorScreenObserver() {
        if (!ENABLE_AUTO_RELOAD || errorScreenObserver) return;
        errorScreenObserver = new MutationObserver(() => {
            if (document.querySelector('[data-a-target="player-error-screen"]')) {
                logError('ErrorScreenObserver', 'Обнаружен экран ошибки Twitch. Перезагрузка.');
                triggerReload('Обнаружен экран ошибки плеера');
            }
        });
        errorScreenObserver.observe(document.body, { childList: true, subtree: true });
        logCoreDebug('ErrorScreenObserver', 'MutationObserver для экрана ошибки запущен.');
    }

    function initializeScript() {
        injectCSS();
        if (FORCE_MAX_QUALITY_IN_BACKGROUND) {
            forceMaxQuality();
        }
        hookQualitySettings();
        installHooks();
        removeDOMAdElements();
        startErrorScreenObserver();
        setupVideoPlayerMonitor();
        logCoreDebug('Initialize', 'Скрипт успешно инициализирован.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript, { once: true });
    } else {
        initializeScript();
    }

})();