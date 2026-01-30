/**
 * TrendingSection - Unified trending content section with Movie/TV toggle
 * Replaces the old trending-side-by-side layout with a Netflix Originals style UI
 */
import React, { useState, useEffect, memo } from 'react';
import Modal from './Modal';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import { getPosterAlt } from '../utils/altTextUtils';
import './TrendingSection.css';

// Media type icons
const MEDIA_ICONS = {
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

const POSTER_URL = 'https://image.tmdb.org/t/p/w500';

const TrendingSection = memo(({ timeWindow = 'week', onItemClick }) => {
    const { movieGenres, tvGenres, fetchTrending, fetchCredits, fetchContentRating } = useTMDB();

    const [content, setContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(6);
    const [mediaType, setMediaType] = useState('movie');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fetch content based on media type and time window
    const fetchContent = async () => {
        try {
            setLoading(true);
            const data = await fetchTrending(mediaType, timeWindow);
            setContent(data.slice(0, 20));
            setCurrentIndex(0);
        } catch (err) {
            console.error('Error fetching trending content:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContent();
    }, [mediaType, timeWindow]);

    // Responsive items per view
    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) setItemsPerView(5);
            else if (width >= 1280) setItemsPerView(6);
            else if (width >= 1024) setItemsPerView(5);
            else if (width >= 768) setItemsPerView(4);
            else if (width >= 640) setItemsPerView(4);
            else setItemsPerView(3);
        };

        updateItemsPerView();
        window.addEventListener('resize', updateItemsPerView);
        return () => window.removeEventListener('resize', updateItemsPerView);
    }, []);

    const maxIndex = Math.max(0, content.length - itemsPerView);
    const translateX = currentIndex * (100 / itemsPerView);

    const handlePrevious = () => setCurrentIndex(prev => Math.max(0, prev - 1));
    const handleNext = () => setCurrentIndex(prev => Math.min(maxIndex, prev + 1));

    const handleItemClick = async (item) => {
        const type = mediaType;
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

        // Use parent's onItemClick if provided, otherwise handle internally
        if (onItemClick) {
            onItemClick(enrichedItem);
        } else {
            setSelectedItem(enrichedItem);
            setIsModalOpen(true);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedItem(null);
    };

    const handleMediaTypeClick = (type) => {
        if (type !== mediaType) {
            setMediaType(type);
        }
    };

    const swipeHandlers = useSwipe({
        onSwipe: (itemsToMove) => {
            setCurrentIndex(prev => {
                const newIndex = prev + itemsToMove;
                return Math.max(0, Math.min(maxIndex, newIndex));
            });
        },
        threshold: 50,
        itemsPerSwipe: itemsPerView
    });

    const mediaLabel = mediaType === 'movie' ? 'Movies' : 'TV Shows';
    const timeLabel = timeWindow === 'day' ? 'Today' : 'This Week';
    const title = `Trending ${mediaLabel} ${timeLabel}`;
    const subtitle = timeWindow === 'day' ? "Watch the Best Today" : "Weekly Highlights";

    return (
        <div className="trending-section" aria-live="polite" aria-busy={loading}>
            {/* Header */}
            <div className="trending-section-header">
                <div className="trending-section-header-left">
                    <h2 className="trending-section-title">{title}</h2>
                    <p className="trending-section-subtitle">{subtitle}</p>
                </div>

                {/* Media Type Filter Buttons */}
                <div className="trending-media-filters">
                    <button
                        className={`trending-media-btn ${mediaType === 'movie' ? 'active' : ''}`}
                        onClick={() => handleMediaTypeClick('movie')}
                    >
                        {MEDIA_ICONS.movie}
                        <span className="media-label">Movies</span>
                    </button>
                    <button
                        className={`trending-media-btn ${mediaType === 'tv' ? 'active' : ''}`}
                        onClick={() => handleMediaTypeClick('tv')}
                    >
                        {MEDIA_ICONS.tv}
                        <span className="media-label">TV Shows</span>
                    </button>
                </div>
            </div>

            {/* Carousel */}
            {loading ? (
                <div className="trending-skeleton-container">
                    <div className="trending-skeleton-track">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="trending-skeleton-slide">
                                <div className="trending-card-skeleton" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="trending-carousel" role="region" aria-roledescription="carousel" {...swipeHandlers}>
                    <div className="trending-carousel-viewport">
                        <div
                            className="trending-carousel-track"
                            style={{ transform: `translate3d(-${translateX}%, 0px, 0px)` }}
                        >
                            {content.map((item) => (
                                <div
                                    key={`${mediaType}-${item.id}`}
                                    className="trending-carousel-slide"
                                    role="group"
                                    aria-roledescription="slide"
                                >
                                    <div
                                        className="trending-card"
                                        onClick={() => handleItemClick(item)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleItemClick(item);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Play ${item.title || item.name}`}
                                    >
                                        <div className="trending-card-gradient"></div>
                                        <img
                                            src={item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/placeholder-poster.jpg'}
                                            alt={getPosterAlt({ ...item, media_type: mediaType })}
                                            className="trending-card-image"
                                            loading="lazy"
                                        />
                                        <div className="trending-hover-overlay">
                                            <button className="trending-play-btn" tabIndex="-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                                </svg>
                                            </button>
                                        </div>
                                        {item.vote_average > 0 && (
                                            <div className="trending-card-rating">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                                </svg>
                                                <span>{item.vote_average.toFixed(1)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Navigation buttons */}
                    <button
                        className="trending-carousel-btn trending-carousel-prev"
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
                        className="trending-carousel-btn trending-carousel-next"
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
            )}

            {/* Modal (only if not using parent's onItemClick) */}
            {!onItemClick && isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
});

TrendingSection.displayName = 'TrendingSection';
export default TrendingSection;
