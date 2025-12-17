import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import BannerSlider from '../components/BannerSlider';
import { useTMDB } from '../hooks/useTMDB';

const Movies = () => {
  const [movies, setMovies] = useState([]);
  const [topMovies, setTopMovies] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL or defaults
  const [filters, setFilters] = useState({
    sort_by: searchParams.get('sort_by') || 'popularity.desc',
    include_adult: searchParams.get('include_adult') === 'true' || false,
    include_video: searchParams.get('include_video') === 'true' || false,
    language: searchParams.get('language') || 'en-US',
    page: parseInt(searchParams.get('page')) || 1,
    year: searchParams.get('year') ? parseInt(searchParams.get('year')) : undefined,
    with_genres: searchParams.get('with_genres') || undefined,
    'vote_average.gte': searchParams.get('vote_average.gte') ? parseFloat(searchParams.get('vote_average.gte')) : undefined
  });

  const {
    movieGenres,
    fetchDiscoverMovies,
    fetchCredits,
    fetchContentRating
  } = useTMDB();

  useEffect(() => {
    fetchMovies();
  }, [filters]);

  // Fetch top 10 movies for banner
  useEffect(() => {
    const fetchTopMovies = async () => {
      try {
        const res = await fetch('/api/trending/movie/week');
        if (res.ok) {
          const data = await res.json();
          const top10 = (data.results || []).slice(0, 10).map(item => ({
            ...item,
            media_type: 'movie'
          }));
          setTopMovies(top10);
        }
      } catch (error) {
        console.error('Failed to fetch top movies:', error);
      }
    };
    fetchTopMovies();
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

  const fetchMovies = async () => {
    try {
      setLoading(true);
      const results = await fetchDiscoverMovies(filters);
      setMovies(results);
    } catch (error) {
      console.error("Failed to fetch movies:", error);
    } finally {
      setLoading(false);
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
  };

  const clearFilters = () => {
    setFilters({
      sort_by: 'popularity.desc',
      include_adult: false,
      include_video: false,
      language: 'en-US',
      page: 1
    });
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading movies...</p>
      </div>
    );
  }

  return (
    <div className="movies-page">
      {/* Banner Slider for Top 10 Movies */}
      {topMovies.length > 0 && (
        <BannerSlider movies={topMovies} onItemClick={handleItemClick} />
      )}

      <div className="page-header" style={{ display: 'none' }}>
        <h1>Movies</h1>
        <p>Discover the latest and greatest movies</p>
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

      {showFilters && (
        <div className="filters-section">
          <div className="filter-row">
            <div className="filter-group">
              <label>Sort By:</label>
              <select
                value={filters.sort_by}
                onChange={(e) => handleFilterChange({ sort_by: e.target.value })}
              >
                <option value="original_title.asc">Original Title A-Z</option>
                <option value="original_title.desc">Original Title Z-A</option>
                <option value="popularity.asc">Popularity Ascending</option>
                <option value="popularity.desc">Popularity Descending</option>
                <option value="revenue.asc">Revenue Ascending</option>
                <option value="revenue.desc">Revenue Descending</option>
                <option value="primary_release_date.asc">Release Date Ascending</option>
                <option value="title.asc">Title A-Z</option>
                <option value="title.desc">Title Z-A</option>
                <option value="primary_release_date.desc">Release Date Descending</option>
                <option value="vote_average.asc">Rating Ascending</option>
                <option value="vote_average.desc">Rating Descending</option>
                <option value="vote_count.asc">Vote Count Ascending</option>
                <option value="vote_count.desc">Vote Count Descending</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Release Year:</label>
              <select
                value={filters.year || ''}
                onChange={(e) => handleFilterChange({
                  year: e.target.value ? parseInt(e.target.value) : undefined
                })}
              >
                <option value="">All Years</option>
                {Array.from({ length: new Date().getFullYear() - 1930 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Genre:</label>
              <select
                value={filters.with_genres || ''}
                onChange={(e) => handleFilterChange({
                  with_genres: e.target.value || undefined
                })}
              >
                <option value="">All Genres</option>
                {Array.from(movieGenres.entries()).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Minimum Rating:</label>
              <select
                value={filters['vote_average.gte'] || ''}
                onChange={(e) => handleFilterChange({
                  'vote_average.gte': e.target.value ? parseFloat(e.target.value) : undefined
                })}
              >
                <option value="">Any Rating</option>
                <option value="1">1 star</option>
                <option value="2">2 stars</option>
                <option value="3">3 stars</option>
                <option value="4">4 stars</option>
                <option value="5">5 stars</option>
                <option value="6">6 stars</option>
                <option value="7">7 stars</option>
                <option value="8">8 stars</option>
                <option value="9">9 stars</option>
                <option value="10">10 stars</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="content-rows">
        <MovieRow
          title={`Movies (${movies.length})`}
          items={movies}
          onItemClick={handleItemClick}
          headerAction={
            <button
              className="select-filter-btn"
              onClick={() => setShowFilters(!showFilters)}
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
              {showFilters ? 'Hide Filters' : 'Select Filter'}
            </button>
          }
        />
      </div>

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default Movies;