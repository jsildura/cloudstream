import React, { useEffect, useState, useRef } from 'react';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import usePerformance from '../../hooks/music/usePerformance';
import './DynamicBackground.css';

/**
 * Get cover image URL in high resolution
 */
const getCoverUrl = (track, size = 640) => {
    if (!track) return null;
    if (track.album?.cover) {
        return `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    }
    if (track.cover) {
        return `https://resources.tidal.com/images/${track.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    }
    return null;
};

/**
 * DynamicBackground - Animated background based on current track artwork
 * 
 * Ported from tidal-ui DynamicBackground.svelte
 * Features:
 * - Album art blur effect
 * - Gradient overlay
 * - Performance-aware rendering
 * - Smooth transitions between tracks
 */
const DynamicBackground = ({ className = '' }) => {
    const { currentTrack } = useMusicPlayer();
    const { flags } = usePerformance();
    const [currentImage, setCurrentImage] = useState(null);
    const [previousImage, setPreviousImage] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const imageRef = useRef(null);

    // Update background when track changes
    useEffect(() => {
        const newCoverUrl = getCoverUrl(currentTrack);

        if (newCoverUrl !== currentImage) {
            // Save current as previous for transition
            setPreviousImage(currentImage);
            setIsTransitioning(true);

            // Preload new image
            if (newCoverUrl) {
                const img = new Image();
                img.onload = () => {
                    setCurrentImage(newCoverUrl);
                    // End transition after animation
                    setTimeout(() => {
                        setIsTransitioning(false);
                        setPreviousImage(null);
                    }, 500);
                };
                img.src = newCoverUrl;
            } else {
                setCurrentImage(null);
                setTimeout(() => {
                    setIsTransitioning(false);
                    setPreviousImage(null);
                }, 500);
            }
        }
    }, [currentTrack, currentImage]);

    // Skip rendering if performance is low
    if (!flags.enableBlur && !flags.enableGradientAnimations) {
        return (
            <div className={`dynamic-background dynamic-background--static ${className}`}>
                <div className="dynamic-background__gradient" />
            </div>
        );
    }

    return (
        <div className={`dynamic-background ${className}`}>
            {/* Previous Image (fading out) */}
            {previousImage && isTransitioning && (
                <div
                    className="dynamic-background__image dynamic-background__image--out"
                    style={{ backgroundImage: `url(${previousImage})` }}
                />
            )}

            {/* Current Image (fading in) */}
            {currentImage && (
                <div
                    ref={imageRef}
                    className={`dynamic-background__image ${isTransitioning ? 'dynamic-background__image--in' : ''}`}
                    style={{ backgroundImage: `url(${currentImage})` }}
                />
            )}

            {/* Gradient Overlay */}
            <div className="dynamic-background__gradient" />

            {/* Animated Orbs (optional, for high performance) */}
            {flags.enableParticles && (
                <div className="dynamic-background__orbs">
                    <div className="dynamic-background__orb dynamic-background__orb--1" />
                    <div className="dynamic-background__orb dynamic-background__orb--2" />
                    <div className="dynamic-background__orb dynamic-background__orb--3" />
                </div>
            )}
        </div>
    );
};

export default DynamicBackground;
