import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useWatchHistory from '../hooks/useWatchHistory';
import './ContinueWatching.css';

const POSTER_URL = 'https://image.tmdb.org/t/p/w500';

const ContinueWatching = ({ onItemClick }) => {
    const { watchHistory, removeFromHistory, clearHistory } = useWatchHistory();
    const navigate = useNavigate();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    if (watchHistory.length === 0) {
        return null; // Don't show section if empty
    }

    const handleItemClick = async (item) => {
        if (onItemClick) {
            // Fetch full content data from TMDB before opening modal
            try {
                const res = await fetch(`/api/${item.type}/${item.id}`);
                const fullData = await res.json();

                // Create enriched item with full TMDB data
                const enrichedItem = {
                    ...fullData,
                    id: item.id,
                    type: item.type,
                    media_type: item.type,
                    // Extract genre_ids from genres array for modal compatibility
                    genre_ids: fullData.genres?.map(g => g.id) || [],
                    // Pass watch history data for TV shows to resume at correct episode
                    ...(item.type === 'tv' && item.lastSeason && item.lastEpisode && {
                        lastSeason: item.lastSeason,
                        lastEpisode: item.lastEpisode,
                    }),
                };

                onItemClick(enrichedItem);
            } catch (error) {
                console.error('Failed to fetch content data:', error);
                // Fallback to basic navigation
                const url = item.type === 'tv' && item.lastSeason && item.lastEpisode
                    ? `/watch?type=${item.type}&id=${item.id}&season=${item.lastSeason}&episode=${item.lastEpisode}`
                    : `/watch?type=${item.type}&id=${item.id}`;
                navigate(url);
            }
        } else {
            // Default navigation
            const url = item.type === 'tv' && item.lastSeason && item.lastEpisode
                ? `/watch?type=${item.type}&id=${item.id}&season=${item.lastSeason}&episode=${item.lastEpisode}`
                : `/watch?type=${item.type}&id=${item.id}`;
            navigate(url);
        }
    };

    const handleRemove = (e, id) => {
        e.stopPropagation();
        removeFromHistory(id);
    };

    const handleClearAll = () => {
        setShowConfirmDialog(true);
    };

    const handleConfirmClear = () => {
        clearHistory();
        setShowConfirmDialog(false);
    };

    const handleCancelClear = () => {
        setShowConfirmDialog(false);
    };

    const formatTimestamp = (timestamp) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 60) {
            return `${minutes}m ago`;
        } else if (hours < 24) {
            return `${hours}h ago`;
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return `${days}d ago`;
        } else {
            return 'Last week';
        }
    };

    return (
        <div className="continue-watching-section">
            <div className="continue-watching-header">
                <h2 className="continue-watching-title">Continue Watching</h2>
                <button
                    className="clear-history-btn"
                    onClick={handleClearAll}
                    title="Clear all watch history"
                >
                    Clear All
                </button>
            </div>

            <div className="continue-watching-row">
                {watchHistory.map((item) => (
                    <div
                        key={item.id}
                        className="continue-watching-card"
                        onClick={() => handleItemClick(item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleItemClick(item);
                            }
                        }}
                    >
                        <div className="continue-watching-card-image-container">
                            <img
                                src={item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/placeholder-poster.jpg'}
                                alt={item.title}
                                className="continue-watching-card-image"
                                loading="lazy"
                            />
                            <div className="continue-watching-overlay">
                                <button
                                    className="continue-watching-remove-btn"
                                    onClick={(e) => handleRemove(e, item.id)}
                                    title="Remove from history"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                    </svg>
                                </button>
                                <div className="continue-watching-resume-badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    <span>Resume</span>
                                </div>
                            </div>
                            <span className="continue-watching-type-badge">{item.type === 'tv' ? 'TV' : 'Movie'}</span>
                        </div>
                        <div className="continue-watching-card-info">
                            <h3 className="continue-watching-card-title">{item.title}</h3>
                            <div className="continue-watching-card-meta">
                                {item.type === 'tv' && item.lastSeason && item.lastEpisode ? (
                                    <span className="continue-watching-episode">S{item.lastSeason} • E{item.lastEpisode}</span>
                                ) : null}
                                <span className="continue-watching-time">{formatTimestamp(item.lastWatched)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Custom Confirm Dialog */}
            {showConfirmDialog && (
                <div className="confirm-dialog-overlay" onClick={handleCancelClear}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-dialog-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" x2="10" y1="11" y2="17" />
                                <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                        </div>
                        <h3 className="confirm-dialog-title">Clear Watch History</h3>
                        <p className="confirm-dialog-message">
                            Are you sure you want to clear all your watch history? This action cannot be undone.
                        </p>
                        <div className="confirm-dialog-buttons">
                            <button className="confirm-dialog-btn confirm-dialog-cancel" onClick={handleCancelClear}>
                                Cancel
                            </button>
                            <button className="confirm-dialog-btn confirm-dialog-confirm" onClick={handleConfirmClear}>
                                Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContinueWatching;
