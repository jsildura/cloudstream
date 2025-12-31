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

    // Drag state for mouse swipe
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollStartX, setScrollStartX] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Memoized values - calculate maxIndex based on actual scroll metrics
    // This accounts for variable card widths (card 10 is wider due to "10" number)
    const maxIndex = useMemo(() => {
        if (!carouselRef.current || !viewportRef.current || !cardRefs.current[0]) {
            // Fallback to simple calculation
            return Math.max(0, (items?.length || 0) - itemsPerView);
        }

        const firstCard = cardRefs.current[0];
        const cardWidth = firstCard.offsetWidth;
        const cardStyle = window.getComputedStyle(firstCard);
        const marginRight = parseFloat(cardStyle.marginRight) || 0;
        const totalCardWidth = cardWidth + marginRight;

        const trackWidth = carouselRef.current.scrollWidth;
        const viewportWidth = viewportRef.current.clientWidth;
        const maxScroll = Math.max(0, trackWidth - viewportWidth);

        // Calculate how many index steps needed to reach maxScroll
        // Add 1 to ensure we can scroll past any partial card
        return Math.ceil(maxScroll / totalCardWidth);
    }, [items?.length, itemsPerView, scrollMetrics]);

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

    // Cleanup touch timeout and momentum animation on unmount
    useEffect(() => {
        return () => {
            if (touchEndTimeoutRef.current) {
                clearTimeout(touchEndTimeoutRef.current);
            }
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    // Validate focusedCardIndex when items change
    useEffect(() => {
        if (items && focusedCardIndex >= items.length) {
            setFocusedCardIndex(Math.max(0, items.length - 1));
        }
    }, [items, focusedCardIndex]);

    // Update scroll position when focused card changes via keyboard navigation
    useEffect(() => {
        const { isKeyboardNav } = interactionState;

        // Only update scroll position during keyboard navigation
        if (!isKeyboardNav) return;

        const targetScrollIndex = Math.max(0, Math.min(maxIndex, focusedCardIndex - centerOffset));
        setCurrentIndex(targetScrollIndex);
    }, [focusedCardIndex, interactionState, centerOffset, maxIndex]);

    // Cancel momentum animation
    const cancelMomentum = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    // Momentum animation loop
    const momentumLoop = useCallback(() => {
        if (!viewportRef.current) return;

        // Apply velocity to currentIndex calculation
        const cardWidth = cardRefs.current[0]?.offsetWidth || 200;
        const cardStyle = cardRefs.current[0] ? window.getComputedStyle(cardRefs.current[0]) : null;
        const marginRight = cardStyle ? parseFloat(cardStyle.marginRight) || 0 : 0;
        const totalCardWidth = cardWidth + marginRight;

        // Convert velocity to index change
        const indexChange = velX.current / totalCardWidth;

        setCurrentIndex(prev => {
            const newIndex = Math.max(0, Math.min(maxIndex, prev - indexChange));
            return newIndex;
        });

        // Decay velocity
        velX.current *= 0.92;

        if (Math.abs(velX.current) > 2) {
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        } else {
            animationFrameId.current = null;
            // Snap to nearest index
            setCurrentIndex(prev => Math.round(prev));
        }
    }, [maxIndex]);

    // Mouse drag handlers
    const handleMouseDown = useCallback((e) => {
        if (e.button !== 0) return; // Only left mouse button
        setIsDown(true);
        setIsDragging(false);
        cancelMomentum();
        setStartX(e.pageX);
        setScrollStartX(currentIndex);
        velX.current = 0;
        if (viewportRef.current) viewportRef.current.style.cursor = 'grabbing';
    }, [cancelMomentum, currentIndex]);

    const handleMouseLeaveCarousel = useCallback(() => {
        if (isDown) {
            setIsDown(false);
            if (viewportRef.current) viewportRef.current.style.cursor = 'grab';
            // Start momentum
            if (Math.abs(velX.current) > 5) {
                cancelMomentum();
                animationFrameId.current = requestAnimationFrame(momentumLoop);
            } else {
                setCurrentIndex(prev => Math.round(prev));
            }
        }
        setInteractionState(prev => ({ ...prev, isPaused: false, isKeyboardNav: false }));
        setFocusedCardIndex(prev => {
            return Math.min((items?.length || 1) - 1, Math.round(currentIndex) + centerOffset);
        });
    }, [isDown, cancelMomentum, momentumLoop, items?.length, currentIndex, centerOffset]);

    const handleMouseUp = useCallback(() => {
        if (!isDown) return;
        setIsDown(false);
        if (viewportRef.current) viewportRef.current.style.cursor = 'grab';
        setTimeout(() => setIsDragging(false), 0);

        // Start momentum if velocity is present
        if (Math.abs(velX.current) > 5) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        } else {
            setCurrentIndex(prev => Math.round(prev));
        }
    }, [isDown, cancelMomentum, momentumLoop]);

    const handleMouseMove = useCallback((e) => {
        if (!isDown) return;
        e.preventDefault();

        const x = e.pageX;
        const walk = (x - startX);

        // Calculate new index based on drag distance
        const cardWidth = cardRefs.current[0]?.offsetWidth || 200;
        const cardStyle = cardRefs.current[0] ? window.getComputedStyle(cardRefs.current[0]) : null;
        const marginRight = cardStyle ? parseFloat(cardStyle.marginRight) || 0 : 0;
        const totalCardWidth = cardWidth + marginRight;

        const indexChange = walk / totalCardWidth;
        const newIndex = Math.max(0, Math.min(maxIndex, scrollStartX - indexChange));

        setCurrentIndex(newIndex);

        // Track velocity for momentum
        velX.current = e.movementX * 2;

        if (Math.abs(walk) > 5) {
            setIsDragging(true);
        }
    }, [isDown, startX, scrollStartX, maxIndex]);

    // Event handlers
    const handleMouseEnter = useCallback(() => {
        setInteractionState(prev => ({ ...prev, isPaused: true, isKeyboardNav: false }));
    }, []);

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

    // Calculate translation based on card width
    const translateX = useMemo(() => {
        if (!cardRefs.current[0] || !viewportRef.current) return 0;

        const firstCard = cardRefs.current[0];
        const cardWidth = firstCard.offsetWidth;
        const cardStyle = window.getComputedStyle(firstCard);
        const marginRight = parseFloat(cardStyle.marginRight) || 0;
        const totalCardWidth = cardWidth + marginRight;

        // Calculate max scroll to ensure last items are visible
        // Use actual track scrollWidth since cards have variable widths (card 10 is wider due to "10" number)
        const trackElement = carouselRef.current;
        const trackWidth = trackElement ? trackElement.scrollWidth : totalCardWidth * (items?.length || 0);
        const viewportWidth = viewportRef.current.clientWidth;
        const maxScroll = Math.max(0, trackWidth - viewportWidth);

        // Calculate current scroll position
        const scrollPosition = currentIndex * totalCardWidth;

        return Math.min(scrollPosition, maxScroll);
    }, [currentIndex, items?.length, scrollMetrics]);

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
                className={`top-ten-carousel${isDragging ? ' dragging' : ''}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeaveCarousel}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={(e) => {
                    handleTouchStart();
                    swipeHandlers.onTouchStart(e);
                }}
                onTouchMove={swipeHandlers.onTouchMove}
                onTouchEnd={(e) => {
                    swipeHandlers.onTouchEnd(e);
                    handleTouchEnd();
                }}
                style={{ cursor: isDown ? 'grabbing' : 'grab' }}
            >
                <div className="top-ten-viewport" ref={viewportRef}>
                    <div
                        className="top-ten-track"
                        ref={carouselRef}
                        style={{
                            transform: `translate3d(-${translateX}px, 0, 0)`,
                            transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)'
                        }}
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
                                    onClick={() => !isDragging && onItemClick(item)}
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
