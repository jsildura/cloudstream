/**
 * StreamingPicks - Unified component for streaming platform content sections
 * Replaces: NetflixOriginals, DisneyPlusPicks, PrimeVideoPicks, AppleTVPicks, HBOPicks, ViuPicks
 */
import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import { getPosterAlt } from '../utils/altTextUtils';
import './StreamingPicks.css';

// Media type icons for filter buttons
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

// Provider configurations
const PROVIDERS = {
    netflix: {
        id: 8,
        name: 'Netflix Originals',
        className: 'netflix-originals',
        accentColor: '#E50914',
        route: '/netflix'
    },
    disney: {
        id: 337,
        name: 'Disney+ Exclusives',
        className: 'disneyplus-section',
        accentColor: '#113CCF',
        route: '/disney'
    },
    prime: {
        id: 9,
        name: 'Prime Video',
        className: 'prime-section',
        accentColor: '#00A8E1',
        route: '/prime-video'
    },
    apple: {
        id: 350,
        name: 'Apple TV+ Originals',
        className: 'appletv-section',
        accentColor: '#000000',
        route: '/apple-tv'
    },
    hbo: {
        id: '1899|118', // Max + HBO combined
        name: 'HBO Max',
        className: 'hbo-section',
        accentColor: '#5822B4',
        route: '/hbo',
        isMultiProvider: true
    },
    viu: {
        id: 158,
        name: 'Viu Picks',
        className: 'viu-section',
        accentColor: '#FFC107',
        route: '/viu',
        regions: ['HK', 'SG', 'MY', 'PH', 'IN'] // Viu is Asia-focused
    },
    crunchyroll: {
        id: 283,
        name: 'Crunchyroll Anime',
        className: 'crunchyroll-section',
        accentColor: '#F47521',
        route: '/crunchyroll'
    },
    peacock: {
        id: 386,
        name: 'Peacock Originals',
        className: 'peacock-section',
        accentColor: '#f3f3f3',
        route: '/peacock'
    }
};

const StreamingPicks = memo(({ provider = 'netflix' }) => {
    const config = PROVIDERS[provider] || PROVIDERS.netflix;
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();

    const [content, setContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(5);
    const [mediaType, setMediaType] = useState('movie');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fetch content based on provider and media type
    const fetchContent = async (type = 'movie') => {
        try {
            setLoading(true);

            let results = [];

            // Special handling for Viu (multi-region fetch)
            if (config.regions) {
                for (const region of config.regions) {
                    const endpoint = type === 'movie' ? 'movie' : 'tv';
                    const res = await fetch(`/api/discover/${endpoint}?with_watch_providers=${config.id}&watch_region=${region}&sort_by=popularity.desc`);

                    if (res.ok) {
                        const data = await res.json();
                        results = [...results, ...(data.results || [])];
                    }

                    if (results.length >= 20) break;
                }

                // Deduplicate results
                const ids = new Set();
                results = results.filter(item => {
                    if (ids.has(item.id)) return false;
                    ids.add(item.id);
                    return true;
                });
            } else if (provider === 'peacock') {
                // Peacock Originals: Use network ID 3353 for TV shows
                let url;
                if (type === 'movie') {
                    url = `/api/discover/movie?with_watch_providers=${config.id}&watch_region=US&with_watch_monetization_types=flatrate&sort_by=popularity.desc`;
                } else {
                    url = `/api/discover/tv?with_networks=3353&sort_by=popularity.desc`;
                }

                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`Failed to fetch ${config.name} content`);
                }

                const data = await res.json();
                results = data.results || [];
            } else {
                // Standard fetch for other providers
                const endpoint = type === 'movie' ? 'movie' : 'tv';
                const url = `/api/discover/${endpoint}?with_watch_providers=${config.id}&watch_region=US&sort_by=popularity.desc`;

                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`Failed to fetch ${config.name} content`);
                }

                const data = await res.json();
                results = data.results || [];
            }

            // Add media_type to each item and limit to 20
            const contentWithType = results.slice(0, 20).map(item => ({
                ...item,
                media_type: type
            }));

            setContent(contentWithType);
            setCurrentIndex(0);
        } catch (err) {
            console.error(`Error fetching ${config.name} content:`, err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContent(mediaType);
    }, [config.id, mediaType]);

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
        const type = item.media_type || 'movie';
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

        const [cast, contentRating] = await Promise.all([
            fetchCredits(type, item.id),
            fetchContentRating(type, item.id)
        ]);

        setSelectedItem({
            ...item,
            type,
            genres: genreNames,
            cast: cast.join(', ') || 'N/A',
            contentRating
        });
        setIsModalOpen(true);
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

    return (
        <div className={config.className}>
            {/* Header */}
            <div className={`${config.className}-header`} style={{ '--accent-color': config.accentColor }}>
                <div className={`${config.className}-header-left`}>
                    <div className={`${config.className}-header-accent`} style={{ backgroundColor: config.accentColor }}></div>
                    <h2 className={`${config.className}-title`}>{config.name}</h2>
                </div>

                {/* Media Type Filter Buttons */}
                <div className="streaming-media-filters">
                    <button
                        className={`streaming-media-btn ${mediaType === 'movie' ? 'active' : ''}`}
                        onClick={() => handleMediaTypeClick('movie')}
                        style={{ '--accent-color': config.accentColor }}
                    >
                        {MEDIA_ICONS.movie}
                        <span className="media-label">Movie</span>
                    </button>
                    <button
                        className={`streaming-media-btn ${mediaType === 'tv' ? 'active' : ''}`}
                        onClick={() => handleMediaTypeClick('tv')}
                        style={{ '--accent-color': config.accentColor }}
                    >
                        {MEDIA_ICONS.tv}
                        <span className="media-label">TV Show</span>
                    </button>
                </div>

                <Link to={config.route} className={`${config.className}-view-all`}>
                    View all
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                    </svg>
                </Link>
            </div>

            {/* Carousel */}
            {loading ? (
                <div className="streaming-skeleton-container">
                    <div className="streaming-skeleton-track">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="streaming-skeleton-slide">
                                <div className="streaming-card-skeleton" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="streaming-carousel" role="region" aria-roledescription="carousel" {...swipeHandlers}>
                    <div className="streaming-carousel-viewport">
                        <div
                            className="streaming-carousel-track"
                            style={{ transform: `translate3d(-${translateX}%, 0px, 0px)` }}
                        >
                            {content.map((item) => (
                                <div
                                    key={`${item.media_type}-${item.id}`}
                                    className="streaming-carousel-slide"
                                    role="group"
                                    aria-roledescription="slide"
                                >
                                    <div
                                        className="streaming-card"
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
                                        style={{ '--accent-color': config.accentColor }}
                                    >
                                        <div className="streaming-card-gradient"></div>
                                        <img
                                            src={item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/placeholder-poster.jpg'}
                                            alt={getPosterAlt(item)}
                                            className="streaming-card-image"
                                            loading="lazy"
                                        />
                                        <div className="streaming-card-info">
                                            <h3 className="streaming-card-title">{item.title || item.name}</h3>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Navigation buttons */}
                    <button
                        className="streaming-carousel-btn streaming-carousel-prev"
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
                        className="streaming-carousel-btn streaming-carousel-next"
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

            {/* Modal */}
            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
});

StreamingPicks.displayName = 'StreamingPicks';
export default StreamingPicks;
