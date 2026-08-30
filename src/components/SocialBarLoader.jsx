import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import { isTVDevice } from '../utils/platform';

const SOCIAL_BAR_SCRIPT_URL =
  'https://consumptionbackwardsentiments.com/13/4a/83/134a83b9c91d4f925e47c4aa8ab2176a.js';
const SCRIPT_ATTR = 'data-streamflix-socialbar';

/**
 * Returns true when the current path is a watch/player page where
 * social bar ads should never appear.
 */
function isWatchPage(pathname) {
  return (
    pathname.startsWith('/watch') ||
    pathname.includes('/iptv/watch') ||
    pathname.includes('/sports/watch')
  );
}

/**
 * Returns true if an element looks like an Adsterra social bar widget.
 * Adsterra injects fixed-positioned iframes and wrapper divs directly
 * into document.body with dynamically generated IDs/classes.
 */
function isSocialBarElement(el) {
  // Only inspect direct children of <body> that we didn't create
  if (el.parentNode !== document.body) return false;
  if (el.id === 'root' || el.classList?.contains('loading-screen')) return false;

  const tag = el.tagName;

  // Script tags from the ad network
  if (tag === 'SCRIPT') {
    const src = el.getAttribute('src') || '';
    return (
      el.getAttribute(SCRIPT_ATTR) === 'true' ||
      src.includes('134a83b9c91d4f925e47c4aa8ab2176a') ||
      src.includes('consumptionbackwardsentiments.com/13/')
    );
  }

  // Iframes injected by the social bar
  if (tag === 'IFRAME') {
    const src = el.getAttribute('src') || '';
    return src.includes('consumptionbackwardsentiments.com');
  }

  // Divs: match known containers + any fixed/sticky body-child div with
  // ad-network fingerprints (high z-index, zero-size wrapper, etc.)
  if (tag === 'DIV') {
    const id = el.id || '';
    const cls = el.className || '';
    if (
      id.startsWith('container-134a83b9c91d4f925e47c4aa8ab2176a') ||
      cls.includes('adsterra') ||
      id.includes('adsterra')
    ) {
      return true;
    }
    // Adsterra social bar inserts fixed-position wrappers on <body> with
    // iframes inside; catch them even with randomized identifiers.
    const style = el.style;
    if (
      (style?.position === 'fixed' || style?.position === 'sticky') &&
      el.querySelector('iframe')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Removes all Social Bar scripts and any floating ad DOM elements/iframes
 * created by the ad provider.
 */
function cleanupSocialBarElements() {
  // Broad pass: remove anything that matches known selectors
  const known = document.querySelectorAll(
    [
      `script[${SCRIPT_ATTR}="true"]`,
      'script[src*="134a83b9c91d4f925e47c4aa8ab2176a"]',
      'script[src*="consumptionbackwardsentiments.com/13/"]',
      'iframe[src*="consumptionbackwardsentiments.com"]',
      'div[id^="container-134a83b9c91d4f925e47c4aa8ab2176a"]',
      'div[class*="adsterra"]',
      'div[id*="adsterra"]',
    ].join(', ')
  );
  known.forEach((el) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });

  // Heuristic pass: catch dynamically-created body-child elements
  Array.from(document.body.children).forEach((el) => {
    if (isSocialBarElement(el) && el.parentNode) {
      el.parentNode.removeChild(el);
    }
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
 * - Watch pages (`/watch`, `/iptv/watch/*`, `/sports/watch/*`)
 * - While auth / entitlement state is still resolving (`loading === true`)
 *
 * On watch pages a MutationObserver continuously removes any social bar
 * elements that the already-loaded script tries to re-create.
 */
export default function SocialBarLoader() {
  const { isAdFree, adGateState, loading } = useAdFree();
  const location = useLocation();
  const injectedRef = useRef(false);
  const observerRef = useRef(null);

  useEffect(() => {
    const isTV = isTVDevice();
    const onWatchPage = isWatchPage(location.pathname);
    const adsAllowed = !isTV && !onWatchPage && !isAdFree && adGateState === AD_STATE_ADS && !loading;

    // Tear down any active observer from a previous render
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

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
      // Purge all social bar scripts and widgets
      cleanupSocialBarElements();
      injectedRef.current = false;

      // On watch pages the ad script may already be running and will try to
      // re-create its widgets via async callbacks. Use a MutationObserver
      // to nuke any new social bar elements as soon as they're added.
      if (onWatchPage) {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && isSocialBarElement(node)) {
                node.parentNode?.removeChild(node);
              }
            }
          }
        });
        observer.observe(document.body, { childList: true });
        observerRef.current = observer;
      }
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [isAdFree, adGateState, loading, location.pathname]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupSocialBarElements();
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return null;
}
