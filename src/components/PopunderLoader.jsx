import React, { useEffect, useRef } from 'react';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import { isTVDevice } from '../utils/platform';

const ADSTERRA_SCRIPT_URL =
  'https://consumptionbackwardsentiments.com/e0/e4/eb/e0e4eb2ac0c806edf748f372d994a9e1.js';
const SCRIPT_ATTR = 'data-streamflix-popunder';

/**
 * PopAds.net configuration token — used to detect their child scripts.
 * The IIFE freezes window[POPADS_TOKEN] = config, then loads two external
 * scripts. We must NOT modify the obfuscated code or it may fail integrity
 * checks on PopAds' side.
 */
const POPADS_TOKEN = 'a34232821fefdf3f931e52a459524310';
const POPADS_CODE = '/*<![CDATA[/* */' +
  '(function(){var c=window,i="' + POPADS_TOKEN + '",h=[["siteId",419-520-819+5262671],["minBid",0],["popundersPerIP","0"],["delayBetween",0],["default",false],["defaultPerDay",0],["topmostLayer","auto"]],n=["d3d3LnByZW1pdW12ZXJ0aXNpbmcuY29tL2t3ZWIzLm1pbi5jc3M=","ZDJqMDQyY2oxNDIxd2kuY2xvdWRmcm9udC5uZXQvbi9rcmVmcmFtZS5taW4uanM="],m=-1,u,f,z=function(){clearTimeout(f);m++;if(n[m]&&!(1813993541000<(new Date).getTime()&&1<m)){u=c.document.createElement("script");u.type="text/javascript";u.async=!0;var r=c.document.getElementsByTagName("script")[0];u.src="https://"+atob(n[m]);u.crossOrigin="anonymous";u.onerror=z;u.onload=function(){clearTimeout(f);c[i.slice(0,16)+i.slice(0,16)]||z()};f=setTimeout(z,5E3);r.parentNode.insertBefore(u,r)}};if(!c[i]){try{Object.freeze(c[i]=h)}catch(e){}z()}})();' +
  '/*]]>/* */';

/**
 * Deferred Popunder Loader
 *
 * Injects both Adsterra and PopAds.net popunder scripts once the ad gate has
 * resolved to `ads`. Automatically bypassed for TV devices and Ad-Free users.
 *
 * Adsterra: external script loaded via src attribute.
 * PopAds:   inline IIFE that self-executes, then loads two child scripts from
 *           premiumvertising.com and cloudfront.net. The IIFE is unmodified
 *           from the PopAds code generator to avoid breaking their integrity
 *           checks.
 */
/**
 * Delay (ms) before injecting PopAds after Adsterra. This prevents both
 * networks from attaching click-capture listeners at the exact same moment,
 * which would cause them to race for the same user gesture and potentially
 * double-fire or swallow each other's popunder.
 */
const POPADS_INJECT_DELAY_MS = 3000;

export default function PopunderLoader() {
  const { adGateState } = useAdFree();
  const injectedRef = useRef(false);
  const popadsTimerRef = useRef(null);

  useEffect(() => {
    const isTV = isTVDevice();
    if (isTV) return;

    if (adGateState === AD_STATE_ADS) {
      if (!injectedRef.current && !document.querySelector(`script[${SCRIPT_ATTR}="true"]`)) {
        // 1. Adsterra Popunder (external script — injected immediately)
        const adsterraScript = document.createElement('script');
        adsterraScript.async = true;
        adsterraScript.src = ADSTERRA_SCRIPT_URL;
        adsterraScript.setAttribute(SCRIPT_ATTR, 'true');
        adsterraScript.setAttribute('data-network', 'adsterra');
        document.head.appendChild(adsterraScript);

        // 2. PopAds.net Popunder — staggered to avoid click-gesture conflicts
        //    with Adsterra. Both networks intercept the first user click to
        //    open a popunder; injecting them simultaneously causes the browser
        //    to block the second popunder (only one window.open per gesture).
        //    By deferring PopAds, Adsterra captures the first click and PopAds
        //    captures a subsequent one, maximising fill rate.
        popadsTimerRef.current = setTimeout(() => {
          // Guard: user may have gone ad-free during the delay
          if (!document.querySelector(`script[${SCRIPT_ATTR}="true"][data-network="popads"]`)) {
            const popadsScript = document.createElement('script');
            popadsScript.type = 'text/javascript';
            popadsScript.setAttribute('data-cfasync', 'false');
            popadsScript.text = POPADS_CODE;
            popadsScript.setAttribute(SCRIPT_ATTR, 'true');
            popadsScript.setAttribute('data-network', 'popads');
            document.head.appendChild(popadsScript);
          }
          popadsTimerRef.current = null;
        }, POPADS_INJECT_DELAY_MS);

        injectedRef.current = true;
      }
    } else {
      // Cancel pending PopAds injection if still waiting
      if (popadsTimerRef.current) {
        clearTimeout(popadsTimerRef.current);
        popadsTimerRef.current = null;
      }

      // Pending or ad-free: remove all popunder scripts (ours + PopAds children)
      const ours = document.querySelectorAll(`script[${SCRIPT_ATTR}="true"]`);
      ours.forEach((script) => {
        if (script.parentNode) script.parentNode.removeChild(script);
      });

      // PopAds child scripts loaded from premiumvertising / cloudfront
      const popadsChildren = document.querySelectorAll(
        'script[src*="premiumvertising.com"], script[src*="cloudfront.net/n/"], script[src*="cloudfront.net/M/"], script[src*="cloudfront.net/FnJxEu"], script[src*="cloudfront.net/GjCt"]'
      );
      popadsChildren.forEach((script) => {
        if (script.parentNode) script.parentNode.removeChild(script);
      });

      injectedRef.current = false;
    }

    return () => {
      // Cleanup: cancel pending PopAds timer on unmount
      if (popadsTimerRef.current) {
        clearTimeout(popadsTimerRef.current);
        popadsTimerRef.current = null;
      }
    };
  }, [adGateState]);

  return null;
}
