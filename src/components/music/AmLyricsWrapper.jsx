import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';

const COMPONENT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@uimaxbai/am-lyrics@0.6.4/dist/src/am-lyrics.min.js';
const SEEK_FORCE_THRESHOLD_MS = 220;

/**
 * AmLyricsWrapper - Reusable wrapper for the Apple Music-style lyrics web component
 */
const AmLyricsWrapper = ({ className = '', style = {} }) => {
    const { currentTrack, currentTime, isPlaying, seek } = useMusicPlayer();

    const [scriptStatus, setScriptStatus] = useState('idle');
    const [scriptError, setScriptError] = useState(null);
    const [lyricsKey, setLyricsKey] = useState(0);

    const amLyricsRef = useRef(null);
    const pendingLoadRef = useRef(null);
    const animationFrameRef = useRef(null);
    const lastBaseTimestampRef = useRef(0);
    const baseTimeMsRef = useRef(0);

    // Helper to get cover URL
    const getCoverUrl = (track, size = 640) => {
        if (!track) return '';

        const formatTidalUrl = (uuid) => {
            if (!uuid || typeof uuid !== 'string') return '';
            return `https://resources.tidal.com/images/${uuid.replace(/-/g, '/')}/${size}x${size}.jpg`;
        };

        if (track.album?.cover) {
            return formatTidalUrl(track.album.cover);
        }
        if (track.cover) {
            return formatTidalUrl(track.cover);
        }

        const coverUrl = track.album?.coverUrl || track.coverUrl;
        if (coverUrl && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coverUrl)) {
            return formatTidalUrl(coverUrl);
        }

        return coverUrl || '';
    };

    // Build metadata from current track
    const metadata = currentTrack ? {
        title: currentTrack.title || '',
        artist: currentTrack.artist?.name ||
            currentTrack.artists?.[0]?.name ||
            '',
        album: currentTrack.album?.title || '',
        albumArt: getCoverUrl(currentTrack, 640),
        query: `${currentTrack.title || ''} ${currentTrack.artist?.name || currentTrack.artists?.[0]?.name || ''}`.trim(),
        durationMs: typeof currentTrack.duration === 'number'
            ? Math.max(0, Math.round(currentTrack.duration * 1000))
            : undefined,
        isrc: currentTrack.isrc || ''
    } : null;

    // Load the am-lyrics component script
    const ensureComponentLoaded = useCallback(async () => {
        if (scriptStatus === 'ready') return;

        if (typeof customElements !== 'undefined' && customElements.get('am-lyrics')) {
            setScriptStatus('ready');
            setScriptError(null);
            return;
        }

        if (pendingLoadRef.current) {
            setScriptStatus('loading');
            try {
                await pendingLoadRef.current;
            } catch {
                // handled when the original promise settles
            }
            return;
        }

        setScriptStatus('loading');
        setScriptError(null);

        pendingLoadRef.current = new Promise((resolve, reject) => {
            const waitForDefinition = () => {
                if (typeof customElements !== 'undefined' && 'whenDefined' in customElements) {
                    customElements.whenDefined('am-lyrics')
                        .then(() => resolve())
                        .catch(reject);
                } else {
                    resolve();
                }
            };

            if (typeof customElements !== 'undefined' && customElements.get('am-lyrics')) {
                resolve();
                return;
            }

            const existing = document.querySelector('script[data-am-lyrics]');
            if (existing) {
                if (existing.dataset.loaded === 'true') {
                    waitForDefinition();
                    return;
                }
                const handleLoad = () => {
                    existing.dataset.loaded = 'true';
                    waitForDefinition();
                };
                const handleError = () => {
                    existing.removeEventListener('load', handleLoad);
                    existing.removeEventListener('error', handleError);
                    existing.remove();
                    reject(new Error('Failed to load lyrics component.'));
                };
                existing.addEventListener('load', handleLoad, { once: true });
                existing.addEventListener('error', handleError, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.type = 'module';
            script.src = COMPONENT_MODULE_URL;
            script.dataset.amLyrics = 'true';

            const handleLoad = () => {
                script.dataset.loaded = 'true';
                waitForDefinition();
            };

            const handleError = () => {
                script.removeEventListener('load', handleLoad);
                script.removeEventListener('error', handleError);
                script.remove();
                reject(new Error('Failed to load lyrics component.'));
            };

            script.addEventListener('load', handleLoad, { once: true });
            script.addEventListener('error', handleError, { once: true });
            document.head.append(script);
        });

        try {
            await pendingLoadRef.current;
            setScriptStatus('ready');
            setScriptError(null);
            if (amLyricsRef.current) {
                amLyricsRef.current.currentTime = baseTimeMsRef.current;
            }
        } catch (error) {
            console.error('Failed to load Apple Music lyrics component', error);
            setScriptStatus('error');
            setScriptError(error instanceof Error ? error.message : 'Unable to load lyrics component.');
        } finally {
            pendingLoadRef.current = null;
        }
    }, [scriptStatus]);

    // Load component on mount
    useEffect(() => {
        ensureComponentLoaded();
    }, [ensureComponentLoaded]);

    // Update base time when currentTime changes
    useEffect(() => {
        const nextMs = Number.isFinite(currentTime) ? Math.max(0, currentTime * 1000) : 0;
        baseTimeMsRef.current = nextMs;
        lastBaseTimestampRef.current = performance.now();

        if (scriptStatus === 'ready' && amLyricsRef.current) {
            const current = Number(amLyricsRef.current.currentTime ?? 0);
            const delta = Math.abs(current - nextMs);
            if (!isPlaying || delta > SEEK_FORCE_THRESHOLD_MS) {
                amLyricsRef.current.currentTime = nextMs;
            }
        }
    }, [currentTime, isPlaying, scriptStatus]);

    // Refresh lyrics when track changes
    useEffect(() => {
        if (currentTrack?.id) {
            setLyricsKey(prev => prev + 1);
        }
    }, [currentTrack?.id]);

    // Animation loop for smooth time updates during playback
    useEffect(() => {
        const stopAnimation = () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };

        if (!amLyricsRef.current || scriptStatus !== 'ready') {
            stopAnimation();
            if (amLyricsRef.current) {
                amLyricsRef.current.currentTime = baseTimeMsRef.current;
            }
            return;
        }

        if (!isPlaying) {
            stopAnimation();
            amLyricsRef.current.currentTime = baseTimeMsRef.current;
            return;
        }

        const element = amLyricsRef.current;
        const originBase = baseTimeMsRef.current;
        const nowTimestamp = performance.now();
        const originTimestamp =
            lastBaseTimestampRef.current && Math.abs(nowTimestamp - lastBaseTimestampRef.current) < 1200
                ? lastBaseTimestampRef.current
                : nowTimestamp;

        const tick = (now) => {
            const elapsed = now - originTimestamp;
            const nextMs = originBase + elapsed;
            element.currentTime = nextMs;
            animationFrameRef.current = requestAnimationFrame(tick);
        };

        animationFrameRef.current = requestAnimationFrame(tick);

        return () => stopAnimation();
    }, [scriptStatus, isPlaying]);

    // Inject styles into Shadow DOM to hide scrollbars and header
    useEffect(() => {
        const element = amLyricsRef.current;
        if (!element || scriptStatus !== 'ready') return;

        const injectStyles = () => {
            if (!element.shadowRoot) return;

            const styleId = 'am-lyrics-custom-styles';
            if (element.shadowRoot.getElementById(styleId)) return;

            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .lyrics-container {
                    scrollbar-width: none !important;
                    -ms-overflow-style: none !important;
                }
                .lyrics-container::-webkit-scrollbar {
                    display: none !important;
                }
                .lyrics-header {
                    display: none !important;
                }
            `;
            element.shadowRoot.appendChild(style);
        };

        // Try immediately
        injectStyles();

        // Also watch for shadow root attachment if not ready
        const observer = new MutationObserver(() => {
            if (element.shadowRoot) {
                injectStyles();
            }
        });

        observer.observe(element, { childList: true, subtree: true });

        // Backup retry
        const timer = setTimeout(injectStyles, 500);

        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, [scriptStatus, lyricsKey]); // Re-run when key changes (new lyrics loaded)

    // Handle line click for seeking
    useEffect(() => {
        const element = amLyricsRef.current;
        if (!element) return;

        const handleLineClick = (event) => {
            const detail = event.detail;
            if (!detail) return;
            const timeSeconds = detail.timestamp / 1000;
            if (seek) {
                seek(timeSeconds);
            }
        };

        element.addEventListener('line-click', handleLineClick);
        return () => element.removeEventListener('line-click', handleLineClick);
    }, [seek, lyricsKey]);

    const handleRetry = () => {
        setScriptStatus('idle');
        setScriptError(null);
        ensureComponentLoaded();
    };

    return (
        <div className={`am-lyrics-wrapper ${className}`} style={style}>
            {scriptStatus === 'error' && (
                <div className="lyrics-error">
                    <p>{scriptError ?? 'Unable to load lyrics right now.'}</p>
                    <button type="button" onClick={handleRetry}>Try again</button>
                </div>
            )}

            {!metadata && scriptStatus !== 'error' && (
                <div className="lyrics-empty">
                    <p>Play a song to see lyrics</p>
                </div>
            )}

            {metadata && (scriptStatus === 'loading' || scriptStatus === 'idle') && (
                <div className="lyrics-loading">
                    <span className="lyrics-spinner" />
                </div>
            )}

            {metadata && scriptStatus === 'ready' && (
                <div className="lyrics-content" key={lyricsKey}>
                    <am-lyrics
                        ref={amLyricsRef}
                        class="am-lyrics-fullscreen"
                        song-title={metadata.title}
                        song-artist={metadata.artist}
                        song-album={metadata.album || undefined}
                        song-duration={metadata.durationMs}
                        query={metadata.query}
                        isrc={metadata.isrc || undefined}
                        highlight-color="#ffffff"
                        hover-background-color="rgba(255, 255, 255, 0.08)"
                        font-family="'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
                        autoscroll
                        interpolate="false"
                    />
                </div>
            )}
        </div>
    );
};

export default AmLyricsWrapper;
