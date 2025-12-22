import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './MovieStudios.css';

const TMDB_LOGO_URL = 'https://image.tmdb.org/t/p/w500';

// TMDB Company IDs and logo paths for major studios
const STUDIOS = [
    { id: 420, name: 'Marvel Studios', logo: '/hUzeosd33nzE5MCNsZxCGEKTXaQ.png' },
    { id: 3, name: 'Pixar', logo: '/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png' },
    { id: 521, name: 'DreamWorks', logo: '/3BPX5VGBov8SDqTV7wC1L1xShAS.png' },
    { id: 41077, name: 'A24', logo: '/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png' },
    { id: 3172, name: 'Blumhouse', logo: '/kDedjRZwO8uyFhuHamomOhN6fzG.png' },
    { id: 174, name: 'Warner Bros', logo: '/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png' },
    { id: 33, name: 'Universal', logo: '/8lvHyhjr8oUKOOy2dKXoALWKdp0.png' },
    { id: 1632, name: 'Lionsgate', logo: '/logo/lionsgate.png' },
    { id: 25, name: '20th Century', logo: '/qZCc1lty5FzX30aOCVRBLzaVmcp.png' },
    { id: 4, name: 'Paramount', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Paramount_Pictures_Corporation_logo.svg/976px-Paramount_Pictures_Corporation_logo.svg.png' },
    { id: 128064, name: 'DC Studios', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/DC_Comics_logo.png/960px-DC_Comics_logo.png' },
    { id: 2348, name: 'Nickelodeon', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2009_logo.svg/1280px-Nickelodeon_2009_logo.svg.png' },
    { id: 8356, name: 'Vivamax', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Vivamax_logo.png' },
];

const MovieStudios = () => {
    const navigate = useNavigate();
    const gridRef = useRef(null);
    const [imageErrors, setImageErrors] = useState({});

    // Drag state
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);
    const lastMouseMoveTime = useRef(0);

    const handleStudioClick = (studioId) => {
        navigate(`/studio/${studioId}`);
    };

    const handleImageError = (studioId) => {
        setImageErrors(prev => ({ ...prev, [studioId]: true }));
    };

    const cancelMomentum = () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    };

    const momentumLoop = () => {
        if (!gridRef.current) return;

        // Apply velocity
        gridRef.current.scrollLeft -= velX.current;

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

        setStartX(e.pageX - gridRef.current.offsetLeft);
        setScrollLeft(gridRef.current.scrollLeft);
        velX.current = 0;

        gridRef.current.style.cursor = 'grabbing';
    };

    const handleMouseLeave = () => {
        setIsDown(false);
        if (gridRef.current) gridRef.current.style.cursor = 'grab';
        // Start momentum if velocity is present
        if (Math.abs(velX.current) > 1) {
            cancelMomentum();
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        }
    };

    const handleMouseUp = () => {
        setIsDown(false);
        if (gridRef.current) gridRef.current.style.cursor = 'grab';
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

        const x = e.pageX - gridRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast factor
        const prevScrollLeft = gridRef.current.scrollLeft;

        // Calculate velocity
        // We track the delta of the scroll position since the last frame/event
        const now = Date.now();
        const dt = now - lastMouseMoveTime.current;
        lastMouseMoveTime.current = now;

        // Simple velocity: change in x per event
        const deltaX = x - startX;

        // We need instantaneous velocity for momentum
        // But simply using the drag delta works well for approximation
        // Let's track movement delta between events
        const newScrollLeft = scrollLeft - walk;
        const moveDelta = newScrollLeft - prevScrollLeft;

        // Inverted because dragging left moves scroll right (increase), dragging right moves scroll left (decrease)
        // Actually gridRef.current.scrollLeft - prevScrollLeft gives us the actual movement applied
        // But we want the "throw" velocity. 
        // If I drag fast left, walk is negative, scrollLeft increases. 
        // Let's use simpler tracking: velocity is just the movement diff
        velX.current = (e.movementX) * 2;

        gridRef.current.scrollLeft = scrollLeft - walk;

        if (Math.abs(x - startX) > 5) {
            setIsDragging(true);
        }
    };

    return (
        <section className="movie-studios-section">
            <h2 className="movie-studios-title">Studios</h2>
            <div
                className="movie-studios-grid"
                ref={gridRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
            >
                {STUDIOS.map((studio) => (
                    <div
                        key={studio.id}
                        className="studio-card"
                        onClick={() => !isDragging && handleStudioClick(studio.id)}
                        aria-label={`Browse ${studio.name} movies`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                handleStudioClick(studio.id);
                            }
                        }}
                    >
                        {!imageErrors[studio.id] ? (
                            <img
                                src={studio.logo.startsWith('http') || studio.logo.startsWith('/logo/') ? studio.logo : `${TMDB_LOGO_URL}${studio.logo}`}
                                alt={studio.name}
                                className="studio-logo"
                                onError={() => handleImageError(studio.id)}
                                draggable="false"
                            />
                        ) : (
                            <span className="studio-name">{studio.name}</span>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
};

export default MovieStudios;
