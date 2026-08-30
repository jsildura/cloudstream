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
const POPADS_CODE = `/*<![CDATA[/* */
(function(){var u=window,r="${POPADS_TOKEN}",p=[["siteId",399+428*815-568+573+4912527],["minBid",0],["popundersPerIP","0"],["delayBetween",0],["default",false],["defaultPerDay",0],["topmostLayer","auto"]],t=["d3d3LnByZW1pdW12ZXJ0aXNpbmcuY29tL2R3ZWIzLm1pbi5jc3M=","ZDJqMDQyY2oxNDIxd2kuY2xvdWRmcm9udC5uZXQvRm5KeEV1L25yZWZyYW1lLm1pbi5qcw=="],j=-1,n,e,v=function(){clearTimeout(e);j++;if(t[j]&&!(1813989340000<(new Date).getTime()&&1<j)){n=u.document.createElement("script");n.type="text/javascript";n.async=!0;var b=u.document.getElementsByTagName("script")[0];n.src="https://"+atob(t[j]);n.crossOrigin="anonymous";n.onerror=v;n.onload=function(){clearTimeout(e);u[r.slice(0,16)+r.slice(0,16)]||v()};e=setTimeout(v,5E3);b.parentNode.insertBefore(n,b)}};if(!u[r]){try{Object.freeze(u[r]=p)}catch(e){}v()}})();
/*]]>/* */`;

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
export default function PopunderLoader() {
  const { adGateState } = useAdFree();
  const injectedRef = useRef(false);

  useEffect(() => {
    const isTV = isTVDevice();
    if (isTV) return;

    if (adGateState === AD_STATE_ADS) {
      if (!injectedRef.current && !document.querySelector(`script[${SCRIPT_ATTR}="true"]`)) {
        // 1. Adsterra Popunder (external script)
        const adsterraScript = document.createElement('script');
        adsterraScript.async = true;
        adsterraScript.src = ADSTERRA_SCRIPT_URL;
        adsterraScript.setAttribute(SCRIPT_ATTR, 'true');
        adsterraScript.setAttribute('data-network', 'adsterra');
        document.head.appendChild(adsterraScript);

        // 2. PopAds.net Popunder (inline IIFE — unmodified from their generator)
        const popadsScript = document.createElement('script');
        popadsScript.type = 'text/javascript';
        popadsScript.setAttribute('data-cfasync', 'false');
        popadsScript.text = POPADS_CODE;
        popadsScript.setAttribute(SCRIPT_ATTR, 'true');
        popadsScript.setAttribute('data-network', 'popads');
        document.head.appendChild(popadsScript);

        injectedRef.current = true;
      }
    } else {
      // Pending or ad-free: remove all popunder scripts (ours + PopAds children)
      const ours = document.querySelectorAll(`script[${SCRIPT_ATTR}="true"]`);
      ours.forEach((script) => {
        if (script.parentNode) script.parentNode.removeChild(script);
      });

      // PopAds child scripts loaded from premiumvertising / cloudfront
      const popadsChildren = document.querySelectorAll(
        'script[src*="premiumvertising.com"], script[src*="cloudfront.net/FnJxEu"], script[src*="cloudfront.net/GjCt"]'
      );
      popadsChildren.forEach((script) => {
        if (script.parentNode) script.parentNode.removeChild(script);
      });

      injectedRef.current = false;
    }
  }, [adGateState]);

  return null;
}
