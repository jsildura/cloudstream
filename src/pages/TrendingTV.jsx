// TrendingTV.jsx - Trending TV Shows Page
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import BannerSlider from '../components/BannerSlider';
import { useTMDB } from '../hooks/useTMDB';

const TrendingTV = () => {
    const [shows, setShows] = useState([]);
    const [topShows, setTopShows] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMorePages, setHasMorePages] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    const [timeWindow, setTimeWindow] = useState(searchParams.get('time_window') || 'week');

    const [filters, setFilters] = useState({
        language: searchParams.get('language') || 'en-US',
        page: parseInt(searchParams.get('page')) || 1
    });

    const { tvGenres, fetchCredits, fetchContentRating } = useTMDB();

    useEffect(() => {
        fetchShows();
    }, [filters, timeWindow]);

    useEffect(() => {
        const fetchBannerShows = async () => {
            try {
                const res = await fetch('/api/trending/tv/day');
                if (res.ok) {
                    const data = await res.json();
                    const top10 = (data.results || []).slice(0, 10).map(item => ({
                        ...item,
                        media_type: 'tv'
                    }));
                    setTopShows(top10);
                }
            } catch (error) {
                console.error('Failed to fetch trending TV shows for banner:', error);
            }
        };
        fetchBannerShows();
    }, []);

    useEffect(() => {
        const params = new URLSearchParams();
        params.set('time_window', timeWindow);
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.set(key, value.toString());
            }
        });
        setSearchParams(params);
    }, [filters, timeWindow, setSearchParams]);

    const buildUrl = (endpoint, params = {}) => {
        const url = new URL(`/api${endpoint}`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });
        return url.toString();
    };

    const fetchShows = async (page = 1, append = false) => {
        try {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const url = buildUrl(`/trending/tv/${timeWindow}`, { ...filters, page });
            const res = await fetch(url);

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
            console.error("Failed to fetch trending TV shows:", error);
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

    const handleTimeWindowChange = (newTimeWindow) => {
        setTimeWindow(newTimeWindow);
        setCurrentPage(1);
        setHasMorePages(true);
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Loading trending TV shows...</p>
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
                }}>Trending TV Shows</h1>
                <p style={{
                    fontSize: '1rem',
                    color: 'rgba(255, 255, 255, 0.7)',
                    margin: 0,
                    width: '100%',
                    lineHeight: '1.5'
                }}>Discover what's hot right now. These TV shows are capturing everyone's attention and dominating the charts.</p>
            </div>

            <div className="content-rows">
                <MovieRow
                    title={`TV Shows (${shows.length})`}
                    items={shows}
                    onItemClick={handleItemClick}
                    headerAction={
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                                className={`select-filter-btn ${timeWindow === 'day' ? 'active' : ''}`}
                                onClick={() => handleTimeWindowChange('day')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: timeWindow === 'day' ? 'rgba(229, 9, 20, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                    color: 'white',
                                    border: timeWindow === 'day' ? '1px solid #e50914' : '1px solid rgba(255, 255, 255, 0.2)',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                Today
                            </button>
                            <button
                                className={`select-filter-btn ${timeWindow === 'week' ? 'active' : ''}`}
                                onClick={() => handleTimeWindowChange('week')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: timeWindow === 'week' ? 'rgba(229, 9, 20, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                    color: 'white',
                                    border: timeWindow === 'week' ? '1px solid #e50914' : '1px solid rgba(255, 255, 255, 0.2)',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                This Week
                            </button>
                        </div>
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

export default TrendingTV;
