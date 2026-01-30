/**
 * RecommendedForYou - Smart recommendation section based on watch history
 * Shows "Because you watched [Title]" - hidden if no watch history
 */
import React, { useState, useEffect, useCallback, memo } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import useWatchHistory from '../hooks/useWatchHistory';
import useSwipe from '../hooks/useSwipe';
import { getPosterAlt } from '../utils/altTextUtils';
import './TrendingSection.css';

const POSTER_URL = 'https://image.tmdb.org/t/p/w500';

const RecommendedForYou = memo(({ onItemClick }) => {
    const {
        movieGenres,
        tvGenres,
        fetchMovieRecommendations,
        fetchTVRecommendations,
        fetchCredits,
        fetchContentRating
    } = useTMDB();
    const { watchHistory, isLoaded: historyLoaded } = useWatchHistory();

    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(6);
    const [anchorTitle, setAnchorTitle] = useState(null);

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

    // Responsive items per view
    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) setItemsPerView(5);
            else if (width >= 1280) setItemsPerView(6);
            else if (width >= 1024) setItemsPerView(5);
            else if (width >= 768) setItemsPerView(4);
            else if (width >= 640) setItemsPerView(4);
            else setItemsPerView(3);
        };

        updateItemsPerView();
        window.addEventListener('resize', updateItemsPerView);
        return () => window.removeEventListener('resize', updateItemsPerView);
    }, []);

    const maxIndex = Math.max(0, recommendations.length - itemsPerView);
    const translateX = currentIndex * (100 / itemsPerView);

    const handlePrevious = () => setCurrentIndex(prev => Math.max(0, prev - 1));
    const handleNext = () => setCurrentIndex(prev => Math.min(maxIndex, prev + 1));

    const handleItemClick = useCallback(async (item) => {
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

        const [cast, contentRating] = await Promise.all([
            fetchCredits(type, item.id),
            fetchContentRating(type, item.id)
        ]);

        const enrichedItem = {
            ...item,
            type,
            media_type: type,
            genres: genreNames,
            cast: cast.join(', ') || 'N/A',
            contentRating
        };

        if (onItemClick) {
            onItemClick(enrichedItem);
        }
    }, [movieGenres, tvGenres, fetchCredits, fetchContentRating, onItemClick]);

    const swipeHandlers = useSwipe({
        onSwipe: (itemsToMove) => {
            setCurrentIndex(prev => {
                const newIndex = prev + itemsToMove;
                return Math.max(0, Math.min(maxIndex, newIndex));
            });
        },
        threshold: 50,
        itemsPerSwipe: itemsPerView
    });

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
        <div className="trending-section" aria-live="polite" aria-busy={loading}>
            <div className="trending-section-header">
                <div className="trending-section-header-left">
                    <div className="trending-section-header-accent"></div>
                    <h2 className="trending-section-title">{sectionTitle}</h2>
                </div>
            </div>

            {loading ? (
                <div className="trending-skeleton-container">
                    <div className="trending-skeleton-track">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="trending-skeleton-slide">
                                <div className="trending-card-skeleton" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="trending-carousel" role="region" aria-roledescription="carousel" {...swipeHandlers}>
                    <div className="trending-carousel-viewport">
                        <div
                            className="trending-carousel-track"
                            style={{ transform: `translate3d(-${translateX}%, 0px, 0px)` }}
                        >
                            {recommendations.map((item) => (
                                <div
                                    key={item.id}
                                    className="trending-carousel-slide"
                                    role="group"
                                    aria-roledescription="slide"
                                >
                                    <div
                                        className="trending-card"
                                        onClick={() => handleItemClick(item)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleItemClick(item);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Play ${item.title || item.name}`}
                                    >
                                        <div className="trending-card-gradient"></div>
                                        <img
                                            src={item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/placeholder-poster.jpg'}
                                            alt={getPosterAlt(item)}
                                            className="trending-card-image"
                                            loading="lazy"
                                        />
                                        <div className="trending-hover-overlay">
                                            <button className="trending-play-btn" tabIndex="-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                                </svg>
                                            </button>
                                        </div>
                                        {item.vote_average > 0 && (
                                            <div className="trending-card-rating">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                                </svg>
                                                <span>{item.vote_average.toFixed(1)}</span>
                                            </div>
                                        )}
                                        <div className="trending-card-info">
                                            <h3 className="trending-card-title">{item.title || item.name}</h3>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        className="trending-carousel-btn trending-carousel-prev"
                        onClick={handlePrevious}
                        disabled={currentIndex === 0}
                        aria-label="Previous slide"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m12 19-7-7 7-7"></path>
                            <path d="M19 12H5"></path>
                        </svg>
                    </button>

                    <button
                        className="trending-carousel-btn trending-carousel-next"
                        onClick={handleNext}
                        disabled={currentIndex >= maxIndex}
                        aria-label="Next slide"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14"></path>
                            <path d="m12 5 7 7-7 7"></path>
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
});

RecommendedForYou.displayName = 'RecommendedForYou';
export default RecommendedForYou;
