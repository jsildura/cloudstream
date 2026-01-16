import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import Modal from './Modal';
import './MovieStudios.css';

const TMDB_LOGO_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/w780';

// TMDB Company IDs and logo paths for major studios
const STUDIOS = [
    { id: 420, name: 'Marvel Studios', logo: '/hUzeosd33nzE5MCNsZxCGEKTXaQ.png', accentColor: '#E62429' },
    { id: 3, name: 'Pixar', logo: '/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png', accentColor: '#1B9CAF' },
    { id: 521, name: 'DreamWorks', logo: '/logo/dreamworks.png', accentColor: '#1963ae' },
    { id: 41077, name: 'A24', logo: '/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png', accentColor: '#FFFFFF' },
    { id: 3172, name: 'Blumhouse', logo: '/kDedjRZwO8uyFhuHamomOhN6fzG.png', accentColor: '#b0ff26' },
    { id: 174, name: 'Warner Bros', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Warner_Bros._2023_%28horizontal%29.svg/2560px-Warner_Bros._2023_%28horizontal%29.svg.png', accentColor: '#0045B3' },
    { id: 33, name: 'Universal', logo: '/8lvHyhjr8oUKOOy2dKXoALWKdp0.png', accentColor: '#939598' },
    { id: 1632, name: 'Lionsgate', logo: '/logo/lionsgate.png', accentColor: '#E0A922' },
    { id: 25, name: '20th Century', logo: '/qZCc1lty5FzX30aOCVRBLzaVmcp.png', accentColor: '#D4AA00' },
    { id: 4, name: 'Paramount', logo: '/logo/Paramount.png', accentColor: '#00609B' },
    { id: 128064, name: 'DC Studios', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/DC_Comics_logo.png/960px-DC_Comics_logo.png', accentColor: '#0476F2' },
    { id: 2348, name: 'Nickelodeon', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2009_logo.svg/1280px-Nickelodeon_2009_logo.svg.png', accentColor: '#EA6007' },
    { id: 8356, name: 'Vivamax', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Vivamax_logo.png', accentColor: '#E4AC06' },
];

const MovieStudios = () => {
    const navigate = useNavigate();
    const gridRef = useRef(null);
    const moviesGridRef = useRef(null);
    const [imageErrors, setImageErrors] = useState({});
    const { fetchDiscoverMovies, fetchDiscoverTV, movieGenres, fetchCredits, fetchContentRating, fetchLogo, LOGO_URL } = useTMDB();

    // Selected studio state - default to Marvel Studios
    const [selectedStudio, setSelectedStudio] = useState(STUDIOS[0]);
    const [studioMovies, setStudioMovies] = useState([]);
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
    const lastMouseMoveTime = useRef(0);

    // Fetch movies when studio is selected
    useEffect(() => {
        const fetchStudioMovies = async () => {
            if (!selectedStudio) {
                setStudioMovies([]);
                return;
            }

            setIsLoadingMovies(true);
            try {
                let movies = [];
                if (mediaType === 'movie') {
                    movies = await fetchDiscoverMovies({
                        with_companies: selectedStudio.id,
                        sort_by: 'popularity.desc',
                        page: 1
                    });
                } else {
                    movies = await fetchDiscoverTV({
                        with_companies: selectedStudio.id,
                        sort_by: 'popularity.desc',
                        page: 1
                    });
                }

                const topMovies = movies.slice(0, 10);
                setStudioMovies(topMovies);

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
                console.error('Failed to fetch studio content:', error);
                setStudioMovies([]);
            } finally {
                setIsLoadingMovies(false);
            }
        };

        fetchStudioMovies();
    }, [selectedStudio, fetchDiscoverMovies, fetchDiscoverTV, fetchLogo, mediaType]);

    const handleStudioClick = (studio) => {
        if (selectedStudio?.id === studio.id) {
            // Toggle off if clicking the same studio
            setSelectedStudio(null);
        } else {
            setSelectedStudio(studio);
        }
    };

    const handleMovieClick = async (movie) => {
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

        velX.current = (e.movementX) * 2;

        gridRef.current.scrollLeft = scrollLeft - walk;

        if (Math.abs(x - startX) > 5) {
            setIsDragging(true);
        }
    };

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

    return (
        <>
            <section className="movie-studios-section">
                <div className="movie-studios-header">
                    <h2 className="movie-studios-title">Studios</h2>
                    <p className="movie-studios-subtitle">Find shows and movies from your favorite studios</p>
                </div>
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
                            className={`studio-pill ${selectedStudio?.id === studio.id ? 'studio-pill-active' : ''}`}
                            onClick={() => !isDragging && handleStudioClick(studio)}
                            aria-label={`Browse ${studio.name} movies`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleStudioClick(studio);
                                }
                            }}
                        >
                            {!imageErrors[studio.id] ? (
                                <img
                                    src={studio.logo.startsWith('http') || studio.logo.startsWith('/logo/') ? studio.logo : `${TMDB_LOGO_URL}${studio.logo}`}
                                    alt={studio.name}
                                    className="studio-pill-logo"
                                    onError={() => handleImageError(studio.id)}
                                    draggable="false"
                                />
                            ) : (
                                <span className="studio-pill-name">{studio.name}</span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Studio Movies Section */}
                {selectedStudio && (
                    <div className="studio-movies-section">
                        <div className="studio-movies-header">
                            <div className="studio-movies-header-left">
                                <div
                                    className="studio-movies-header-accent"
                                    style={{ backgroundColor: '#E50914' }}
                                />
                                <h3 className="studio-movies-title">
                                    Top {mediaType === 'movie' ? 'Movies' : 'TV Shows'} from {selectedStudio.name}
                                </h3>
                            </div>
                            <div className="studio-movies-controls">
                                <div className="streaming-media-filters">
                                    <button
                                        className={`streaming-media-btn ${mediaType === 'movie' ? 'active' : ''}`}
                                        onClick={() => setMediaType('movie')}
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
                                        onClick={() => setMediaType('tv')}
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
                                    className="studio-movies-view-all"
                                    onClick={() => navigate(`/studio/${selectedStudio.id}`)}
                                >
                                    View all
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        {isLoadingMovies ? (
                            <div className="studio-movies-loading">
                                <div className="studio-movies-skeleton">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="studio-movie-card-skeleton" />
                                    ))}
                                </div>
                            </div>
                        ) : studioMovies.length > 0 ? (
                            <div
                                className="studio-movies-grid"
                                ref={moviesGridRef}
                                onMouseDown={handleMoviesMouseDown}
                                onMouseLeave={handleMoviesMouseLeave}
                                onMouseUp={handleMoviesMouseUp}
                                onMouseMove={handleMoviesMouseMove}
                            >
                                {studioMovies.map((movie, index) => (
                                    <div
                                        key={movie.id}
                                        className="studio-movie-card"
                                        onClick={() => !moviesIsDragging && handleMovieClick(movie)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                handleMovieClick(movie);
                                            }
                                        }}
                                    >
                                        <div className="studio-movie-backdrop">
                                            {movie.backdrop_path ? (
                                                <img
                                                    src={`${BACKDROP_URL}${movie.backdrop_path}`}
                                                    alt={movie.name || movie.title}
                                                    draggable="false"
                                                />
                                            ) : (
                                                <div className="studio-movie-no-backdrop">
                                                    <span>{movie.name || movie.title}</span>
                                                </div>
                                            )}
                                            <div className="studio-movie-rank">{index + 1}</div>
                                            {movieLogos[movie.id] && (
                                                <div className="studio-movie-logo-overlay">
                                                    <img
                                                        src={`${LOGO_URL}${movieLogos[movie.id]}`}
                                                        alt={movie.name || movie.title}
                                                        draggable="false"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="studio-movies-empty">
                                No {mediaType === 'movie' ? 'movies' : 'TV shows'} found for this studio
                            </div>
                        )}
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

export default MovieStudios;
