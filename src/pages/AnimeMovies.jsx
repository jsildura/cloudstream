// AnimeMovies.jsx - Anime Movies Page
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import BannerSlider from '../components/BannerSlider';
import FilterPanel from '../components/FilterPanel';
import { useTMDB } from '../hooks/useTMDB';

const AnimeMovies = () => {
    const [movies, setMovies] = useState([]);
    const [topMovies, setTopMovies] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMorePages, setHasMorePages] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    // Initialize filters from URL or defaults
    const [filters, setFilters] = useState({
        sort_by: searchParams.get('sort_by') || 'popularity.desc',
        include_adult: searchParams.get('include_adult') === 'true' || false,
        language: searchParams.get('language') || 'en-US',
        page: parseInt(searchParams.get('page')) || 1,
        year: searchParams.get('year') ? parseInt(searchParams.get('year')) : undefined,
        with_genres: '16', // Animation genre
        with_original_language: 'ja' // Japanese origin for anime
    });

    const {
        movieGenres,
        fetchCredits,
        fetchContentRating
    } = useTMDB();

    useEffect(() => {
        fetchMovies();
    }, [filters]);

    // Fetch top anime movies for banner
    useEffect(() => {
        const fetchBannerMovies = async () => {
            try {
                const res = await fetch('/api/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc');
                if (res.ok) {
                    const data = await res.json();
                    const top10 = (data.results || []).slice(0, 10).map(item => ({
                        ...item,
                        media_type: 'movie'
                    }));
                    setTopMovies(top10);
                }
            } catch (error) {
                console.error('Failed to fetch anime movies for banner:', error);
            }
        };
        fetchBannerMovies();
    }, []);

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams();

        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '' && key !== 'with_genres' && key !== 'with_original_language') {
                params.set(key, value.toString());
            }
        });

        setSearchParams(params);
    }, [filters, setSearchParams]);

    const buildUrl = (endpoint, params = {}) => {
        const url = new URL(`/api${endpoint}`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });
        return url.toString();
    };

    const fetchMovies = async (page = 1, append = false) => {
        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const url = buildUrl('/discover/movie', { ...filters, page });
            console.log('Fetching anime movies from:', url);

            const res = await fetch(url);

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
            }

            const data = await res.json();
            const newMovies = data.results || [];

            if (append) {
                // Filter out duplicates by ID
                setMovies(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMovies.filter(m => !existingIds.has(m.id));
                    return [...prev, ...uniqueNew];
                });
            } else {
                setMovies(newMovies);
            }

            // Check if there are more pages
            setHasMorePages(page < (data.total_pages || 1));
            setCurrentPage(page);
        } catch (error) {
            console.error("Failed to fetch anime movies:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMorePages) {
            fetchMovies(currentPage + 1, true);
        }
    };

    const handleItemClick = async (item) => {
        const type = 'movie';
        const genreMap = movieGenres;
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

    const handleFilterChange = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
        setCurrentPage(1);
        setHasMorePages(true);
    };

    const clearFilters = () => {
        setFilters({
            sort_by: 'popularity.desc',
            include_adult: false,
            language: 'en-US',
            page: 1,
            with_genres: '16',
            with_original_language: 'ja'
        });
        setCurrentPage(1);
        setHasMorePages(true);
    };

    // Handle filter panel apply
    const handleApplyFilters = (newFilters) => {
        const apiFilters = {
            sort_by: newFilters.sort_by || 'popularity.desc',
            include_adult: false,
            language: 'en-US',
            page: 1,
            with_original_language: 'ja'
        };

        // Combine Animation genre (16) with user-selected genres
        if (newFilters.genres && newFilters.genres.length > 0) {
            // Include Animation genre (16) plus user selections
            const allGenres = [16, ...newFilters.genres.filter(g => g !== 16)];
            apiFilters.with_genres = allGenres.join(',');
        } else {
            apiFilters.with_genres = '16'; // Default to Animation only
        }

        if (newFilters.year) {
            apiFilters.year = parseInt(newFilters.year);
        }

        if (newFilters.rating) {
            apiFilters['vote_average.gte'] = parseFloat(newFilters.rating);
        }

        setFilters(apiFilters);
        setCurrentPage(1);
        setHasMorePages(true);
    };

    // Count active filters (excluding defaults)
    const getActiveFilterCount = () => {
        let count = 0;
        // Count genres beyond the default Animation (16)
        const genreList = filters.with_genres ? filters.with_genres.split(',').map(Number) : [];
        if (genreList.length > 1 || (genreList.length === 1 && genreList[0] !== 16)) {
            count += genreList.filter(g => g !== 16).length;
        }
        if (filters.year) count++;
        if (filters['vote_average.gte']) count++;
        if (filters.sort_by && filters.sort_by !== 'popularity.desc') count++;
        return count;
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Loading anime movies...</p>
            </div>
        );
    }

    return (
        <div className="movies-page">
            {/* Banner Slider for Anime Movies */}
            {topMovies.length > 0 && (
                <BannerSlider movies={topMovies} onItemClick={handleItemClick} />
            )}

            {/* Page Title and Description */}
            <div className="page-title-section" style={{
                padding: '40px 4% 20px',
                background: 'transparent'
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: '#fff',
                    margin: '0 0 12px 0'
                }}>Anime Movies</h1>
                <p style={{
                    fontSize: '1rem',
                    color: 'rgba(255, 255, 255, 0.7)',
                    margin: 0,
                    width: '100%',
                    lineHeight: '1.5'
                }}>Embark on an epic journey with our handpicked collection of anime movies. From Studio Ghibli classics to modern masterpieces, experience the magic of Japanese animation.</p>
            </div>

            {/* Filter Panel */}
            <FilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={{
                    genres: filters.with_genres ? filters.with_genres.split(',').map(Number).filter(g => g !== 16) : [],
                    rating: filters['vote_average.gte'] ? String(filters['vote_average.gte']) : '',
                    sort_by: filters.sort_by,
                    year: filters.year ? String(filters.year) : ''
                }}
                onApply={handleApplyFilters}
                mediaType="movie"
            />

            <div className="content-rows">
                <MovieRow
                    title={`Anime Movies (${movies.length})`}
                    items={movies}
                    onItemClick={handleItemClick}
                    headerAction={
                        <button
                            className="select-filter-btn"
                            onClick={() => setIsFilterPanelOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="21" x2="4" y2="14"></line>
                                <line x1="4" y1="10" x2="4" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12" y2="3"></line>
                                <line x1="20" y1="21" x2="20" y2="16"></line>
                                <line x1="20" y1="12" x2="20" y2="3"></line>
                                <line x1="1" y1="14" x2="7" y2="14"></line>
                                <line x1="9" y1="8" x2="15" y2="8"></line>
                                <line x1="17" y1="16" x2="23" y2="16"></line>
                            </svg>
                            Filters
                            {getActiveFilterCount() > 0 && (
                                <span style={{
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    color: '#000',
                                    borderRadius: '10px',
                                    padding: '2px 8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    marginLeft: '4px'
                                }}>
                                    {getActiveFilterCount()}
                                </span>
                            )}
                        </button>
                    }
                />
            </div>

            {/* Load More Button */}
            {hasMorePages && movies.length > 0 && (
                <div className="load-more-container">
                    <button
                        className="load-more-btn"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore ? (
                            <>
                                <span className="load-more-spinner"></span>
                                Loading...
                            </>
                        ) : (
                            <>
                                Load More Movies
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m6 9 6 6 6-6"></path>
                                </svg>
                            </>
                        )}
                    </button>
                    <span className="load-more-count">Showing {movies.length} movies</span>
                </div>
            )}

            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
};

export default AnimeMovies;
