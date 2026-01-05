import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import shaka from 'shaka-player';
import './IPTVWatch.css';

const OFFLINE_CHANNELS_KEY = 'iptv_offline_channels';

/**
 * IPTVWatch - Fully isolated IPTV player component
 * Fullscreen UI matching Watch.jsx pattern
 * Does NOT share any code with Watch.jsx (API-based player)
 */
const IPTVWatch = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { channelId } = useParams();

    const videoRef = useRef(null);
    const playerRef = useRef(null);
    const containerRef = useRef(null);

    const [channel, setChannel] = useState(location.state?.channel || null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [playerLoaded, setPlayerLoaded] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const hideControlsTimer = useRef(null);
    const keyRef = useRef(null);
    const [latestKey, setLatestKey] = useState(null);

    // Reset controls hide timer
    const resetHideTimer = () => {
        setControlsVisible(true);
        if (hideControlsTimer.current) {
            clearTimeout(hideControlsTimer.current);
        }
        hideControlsTimer.current = setTimeout(() => {
            if (playerLoaded) {
                setControlsVisible(false);
            }
        }, 3000);
    };

    // 1. Key Harvester Listener - receives keys from the extension's hook.js via postMessage
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data && event.data.type === 'MAPPLE_KEY_CAPTURED') {
                console.log('[IPTVWatch] RECEIVED KEY FROM IFRAME:', event.data.key);
                keyRef.current = event.data.key;
                setLatestKey(event.data.key);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFs = !!(document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement);
            setIsFullscreen(isFs);
            if (isFs) {
                resetHideTimer();
            } else {
                setControlsVisible(true);
                if (hideControlsTimer.current) {
                    clearTimeout(hideControlsTimer.current);
                }
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            if (hideControlsTimer.current) {
                clearTimeout(hideControlsTimer.current);
            }
        };
    }, [playerLoaded]);

    // Initialize Shaka Player
    useEffect(() => {
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
            setError('Your browser does not support video playback');
            setLoading(false);
            return;
        }

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, []);

    // Load stream when player is activated
    useEffect(() => {
        if (!playerLoaded || !videoRef.current || !channel) return;

        // Use channel from state
        const isMappleChannel = channel.mappleId;
        const streamUrl = channel.url;

        const initPlayer = async () => {
            try {
                setLoading(true);

                if (playerRef.current) {
                    await playerRef.current.destroy();
                }

                // Install polyfills
                shaka.polyfill.installAll();

                // Check browser support
                if (!shaka.Player.isBrowserSupported()) {
                    throw new Error('Browser does not support Shaka Player');
                }

                const player = new shaka.Player(videoRef.current);
                playerRef.current = player;

                // OFFLINE KEY INTERCEPTOR - For Mapple channels, intercept key requests
                if (isMappleChannel) {
                    player.getNetworkingEngine().registerRequestFilter((type, request) => {
                        // Intercept KEY requests
                        if (type === shaka.net.NetworkingEngine.RequestType.KEY) {
                            // Check if this is the key from kiko2.ru
                            if (request.uris[0].includes('chevy.kiko2.ru') ||
                                request.uris[0].includes('ddy6new.kiko2.ru') ||
                                request.uris[0].includes('nfsnew.kiko2.ru')) {
                                console.log('[IPTVWatch] Intercepting Key Request:', request.uris[0]);
                                // Rewrite to custom scheme to handle it locally
                                request.uris[0] = 'offline:mapple_key';
                            }
                        }
                    });

                    // Register 'offline' scheme to serve the harvested key
                    shaka.net.NetworkingEngine.registerScheme('offline', (uri, request) => {
                        if (uri === 'offline:mapple_key') {
                            // Implement polling wait for key (max 15s)
                            return new Promise((resolve, reject) => {
                                let attempts = 0;
                                const maxAttempts = 150; // 15 seconds

                                const checkKey = () => {
                                    attempts++;
                                    if (keyRef.current) {
                                        console.log('[IPTVWatch] Serving Key:', keyRef.current);
                                        const keyBytes = new Uint8Array(keyRef.current.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

                                        resolve({
                                            data: keyBytes.buffer,
                                            headers: {},
                                            uri: uri,
                                            originalUri: uri,
                                            timeMs: 0
                                        });
                                    } else if (attempts >= maxAttempts) {
                                        // Fallback or fail
                                        console.warn('[IPTVWatch] Key timeout, serving fallback');
                                        const fallback = '865373cbaac44341ddbc433c5a124329';
                                        const keyBytes = new Uint8Array(fallback.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                                        resolve({
                                            data: keyBytes.buffer,
                                            headers: {},
                                            uri: uri,
                                            originalUri: uri,
                                            timeMs: 0
                                        });
                                    } else {
                                        setTimeout(checkKey, 100);
                                    }
                                };

                                checkKey();
                            });
                        }
                        return shaka.util.AbortableOperation.failed(
                            new shaka.util.Error(
                                shaka.util.Error.Severity.RECOVERABLE,
                                shaka.util.Error.Category.NETWORK,
                                shaka.util.Error.Code.BAD_HTTP_STATUS
                            )
                        );
                    });
                    console.log('[IPTVWatch] Using extension for key harvesting');
                }

                // Configure streaming settings
                const config = {
                    streaming: {
                        bufferingGoal: 30,
                        rebufferingGoal: 2,
                        bufferBehind: 30,
                        retryParameters: {
                            timeout: 30000,
                            maxAttempts: 3,
                            baseDelay: 1000,
                            backoffFactor: 2,
                        },
                    },
                    abr: {
                        enabled: true,
                        defaultBandwidthEstimate: 1000000,
                    },
                    // Force HLS because the file extension is .css
                    manifest: {
                        retryParameters: {
                            maxAttempts: 3
                        }
                    }
                };

                // Add DRM keys if present (for static local keys)
                if (channel.licenseKey) {
                    try {
                        const parts = channel.licenseKey.split(':');
                        if (parts.length === 2) {
                            config.drm = {
                                clearKeys: {
                                    [parts[0]]: parts[1]
                                }
                            };
                            console.log('[IPTVWatch] Configured static ClearKey DRM');
                        }
                    } catch (e) {
                        console.warn('[IPTVWatch] Failed to print license key:', e);
                    }
                }

                player.configure(config);

                // Add error listener
                player.addEventListener('error', (event) => {
                    console.error('Shaka Player Error:', event.detail);
                    setError(`Playback error: ${event.detail.message || 'Unknown error'}`);
                });

                // Add debugging listeners
                player.addEventListener('drmsessionupdate', () => {
                    console.log('DRM session updated');
                });

                // Load the stream
                console.log('Loading stream:', streamUrl);

                // Determine MIME type
                let mimeType = null;
                const originalUrl = channel.url;
                if (originalUrl.endsWith('.mpd')) {
                    mimeType = 'application/dash+xml';
                } else if (originalUrl.endsWith('.m3u8')) {
                    mimeType = 'application/x-mpegurl';
                } else if (originalUrl.endsWith('.css') && channel.mappleId) {
                    // Mapple masked HLS
                    mimeType = 'application/x-mpegurl';
                }

                await player.load(streamUrl, 0, mimeType);
                console.log('Stream loaded successfully');

                setLoading(false);
                resetHideTimer();

                try {
                    await videoRef.current.play();
                } catch (playError) {
                    console.log('Autoplay blocked, user interaction required');
                }
            } catch (err) {
                console.error('Error initializing player:', err);
                setError(`Failed to load stream: ${err.message}`);
                setLoading(false);
                // Mark channel as offline
                markChannelOffline(channel?.id);
            }
        };

        // No need to wait for key - proxy server handles everything
        initPlayer();
    }, [playerLoaded]); // No channel dep

    // Mark channel as offline in localStorage
    const markChannelOffline = (channelId) => {
        try {
            const saved = localStorage.getItem(OFFLINE_CHANNELS_KEY);
            const offlineList = saved ? JSON.parse(saved) : [];
            if (!offlineList.includes(channelId)) {
                offlineList.push(channelId);
                localStorage.setItem(OFFLINE_CHANNELS_KEY, JSON.stringify(offlineList));
            }
        } catch (e) {
            console.error('Error saving offline channel:', e);
        }
    };

    // Handle back navigation
    const handleBack = () => {
        navigate('/iptv');
    };

    // Toggle fullscreen
    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        const elem = containerRef.current;
        const doc = document;

        const isCurrentlyFullscreen = doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement ||
            isFullscreen;

        if (!isCurrentlyFullscreen) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => setIsFullscreen(true));
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
                setIsFullscreen(true);
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
                setIsFullscreen(true);
            } else {
                setIsFullscreen(true);
            }
        } else {
            if (doc.exitFullscreen) {
                doc.exitFullscreen().catch(() => setIsFullscreen(false));
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
                setIsFullscreen(false);
            } else {
                setIsFullscreen(false);
            }
        }
    };

    // Fallback if no channel provided (though we force test channel now)
    // We can keep the fallback UI for when we remove the test code
    if (!channel && !playerLoaded) {
        // Allow rendering even without channel state to trigger the useEffect with test channel
        // But initial render needs something
    }

    return (
        <div
            className={`iptv-watch-fullscreen${isFullscreen ? ' css-fullscreen-mode' : ''}`}
            ref={containerRef}
            onMouseMove={resetHideTimer}
            onTouchStart={resetHideTimer}
        >
            {/* Video Player - Lazy Loaded */}
            {playerLoaded ? (
                <>
                    <video
                        ref={videoRef}
                        className="iptv-video-player"
                        controls
                        autoPlay
                        playsInline
                    />
                    {loading && (
                        <div className="iptv-watch-loading-overlay">
                            <div className="loading-spinner"></div>
                            <p>Loading stream...</p>
                        </div>
                    )}
                    {error && (
                        <div className="iptv-watch-error-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                            </svg>
                            <h1>Playback Error</h1>
                            <p>{error}</p>
                            <button className="iptv-watch-overlay-btn" onClick={() => window.location.reload()}>
                                Retry
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div
                    className="iptv-watch-lazy-overlay"
                    style={channel?.logo ? {
                        backgroundImage: `url(${channel.logo})`,
                        backgroundSize: '50%',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    } : {}}
                >
                    <div className="iptv-watch-lazy-gradient"></div>
                    <div className="iptv-watch-lazy-content">
                        <button
                            className="iptv-watch-play-button"
                            onClick={() => setPlayerLoaded(true)}
                            aria-label="Play channel"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </button>
                        <p className="iptv-watch-lazy-title">{channel?.name || 'AMC USA Test'}</p>
                        <p className="iptv-watch-lazy-hint">Click to start streaming</p>
                    </div>
                </div>
            )}

            {/* Back Button */}
            <button
                className={`iptv-watch-overlay-btn iptv-watch-back-btn${!controlsVisible && playerLoaded ? ' controls-hidden' : ''}`}
                onClick={handleBack}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 19-7-7 7-7"></path>
                    <path d="M19 12H5"></path>
                </svg>
                Back
            </button>

            {/* Live Badge - Top Center */}
            <div className={`iptv-watch-live-badge${!controlsVisible && playerLoaded ? ' controls-hidden' : ''}`}>
                <span className="iptv-live-indicator">LIVE</span>
                <span className="iptv-watch-channel-name">{channel?.name || 'AMC USA Test'}</span>
                <button
                    className="iptv-watch-badge-btn"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                    {isFullscreen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                            <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                            <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8V5a2 2 0 0 1 2-2h3"></path>
                            <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M21 16v3a2 2 0 0 1-2 2h-3"></path>
                            <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                        </svg>
                    )}
                </button>
            </div>
            {/* Harvester Iframe - Loads Mapple to generate keys (extension captures them) */}
            {channel?.mappleId && (
                <iframe
                    src={`https://mapple.uk/watch/channel/${channel.mappleId}`}
                    style={{
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        opacity: 0.01,
                        pointerEvents: 'none',
                        top: 0,
                        left: 0,
                        zIndex: -1
                    }}
                    allow="autoplay; encrypted-media"
                    title="Key Harvester"
                />
            )}
        </div>
    );
};

export default IPTVWatch;
