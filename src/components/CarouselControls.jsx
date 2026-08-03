import React, { useState, useEffect, useCallback } from 'react';
import './CarouselControls.css';

const CarouselControls = ({ carouselRef }) => {
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(true);

    const checkScroll = useCallback(() => {
        if (!carouselRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
        setShowLeft(scrollLeft > 0);
        // Add a small buffer (e.g., 5px) to account for rounding errors
        setShowRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 5);
    }, [carouselRef]);

    useEffect(() => {
        const ref = carouselRef.current;
        if (ref) {
            ref.addEventListener('scroll', checkScroll);
            window.addEventListener('resize', checkScroll);
            
            const observer = new MutationObserver(checkScroll);
            observer.observe(ref, { childList: true, subtree: true, characterData: true });

            // Initial check with delay to allow rendering
            setTimeout(checkScroll, 100);

            return () => {
                ref.removeEventListener('scroll', checkScroll);
                window.removeEventListener('resize', checkScroll);
                observer.disconnect();
            };
        }
    }, [carouselRef, checkScroll]);

    const scroll = (direction) => {
        if (!carouselRef.current) return;
        const { clientWidth } = carouselRef.current;
        const scrollAmount = clientWidth * 0.75;
        
        carouselRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    };

    return (
        <>
            <button 
                className={`carousel-control-btn left ${showLeft ? 'visible' : ''}`}
                onClick={() => scroll('left')}
                aria-label="Scroll left"
            >
                <div className="control-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </div>
            </button>
            <button 
                className={`carousel-control-btn right ${showRight ? 'visible' : ''}`}
                onClick={() => scroll('right')}
                aria-label="Scroll right"
            >
                <div className="control-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            </button>
        </>
    );
};

export default CarouselControls;
