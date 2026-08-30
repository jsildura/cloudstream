import React, { useEffect, useRef } from 'react';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import { isTVDevice } from '../utils/platform';

const ADSTERRA_SCRIPT_URL =
  'https://consumptionbackwardsentiments.com/e0/e4/eb/e0e4eb2ac0c806edf748f372d994a9e1.js';
const SCRIPT_ATTR = 'data-streamflix-popunder';

/**
 * Deferred Popunder Loader
 *
 * Injects Adsterra popunder script once the ad gate has resolved to `ads`.
 * Automatically bypassed for TV devices and Ad-Free users.
 *
 * Adsterra: external script loaded via src attribute.
 */
export default function PopunderLoader() {
  const { isAdFree, adGateState, loading } = useAdFree();
  const injectedRef = useRef(false);

  useEffect(() => {
    const isTV = isTVDevice();
    const adsAllowed = !isTV && !isAdFree && adGateState === AD_STATE_ADS && !loading;

    if (adsAllowed) {
      if (!injectedRef.current && !document.querySelector(`script[${SCRIPT_ATTR}="true"]`)) {
        // Adsterra Popunder (external script)
        const adsterraScript = document.createElement('script');
        adsterraScript.async = true;
        adsterraScript.src = ADSTERRA_SCRIPT_URL;
        adsterraScript.setAttribute(SCRIPT_ATTR, 'true');
        adsterraScript.setAttribute('data-network', 'adsterra');
        document.head.appendChild(adsterraScript);

        injectedRef.current = true;
      }
    } else {
      // Pending or ad-free: remove popunder scripts
      const ours = document.querySelectorAll(`script[${SCRIPT_ATTR}="true"]`);
      ours.forEach((script) => {
        if (script.parentNode) script.parentNode.removeChild(script);
      });

      injectedRef.current = false;
    }
  }, [isAdFree, adGateState, loading]);

  return null;
}
