import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import './LyricsPopup.css';

/**
 * LyricsPopup - Modal for displaying synced lyrics
 * 
 * Ported from tidal-ui LyricsPopup.svelte
 * Uses the <am-lyrics> web component for metadata-based lyrics fetching
 */

const COMPONENT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@uimaxbai/am-lyrics@0.6.4/dist/src/am-lyrics.min.js';
const SEEK_FORCE_THRESHOLD_MS = 220;

const LyricsPopup = ({ isOpen, onClose }) => {
    const { currentTrack, currentTime, isPlaying, seek } = useMusicPlayer();

    const [scriptStatus, setScriptStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
    const [scriptError, setScriptError] = useState(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [lyricsKey, setLyricsKey] = useState(0);

    const amLyricsRef = useRef(null);
    const pendingLoadRef = useRef(null);
    const animationFrameRef = useRef(null);
    const lastBaseTimestampRef = useRef(0);
    const baseTimeMsRef = useRef(0);

    // Build metadata from current track
    const metadata = currentTrack ? {
        title: currentTrack.title || '',
        artist: currentTrack.artist?.name ||
            currentTrack.artists?.[0]?.name ||
            '',
        album: currentTrack.album?.title || '',
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

    // Load component when popup opens
    useEffect(() => {
        if (isOpen) {
            ensureComponentLoaded();
        }
    }, [isOpen, ensureComponentLoaded]);

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
        if (isOpen && currentTrack?.id) {
            setLyricsKey(prev => prev + 1);
        }
    }, [currentTrack?.id, isOpen]);

    // Animation loop for smooth time updates during playback
    useEffect(() => {
        const stopAnimation = () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };

        if (!amLyricsRef.current || scriptStatus !== 'ready' || !isOpen) {
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
    }, [scriptStatus, isOpen, isPlaying]);

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

    // Handle keyboard escape
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleRefresh = () => {
        setLyricsKey(prev => prev + 1);
        if (scriptStatus !== 'ready') {
            setScriptStatus('idle');
            setScriptError(null);
            ensureComponentLoaded();
        }
    };

    const handleRetry = () => {
        setScriptStatus('idle');
        setScriptError(null);
        ensureComponentLoaded();
    };

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="lyrics-popup__overlay" onClick={handleOverlayClick}>
            <div className={`lyrics-popup ${isMaximized ? 'lyrics-popup--maximized' : ''}`}>
                {/* Header */}
                <header className="lyrics-popup__header">
                    <div className="lyrics-popup__heading">
                        <h2 className="lyrics-popup__title-text">Lyrics</h2>
                        {metadata ? (
                            <>
                                <p className="lyrics-popup__subtitle">
                                    {metadata.title} • {metadata.artist}
                                </p>
                                {metadata.album && (
                                    <p className="lyrics-popup__album">{metadata.album}</p>
                                )}
                            </>
                        ) : (
                            <p className="lyrics-popup__subtitle">
                                Start playback to load synced lyrics.
                            </p>
                        )}
                    </div>
                    <div className="lyrics-popup__header-actions">
                        <button
                            type="button"
                            className="lyrics-popup__icon-button"
                            onClick={handleRefresh}
                            aria-label="Refresh lyrics"
                            title="Refresh lyrics"
                            disabled={!metadata || scriptStatus === 'loading'}
                        >
                            <RefreshCw
                                size={18}
                                className={scriptStatus === 'loading' ? 'animate-spin' : ''}
                            />
                        </button>
                        <button
                            type="button"
                            className="lyrics-popup__icon-button"
                            onClick={() => setIsMaximized(!isMaximized)}
                            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                            title={isMaximized ? 'Restore window' : 'Maximize window'}
                        >
                            {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        <button
                            type="button"
                            className="lyrics-popup__icon-button"
                            onClick={onClose}
                            aria-label="Close lyrics"
                            title="Close lyrics"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                {/* Body */}
                <div className="lyrics-popup__body">
                    {scriptStatus === 'error' && (
                        <div className="lyrics-popup__placeholder">
                            <p className="lyrics-popup__message">
                                {scriptError ?? 'Unable to load lyrics right now.'}
                            </p>
                            <button
                                type="button"
                                className="lyrics-popup__retry"
                                onClick={handleRetry}
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {!metadata && scriptStatus !== 'error' && (
                        <div className="lyrics-popup__placeholder">
                            <p className="lyrics-popup__message">
                                Press play to fetch lyrics.
                            </p>
                        </div>
                    )}

                    {metadata && (scriptStatus === 'loading' || scriptStatus === 'idle') && (
                        <div className="lyrics-popup__placeholder">
                            <span className="lyrics-popup__spinner" aria-hidden="true" />
                            Loading lyrics…
                        </div>
                    )}

                    {metadata && scriptStatus === 'ready' && (
                        <div className="lyrics-popup__component-wrapper" key={lyricsKey}>
                            <am-lyrics
                                ref={amLyricsRef}
                                class="am-lyrics-element"
                                song-title={metadata.title}
                                song-artist={metadata.artist}
                                song-album={metadata.album || undefined}
                                song-duration={metadata.durationMs}
                                query={metadata.query}
                                isrc={metadata.isrc || undefined}
                                highlight-color="#93c5fd"
                                hover-background-color="rgba(59, 130, 246, 0.14)"
                                font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
                                autoscroll
                                interpolate
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LyricsPopup;
