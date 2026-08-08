/**
 * RecommendedForYou - Smart recommendation section based on watch history
 * Shows "Because you watched [Title]" - hidden if no watch history
 * Uses landscape backdrop cards matching TopTenRow style (without rank numbers)
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import useWatchHistory from '../hooks/useWatchHistory';
import { getPosterAlt } from '../utils/altTextUtils';
import { cardBackdrop, posterAsBackdrop, cardLogo } from '../utils/images';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import './TrendingSection.css';
import CarouselControls from './CarouselControls';

const RecommendedForYou = memo(({ onItemClick }) => {
    const {
        fetchMovieRecommendations,
        fetchTVRecommendations
    } = useTMDB();
    const { watchHistory, isLoaded: historyLoaded } = useWatchHistory();
    const { getPreviewProps, closeNow } = useHoverPreview();

    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [anchorTitle, setAnchorTitle] = useState(null);

    // Data enrichment state (logos & backdrops)
    const [enrichedContent, setEnrichedContent] = useState([]);
    const [isEnriching, setIsEnriching] = useState(false);

    // Drag state for horizontal scroll
    const carouselRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Fetch recommendations based on most recent watched item
    useEffect(() => {
        // Wait for history to load from localStorage first
        if (!historyLoaded) return;

        const fetchRecommendations = async () => {
            // No history = don't show this section
            if (!watchHistory || watchHistory.length === 0) {
                setLoading(false);
                setRecommendations([]);
                return;
            }

            try {
                setLoading(true);
                const anchor = watchHistory[0]; // Most recent item

                const fetchFn = anchor.type === 'movie'
                    ? fetchMovieRecommendations
                    : fetchTVRecommendations;

                let data = await fetchFn(anchor.id);

                // Fallback to /similar endpoint if recommendations are empty
                if (data.length === 0) {
                    const similarUrl = `/api/${anchor.type}/${anchor.id}/similar`;
                    const res = await fetch(similarUrl);
                    if (res.ok) {
                        const similarData = await res.json();
                        data = similarData.results || [];
                    }
                }

                // Filter out items already in watch history
                const historyIds = new Set(watchHistory.map(h => h.id));
                let filtered = data.filter(item => !historyIds.has(item.id));

                // === GENRE DIVERSITY INJECTOR ===
                // Inject 2 movies from a different genre to prevent echo chambers
                if (filtered.length >= 5) {
                    try {
                        // Get primary genre from recommendations
                        const recGenres = filtered.flatMap(item => item.genre_ids || []);
                        const primaryGenre = recGenres[0];

                        // Pick a random different genre (excluding primary)
                        const diverseGenres = [28, 35, 18, 27, 10749, 878, 53, 16]; // Action, Comedy, Drama, Horror, Romance, SciFi, Thriller, Animation
                        const otherGenres = diverseGenres.filter(g => g !== primaryGenre);
                        const randomGenre = otherGenres[Math.floor(Math.random() * otherGenres.length)];

                        // Fetch 2 movies from different genre
                        const discoverUrl = `/api/discover/movie?with_genres=${randomGenre}&sort_by=popularity.desc`;
                        const discoverRes = await fetch(discoverUrl);
                        if (discoverRes.ok) {
                            const discoverData = await discoverRes.json();
                            const diverseItems = (discoverData.results || [])
                                .filter(item => !historyIds.has(item.id) && !filtered.some(f => f.id === item.id))
                                .slice(0, 2);

                            if (diverseItems.length > 0) {
                                // Inject at positions 3 and 7
                                if (diverseItems[0] && filtered.length > 3) {
                                    filtered.splice(3, 0, diverseItems[0]);
                                }
                                if (diverseItems[1] && filtered.length > 7) {
                                    filtered.splice(7, 0, diverseItems[1]);
                                }
                            }
                        }
                    } catch {
                        // Diversity injection failed silently - non-critical feature
                    }
                }

                if (filtered.length > 0) {
                    setRecommendations(filtered.slice(0, 20));
                    setAnchorTitle(anchor.title);
                    setEnrichedContent([]);
                } else {
                    // No recommendations available - hide section
                    setRecommendations([]);
                    setAnchorTitle(null);
                }
            } catch (err) {
                console.error('[RecommendedForYou] Error fetching recommendations:', err);
                setRecommendations([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, [historyLoaded, watchHistory, fetchMovieRecommendations, fetchTVRecommendations]);

    // Enrich content with logos and backdrops
    useEffect(() => {
        const enrichContent = async () => {
            if (!recommendations || !recommendations.length || isEnriching) return;

            setIsEnriching(true);

            try {
                const enrichedItems = await Promise.all(
                    recommendations.map(async (item) => {
                        try {
                            const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
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
                                backdrop_path: backdrop_path || item.poster_path,
                            };
                        } catch {
                            return item;
                        }
                    })
                );

                setEnrichedContent(enrichedItems);
            } catch (error) {
                console.error('Error enriching recommended content:', error);
                setEnrichedContent(recommendations);
            } finally {
                setIsEnriching(false);
            }
        };

        enrichContent();
    }, [recommendations]);

    const displayContent = enrichedContent.length > 0 ? enrichedContent : recommendations;

    // Cleanup
    useEffect(() => {
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, []);

    // Drag handlers for horizontal scroll
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

    const handleItemClick = useCallback(async (item) => {
        if (isDragging) return;
        closeNow(); // dismiss the hover preview before the modal opens

        // Delegate immediately to the parent handler which handles its own
        // enrichment (fetchCredits / fetchContentRating). Pre-fetching here
        // AND in the parent doubles the network round-trips.
        if (onItemClick) {
            onItemClick(item);
        }
    }, [isDragging, onItemClick, closeNow]);

    // Don't render if no recommendations or still loading with no history
    if (!loading && recommendations.length === 0) {
        return null;
    }

    // Wait for history to load before deciding to hide
    if (!historyLoaded) {
        return null; // Still loading from localStorage
    }

    // Don't render skeleton if no history after load
    if (loading && watchHistory.length === 0) {
        return null;
    }

    const sectionTitle = anchorTitle
        ? `Because you watched ${anchorTitle}`
        : 'Recommended For You';

    return (
        <div className="trending-section" aria-live="polite" aria-busy={loading} data-nav-section="recommended">
            <div className="trending-section-header">
                <div className="trending-section-header-left">
                    <h2 className="trending-section-title">{sectionTitle}</h2>
                </div>
            </div>

            {loading ? (
                <div className="trending-skeleton-container">
                    <div className="trending-skeleton-track">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="trending-skeleton-slide">
                                <div className="trending-card-skeleton" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="carousel-container">
                    <div
                        className={`trending-carousel${isDragging ? ' dragging' : ''}`}
                        ref={carouselRef}
                        onMouseDown={handleMouseDown}
                        onMouseLeave={handleMouseLeave}
                        onMouseUp={handleMouseUp}
                        onMouseMove={handleMouseMove}
                    >
                        {displayContent.map((item) => {
                        const itemTitle = item.title || item.name;
                        const backdropSrc = cardBackdrop(item.backdrop_path)
                            ?? posterAsBackdrop(item.poster_path)
                            ?? '/placeholder-backdrop.jpg';
                        const logoSrc = cardLogo(item.logo_path);

                        return (
                            <div
                                key={item.id}
                                className="trending-card"
                                onClick={() => handleItemClick(item)}
                                {...getPreviewProps(item, item.media_type || (item.first_air_date ? 'tv' : 'movie'), isDragging, handleItemClick)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleItemClick(item);
                                    }
                                }}
                                onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}
                                tabIndex={0}
                                role="button"
                                aria-label={`Play ${itemTitle}`}
                            >
                                <div className="trending-card-backdrop">
                                    <img
                                        src={backdropSrc}
                                        alt={getPosterAlt(item)}
                                        loading="lazy"
                                        draggable="false"
                                    />
                                    <div className="trending-hover-overlay">
                                        <button className="trending-play-btn" tabIndex="-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Rating */}
                                    {item.vote_average > 0 && (
                                        <div className="trending-card-rating">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                            </svg>
                                            <span>{item.vote_average.toFixed(1)}</span>
                                        </div>
                                    )}

                                    {/* Logo or Title Overlay */}
                                    {logoSrc ? (
                                        <div className="trending-logo-overlay">
                                            <img
                                                src={logoSrc}
                                                alt={itemTitle}
                                                draggable="false"
                                            />
                                        </div>
                                    ) : (
                                        <div className="trending-title-overlay">
                                            <span>{itemTitle}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                    <CarouselControls carouselRef={carouselRef} />
                </div>
            )}
        </div>
    );
});

RecommendedForYou.displayName = 'RecommendedForYou';
export default RecommendedForYou;
