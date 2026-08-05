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
      if (!video || resumeApplied || resumeTime <= 0) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const target = Math.min(resumeTime, Math.max(0, video.duration - 1));
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
          onFallbackRef.current();
          return;
        }

        playSources(data.sources, 0);

      } catch (err) {
        if (!active) return;
        if (err.name === 'AbortError') return;
        console.error('Resolve error:', err);
        onFallbackRef.current();
      }
    };

    const playSources = (sources, index) => {
      if (!active) return;
      if (index >= sources.length) {
        onFallbackRef.current();
        return;
      }

      const source = sources[index];
      const video = videoRef.current;
      if (!video) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const tryNext = () => playSources(sources, index + 1);

      if (source.kind === 'mp4') {
        video.src = source.url;
        video.onloadedmetadata = () => {
           if(active) { applyResume(); setLoading(false); video.play().catch(console.error); }
        };
        video.onerror = tryNext;
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
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if(active) { applyResume(); setLoading(false); video.play().catch(console.error); }
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              tryNext();
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = source.url;
          video.onloadedmetadata = () => {
             if(active) { applyResume(); setLoading(false); video.play().catch(console.error); }
          };
          video.onerror = tryNext;
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
      cleanupResume();
      abortController.abort();
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [id, season, episode, type, title, year, date, runtime, resumeTime]);

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
