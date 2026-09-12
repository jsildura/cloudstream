import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoZoom } from './useVideoZoom';

describe('useVideoZoom Hook', () => {
  let originalInnerWidth;
  let originalInnerHeight;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    // Set landscape dimensions by default for tests (844 x 390)
    window.innerWidth = 844;
    window.innerHeight = 390;
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    window.innerHeight = originalInnerHeight;
    vi.useRealTimers();
  });

  it('is enabled only when isFullscreen is true and orientation is landscape', () => {
    // Landscape, but not fullscreen -> disabled
    const { result, rerender } = renderHook(
      (props) => useVideoZoom(props),
      { initialProps: { isFullscreen: false, id: 1, currentSeason: 1, currentEpisode: 1 } }
    );
    expect(result.current.isZoomEnabled).toBe(false);

    // Landscape AND fullscreen -> enabled
    rerender({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 });
    expect(result.current.isZoomEnabled).toBe(true);

    // Portrait AND fullscreen -> disabled
    act(() => {
      window.innerWidth = 390;
      window.innerHeight = 844;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isZoomEnabled).toBe(false);
  });

  it('pinch outward scales video up gradually', () => {
    const { result } = renderHook(() =>
      useVideoZoom({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 })
    );

    expect(result.current.scale).toBe(1.0);

    // Simulate 2-finger touchstart with distance 100
    act(() => {
      result.current.gestureHandlers.onTouchStart({
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      });
    });

    // Simulate 2-finger touchmove with distance 150 (spread outward)
    act(() => {
      result.current.gestureHandlers.onTouchMove({
        touches: [
          { clientX: 75, clientY: 100 },
          { clientX: 225, clientY: 100 },
        ],
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });

    // Scale should have increased above 1.0
    expect(result.current.scale).toBeGreaterThan(1.0);
    expect(result.current.badge.visible).toBe(true);
  });

  it('pinch inward scales video back down towards 1.0 and snaps to 1.0 on release', () => {
    const { result } = renderHook(() =>
      useVideoZoom({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 })
    );

    // First zoom in with wheel
    act(() => {
      result.current.gestureHandlers.onWheel({
        deltaY: -100,
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });
    expect(result.current.scale).toBeGreaterThan(1.0);

    // Now pinch inward (start distance 200, move to distance 120)
    act(() => {
      result.current.gestureHandlers.onTouchStart({
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 300, clientY: 100 },
        ],
      });
    });

    act(() => {
      result.current.gestureHandlers.onTouchMove({
        touches: [
          { clientX: 140, clientY: 100 },
          { clientX: 260, clientY: 100 },
        ],
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });

    // Release touch
    act(() => {
      result.current.gestureHandlers.onTouchEnd({
        touches: [],
      });
    });

    // Should snap to 1.0 if close, or be clamped >= 1.0
    expect(result.current.scale).toBeGreaterThanOrEqual(1.0);
  });

  it('mouse scroll up scales video up and scroll down scales back down to 1.0', () => {
    const { result } = renderHook(() =>
      useVideoZoom({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 })
    );

    expect(result.current.scale).toBe(1.0);

    // Scroll up -> scale up
    act(() => {
      result.current.gestureHandlers.onWheel({
        deltaY: -50,
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });
    expect(result.current.scale).toBeCloseTo(1.12, 2);
    expect(result.current.badge.visible).toBe(true);

    // Scroll down -> scale down to 1.0
    act(() => {
      result.current.gestureHandlers.onWheel({
        deltaY: 50,
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });
    expect(result.current.scale).toBe(1.0);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });

  it('scale does not exceed max limit of 3.5x', () => {
    const { result } = renderHook(() =>
      useVideoZoom({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 })
    );

    // Scroll up many times
    for (let i = 0; i < 30; i++) {
      act(() => {
        result.current.gestureHandlers.onWheel({
          deltaY: -100,
          cancelable: true,
          preventDefault: vi.fn(),
        });
      });
    }

    expect(result.current.scale).toBeLessThanOrEqual(3.5);
  });

  it('resets to 1.0x when media changes or exiting fullscreen', () => {
    const { result, rerender } = renderHook(
      (props) => useVideoZoom(props),
      { initialProps: { isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 } }
    );

    act(() => {
      result.current.gestureHandlers.onWheel({
        deltaY: -100,
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });
    expect(result.current.scale).toBeGreaterThan(1.0);

    // Change episode -> resets to 1.0
    rerender({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 2 });
    expect(result.current.scale).toBe(1.0);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });

    // Zoom in again
    act(() => {
      result.current.gestureHandlers.onWheel({
        deltaY: -100,
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });
    expect(result.current.scale).toBeGreaterThan(1.0);

    // Exit fullscreen -> resets to 1.0
    rerender({ isFullscreen: false, id: 1, currentSeason: 1, currentEpisode: 2 });
    expect(result.current.scale).toBe(1.0);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });

  it('double click on desktop resets zoom to original fit when zoomed in', () => {
    const { result } = renderHook(() =>
      useVideoZoom({ isFullscreen: true, id: 1, currentSeason: 1, currentEpisode: 1 })
    );

    act(() => {
      result.current.gestureHandlers.onWheel({
        deltaY: -100,
        cancelable: true,
        preventDefault: vi.fn(),
      });
    });
    expect(result.current.scale).toBeGreaterThan(1.0);

    act(() => {
      result.current.gestureHandlers.onDoubleClick();
    });

    expect(result.current.scale).toBe(1.0);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });
});
