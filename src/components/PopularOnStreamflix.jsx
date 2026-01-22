/**
 * PopularOnStreamflix - Top 10 content watched by all Streamflix users this week
 * Uses Firebase to track aggregate watch counts across all users
 * Styled like MovieStudios cards with backdrop, rank, and logo overlay
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import usePopularTracking from '../hooks/usePopularTracking';
import { useTMDB } from '../hooks/useTMDB';
import './PopularOnStreamflix.css';

const PopularOnStreamflix = ({ onItemClick }) => {
    const { popularContent, loading } = usePopularTracking();
    const { BACKDROP_URL, LOGO_URL, fetchMovieDetails, fetchTVDetails, fetchCredits, fetchContentRating } = useTMDB();

    // State for enriched data (with logos)
    const [enrichedContent, setEnrichedContent] = useState([]);
    const [isEnriching, setIsEnriching] = useState(false);

    // Refs
    const carouselRef = useRef(null);

    // Drag state for mouse swipe
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Fetch logos for popular content
    useEffect(() => {
        const enrichContent = async () => {
            if (!popularContent.length || isEnriching) return;

            setIsEnriching(true);

            try {
                const enrichedItems = await Promise.all(
                    popularContent.map(async (item) => {
                        try {
                            // Fetch images to get logo
                            const type = item.type || 'movie';
                            const response = await fetch(`/api/${type}/${item.id}/images`);
                            const imagesData = await response.json();

                            // Get English logo or first available
                            const logos = imagesData.logos || [];
                            const englishLogo = logos.find(l => l.iso_639_1 === 'en') || logos[0];

                            // Also fetch backdrop if not available
                            let backdrop_path = item.backdrop_path;
                            if (!backdrop_path && imagesData.backdrops?.length) {
                                backdrop_path = imagesData.backdrops[0].file_path;
                            }

                            return {
                                ...item,
                                logo_path: englishLogo?.file_path || null,
                                backdrop_path: backdrop_path || item.poster_path
                            };
                        } catch (error) {
                            return item;
                        }
                    })
                );

                setEnrichedContent(enrichedItems);
            } catch (error) {
                console.error('Error enriching content:', error);
                setEnrichedContent(popularContent);
            } finally {
                setIsEnriching(false);
            }
        };

        enrichContent();
    }, [popularContent]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    // Cancel momentum
    const cancelMomentum = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    // Momentum loop
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

    // Mouse handlers
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
        if (Math.abs(x - startX) > 5) {
            setIsDragging(true);
        }
    }, [isDown, startX, scrollLeft]);

    // Handle item click with full details fetch
    const handleItemClick = useCallback(async (item) => {
        if (isDragging) return;

        try {
            // Fetch full details from TMDB
            const type = item.type;
            const details = type === 'movie'
                ? await fetchMovieDetails(item.id)
                : await fetchTVDetails(item.id);

            const [cast, contentRating] = await Promise.all([
                fetchCredits(type, item.id),
                fetchContentRating(type, item.id)
            ]);

            const genreNames = details.genres?.map(g => g.name) || [];

            onItemClick({
                ...details,
                type,
                genres: genreNames,
                cast: cast.join(', ') || 'N/A',
                contentRating
            });
        } catch (error) {
            console.error('Failed to fetch content details:', error);
            // Fallback to basic info
            onItemClick({
                id: item.id,
                title: item.title,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                type: item.type
            });
        }
    }, [isDragging, fetchMovieDetails, fetchTVDetails, fetchCredits, fetchContentRating, onItemClick]);

    // Use enriched content if available, otherwise fall back to original
    const displayContent = enrichedContent.length > 0 ? enrichedContent : popularContent;

    // Don't render if no popular content and not loading
    if (!loading && displayContent.length === 0) {
        return null;
    }

    return (
        <div className="popular-streamflix-section">
            <h2 className="popular-streamflix-title">
                Popular on Streamflix
            </h2>
            <p className="popular-streamflix-subtitle">
                Our Most-Watched This Week
            </p>

            <div
                className={`popular-streamflix-grid${isDragging ? ' dragging' : ''}`}
                ref={carouselRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
            >
                {loading ? (
                    // Skeleton loading
                    [...Array(10)].map((_, i) => (
                        <div key={i} className="popular-streamflix-card-skeleton" />
                    ))
                ) : (
                    displayContent.map((item, index) => {
                        const backdropSrc = item.backdrop_path
                            ? `${BACKDROP_URL}${item.backdrop_path}`
                            : item.poster_path
                                ? `https://image.tmdb.org/t/p/w780${item.poster_path}`
                                : null;

                        const logoSrc = item.logo_path
                            ? `${LOGO_URL}${item.logo_path}`
                            : null;

                        return (
                            <div
                                key={item.key}
                                className="popular-streamflix-card"
                                onClick={() => handleItemClick(item)}
                                role="button"
                                tabIndex={0}
                                aria-label={`#${index + 1} ${item.title}`}
                            >
                                <div className="popular-streamflix-backdrop">
                                    {backdropSrc ? (
                                        <img
                                            src={backdropSrc}
                                            alt={item.title || 'Content backdrop'}
                                            loading="lazy"
                                            draggable="false"
                                        />
                                    ) : (
                                        <div className="popular-streamflix-no-backdrop">
                                            <span>{item.title || 'No Image'}</span>
                                        </div>
                                    )}
                                    <div className="popular-streamflix-rank">{index + 1}</div>
                                    {logoSrc && (
                                        <div className="popular-streamflix-logo-overlay">
                                            <img
                                                src={logoSrc}
                                                alt={item.title || 'Content logo'}
                                                draggable="false"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default PopularOnStreamflix;
