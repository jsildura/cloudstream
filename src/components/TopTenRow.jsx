import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import './TopTenRow.css';

const TopTenRow = ({ items, onItemClick, countryName = 'Your Country' }) => {
    const { POSTER_URL } = useTMDB();

    // Refs
    const carouselRef = useRef(null);
    const viewportRef = useRef(null);
    const cardRefs = useRef([]);
    const touchEndTimeoutRef = useRef(null);

    // Core state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [focusedCardIndex, setFocusedCardIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(5);
    const [scrollMetrics, setScrollMetrics] = useState({ trackWidth: 0, viewportWidth: 0 });

    // Interaction state - consolidated into single object to reduce re-renders
    const [interactionState, setInteractionState] = useState({
        isPaused: false,
        isKeyboardNav: false,
        isTouching: false
    });

    // Memoized values
    const maxIndex = useMemo(() =>
        Math.max(0, (items?.length || 0) - itemsPerView),
        [items?.length, itemsPerView]
    );

    const centerOffset = useMemo(() =>
        Math.floor(itemsPerView / 2),
        [itemsPerView]
    );

    // Calculate scroll metrics from DOM
    const updateScrollMetrics = useCallback(() => {
        if (carouselRef.current && viewportRef.current) {
            setScrollMetrics({
                trackWidth: carouselRef.current.scrollWidth,
                viewportWidth: viewportRef.current.clientWidth
            });
        }
    }, []);

    // Responsive items per view
    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) setItemsPerView(5);
            else if (width >= 1920) setItemsPerView(5);
            else if (width >= 1024) setItemsPerView(4);
            else if (width >= 768) setItemsPerView(3);
            else setItemsPerView(2);
        };

        updateItemsPerView();
        window.addEventListener('resize', updateItemsPerView);
        return () => window.removeEventListener('resize', updateItemsPerView);
    }, []);

    // Update scroll metrics when items or viewport changes
    useEffect(() => {
        updateScrollMetrics();
        window.addEventListener('resize', updateScrollMetrics);
        return () => window.removeEventListener('resize', updateScrollMetrics);
    }, [items, updateScrollMetrics]);

    // Delayed scroll metrics update for layout shifts
    useEffect(() => {
        const timer = setTimeout(updateScrollMetrics, 100);
        return () => clearTimeout(timer);
    }, [items, updateScrollMetrics]);

    // Cleanup touch timeout on unmount
    useEffect(() => {
        return () => {
            if (touchEndTimeoutRef.current) {
                clearTimeout(touchEndTimeoutRef.current);
            }
        };
    }, []);

    // Validate focusedCardIndex when items change
    useEffect(() => {
        if (items && focusedCardIndex >= items.length) {
            setFocusedCardIndex(Math.max(0, items.length - 1));
        }
    }, [items, focusedCardIndex]);

    // Auto-scroll and auto-hover every 5 seconds
    useEffect(() => {
        const { isPaused, isKeyboardNav, isTouching } = interactionState;
        if (isPaused || isKeyboardNav || isTouching || !items?.length) return;

        const autoScrollInterval = setInterval(() => {
            setFocusedCardIndex(prev => (prev + 1) % items.length);
        }, 5000);

        return () => clearInterval(autoScrollInterval);
    }, [interactionState, items?.length]);

    // Update scroll position to center the focused card
    useEffect(() => {
        const { isPaused, isKeyboardNav, isTouching } = interactionState;

        // Don't auto-update scroll position during manual interaction
        if (isTouching) return;
        if (isPaused && !isKeyboardNav) return;

        const targetScrollIndex = Math.max(0, Math.min(maxIndex, focusedCardIndex - centerOffset));
        setCurrentIndex(targetScrollIndex);
    }, [focusedCardIndex, interactionState, centerOffset, maxIndex]);

    // Event handlers
    const handleMouseEnter = useCallback(() => {
        setInteractionState(prev => ({ ...prev, isPaused: true, isKeyboardNav: false }));
    }, []);

    const handleMouseLeave = useCallback(() => {
        setInteractionState(prev => ({ ...prev, isPaused: false, isKeyboardNav: false }));
        setFocusedCardIndex(prev => {
            // Reset focus to the center card of current view
            return Math.min((items?.length || 1) - 1, currentIndex + centerOffset);
        });
    }, [currentIndex, centerOffset, items?.length]);

    const handleTouchStart = useCallback(() => {
        // Clear any pending touch end timeout
        if (touchEndTimeoutRef.current) {
            clearTimeout(touchEndTimeoutRef.current);
            touchEndTimeoutRef.current = null;
        }
        setInteractionState(prev => ({ ...prev, isTouching: true, isPaused: true, isKeyboardNav: false }));
    }, []);

    const handleTouchEnd = useCallback(() => {
        // Delay resume to allow swipe animation to complete
        touchEndTimeoutRef.current = setTimeout(() => {
            setInteractionState(prev => ({ ...prev, isTouching: false, isPaused: false }));
            touchEndTimeoutRef.current = null;
        }, 500);
    }, []);

    // TV/Keyboard navigation handler
    const handleKeyDown = useCallback((e, index) => {
        const itemsLength = items?.length || 0;

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
                if (items?.[index]) {
                    onItemClick(items[index]);
                }
                break;
            default:
                break;
        }
    }, [items, onItemClick]);

    // Handle focus event on card (for TV navigation)
    const handleCardFocus = useCallback((index) => {
        setInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
        setFocusedCardIndex(index);
    }, []);

    const handlePrevious = useCallback(() => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    }, []);

    const handleNext = useCallback(() => {
        setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
    }, [maxIndex]);

    // Handle swipe with focusedCardIndex update
    const handleSwipe = useCallback((itemsToMove) => {
        setCurrentIndex(prev => {
            const newIndex = Math.max(0, Math.min(maxIndex, prev + itemsToMove));
            // Update focusedCardIndex to center of new view
            const newFocusedIndex = Math.min((items?.length || 1) - 1, newIndex + centerOffset);
            setFocusedCardIndex(newFocusedIndex);
            return newIndex;
        });
    }, [maxIndex, items?.length, centerOffset]);

    const swipeHandlers = useSwipe({
        onSwipe: handleSwipe,
        threshold: 50,
        itemsPerSwipe: 2
    });

    // Calculate translation
    const translateX = useMemo(() => {
        const { trackWidth, viewportWidth } = scrollMetrics;
        const maxScroll = Math.max(0, trackWidth - viewportWidth);
        const scrollPerStep = maxIndex > 0 ? maxScroll / maxIndex : 0;
        return currentIndex * scrollPerStep;
    }, [scrollMetrics, maxIndex, currentIndex]);

    // Early return for empty items
    if (!items || items.length === 0) {
        return null;
    }

    const { isPaused, isKeyboardNav } = interactionState;

    return (
        <div className="top-ten-section">
            <h2 className="top-ten-title">
                Top 10 in {countryName}
            </h2>

            <div
                className="top-ten-carousel"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onTouchStart={(e) => {
                    handleTouchStart();
                    swipeHandlers.onTouchStart(e);
                }}
                onTouchMove={swipeHandlers.onTouchMove}
                onTouchEnd={(e) => {
                    swipeHandlers.onTouchEnd(e);
                    handleTouchEnd();
                }}
            >
                <div className="top-ten-viewport" ref={viewportRef}>
                    <div
                        className="top-ten-track"
                        ref={carouselRef}
                        style={{ transform: `translate3d(-${translateX}px, 0, 0)` }}
                    >
                        {items.map((item, index) => {
                            const title = item.title || item.name;
                            const posterSrc = item.poster_path
                                ? `${POSTER_URL}${item.poster_path}`
                                : '/placeholder-poster.jpg';
                            const isFocused = (isKeyboardNav || !isPaused) && focusedCardIndex === index;

                            return (
                                <div
                                    key={item.id}
                                    ref={el => cardRefs.current[index] = el}
                                    className={`top-ten-card${isFocused ? ' focused' : ''}`}
                                    onClick={() => onItemClick(item)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                    onFocus={() => handleCardFocus(index)}
                                    aria-label={`#${index + 1} ${title}`}
                                >
                                    <span className="top-ten-number">{index + 1}</span>
                                    <div className="top-ten-poster">
                                        <img
                                            src={posterSrc}
                                            alt={title}
                                            loading="lazy"
                                        />
                                        <div className="top-ten-hover-overlay">
                                            <button className="top-ten-play-btn" tabIndex={-1}>
                                                <span className="play-icon">▶</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Navigation buttons */}
                <button
                    className="top-ten-nav-btn top-ten-prev"
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    aria-label="Previous"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>

                <button
                    className="top-ten-nav-btn top-ten-next"
                    onClick={handleNext}
                    disabled={currentIndex >= maxIndex}
                    aria-label="Next"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default TopTenRow;
