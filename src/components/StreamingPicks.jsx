/**
 * StreamingPicks - Unified component for streaming platform content sections
 * Replaces: NetflixOriginals, DisneyPlusPicks, PrimeVideoPicks, AppleTVPicks, HBOPicks, ViuPicks
 */
import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import './StreamingPicks.css';

// Genre icons for filter buttons
const GENRE_ICONS = {
    action: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>
        </svg>
    ),
    romance: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
        </svg>
    ),
    comedy: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z"></path>
            <line x1="9" x2="9.01" y1="9" y2="9"></line>
            <line x1="15" x2="15.01" y1="9" y2="9"></line>
        </svg>
    ),
    horror: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12.5 17-.5-1-.5 1h1z"></path>
            <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"></path>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
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
    }
};

// Genre IDs for movies and TV
const GENRE_IDS = {
    action: { movie: 28, tv: 10759 },
    romance: { movie: 10749, tv: 10749 },
    comedy: { movie: 35, tv: 35 },
    horror: { movie: 27, tv: 9648 }
};

const StreamingPicks = memo(({ provider = 'netflix' }) => {
    const config = PROVIDERS[provider] || PROVIDERS.netflix;
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();

    const [content, setContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(5);
    const [selectedGenre, setSelectedGenre] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fetch content based on provider and genre
    const fetchContent = async (genre = null) => {
        try {
            setLoading(true);

            const genreQueryMovie = genre && GENRE_IDS[genre] ? `&with_genres=${GENRE_IDS[genre].movie}` : '';
            const genreQueryTV = genre && GENRE_IDS[genre] ? `&with_genres=${GENRE_IDS[genre].tv}` : '';

            let allMovies = [];
            let allTV = [];

            // Special handling for Viu (multi-region fetch)
            if (config.regions) {
                for (const region of config.regions) {
                    const [moviesRes, tvRes] = await Promise.all([
                        fetch(`/api/discover/movie?with_watch_providers=${config.id}&watch_region=${region}&sort_by=popularity.desc${genreQueryMovie}`),
                        fetch(`/api/discover/tv?with_watch_providers=${config.id}&watch_region=${region}&sort_by=popularity.desc${genreQueryTV}`)
                    ]);

                    if (moviesRes.ok && tvRes.ok) {
                        const moviesData = await moviesRes.json();
                        const tvData = await tvRes.json();
                        allMovies = [...allMovies, ...(moviesData.results || [])];
                        allTV = [...allTV, ...(tvData.results || [])];
                    }

                    if (allMovies.length >= 10 || allTV.length >= 10) break;
                }

                // Deduplicate results
                const movieIds = new Set();
                allMovies = allMovies.filter(m => {
                    if (movieIds.has(m.id)) return false;
                    movieIds.add(m.id);
                    return true;
                });

                const tvIds = new Set();
                allTV = allTV.filter(t => {
                    if (tvIds.has(t.id)) return false;
                    tvIds.add(t.id);
                    return true;
                });
            } else {
                // Standard fetch for other providers
                const movieUrl = `/api/discover/movie?with_watch_providers=${config.id}&watch_region=US&sort_by=popularity.desc${genreQueryMovie}`;
                const tvUrl = `/api/discover/tv?with_watch_providers=${config.id}&watch_region=US&sort_by=popularity.desc${genreQueryTV}`;

                const [moviesRes, tvRes] = await Promise.all([
                    fetch(movieUrl),
                    fetch(tvUrl)
                ]);

                if (!moviesRes.ok || !tvRes.ok) {
                    throw new Error(`Failed to fetch ${config.name} content`);
                }

                const moviesData = await moviesRes.json();
                const tvData = await tvRes.json();
                allMovies = moviesData.results || [];
                allTV = tvData.results || [];
            }

            // Combine and interleave movies and TV shows
            const combinedContent = [];
            const maxItems = Math.max(allMovies.length, allTV.length);

            for (let i = 0; i < maxItems && combinedContent.length < 20; i++) {
                if (allMovies[i]) {
                    combinedContent.push({ ...allMovies[i], media_type: 'movie' });
                }
                if (allTV[i] && combinedContent.length < 20) {
                    combinedContent.push({ ...allTV[i], media_type: 'tv' });
                }
            }

            setContent(combinedContent);
            setCurrentIndex(0);
        } catch (err) {
            console.error(`Error fetching ${config.name} content:`, err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContent();
    }, [config.id]);

    useEffect(() => {
        fetchContent(selectedGenre);
    }, [selectedGenre]);

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

    const handleGenreClick = (genre) => {
        setSelectedGenre(selectedGenre === genre ? null : genre);
    };

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
        <div className={config.className}>
            {/* Header */}
            <div className={`${config.className}-header`} style={{ '--accent-color': config.accentColor }}>
                <div className={`${config.className}-header-left`}>
                    <div className={`${config.className}-header-accent`} style={{ backgroundColor: config.accentColor }}></div>
                    <h2 className={`${config.className}-title`}>{config.name}</h2>
                </div>

                {/* Genre Filter Buttons */}
                <div className="streaming-genre-filters">
                    {['action', 'romance', 'comedy', 'horror'].map(genre => (
                        <button
                            key={genre}
                            className={`streaming-genre-btn ${selectedGenre === genre ? 'active' : ''}`}
                            onClick={() => handleGenreClick(genre)}
                            style={{ '--accent-color': config.accentColor }}
                        >
                            {GENRE_ICONS[genre]}
                            <span className="genre-label">{genre.charAt(0).toUpperCase() + genre.slice(1)}</span>
                        </button>
                    ))}
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
                <div className="streaming-loading">
                    <div className="loading-spinner"></div>
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
                                            alt={item.title || item.name}
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
