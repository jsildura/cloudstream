import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import './DirectPlayer.css';

const LOADING_MESSAGES = [
  'Loading stream...',
  'Contacting servers...',
  'Finding a fast source...',
  'Setting up playback...',
  'Almost there...'
];

export default function DirectPlayer({
  type, id, season, episode, title, year, date, runtime, onFallback, showControls = true, backdrop, onProgress, resumeTime = 0
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  // resumeTime is a seek target, not part of the stream's identity. Reading it
  // live from a ref (instead of listing it in the main effect's deps) means a
  // 0 → saved-position flip can't tear down and re-resolve the stream.
  const resumeTimeRef = useRef(resumeTime);
  resumeTimeRef.current = resumeTime;
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    setLoadingMessageIndex(0);
    if (!loading) return undefined;
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [loading]);

  // Watch-progress tracking: throttled timeupdate, forced flush on
  // play/pause/ended/seeked, tab hide/close, and unmount. The history
  // entry itself is created by Watch.jsx when the player loads.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let lastSentAt = 0;
    const sendProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastSentAt < 5000) return;
      const timestamp = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      lastSentAt = now;
      onProgressRef.current?.({
        id,
        type,
        season,
        episode,
        timestamp,
        duration,
        progress: duration > 0 ? timestamp / duration : 0
      });
    };

    const flush = () => sendProgress(true);
    const onTimeUpdate = () => sendProgress(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', flush);
    video.addEventListener('pause', flush);
    video.addEventListener('ended', flush);
    video.addEventListener('seeked', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', flush);
      video.removeEventListener('pause', flush);
      video.removeEventListener('ended', flush);
      video.removeEventListener('seeked', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [id, type, season, episode]);

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();

    // Resume once per load: seek to the saved position as soon as the
    // media is ready (loadedmetadata), capped just before the end so a
    // finished video restarts instead of ending instantly.
    const resumeVideo = videoRef.current;
    let resumeApplied = false;
    const applyResume = () => {
      const video = videoRef.current;
      if (!video || resumeApplied || resumeTimeRef.current <= 0) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const target = Math.min(resumeTimeRef.current, Math.max(0, video.duration - 1));
      video.currentTime = target;
      resumeApplied = true;
    };
    if (resumeVideo) {
      resumeVideo.addEventListener('loadedmetadata', applyResume);
    }
    const cleanupResume = () => {
      if (resumeVideo) {
        resumeVideo.removeEventListener('loadedmetadata', applyResume);
      }
    };

    // All direct sources failed: surface feedback before falling back so the
    // server switch isn't a silent jump. Watch.jsx unmounts this player and
    // swaps in the next server's embed, which replaces this message. The
    // fallback call is delayed so the message actually paints: React batches
    // state updates, so calling onFallback synchronously would unmount this
    // player in the same commit and the message would never be visible.
    let fallbackTimer = null;
    const fallback = (message) => {
      setErrorMsg(message);
      setLoading(false);
      fallbackTimer = setTimeout(() => {
        if (active) onFallbackRef.current();
      }, 1500);
    };

    const loadSources = async () => {
      setLoading(true);
      setErrorMsg('');

      try {
        const meta = {
          tmdbId: id,
          mediaType: type,
          season,
          episode,
          title,
          year,
          date,
          runtime
        };

        const res = await fetch('/api/stream/streamflix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(meta),
          signal: abortController.signal
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (!active) return;

        if (!data.success || !data.sources || data.sources.length === 0) {
          fallback('No playable sources found, switching to another server...');
          return;
        }

        playSources(data.sources, 0);

      } catch (err) {
        if (!active) return;
        if (err.name === 'AbortError') return;
        console.error('Resolve error:', err);
        fallback('Failed to load stream, switching to another server...');
      }
    };

    // Per-attempt DOM listeners on the shared <video> element. Any handler a
    // previous attempt leaves behind fires against the next attempt's media —
    // re-entrantly reloading the source that is already playing instead of
    // advancing past it. Each new attempt aborts the previous controller, and
    // the cleanup path aborts too, so no handler outlives its attempt.
    let attemptAbort = null;

    const playSources = (sources, index) => {
      if (!active) return;
      if (index >= sources.length) {
        fallback('All sources failed, switching to another server...');
        return;
      }

      const source = sources[index];
      const video = videoRef.current;
      if (!video) return;

      // Abort the previous attempt's listeners before wiring this one — this
      // is what guarantees no handler outlives its attempt (see above).
      if (attemptAbort) {
        attemptAbort.abort();
        attemptAbort = null;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const tryNext = () => playSources(sources, index + 1);

      // `ready` and `advanced` let an attempt resolve exactly once: playback
      // can start once, and the source can be abandoned once. This blocks
      // double-ready (loadedmetadata racing MANIFEST_PARSED) and double-advance
      // (two fatal HLS errors in the same tick each calling tryNext).
      let ready = false;
      let advanced = false;
      const attemptSignal = (attemptAbort = new AbortController()).signal;

      const onReady = () => {
        if (!active || ready) return;
        ready = true;
        applyResume();
        setLoading(false);
        video.play().catch(console.error);
      };
      const onElementError = () => {
        if (advanced) return;
        advanced = true;
        tryNext();
      };

      if (source.kind === 'mp4') {
        video.src = source.url;
        video.addEventListener('loadedmetadata', onReady, { signal: attemptSignal });
        video.addEventListener('error', onElementError, { signal: attemptSignal });
      } else if (source.kind === 'hls') {
        if (Hls.isSupported()) {
          const hls = new Hls({
            fetchSetup: (context, initParams) => {
              initParams.referrerPolicy = 'no-referrer';
              return new Request(context.url, initParams);
            }
          });
          hlsRef.current = hls;
          hls.loadSource(source.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, onReady);
          // Fatal errors are often transient — a single 502 segment, a CDN
          // connection reset, a buffer stall escalated to MEDIA_ERROR. Recover
          // in place with hls.js's documented pattern: startLoad() for network
          // errors, recoverMediaError() for media errors, each bounded to 2
          // tries per source. Counters live in this closure, so every source
          // attempt starts fresh. Only when retries are exhausted (or the
          // error type is unrecoverable) do we advance to the next source.
          let netRetries = 0;
          let mediaRetries = 0;
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (!data.fatal || !active) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries++ < 2) {
              hls.startLoad();
              return;
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) {
              hls.recoverMediaError();
              return;
            }
            // OTHER_ERROR, or retries exhausted: genuinely unrecoverable here.
            // `advanced` blocks a second fatal in the same tick from
            // double-invoking tryNext and skipping past a source.
            if (advanced) return;
            advanced = true;
            tryNext();
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = source.url;
          video.addEventListener('loadedmetadata', onReady, { signal: attemptSignal });
          video.addEventListener('error', onElementError, { signal: attemptSignal });
        } else {
          tryNext();
        }
      } else {
        tryNext();
      }
    };

    loadSources();

    return () => {
      active = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      cleanupResume();
      abortController.abort();
      if (attemptAbort) attemptAbort.abort();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Detach the element's media so buffered data and the connection are
      // released now, not whenever the element is next reused or GC'd. This
      // runs after the progress effect's cleanup (declared earlier) has
      // flushed the final position, so the last write is never zeroed.
      // `resumeVideo` is the element captured at effect start (same node).
      if (resumeVideo) {
        resumeVideo.removeAttribute('src');
        resumeVideo.load();
      }
    };
  }, [id, season, episode, type, title, year, date, runtime]);

  return (
    <div className="direct-player-container">
      {loading && backdrop && (
        <div
          className="direct-player-backdrop"
          style={{ backgroundImage: `url(${backdrop})` }}
          aria-hidden="true"
        />
      )}
      {loading && <div className="direct-player-scrim" aria-hidden="true" />}
      {loading && (
        <div className="direct-player-loading" role="status" aria-label="Loading stream">
          <div className="loading-spinner" />
          <p key={loadingMessageIndex}>{LOADING_MESSAGES[loadingMessageIndex]}</p>
        </div>
      )}
      {errorMsg && <div className="direct-player-error">{errorMsg}</div>}
      <video
        ref={videoRef}
        controls={showControls}
        playsInline
        referrerPolicy="no-referrer"
        className="direct-player-video"
        style={{ visibility: loading ? 'hidden' : 'visible' }}
      />
    </div>
  );
}
