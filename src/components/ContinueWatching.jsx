import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useWatchHistory from '../hooks/useWatchHistory';
import { cardBackdrop, posterAsBackdrop, cardLogo } from '../utils/images';
import './ContinueWatching.css';

const ContinueWatching = ({ onItemClick }) => {
    const { watchHistory, removeFromHistory, clearHistory } = useWatchHistory();
    const navigate = useNavigate();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    // Data enrichment state (logos & backdrops)
    const [enrichedItems, setEnrichedItems] = useState([]);

    // Drag state for horizontal scroll
    const carouselRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Enrich watch history items with logos and backdrops
    useEffect(() => {
        const enrichContent = async () => {
            if (!watchHistory || watchHistory.length === 0) return;

            try {
                const enriched = await Promise.all(
                    watchHistory.map(async (item) => {
                        try {
                            const type = item.type || 'movie';
                            const response = await fetch(`/api/${type}/${item.id}/images`);
                            const imagesData = await response.json();

                            // Get English logo or first available
                            const logos = imagesData.logos || [];
                            const englishLogo = logos.find(l => l.iso_639_1 === 'en') || logos[0];

                            // Get backdrop
                            let backdrop_path = item.backdrop_path;
                            if (!backdrop_path && imagesData.backdrops?.length) {
                                backdrop_path = imagesData.backdrops[0].file_path;
                            }

                            return {
                                ...item,
                                logo_path: englishLogo?.file_path || null,
                                backdrop_path: backdrop_path || null,
                            };
                        } catch {
                            return item;
                        }
                    })
                );

                setEnrichedItems(enriched);
            } catch {
                setEnrichedItems(watchHistory);
            }
        };

        enrichContent();
    }, [watchHistory]);

    const displayItems = enrichedItems.length > 0 ? enrichedItems : watchHistory;

    // Cleanup
    useEffect(() => {
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, []);

    // Drag handlers
    const cancelMomentum = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    const momentumLoop = useCallback(() => {
        if (!carouselRef.current) return;
        carouselRef.current.scrollLeft -= velX.current;
        velX.current *= 0.95;
        if (Math.abs(velX.current) > 0.5) {
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        } else {
            animationFrameId.current = null;
        }
    }, []);

    const handleMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        setIsDown(true);
        setIsDragging(false);
        cancelMomentum();
        setStartX(e.pageX - carouselRef.current.offsetLeft);
        setScrollLeft(carouselRef.current.scrollLeft);
        velX.current = 0;
        carouselRef.current.style.cursor = 'grabbing';
    }, [cancelMomentum]);

    const handleMouseLeave = useCallback(() => {
        setIsDown(false);
        if (carouselRef.current) carouselRef.current.style.cursor = 'grab';
        if (Math.abs(velX.current) > 1) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        }
    }, [cancelMomentum, momentumLoop]);

    const handleMouseUp = useCallback(() => {
        setIsDown(false);
        if (carouselRef.current) carouselRef.current.style.cursor = 'grab';
        setTimeout(() => setIsDragging(false), 0);
        if (Math.abs(velX.current) > 1) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        }
    }, [cancelMomentum, momentumLoop]);

    const handleMouseMove = useCallback((e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - carouselRef.current.offsetLeft;
        const walk = (x - startX) * 2;
        velX.current = e.movementX * 2;
        carouselRef.current.scrollLeft = scrollLeft - walk;
        if (Math.abs(x - startX) > 5) setIsDragging(true);
    }, [isDown, startX, scrollLeft]);

    if (watchHistory.length === 0) {
        return null;
    }

    const handleItemClick = async (item) => {
        if (isDragging) return;
        if (onItemClick) {
            try {
                const res = await fetch(`/api/${item.type}/${item.id}`);
                const fullData = await res.json();

                const enrichedItem = {
                    ...fullData,
                    id: item.id,
                    type: item.type,
                    media_type: item.type,
                    genre_ids: fullData.genres?.map(g => g.id) || [],
                    ...(item.type === 'tv' && item.lastSeason && item.lastEpisode && {
                        lastSeason: item.lastSeason,
                        lastEpisode: item.lastEpisode,
                    }),
                };

                onItemClick(enrichedItem);
            } catch (error) {
                console.error('Failed to fetch content data:', error);
                const url = item.type === 'tv' && item.lastSeason && item.lastEpisode
                    ? `/watch?type=${item.type}&id=${item.id}&season=${item.lastSeason}&episode=${item.lastEpisode}`
                    : `/watch?type=${item.type}&id=${item.id}`;
                navigate(url);
            }
        } else {
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
        <div className="continue-watching-section" data-nav-section="continue-watching">
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

            <div
                className={`continue-watching-carousel${isDragging ? ' dragging' : ''}`}
                ref={carouselRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                style={{ cursor: 'grab' }}
            >
                {displayItems.map((item) => {
                    const backdropSrc = cardBackdrop(item.backdrop_path)
                        ?? posterAsBackdrop(item.poster_path)
                        ?? '/placeholder-backdrop.jpg';
                    const logoSrc = cardLogo(item.logo_path);

                    return (
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
                            onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}
                        >
                            <div className="continue-watching-backdrop">
                                <img
                                    src={backdropSrc}
                                    alt={item.title}
                                    loading="lazy"
                                    draggable="false"
                                />
                                <div className="continue-watching-hover-overlay">
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
                                    <button className="continue-watching-play-btn" tabIndex="-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                            <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Type badge */}
                                <span className="continue-watching-type-badge">
                                    {item.type === 'tv' ? 'TV' : 'Movie'}
                                </span>

                                {/* Episode info badge for TV shows */}
                                {item.type === 'tv' && item.lastSeason && item.lastEpisode && (
                                    <div className="continue-watching-episode-badge">
                                        S{item.lastSeason} • E{item.lastEpisode}
                                    </div>
                                )}

                                {/* Timestamp badge */}
                                <div className="continue-watching-time-badge">
                                    {formatTimestamp(item.lastWatched)}
                                </div>

                                {/* Logo or Title Overlay */}
                                {logoSrc ? (
                                    <div className="continue-watching-logo-overlay">
                                        <img
                                            src={logoSrc}
                                            alt={item.title}
                                            draggable="false"
                                        />
                                    </div>
                                ) : (
                                    <div className="continue-watching-title-overlay">
                                        <span>{item.title}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Custom Confirm Dialog */}
            {showConfirmDialog && (
                <div className="confirm-dialog-overlay" onClick={handleCancelClear} data-nav-trap>
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
