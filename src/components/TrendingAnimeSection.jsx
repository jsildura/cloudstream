/**
 * TrendingAnimeSection - Trending anime content section with Anime Movies/Series toggle
 * Uses landscape backdrop cards matching TopTenRow style (without rank numbers)
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import Modal from './Modal';
import { useTMDB } from '../hooks/useTMDB';
import { cardBackdrop, posterAsBackdrop, cardLogo } from '../utils/images';
import { getPosterAlt } from '../utils/altTextUtils';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import './TrendingSection.css';
import CarouselControls from './CarouselControls';

// Anime type icons
const ANIME_ICONS = {
    movie: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
        </svg>
    ),
    tv: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
            <polyline points="17 2 12 7 7 2"></polyline>
        </svg>
    )
};

const TrendingAnimeSection = memo(({ onItemClick }) => {
    const {
        movieGenres,
        tvGenres,
        fetchDiscoverMovies,
        fetchDiscoverTV,
        fetchCredits,
        fetchContentRating,
        fetchItemBundle
    } = useTMDB();
    const { getPreviewProps, closeNow } = useHoverPreview();

    const [content, setContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [animeType, setAnimeType] = useState('tv');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Data enrichment state (logos & backdrops)
    const [enrichedContent, setEnrichedContent] = useState([]);
    const [, setIsEnriching] = useState(false);

    // Drag state for horizontal scroll
    const carouselRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Fetch anime content based on type
    const fetchContent = async () => {
        try {
            setLoading(true);
            let data;

            if (animeType === 'movie') {
                data = await fetchDiscoverMovies({
                    with_genres: 16,
                    with_keywords: 210024,
                    sort_by: 'popularity.desc'
                });
            } else {
                data = await fetchDiscoverTV({
                    with_genres: 16,
                    with_keywords: 210024,
                    sort_by: 'popularity.desc'
                });
            }

            setContent(data.slice(0, 20));
            setEnrichedContent([]);
            // Reset enrichment lock so the new content's enrichment effect can
            // start even if the previous run's `cancelled` cleanup suppressed
            // its `setIsEnriching(false)` in the finally block.
            setIsEnriching(false);
        } catch (err) {
            console.error('Error fetching trending anime:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContent();
    }, [animeType]);

    // Enrich content with logos and backdrops.
    // `cancelled` prevents a stale run (previous animeType) from
    // overwriting the new content or leaving isEnriching stuck at true.
    useEffect(() => {
        let cancelled = false;

        const enrichContent = async () => {
            if (!content || !content.length) return;

            setIsEnriching(true);

            try {
                const enrichedItems = await Promise.all(
                    content.map(async (item) => {
                        try {
                            const type = animeType;
                            // Bundled + cached; appended images are nested under `images`.
                            const data = await fetchItemBundle(type, item.id, ['images']);

                            const logos = data.images?.logos || [];
                            const englishLogo = logos.find(l => l.iso_639_1 === 'en') || logos[0];

                            let backdrop_path = item.backdrop_path;
                            if (!backdrop_path && data.images?.backdrops?.length) {
                                backdrop_path = data.images.backdrops[0].file_path;
                            }

                            return {
                                ...item,
                                logo_path: englishLogo?.file_path || null,
                                backdrop_path: backdrop_path || item.poster_path,
                            };
                        } catch {
                            return item;
                        }
                    })
                );

                if (!cancelled) setEnrichedContent(enrichedItems);
            } catch (error) {
                console.error('Error enriching anime content:', error);
                if (!cancelled) setEnrichedContent(content);
            } finally {
                if (!cancelled) setIsEnriching(false);
            }
        };

        enrichContent();
        return () => { cancelled = true; };
    }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

    const displayContent = enrichedContent.length > 0 ? enrichedContent : content;

    // Cleanup
    useEffect(() => {
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, []);

    // Drag handlers
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

    const handleItemClick = async (item) => {
        if (isDragging) return;
        closeNow(); // dismiss the hover preview before the modal opens

        // When a parent onItemClick is provided (e.g. Home page), delegate
        // immediately so the parent's own enrichment handles credits / rating.
        // Doing a local await here AND in the parent doubles the round-trips.
        if (onItemClick) {
            onItemClick(item);
            return;
        }

        // Internal modal path: enrich before opening since there's no parent.
        const type = animeType;
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

        const [cast, contentRating] = await Promise.all([
            fetchCredits(type, item.id),
            fetchContentRating(type, item.id)
        ]);

        const enrichedItem = {
            ...item,
            type,
            media_type: type,
            genres: genreNames,
            cast: cast.join(', ') || 'N/A',
            contentRating
        };

        setSelectedItem(enrichedItem);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedItem(null);
    };

    const handleAnimeTypeClick = (type) => {
        if (type !== animeType) {
            setAnimeType(type);
        }
    };

    return (
        <div className="trending-section" data-nav-section="trending-anime">
            {/* Header */}
            <div className="trending-section-header">
                <div className="trending-section-header-left">
                    <div className="trending-section-header-accent"></div>
                    <h2 className="trending-section-title">
                        {animeType === 'movie' ? 'Trending Anime Movies' : 'Trending Anime Series'}
                    </h2>
                    <p className="trending-section-subtitle">Animated Hits from Japan & Beyond</p>
                </div>

                {/* Anime Type Filter Buttons */}
                <div className="trending-media-filters">
                    <button
                        className={`trending-media-btn ${animeType === 'movie' ? 'active' : ''}`}
                        onClick={() => handleAnimeTypeClick('movie')}
                    >
                        {ANIME_ICONS.movie}
                        <span className="media-label">Anime Movies</span>
                    </button>
                    <button
                        className={`trending-media-btn ${animeType === 'tv' ? 'active' : ''}`}
                        onClick={() => handleAnimeTypeClick('tv')}
                    >
                        {ANIME_ICONS.tv}
                        <span className="media-label">Anime Series</span>
                    </button>
                </div>
            </div>

            {/* Carousel */}
            {loading ? (
                <div className="trending-skeleton-container">
                    <div className="trending-skeleton-track">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="trending-skeleton-slide">
                                <div className="trending-card-skeleton" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="carousel-container">
                    <div
                        className={`trending-carousel${isDragging ? ' dragging' : ''}`}
                        ref={carouselRef}
                        onMouseDown={handleMouseDown}
                        onMouseLeave={handleMouseLeave}
                        onMouseUp={handleMouseUp}
                        onMouseMove={handleMouseMove}
                    >
                    {displayContent.map((item) => {
                        const itemTitle = item.title || item.name;
                        const backdropSrc = cardBackdrop(item.backdrop_path)
                            ?? posterAsBackdrop(item.poster_path)
                            ?? '/placeholder-backdrop.jpg';
                        const logoSrc = cardLogo(item.logo_path);

                        return (
                            <div
                                key={`${animeType}-${item.id}`}
                                className="trending-card"
                                onClick={() => handleItemClick(item)}
                                {...getPreviewProps(item, animeType, isDragging, handleItemClick)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleItemClick(item);
                                    }
                                }}
                                onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}
                                tabIndex={0}
                                role="button"
                                aria-label={`Play ${itemTitle}`}
                            >
                                <div className="trending-card-backdrop">
                                    <img
                                        src={backdropSrc}
                                        alt={getPosterAlt({ ...item, media_type: animeType === 'movie' ? 'movie' : 'tv' })}
                                        loading="lazy"
                                        draggable="false"
                                    />
                                    <div className="trending-hover-overlay">
                                        <button className="trending-play-btn" tabIndex="-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Rating */}
                                    {item.vote_average > 0 && (
                                        <div className="trending-card-rating">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                            </svg>
                                            <span>{item.vote_average.toFixed(1)}</span>
                                        </div>
                                    )}

                                    {/* Logo or Title Overlay */}
                                    {logoSrc ? (
                                        <div className="trending-logo-overlay">
                                            <img
                                                src={logoSrc}
                                                alt={itemTitle}
                                                draggable="false"
                                            />
                                        </div>
                                    ) : (
                                        <div className="trending-title-overlay">
                                            <span>{itemTitle}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                    <CarouselControls carouselRef={carouselRef} />
                </div>
            )}

            {/* Modal (only if not using parent's onItemClick) */}
            {!onItemClick && isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
});

TrendingAnimeSection.displayName = 'TrendingAnimeSection';
export default TrendingAnimeSection;
