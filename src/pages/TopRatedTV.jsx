// TopRatedTV.jsx - Top Rated TV Shows Page
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import BannerSlider from '../components/BannerSlider';
import FilterPanel from '../components/FilterPanel';
import { useTMDB } from '../hooks/useTMDB';

const TopRatedTV = () => {
    const [shows, setShows] = useState([]);
    const [topShows, setTopShows] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMorePages, setHasMorePages] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({
        with_genres: searchParams.get('with_genres') || undefined,
        year: searchParams.get('year') ? parseInt(searchParams.get('year')) : undefined,
        'vote_average.gte': searchParams.get('vote_average.gte') ? parseFloat(searchParams.get('vote_average.gte')) : undefined
    });

    const { tvGenres, fetchCredits, fetchContentRating } = useTMDB();

    // Handle filter panel apply
    const handleApplyFilters = (newFilters) => {
        const newFilterState = {};
        if (newFilters.genres && newFilters.genres.length > 0) newFilterState.with_genres = newFilters.genres.join(',');
        if (newFilters.year) newFilterState.year = parseInt(newFilters.year);
        if (newFilters.rating) newFilterState['vote_average.gte'] = parseFloat(newFilters.rating);
        if (newFilters.sort_by) newFilterState.sort_by = newFilters.sort_by;
        setFilters(newFilterState);
    };

    const getActiveFilterCount = () => {
        let count = 0;
        if (filters.with_genres) count++;
        if (filters.year) count++;
        if (filters['vote_average.gte']) count++;
        if (filters.sort_by) count++;
        return count;
    };

    // Filter and sort shows client-side
    const getFilteredShows = () => {
        let filtered = [...shows];
        if (filters.year) {
            filtered = filtered.filter(s => s.first_air_date && new Date(s.first_air_date).getFullYear() === filters.year);
        }
        if (filters.with_genres) {
            const genreIds = filters.with_genres.split(',').map(Number);
            filtered = filtered.filter(s => s.genre_ids?.some(id => genreIds.includes(id)));
        }
        if (filters['vote_average.gte']) {
            filtered = filtered.filter(s => s.vote_average >= filters['vote_average.gte']);
        }
        // Apply sorting
        if (filters.sort_by) {
            switch (filters.sort_by) {
                case 'primary_release_date.desc':
                    filtered.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
                    break;
                case 'primary_release_date.asc':
                    filtered.sort((a, b) => new Date(a.first_air_date || 0) - new Date(b.first_air_date || 0));
                    break;
                case 'vote_average.desc':
                    filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
                    break;
                case 'vote_average.asc':
                    filtered.sort((a, b) => (a.vote_average || 0) - (b.vote_average || 0));
                    break;
                default:
                    break;
            }
        }
        return filtered;
    };

    useEffect(() => {
        fetchShows();
        fetchBannerShows();
    }, []);

    const fetchBannerShows = async () => {
        try {
            const res = await fetch('/api/tv/top_rated?page=1');
            if (res.ok) {
                const data = await res.json();
                const top10 = (data.results || []).slice(0, 10).map(item => ({
                    ...item,
                    media_type: 'tv'
                }));
                setTopShows(top10);
            }
        } catch (error) {
            console.error('Failed to fetch top rated TV shows for banner:', error);
        }
    };

    const fetchShows = async (page = 1, append = false) => {
        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const res = await fetch(`/api/tv/top_rated?page=${page}`);

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            const newShows = data.results || [];

            if (append) {
                setShows(prev => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const uniqueNew = newShows.filter(s => !existingIds.has(s.id));
                    return [...prev, ...uniqueNew];
                });
            } else {
                setShows(newShows);
            }

            setHasMorePages(page < (data.total_pages || 1));
            setCurrentPage(page);
        } catch (error) {
            console.error("Failed to fetch top rated TV shows:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMorePages) {
            fetchShows(currentPage + 1, true);
        }
    };

    const handleItemClick = async (item) => {
        const type = 'tv';
        const genreMap = tvGenres;
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

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Loading top rated TV shows...</p>
            </div>
        );
    }

    return (
        <div className="movies-page">
            {topShows.length > 0 && (
                <BannerSlider movies={topShows} onItemClick={handleItemClick} />
            )}

            <div className="page-title-section" style={{
                padding: '40px 4% 20px',
                background: 'transparent'
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: '#fff',
                    margin: '0 0 12px 0'
                }}>Top Rated TV Shows</h1>
                <p style={{
                    fontSize: '1rem',
                    color: 'rgba(255, 255, 255, 0.7)',
                    margin: 0,
                    width: '100%',
                    lineHeight: '1.5'
                }}>Explore the highest-rated TV series of all time, as chosen by critics and viewers worldwide.</p>
            </div>

            <FilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={{
                    genres: filters.with_genres ? filters.with_genres.split(',').map(Number) : [],
                    rating: filters['vote_average.gte'] ? String(filters['vote_average.gte']) : '',
                    year: filters.year ? String(filters.year) : ''
                }}
                onApply={handleApplyFilters}
                mediaType="tv"
            />

            <div className="content-rows">
                <MovieRow
                    title={`TV Shows (${getFilteredShows().length})`}
                    items={getFilteredShows()}
                    onItemClick={handleItemClick}
                    headerAction={
                        <button
                            className="select-filter-btn"
                            onClick={() => setIsFilterPanelOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                                <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                                <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>
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

            {hasMorePages && shows.length > 0 && (
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
                                Load More TV Shows
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m6 9 6 6 6-6"></path>
                                </svg>
                            </>
                        )}
                    </button>
                    <span className="load-more-count">Showing {shows.length} TV shows</span>
                </div>
            )}

            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
};

export default TopRatedTV;
