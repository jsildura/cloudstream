import React, { useState, useRef, useEffect } from 'react';
import CollectionCard from './CollectionCard';
import { popularCollections } from '../data/collectionsData';
import useSwipe from '../hooks/useSwipe';
import './PopularCollections.css';

const PopularCollections = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const carouselRef = useRef(null);
    const [itemsPerView, setItemsPerView] = useState(4);

    // Calculate items per view based on screen width
    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) {
                setItemsPerView(4); // 4K
            } else if (width >= 1024) {
                setItemsPerView(4); // Desktop
            } else if (width >= 768) {
                setItemsPerView(3); // Tablet
            } else if (width >= 640) {
                setItemsPerView(2); // Small tablet
            } else {
                setItemsPerView(1); // Mobile
            }
        };

        updateItemsPerView();
        window.addEventListener('resize', updateItemsPerView);
        return () => window.removeEventListener('resize', updateItemsPerView);
    }, []);

    const maxIndex = Math.max(0, popularCollections.length - itemsPerView);

    const handlePrevious = () => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
    };

    const translateX = currentIndex * (100 / itemsPerView);

    // Swipe handlers - move 6 items per swipe
    const swipeHandlers = useSwipe({
        onSwipe: (itemsToMove) => {
            setCurrentIndex(prev => {
                const newIndex = prev + itemsToMove;
                return Math.max(0, Math.min(maxIndex, newIndex));
            });
        },
        threshold: 50,
        itemsPerSwipe: 6
    });

    return (
        <div className="popular-collections">
            <h2 className="popular-collections-title">Popular Collections</h2>

            <div className="collections-carousel" role="region" aria-roledescription="carousel" {...swipeHandlers}>
                <div className="collections-carousel-viewport">
                    <div
                        className="collections-carousel-track"
                        ref={carouselRef}
                        style={{ transform: `translate3d(-${translateX}%, 0px, 0px)` }}
                    >
                        {popularCollections.map((collection) => (
                            <div
                                key={collection.id}
                                className="collections-carousel-slide"
                                role="group"
                                aria-roledescription="slide"
                            >
                                <CollectionCard collection={collection} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Navigation buttons */}
                <button
                    className="collections-carousel-btn collections-carousel-prev"
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
                    className="collections-carousel-btn collections-carousel-next"
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
        </div>
    );
};

export default PopularCollections;
