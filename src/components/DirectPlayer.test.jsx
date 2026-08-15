import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Hls from 'hls.js';
import DirectPlayer from './DirectPlayer.jsx';

// ---------------------------------------------------------------------------
// hls.js mock
// ---------------------------------------------------------------------------
// Replicates only the surface DirectPlayer touches: on/emit, loadSource,
// attachMedia, startLoad, recoverMediaError, destroy, plus the Events and
// ErrorTypes constants. `hlsInstances` lets tests drive per-attempt error
// sequences and assert HOW MANY Hls objects were constructed — the
// stale-handler and double-advance assertions are all about that count.
const { hlsInstances } = vi.hoisted(() => ({ hlsInstances: [] }));

vi.mock('hls.js', () => {
  class FakeHls {
    constructor() {
      this.listeners = {};
      this.startLoadCount = 0;
      this.recoverCount = 0;
      this.destroyed = false;
      hlsInstances.push(this);
    }
    on(evt, cb) {
      (this.listeners[evt] ||= []).push(cb);
    }
    emit(evt, data) {
      (this.listeners[evt] || []).forEach((cb) => cb(evt, data));
    }
    loadSource(url) {
      this.src = url;
    }
    attachMedia(video) {
      this.video = video;
    }
    startLoad() {
      this.startLoadCount += 1;
    }
    recoverMediaError() {
      this.recoverCount += 1;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  FakeHls.isSupported = () => true;
  FakeHls.Events = { MANIFEST_PARSED: 'mp', ERROR: 'err' };
  FakeHls.ErrorTypes = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media', OTHER_ERROR: 'other' };
  return { default: FakeHls };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hlsSource = (url = 'https://cdn.example/manifest.m3u8') => ({ kind: 'hls', url });
const mp4Source = (url = 'https://cdn.example/video.mp4') => ({ kind: 'mp4', url });

const stubFetch = (body) => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => (typeof body === 'function' ? body() : body),
  }));
};

const netFatal = () => ({ fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR });
const mediaFatal = () => ({ fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR });
const otherFatal = () => ({ fatal: true, type: Hls.ErrorTypes.OTHER_ERROR });
const nonFatal = () => ({ fatal: false, type: Hls.ErrorTypes.NETWORK_ERROR });

const renderPlayer = (props = {}) => {
  const onFallback = vi.fn();
  const utils = render(
    <DirectPlayer
      type="movie"
      id={123}
      title="Test Movie"
      onFallback={onFallback}
      {...props}
    />
  );
  return { ...utils, onFallback };
};

// Flush the async loadSources() chain (fetch → json → playSources).
const flush = () => act(async () => {});

const emitError = (hls, data) => act(() => hls.emit(Hls.Events.ERROR, data));

const fireVideoEvent = (name) => {
  const video = document.querySelector('video');
  act(() => video.dispatchEvent(new Event(name)));
  return video;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  hlsInstances.length = 0;
  stubFetch({ success: true, sources: [hlsSource()] });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// A. Fatal HLS error retry budgets (bug 1)
// ---------------------------------------------------------------------------

describe('fatal HLS error retry budgets', () => {
  it('recovers NETWORK_ERROR fatals in place with startLoad, bounded at 2', async () => {
    const { onFallback } = renderPlayer();
    await flush();
    const hls = hlsInstances[0];

    emitError(hls, netFatal());
    emitError(hls, netFatal());
    expect(hls.startLoadCount).toBe(2);
    expect(hlsInstances).toHaveLength(1); // still in place, no advance

    // Third fatal exhausts the budget → advance → only source gone → fallback.
    emitError(hls, netFatal());
    expect(screen.getByText('All sources failed, switching to another server...')).toBeInTheDocument();
    expect(onFallback).not.toHaveBeenCalled(); // delayed so the message paints

    await act(async () => vi.advanceTimersByTime(1500));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('recovers MEDIA_ERROR fatals with recoverMediaError, bounded at 2', async () => {
    const { onFallback } = renderPlayer();
    await flush();
    const hls = hlsInstances[0];

    emitError(hls, mediaFatal());
    emitError(hls, mediaFatal());
    expect(hls.recoverCount).toBe(2);
    expect(hlsInstances).toHaveLength(1);

    emitError(hls, mediaFatal());
    await act(async () => vi.advanceTimersByTime(1500));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('ignores non-fatal errors entirely', async () => {
    const { onFallback } = renderPlayer();
    await flush();
    const hls = hlsInstances[0];

    emitError(hls, nonFatal());
    expect(hls.startLoadCount).toBe(0);
    expect(hlsInstances).toHaveLength(1);
    expect(screen.queryByText(/switching to another server/)).not.toBeInTheDocument();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('keeps separate budgets per error type', async () => {
    const { onFallback } = renderPlayer();
    await flush();
    const hls = hlsInstances[0];

    // Spend the network budget; the media budget must be untouched.
    emitError(hls, netFatal());
    emitError(hls, netFatal());
    expect(hls.startLoadCount).toBe(2);

    // Media budget still has its full 2 recoveries.
    emitError(hls, mediaFatal());
    emitError(hls, mediaFatal());
    expect(hls.recoverCount).toBe(2);
    expect(hlsInstances).toHaveLength(1);

    // Exhausting media falls through to advance.
    emitError(hls, mediaFatal());
    await act(async () => vi.advanceTimersByTime(1500));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('resets retry budgets for each new source attempt', async () => {
    stubFetch({ success: true, sources: [hlsSource('a.m3u8'), hlsSource('b.m3u8')] });
    renderPlayer();
    await flush();
    expect(hlsInstances).toHaveLength(1);
    const first = hlsInstances[0];

    // Burn A's budget; a third fatal advances to B (and destroys A).
    emitError(first, netFatal());
    emitError(first, netFatal());
    emitError(first, netFatal());
    // B constructs its Hls asynchronously (hls.js is lazy-loaded).
    await flush();
    expect(hlsInstances).toHaveLength(2);
    expect(first.destroyed).toBe(true);

    // B starts fresh: its first network fatal recovers in place.
    const second = hlsInstances[1];
    emitError(second, netFatal());
    expect(second.startLoadCount).toBe(1);
    expect(hlsInstances).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// B. advanced/ready guards (bug 2)
// ---------------------------------------------------------------------------

describe('advanced/ready guards', () => {
  it('does not re-advance when a stale element error fires after moving to HLS', async () => {
    stubFetch({ success: true, sources: [mp4Source(), hlsSource()] });
    renderPlayer();
    await flush();

    // First attempt is the mp4; it errors → advances to HLS (constructed
    // asynchronously because hls.js is lazy-loaded).
    fireVideoEvent('error');
    await flush();
    expect(hlsInstances).toHaveLength(1);

    // A late error on the shared element (leftover from the mp4 attempt)
    // must not construct another source. Whether the aborted listener was
    // actually removed or still fires, the attempt's `advanced` guard blocks it.
    fireVideoEvent('error');
    expect(hlsInstances).toHaveLength(1);
  });

  it('fires onReady (and video.play) only once per attempt', async () => {
    stubFetch({ success: true, sources: [mp4Source()] });
    renderPlayer();
    await flush();
    const video = document.querySelector('video');

    fireVideoEvent('loadedmetadata');
    fireVideoEvent('loadedmetadata');

    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('advances at most once when two fatals fire in the same tick', async () => {
    stubFetch({ success: true, sources: [hlsSource('a.m3u8'), hlsSource('b.m3u8')] });
    renderPlayer();
    await flush();
    const first = hlsInstances[0];

    // OTHER_ERROR is never recovered in place — both fatals would try to
    // advance; the `advanced` guard lets only the first through.
    act(() => {
      first.emit(Hls.Events.ERROR, otherFatal());
      first.emit(Hls.Events.ERROR, otherFatal());
    });
    // The next Hls instance is constructed asynchronously (lazy-loaded).
    await flush();
    expect(hlsInstances).toHaveLength(2);
  });

  it('still advances on an element error after playback started (truncated file)', async () => {
    stubFetch({ success: true, sources: [mp4Source()] });
    const { onFallback } = renderPlayer();
    await flush();
    const video = document.querySelector('video');

    fireVideoEvent('loadedmetadata');
    expect(video.play).toHaveBeenCalledTimes(1);

    // A decode error after playback began abandons the source and moves on.
    fireVideoEvent('error');
    expect(screen.getByText('All sources failed, switching to another server...')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1500));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Resume (bug 3) — once per load, capped near the end
// ---------------------------------------------------------------------------

describe('resume behavior', () => {
  it('applies resume once on MANIFEST_PARSED and starts playback', async () => {
    stubFetch({ success: true, sources: [hlsSource()] });
    renderPlayer({ resumeTime: 100 });
    await flush();
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', { value: 1000, configurable: true });

    act(() => hlsInstances[0].emit(Hls.Events.MANIFEST_PARSED, {}));

    expect(video.currentTime).toBe(100);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument(); // loading hidden
  });

  it('caps resume just before the end so finished videos restart', async () => {
    stubFetch({ success: true, sources: [hlsSource()] });
    renderPlayer({ resumeTime: 5000 });
    await flush();
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });

    act(() => hlsInstances[0].emit(Hls.Events.MANIFEST_PARSED, {}));

    expect(video.currentTime).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Play-state reporting (credits countdown support)
// ---------------------------------------------------------------------------

describe('play-state reporting', () => {
  it('reports play, pause, and ended via onPlayStateChange', async () => {
    const onPlayStateChange = vi.fn();
    renderPlayer({ onPlayStateChange });
    await flush();

    fireVideoEvent('play');
    expect(onPlayStateChange).toHaveBeenLastCalledWith(true);

    fireVideoEvent('pause');
    expect(onPlayStateChange).toHaveBeenLastCalledWith(false);

    fireVideoEvent('ended');
    expect(onPlayStateChange).toHaveBeenLastCalledWith(false);
    expect(onPlayStateChange).toHaveBeenCalledTimes(3);
  });

  it('does not require onPlayStateChange (optional prop)', async () => {
    renderPlayer();
    await flush();
    expect(() => fireVideoEvent('play')).not.toThrow();
    expect(() => fireVideoEvent('ended')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// C. Fallback timing (errorMsg wiring) + teardown
// ---------------------------------------------------------------------------

describe('fallback timing and teardown', () => {
  it('shows the no-sources message, hides the spinner, then falls back after 1.5s', async () => {
    stubFetch({ success: true, sources: [] });
    const { onFallback } = renderPlayer();
    await flush();

    // Message visible, spinner gone, switch NOT yet fired (it is delayed).
    expect(screen.getByText('No playable sources found, switching to another server...')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onFallback).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(1499));
    expect(onFallback).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('shows the fetch-error message when resolution fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    const { onFallback } = renderPlayer();
    await flush();

    expect(screen.getByText('Failed to load stream, switching to another server...')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1500));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending fallback if the player unmounts first', async () => {
    stubFetch({ success: true, sources: [] });
    const { onFallback, unmount } = renderPlayer();
    await flush();

    expect(screen.getByText('No playable sources found, switching to another server...')).toBeInTheDocument();
    act(() => unmount());
    await act(async () => vi.advanceTimersByTime(2000));
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('tears down the media pipeline on unmount', async () => {
    const { unmount } = renderPlayer();
    await flush();
    const hls = hlsInstances[0];
    const video = document.querySelector('video');
    video.setAttribute('src', 'https://cdn.example/video.mp4');

    act(() => unmount());

    expect(hls.destroyed).toBe(true);
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.load).toHaveBeenCalled();
  });
});
