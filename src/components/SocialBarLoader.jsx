import React, { useEffect, useRef } from 'react';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import { isTVDevice } from '../utils/platform';

const SOCIAL_BAR_SCRIPT_URL =
  'https://consumptionbackwardsentiments.com/13/4a/83/134a83b9c91d4f925e47c4aa8ab2176a.js';
const SCRIPT_ATTR = 'data-streamflix-socialbar';

/**
 * Removes all Social Bar scripts and any floating ad DOM elements/iframes
 * created by the ad provider.
 */
function cleanupSocialBarElements() {
  // Remove script tags
  const scripts = document.querySelectorAll(
    `script[${SCRIPT_ATTR}="true"], script[src*="134a83b9c91d4f925e47c4aa8ab2176a"], script[src*="consumptionbackwardsentiments.com/13/"]`
  );
  scripts.forEach((script) => {
    if (script.parentNode) script.parentNode.removeChild(script);
  });

  // Remove any iframes or DOM widgets inserted by Adsterra Social Bar
  const widgets = document.querySelectorAll(
    'iframe[src*="consumptionbackwardsentiments.com"], div[id^="container-134a83b9c91d4f925e47c4aa8ab2176a"], div[class*="adsterra"], div[id*="adsterra"]'
  );
  widgets.forEach((widget) => {
    if (widget.parentNode) widget.parentNode.removeChild(widget);
  });
}

/**
 * Deferred Social Bar Loader
 *
 * Injects Adsterra Social Bar script right before </body> only when the user
 * is NOT ad-free and the ad gate has resolved to `ads`.
 *
 * Automatically and strictly bypassed for:
 * - Ad-Free users (`isAdFree === true` or `adGateState !== 'ads'`)
 * - Smart TVs / 10-foot devices (`isTVDevice()`)
 * - While auth / entitlement state is still resolving (`loading === true`)
 */
export default function SocialBarLoader() {
  const { isAdFree, adGateState, loading } = useAdFree();
  const injectedRef = useRef(false);

  useEffect(() => {
    const isTV = isTVDevice();
    const adsAllowed = !isTV && !isAdFree && adGateState === AD_STATE_ADS && !loading;

    if (adsAllowed) {
      if (!injectedRef.current && !document.querySelector(`script[${SCRIPT_ATTR}="true"]`)) {
        const socialBarScript = document.createElement('script');
        socialBarScript.async = true;
        socialBarScript.src = SOCIAL_BAR_SCRIPT_URL;
        socialBarScript.setAttribute(SCRIPT_ATTR, 'true');
        socialBarScript.setAttribute('data-network', 'adsterra-socialbar');
        document.body.appendChild(socialBarScript);

        injectedRef.current = true;
      }
    } else {
      // Pending, TV, or ad-free: purge all social bar scripts and widgets
      cleanupSocialBarElements();
      injectedRef.current = false;
    }
  }, [isAdFree, adGateState, loading]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupSocialBarElements();
    };
  }, []);

  return null;
}
