import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import './SportsWatch.css';

/**
 * SportsWatch Page Component
 * Fullscreen stream player with Sources drawer modal
 * Matches Watch.jsx pattern
 */
const SportsWatch = () => {
    const { matchId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    // API Configuration
    const API_BASE = 'https://streami.su/api';

    // State
    const [match, setMatch] = useState(null);
    const [streams, setStreams] = useState([]);
    const [selectedSource, setSelectedSource] = useState(null);
    const [selectedStream, setSelectedStream] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerTranslateY, setDrawerTranslateY] = useState(0);
    const [sandboxEnabled, setSandboxEnabled] = useState(false);

    const hideControlsTimerRef = useRef(null);
    const isDragging = useRef(false);
    const dragStartY = useRef(0);
    const drawerTranslateRef = useRef(0);

    // Auto-hide controls after inactivity
    useEffect(() => {
        const resetTimer = () => {
            setControlsVisible(true);
            if (hideControlsTimerRef.current) {
                clearTimeout(hideControlsTimerRef.current);
            }
            hideControlsTimerRef.current = setTimeout(() => {
                if (!drawerOpen) {
                    setControlsVisible(false);
                }
            }, 4000);
        };

        const handleMouseMove = () => resetTimer();
        const handleClick = () => resetTimer();

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('click', handleClick);
        resetTimer();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('click', handleClick);
            if (hideControlsTimerRef.current) {
                clearTimeout(hideControlsTimerRef.current);
            }
        };
    }, [drawerOpen]);

    // Drawer drag handlers
    const handleDragStart = (clientY) => {
        isDragging.current = true;
        dragStartY.current = clientY;
        drawerTranslateRef.current = 0;
    };

    const handleDragMove = (clientY) => {
        if (!isDragging.current) return;
        const deltaY = clientY - dragStartY.current;
        if (deltaY > 0) {
            drawerTranslateRef.current = deltaY;
            setDrawerTranslateY(deltaY);
        }
    };

    const handleDragEnd = () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        if (drawerTranslateRef.current > 100) {
            setDrawerOpen(false);
        }
        drawerTranslateRef.current = 0;
        setDrawerTranslateY(0);
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        handleDragStart(e.clientY);

        const onMouseMove = (moveEvent) => {
            handleDragMove(moveEvent.clientY);
        };

        const onMouseUp = () => {
            handleDragEnd();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const handleTouchStart = (e) => {
        e.preventDefault();
        handleDragStart(e.touches[0].clientY);
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        handleDragMove(e.touches[0].clientY);
    };

    const handleTouchEnd = () => {
        handleDragEnd();
    };

    // Get match data from navigation state or sessionStorage
    useEffect(() => {
        let matchData = location.state?.match;

        if (!matchData) {
            const stored = sessionStorage.getItem('currentMatch');
            if (stored) {
                try {
                    matchData = JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse stored match:', e);
                }
            }
        }

        if (matchData) {
            setMatch(matchData);
        } else {
            setError('Match data not found. Please go back and try again.');
            setLoading(false);
        }
    }, [location.state, matchId]);

    // Fetch streams
    const fetchStreams = useCallback(async (source, id) => {
        try {
            const response = await fetch(`${API_BASE}/stream/${source}/${id}`);
            if (!response.ok) throw new Error(`Stream API Error: ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error('Failed to fetch streams:', err);
            return [];
        }
    }, []);

    // Load streams for the first available source
    useEffect(() => {
        const loadStreams = async () => {
            if (!match || !match.sources || match.sources.length === 0) {
                setLoading(false);
                setError('No stream sources available for this match.');
                return;
            }

            setLoading(true);
            setError(null);

            const firstSource = match.sources[0];
            setSelectedSource(firstSource);

            const streamData = await fetchStreams(firstSource.source, firstSource.id);

            if (streamData && streamData.length > 0) {
                setStreams(streamData);
                const bestStream = streamData.find(s => s.hd && s.language === 'English')
                    || streamData.find(s => s.hd)
                    || streamData[0];
                setSelectedStream(bestStream);
            } else {
                setError('No streams currently available. The match may not have started yet.');
            }

            setLoading(false);
        };

        if (match) loadStreams();
    }, [match, fetchStreams]);

    // Handle source change
    const handleSourceChange = async (source) => {
        if (source.source === selectedSource?.source) return;

        setLoading(true);
        setSelectedSource(source);
        setStreams([]);
        setSelectedStream(null);

        const streamData = await fetchStreams(source.source, source.id);

        if (streamData && streamData.length > 0) {
            setStreams(streamData);
            const bestStream = streamData.find(s => s.hd && s.language === 'English')
                || streamData.find(s => s.hd)
                || streamData[0];
            setSelectedStream(bestStream);
            setError(null);
        } else {
            setStreams([]);
            setSelectedStream(null);
            setError('No streams available from this source.');
        }

        setLoading(false);
    };

    // Handle stream selection
    const handleStreamSelect = (stream) => {
        setSelectedStream(stream);
        setDrawerOpen(false);
    };

    // Go back to sports page
    const handleBack = () => {
        navigate('/sports');
    };

    // Format source name
    const formatSourceName = (source) => {
        if (!source) return 'Unknown';
        return source.charAt(0).toUpperCase() + source.slice(1);
    };

    const controlsHiddenClass = controlsVisible ? '' : 'controls-hidden';

    return (
        <div className="sports-watch-fullscreen">
            {/* Video Player - Full Screen */}
            {selectedStream?.embedUrl ? (
                <iframe
                    key={`${selectedStream.id}-${sandboxEnabled}`}
                    src={selectedStream.embedUrl}
                    title={match?.title || 'Stream Player'}
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; encrypted-media"
                    className="sports-video-player"
                    {...(sandboxEnabled && {
                        sandbox: "allow-scripts allow-same-origin allow-forms allow-presentation"
                    })}
                />
            ) : (
                <div className="sports-video-player" style={{ background: '#000' }} />
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className="sports-watch-loading-overlay">
                    <div className="sports-loading-spinner" />
                    <p>Loading stream...</p>
                </div>
            )}

            {/* Error Overlay */}
            {error && !loading && (
                <div className="sports-watch-error-overlay">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <h1>Stream Unavailable</h1>
                    <p>{error}</p>
                </div>
            )}

            {/* Back Button - Top Left */}
            <button
                className={`sports-watch-overlay-btn sports-watch-back-btn ${controlsHiddenClass}`}
                onClick={handleBack}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
            </button>

            {/* Match Badge - Top Center */}
            <div className={`sports-watch-match-badge ${controlsHiddenClass}`}>
                <span className="sports-live-indicator">LIVE</span>
                <span className="sports-watch-match-title">{match?.title || 'Loading...'}</span>
                {match?.category && (
                    <span className="sports-category-badge">{match.category}</span>
                )}
            </div>

            {/* Sources Button - Top Right */}
            <button
                className={`sports-watch-overlay-btn sports-watch-sources-btn ${controlsHiddenClass}`}
                onClick={() => setDrawerOpen(true)}
            >
                Sources
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m7 15 5 5 5-5" />
                    <path d="m7 9 5-5 5 5" />
                </svg>
            </button>

            {/* Sources Drawer Modal */}
            {drawerOpen && (
                <div className="sports-drawer-overlay" onClick={() => setDrawerOpen(false)}>
                    <div
                        className="sports-drawer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            transform: `translateY(${drawerTranslateY}px)`,
                            transition: isDragging.current ? 'none' : 'transform 0.3s ease'
                        }}
                    >
                        {/* Drawer Handle */}
                        <div
                            className="sports-drawer-handle"
                            onMouseDown={handleMouseDown}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                        ></div>

                        {/* Sandbox Toggle */}
                        <div className="sports-sandbox-row">
                            <div className="sports-sandbox-info">
                                <p className="sports-sandbox-title">
                                    Sandbox <span className="sports-sandbox-label">(Adblocker)</span>
                                </p>
                                <p className="sports-sandbox-desc">
                                    Some servers do not support sandbox. Turn it off if video doesn't load.
                                </p>
                            </div>
                            <label className="sports-toggle">
                                <input
                                    type="checkbox"
                                    checked={sandboxEnabled}
                                    onChange={(e) => setSandboxEnabled(e.target.checked)}
                                />
                                <span className="sports-toggle-slider"></span>
                            </label>
                        </div>

                        {/* Source Tabs */}
                        {match?.sources && match.sources.length > 0 && (
                            <div className="sports-source-tabs">
                                <p className="sports-source-tabs-title">Select Source</p>
                                <div className="sports-source-tabs-row">
                                    {match.sources.map((source, index) => (
                                        <button
                                            key={`${source.source}-${source.id}`}
                                            className={`sports-source-tab ${selectedSource?.source === source.source ? 'active' : ''}`}
                                            onClick={() => handleSourceChange(source)}
                                        >
                                            {formatSourceName(source.source)}
                                            {index === 0 && <span className="sports-source-primary">Primary</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stream List */}
                        <div className="sports-stream-list">
                            <p className="sports-stream-list-title">Select Stream</p>
                            {streams.length === 0 && !loading && (
                                <p className="sports-stream-empty">No streams available for this source.</p>
                            )}
                            <div className="sports-stream-grid">
                                {streams.map((stream, index) => (
                                    <button
                                        key={`${selectedSource?.source}-${stream.id}-${index}`}
                                        className={`sports-stream-card ${selectedStream === stream ? 'active' : ''}`}
                                        onClick={() => handleStreamSelect(stream)}
                                    >
                                        <div className="sports-stream-card-icon">
                                            <svg width="24" height="24" viewBox="0 0 32 32">
                                                <circle cx="16" cy="16" r="16" fill="#090A15" />
                                                <path
                                                    fill="#fff"
                                                    fillRule="evenodd"
                                                    d="M8.004 19.728a.996.996 0 0 1-.008-1.054l7.478-12.199a.996.996 0 0 1 1.753.104l6.832 14.82a.996.996 0 0 1-.618 1.37l-10.627 3.189a.996.996 0 0 1-1.128-.42l-3.682-5.81Zm8.333-9.686a.373.373 0 0 1 .709-.074l4.712 10.904a.374.374 0 0 1-.236.506L14.18 23.57a.373.373 0 0 1-.473-.431l2.63-13.097Z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </div>
                                        <div className="sports-stream-card-details">
                                            <p className="sports-stream-card-name">
                                                Stream {stream.streamNo}
                                                {stream.hd && <span className="sports-stream-hd-badge">HD</span>}
                                            </p>
                                            <p className="sports-stream-card-desc">
                                                {stream.language || 'Unknown Language'}
                                                {selectedStream === stream && ' • Playing'}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Match Details */}
                        {match && (
                            <div className="sports-match-details">
                                <p className="sports-match-details-title">Match Details</p>
                                <div className="sports-match-details-grid">
                                    {match.teams?.home && (
                                        <div className="sports-match-detail-item">
                                            <span className="sports-match-detail-label">Home</span>
                                            <span className="sports-match-detail-value">{match.teams.home.name}</span>
                                        </div>
                                    )}
                                    {match.teams?.away && (
                                        <div className="sports-match-detail-item">
                                            <span className="sports-match-detail-label">Away</span>
                                            <span className="sports-match-detail-value">{match.teams.away.name}</span>
                                        </div>
                                    )}
                                    {match.date && (
                                        <div className="sports-match-detail-item">
                                            <span className="sports-match-detail-label">Scheduled</span>
                                            <span className="sports-match-detail-value">{new Date(match.date).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {match.category && (
                                        <div className="sports-match-detail-item">
                                            <span className="sports-match-detail-label">Sport</span>
                                            <span className="sports-match-detail-value" style={{ textTransform: 'capitalize' }}>{match.category}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Close Button */}
                        <button className="sports-drawer-close" onClick={() => setDrawerOpen(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SportsWatch;