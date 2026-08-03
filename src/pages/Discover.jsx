import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import BannerSlider from '../components/BannerSlider';
import MetaTags from '../components/MetaTags';
import MovieDiscoverFilterBar from '../components/MovieDiscoverFilterBar';
import FilterPanel from '../components/FilterPanel';
import DiscoverGrid from '../components/DiscoverGrid';
import { useTMDB } from '../hooks/useTMDB';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { MOVIE_BAR_CATEGORIES } from '../constants/genres';
import '../components/TrendingSection.css';

const PANEL_DEFAULTS = {
  year: '',
  rating: '',
  sort_by: 'popularity.desc'
};

const splitIds = (value) => value ? String(value).split(/[,|]/).filter(Boolean) : [];

const Discover = () => {
  const [bannerMovies, setBannerMovies] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { closeNow } = useHoverPreview();
  const { movieGenres, fetchCredits, fetchContentRating } = useTMDB();

  const [filters, setFilters] = useState(() => ({
    sort_by: searchParams.get('sort_by') || PANEL_DEFAULTS.sort_by,
    language: searchParams.get('language') || 'en-US',
    primary_release_year: searchParams.get('primary_release_year') || PANEL_DEFAULTS.year,
    with_genres: searchParams.get('with_genres') || undefined,
    with_keywords: searchParams.get('with_keywords') || undefined,
    'vote_average.gte': searchParams.get('vote_average.gte') || PANEL_DEFAULTS.rating
  }));

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value.toString());
      }
    });
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  useEffect(() => {
    const fetchTopMovies = async () => {
      try {
        const res = await fetch('/api/movie/popular');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const top10 = (data.results || []).slice(0, 10).map(item => ({
          ...item,
          media_type: 'movie'
        }));
        setBannerMovies(top10);
      } catch (err) {
        console.error('Failed to fetch popular movies:', err);
      }
    };
    fetchTopMovies();
  }, []);

  const extraParams = useMemo(() => ({}), []);
  const feed = useDiscoverFeed({ mediaType: 'movie', filters, extraParams });

  const handleItemClick = useCallback(async (item) => {
    closeNow();
    const type = 'movie';
    const genreNames = item.genre_ids?.map(id => movieGenres.get(id)).filter(Boolean) || [];

    const [cast, contentRating] = await Promise.all([
      fetchCredits(type, item.id),
      fetchContentRating(type, item.id)
    ]);

    setSelectedItem({
      ...item,
      type,
      media_type: type,
      genres: genreNames,
      cast: cast.join(', ') || 'N/A',
      contentRating
    });
    setIsModalOpen(true);
  }, [closeNow, movieGenres, fetchCredits, fetchContentRating]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleApplyFilters = (pending) => {
    setFilters({
      sort_by: pending.sort_by || PANEL_DEFAULTS.sort_by,
      language: 'en-US',
      with_genres: pending.genres?.length ? pending.genres.join(',') : undefined,
      with_keywords: pending.keywords?.length ? pending.keywords.join('|') : undefined,
      primary_release_year: pending.year || undefined,
      'vote_average.gte': pending.rating || undefined
    });
  };

  const handleClearFilters = () => {
    handleApplyFilters({ genres: [], keywords: [], ...PANEL_DEFAULTS });
  };

  const activeFilterCount =
    splitIds(filters.with_genres).length +
    splitIds(filters.with_keywords).length +
    (String(filters.primary_release_year ?? '') !== PANEL_DEFAULTS.year ? 1 : 0) +
    (String(filters['vote_average.gte'] ?? '') !== PANEL_DEFAULTS.rating ? 1 : 0) +
    (filters.sort_by !== PANEL_DEFAULTS.sort_by ? 1 : 0);

  return (
    <div className="movie-discover-page">
      <MetaTags
        title="Movies | StreamFlix"
        description="Discover the latest and greatest movies. Stream popular blockbusters, indies, and award-winning films for free on StreamFlix."
      />

      <BannerSlider
        movies={bannerMovies}
        onItemClick={handleItemClick}
        loading={bannerMovies.length === 0}
      />

      <MovieDiscoverFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onMoreClick={() => setIsFilterPanelOpen(true)}
        onClearFilters={handleClearFilters}
        activeFilterCount={activeFilterCount}
      />

      <div className="content-rows">
        <DiscoverGrid
          items={feed.visibleItems}
          enrichedMap={feed.enrichedMap}
          mediaType="movie"
          loading={feed.loading}
          error={feed.error}
          emptyMessage="No movies match these filters. Try clearing a few."
          isFetchingMore={feed.isFetchingMore}
          sentinelRef={feed.sentinelRef}
          canLoadMore={feed.canLoadMore}
          onItemClick={handleItemClick}
        />
      </div>

      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        mediaType="movie"
        categories={MOVIE_BAR_CATEGORIES}
        defaults={PANEL_DEFAULTS}
        filters={{
          genres: splitIds(filters.with_genres).map(Number),
          keywords: splitIds(filters.with_keywords).map(Number),
          year: filters.primary_release_year ? String(filters.primary_release_year) : '',
          rating: filters['vote_average.gte'] ? String(filters['vote_average.gte']) : '',
          sort_by: filters.sort_by || PANEL_DEFAULTS.sort_by
        }}
        onApply={handleApplyFilters}
      />

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default Discover;
