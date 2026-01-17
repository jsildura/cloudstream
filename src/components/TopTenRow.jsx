import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import { getPosterAlt } from '../utils/altTextUtils';
import './TopTenRow.css';

const TopTenRow = ({ items, onItemClick, countryName = 'Your Country' }) => {
    const { POSTER_URL } = useTMDB();

    // Refs - carouselRef is now the scrollable container
    const carouselRef = useRef(null);
    const cardRefs = useRef([]);
    const touchEndTimeoutRef = useRef(null);

    // Core state
    const [focusedCardIndex, setFocusedCardIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(5);

    // Interaction state - consolidated into single object to reduce re-renders
    const [interactionState, setInteractionState] = useState({
        isPaused: false,
        isKeyboardNav: false,
        isTouching: false
    });

    // Drag state for mouse swipe (native scroll-based like MovieStudios)
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    const centerOffset = useMemo(() =>
        Math.floor(itemsPerView / 2),
        [itemsPerView]
    );

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

    // Cancel momentum animation
    const cancelMomentum = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    // Momentum animation loop (native scroll-based like MovieStudios)
    const momentumLoop = useCallback(() => {
        if (!carouselRef.current) return;

        // Apply velocity
        carouselRef.current.scrollLeft -= velX.current;

        // Decay velocity
        velX.current *= 0.95; // Friction factor

        if (Math.abs(velX.current) > 0.5) {
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        } else {
            animationFrameId.current = null;
        }
    }, []);

    // Mouse drag handlers (native scroll-based like MovieStudios)
    const handleMouseDown = useCallback((e) => {
        if (e.button !== 0) return; // Only left mouse button
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
        // Start momentum if velocity is present
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

        // Start momentum if velocity is present
        if (Math.abs(velX.current) > 1) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        }
    }, [cancelMomentum, momentumLoop]);

    const handleMouseMove = useCallback((e) => {
        if (!isDown) return;
        e.preventDefault();

        const x = e.pageX - carouselRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast factor

        // Track velocity for momentum
        velX.current = e.movementX * 2;

        carouselRef.current.scrollLeft = scrollLeft - walk;

        if (Math.abs(x - startX) > 5) {
            setIsDragging(true);
        }
    }, [isDown, startX, scrollLeft]);

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
        // Scroll the focused card into view
        cardRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, []);

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
                ref={carouselRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
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
                                    alt={getPosterAlt(item)}
                                    loading="lazy"
                                    draggable="false"
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
    );
};

export default TopTenRow;
