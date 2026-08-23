import React, { useEffect, useRef } from 'react';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import { isTVDevice } from '../utils/platform';

const POPUNDER_SCRIPT_URL =
  'https://consumptionbackwardsentiments.com/e0/e4/eb/e0e4eb2ac0c806edf748f372d994a9e1.js';
const SCRIPT_ATTR = 'data-streamflix-popunder';

/**
 * Deferred Popunder Loader
 *
 * Injects the Adsterra popunder script only once the ad gate has resolved to
 * `ads`. It reads `adGateState` from context rather than the window global
 * because child effects run before parent effects: a global read here could
 * still see `pending` on the first commit after the entitlement resolves.
 */
export default function PopunderLoader() {
  const { adGateState } = useAdFree();
  const injectedRef = useRef(false);

  useEffect(() => {
    const isTV = isTVDevice();
    if (isTV) return;

    if (adGateState === AD_STATE_ADS) {
      if (!injectedRef.current && !document.querySelector(`script[${SCRIPT_ATTR}="true"]`)) {
        const script = document.createElement('script');
        script.async = true;
        script.src = POPUNDER_SCRIPT_URL;
        script.setAttribute(SCRIPT_ATTR, 'true');
        document.head.appendChild(script);
        injectedRef.current = true;
      }
    } else {
      // Pending or ad-free: remove the popunder script if present
      const existing = document.querySelector(`script[${SCRIPT_ATTR}="true"]`);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      injectedRef.current = false;
    }
  }, [adGateState]);

  return null;
}
