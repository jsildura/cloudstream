/**
 * PopularOnStreamflix - Top 10 content watched by all Streamflix users this week
 * Uses Firebase to track aggregate watch counts across all users
 * Styled like MovieStudios cards with backdrop, rank, and logo overlay
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import usePopularTracking from '../hooks/usePopularTracking';
import { useTMDB } from '../hooks/useTMDB';
import useTVDetect from '../hooks/useTVDetect';
import './PopularOnStreamflix.css';

const PopularOnStreamflix = ({ onItemClick }) => {
    const { popularContent, loading } = usePopularTracking();
    const { BACKDROP_URL, LOGO_URL, fetchMovieDetails, fetchTVDetails, fetchCredits, fetchContentRating } = useTMDB();

    // State for enriched data (with logos)
    const [enrichedContent, setEnrichedContent] = useState([]);
    const [isEnriching, setIsEnriching] = useState(false);

    // Refs
    const carouselRef = useRef(null);
    const cardRefs = useRef([]);
    const touchEndTimeoutRef = useRef(null);
    const isTVMode = useTVDetect();

    // Core state
    const [focusedCardIndex, setFocusedCardIndex] = useState(0);
    const [interactionState, setInteractionState] = useState({
        isPaused: false,
        isKeyboardNav: false,
        isTouching: false
    });

    const displayContent = enrichedContent.length > 0 ? enrichedContent : popularContent;

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
                            // Fetch details to get rating
                            const detailsPromise = type === 'movie'
                                ? fetchMovieDetails(item.id)
                                : fetchTVDetails(item.id);

                            const [imagesData, details] = await Promise.all([
                                response.json(),
                                detailsPromise
                            ]);

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
                                backdrop_path: backdrop_path || item.poster_path,
                                vote_average: details.vote_average
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
            if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, []);

    // Validate focusedCardIndex
    useEffect(() => {
        if (displayContent && focusedCardIndex >= displayContent.length) {
            setFocusedCardIndex(Math.max(0, displayContent.length - 1));
        }
    }, [displayContent, focusedCardIndex]);

    // Cancel momentum
    const cancelMomentum = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    // Momentum loop
    const momentumLoop = useCallback(() => {
        if (!carouselRef.current || isTVMode) return;
        carouselRef.current.scrollLeft -= velX.current;
        velX.current *= 0.95;
        if (Math.abs(velX.current) > 0.5) {
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        } else {
            animationFrameId.current = null;
        }
    }, [isTVMode]);

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
        setInteractionState(prev => ({ ...prev, isPaused: false, isKeyboardNav: false }));
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

    const handleMouseEnter = useCallback(() => {
        setInteractionState(prev => ({ ...prev, isPaused: true, isKeyboardNav: false }));
    }, []);

    const handleTouchStart = useCallback(() => {
        if (touchEndTimeoutRef.current) {
            clearTimeout(touchEndTimeoutRef.current);
            touchEndTimeoutRef.current = null;
        }
        setInteractionState(prev => ({ ...prev, isTouching: true, isPaused: true, isKeyboardNav: false }));
    }, []);

    const handleTouchEnd = useCallback(() => {
        touchEndTimeoutRef.current = setTimeout(() => {
            setInteractionState(prev => ({ ...prev, isTouching: false, isPaused: false }));
            touchEndTimeoutRef.current = null;
        }, 500);
    }, []);

    const handleCardFocus = useCallback((index) => {
        setInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
        setFocusedCardIndex(index);
        cardRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, []);

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

    const handleKeyDown = useCallback((e, index) => {
        const itemsLength = displayContent?.length || 0;
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                if (index > 0) {
                    setInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
                    setFocusedCardIndex(index - 1);
                    cardRefs.current[index - 1]?.focus();
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (index < itemsLength - 1) {
                    setInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
                    setFocusedCardIndex(index + 1);
                    cardRefs.current[index + 1]?.focus();
                }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (displayContent?.[index]) handleItemClick(displayContent[index]);
                break;
            default:
                break;
        }
    }, [displayContent, handleItemClick]);

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
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {loading ? (
                    // Skeleton loading
                    [...Array(10)].map((_, i) => (
                        <div key={i} className="popular-streamflix-card-skeleton" />
                    ))
                ) : (
                    displayContent.map((item, index) => {
                        const backdropSrc = item.backdrop_path
                            ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
                            : item.poster_path
                                ? `https://image.tmdb.org/t/p/w780${item.poster_path}`
                                : null;

                        const logoSrc = item.logo_path
                            ? `${LOGO_URL}${item.logo_path}`
                            : null;

                        const { isPaused, isKeyboardNav } = interactionState;
                        const isFocused = (isKeyboardNav || !isPaused) && focusedCardIndex === index;

                        return (
                            <div
                                key={item.key || item.id}
                                ref={el => cardRefs.current[index] = el}
                                className={`popular-streamflix-card${isFocused ? ' focused' : ''}`}
                                onClick={() => handleItemClick(item)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                onFocus={() => handleCardFocus(index)}
                                aria-label={`#${index + 1} ${item.title || item.name}`}
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
                                    <div className="popular-streamflix-hover-overlay">
                                        <button className="popular-streamflix-play-btn" tabIndex="-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="popular-streamflix-rank">{index + 1}</div>
                                    {item.vote_average > 0 && (
                                        <div className="popular-streamflix-rating">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                            </svg>
                                            <span>{item.vote_average.toFixed(1)}</span>
                                        </div>
                                    )}
                                    {logoSrc ? (
                                        <div className="popular-streamflix-logo-overlay">
                                            <img
                                                src={logoSrc}
                                                alt={item.title || 'Content logo'}
                                                draggable="false"
                                            />
                                        </div>
                                    ) : (
                                        <div className="popular-streamflix-title-overlay">
                                            {(() => {
                                                const words = (item.title || '').split(' ');
                                                if (words.length === 1) {
                                                    return <span className="popular-streamflix-title-last">{words[0]}</span>;
                                                }
                                                const lastWord = words.pop();
                                                return (
                                                    <>
                                                        <span>{words.join(' ')}</span>
                                                        <span>&nbsp;</span>
                                                        <span className="popular-streamflix-title-last">{lastWord}</span>
                                                    </>
                                                );
                                            })()}
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
