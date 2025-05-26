// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      19.1.5
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

    const SCRIPT_VERSION = '19.1.5'; // Версия обновлена

    const INJECT_INTO_WORKERS = GM_getValue('TTV_AdBlock_InjectWorkers', false);
    const MODIFY_GQL_RESPONSE = GM_getValue('TTV_AdBlock_ModifyGQL', true);
    const ENABLE_AUTO_RELOAD = GM_getValue('TTV_AdBlock_EnableAutoReload', false);
    const BLOCK_NATIVE_ADS_SCRIPT = GM_getValue('TTV_AdBlock_BlockNatScript', true);
    const HIDE_AD_OVERLAY_ELEMENTS = GM_getValue('TTV_AdBlock_HideAdOverlay', true);
    const ATTEMPT_DOM_AD_REMOVAL = GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true);
    const HIDE_COOKIE_BANNER = GM_getValue('TTV_AdBlock_HideCookieBanner', true);

    const SHOW_ERRORS_CONSOLE = false;
    const CORE_DEBUG_LOGGING = GM_getValue('TTV_AdBlock_Debug_Core', false);
    const LOG_WORKER_INJECTION_DEBUG = GM_getValue('TTV_AdBlock_Debug_WorkerInject', false);
    const LOG_PLAYER_MONITOR_DEBUG = GM_getValue('TTV_AdBlock_Debug_PlayerMon', false);
    const LOG_M3U8_CLEANING_DEBUG = GM_getValue('TTV_AdBlock_Debug_M3U8', false);
    const LOG_GQL_MODIFY_DEBUG = GM_getValue('TTV_AdBlock_Debug_GQL', false);

    const RELOAD_ON_ERROR_CODES_RAW = GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', '2, 3, 4, 9, 10, 1000, 2000, 3000, 4000, 5000, 6001');
    // Изменения для уменьшения вероятности ненужных перезагрузок
    const RELOAD_STALL_THRESHOLD_MS = GM_getValue('TTV_AdBlock_StallThresholdMs', 6000); // Было 3000
    const RELOAD_BUFFERING_THRESHOLD_MS = GM_getValue('TTV_AdBlock_BufferingThresholdMs', 20000); // Было 15000
    const RELOAD_COOLDOWN_MS = GM_getValue('TTV_AdBlock_ReloadCooldownMs', 45000); // Было 35000

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

        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `Начало парсинга для: ${urlFilename}`);
        if (!m3u8Text || typeof m3u8Text !== 'string') {
            logWarn(context, `(${urlFilename}): Некорректный/пустой M3U8 текст.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
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
        } else if (upperM3U8Text.includes("#EXT-X-TWITCH-PREFETCH:")) { // Добавлено для PREFETCH
            potentialAdContent = true;
        } else if (AD_DATERANGE_REGEX && AD_DATERANGE_REGEX.test(m3u8Text)) {
            potentialAdContent = true;
        }


        if (!potentialAdContent) {
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}): Рекламные маркеры не найдены, пропуск очистки.`);
            return { cleanedText: m3u8Text, adsFound: false, linesRemoved: 0 };
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
            let isAdMarkerLine = false; // Флаг, что эта строка сама по себе является рекламным маркером (а не сегментом в рекламной секции)
            let reason = '';

            // Сначала проверяем маркеры начала рекламы или одиночные рекламные теги
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
            } else if (upperTrimmedLine.startsWith('#EXT-X-CUE-OUT')) {
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; reason = 'CUE-OUT';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
                discontinuityPending = true;
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-AD-SIGNAL')) {
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; discontinuityPending = false; reason = 'AD-SIGNAL';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
            } else if (upperTrimmedLine.startsWith('#EXT-X-SCTE35:')) {
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; isAdSection = true; discontinuityPending = false; reason = 'SCTE35';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=true: ${trimmedLine.substring(0, 100)}`);
            } else if (upperTrimmedLine.startsWith('#EXT-X-TWITCH-PREFETCH:')) { // Добавлено
                shouldRemoveLine = true; isAdMarkerLine = true; adsFound = true; reason = 'TWITCH-PREFETCH';
                logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove: ${trimmedLine.substring(0, 100)}`);
                // isAdSection не устанавливается, так как PREFETCH может быть для одиночного сегмента
            }
            // Затем обрабатываем строки, если мы УЖЕ в рекламной секции
            else if (isAdSection) {
                if (upperTrimmedLine.startsWith('#EXT-X-CUE-IN')) {
                    shouldRemoveLine = true; isAdMarkerLine = true; reason = 'CUE-IN'; isAdSection = false; discontinuityPending = false;
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove, isAdSection=false (end of ad section)`);
                } else if (upperTrimmedLine.startsWith('#EXTINF:')) {
                    // Если мы в рекламной секции и встречаем #EXTINF:, это значит, что реклама закончилась, и начался контент.
                    isAdSection = false; discontinuityPending = false; // Сбрасываем флаг, так как это контент
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: #EXTINF: found in ad section -> keep, isAdSection=false (assuming content starts)`);
                    // shouldRemoveLine остается false, #EXTINF: и следующий за ним сегмент будут сохранены
                } else if (upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                    if (discontinuityPending) {
                        shouldRemoveLine = true; isAdMarkerLine = true; reason = 'DISCONTINUITY (after cue-out)'; discontinuityPending = false;
                        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove`);
                    } else {
                        logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: DISCONTINUITY in ad section (not after cue-out) -> keep`);
                        // shouldRemoveLine остается false, сам DISCONTINUITY сохраняется
                    }
                } else if (!trimmedLine.startsWith('#') && trimmedLine !== '') { // Это URL сегмента
                    shouldRemoveLine = true; reason = 'Segment in Ad Section';
                    // discontinuityPending не сбрасываем здесь, если он был true и это первый сегмент после CUE-OUT
                    logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `(${urlFilename}) L${i+1}: ${reason} -> remove: ${trimmedLine.substring(0, 100)}`);
                } else {
                    // Другие теги (#EXT-X-PROGRAM-DATE-TIME и т.д.) внутри рекламной секции.
                    // Если они не являются маркерами начала/конца или важными для структуры, их можно было бы удалить.
                    // Но для безопасности, если это тег, и он не был помечен на удаление выше, он останется.
                    // Если после CUE-OUT идет не DISCONTINUITY и не сегмент, сбрасываем discontinuityPending.
                    if (discontinuityPending && !upperTrimmedLine.startsWith('#EXT-X-DISCONTINUITY')) {
                        discontinuityPending = false;
                    }
                }
            } else { // Не в рекламной секции
                discontinuityPending = false; // Если мы не в рекламной секции, сбрасываем ожидание
            }


            if (!shouldRemoveLine) {
                cleanLines.push(line);
            } else {
                linesRemoved++;
            }
        }

        if (isAdSection) {
            logWarn(context, `(${urlFilename}): M3U8 завершился, но скрипт все еще считает, что находится в рекламной секции. Возможно, отсутствует #EXT-X-CUE-IN или #EXTINF: контента.`);
        }

        const cleanedText = cleanLines.join('\n');
        if (adsFound) {
            logCoreDebug(context, `(${urlFilename}): Завершено. Удалено строк: ${linesRemoved}.`);
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

                    const isM3U8Request = lowerCaseUrl.endsWith('.m3u8') || (init?.headers?.['Accept'] || '').toLowerCase().includes('mpegurl');

                    workerLogCoreDebug(`[${context}] Intercepted: ${method} ${urlFilename}`);

                    if (method === 'GET' && isM3U8Request) {
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
                                        workerLogM3U8Trace('Received processed M3U8 from main script for: ' + urlFilename);
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
                if (e.data?.type === 'PING') {
                    self.postMessage({ type: 'PONG' });
                } else if (e.data?.type === 'EVAL_ADBLOCK_CODE') {
                    workerLogCoreDebug("[WorkerInject:Msg] Received EVAL_ADBLOCK_CODE. Re-attempting hook installation/signal.");
                    attemptHookInstallationAndSignal();
                } else if (e.data && e.data.type !== 'ADBLOCK_M3U8_RESPONSE') {
                    workerLogCoreDebug("[WorkerInject:Msg] Received unhandled message from main script:", e.data?.type || e.data);
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
        logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Проверка GQL ответа от ${urlShort}...`);

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
                    logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Пропуск GQL (неизвестная или нецелевая операция): ${operationName}. Для детального лога включите AGGRESSIVE_GQL_SCAN и LOG_GQL_MODIFY_DEBUG.`);
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

        let isBlockedByKeyword = false;
        try {
            const requestHostname = new URL(requestUrl).hostname.toLowerCase();
            if (blockedUrlKeywordsSet.has(requestHostname) || AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) {
                } else {
                    logWarn(context, `БЛОКИРОВКА Fetch (${method}): ${requestUrl}`);
                    isBlockedByKeyword = true;
                }
            }
        } catch (urlError) {
            if (!(urlError.message.includes("Invalid URL") && requestUrl.startsWith("blob:"))) {
                logWarn(context, `URL Parsing Error for Fetch: "${requestUrl}": ${urlError.message}`);
            }
            if (AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) { }
                else { logWarn(context, `БЛОКИРОВКА Fetch (${method}) (fallback on URL parse error): ${requestUrl}`); isBlockedByKeyword = true; }
            }
        }

        if (isBlockedByKeyword) {
            return Promise.resolve(new Response(null, { status: 403, statusText: "Blocked by TTV AdBlock Ultimate" }));
        }

        const isM3U8Request = lowerCaseUrl.includes('.m3u8') || (init?.headers?.['Accept'] || '').toLowerCase().includes('mpegurl');
        if (method === 'GET' && isM3U8Request && requestUrl.includes('usher.ttvnw.net')) {
            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, context, `Перехват Usher M3U8 для GM_xmlhttpRequest: ${urlShortForLog}`);
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: requestUrl,
                    headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
                    responseType: "text",
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            const { cleanedText, adsFound, linesRemoved } = parseAndCleanM3U8(response.responseText, requestUrl);
                            if (adsFound) { logCoreDebug(context, `GM_xmlhttpRequest: ${urlShortForLog} ОЧИЩЕН. ${linesRemoved} строк удалено.`); }

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
                            logError(context, `GM_xmlhttpRequest для ${urlShortForLog} не удался: ${response.status} ${response.statusText}`);
                            reject(new TypeError(`GM_xmlhttpRequest failed: ${response.statusText || response.status}`));
                        }
                    },
                    onerror: function(error) { logError(context, `GM_xmlhttpRequest для ${urlShortForLog} ошибка сети:`, error); reject(new TypeError('Network error')); },
                    ontimeout: function() { logError(context, `GM_xmlhttpRequest для ${urlShortForLog} таймаут.`); reject(new TypeError('Timeout')); }
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
                return Promise.resolve(new Response(null, { status: 0, statusText: `Simulated Network Error or Blocked by Client` }));
            } else if (error instanceof DOMException && error.name === 'AbortError') {
                logModuleTrace(CORE_DEBUG_LOGGING, context, `Fetch aborted: ${urlShortForLog}`);
                return Promise.resolve(new Response(null, { status: 0, statusText: "Fetch aborted" }));
            }
            else { logError(context, `Unexpected fetch error for ${urlShortForLog}:`, error); }
            throw error;
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
        try {
            const requestHostname = new URL(urlString).hostname.toLowerCase();
            if (blockedUrlKeywordsSet.has(requestHostname) || AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) { }
                else { logWarn(context, `ПОМЕТКА XHR для блокировки: ${urlString}`); blocked = true; }
            }
        } catch (urlError) {
            if (!(urlError.message.includes("Invalid URL") && urlString.startsWith("blob:"))) {
                logWarn(context, `URL Parsing Error for XHR Open: "${urlString}": ${urlError.message}`);
            }
            if (AD_URL_KEYWORDS_BLOCK.some(k => lowerCaseUrl.includes(k.toLowerCase()))) {
                if (lowerCaseUrl.includes('nat.min.js') && !BLOCK_NATIVE_ADS_SCRIPT) { }
                else { logWarn(context, `ПОМЕТКА XHR для блокировки (fallback on URL parse error): ${urlString}`); blocked = true; }
            }
        }

        xhrRequestData.set(this, { method: method.toUpperCase(), url: urlString, urlShort: urlShortForLog, blocked: blocked, isGql: isGqlRequest });

        if (isGqlRequest && MODIFY_GQL_RESPONSE) {
            this.addEventListener('load', function() {
                if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
                    const reqData = xhrRequestData.get(this);
                    if (reqData?.isGql) {
                        const originalResponseText = this.responseText;
                        if (typeof originalResponseText !== 'string' || originalResponseText.length === 0) return;

                        const modifiedText = modifyGqlResponse(originalResponseText, reqData.url);
                        xhrRequestData.set(this, { ...reqData, modifiedResponse: modifiedText !== originalResponseText ? modifiedText : null });
                    }
                }
            }, { once: true, passive: true });
        }

        if (!blocked) {
            try { return originalXhrOpen.apply(this, arguments); }
            catch (error) { logError(context, `originalXhrOpen error for ${urlShortForLog}:`, error); throw error; }
        } else {
            try { originalXhrOpen.apply(this, arguments); } catch(e) { }
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
            this.dispatchEvent(new ProgressEvent('abort'));
            this.dispatchEvent(new ProgressEvent('error'));
            try {
                Object.defineProperty(this, 'readyState', { value: 4, writable: false, configurable: true });
                Object.defineProperty(this, 'status', { value: 0, writable: false, configurable: true });
            } catch (e) { }
            return;
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
        const context = 'GQL:XhrGetter';
        if (MODIFY_GQL_RESPONSE) {
            if (originalXhrResponseGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.isGql && reqData.modifiedResponse !== undefined && reqData.modifiedResponse !== null && (this.responseType === '' || this.responseType === 'text')) {
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Возврат модифицированного 'response' для ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseGetter.get.call(this); }
                        catch (getterError) { logWarn(context, `XHR 'response' getter error for ${reqData?.urlShort || 'unknown XHR'}: ${getterError.message}`); return null;}
                    },
                    configurable: true
                });
            }
            if (originalXhrResponseTextGetter?.get) {
                Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
                    get: function() {
                        const reqData = xhrRequestData.get(this);
                        if (reqData?.isGql && reqData.modifiedResponse !== undefined && reqData.modifiedResponse !== null) {
                            logModuleTrace(LOG_GQL_MODIFY_DEBUG, context, `Возврат модифицированного 'responseText' для ${reqData.urlShort}`);
                            return reqData.modifiedResponse;
                        }
                        try { return originalXhrResponseTextGetter.get.call(this); }
                        catch (getterError) { logWarn(context, `XHR 'responseText' getter error for ${reqData?.urlShort || 'unknown XHR'}: ${getterError.message}`); return "";}
                    },
                    configurable: true
                });
            }
            logCoreDebug(context, `XHR геттеры 'response' и 'responseText' перехвачены для GQL.`);
        }
    }


    function handleMessageFromWorkerGlobal(event) {
        const msgData = event.data;
        if (msgData && typeof msgData.type === 'string') {
            const workerInstance = event.source;
            const workerLabel = Array.from(hookedWorkers.entries()).find(([key, value]) => value.instance === workerInstance)?.[0] || 'UnknownWorker';

            if (msgData.type === 'ADBLOCK_WORKER_HOOKS_READY') {
                logCoreDebug('WorkerInject:Confirm', `Получен сигнал ADBLOCK_WORKER_HOOKS_READY от Worker (${workerLabel}, Method: ${msgData.method || 'N/A'})`);
                const workerState = hookedWorkers.get(workerLabel);
                if (workerState) workerState.hooksReady = true;
                else logWarn('WorkerInject:Confirm', `HOOKS_READY от неизвестного Worker: ${workerLabel}`);
            } else if (msgData.type === 'PONG') {
                const workerState = hookedWorkers.get(workerLabel);
                if (workerState) workerState.lastPong = Date.now();
                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, 'WorkerInject:Pinger', `PONG received from ${workerLabel}`);
            } else if (msgData.type === 'ADBLOCK_FETCH_M3U8_REQUEST') {
                logCoreDebug('MainWorkerComm', `Получен M3U8 запрос от Worker (${workerLabel}): ${msgData.url}`);
                const { url, initDetails, id } = msgData;
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
                            logModuleTrace(LOG_M3U8_CLEANING_DEBUG, 'MainWorkerComm', `Отправка успешного ответа для M3U8 ${id} (AdsFound: ${adsFound})`);
                        } else {
                            postData.error = `Failed GM_xmlhttpRequest: ${response.status} ${response.statusText}`;
                            postData.status = response.status;
                            postData.statusText = response.statusText;
                            logError('MainWorkerComm', `GM_xmlhttpRequest ошибка для M3U8 ${id}: ${postData.error}`);
                        }
                        try { workerInstance.postMessage(postData); }
                        catch (e) { logError('MainWorkerComm', `Ошибка postMessage обратно в Worker (${workerLabel}): ${e}`);}
                    },
                    onerror: function(error) {
                        logError('MainWorkerComm', `Сетевая ошибка GM_xmlhttpRequest для M3U8 ${id}:`, error);
                        try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Network error', status: 0, statusText: 'Network Error' }); }
                        catch (e) { logError('MainWorkerComm', `Ошибка postMessage обратно в Worker (${workerLabel}): ${e}`);}
                    },
                    ontimeout: function() {
                        logError('MainWorkerComm', `Таймаут GM_xmlhttpRequest для M3U8 ${id}.`);
                        try { workerInstance.postMessage({ type: 'ADBLOCK_M3U8_RESPONSE', id: id, error: 'Timeout', status: 0, statusText: 'Timeout' }); }
                        catch (e) { logError('MainWorkerComm', `Ошибка postMessage обратно в Worker (${workerLabel}): ${e}`);}
                    }
                });
            }
        }
    }

    function addWorkerMessageListeners(workerInstance, label) {
        if (!workerInstance || typeof workerInstance.addEventListener !== 'function' || workerInstance._listenersAddedByAdblock) return;
        workerInstance._listenersAddedByAdblock = true;
        workerInstance.addEventListener('message', handleMessageFromWorkerGlobal, { passive: true });
        workerInstance.addEventListener('error', (e) => {
            logError('WorkerInject:Error', `Ошибка внутри Worker (${label}):`, e.message, `(${e.filename}:${e.lineno}:${e.colno})`);
            hookedWorkers.delete(label);
        }, { passive: true });
        logCoreDebug('WorkerInject:MsgListenerSetup', `Слушатели сообщений добавлены для Worker (${label})`);
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
                let workerLabel = isBlobURL ? `blob:${urlString.substring(5, 35)}...` : (urlString.split(/[?#]/)[0].split('/').pop() || urlString.substring(0, 60));
                let isIVSWorker = workerLabel.includes('amazon-ivs-wasmworker') || workerLabel.includes('ivs-wasmworker');
                if(isIVSWorker) workerLabel += " (IVS)";

                logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Создание нового Worker: ${workerLabel} (Тип: ${isBlobURL ? 'Blob' : 'Script'}${isIVSWorker ? ', IVS Worker' : ''})`);

                let newWorkerInstance;
                try {
                    newWorkerInstance = super(scriptURL, options);
                    newWorkerInstance._workerLabel = workerLabel;
                    hookedWorkers.set(workerLabel, { instance: newWorkerInstance, lastPing: 0, lastPong: Date.now(), hooksReady: false });
                    addWorkerMessageListeners(newWorkerInstance, workerLabel);

                    if (!isIVSWorker) {
                        setTimeout(() => {
                            const workerState = hookedWorkers.get(workerLabel);
                            if (workerState && !workerState.hooksReady && !isBlobURL) {
                                logWarn(context, `Worker (${workerLabel}) не прислал сигнал HOOKS_READY. Попытка инъекции кода через postMessage...`);
                                try {
                                    const codeToInject = getWorkerInjectionCode();
                                    logCoreDebug(context, `Отправка EVAL_ADBLOCK_CODE в Worker (${workerLabel})...`);
                                    newWorkerInstance.postMessage({ type: 'EVAL_ADBLOCK_CODE', code: codeToInject });
                                } catch(e) {
                                    logError(context, `Ошибка postMessage (EVAL_ADBLOCK_CODE) для Worker (${workerLabel}):`, e);
                                    hookedWorkers.delete(workerLabel);
                                }
                            }
                        }, 300);
                    }

                } catch (constructorError) {
                    logError(context, `Ошибка конструктора HookedWorker для ${workerLabel}:`, constructorError);
                    hookedWorkers.delete(workerLabel);
                    throw constructorError;
                }
                return newWorkerInstance;
            }
        };

        try {
            Object.keys(OriginalWorker).forEach(key => { if (!unsafeWindow.Worker.hasOwnProperty(key)) { try { unsafeWindow.Worker[key] = OriginalWorker[key]; } catch(e){} } });
            Object.setPrototypeOf(unsafeWindow.Worker, OriginalWorker);
            Object.setPrototypeOf(unsafeWindow.Worker.prototype, OriginalWorker.prototype);
        } catch (e) { logError(context, "Не удалось восстановить прототип Worker:", e); }

        unsafeWindow.Worker.hooked_by_adblock_ult = true;
        logCoreDebug(context, "Worker конструктор успешно перехвачен.");
    }

    function startWorkerPinger() {
        const context = 'WorkerInject:Pinger';
        if (workerPingIntervalId || !INJECT_INTO_WORKERS || WORKER_PING_INTERVAL_MS <= 0) return;

        logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `Запуск Worker Pinger (интервал: ${WORKER_PING_INTERVAL_MS}ms).`);
        workerPingIntervalId = setInterval(() => {
            const now = Date.now();
            if (hookedWorkers.size === 0) return;

            hookedWorkers.forEach((state, label) => {
                try {
                    if (state.instance && typeof state.instance.postMessage === 'function') {
                        if (!state.hooksReady && !label.includes('(IVS)')) {
                            return;
                        }

                        const timeSinceLastPong = now - (state.lastPong || state.lastPing || 0);
                        if (state.lastPong !== 0 && timeSinceLastPong > WORKER_PING_INTERVAL_MS * 3.5) {
                            logWarn(context, `Worker (${label}) не отвечает на пинги (${Math.round(timeSinceLastPong/1000)}s). Удаление из списка.`);
                            hookedWorkers.delete(label);
                            return;
                        }
                        if(!(label.includes('(IVS)') && !state.hooksReady)) {
                            logModuleTrace(LOG_WORKER_INJECTION_DEBUG, context, `PING -> ${label}`);
                            state.instance.postMessage({ type: 'PING' });
                        }
                        state.lastPing = now;
                    } else {
                        logWarn(context, `Worker (${label}) не имеет postMessage или отсутствует. Удаление.`);
                        hookedWorkers.delete(label);
                    }
                } catch (e) {
                    logError(context, `Ошибка при отправке PING в Worker (${label}):`, e);
                    hookedWorkers.delete(label);
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
            if (MODIFY_GQL_RESPONSE) hookXhrGetters();
            logCoreDebug(context, "XMLHttpRequest перехвачен.");
        } catch (e) {
            logError(context, "Не удалось перехватить XMLHttpRequest:", e);
            if (originalXhrOpen) unsafeWindow.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) unsafeWindow.XMLHttpRequest.prototype.send = originalXhrSend;
            if (MODIFY_GQL_RESPONSE) {
                if (originalXhrResponseGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'response', originalXhrResponseGetter); } catch(revertErr) {}
                if (originalXhrResponseTextGetter) try { Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', originalXhrResponseTextGetter); } catch (revertErr) {}
            }
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
                        if (el.querySelector('video') || el.closest(PLAYER_SELECTORS_IMPROVED.join(','))) {
                            logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMRemove', `Пропуск удаления элемента ("${selector}") внутри плеера.`);
                            return;
                        }
                        logModuleTrace(ATTEMPT_DOM_AD_REMOVAL, 'DOMRemove', `Удаление элемента по селектору: "${selector}"`);
                        try { el.parentNode.removeChild(el); removedCount++; }
                        catch (removeError) {
                            if (!(removeError instanceof DOMException && removeError.name === 'NotFoundError')) {
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
        for (const selector of AD_DOM_PARENT_INDICATOR_SELECTORS) {
            const parentNode = document.querySelector(selector);
            if (parentNode) { observedNode = parentNode; break; }
        }
        if (!observedNode) observedNode = document.body || document.documentElement;

        logCoreDebug(context, `Наблюдение за DOM изменениями в:`, observedNode.tagName + (observedNode.id ? '#' + observedNode.id : '') + (observedNode.className ? '.' + observedNode.className.split(' ').join('.') : ''));

        const observerConfig = { childList: true, subtree: true };
        const callback = function(mutationsList) {
            let potentialAdNodeAdded = false;
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) {
                                if (adSelector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) continue;
                                if (node.matches && node.matches(adSelector)) { potentialAdNodeAdded = true; break; }
                            }
                            if (potentialAdNodeAdded) break;

                            if (!potentialAdNodeAdded) {
                                for (const adSelector of AD_DOM_ELEMENT_SELECTORS_TO_REMOVE) {
                                    if (adSelector === COOKIE_BANNER_SELECTOR && !HIDE_COOKIE_BANNER) continue;
                                    try { if (node.querySelector && node.querySelector(adSelector)) { potentialAdNodeAdded = true; break; } }
                                    catch(e){ }
                                }
                            }
                            if (potentialAdNodeAdded) break;

                            if (node.tagName === 'IFRAME' && AD_URL_KEYWORDS_BLOCK.some(keyword => node.src?.toLowerCase().includes(keyword))) {
                                potentialAdNodeAdded = true; break;
                            }
                        }
                    }
                }
                if (potentialAdNodeAdded) break;
            }
            if (potentialAdNodeAdded) { removeDOMAdElements(observedNode); }
        };
        adRemovalObserver = new MutationObserver(callback);
        try {
            adRemovalObserver.observe(observedNode, observerConfig);
            removeDOMAdElements(observedNode);
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
        if (videoElement && videoElement.isConnected && videoElement.closest('body')) {
            if (videoElement.offsetWidth > 0 && videoElement.offsetHeight > 0 && (videoElement.paused === false || videoElement.seeking === true || videoElement.readyState >= 3) ) return videoElement;
        }

        let foundElement = null;
        for (const selector of PLAYER_SELECTORS_IMPROVED) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    if (el && el.tagName === 'VIDEO' && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null && el.hasAttribute('src') && el.src.startsWith('blob:')) {
                        foundElement = el;
                        break;
                    }
                }
                if (foundElement) break;
                if (!foundElement && elements.length > 0) {
                    for (const el of elements) {
                        if (el && el.tagName === 'VIDEO' && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null) {
                            foundElement = el;
                            break;
                        }
                    }
                }
                if (foundElement) break;
            } catch (e) { }
        }

        if (foundElement && foundElement !== videoElement) { logCoreDebug('PlayerFind', 'Видео элемент найден/изменился.'); }
        else if (!foundElement && videoElement) { logWarn('PlayerFind', 'Видео элемент потерян.'); }
        else if (!foundElement) { logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerFind', 'Видео элемент не найден в данный момент.'); }

        videoElement = foundElement;
        return foundElement;
    }

    function observePlayerContainer() {
        if (playerFinderObserver) return;
        const targetNode = document.body || document.documentElement;
        if (!targetNode) { setTimeout(observePlayerContainer, 500); return; }

        const config = { childList: true, subtree: true };
        const callback = function(mutationsList, observer) {
            if (videoElement && videoElement.isConnected) return;

            const videoTags = targetNode.getElementsByTagName('video');
            let potentialPlayer = null;
            for (const video of videoTags) {
                if (video.src && video.src.startsWith('blob:') && video.isConnected && video.offsetWidth > 0 && video.offsetHeight > 0) {
                    potentialPlayer = video;
                    break;
                }
            }
            if (!potentialPlayer && videoTags.length > 0) {
                for (const video of videoTags) {
                    if (video.isConnected && video.offsetWidth > 0 && video.offsetHeight > 0) {
                        potentialPlayer = video;
                        break;
                    }
                }
            }

            if (potentialPlayer) {
                logCoreDebug('PlayerFind:Observer', 'Обнаружен потенциальный видеоплеер через getElementsByTagName, запуск/перезапуск монитора плеера.');
                setupPlayerMonitor();
            } else {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.tagName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                                    logCoreDebug('PlayerFind:Observer', 'Обнаружено добавление VIDEO элемента или его родителя, запуск/перезапуск монитора плеера.');
                                    setupPlayerMonitor();
                                    return;
                                }
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
            stopObservingPlayerContainer();
            stopAdRemovalObserver();
            stopWorkerPinger();
            logCoreDebug(context, 'Авто-перезагрузка отключена, монитор плеера деактивирован.');
            return;
        }

        const currentVideoElement = findVideoPlayer();
        if (!currentVideoElement) {
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners();
            videoElement = null;
            stopAdRemovalObserver();
            if (!playerFinderObserver) observePlayerContainer();
            logCoreDebug(context, 'Видео элемент не найден. Запущен/продолжает работать MutationObserver для его поиска.');
            return;
        }
        stopObservingPlayerContainer();


        if (currentVideoElement !== videoElement || !playerMonitorIntervalId) {
            logCoreDebug(context, `Видео элемент найден/изменился. Инициализация монитора...`);
            if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            if (videoElement) removePlayerEventListeners();

            videoElement = currentVideoElement;
            checkReloadCooldown(context);
            addPlayerEventListeners();
            resetMonitorState('Monitor setup/reset');

            if (ATTEMPT_DOM_AD_REMOVAL) startAdRemovalObserver();

            if (!document.hidden) {
                playerMonitorIntervalId = setInterval(monitorPlayerState, 2000);
                logCoreDebug(context, 'Интервал мониторинга состояния плеера запущен.');
            } else {
                logCoreDebug(context, 'Вкладка неактивна, интервал мониторинга не запущен.');
            }
        }
    }

    function triggerReload(reason) {
        const context = 'PlayerMon:Reload';
        const now = Date.now();
        if (!ENABLE_AUTO_RELOAD) return;

        if (reloadTimeoutId) {
            logWarn(context, `Перезагрузка (${reason}) запрошена, но другая перезагрузка уже запланирована (${reloadTimeoutId._reason || '?'}). Игнорирование.`);
            return;
        }
        if (now - lastReloadTimestamp < RELOAD_COOLDOWN_MS) {
            logWarn(context, `Перезагрузка (${reason}) отменена: активен кулдаун перезагрузки (${((RELOAD_COOLDOWN_MS - (now - lastReloadTimestamp))/1000).toFixed(1)}с осталось).`);
            return;
        }
        if (document.hidden) {
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
        try { sessionStorage.setItem('ttv_adblock_last_reload', now.toString()); } catch (e) {}

        if (playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
        playerMonitorIntervalId = null;
        removePlayerEventListeners();
        stopObservingPlayerContainer();
        stopAdRemovalObserver();
        stopWorkerPinger();

        unsafeWindow.location.reload();
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
            const internalReason = reloadTimeoutId?._reason || reason;
            reloadTimeoutId = null;
            triggerReload(internalReason);
        }, delayMs);
        try { if (reloadTimeoutId) reloadTimeoutId._reason = reason; } catch(e){}
    }

    function resetMonitorState(reason = '') {
        if (reloadTimeoutId) {
            const currentReloadReason = reloadTimeoutId._reason || '';
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
        isWaitingForDataTimestamp = 0;
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

        if (!videoElement || !videoElement.isConnected || !videoElement.closest('body')) {
            logWarn(context, 'Видео элемент потерян во время мониторинга. Перезапуск процедуры настройки монитора.');
            if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
            playerMonitorIntervalId = null;
            if (videoElement) removePlayerEventListeners();
            videoElement = null;
            stopAdRemovalObserver();
            setupPlayerMonitor();
            return;
        }

        if (videoElement && videoElement.src) {
            const currentQualityInStorage = originalLocalStorageGetItem.call(unsafeWindow.localStorage, LS_KEY_QUALITY);
            if (currentQualityInStorage !== TARGET_QUALITY_VALUE) {
                logWarn(context, `Качество видео в localStorage ('${currentQualityInStorage}') отклонилось от целевого ('${TARGET_QUALITY_VALUE}'). Принудительная установка.`);
                setQualitySettings(true);
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
                const nearBufferEnd = bufferEnd - currentTime < 1.5;
                if (readyState < videoElement.HAVE_FUTURE_DATA || networkState === videoElement.NETWORK_IDLE || networkState === videoElement.NETWORK_EMPTY || (nearBufferEnd && readyState <= videoElement.HAVE_CURRENT_DATA)) {
                    detectedProblemReason = `Stall: CT не изменилось за ${timeSinceLastUpdate.toFixed(0)}ms ${stallDebugInfo}`;
                }
            } else if (lastKnownVideoTime > 0 && currentTime < (lastKnownVideoTime - 1.5) && Math.abs(currentTime - lastKnownVideoTime) > 0.5) {
                detectedProblemReason = `Playback regression: CT откатилось назад с ${lastKnownVideoTime.toFixed(2)} на ${currentTime.toFixed(2)} ${stallDebugInfo}`;
            }

            if (currentTime > lastKnownVideoTime) {
                lastVideoTimeUpdateTimestamp = now;
                lastKnownVideoTime = currentTime;
                if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;

                if (reloadTimeoutId && reloadTimeoutId._reason?.toLowerCase().includes('stall') && !detectedProblemReason) {
                    logCoreDebug(context, `Отмена запланированной перезагрузки по причине 'stall', т.к. currentTime обновился.`);
                    clearTimeout(reloadTimeoutId);
                    reloadTimeoutId = null;
                }
            }
        } else {
            lastKnownVideoTime = currentTime;
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;

            if (reloadTimeoutId && !reloadTimeoutId._reason?.toLowerCase().includes('error')) {
                logCoreDebug(context, `Отмена запланированной перезагрузки (Причина: ${reloadTimeoutId._reason || '?'}), т.к. плеер на паузе/завершен/перематывается.`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
        }

        if (isWaitingForDataTimestamp > 0 && RELOAD_BUFFERING_THRESHOLD_MS > 0) {
            const bufferingDuration = now - isWaitingForDataTimestamp;
            if (bufferingDuration > RELOAD_BUFFERING_THRESHOLD_MS && !detectedProblemReason) {
                detectedProblemReason = `Buffering: длительная буферизация > ${(bufferingDuration / 1000).toFixed(1)}s ${stallDebugInfo}`;
            }
        }

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


        if (detectedProblemReason && !reloadTimeoutId) {
            scheduleReload(detectedProblemReason);
        }
    }


    function checkReloadCooldown(context) {
        try {
            const sessionReloadTime = sessionStorage.getItem('ttv_adblock_last_reload');
            if (sessionReloadTime) {
                const parsedTime = parseInt(sessionReloadTime, 10);
                sessionStorage.removeItem('ttv_adblock_last_reload');
                if (!isNaN(parsedTime)) {
                    const timeSinceLastReload = Date.now() - parsedTime;
                    if (timeSinceLastReload < RELOAD_COOLDOWN_MS && timeSinceLastReload >= 0) {
                        lastReloadTimestamp = Date.now() - timeSinceLastReload;
                        logWarn(context, `Восстановлен кулдаун перезагрузки. Осталось ${((RELOAD_COOLDOWN_MS - timeSinceLastReload)/1000).toFixed(1)}с.`);
                    }
                }
            }
        } catch (e) { }
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
        delete videoElement._adblockListenersAttached;
    }

    function handlePlayerError(event) {
        const error = event?.target?.error;
        if (!error) { logWarn('PlayerMon:EventError', 'Событие ошибки плеера без деталей (event.target.error is null).'); return; }

        const errorCode = error.code;
        const errorMessage = error.message || 'Сообщение об ошибке отсутствует';
        logError('PlayerMon:EventError', `Ошибка плеера! Код: ${errorCode}, Сообщение: "${errorMessage}"`);

        let reason = `Ошибка плеера (Код ${errorCode}: ${errorMessage.substring(0,100)})`;

        if (ENABLE_AUTO_RELOAD) {
            let shouldScheduleReload = false;
            let delay = 3500;

            if (RELOAD_ON_ERROR_CODES.includes(errorCode)) {
                shouldScheduleReload = true;
                if (errorCode === 2000) delay = 3000;
            } else if (errorMessage.includes('MasterPlaylist:10') && RELOAD_ON_ERROR_CODES.includes(10)) {
                reason += ` (MasterPlaylist:10)`;
                shouldScheduleReload = true;
            } else if (errorMessage.includes('code 5000') && RELOAD_ON_ERROR_CODES.includes(5000)) {
                reason += ` (Code 5000)`;
                shouldScheduleReload = true;
            }


            if (shouldScheduleReload) {
                logWarn('PlayerMon:EventError', `Обнаружена ошибка плеера (${reason}), для которой настроена перезагрузка. Планирование перезагрузки...`);
                scheduleReload(reason, delay);
            }
        }
        resetMonitorState(`Ошибка плеера ${errorCode}`);
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
        if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
        resetMonitorState('Playing');
        setQualitySettings(true);
    }
    function handlePlayerPause() {
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventPause', `Воспроизведение приостановлено (pause).`);
        resetMonitorState('Paused');
    }
    function handlePlayerEmptied() {
        logWarn('PlayerMon:EventEmptied', 'Источник плеера очищен (событие emptied). Сброс монитора и попытка переинициализации.');
        resetMonitorState('Emptied');
        if(playerMonitorIntervalId) clearInterval(playerMonitorIntervalId);
        playerMonitorIntervalId = null;
        stopAdRemovalObserver();
        setTimeout(setupPlayerMonitor, 750);
    }
    function handlePlayerLoadedMeta() {
        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventLoadedMeta', `Метаданные видео загружены.`);
        resetMonitorState('Loaded Metadata');
        setQualitySettings(true);
    }
    function handlePlayerAbort() {
        logWarn('PlayerMon:EventAbort', 'Загрузка видео прервана (событие abort).');
        resetMonitorState('Aborted');
    }
    function handlePlayerTimeUpdate() {
        if (videoElement && !videoElement.seeking) {
            const currentTime = videoElement.currentTime;
            if (Math.abs(currentTime - lastKnownVideoTime) > 0.01) {
                if (currentTime > lastKnownVideoTime) {
                    lastVideoTimeUpdateTimestamp = Date.now();
                    lastKnownVideoTime = currentTime;
                    if (isWaitingForDataTimestamp > 0) {
                        logCoreDebug('PlayerMon:EventTimeUpdate', 'Выход из состояния буферизации (время видео обновилось).');
                        isWaitingForDataTimestamp = 0;
                    }
                }
                if (LOG_PLAYER_MONITOR_DEBUG) {
                    const now = Date.now();
                    if (!videoElement._lastTimeUpdateLog || now - videoElement._lastTimeUpdateLog > 10000) {
                        logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventTimeUpdate', `TimeUpdate: CT=${currentTime.toFixed(2)}`);
                        videoElement._lastTimeUpdateLog = now;
                    }
                }
            }
        }
    }
    function handlePlayerProgress() {
        if (LOG_PLAYER_MONITOR_DEBUG && videoElement) {
            let bufferedLog = "N/A";
            try { if (videoElement.buffered && videoElement.buffered.length > 0) { bufferedLog = `[${videoElement.buffered.start(0).toFixed(2)}-${videoElement.buffered.end(videoElement.buffered.length - 1).toFixed(2)}] (${videoElement.buffered.length} parts)`; }
                } catch(e){}
            const now = Date.now();
            if (!videoElement._lastProgressLog || now - videoElement._lastProgressLog > 5000) { // Лог раз в 5 секунд
                logModuleTrace(LOG_PLAYER_MONITOR_DEBUG, 'PlayerMon:EventProgress', `Progress: Buffered: ${bufferedLog}, CT: ${videoElement.currentTime.toFixed(2)}, RS: ${videoElement.readyState}, NS: ${videoElement.networkState}`);
                videoElement._lastProgressLog = now;
            }
        }
    }


    function handleVisibilityChange() {
        const context = 'Visibility';
        if (document.hidden) {
            logCoreDebug(context, 'Вкладка стала неактивной (скрыта).');
            if (playerMonitorIntervalId) {
                clearInterval(playerMonitorIntervalId);
                playerMonitorIntervalId = null;
            }
            if (reloadTimeoutId) {
                logCoreDebug(context, `Отмена запланированной перезагрузки (Причина: ${reloadTimeoutId._reason || '?'}) из-за скрытия вкладки.`);
                clearTimeout(reloadTimeoutId);
                reloadTimeoutId = null;
            }
            if (visibilityResumeTimer) {
                clearTimeout(visibilityResumeTimer);
                visibilityResumeTimer = null;
            }
            if (isWaitingForDataTimestamp > 0) isWaitingForDataTimestamp = 0;
            stopAdRemovalObserver();
            stopWorkerPinger();
        } else {
            logCoreDebug(context, 'Вкладка стала активной. Возобновление операций с задержкой ' + VISIBILITY_RESUME_DELAY_MS + 'ms.');
            if (visibilityResumeTimer) clearTimeout(visibilityResumeTimer);
            visibilityResumeTimer = setTimeout(() => {
                visibilityResumeTimer = null;
                logCoreDebug(context, 'Задержка после возобновления видимости прошла. Переинициализация...');
                setQualitySettings(true);

                if (ENABLE_AUTO_RELOAD) {
                    resetMonitorState('Visibility resume');
                    checkReloadCooldown(context);
                    setupPlayerMonitor();
                }
                if (ATTEMPT_DOM_AD_REMOVAL) startAdRemovalObserver();
                if (INJECT_INTO_WORKERS) startWorkerPinger();

                if (videoElement && videoElement.paused && !videoElement.ended && videoElement.readyState >= videoElement.HAVE_FUTURE_DATA) {
                    logCoreDebug(context, 'Плеер на паузе после возобновления видимости. Попытка авто-воспроизведения...');
                    videoElement.play().catch(e => logWarn(context, 'Ошибка авто-воспроизведения после возобновления видимости:', e.message));
                }
            }, VISIBILITY_RESUME_DELAY_MS);
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    installHooks();
    setQualitySettings(true);

    function initialStart() {
        logCoreDebug('Init', 'Начало первоначального запуска скрипта...');
        setupPlayerMonitor();
        if (ATTEMPT_DOM_AD_REMOVAL) {
            removeDOMAdElements(document);
            startAdRemovalObserver();
        }
        if (INJECT_INTO_WORKERS) {
            startWorkerPinger();
        }
    }

    function deferredInitialStart() {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            requestAnimationFrame(initialStart);
        } else {
            window.addEventListener('DOMContentLoaded', () => requestAnimationFrame(initialStart), { once: true, passive: true });
        }
    }
    deferredInitialStart();


    setTimeout(() => {
        if (!videoElement && (document.readyState === 'complete' || document.readyState === 'interactive')) {
            logWarn('Init', 'Фоллбэк: проверка наличия плеера через 5 секунд...');
            setupPlayerMonitor();
        }
        if (ATTEMPT_DOM_AD_REMOVAL && !adRemovalObserver) {
            logWarn('Init', 'Фоллбэк: запуск AdRemovalObserver через 5 секунд...');
            if (document.body) {
                removeDOMAdElements(document);
                startAdRemovalObserver();
            } else {
                logWarn('Init', 'Фоллбэк AdRemovalObserver: document.body еще не доступен.');
            }
        }
        if (INJECT_INTO_WORKERS && !workerPingIntervalId) {
            logWarn('Init', 'Фоллбэк: запуск Worker Pinger через 5 секунд...');
            startWorkerPinger();
        }
    }, 5000);

    logCoreDebug('Init', 'Скрипт Twitch Adblock Ultimate инициализирован.');
})();