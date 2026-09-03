import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import useTVDetect from '../hooks/useTVDetect';
import Modal from './Modal';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { cardBackdrop, cardLogo } from '../utils/images';
import './StreamingProviders.css';
import CarouselControls from './CarouselControls';

const TMDB_LOGO_URL = 'https://image.tmdb.org/t/p/w500';

// TMDB watch provider IDs + official provider logo paths
const PROVIDERS = [
    { id: 8, name: 'Netflix', logo: '/wwemzKWzjKYJFfCeiB57q3r4Bcm.png', accentColor: '#E50914', route: '/netflix' },
    { id: 337, name: 'Disney+', logo: '/1edZOYAfoyZyZ3rklNSiUpXX30Q.png', accentColor: '#113CCF', route: '/disney' },
    { id: 9, name: 'Prime Video', logo: '/w7HfLNm9CWwRmAMU58udl2L7We7.png', accentColor: '#00A8E1', route: '/prime-video' },
    { id: 350, name: 'Apple TV+', logo: '/bngHRFi794mnMq34gfVcm9nDxN1.png', accentColor: '#000000', route: '/apple-tv' },
    { id: '1899|118', name: 'HBO Max', logo: '/nmU0UMDJB3dRRQSTUqawzF2Od1a.png', accentColor: '#5822B4', route: '/hbo' },
    { id: 158, name: 'Viu', logo: '/vYMTH0Cz13Dxu4DPKNtYlWF8zxL.png', accentColor: '#FFC107', route: '/viu', regions: ['HK', 'SG', 'MY', 'PH', 'IN'] },
    { id: 283, name: 'Crunchyroll', logo: '/qqyXcZlJQKlRmAD1TCKV7mGLQlt.png', accentColor: '#F47521', route: '/crunchyroll' },
    { id: 386, name: 'Peacock', logo: '/gIAcGTjKKr0KOHL5s4O36roJ8p7.png', accentColor: '#f3f3f3', route: '/peacock', tvNetwork: 3353 },
];

const StreamingProviders = () => {
    const navigate = useNavigate();
    const sectionRef = useRef(null);
    const scrollAnchorPosRef = useRef(null);
    const lastInteractionTimeRef = useRef(0);
    const gridRef = useRef(null);
    const moviesGridRef = useRef(null);
    const [imageErrors, setImageErrors] = useState({});
    const { fetchDiscoverMovies, fetchDiscoverTV, movieGenres, fetchCredits, fetchContentRating, fetchLogo } = useTMDB();
    const { getPreviewProps, closeNow } = useHoverPreview();

    // Selected provider state - default to Netflix
    const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0]);
    const [providerMovies, setProviderMovies] = useState([]);
    const [isLoadingMovies, setIsLoadingMovies] = useState(false);
    const [movieLogos, setMovieLogos] = useState({});
    const [mediaType, setMediaType] = useState('movie'); // 'movie' or 'tv'

    // Modal state
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Drag state
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Momentum state
    const velX = useRef(0);
    const animationFrameId = useRef(null);

    // Grid states
    const isTVMode = useTVDetect();
    const movieCardRefs = useRef([]);
    const touchEndTimeoutRef = useRef(null);

    // Core state for movies grid navigation
    const [focusedMovieIndex, setFocusedMovieIndex] = useState(0);
    const [moviesInteractionState, setMoviesInteractionState] = useState({
        isPaused: false,
        isKeyboardNav: false,
        isTouching: false
    });

    // Fetch content when provider or media type changes
    useEffect(() => {
        const fetchProviderContent = async () => {
            if (!selectedProvider) {
                setProviderMovies([]);
                return;
            }

            setIsLoadingMovies(true);
            try {
                const fetchDiscover = mediaType === 'movie' ? fetchDiscoverMovies : fetchDiscoverTV;
                let results = [];

                if (selectedProvider.regions) {
                    // Asia-focused providers need a multi-region sweep
                    for (const region of selectedProvider.regions) {
                        const regionResults = await fetchDiscover({
                            with_watch_providers: selectedProvider.id,
                            watch_region: region,
                            sort_by: 'popularity.desc',
                            page: 1
                        });
                        results = [...results, ...regionResults];
                        if (results.length >= 20) break;
                    }

                    // Deduplicate across regions
                    const seen = new Set();
                    results = results.filter(item => {
                        if (seen.has(item.id)) return false;
                        seen.add(item.id);
                        return true;
                    });
                } else if (mediaType === 'tv' && selectedProvider.tvNetwork) {
                    // Originals are more reliably found by network than by provider
                    results = await fetchDiscover({
                        with_networks: selectedProvider.tvNetwork,
                        sort_by: 'popularity.desc',
                        page: 1
                    });
                } else {
                    results = await fetchDiscover({
                        with_watch_providers: selectedProvider.id,
                        watch_region: 'US',
                        sort_by: 'popularity.desc',
                        page: 1
                    });
                }

                const topMovies = results.slice(0, 10);
                setProviderMovies(topMovies);
                if (moviesGridRef.current) {
                    moviesGridRef.current.scrollTo({ left: 0, behavior: 'instant' });
                }

                // Fetch logos for all items in parallel
                const logoPromises = topMovies.map(item =>
                    fetchLogo(mediaType, item.id).then(logo => ({ id: item.id, logo }))
                );
                const logoResults = await Promise.all(logoPromises);
                const logosMap = {};
                logoResults.forEach(({ id, logo }) => {
                    if (logo) logosMap[id] = logo;
                });
                setMovieLogos(logosMap);
            } catch (error) {
                console.error('Failed to fetch provider content:', error);
                setProviderMovies([]);
            } finally {
                setIsLoadingMovies(false);
            }
        };

        fetchProviderContent();
    }, [selectedProvider, fetchDiscoverMovies, fetchDiscoverTV, fetchLogo, mediaType]);

    const handleProviderClick = (provider) => {
        if (sectionRef.current) {
            const rect = sectionRef.current.getBoundingClientRect();
            scrollAnchorPosRef.current = {
                sectionTop: rect.top,
                scrollY: window.scrollY
            };
            lastInteractionTimeRef.current = Date.now();
        }

        if (selectedProvider?.id === provider.id) {
            // Toggle off if clicking the same provider
            setSelectedProvider(null);
            setProviderMovies([]);
            setIsLoadingMovies(false);
        } else {
            setIsLoadingMovies(true);
            setSelectedProvider(provider);
        }
    };

    const handleMediaTypeChange = (type) => {
        if (type !== mediaType) {
            setIsLoadingMovies(true);
            setMediaType(type);
        }
    };

    const handleMovieClick = async (movie) => {
        closeNow(800); // dismiss the hover preview before the modal opens
        const genreNames = movie.genre_ids?.map(id => movieGenres.get(id)).filter(Boolean) || [];
        const [cast, contentRating] = await Promise.all([
            fetchCredits(mediaType, movie.id),
            fetchContentRating(mediaType, movie.id)
        ]);
        setSelectedItem({
            ...movie,
            type: mediaType,
            media_type: mediaType,
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

    const handleImageError = (providerId) => {
        setImageErrors(prev => ({ ...prev, [providerId]: true }));
    };

    const cancelMomentum = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }, []);

    const momentumLoop = useCallback(() => {
        if (!gridRef.current || isTVMode) return;

        // Apply velocity
        gridRef.current.scrollLeft -= velX.current;

        // Decay velocity
        velX.current *= 0.95; // Friction factor

        if (Math.abs(velX.current) > 0.5) {
            animationFrameId.current = requestAnimationFrame(momentumLoop);
        } else {
            animationFrameId.current = null;
        }
    }, [isTVMode]);

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

        velX.current = (e.movementX) * 2;

        gridRef.current.scrollLeft = scrollLeft - walk;

        if (Math.abs(x - startX) > 5) {
            setIsDragging(true);
        }
    };

    // Clean up pending animation frames / timeouts on unmount
    useEffect(() => {
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current);
        };
    }, []);

    // Movies grid drag handlers
    const [moviesIsDown, setMoviesIsDown] = useState(false);
    const [moviesStartX, setMoviesStartX] = useState(0);
    const [moviesScrollLeft, setMoviesScrollLeft] = useState(0);
    const [moviesIsDragging, setMoviesIsDragging] = useState(false);

    const handleMoviesMouseDown = (e) => {
        if (!moviesGridRef.current) return;
        setMoviesIsDown(true);
        setMoviesIsDragging(false);
        setMoviesStartX(e.pageX - moviesGridRef.current.offsetLeft);
        setMoviesScrollLeft(moviesGridRef.current.scrollLeft);
        moviesGridRef.current.style.cursor = 'grabbing';
    };

    const handleMoviesMouseLeave = () => {
        setMoviesIsDown(false);
        if (moviesGridRef.current) moviesGridRef.current.style.cursor = 'grab';
    };

    const handleMoviesMouseUp = () => {
        setMoviesIsDown(false);
        if (moviesGridRef.current) moviesGridRef.current.style.cursor = 'grab';
        setTimeout(() => setMoviesIsDragging(false), 0);
    };

    const handleMoviesMouseMove = (e) => {
        if (!moviesIsDown || !moviesGridRef.current) return;
        e.preventDefault();

        const x = e.pageX - moviesGridRef.current.offsetLeft;
        const walk = (x - moviesStartX) * 2;
        moviesGridRef.current.scrollLeft = moviesScrollLeft - walk;

        if (Math.abs(x - moviesStartX) > 5) {
            setMoviesIsDragging(true);
        }
    };

    const handleMoviesMouseEnter = useCallback(() => {
        setMoviesInteractionState(prev => ({ ...prev, isPaused: true, isKeyboardNav: false }));
    }, []);

    const handleMoviesTouchStart = useCallback(() => {
        if (touchEndTimeoutRef.current) {
            clearTimeout(touchEndTimeoutRef.current);
            touchEndTimeoutRef.current = null;
        }
        setMoviesInteractionState(prev => ({ ...prev, isTouching: true, isPaused: true, isKeyboardNav: false }));
    }, []);

    const handleMoviesTouchEnd = useCallback(() => {
        touchEndTimeoutRef.current = setTimeout(() => {
            setMoviesInteractionState(prev => ({ ...prev, isTouching: false, isPaused: false }));
            touchEndTimeoutRef.current = null;
        }, 500);
    }, []);

    const handleMovieCardFocus = useCallback((index) => {
        setMoviesInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
        setFocusedMovieIndex(index);
        if (moviesGridRef.current && movieCardRefs.current[index]) {
            const container = moviesGridRef.current;
            const card = movieCardRefs.current[index];
            const cardLeft = card.offsetLeft;
            const cardWidth = card.offsetWidth;
            const containerWidth = container.clientWidth;
            container.scrollTo({
                left: cardLeft - (containerWidth / 2) + (cardWidth / 2),
                behavior: 'smooth'
            });
        }
    }, []);

    const handleMovieKeyDown = useCallback((e, index) => {
        const itemsLength = providerMovies?.length || 0;
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                if (index > 0) {
                    setMoviesInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
                    setFocusedMovieIndex(index - 1);
                    movieCardRefs.current[index - 1]?.focus();
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (index < itemsLength - 1) {
                    setMoviesInteractionState(prev => ({ ...prev, isKeyboardNav: true, isPaused: true }));
                    setFocusedMovieIndex(index + 1);
                    movieCardRefs.current[index + 1]?.focus();
                }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (providerMovies?.[index]) handleMovieClick(providerMovies[index]);
                break;
            default:
                break;
        }
    }, [providerMovies]);

    return (
        <>
            <section ref={sectionRef} className="streaming-providers-section" data-nav-section="streaming-providers">
                <div className="streaming-providers-header">
                    <h2 className="streaming-providers-title">Streaming Providers</h2>
                    <p className="streaming-providers-subtitle">Find shows and movies from your favorite streaming services</p>
                </div>
                <div
                    className="streaming-providers-grid"
                    ref={gridRef}
                    onMouseDown={handleMouseDown}
                    onMouseLeave={handleMouseLeave}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                >
                    {PROVIDERS.map((provider) => (
                        <div
                            key={provider.id}
                            className={`provider-pill ${selectedProvider?.id === provider.id ? 'provider-pill-active' : ''}`}
                            onClick={() => !isDragging && handleProviderClick(provider)}
                            aria-label={`Browse ${provider.name} movies`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleProviderClick(provider);
                                }
                            }}
                        >
                            {!imageErrors[provider.id] ? (
                                <img
                                    src={provider.logo.startsWith('http') || provider.logo.startsWith('/logo/') ? provider.logo : `${TMDB_LOGO_URL}${provider.logo}`}
                                    alt={provider.name}
                                    className="provider-pill-logo"
                                    onError={() => handleImageError(provider.id)}
                                    draggable="false"
                                />
                            ) : (
                                <span className="provider-pill-name">{provider.name}</span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Provider Content Section */}
                {selectedProvider && (
                    <div className="provider-movies-section">
                        <div className="provider-movies-header">
                            <div className="provider-movies-header-left">
                                <div
                                    className="provider-movies-header-accent"
                                    style={{ backgroundColor: '#E50914' }}
                                />
                                <h3 className="provider-movies-title">
                                    Top {mediaType === 'movie' ? 'Movies' : 'TV Shows'} from {selectedProvider.name}
                                </h3>
                            </div>
                            <div className="provider-movies-controls">
                                <div className="streaming-media-filters">
                                    <button
                                        className={`streaming-media-btn ${mediaType === 'movie' ? 'active' : ''}`}
                                        onClick={() => handleMediaTypeChange('movie')}
                                        style={{ '--accent-color': '#e50914' }}
                                    >
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
                                        <span className="media-label">Movie</span>
                                    </button>
                                    <button
                                        className={`streaming-media-btn ${mediaType === 'tv' ? 'active' : ''}`}
                                        onClick={() => handleMediaTypeChange('tv')}
                                        style={{ '--accent-color': '#e50914' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                                            <polyline points="17 2 12 7 7 2"></polyline>
                                        </svg>
                                        <span className="media-label">TV Show</span>
                                    </button>
                                </div>
                                <button
                                    className="provider-movies-view-all"
                                    onClick={() => navigate(selectedProvider.route)}
                                >
                                    View all
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className={`carousel-container ${isLoadingMovies ? 'is-loading' : ''}`}>
                            <div
                                className="provider-movies-grid"
                                ref={moviesGridRef}
                                onMouseEnter={handleMoviesMouseEnter}
                                onMouseLeave={handleMoviesMouseLeave}
                                onMouseDown={handleMoviesMouseDown}
                                onMouseUp={handleMoviesMouseUp}
                                onMouseMove={handleMoviesMouseMove}
                                onTouchStart={handleMoviesTouchStart}
                                onTouchEnd={handleMoviesTouchEnd}
                            >
                                {isLoadingMovies ? (
                                    [...Array(6)].map((_, i) => (
                                        <div key={i} className="provider-movie-card-skeleton" />
                                    ))
                                ) : providerMovies.length > 0 ? (
                                    providerMovies.map((movie, index) => {
                                    const { isPaused, isKeyboardNav } = moviesInteractionState;
                                    const isFocused = (isKeyboardNav || !isPaused) && focusedMovieIndex === index;
                                    // Logos are fetched into a side map keyed by id, so fold the
                                    // path back onto the item before handing it to the preview.
                                    // The preview seeds from `item.logo_path` and only falls back
                                    // to a network fetch when it is missing — without this it
                                    // re-fetches a logo this row already has, and the logo lands
                                    // a beat after the card opens.
                                    const previewMovie = movieLogos[movie.id]
                                        ? { ...movie, logo_path: movieLogos[movie.id] }
                                        : movie;

                                    return (
                                        <div
                                            key={movie.id}
                                            ref={el => movieCardRefs.current[index] = el}
                                            className={`provider-movie-card${isFocused ? ' focused' : ''}`}
                                            onClick={() => !moviesIsDragging && handleMovieClick(movie)}
                                            {...getPreviewProps(previewMovie, mediaType, moviesIsDragging, handleMovieClick)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => handleMovieKeyDown(e, index)}
                                            onFocus={() => handleMovieCardFocus(index)}
                                        >
                                            <div className="provider-movie-backdrop">
                                                {movie.backdrop_path ? (
                                                    <img
                                                        src={cardBackdrop(movie.backdrop_path)}
                                                        alt={movie.name || movie.title}
                                                        draggable="false"
                                                    />
                                                ) : (
                                                    <div className="provider-movie-no-backdrop">
                                                        <span>{movie.name || movie.title}</span>
                                                    </div>
                                                )}
                                                {movie.vote_average > 0 && (
                                                    <div className="provider-movie-rating">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star">
                                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                                        </svg>
                                                        <span>{movie.vote_average.toFixed(1)}</span>
                                                    </div>
                                                )}
                                                <div className="provider-movie-hover-overlay">
                                                    <button className="provider-movie-play-btn" tabIndex="-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                            <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="provider-movie-rank">{index + 1}</div>
                                                {movieLogos[movie.id] ? (
                                                    <div className="provider-movie-logo-overlay">
                                                        <img
                                                            src={cardLogo(movieLogos[movie.id])}
                                                            alt={movie.name || movie.title}
                                                            draggable="false"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="provider-movie-title-overlay">
                                                        {(() => {
                                                            const title = movie.name || movie.title || '';
                                                            const words = title.split(' ');
                                                            if (words.length === 1) {
                                                                return <span className="provider-movie-title-last">{words[0]}</span>;
                                                            }
                                                            const lastWord = words.pop();
                                                            return (
                                                                <>
                                                                    <span>{words.join(' ')}</span>
                                                                    <span>&nbsp;</span>
                                                                    <span className="provider-movie-title-last">{lastWord}</span>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                                ) : (
                                    <div className="provider-movies-empty">
                                        No {mediaType === 'movie' ? 'movies' : 'TV shows'} found for this provider
                                    </div>
                                )}
                            </div>
                            {providerMovies.length > 0 && <CarouselControls carouselRef={moviesGridRef} />}
                        </div>
                    </div>
                )}
            </section>

            {/* Modal */}
            {
                isModalOpen && selectedItem && (
                    <Modal item={selectedItem} onClose={closeModal} />
                )
            }
        </>
    );
};

export default StreamingProviders;
