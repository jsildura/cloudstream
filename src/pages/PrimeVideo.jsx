import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import Modal from '../components/Modal';
import { useTMDB } from '../hooks/useTMDB';
import './PrimeVideo.css';

const PrimeVideo = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
    const [movies, setMovies] = useState([]);
    const [tvShows, setTVShows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [moviesPage, setMoviesPage] = useState(1);
    const [tvPage, setTVPage] = useState(1);
    const [moviesTotalPages, setMoviesTotalPages] = useState(1);
    const [tvTotalPages, setTVTotalPages] = useState(1);
    const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
    const [loadingMoreTV, setLoadingMoreTV] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        sort_by: searchParams.get('sort_by') || 'popularity.desc',
        year: searchParams.get('year') ? parseInt(searchParams.get('year')) : undefined,
        with_genres: searchParams.get('with_genres') || undefined,
        'vote_average.gte': searchParams.get('vote_average.gte') ? parseFloat(searchParams.get('vote_average.gte')) : undefined
    });

    useEffect(() => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') params.set(key, value.toString());
        });
        setSearchParams(params, { replace: true });
    }, [filters, setSearchParams]);

    const handleFilterChange = (newFilters) => setFilters(prev => ({ ...prev, ...newFilters }));

    const getFilteredMovies = () => {
        let filtered = [...movies];
        if (filters.year) filtered = filtered.filter(m => m.release_date && new Date(m.release_date).getFullYear() === filters.year);
        if (filters.with_genres) filtered = filtered.filter(m => m.genre_ids?.includes(parseInt(filters.with_genres)));
        if (filters['vote_average.gte']) filtered = filtered.filter(m => m.vote_average >= filters['vote_average.gte']);
        switch (filters.sort_by) {
            case 'popularity.asc': filtered.sort((a, b) => (a.popularity || 0) - (b.popularity || 0)); break;
            case 'popularity.desc': filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)); break;
            case 'vote_average.asc': filtered.sort((a, b) => (a.vote_average || 0) - (b.vote_average || 0)); break;
            case 'vote_average.desc': filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)); break;
            case 'primary_release_date.asc': filtered.sort((a, b) => new Date(a.release_date || 0) - new Date(b.release_date || 0)); break;
            case 'primary_release_date.desc': filtered.sort((a, b) => new Date(b.release_date || 0) - new Date(a.release_date || 0)); break;
            case 'title.asc': filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
            case 'title.desc': filtered.sort((a, b) => (b.title || '').localeCompare(a.title || '')); break;
            default: break;
        }
        return filtered;
    };

    const getFilteredTVShows = () => {
        let filtered = [...tvShows];
        if (filters.year) filtered = filtered.filter(s => s.first_air_date && new Date(s.first_air_date).getFullYear() === filters.year);
        if (filters.with_genres) filtered = filtered.filter(s => s.genre_ids?.includes(parseInt(filters.with_genres)));
        if (filters['vote_average.gte']) filtered = filtered.filter(s => s.vote_average >= filters['vote_average.gte']);
        switch (filters.sort_by) {
            case 'popularity.asc': filtered.sort((a, b) => (a.popularity || 0) - (b.popularity || 0)); break;
            case 'popularity.desc': filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)); break;
            case 'vote_average.asc': filtered.sort((a, b) => (a.vote_average || 0) - (b.vote_average || 0)); break;
            case 'vote_average.desc': filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)); break;
            case 'primary_release_date.asc': filtered.sort((a, b) => new Date(a.first_air_date || 0) - new Date(b.first_air_date || 0)); break;
            case 'primary_release_date.desc': filtered.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0)); break;
            case 'title.asc': filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
            case 'title.desc': filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
            default: break;
        }
        return filtered;
    };

    // Initial fetch of Prime Video content
    useEffect(() => {
        const fetchInitialContent = async () => {
            try {
                // Amazon Prime Video provider ID is 9 in TMDB
                const moviePromises = [];
                const tvPromises = [];

                for (let page = 1; page <= 5; page++) {
                    moviePromises.push(
                        fetch(`/api/discover/movie?with_watch_providers=9&watch_region=US&sort_by=popularity.desc&page=${page}`)
                    );
                    tvPromises.push(
                        fetch(`/api/discover/tv?with_watch_providers=9&watch_region=US&sort_by=popularity.desc&page=${page}`)
                    );
                }

                const [movieResponses, tvResponses] = await Promise.all([
                    Promise.all(moviePromises),
                    Promise.all(tvPromises)
                ]);

                const movieDataPromises = movieResponses.map(res => res.json());
                const tvDataPromises = tvResponses.map(res => res.json());

                const movieData = await Promise.all(movieDataPromises);
                const tvData = await Promise.all(tvDataPromises);

                setMoviesTotalPages(movieData[0]?.total_pages || 1);
                setTVTotalPages(tvData[0]?.total_pages || 1);

                const allMovies = [];
                const movieIds = new Set();
                movieData.forEach(data => {
                    (data.results || []).forEach(movie => {
                        if (!movieIds.has(movie.id)) {
                            movieIds.add(movie.id);
                            allMovies.push({ ...movie, media_type: 'movie' });
                        }
                    });
                });

                const allTVShows = [];
                const tvIds = new Set();
                tvData.forEach(data => {
                    (data.results || []).forEach(show => {
                        if (!tvIds.has(show.id)) {
                            tvIds.add(show.id);
                            allTVShows.push({ ...show, media_type: 'tv' });
                        }
                    });
                });

                setMovies(allMovies);
                setTVShows(allTVShows);
                setMoviesPage(5);
                setTVPage(5);
            } catch (err) {
                console.error('Error fetching Prime Video content:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialContent();
    }, []);

    const loadMoreMovies = async () => {
        if (loadingMoreMovies || moviesPage >= moviesTotalPages) return;

        setLoadingMoreMovies(true);
        try {
            const nextPages = [];
            const startPage = moviesPage + 1;
            const endPage = Math.min(moviesPage + 3, moviesTotalPages);

            for (let page = startPage; page <= endPage; page++) {
                nextPages.push(
                    fetch(`/api/discover/movie?with_watch_providers=9&watch_region=US&sort_by=popularity.desc&page=${page}`)
                );
            }

            const responses = await Promise.all(nextPages);
            const dataPromises = responses.map(res => res.json());
            const data = await Promise.all(dataPromises);

            const existingIds = new Set(movies.map(m => m.id));
            const newMovies = [];

            data.forEach(d => {
                (d.results || []).forEach(movie => {
                    if (!existingIds.has(movie.id)) {
                        existingIds.add(movie.id);
                        newMovies.push({ ...movie, media_type: 'movie' });
                    }
                });
            });

            setMovies(prev => [...prev, ...newMovies]);
            setMoviesPage(endPage);
        } catch (err) {
            console.error('Error loading more movies:', err);
        } finally {
            setLoadingMoreMovies(false);
        }
    };

    const loadMoreTV = async () => {
        if (loadingMoreTV || tvPage >= tvTotalPages) return;

        setLoadingMoreTV(true);
        try {
            const nextPages = [];
            const startPage = tvPage + 1;
            const endPage = Math.min(tvPage + 3, tvTotalPages);

            for (let page = startPage; page <= endPage; page++) {
                nextPages.push(
                    fetch(`/api/discover/tv?with_watch_providers=9&watch_region=US&sort_by=popularity.desc&page=${page}`)
                );
            }

            const responses = await Promise.all(nextPages);
            const dataPromises = responses.map(res => res.json());
            const data = await Promise.all(dataPromises);

            const existingIds = new Set(tvShows.map(s => s.id));
            const newShows = [];

            data.forEach(d => {
                (d.results || []).forEach(show => {
                    if (!existingIds.has(show.id)) {
                        existingIds.add(show.id);
                        newShows.push({ ...show, media_type: 'tv' });
                    }
                });
            });

            setTVShows(prev => [...prev, ...newShows]);
            setTVPage(endPage);
        } catch (err) {
            console.error('Error loading more TV shows:', err);
        } finally {
            setLoadingMoreTV(false);
        }
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

    const handleBack = () => {
        navigate(-1);
    };

    if (loading) {
        return (
            <div className="primevideo-page">
                <div className="primevideo-page-header">
                    <button onClick={handleBack} className="back-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m12 19-7-7 7-7"></path>
                            <path d="M19 12H5"></path>
                        </svg>
                        Back
                    </button>
                    <div className="primevideo-page-title-section">
                        <img
                            src="/provider/prime_video.png"
                            alt="Prime Video"
                            className="primevideo-page-logo"
                        />
                    </div>
                </div>
                <div className="primevideo-page-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading Prime Video content...</p>
                </div>
            </div>
        );
    }

    const filteredMovies = getFilteredMovies();
    const filteredTVShows = getFilteredTVShows();

    return (
        <div className="primevideo-page">
            {/* Page Header */}
            <div className="primevideo-page-header">
                <button onClick={handleBack} className="back-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 19-7-7 7-7"></path>
                        <path d="M19 12H5"></path>
                    </svg>
                    Back
                </button>
                <div className="primevideo-page-title-section">
                    <img src="/provider/prime_video.png" alt="Prime Video" className="primevideo-page-logo" />
                </div>
                <p className="primevideo-page-subtitle">Popular movies and TV shows available on Prime Video</p>
            </div>

            {showFilters && (
                <div className="filters-section">
                    <div className="filter-row">
                        <div className="filter-group">
                            <label>Sort By:</label>
                            <select value={filters.sort_by} onChange={(e) => handleFilterChange({ sort_by: e.target.value })}>
                                <option value="popularity.desc">Popularity Descending</option>
                                <option value="popularity.asc">Popularity Ascending</option>
                                <option value="vote_average.desc">Rating Descending</option>
                                <option value="vote_average.asc">Rating Ascending</option>
                                <option value="primary_release_date.desc">Release Date Descending</option>
                                <option value="primary_release_date.asc">Release Date Ascending</option>
                                <option value="title.asc">Title A-Z</option>
                                <option value="title.desc">Title Z-A</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Release Year:</label>
                            <select value={filters.year || ''} onChange={(e) => handleFilterChange({ year: e.target.value ? parseInt(e.target.value) : undefined })}>
                                <option value="">All Years</option>
                                {Array.from({ length: new Date().getFullYear() - 1990 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (<option key={year} value={year}>{year}</option>))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Genre:</label>
                            <select value={filters.with_genres || ''} onChange={(e) => handleFilterChange({ with_genres: e.target.value || undefined })}>
                                <option value="">All Genres</option>
                                {Array.from(movieGenres.entries()).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Minimum Rating:</label>
                            <select value={filters['vote_average.gte'] || ''} onChange={(e) => handleFilterChange({ 'vote_average.gte': e.target.value ? parseFloat(e.target.value) : undefined })}>
                                <option value="">Any Rating</option>
                                <option value="5">5+ stars</option>
                                <option value="6">6+ stars</option>
                                <option value="7">7+ stars</option>
                                <option value="8">8+ stars</option>
                                <option value="9">9+ stars</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            <section className="primevideo-content-section">
                <div className="primevideo-section-header">
                    <div className="primevideo-section-accent"></div>
                    <h2 className="primevideo-section-title">Movies</h2>
                    <span className="primevideo-section-count">{filteredMovies.length} titles</span>
                    <button className="select-filter-btn" onClick={() => setShowFilters(!showFilters)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                            <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                            <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>
                        </svg>
                        {showFilters ? 'Hide Filters' : 'Select Filter'}
                    </button>
                </div>
                <div className="primevideo-grid">
                    {filteredMovies.map(movie => (<MovieCard key={movie.id} item={movie} onClick={() => handleItemClick(movie)} />))}
                </div>
                {moviesPage < moviesTotalPages && (
                    <div className="load-more-container">
                        <button className="load-more-btn primevideo-load-more" onClick={loadMoreMovies} disabled={loadingMoreMovies}>
                            {loadingMoreMovies ? (<><div className="btn-spinner"></div>Loading...</>) : (<>Load More Movies<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></>)}
                        </button>
                    </div>
                )}
            </section>

            <section className="primevideo-content-section">
                <div className="primevideo-section-header">
                    <div className="primevideo-section-accent"></div>
                    <h2 className="primevideo-section-title">TV Shows</h2>
                    <span className="primevideo-section-count">{filteredTVShows.length} titles</span>
                </div>
                <div className="primevideo-grid">
                    {filteredTVShows.map(show => (<MovieCard key={show.id} item={show} onClick={() => handleItemClick(show)} />))}
                </div>
                {tvPage < tvTotalPages && (
                    <div className="load-more-container">
                        <button className="load-more-btn primevideo-load-more" onClick={loadMoreTV} disabled={loadingMoreTV}>
                            {loadingMoreTV ? (<><div className="btn-spinner"></div>Loading...</>) : (<>Load More TV Shows<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></>)}
                        </button>
                    </div>
                )}
            </section>

            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
};

export default PrimeVideo;
