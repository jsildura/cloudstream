import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useVideoZoom
 *
 * Provides pinch-to-zoom (mobile/tablet) and mouse scroll zoom (desktop)
 * when watching in fullscreen landscape orientation mode.
 *
 * - Pinch Outward / Mouse Scroll Up: scales video up gradually (up to 3.5x)
 * - Pinch Inward / Mouse Scroll Down: scales video back down gradually to 1.0x (Original Fit)
 * - Automatically resets to original fit (1.0x) if rotated to portrait or exiting fullscreen.
 */
export function useVideoZoom({
  isFullscreen,
  currentSeason,
  currentEpisode,
  currentServer,
  id,
  type,
  containerRef,
  onSingleTap,
}) {
  const [scale, setScale] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= window.innerHeight;
  });

  const [badge, setBadge] = useState({ visible: false, scale: 1.0 });
  const badgeTimerRef = useRef(null);

  // Synchronous refs for event handlers to avoid stale closures
  const scaleRef = useRef(1.0);
  scaleRef.current = scale;
  const panRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;

  // Active gesture tracking refs
  const isPinchingRef = useRef(false);
  const initialDistRef = useRef(0);
  const initialScaleRef = useRef(1.0);
  const initialMidRef = useRef({ x: 0, y: 0 });
  const initialPanRef = useRef({ x: 0, y: 0 });

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });

  // Tap & double-tap detection refs
  const touchStartPosRef = useRef(null);
  const touchStartTimeRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  // Mouse drag tracking refs (for desktop pan when zoomed in)
  const isMouseDownRef = useRef(false);
  const mouseStartPosRef = useRef({ x: 0, y: 0 });
  const mousePanOriginRef = useRef({ x: 0, y: 0 });

  // Orientation and window resize detection
  useEffect(() => {
    const handleOrientationOrResize = () => {
      const landscape = window.innerWidth >= window.innerHeight;
      setIsLandscape(landscape);
    };

    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    handleOrientationOrResize();

    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
    };
  }, []);

  // Zoom is enabled ONLY in fullscreen landscape orientation mode
  const isZoomEnabled = Boolean(isFullscreen && isLandscape);

  const showBadge = useCallback((currentScale) => {
    if (badgeTimerRef.current) {
      clearTimeout(badgeTimerRef.current);
    }
    setBadge({ visible: true, scale: currentScale });
    badgeTimerRef.current = setTimeout(() => {
      setBadge((prev) => ({ ...prev, visible: false }));
    }, 1200);
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1.0);
    setPan({ x: 0, y: 0 });
    scaleRef.current = 1.0;
    panRef.current = { x: 0, y: 0 };
    isPinchingRef.current = false;
    isPanningRef.current = false;
    isMouseDownRef.current = false;
    setIsInteracting(false);
  }, []);

  // Reset zoom when exiting fullscreen, rotating to portrait, or changing media
  useEffect(() => {
    if (!isZoomEnabled) {
      resetZoom();
    }
  }, [isZoomEnabled, resetZoom]);

  useEffect(() => {
    resetZoom();
  }, [id, type, currentSeason, currentEpisode, currentServer, resetZoom]);

  // Clean up badge timer on unmount
  useEffect(() => {
    return () => {
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    };
  }, []);

  const getViewportDimensions = useCallback(() => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      return { width: rect.width || window.innerWidth, height: rect.height || window.innerHeight };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }, [containerRef]);

  const clampPan = useCallback((targetPan, targetScale) => {
    if (targetScale <= 1.0) return { x: 0, y: 0 };
    const { width, height } = getViewportDimensions();
    const maxPanX = Math.max(0, ((targetScale - 1) * width) / 2);
    const maxPanY = Math.max(0, ((targetScale - 1) * height) / 2);
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, targetPan.x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, targetPan.y)),
    };
  }, [getViewportDimensions]);

  // Touch handlers (Pinch to zoom + 1-finger pan when zoomed in)
  const handleTouchStart = useCallback((e) => {
    if (!isZoomEnabled) return;

    if (e.touches.length === 2) {
      // 2-finger pinch gesture start
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      initialDistRef.current = dist;
      initialScaleRef.current = scaleRef.current;
      initialMidRef.current = { x: midX, y: midY };
      initialPanRef.current = { ...panRef.current };

      isPinchingRef.current = true;
      isPanningRef.current = false;
      setIsInteracting(true);
    } else if (e.touches.length === 1) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchStartTimeRef.current = Date.now();

      if (scaleRef.current > 1.0) {
        // Single finger panning when zoomed in
        isPanningRef.current = true;
        panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panOriginRef.current = { ...panRef.current };
        setIsInteracting(true);
      }
    }
  }, [isZoomEnabled]);

  const handleTouchMove = useCallback((e) => {
    if (!isZoomEnabled) return;

    if (e.touches.length === 2 && isPinchingRef.current && initialDistRef.current > 0) {
      if (e.cancelable) e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const factor = currentDist / initialDistRef.current;

      // Scale gradually with smooth sensitivity
      const gradualFactor = 1 + (factor - 1) * 0.9;
      let newScale = initialScaleRef.current * gradualFactor;

      // Slight elastic resistance near bounds during active touch
      if (newScale < 1.0) {
        newScale = Math.max(0.92, newScale);
      } else if (newScale > 3.5) {
        newScale = Math.min(3.8, newScale);
      }

      // Midpoint pan tracking
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const deltaX = midX - initialMidRef.current.x;
      const deltaY = midY - initialMidRef.current.y;

      const rawPan = {
        x: initialPanRef.current.x + deltaX,
        y: initialPanRef.current.y + deltaY,
      };
      const clamped = clampPan(rawPan, newScale);

      setScale(newScale);
      setPan(clamped);
      scaleRef.current = newScale;
      panRef.current = clamped;
      showBadge(newScale);
    } else if (e.touches.length === 1 && isPanningRef.current && scaleRef.current > 1.0) {
      if (e.cancelable) e.preventDefault();

      const deltaX = e.touches[0].clientX - panStartRef.current.x;
      const deltaY = e.touches[0].clientY - panStartRef.current.y;

      const rawPan = {
        x: panOriginRef.current.x + deltaX,
        y: panOriginRef.current.y + deltaY,
      };
      const clamped = clampPan(rawPan, scaleRef.current);

      setPan(clamped);
      panRef.current = clamped;
    }
  }, [isZoomEnabled, clampPan, showBadge]);

  const handleTouchEnd = useCallback((e) => {
    if (!isZoomEnabled) return;

    if (isPinchingRef.current) {
      isPinchingRef.current = false;
      setIsInteracting(false);

      let finalScale = scaleRef.current;
      if (finalScale < 1.05) {
        // Snap back to 1.0 (Original Fit)
        finalScale = 1.0;
        setScale(1.0);
        setPan({ x: 0, y: 0 });
        scaleRef.current = 1.0;
        panRef.current = { x: 0, y: 0 };
        showBadge(1.0);
      } else if (finalScale > 3.5) {
        // Clamp down to 3.5 max scale
        finalScale = 3.5;
        const clamped = clampPan(panRef.current, 3.5);
        setScale(3.5);
        setPan(clamped);
        scaleRef.current = 3.5;
        panRef.current = clamped;
        showBadge(3.5);
      }
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsInteracting(false);
    }

    // Tap and double-tap detection
    if (e.touches.length === 0 && touchStartPosRef.current) {
      const changedTouch = e.changedTouches?.[0];
      if (changedTouch) {
        const distMoved = Math.hypot(
          changedTouch.clientX - touchStartPosRef.current.x,
          changedTouch.clientY - touchStartPosRef.current.y
        );
        const duration = Date.now() - touchStartTimeRef.current;

        if (distMoved < 12 && duration < 320) {
          const now = Date.now();
          if (now - lastTapTimeRef.current < 350) {
            // Double tap! If zoomed in, reset to original fit
            if (scaleRef.current > 1.0) {
              setScale(1.0);
              setPan({ x: 0, y: 0 });
              scaleRef.current = 1.0;
              panRef.current = { x: 0, y: 0 };
              showBadge(1.0);
            }
            lastTapTimeRef.current = 0;
          } else {
            lastTapTimeRef.current = now;
            onSingleTap?.();
          }
        }
      }
      touchStartPosRef.current = null;
    }
  }, [isZoomEnabled, clampPan, showBadge, onSingleTap]);

  // Desktop Mouse Scroll (Wheel) zoom:
  // Scroll Upward = Zoom in / Scale up gradually
  // Scroll Downward = Zoom out / Scale down gradually to 1.0 (Original Fit)
  const handleWheel = useCallback((e) => {
    if (!isZoomEnabled) return;
    if (e.cancelable) e.preventDefault();

    const delta = e.deltaY;
    if (Math.abs(delta) < 2) return;

    // Gradual step: 0.12x per scroll increment
    const step = 0.12;
    let nextScale;

    if (delta < 0) {
      // Scroll Upward: zoom in
      nextScale = Math.min(3.5, scaleRef.current + step);
    } else {
      // Scroll Downward: zoom out towards 1.0
      nextScale = Math.max(1.0, scaleRef.current - step);
    }

    // Snap to 1.0 if close
    if (nextScale <= 1.02) {
      nextScale = 1.0;
    }

    const clampedPan = clampPan(panRef.current, nextScale);

    setScale(nextScale);
    setPan(clampedPan);
    scaleRef.current = nextScale;
    panRef.current = clampedPan;
    showBadge(nextScale);
  }, [isZoomEnabled, clampPan, showBadge]);

  // Desktop Mouse Drag Pan (when zoomed in)
  const handleMouseDown = useCallback((e) => {
    if (!isZoomEnabled || scaleRef.current <= 1.0) return;
    if (e.button !== 0) return; // Left click only

    isMouseDownRef.current = true;
    mouseStartPosRef.current = { x: e.clientX, y: e.clientY };
    mousePanOriginRef.current = { ...panRef.current };
    setIsInteracting(true);
  }, [isZoomEnabled]);

  const handleMouseMove = useCallback((e) => {
    if (!isZoomEnabled || !isMouseDownRef.current || scaleRef.current <= 1.0) return;

    const deltaX = e.clientX - mouseStartPosRef.current.x;
    const deltaY = e.clientY - mouseStartPosRef.current.y;

    const rawPan = {
      x: mousePanOriginRef.current.x + deltaX,
      y: mousePanOriginRef.current.y + deltaY,
    };
    const clamped = clampPan(rawPan, scaleRef.current);

    setPan(clamped);
    panRef.current = clamped;
  }, [isZoomEnabled, clampPan]);

  const handleMouseUp = useCallback(() => {
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false;
      setIsInteracting(false);
    }
  }, []);

  // Double click on desktop when zoomed in to reset to Original Fit
  const handleDoubleClick = useCallback(() => {
    if (!isZoomEnabled || scaleRef.current <= 1.0) return;
    setScale(1.0);
    setPan({ x: 0, y: 0 });
    scaleRef.current = 1.0;
    panRef.current = { x: 0, y: 0 };
    showBadge(1.0);
  }, [isZoomEnabled, showBadge]);

  return {
    isZoomEnabled,
    scale,
    pan,
    isInteracting,
    badge,
    resetZoom,
    gestureHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onDoubleClick: handleDoubleClick,
    },
  };
}
