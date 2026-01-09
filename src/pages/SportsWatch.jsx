import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import './SportsWatch.css';

/**
 * SportsWatch Page Component
 * Displays stream player for a selected sports match
 * Fetches stream sources from streami.su API
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

    // Get match data from navigation state or sessionStorage
    useEffect(() => {
        let matchData = location.state?.match;

        // Fallback to sessionStorage if not in navigation state
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

    // Fetch streams when match is loaded
    const fetchStreams = useCallback(async (source, id) => {
        try {
            const response = await fetch(`${API_BASE}/stream/${source}/${id}`);
            if (!response.ok) {
                throw new Error(`Stream API Error: ${response.status}`);
            }
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

            // Try first source
            const firstSource = match.sources[0];
            setSelectedSource(firstSource);

            const streamData = await fetchStreams(firstSource.source, firstSource.id);

            if (streamData && streamData.length > 0) {
                setStreams(streamData);
                // Auto-select best stream (HD + English preferred)
                const bestStream = streamData.find(s => s.hd && s.language === 'English')
                    || streamData.find(s => s.hd)
                    || streamData[0];
                setSelectedStream(bestStream);
            } else {
                setError('No streams currently available. The match may not have started yet.');
            }

            setLoading(false);
        };

        if (match) {
            loadStreams();
        }
    }, [match, fetchStreams]);

    // Handle source change
    const handleSourceChange = async (source) => {
        if (source.source === selectedSource?.source) return;

        setLoading(true);
        setSelectedSource(source);

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
    };

    // Go back to sports page
    const handleBack = () => {
        navigate('/sports');
    };

    // Format source name for display
    const formatSourceName = (source) => {
        if (!source) return 'Unknown';
        return source.charAt(0).toUpperCase() + source.slice(1);
    };

    // Loading state
    if (loading && !match) {
        return (
            <div className="sports-watch-page">
                <div className="watch-loading">
                    <div className="loading-spinner" />
                    <p>Loading match...</p>
                </div>
            </div>
        );
    }

    // Error state (no match data)
    if (error && !match) {
        return (
            <div className="sports-watch-page">
                <div className="watch-error">
                    <p>{error}</p>
                    <button onClick={handleBack}>← Back to Sports</button>
                </div>
            </div>
        );
    }

    return (
        <div className="sports-watch-page">
            {/* Header with back button and match info */}
            <header className="watch-header">
                <button className="back-btn" onClick={handleBack}>
                    ← Back
                </button>
                <div className="match-title-bar">
                    <h1>{match?.title || 'Loading...'}</h1>
                    {match?.category && (
                        <span className="category-badge">{match.category}</span>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="watch-content">
                {/* Player Container */}
                <div className="player-container">
                    {loading ? (
                        <div className="player-loading">
                            <div className="loading-spinner" />
                            <p>Loading stream...</p>
                        </div>
                    ) : error ? (
                        <div className="player-error">
                            <p>{error}</p>
                        </div>
                    ) : selectedStream?.embedUrl ? (
                        <iframe
                            src={selectedStream.embedUrl}
                            title={match?.title || 'Stream Player'}
                            frameBorder="0"
                            allowFullScreen
                            allow="autoplay; fullscreen; encrypted-media"
                            className="stream-iframe"
                        />
                    ) : (
                        <div className="player-placeholder">
                            <p>Select a stream to start watching</p>
                        </div>
                    )}
                </div>

                {/* Controls Panel */}
                <div className="controls-panel">
                    {/* Source Selector */}
                    {match?.sources && match.sources.length > 1 && (
                        <div className="control-section">
                            <h3>Sources</h3>
                            <div className="source-buttons">
                                {match.sources.map((source, index) => (
                                    <button
                                        key={`${source.source}-${source.id}`}
                                        className={`source-btn ${selectedSource?.source === source.source ? 'active' : ''}`}
                                        onClick={() => handleSourceChange(source)}
                                    >
                                        {formatSourceName(source.source)}
                                        {index === 0 && <span className="primary-badge">Primary</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stream Selector */}
                    {streams.length > 1 && (
                        <div className="control-section">
                            <h3>Streams</h3>
                            <div className="stream-list">
                                {streams.map((stream) => (
                                    <button
                                        key={stream.id}
                                        className={`stream-btn ${selectedStream?.id === stream.id ? 'active' : ''}`}
                                        onClick={() => handleStreamSelect(stream)}
                                    >
                                        <span className="stream-no">#{stream.streamNo}</span>
                                        <span className="stream-lang">{stream.language}</span>
                                        {stream.hd && <span className="hd-badge">HD</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Match Info */}
                    <div className="control-section match-details">
                        <h3>Match Info</h3>
                        <div className="match-info-grid">
                            {match?.teams?.home && (
                                <div className="team-info">
                                    <span className="team-label">Home</span>
                                    <span className="team-name">{match.teams.home.name}</span>
                                </div>
                            )}
                            {match?.teams?.away && (
                                <div className="team-info">
                                    <span className="team-label">Away</span>
                                    <span className="team-name">{match.teams.away.name}</span>
                                </div>
                            )}
                            {match?.date && (
                                <div className="match-time">
                                    <span className="time-label">Scheduled</span>
                                    <span className="time-value">
                                        {new Date(match.date).toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SportsWatch;
