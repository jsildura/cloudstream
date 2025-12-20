import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import './TopTenRow.css';

const TopTenRow = ({ items, onItemClick, countryName = 'Your Country' }) => {
    const { POSTER_URL } = useTMDB();
    const [currentIndex, setCurrentIndex] = useState(0);
    const carouselRef = useRef(null);
    const viewportRef = useRef(null);
    const [itemsPerView, setItemsPerView] = useState(5);
    const [scrollMetrics, setScrollMetrics] = useState({ trackWidth: 0, viewportWidth: 0 });

    // Calculate scroll metrics from DOM
    const updateScrollMetrics = useCallback(() => {
        if (carouselRef.current && viewportRef.current) {
            setScrollMetrics({
                trackWidth: carouselRef.current.scrollWidth,
                viewportWidth: viewportRef.current.clientWidth
            });
        }
    }, []);

    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) {
                setItemsPerView(5); // 4K
            } else if (width >= 1920) {
                setItemsPerView(5); // 1080p
            } else if (width >= 1024) {
                setItemsPerView(4); // Desktop
            } else if (width >= 768) {
                setItemsPerView(3); // Tablet
            } else {
                setItemsPerView(2); // Mobile
            }
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

    // Also update after a short delay to catch any layout shifts
    useEffect(() => {
        const timer = setTimeout(updateScrollMetrics, 100);
        return () => clearTimeout(timer);
    }, [items, updateScrollMetrics]);

    const maxIndex = Math.max(0, items.length - itemsPerView);
    const [isPaused, setIsPaused] = useState(false);
    const [focusedCardIndex, setFocusedCardIndex] = useState(0);

    // Auto-scroll and auto-hover every 5 seconds - center focused card
    useEffect(() => {
        if (isPaused) return;

        const autoScrollInterval = setInterval(() => {
            setFocusedCardIndex(prev => {
                const nextFocus = prev + 1;
                // When we've gone through all items, loop back
                if (nextFocus >= items.length) {
                    return 0;
                }
                return nextFocus;
            });
        }, 5000);

        return () => clearInterval(autoScrollInterval);
    }, [isPaused, items.length]);

    // Update scroll position to center the focused card
    useEffect(() => {
        if (isPaused) return;

        // Calculate scroll index to center the focused card
        // The focused card should be in the middle of the visible cards
        const centerOffset = Math.floor(itemsPerView / 2);
        const targetScrollIndex = Math.max(0, Math.min(maxIndex, focusedCardIndex - centerOffset));
        setCurrentIndex(targetScrollIndex);
    }, [focusedCardIndex, isPaused, itemsPerView, maxIndex]);

    const handleMouseEnter = () => setIsPaused(true);
    const handleMouseLeave = () => {
        setIsPaused(false);
        // Reset focus to the center card of current view
        const centerOffset = Math.floor(itemsPerView / 2);
        setFocusedCardIndex(currentIndex + centerOffset);
    };

    const handlePrevious = () => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
    };

    // Calculate how much to translate based on actual DOM measurements
    // maxScroll = total track width - visible viewport width
    // scrollPerStep = maxScroll / maxIndex (if maxIndex > 0)
    const { trackWidth, viewportWidth } = scrollMetrics;
    const maxScroll = Math.max(0, trackWidth - viewportWidth);
    const scrollPerStep = maxIndex > 0 ? maxScroll / maxIndex : 0;
    const translateX = currentIndex * scrollPerStep;

    const swipeHandlers = useSwipe({
        onSwipe: (itemsToMove) => {
            setCurrentIndex(prev => {
                const newIndex = prev + itemsToMove;
                return Math.max(0, Math.min(maxIndex, newIndex));
            });
        },
        threshold: 50,
        itemsPerSwipe: 2
    });

    if (!items || items.length === 0) {
        return null;
    }

    return (
        <div className="top-ten-section">
            <h2 className="top-ten-title">
                Top 10 in {countryName}
            </h2>

            <div
                className="top-ten-carousel"
                {...swipeHandlers}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
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

                            return (
                                <div
                                    key={item.id}
                                    className={`top-ten-card${!isPaused && focusedCardIndex === index ? ' focused' : ''}`}
                                    onClick={() => onItemClick(item)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onItemClick(item);
                                        }
                                    }}
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
                                            <button className="top-ten-play-btn">
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
