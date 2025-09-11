// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      30.6.2
// @description  Twitch adblock that modifies network requests to prevent ads and player errors.
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
// @connect      assets.twitch.tv
// @connect      raw.githubusercontent.com
// @updateURL    https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @downloadURL  https://github.com/ShmidtS/Twitch-Adblock/raw/refs/heads/main/Twitch%20Adblock%20Fix%20&%20Force%20Source%20Quality.user.js
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        SCRIPT_VERSION: '30.6.2',
        SETTINGS: {
            FORCE_MAX_QUALITY: GM_getValue('TTV_AdBlock_ForceMaxQuality', true),
            ATTEMPT_DOM_AD_REMOVAL: GM_getValue('TTV_AdBlock_AttemptDOMAdRemoval', true),
            HIDE_COOKIE_BANNER: GM_getValue('TTV_AdBlock_HideCookieBanner', true),
            ENABLE_AUTO_RELOAD: GM_getValue('TTV_AdBlock_EnableAutoReload', false),
            FORCE_UNMUTE: GM_getValue('TTV_AdBlock_ForceUnmute', true),
            REMOVE_AD_PLACEHOLDER: GM_getValue('TTV_AdBlock_RemoveAdPlaceholder', true),
        },
        DEBUG: {
            SHOW_ERRORS: GM_getValue('TTV_AdBlock_ShowErrorsInConsole', true),
            CORE: GM_getValue('TTV_AdBlock_Debug_Core', false),
            PLAYER_MONITOR: GM_getValue('TTV_AdBlock_Debug_PlayerMon', true),
            M3U8_CLEANING: GM_getValue('TTV_AdBlock_Debug_M3U8', true),
            GQL_MODIFY: GM_getValue('TTV_AdBlock_Debug_GQL', true),
            NETWORK_BLOCKING: GM_getValue('TTV_AdBlock_Debug_NetBlock', false),
        },
        ADVANCED: {
            RELOAD_STALL_THRESHOLD_MS: GM_getValue('TTV_AdBlock_StallThresholdMs', 15000),
            RELOAD_BUFFERING_THRESHOLD_MS: GM_getValue('TTV_AdBlock_BufferingThresholdMs', 30000),
            RELOAD_COOLDOWN_MS: GM_getValue('TTV_AdBlock_ReloadCooldownMs', 20000),
            MAX_RELOADS_PER_SESSION: GM_getValue('TTV_AdBlock_MaxReloadsPerSession', 3),
            RELOAD_ON_ERROR_CODES: GM_getValue('TTV_AdBlock_ReloadOnErrorCodes', "1000,2000,3000,4000,5000")
            .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
            IVS_ERROR_THRESHOLD: 5000,
            PIP_RETRY_ATTEMPTS: 3,
            PIP_RETRY_DELAY_MS: 1000,
        },
    };

    const LOG_PREFIX = `[TTV ADBLOCK ULT v${CONFIG.SCRIPT_VERSION}]`;
    const GQL_URL = 'https://gql.twitch.tv/gql';
    const TWITCH_MANIFEST_PATH_REGEX = /\.m3u8($|\?)/i;
    const AD_URL_KEYWORDS_BLOCK = [
        'edge.ads.twitch.tv','nat.min.js','twitchAdServer.js','player-ad-aws.js',
        'googlesyndication.com','doubleclick.net','adnxs.com','amazon-adsystem.com',
        'ads.ttvnw.net','ad.twitch.tv','sentry.io','scorecardresearch.com'
    ];
    const AD_DOM_SELECTORS = [
        '.ad-interrupt-screen','.video-player__ad-info-container','.player-ad-notice',
        'div[data-test-selector="ad-banner-default-text-area"]','.persistent-player__ad-container',
        '[data-a-target="advertisement-notice"]','div[data-a-target="ax-overlay"]',
        '[data-test-selector*="sad-overlay"]','div[data-a-target*="ad-block-nag"]',
        '.ad-break-ui-container','[data-a-target="ad-banner"]','.promoted-content-card',
        '.video-ad-display__container','[role="advertisement"]','div[data-a-target="player-ad-overlay"]',
        '.commercial-break-in-progress','[data-test-selector="commercial-break-in-progress"]',
        '.twitch-ad-break-placeholder','.ad-break-overlay','.player-overlay.ad-break',
        '.video-player__overlay[data-test-selector*="ad"]','.picture-in-picture-player','.pip-player-container','[data-a-target="player-pip"]',
        ...(CONFIG.SETTINGS.HIDE_COOKIE_BANNER ? ['.consent-banner'] : []),
    ];
    const AD_DATERANGE_KEYWORDS = [
        'AD-ID=','CUE-OUT','SCTE35','Twitch-Ad-Signal','Twitch-Prefetch',
        'Twitch-Ads','X-TWITCH-AD','EXT-X-TWITCH-INFO','EXT-X-ASSET'
    ];
    const PLACEHOLDER_TEXT = 'Commercial break in progress';

    let hooksInstalled = false;
    let adRemovalObserver = null;
    let videoPlayerObserver = null;
    let videoElement = null;
    let lastReloadTimestamp = 0;
    let reloadCount = 0;
    const originalFetch = unsafeWindow.fetch;

    const logError = (s,m,...a)=>CONFIG.DEBUG.SHOW_ERRORS&&console.error(`${LOG_PREFIX} [${s}] ERROR:`,m,...a);
    const logWarn = (s,m,...a)=>CONFIG.DEBUG.SHOW_ERRORS&&console.warn(`${LOG_PREFIX} [${s}] WARN:`,m,...a);
    const logDebug = (s,m,...a)=>CONFIG.DEBUG.CORE&&console.info(`${LOG_PREFIX} [${s}] DEBUG:`,m,...a);
    const logTrace = (f,s,m,...a)=>f&&console.debug(`${LOG_PREFIX} [${s}] TRACE:`,m,...a);

    // This is the new, more stable fetch override. It modifies the GQL request
    // to ask for an ad-free stream, rather than trying to replace the token.
    // This avoids player errors (like 'atob' failures) and is more reliable.
    const fetchOverride = async (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        const requestUrlLower = requestUrl.toLowerCase();

        // 1. Block known ad-related URLs
        if (AD_URL_KEYWORDS_BLOCK.some(k => requestUrlLower.includes(String(k).toLowerCase()))) {
            logTrace(CONFIG.DEBUG.NETWORK_BLOCKING, 'Block URL', requestUrl);
            return new Response(null, { status: 403, statusText: `Blocked by TTV AdBlock` });
        }

        // 2. Intercept and modify GraphQL requests for video access tokens
        if (requestUrl === GQL_URL) {
            try {
                if (init && init.body) {
                    const originalBodyText = typeof init.body === 'string' ? init.body : await (new Request(input, init)).text();
                    const originalBody = JSON.parse(originalBodyText);

                    if (originalBody.operationName === 'PlaybackAccessToken') {
                        logDebug('fetchOverride', 'Intercepting PlaybackAccessToken, setting playerType to "mobile" to request an ad-free stream.');
                        originalBody.variables.playerType = 'mobile'; // Using 'mobile' can result in ad-free streams

                        const newInit = { ...init, body: JSON.stringify(originalBody) };
                        return originalFetch(input, newInit);
                    }
                }
            } catch (e) {
                logTrace(CONFIG.DEBUG.GQL_MODIFY, 'GQL request modification failed, proceeding with original.', e);
            }
        }

        // 3. Intercept and clean M3U8 playlists as a fallback
        if (TWITCH_MANIFEST_PATH_REGEX.test(requestUrl) && requestUrlLower.includes('usher.ttvnw.net')) {
            try {
                const response = await originalFetch(input, init);
                if (response && response.ok) {
                    const manifestText = await response.text();
                    const { cleanedText, adsFound } = parseAndCleanM3U8(manifestText, requestUrl);

                    if (adsFound) {
                        logDebug('fetchOverride', 'Cleaned m3u8 playlist (ads removed):', requestUrl);
                        const newHeaders = new Headers(response.headers);
                        newHeaders.delete('Content-Length');
                        return new Response(cleanedText, { status: response.status, statusText: response.statusText, headers: newHeaders });
                    }

                    // If no ads found, return a new response with the original text as the body has been consumed
                    return new Response(manifestText, { status: response.status, statusText: response.statusText, headers: response.headers });
                }
                return response; // Return original response if not OK
            } catch (e) {
                logWarn('fetchOverride', 'Error fetching/cleaning m3u8, falling back to original fetch.', e);
            }
        }

        return originalFetch(input, init);
    };


    const injectCSS=()=>{
        const css=`${AD_DOM_SELECTORS.join(',\n')} {display:none!important;opacity:0!important;visibility:hidden!important;z-index:-1000!important;} video {display:block!important;width:100%!important;height:auto!important;}`;
        try{GM_addStyle(css);}catch(e){logWarn('injectCSS','GM_addStyle failed',e);}
    };

    const forceMaxQuality=()=>{
        try{
            Object.defineProperties(document,{'visibilityState':{get:()=> 'visible',configurable:true},'hidden':{get:()=> false,configurable:true}});
            document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
        }catch(e){logWarn('forceMaxQuality','Could not override visibilityState',e);}
    };

    const parseAndCleanM3U8=(m3u8Text,url='N/A')=>{
        if(!m3u8Text||typeof m3u8Text!=='string')return{cleanedText:m3u8Text,adsFound:false};
        let adsFound=false;
        const keywordUpper = AD_DATERANGE_KEYWORDS.map(k => String(k).toUpperCase());

        const lines = m3u8Text.split('\n');
        const cleanLines = lines.filter(line => {
            if(!line) return true;
            const trimmed = line.trim();
            const upper = trimmed.toUpperCase();

            if(upper.startsWith('#EXT-X-DATERANGE') || upper.startsWith('#EXT-X-CUE-OUT') || upper.startsWith('#EXT-X-CUE-IN') ){
                adsFound = true;
                return false;
            }
            if(keywordUpper.some(k => upper.includes(k))){
                adsFound = true;
                return false;
            }
            if(upper.startsWith('#EXT-X-TWITCH-INFO') || upper.startsWith('#EXT-X-TWITCH-AD') ){
                adsFound = true;
                return false;
            }
            return true;
        });

        return {cleanedText: adsFound ? cleanLines.join('\n') : m3u8Text, adsFound};
    };

    const removeDOMAdElements=()=>{
        if(!CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL)return;
        if(adRemovalObserver)adRemovalObserver.disconnect();
        adRemovalObserver=new MutationObserver(()=> {
            try {
                let placeholderDetected=false;
                AD_DOM_SELECTORS.forEach(sel=>{
                    try{document.querySelectorAll(sel).forEach(el=>el.remove());}catch(e){}
                });
                const elements=document.querySelectorAll('div,span,p,section');
                elements.forEach(el=>{
                    try{
                        const txt = (el.textContent||'').trim();
                        if(!txt) return;
                        if(txt.toLowerCase().includes(PLACEHOLDER_TEXT.toLowerCase())){
                            placeholderDetected=true;
                            el.remove();
                        }
                    }catch(e){}
                });
                if(placeholderDetected && videoElement){
                    try{
                        videoElement.muted=false;
                        videoElement.volume=1.0;
                        videoElement.play().catch(()=>{});
                        if(document.pictureInPictureElement){document.exitPictureInPicture().catch(()=>{});}
                        videoElement.style.width="100%";videoElement.style.height="100%";
                    }catch(e){}
                }
            } catch(e) {
                logTrace(CONFIG.DEBUG.PLAYER_MONITOR,'adRemovalObserver callback error',e);
            }
        });
        const target=document.body||document.documentElement;
        if(target) adRemovalObserver.observe(target,{childList:true,subtree:true,attributes:true});
    };

    const triggerReload=(reason)=>{
        if(!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD)return;
        const now=Date.now();
        if(reloadCount>=CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION||now-lastReloadTimestamp<CONFIG.ADVANCED.RELOAD_COOLDOWN_MS){return;}
        lastReloadTimestamp=now;reloadCount++;logWarn('triggerReload','Reload triggered because',reason);unsafeWindow.location.reload();
    };

    const setupVideoPlayerMonitor=()=>{
        if(videoPlayerObserver)videoPlayerObserver.disconnect();
        const attachListeners=(vid)=>{
            if(!vid||vid._adblock_listeners_attached)return;
            let stallTimer=null;let ivsErrorTimer=null;
            vid.addEventListener('stalled',()=>{
                if(stallTimer)clearTimeout(stallTimer);
                stallTimer=setTimeout(()=>triggerReload('Stall timeout'),CONFIG.ADVANCED.RELOAD_STALL_THRESHOLD_MS);
                document.querySelectorAll('.commercial-break-in-progress,[data-test-selector="commercial-break-in-progress"]').forEach(el=>el.remove());
                try{ vid.muted=false; vid.play().catch(()=>{}); }catch(e){}
            });
            vid.addEventListener('playing',()=>{ if(stallTimer)clearTimeout(stallTimer); if(CONFIG.SETTINGS.FORCE_UNMUTE && vid.muted){ vid.muted=false; } });
            vid.addEventListener('loadeddata',()=>{ if(CONFIG.SETTINGS.FORCE_UNMUTE){ vid.muted=false; } });
            vid.addEventListener('error',(e)=>{
                try{
                    const code=e.target?.error?.code;
                    if(code && (CONFIG.ADVANCED.RELOAD_ON_ERROR_CODES.includes(code) || (e.message && (e.message.includes('IVS')||e.message.includes('InvalidCharacterError'))))){
                        if(ivsErrorTimer)clearTimeout(ivsErrorTimer);
                        ivsErrorTimer=setTimeout(()=>triggerReload(`IVS/Player error code ${code}`),CONFIG.ADVANCED.IVS_ERROR_THRESHOLD);
                    }
                }catch(err){}
                document.querySelectorAll('.commercial-break-in-progress,[data-test-selector="commercial-break-in-progress"]').forEach(el=>el.remove());
                try{ vid.muted=false; vid.play().catch(()=>{}); }catch(e){}
            });
            vid.addEventListener('volumechange',()=>{ if(CONFIG.SETTINGS.FORCE_UNMUTE && (vid.volume===0 || vid.muted)){ vid.muted=false; vid.volume=1; } });
            vid._adblock_listeners_attached=true;
        };
        const findAndAttach=()=>{
            const currentVideo=document.querySelector('video');
            if(currentVideo && currentVideo!==videoElement){ videoElement=currentVideo; attachListeners(videoElement); }
        };
        videoPlayerObserver=new MutationObserver(findAndAttach);
        const target=document.body||document.documentElement;
        if(target){ videoPlayerObserver.observe(target,{childList:true,subtree:true}); findAndAttach(); }
    };

    function installHooks(){
        if(hooksInstalled)return;hooksInstalled=true;
        try{ unsafeWindow.fetch = fetchOverride; }catch(e){ logWarn('installHooks','Could not override fetch',e); }
    }

    const initialize=()=>{
        installHooks();
        injectCSS();
        if(CONFIG.SETTINGS.FORCE_MAX_QUALITY)forceMaxQuality();
        removeDOMAdElements();
        setupVideoPlayerMonitor();
    };

    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initialize,{once:true});}else{initialize();}
})();