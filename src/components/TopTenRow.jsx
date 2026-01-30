import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import { getPosterAlt } from '../utils/altTextUtils';
import './TopTenRow.css';

const TopTenRow = ({ items, onItemClick, countryName = 'Your Country' }) => {
    const { BACKDROP_URL, LOGO_URL, fetchMovieDetails, fetchTVDetails, POSTER_URL } = useTMDB();

    // Refs - carouselRef is now the scrollable container
    const carouselRef = useRef(null);
    const cardRefs = useRef([]);
    const touchEndTimeoutRef = useRef(null);

    // Core state
    const [focusedCardIndex, setFocusedCardIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(3); // Default to fewer items for landscape

    // Data enrichment state
    const [enrichedContent, setEnrichedContent] = useState([]);
    const [isEnriching, setIsEnriching] = useState(false);

    // Interaction state
    const [interactionState, setInteractionState] = useState({
        isPaused: false,
        isKeyboardNav: false,
        isTouching: false
    });

    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Fetch logos and backdrops
    useEffect(() => {
        const enrichContent = async () => {
            if (!items || !items.length || isEnriching) return;

            setIsEnriching(true);

            try {
                const enrichedItems = await Promise.all(
                    items.map(async (item) => {
                        try {
                            const type = item.type || item.media_type || 'movie';
                            const response = await fetch(`/api/${type}/${item.id}/images`);

                            // Fetch details for rating if missing
                            let rating = item.vote_average;
                            if (rating === undefined) {
                                const detailsPromise = type === 'movie'
                                    ? fetchMovieDetails(item.id)
                                    : fetchTVDetails(item.id);
                                const details = await detailsPromise;
                                rating = details.vote_average;
                            }

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
                                backdrop_path: backdrop_path || item.poster_path, // Fallback to poster if really no backdrop
                                vote_average: rating
                            };
                        } catch (error) {
                            return item;
                        }
                    })
                );

                setEnrichedContent(enrichedItems);
            } catch (error) {
                console.error('Error enriching Top 10 content:', error);
                setEnrichedContent(items);
            } finally {
                setIsEnriching(false);
            }
        };

        enrichContent();
    }, [items]);

    const displayContent = enrichedContent.length > 0 ? enrichedContent : items;

    // Responsive items per view (adjusted for landscape cards)
    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) setItemsPerView(4);
            else if (width >= 1920) setItemsPerView(4);
            else if (width >= 1280) setItemsPerView(3);
            else if (width >= 768) setItemsPerView(2);
            else setItemsPerView(1.2); // Visible part of next card on mobile
        };

        updateItemsPerView();
        window.addEventListener('resize', updateItemsPerView);
        return () => window.removeEventListener('resize', updateItemsPerView);
    }, []);

    // Cleanup logic remains the same...
    useEffect(() => {
        return () => {
            if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, []);

    // ... (Keep existing Momentum/Drag/Event handlers logic) ...

    // Validate focusedCardIndex
    useEffect(() => {
        if (displayContent && focusedCardIndex >= displayContent.length) {
            setFocusedCardIndex(Math.max(0, displayContent.length - 1));
        }
    }, [displayContent, focusedCardIndex]);

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
        if (Math.abs(x - startX) > 5) setIsDragging(true);
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
                if (displayContent?.[index]) onItemClick(displayContent[index]);
                break;
        }
    }, [displayContent, onItemClick]);

    const handleCardFocus = useCallback((index) => {
        setInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
        setFocusedCardIndex(index);
        cardRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, []);

    if (!items || items.length === 0) return null;

    const { isPaused, isKeyboardNav } = interactionState;

    return (
        <div className="top-ten-section">
            <h2 className="top-ten-title">Top 10 in {countryName}</h2>
            <p className="top-ten-subtitle">What {countryName} is Watching</p>

            <div
                className={`top-ten-carousel${isDragging ? ' dragging' : ''}`}
                ref={carouselRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {displayContent.map((item, index) => {
                    const title = item.title || item.name;
                    // Use Backdrop logic
                    const backdropSrc = item.backdrop_path
                        ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
                        : item.poster_path
                            ? `${POSTER_URL}${item.poster_path}`
                            : '/placeholder-backdrop.jpg';
                    const logoSrc = item.logo_path
                        ? `${LOGO_URL}${item.logo_path}`
                        : null;

                    const isFocused = (isKeyboardNav || !isPaused) && focusedCardIndex === index;

                    return (
                        <div
                            key={item.id}
                            ref={el => cardRefs.current[index] = el}
                            className={`top-ten-card${isFocused ? ' focused' : ''}`}
                            onClick={() => !isDragging && onItemClick(item)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            onFocus={() => handleCardFocus(index)}
                            aria-label={`#${index + 1} ${title}`}
                        >
                            <div className="top-ten-backdrop">
                                <img
                                    src={backdropSrc}
                                    alt={getPosterAlt(item)}
                                    loading="lazy"
                                    draggable="false"
                                />
                                <div className="top-ten-hover-overlay">
                                    <button className="top-ten-play-btn" tabIndex={-1}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                            <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Rank Number inside card */}
                                <div className="top-ten-rank">{index + 1}</div>

                                {/* Rating */}
                                {item.vote_average > 0 && (
                                    <div className="top-ten-rating">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                        </svg>
                                        <span>{item.vote_average.toFixed(1)}</span>
                                    </div>
                                )}

                                {/* Logo or Title Overlay */}
                                {logoSrc ? (
                                    <div className="top-ten-logo-overlay">
                                        <img
                                            src={logoSrc}
                                            alt={title}
                                            draggable="false"
                                        />
                                    </div>
                                ) : (
                                    <div className="top-ten-title-overlay">
                                        <span>{title}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TopTenRow;
