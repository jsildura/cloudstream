import { useState, useEffect } from 'react';
import { isTVDevice, getViewportTier } from '../utils/platform';

/**
 * Detect if the application is running on a TV-sized screen or a TV device.
 *
 * Detection signals (any true → TV mode):
 *   1. User agent matches a known smart-TV / Android TV / Fire TV string
 *   2. Viewport ≥ 1280px AND input is coarse+no-hover (remote control)
 *   3. Viewport ≥ 1920px (legacy fallback — catches TVs with generic UAs)
 *
 * Returns a boolean for backwards-compat; use the named export `useTVInfo`
 * when you need the resolution tier.
 */
const useTVDetect = () => {
  const [isTVMode, setIsTVMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isTVDevice() || window.innerWidth >= 1920;
  });

  useEffect(() => {
    const check = () => {
      setIsTVMode(isTVDevice() || window.innerWidth >= 1920);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isTVMode;
};

/**
 * Richer variant: returns `{ isTVMode, tier }`.
 * `tier` is one of '720p' | '1080p' | '2k' | '4k' | 'phone' | 'tablet'.
 */
export const useTVInfo = () => {
  const [info, setInfo] = useState(() => ({
    isTVMode: typeof window !== 'undefined' && (isTVDevice() || window.innerWidth >= 1920),
    tier: getViewportTier(),
  }));

  useEffect(() => {
    const check = () => {
      setInfo({
        isTVMode: isTVDevice() || window.innerWidth >= 1920,
        tier: getViewportTier(),
      });
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return info;
};

export default useTVDetect;
