/**
 * Platform / device detection utilities.
 *
 * These are pure helpers over navigator.userAgent + matchMedia and can be
 * called from module scope, React hooks, or event handlers. Every helper is
 * SSR-safe (falls back to `false` when `navigator`/`window` is undefined).
 */

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';

const TV_UA_PATTERN =
    /TV|Smart-?TV|GoogleTV|AppleTV|BRAVIA|NetCast|Roku|Viera|NETTV|Tizen|Web[- ]?OS|HbbTV|POV_TV|SMART-TV|Philips.*NETTV|CrKey|AFT[A-Z]|Android.*TV|ADT-2|Nexus Player|SHIELD Android TV|BRAVIA|Aquos|Xbox|PlayStation|Nintendo/i;

const ANDROID_TV_PATTERN = /Android.*TV|GoogleTV|AFT[A-Z]|Nexus Player|SHIELD Android TV|ADT-2|BRAVIA.*Android/i;
const TIZEN_PATTERN = /Tizen/i;
const WEBOS_PATTERN = /Web[- ]?OS|LG Browser|NetCast/i;
const FIRE_TV_PATTERN = /AFT[A-Z]/i;

export const isTVUserAgent = () => TV_UA_PATTERN.test(UA);
export const isAndroidTV = () => ANDROID_TV_PATTERN.test(UA);
export const isTizen = () => TIZEN_PATTERN.test(UA);
export const isWebOS = () => WEBOS_PATTERN.test(UA);
export const isFireTV = () => FIRE_TV_PATTERN.test(UA);

/**
 * Coarse pointer with no hover — the signature of a remote control on a big
 * screen. Phones also match, so combine with UA or a large viewport before
 * treating as a TV.
 */
export const hasRemoteLikePointer = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
};

/**
 * True when this device is very likely a TV browser: either the UA declares
 * a smart-TV platform, or the input modality is remote-like AND the viewport
 * is at least 1280 wide (rules out phones).
 */
export const isTVDevice = () => {
    if (isTVUserAgent()) return true;
    if (typeof window === 'undefined') return false;
    if (window.innerWidth >= 1280 && hasRemoteLikePointer()) return true;
    return false;
};

/**
 * Resolution tier based on viewport width, matching the CSS media-query tiers
 * in src/styles/globals.css.
 *   phone   < 720
 *   tablet  720..1279
 *   720p    1280..1919
 *   1080p   1920..2559
 *   2k      2560..3839
 *   4k      >= 3840
 */
export const getViewportTier = () => {
    if (typeof window === 'undefined') return 'phone';
    const w = window.innerWidth;
    if (w >= 3840) return '4k';
    if (w >= 2560) return '2k';
    if (w >= 1920) return '1080p';
    if (w >= 1280) return '720p';
    if (w >= 720) return 'tablet';
    return 'phone';
};
