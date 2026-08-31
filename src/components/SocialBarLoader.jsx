import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import { isTVDevice } from '../utils/platform';

const AD_HOST = 'consumptionbackwardsentiments.com';
const AD_ZONE_ID = '134a83b9c91d4f925e47c4aa8ab2176a';
const SOCIAL_BAR_SCRIPT_URL = `https://${AD_HOST}/13/4a/83/${AD_ZONE_ID}.js`;
const SCRIPT_ATTR = 'data-streamflix-socialbar';

/** The zone-stamped prefix the network puts on the widget's id and class. */
const CONTAINER_PREFIX = `container-${AD_ZONE_ID}`;

/** The native banner runs on the same host under a different zone. */
const NATIVE_AD_CONTAINER = '.native-ad-container';

/**
 * Observed live shape of the widget (verified in-browser):
 *
 *   <html>
 *     <head>…</head>
 *     <body>…</body>
 *     <iframe id="container-134a83…2176a18997"
 *             class="container-134a83…2176a18997"
 *             style="position: fixed; z-index: 2147483647; …">
 *   </html>
 *
 * Three things about that shape drive the selectors below, and each one defeated
 * an earlier attempt at this cleanup:
 *  - it is an IFRAME, not a DIV, so tag-qualified selectors miss it;
 *  - it carries NO `src` attribute, so host-matching on `src` misses it;
 *  - it is a child of <html>, NOT <body>, so scanning `body.children` and
 *    observing `document.body` miss it entirely.
 */
const KNOWN_SELECTORS = [
  `script[${SCRIPT_ATTR}="true"]`,
  `script[src*="${AD_ZONE_ID}"]`,
  `script[src*="${AD_HOST}/13/"]`,
  `iframe[src*="${AD_HOST}"]`,
  `[id^="${CONTAINER_PREFIX}"]`,
  `[class*="${CONTAINER_PREFIX}"]`,
  '[id*="adsterra"]',
  '[class*="adsterra"]',
].join(', ');

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

function removeElement(el) {
  if (el.parentNode) el.parentNode.removeChild(el);
}

/** The two levels the network attaches its widget to. */
function isTopLevelChild(el) {
  const parent = el.parentNode;
  return parent === document.body || parent === document.documentElement;
}

/**
 * Matches the ad network's own identifiers, so it is safe to apply anywhere in
 * the tree. Excludes the native banner, which shares `AD_HOST` under a
 * different zone and is gated separately by `NativeAd`.
 */
function hasAdFingerprint(el) {
  if (el.closest?.(NATIVE_AD_CONTAINER)) return false;

  // Checked for every tag, and before the src checks: the live widget is an
  // iframe with no src, identifiable only by its zone-stamped id/class.
  const id = el.id || '';
  // SVG elements expose an SVGAnimatedString here, which has no `includes`.
  const cls = typeof el.className === 'string' ? el.className : '';
  if (
    id.startsWith(CONTAINER_PREFIX) ||
    cls.includes(CONTAINER_PREFIX) ||
    id.includes('adsterra') ||
    cls.includes('adsterra')
  ) {
    return true;
  }

  const tag = el.tagName;

  if (tag === 'SCRIPT') {
    const src = el.getAttribute('src') || '';
    return (
      el.getAttribute(SCRIPT_ATTR) === 'true' ||
      src.includes(AD_ZONE_ID) ||
      src.includes(`${AD_HOST}/13/`)
    );
  }

  if (tag === 'IFRAME') {
    return (el.getAttribute('src') || '').includes(AD_HOST);
  }

  return false;
}

/**
 * Catches the same widget when the network randomizes its identifiers: a
 * fixed-position frame, or a wrapper holding one, hanging off <html>/<body>.
 *
 * Deliberately narrow, because two legitimate structures look similar:
 *
 * - Portaled app UI (Modal, HoverPreviewCard) are body children that do hold
 *   iframes, but take `position` from a stylesheet — hence the *inline*
 *   `style.position` read rather than `getComputedStyle`.
 * - The adblock bait container is a body child holding an iframe, but is
 *   `position: absolute` — hence matching only `fixed`/`sticky`. Widening this
 *   would delete the baits and report a false adblock positive.
 *
 * Checks are ordered cheapest-first so the `querySelector` never runs for
 * ordinary app nodes: the observer below tests every insertion in the document.
 */
function isFloatingAdWrapper(el) {
  if (!isTopLevelChild(el)) return false;
  const tag = el.tagName;
  if (tag !== 'DIV' && tag !== 'IFRAME') return false;
  const position = el.style?.position;
  if (position !== 'fixed' && position !== 'sticky') return false;
  // A floating frame at this level is the widget itself; a div only counts once
  // it holds the frame.
  return tag === 'IFRAME' || Boolean(el.querySelector('iframe'));
}

/**
 * Single predicate behind both the cleanup pass and the observer, so the two
 * can never disagree about what counts as a social bar element.
 */
function isSocialBarElement(el) {
  const tag = el.tagName;
  // Structural elements are never removable, whatever else matches.
  if (tag === 'HTML' || tag === 'HEAD' || tag === 'BODY') return false;
  if (el.id === 'root' || el.classList?.contains('loading-screen')) return false;
  return hasAdFingerprint(el) || isFloatingAdWrapper(el);
}

/**
 * Walks up from `node` to the <html>/<body> child that contains it, or null when
 * there is none. Lets the observer identify a wrapper that only became
 * recognizable once the ad network filled it with a frame.
 */
function topLevelAncestorOf(node) {
  let el = node;
  while (el && el.parentNode && !isTopLevelChild(el)) {
    el = el.parentNode;
  }
  return el && isTopLevelChild(el) ? el : null;
}

/**
 * Removes all Social Bar scripts and any floating ad DOM elements/iframes
 * created by the ad provider.
 */
function cleanupSocialBarElements() {
  // Broad pass: anything matching a known selector, anywhere in the document.
  // querySelectorAll runs from the document node, so it reaches the widget even
  // though it sits outside <body>.
  document.querySelectorAll(KNOWN_SELECTORS).forEach((el) => {
    if (isSocialBarElement(el)) removeElement(el);
  });

  // Structural pass: catch randomized elements at both levels the network uses.
  const topLevel = [
    ...Array.from(document.documentElement.children),
    ...Array.from(document.body.children),
  ];
  topLevel.forEach((el) => {
    if (isSocialBarElement(el)) removeElement(el);
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
 * Removing the script tag does not unload a script that already ran, so
 * whenever ads are disallowed a MutationObserver stays armed on
 * `document.documentElement` and strips any widget the loaded script re-creates
 * through its async callbacks. That covers watch pages and, just as
 * importantly, an account that becomes ad-free while sitting on any other page.
 */
export default function SocialBarLoader() {
  const { isAdFree, adGateState, loading } = useAdFree();
  const location = useLocation();
  const injectedRef = useRef(false);
  const observerRef = useRef(null);

  useEffect(() => {
    const isTV = isTVDevice();
    const onWatchPage = isWatchPage(location.pathname);
    const adsAllowed =
      !isTV && !onWatchPage && !isAdFree && adGateState === AD_STATE_ADS && !loading;

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
      return undefined;
    }

    // Purge all social bar scripts and widgets
    cleanupSocialBarElements();
    injectedRef.current = false;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (isSocialBarElement(node)) {
            removeElement(node);
            continue;
          }

          // The network appends an empty wrapper first and fills in the frame
          // afterwards, so the insertion that identifies it is a descendant.
          const host = topLevelAncestorOf(node);
          if (host && host !== node && isSocialBarElement(host)) {
            removeElement(host);
          }
        }
      }
    });
    // documentElement, not body: the widget is attached as a sibling of <body>.
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observerRef.current = observer;

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
