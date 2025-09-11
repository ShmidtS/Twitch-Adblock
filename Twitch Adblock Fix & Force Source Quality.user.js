// ==UserScript==
// @name         Twitch Adblock Ultimate
// @namespace    TwitchAdblockUltimate
// @version      30.6.0
// @description  Twitch adblock with token substitution, PiP/overlay handling, and unmute playback
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
        SCRIPT_VERSION: '30.6.0',
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
    const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    const CLIENT_VERSION = '93e9b9a4-6556-4299-a65c-839e92415d48';
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
    let isPipMode = false;
    const originalFetch = unsafeWindow.fetch;

    const logError = (s,m,...a)=>CONFIG.DEBUG.SHOW_ERRORS&&console.error(`${LOG_PREFIX} [${s}] ERROR:`,m,...a);
    const logWarn = (s,m,...a)=>CONFIG.DEBUG.SHOW_ERRORS&&console.warn(`${LOG_PREFIX} [${s}] WARN:`,m,...a);
    const logDebug = (s,m,...a)=>CONFIG.DEBUG.CORE&&console.info(`${LOG_PREFIX} [${s}] DEBUG:`,m,...a);
    const logTrace = (f,s,m,...a)=>f&&console.debug(`${LOG_PREFIX} [${s}] TRACE:`,m,...a);

    async function fetchCleanToken(channelName,isVod,vodId){
        const operation={
            operationName:'PlaybackAccessToken',
            variables:{isLive:!isVod,login:channelName||'',isVod:isVod,vodID:vodId||'',playerType:'site'},
            extensions:{persistedQuery:{version:1,sha256Hash:'0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712'}},
        };
        try{
            const response=await originalFetch(GQL_URL,{method:'POST',headers:{'Client-ID':CLIENT_ID,'Client-Version':CLIENT_VERSION},body:JSON.stringify(operation)});
            const data=await response.json();
            const token=isVod?data.data.videoPlaybackAccessToken:data.data.streamPlaybackAccessToken;
            if(token?.authorization?.isForbidden){
                return{
                    value:btoa(unescape(encodeURIComponent(JSON.stringify({adblock:false,platform:'web',playerType:'site'})))),
                    signature:'fallback_signature',
                    __typename:token.__typename
                };
            }
            return token;
        }catch(e){logError('FetchCleanToken','Failed:',e);return null;}
    }

    const fetchOverride=async(input,init)=>{
        const requestUrl=input instanceof Request?input.url:String(input);
        if(AD_URL_KEYWORDS_BLOCK.some(k=>requestUrl.includes(k))){
            return new Response(null,{status:403,statusText:`Blocked by TTV AdBlock`});
        }
        if(requestUrl===GQL_URL){
            let originalBodyText='';
            if(init&&init.body){
                originalBodyText=typeof init.body==='string'?init.body:await(new Request(input,init)).text();
            }
            try{
                const originalBody=JSON.parse(originalBodyText);
                if(originalBody.operationName==='PlaybackAccessToken'){
                    const response=await originalFetch(input,init);
                    const responseClone=response.clone();
                    const responseData=await responseClone.json();
                    const isVod=originalBody.variables.isVod;
                    const tokenData=isVod?responseData.data?.videoPlaybackAccessToken:responseData.data?.streamPlaybackAccessToken;
                    if(tokenData?.authorization?.isForbidden&&tokenData?.authorization?.forbiddenReasonCode==="STITCHED_AD"){
                        const channelName=originalBody.variables.login;
                        const vodId=originalBody.variables.vodID;
                        const cleanToken=await fetchCleanToken(channelName,isVod,vodId);
                        if(cleanToken&&cleanToken.value&&cleanToken.signature){
                            if(isVod){responseData.data.videoPlaybackAccessToken=cleanToken;}else{responseData.data.streamPlaybackAccessToken=cleanToken;}
                            return new Response(JSON.stringify(responseData),{status:response.status,statusText:response.statusText,headers:response.headers});
                        }
                    }
                    return response;
                }
            }catch(e){}
        }
        if(TWITCH_MANIFEST_PATH_REGEX.test(requestUrl)&&requestUrl.includes('usher.ttvnw.net')){
            const response=await originalFetch(input,init);
            if(response.ok){
                const text=await response.text();
                const {cleanedText}=parseAndCleanM3U8(text,requestUrl);
                const headers=new Headers(response.headers);headers.delete('Content-Length');
                return new Response(cleanedText,{status:response.status,statusText:response.statusText,headers});
            }
        }
        return originalFetch(input,init);
    };

    const injectCSS=()=>{
        const css=`${AD_DOM_SELECTORS.join(',\n')} {display:none!important;opacity:0!important;visibility:hidden!important;z-index:-1000!important;} video {display:block!important;width:100%!important;height:auto!important;}`;
        try{GM_addStyle(css);}catch(e){}
    };

    const forceMaxQuality=()=>{
        try{
            Object.defineProperties(document,{'visibilityState':{get:()=> 'visible',configurable:true},'hidden':{get:()=> false,configurable:true}});
            document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
        }catch(e){}
    };

    const parseAndCleanM3U8=(m3u8Text,url='N/A')=>{
        if(!m3u8Text||typeof m3u8Text!=='string')return{cleanedText:m3u8Text,adsFound:false};
        let adsFound=false;
        const cleanLines=m3u8Text.split('\n').filter(line=>{
            const upper=line.trim().toUpperCase();
            if(AD_DATERANGE_KEYWORDS.some(k=>upper.includes(k))){adsFound=true;return false;}
            return true;
        });
        return{cleanedText:adsFound?cleanLines.join('\n'):m3u8Text,adsFound};
    };

    const removeDOMAdElements=()=>{
        if(!CONFIG.SETTINGS.ATTEMPT_DOM_AD_REMOVAL)return;
        if(adRemovalObserver)adRemovalObserver.disconnect();
        adRemovalObserver=new MutationObserver(()=>{
            let placeholderDetected=false;
            AD_DOM_SELECTORS.forEach(sel=>{
                try{document.querySelectorAll(sel).forEach(el=>el.remove());}catch(e){}
            });
            const elements=document.querySelectorAll('.video-player__overlay,.player-overlay');
            elements.forEach(el=>{
                if(el.textContent.includes(PLACEHOLDER_TEXT)){placeholderDetected=true;el.remove();}
            });
            if(placeholderDetected&&videoElement){
                videoElement.muted=false;
                videoElement.volume=1.0;
                videoElement.play().catch(()=>{});
                if(document.pictureInPictureElement){document.exitPictureInPicture().catch(()=>{});}
                videoElement.style.width="100%";videoElement.style.height="100%";
            }
        });
        const target=document.body||document.documentElement;
        if(target)adRemovalObserver.observe(target,{childList:true,subtree:true,attributes:true});
    };

    const triggerReload=(reason)=>{
        if(!CONFIG.SETTINGS.ENABLE_AUTO_RELOAD)return;
        const now=Date.now();
        if(reloadCount>=CONFIG.ADVANCED.MAX_RELOADS_PER_SESSION||now-lastReloadTimestamp<CONFIG.ADVANCED.RELOAD_COOLDOWN_MS){return;}
        lastReloadTimestamp=now;reloadCount++;unsafeWindow.location.reload();
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
                vid.muted=false;vid.play().catch(()=>{});
            });
            vid.addEventListener('playing',()=>{if(stallTimer)clearTimeout(stallTimer);if(CONFIG.SETTINGS.FORCE_UNMUTE&&vid.muted){vid.muted=false;}});
            vid.addEventListener('loadeddata',()=>{if(CONFIG.SETTINGS.FORCE_UNMUTE){vid.muted=false;}});
            vid.addEventListener('error',(e)=>{
                const code=e.target?.error?.code;
                if(code&&(CONFIG.ADVANCED.RELOAD_ON_ERROR_CODES.includes(code)||e.message?.includes('IVS')||e.message?.includes('InvalidCharacterError'))){
                    if(ivsErrorTimer)clearTimeout(ivsErrorTimer);
                    ivsErrorTimer=setTimeout(()=>triggerReload(`IVS/Player error code ${code}`),CONFIG.ADVANCED.IVS_ERROR_THRESHOLD);
                }
                document.querySelectorAll('.commercial-break-in-progress,[data-test-selector="commercial-break-in-progress"]').forEach(el=>el.remove());
                vid.muted=false;vid.play().catch(()=>{});
            });
            vid.addEventListener('volumechange',()=>{if(CONFIG.SETTINGS.FORCE_UNMUTE&&(vid.volume===0||vid.muted)){vid.muted=false;vid.volume=1;}});
            vid._adblock_listeners_attached=true;
        };
        const findAndAttach=()=>{
            const currentVideo=document.querySelector('video');
            if(currentVideo&&currentVideo!==videoElement){videoElement=currentVideo;attachListeners(videoElement);}
        };
        videoPlayerObserver=new MutationObserver(findAndAttach);
        const target=document.body||document.documentElement;
        if(target){videoPlayerObserver.observe(target,{childList:true,subtree:true});findAndAttach();}
    };

    function installHooks(){
        if(hooksInstalled)return;hooksInstalled=true;
        try{unsafeWindow.fetch=fetchOverride;}catch(e){}
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
