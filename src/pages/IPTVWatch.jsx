import React, { useEffect, useRef, useState, useCallback } from 'react';
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

    // Channel strip state
    const [channels] = useState(location.state?.channels || []);
    const [currentIndex, setCurrentIndex] = useState(location.state?.channelIndex || 0);
    const [showChannelStrip, setShowChannelStrip] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(0); // Track focused item in strip
    const channelStripTimer = useRef(null);
    const channelRefs = useRef([]);

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

    // Auto-hide timer for channel strip
    const resetChannelStripTimer = useCallback(() => {
        if (channelStripTimer.current) clearTimeout(channelStripTimer.current);
        channelStripTimer.current = setTimeout(() => {
            setShowChannelStrip(false);
        }, 60000); // 1 minute for testing (was 5000)
    }, []);

    // Toggle channel strip
    const toggleChannelStrip = useCallback(() => {
        setShowChannelStrip(prev => {
            const newState = !prev;
            if (newState) {
                resetChannelStripTimer();
                setFocusedIndex(currentIndex); // Start focus on current channel
                setTimeout(() => {
                    channelRefs.current[currentIndex]?.focus();
                    channelRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }, 100);
            }
            return newState;
        });
    }, [currentIndex, resetChannelStripTimer]);

    // Switch channel without remounting page
    const switchChannel = useCallback((newChannel, newIndex) => {
        if (newChannel.id === channel?.id) return;
        setChannel(newChannel);
        setCurrentIndex(newIndex);
        setError(null);
        setLoading(true);
        setShowChannelStrip(false);
        // Update URL without adding to history
        navigate(`/iptv/watch/${newChannel.id}`, { replace: true, state: { channel: newChannel, channels, channelIndex: newIndex } });
    }, [channel, channels, navigate]);

    // Navigate prev/next channel
    const navigateChannel = useCallback((direction) => {
        if (channels.length === 0) return;
        const newIndex = (currentIndex + direction + channels.length) % channels.length;
        switchChannel(channels[newIndex], newIndex);
    }, [currentIndex, channels, switchChannel]);

    // Keyboard/D-pad navigation (Android TV support)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (showChannelStrip && channels.length > 0) {
                // Strip is open - custom focus navigation
                if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setShowChannelStrip(false);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const nextIndex = (focusedIndex + 1) % channels.length;
                    setFocusedIndex(nextIndex);
                    channelRefs.current[nextIndex]?.focus();
                    channelRefs.current[nextIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    resetChannelStripTimer();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prevIndex = (focusedIndex - 1 + channels.length) % channels.length;
                    setFocusedIndex(prevIndex);
                    channelRefs.current[prevIndex]?.focus();
                    channelRefs.current[prevIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    resetChannelStripTimer();
                }
            } else {
                // Strip is closed - quick zap mode
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    toggleChannelStrip();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    navigateChannel(-1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    navigateChannel(1);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showChannelStrip, channels, focusedIndex, toggleChannelStrip, navigateChannel, resetChannelStripTimer]);

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

                // FIX: Check for stale Jeepney TV key and update if necessary
                if (channel.id === 'jeepney-tv') {
                    // Correct Key from liveplay.vercel.app
                    const freshKey = 'dc9fec234a5841bb8d06e92042c741ec:225676f32612dc803cb4d0f950d063d0';
                    if (channel.licenseKey !== freshKey) {
                        console.warn('[IPTVWatch] Detected stale Jeepney TV key. Force-updating to fresh key.');
                        channel.licenseKey = freshKey;
                    }
                }

                // Install polyfills
                shaka.polyfill.installAll();

                // Check browser support
                if (!shaka.Player.isBrowserSupported()) {
                    throw new Error('Browser does not support Shaka Player');
                }

                // Create detached player
                const player = new shaka.Player();
                await player.attach(videoRef.current);
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
                                const interval = setInterval(() => {
                                    attempts++;
                                    const key = localStorage.getItem('replay_key');
                                    if (key) {
                                        clearInterval(interval);
                                        // Key found! Convert hex string to buffer
                                        // The key from replay_key is usually hex string
                                        // Check if key is raw bytes or hex
                                        // Usually for Mapple it's binary content
                                        // But localStorage is string.
                                        // Let's assume hex string for now or direct raw bytes if encoded

                                        // For now, let's just log
                                        console.log('Found key in storage:', key.substring(0, 10) + '...');

                                        // Respond with the key
                                        // Need to convert hex string to ArrayBuffer
                                        const buffer = new Uint8Array(key.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16))).buffer;

                                        resolve({
                                            uri: uri,
                                            data: buffer,
                                            headers: {}
                                        });
                                    } else if (attempts >= maxAttempts) {
                                        clearInterval(interval);
                                        reject(new shaka.util.Error(
                                            shaka.util.Error.Severity.CRITICAL,
                                            shaka.util.Error.Category.NETWORK,
                                            shaka.util.Error.Code.TIMEOUT
                                        ));
                                    }
                                }, 100);
                            });
                        }
                        return null;
                    });
                    console.log('[IPTVWatch] Using extension for key harvesting');
                }

                // Configure player
                const config = {
                    streaming: {
                        bufferingGoal: 30, // Increase buffering to handle network fluctuations
                        rebufferingGoal: 5,
                        bufferBehind: 10,
                        retryParameters: {
                            maxAttempts: 5,
                            baseDelay: 1000,
                            backoffFactor: 2,
                            fuzzFactor: 0.5,
                            timeout: 0 // Infinite timeout
                        },
                        ignoreTextStreamFailures: true // Ignore subtitle failures
                    },
                    manifest: {
                        retryParameters: {
                            maxAttempts: 5,
                            baseDelay: 1000,
                            timeout: 0
                        }
                    }
                };

                // Add DRM configuration if present
                if (channel.licenseKey) {
                    try {
                        const keyString = channel.licenseKey.trim();

                        // Check if it's a License Key URL (Widevine/PlayReady server)
                        if (keyString.startsWith('http')) {
                            config.drm = {
                                servers: {
                                    'com.widevine.alpha': keyString,
                                    // Add PlayReady if needed, but usually Widevine is primary default
                                },
                                retryParameters: {
                                    maxAttempts: 3,
                                    timeout: 10000
                                }
                            };
                            console.log('[IPTVWatch] Configured DRM License Server:', keyString);

                        } else if (keyString.includes(':')) {
                            // ClearKey format (id:key)
                            let [keyId, key] = keyString.split(':');

                            if (keyId && key) {
                                config.drm = {
                                    clearKeys: { [keyId]: key },
                                    preferredKeySystems: ['org.w3.clearkey'],
                                    retryParameters: {
                                        timeout: 10000,
                                        maxAttempts: 3,
                                        baseDelay: 500,
                                        backoffFactor: 2
                                    },
                                    advanced: {
                                        'org.w3.clearkey': {
                                            videoRobustness: [],
                                            audioRobustness: []
                                        }
                                    }
                                };
                                console.log('[IPTVWatch] Configured static ClearKey DRM');
                            }
                        } else {
                            console.warn('[IPTVWatch] Unrecognized Key format:', keyString);
                        }
                    } catch (e) {
                        console.warn('[IPTVWatch] Failed to configure DRM:', e);
                    }
                }

                player.configure(config);

                // Add error listener - only show UI for critical errors
                player.addEventListener('error', (event) => {
                    const shakaError = event.detail;
                    // Safely stringify error for logging to avoid 'U' minified output issues
                    console.error('Shaka Player Error:', JSON.stringify(shakaError, null, 2));

                    // Only show error UI for CRITICAL severity errors
                    // Severity.RECOVERABLE (1) means playback can continue
                    // Severity.CRITICAL (2) means playback cannot continue
                    if (shakaError.severity === shaka.util.Error.Severity.CRITICAL) {
                        setError(`Playback error: Code ${shakaError.code} (${shakaError.category}) - ${shakaError.message || 'Unknown Error'}`);
                        markChannelOffline(channel?.id);
                    } else {
                        // Log recoverable errors but don't show UI
                        console.warn('[IPTVWatch] Recoverable error (playback continues):', shakaError.code, shakaError.message);
                    }
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
    }, [playerLoaded, channel]); // Re-init when channel changes

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
                {/* Channel Strip Toggle */}
                {channels.length > 0 && (
                    <button
                        className="iptv-watch-badge-btn"
                        onClick={toggleChannelStrip}
                        tabIndex={0}
                        aria-label="Show channel list"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8" /><path d="M12 17v4" />
                        </svg>
                    </button>
                )}
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



            {/* Channel Strip Overlay */}
            {showChannelStrip && channels.length > 0 && (
                <div className="channel-strip-overlay" role="dialog" aria-label="Channel selector">
                    <div className="channel-strip-header">All Channels ({channels.length})</div>
                    <div
                        className="channel-strip-list"
                        onTouchStart={resetChannelStripTimer}
                        onTouchMove={resetChannelStripTimer}
                        onScroll={resetChannelStripTimer}
                    >
                        {channels.map((ch, idx) => (
                            <button
                                key={ch.id}
                                ref={el => channelRefs.current[idx] = el}
                                className={`channel-strip-item${idx === currentIndex ? ' active' : ''}`}
                                onClick={() => switchChannel(ch, idx)}
                                onFocus={resetChannelStripTimer}
                                tabIndex={0}
                                aria-label={`${ch.name}${idx === currentIndex ? ' (current)' : ''}`}
                                aria-pressed={idx === currentIndex}
                            >
                                <div className="channel-strip-logo">
                                    {ch.logo ? (
                                        <img src={ch.logo} alt="" loading="lazy" />
                                    ) : (
                                        <span>{ch.name.charAt(0)}</span>
                                    )}
                                </div>
                                <span className="channel-strip-name">{ch.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default IPTVWatch;
