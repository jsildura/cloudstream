import React, { useState, useRef } from 'react';
import CollectionCard from './CollectionCard';
import { popularCollections } from '../data/collectionsData';
import './PopularCollections.css';

const PopularCollections = () => {
    const carouselRef = useRef(null);

    // Drag state
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);
    const lastMouseMoveTime = useRef(0);

    const cancelMomentum = () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    };

    const momentumLoop = () => {
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
    };

    const handleMouseDown = (e) => {
        setIsDown(true);
        setIsDragging(false);
        cancelMomentum();

        setStartX(e.pageX - carouselRef.current.offsetLeft);
        setScrollLeft(carouselRef.current.scrollLeft);
        velX.current = 0;

        carouselRef.current.style.cursor = 'grabbing';
    };

    const handleMouseLeave = () => {
        setIsDown(false);
        if (carouselRef.current) carouselRef.current.style.cursor = 'grab';
        // Start momentum if velocity is present
        if (Math.abs(velX.current) > 1) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        }
    };

    const handleMouseUp = () => {
        setIsDown(false);
        if (carouselRef.current) carouselRef.current.style.cursor = 'grab';
        setTimeout(() => setIsDragging(false), 0);

        // Start momentum if velocity is present
        if (Math.abs(velX.current) > 1) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        }
    };

    const handleMouseMove = (e) => {
        if (!isDown) return;
        e.preventDefault();

        const x = e.pageX - carouselRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast factor

        // Calculate velocity
        const now = Date.now();
        lastMouseMoveTime.current = now;

        velX.current = (e.movementX) * 2;

        carouselRef.current.scrollLeft = scrollLeft - walk;

        if (Math.abs(x - startX) > 5) {
            setIsDragging(true);
        }
    };

    // Use a prevention handler for links/clicks inside if dragging
    const handleCaptureClick = (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    return (
        <div className="popular-collections">
            <h2 className="popular-collections-title">Popular Collections</h2>

            <div
                className="collections-carousel"
                ref={carouselRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onClickCapture={handleCaptureClick}
            >
                {popularCollections.map((collection) => (
                    <div
                        key={collection.id}
                        className="collections-carousel-slide"
                    >
                        <CollectionCard collection={collection} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PopularCollections;
