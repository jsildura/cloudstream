import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Modal from './Modal';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import './PrimeVideoPicks.css';

const POSTER_URL = 'https://image.tmdb.org/t/p/w500';

// TMDB Genre IDs
const GENRE_IDS = {
    action: 28,
    romance: 10749,
    comedy: 35,
    horror: 27
};

// TV Genre IDs (different from movie genres in TMDB)
const TV_GENRE_IDS = {
    action: 10759, // Action & Adventure
    romance: 10749,
    comedy: 35,
    horror: 9648 // Mystery (closest to horror for TV)
};

const PrimeVideoPicks = () => {
    const navigate = useNavigate();
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
    const [content, setContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [itemsPerView, setItemsPerView] = useState(5);
    const [selectedGenre, setSelectedGenre] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fetch Prime Video content based on selected genre
    const fetchPrimeContent = async (genre = null) => {
        try {
            setLoading(true);

            // Amazon Prime Video provider ID is 9 in TMDB
            let movieUrl = '/api/discover/movie?with_watch_providers=9&watch_region=US&sort_by=popularity.desc';
            let tvUrl = '/api/discover/tv?with_watch_providers=9&watch_region=US&sort_by=popularity.desc';

            // Add genre filter if selected
            if (genre && GENRE_IDS[genre]) {
                movieUrl += `&with_genres=${GENRE_IDS[genre]}`;
                tvUrl += `&with_genres=${TV_GENRE_IDS[genre]}`;
            }

            const [moviesRes, tvRes] = await Promise.all([
                fetch(movieUrl),
                fetch(tvUrl)
            ]);

            if (!moviesRes.ok || !tvRes.ok) {
                throw new Error('Failed to fetch Prime Video content');
            }

            const moviesData = await moviesRes.json();
            const tvData = await tvRes.json();

            // Combine and interleave movies and TV shows
            const combinedContent = [];
            const maxItems = Math.max(moviesData.results?.length || 0, tvData.results?.length || 0);

            for (let i = 0; i < maxItems && combinedContent.length < 20; i++) {
                if (moviesData.results?.[i]) {
                    combinedContent.push({ ...moviesData.results[i], media_type: 'movie' });
                }
                if (tvData.results?.[i] && combinedContent.length < 20) {
                    combinedContent.push({ ...tvData.results[i], media_type: 'tv' });
                }
            }

            setContent(combinedContent);
            setCurrentIndex(0);
        } catch (err) {
            console.error('Error fetching Prime Video content:', err);
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchPrimeContent();
    }, []);

    // Fetch when genre changes
    useEffect(() => {
        fetchPrimeContent(selectedGenre);
    }, [selectedGenre]);

    // Calculate items per view based on screen width
    useEffect(() => {
        const updateItemsPerView = () => {
            const width = window.innerWidth;
            if (width >= 3840) {
                setItemsPerView(5);
            } else if (width >= 1280) {
                setItemsPerView(6);
            } else if (width >= 1024) {
                setItemsPerView(5);
            } else if (width >= 768) {
                setItemsPerView(4);
            } else if (width >= 640) {
                setItemsPerView(4);
            } else {
                setItemsPerView(3);
            }
        };

        updateItemsPerView();
        window.addEventListener('resize', updateItemsPerView);
        return () => window.removeEventListener('resize', updateItemsPerView);
    }, []);

    const maxIndex = Math.max(0, content.length - itemsPerView);

    const handlePrevious = () => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
    };

    const handleItemClick = async (item) => {
        const type = item.media_type || 'movie';
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];
        const [cast, contentRating] = await Promise.all([
            fetchCredits(type, item.id),
            fetchContentRating(type, item.id)
        ]);
        setSelectedItem({ ...item, type, genres: genreNames, cast: cast.join(', ') || 'N/A', contentRating });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedItem(null);
    };

    const handleGenreClick = (genre) => {
        setSelectedGenre(selectedGenre === genre ? null : genre);
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
        <div className="primevideo-section">
            {/* Header with Prime Video branding */}
            <div className="primevideo-header">
                <div className="primevideo-header-left">
                    <div className="primevideo-header-accent"></div>
                    <h2 className="primevideo-title">Prime Video Picks</h2>
                </div>

                {/* Genre Filter Buttons */}
                <div className="primevideo-genre-filters">
                    <button
                        className={`primevideo-genre-btn ${selectedGenre === 'action' ? 'active' : ''}`}
                        onClick={() => handleGenreClick('action')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>
                        </svg>
                        <span className="genre-label">Action</span>
                    </button>
                    <button
                        className={`primevideo-genre-btn ${selectedGenre === 'romance' ? 'active' : ''}`}
                        onClick={() => handleGenreClick('romance')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                        </svg>
                        <span className="genre-label">Romance</span>
                    </button>
                    <button
                        className={`primevideo-genre-btn ${selectedGenre === 'comedy' ? 'active' : ''}`}
                        onClick={() => handleGenreClick('comedy')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z"></path>
                            <line x1="9" x2="9.01" y1="9" y2="9"></line>
                            <line x1="15" x2="15.01" y1="9" y2="9"></line>
                        </svg>
                        <span className="genre-label">Comedy</span>
                    </button>
                    <button
                        className={`primevideo-genre-btn ${selectedGenre === 'horror' ? 'active' : ''}`}
                        onClick={() => handleGenreClick('horror')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m12.5 17-.5-1-.5 1h1z"></path>
                            <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"></path>
                            <circle cx="15" cy="12" r="1"></circle>
                            <circle cx="9" cy="12" r="1"></circle>
                        </svg>
                        <span className="genre-label">Horror</span>
                    </button>
                </div>

                <Link to="/prime-video" className="primevideo-view-all">
                    View all
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                    </svg>
                </Link>
            </div>

            {/* Carousel */}
            {loading ? (
                <div className="primevideo-loading">
                    <div className="loading-spinner"></div>
                </div>
            ) : (
                <div className="primevideo-carousel" role="region" aria-roledescription="carousel" {...swipeHandlers}>
                    <div className="primevideo-carousel-viewport">
                        <div
                            className="primevideo-carousel-track"
                            style={{ transform: `translate3d(-${translateX}%, 0px, 0px)` }}
                        >
                            {content.map((item) => (
                                <div
                                    key={`${item.media_type}-${item.id}`}
                                    className="primevideo-carousel-slide"
                                    role="group"
                                    aria-roledescription="slide"
                                >
                                    <div
                                        className="primevideo-card"
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
                                        <div className="primevideo-card-gradient"></div>
                                        <img
                                            src={item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/placeholder-poster.jpg'}
                                            alt={item.title || item.name}
                                            className="primevideo-card-image"
                                            loading="lazy"
                                        />
                                        <div className="primevideo-card-info">
                                            <h3 className="primevideo-card-title">{item.title || item.name}</h3>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Navigation buttons */}
                    <button
                        className="primevideo-carousel-btn primevideo-carousel-prev"
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
                        className="primevideo-carousel-btn primevideo-carousel-next"
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
            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
};

export default PrimeVideoPicks;
