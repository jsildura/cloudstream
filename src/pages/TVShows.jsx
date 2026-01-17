// TVShows.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import BannerSlider from '../components/BannerSlider';
import FilterPanel from '../components/FilterPanel';
import MetaTags from '../components/MetaTags';
import { useTMDB } from '../hooks/useTMDB';

const TVShows = () => {
  const [tvShows, setTvShows] = useState([]);
  const [topTvShows, setTopTvShows] = useState([]);
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
    include_null_first_air_dates: searchParams.get('include_null_first_air_dates') === 'true' || false,
    language: searchParams.get('language') || 'en-US',
    page: parseInt(searchParams.get('page')) || 1,
    first_air_date_year: searchParams.get('first_air_date_year') ? parseInt(searchParams.get('first_air_date_year')) : undefined,
    with_genres: searchParams.get('with_genres') || undefined,
    with_status: searchParams.get('with_status') || undefined
  });

  const {
    tvGenres,
    fetchDiscoverTV,
    fetchCredits,
    fetchContentRating
  } = useTMDB();

  useEffect(() => {
    fetchTVShows();
  }, [filters]);

  // Fetch top 10 TV shows for banner
  useEffect(() => {
    const fetchTopTV = async () => {
      try {
        const res = await fetch('/api/trending/tv/week');
        if (res.ok) {
          const data = await res.json();
          // Get top 10 and add media_type
          const top10 = (data.results || []).slice(0, 10).map(item => ({
            ...item,
            media_type: 'tv'
          }));
          setTopTvShows(top10);
        }
      } catch (error) {
        console.error('Failed to fetch top TV shows:', error);
      }
    };
    fetchTopTV();
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value.toString());
      }
    });

    setSearchParams(params);
  }, [filters, setSearchParams]);

  const fetchTVShows = async (page = 1, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const results = await fetchDiscoverTV({ ...filters, page });

      if (append) {
        // Filter out duplicates by ID
        setTvShows(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNew = results.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setTvShows(results);
      }

      // Assume more pages if we got a full page of results
      setHasMorePages(results.length >= 20);
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to fetch TV shows:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMorePages) {
      fetchTVShows(currentPage + 1, true);
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

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      sort_by: 'popularity.desc',
      include_adult: false,
      include_null_first_air_dates: false,
      language: 'en-US',
      page: 1
    });
    setCurrentPage(1);
    setHasMorePages(true);
  };

  // Handle filter panel apply
  const handleApplyFilters = (newFilters) => {
    const apiFilters = {
      sort_by: newFilters.sort_by || 'popularity.desc',
      language: 'en-US',
      include_adult: false,
      include_null_first_air_dates: false,
      page: 1
    };

    // Convert multi-select genres to comma-separated string
    if (newFilters.genres && newFilters.genres.length > 0) {
      apiFilters.with_genres = newFilters.genres.join(',');
    }

    // Year filter
    if (newFilters.year) {
      apiFilters.first_air_date_year = parseInt(newFilters.year);
    }

    // Rating filter
    if (newFilters.rating) {
      apiFilters['vote_average.gte'] = parseFloat(newFilters.rating);
    }

    setFilters(apiFilters);
    setCurrentPage(1);
    setHasMorePages(true);
  };

  // Count active filters
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.with_genres) count++;
    if (filters.first_air_date_year) count++;
    if (filters['vote_average.gte']) count++;
    if (filters.with_status) count++;
    if (filters.sort_by && filters.sort_by !== 'popularity.desc') count++;
    return count;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading TV shows...</p>
      </div>
    );
  }

  return (
    <div className="tv-shows-page">
      <MetaTags
        title="TV Shows | StreamFlix"
        description="Discover the latest and greatest TV series. Stream popular shows, dramas, and binge-worthy content for free on StreamFlix."
      />
      {/* Banner Slider for Top 10 TV Shows */}
      {topTvShows.length > 0 && (
        <BannerSlider movies={topTvShows} onItemClick={handleItemClick} />
      )}

      <div className="page-header" style={{ display: 'none' }}>
        <h1>TV Shows</h1>
        <p>Discover the latest and greatest TV series</p>
        <button
          className="clear-filters-btn"
          onClick={clearFilters}
          style={{
            background: 'var(--netflix-red)',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '10px'
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Filter Panel */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        filters={{
          genres: filters.with_genres ? filters.with_genres.split(',').map(Number) : [],
          rating: filters['vote_average.gte'] ? String(filters['vote_average.gte']) : '',
          sort_by: filters.sort_by,
          year: filters.first_air_date_year ? String(filters.first_air_date_year) : ''
        }}
        onApply={handleApplyFilters}
        mediaType="tv"
      />

      <div className="content-rows">
        <MovieRow
          title={`TV Shows (${tvShows.length})`}
          items={tvShows}
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
      {hasMorePages && tvShows.length > 0 && (
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
          <span className="load-more-count">Showing {tvShows.length} TV shows</span>
        </div>
      )}

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default TVShows;