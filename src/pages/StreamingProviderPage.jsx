import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import Modal from '../components/Modal';
import FilterPanel from '../components/FilterPanel';
import MediaTypeToggle from '../components/MediaTypeToggle';
import MovieDiscoverFilterBar from '../components/MovieDiscoverFilterBar';
import TVDiscoverFilterBar from '../components/TVDiscoverFilterBar';
import DiscoverGrid from '../components/DiscoverGrid';
import { useTMDB } from '../hooks/useTMDB';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { MOVIE_BAR_CATEGORIES, TV_BAR_CATEGORIES } from '../constants/genres';
import './StreamingProviderPage.css';

const PROVIDER_DATA = {
  netflix: {
    id: '8', region: 'US', color: '#e50914', colorRgb: '229, 9, 20',
    name: 'Netflix', logo: '/provider/netflix.webp',
    subtitle: 'Popular movies and TV shows available on Netflix',
  },
  disney: {
    id: '337', region: 'US', color: '#113ccf', colorRgb: '17, 60, 207',
    name: 'Disney+', logo: '/provider/disney_plus.webp',
    subtitle: 'Popular movies and TV shows available on Disney+',
  },
  'prime-video': {
    id: '9', region: 'US', color: '#00a8e1', colorRgb: '0, 168, 225',
    name: 'Prime Video', logo: '/provider/prime_video.webp',
    subtitle: 'Popular movies and TV shows available on Prime Video',
  },
  'apple-tv': {
    id: '350', region: 'US', color: '#f5f5f7', colorRgb: '245, 245, 247',
    name: 'Apple TV+', logo: '/provider/apple_tv_plus.webp',
    subtitle: 'Popular movies and TV shows available on Apple TV',
  },
  hbo: {
    id: '1899|118', region: 'US', color: '#5822b4', colorRgb: '88, 34, 180',
    name: 'HBO Max', logo: '/provider/hbo_max.webp',
    subtitle: 'Popular movies and TV shows available on HBO Max',
  },
  viu: {
    id: '158', region: 'HK', color: '#ffc107', colorRgb: '255, 193, 7',
    name: 'Viu', logo: '/provider/viu.webp',
    subtitle: 'Popular movies and TV shows available on VIU',
  },
  crunchyroll: {
    id: '283', region: 'US', color: '#f47521', colorRgb: '244, 117, 33',
    name: 'Crunchyroll', logo: '/provider/crunchyroll_logo.png',
    subtitle: 'Popular anime movies and TV shows available on Crunchyroll',
  },
  peacock: {
    id: '386', region: 'US', color: '#f3f3f3', colorRgb: '243, 243, 243',
    name: 'Peacock', logo: '/provider/peacock_logo.png', tvNetwork: 3353,
    monetization: 'flatrate',
    subtitle: 'Peacock Original series and featured movies',
  },
};
const DEFAULT_PROVIDER = { region: 'US', name: 'Provider', logo: '', subtitle: 'Popular movies and TV shows', color: '#e50914', colorRgb: '229, 9, 20' };

const PANEL_DEFAULTS = { year: '', rating: '', sort_by: 'popularity.desc' };
const SHARED_SORTS = new Set(['popularity.desc', 'vote_average.desc', 'vote_average.asc']);

const splitIds = (value) => value ? String(value).split(/[,|]/).filter(Boolean) : [];

const StreamingProviderPage = () => {
    const location = useLocation();
    const providerKey = location.pathname.split('/')[1];
    const [searchParams, setSearchParams] = useSearchParams();
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
    const { closeNow } = useHoverPreview();

    const provider = PROVIDER_DATA[providerKey] || DEFAULT_PROVIDER;

    const [activeMediaType, setActiveMediaType] = useState('movie');
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [movieCount, setMovieCount] = useState(null);
    const [tvCount, setTvCount] = useState(null);
    const [isProbing, setIsProbing] = useState(true);

    const providerExtraParams = useMemo(() => ({
        movie: {
            with_watch_providers: provider.id,
            watch_region: provider.region,
            ...(provider.monetization ? { with_watch_monetization_types: provider.monetization } : {}),
        },
        tv: provider.tvNetwork
            ? { with_networks: provider.tvNetwork }
            : { with_watch_providers: provider.id, watch_region: provider.region },
    }), [provider]);

    useEffect(() => {
        let isMounted = true;
        const probeCounts = async () => {
            setIsProbing(true);
            try {
                const movieUrl = new URL('/api/discover/movie', window.location.origin);
                Object.entries({ ...providerExtraParams.movie, page: 1 }).forEach(([k, v]) => movieUrl.searchParams.set(k, v));
                
                const tvUrl = new URL('/api/discover/tv', window.location.origin);
                Object.entries({ ...providerExtraParams.tv, page: 1 }).forEach(([k, v]) => tvUrl.searchParams.set(k, v));

                const [movieRes, tvRes] = await Promise.all([
                    fetch(movieUrl),
                    fetch(tvUrl)
                ]);
                const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
                
                if (isMounted) {
                    const mCount = movieData.total_results || 0;
                    const tCount = tvData.total_results || 0;
                    setMovieCount(mCount);
                    setTvCount(tCount);
                    if (mCount === 0 && tCount > 0) {
                        setActiveMediaType('tv');
                    } else {
                        setActiveMediaType('movie');
                    }
                }
            } catch (err) {
                console.error('Failed to probe provider counts:', err);
            } finally {
                if (isMounted) setIsProbing(false);
            }
        };
        probeCounts();
        return () => { isMounted = false; };
    }, [provider, providerExtraParams]);

    const [filters, setFilters] = useState(() => ({
        sort_by: searchParams.get('sort_by') || PANEL_DEFAULTS.sort_by,
        language: searchParams.get('language') || 'en-US',
        primary_release_year: searchParams.get('primary_release_year') || PANEL_DEFAULTS.year,
        first_air_date_year: searchParams.get('first_air_date_year') || PANEL_DEFAULTS.year,
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

    const feed = useDiscoverFeed({ mediaType: activeMediaType, filters, extraParams: providerExtraParams });

    const handleMediaTypeChange = (next) => {
        if (next === activeMediaType || (next === 'movie' && movieCount === 0) || (next === 'tv' && tvCount === 0)) return;
        setActiveMediaType(next);
        setFilters({
            sort_by: SHARED_SORTS.has(filters.sort_by) ? filters.sort_by : PANEL_DEFAULTS.sort_by,
            language: 'en-US'
        });
    };

    const handleItemClick = async (item) => {
        closeNow();
        const type = activeMediaType;
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = item.genre_ids?.map(genreId => genreMap.get(genreId)).filter(Boolean) || [];

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
            [activeMediaType === 'movie' ? 'primary_release_year' : 'first_air_date_year']: pending.year || undefined,
            'vote_average.gte': pending.rating || undefined
        });
    };

    const handleClearFilters = () => {
        handleApplyFilters({ genres: [], keywords: [], ...PANEL_DEFAULTS });
    };

    const currentYear = activeMediaType === 'movie' ? filters.primary_release_year : filters.first_air_date_year;
    
    const activeFilterCount =
        splitIds(filters.with_genres).length +
        splitIds(filters.with_keywords).length +
        (String(currentYear ?? '') !== PANEL_DEFAULTS.year ? 1 : 0) +
        (String(filters['vote_average.gte'] ?? '') !== PANEL_DEFAULTS.rating ? 1 : 0) +
        (filters.sort_by !== PANEL_DEFAULTS.sort_by ? 1 : 0);

    if (isProbing) {
        return (
            <div className="streaming-provider-page" style={{ '--scoped-color': provider.color, '--scoped-color-rgb': provider.colorRgb }}>
                <div className="streaming-provider-page-header">
                    <Link to="/" className="back-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                        </svg>
                        Back
                    </Link>
                    <div className="streaming-provider-page-title-section">
                        {provider.logo && <img src={provider.logo} alt={provider.name} className="streaming-provider-page-logo" />}
                    </div>
                </div>
                {activeMediaType === 'movie' ? (
                    <MovieDiscoverFilterBar
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        onMoreClick={() => setIsFilterPanelOpen(true)}
                        onClearFilters={handleClearFilters}
                        activeFilterCount={activeFilterCount}
                        loading
                    />
                ) : (
                    <TVDiscoverFilterBar
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        onMoreClick={() => setIsFilterPanelOpen(true)}
                        onClearFilters={handleClearFilters}
                        activeFilterCount={activeFilterCount}
                        loading
                    />
                )}
                <div className="streaming-provider-page-loading">
                    <div className="loading-spinner" />
                    <p>Loading {provider.name} content...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="streaming-provider-page" style={{ '--scoped-color': provider.color, '--scoped-color-rgb': provider.colorRgb }}>
            <div className="streaming-provider-page-header">
                <Link to="/" className="back-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                    </svg>
                    Back
                </Link>
                <div className="streaming-provider-page-title-section">
                    {provider.logo && <img src={provider.logo} alt={provider.name} className="streaming-provider-page-logo" />}
                </div>
                <p className="streaming-provider-page-subtitle">{provider.subtitle}</p>
            </div>

            {activeMediaType === 'movie' ? (
                <MovieDiscoverFilterBar
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onMoreClick={() => setIsFilterPanelOpen(true)}
                    onClearFilters={handleClearFilters}
                    activeFilterCount={activeFilterCount}
                />
            ) : (
                <TVDiscoverFilterBar
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onMoreClick={() => setIsFilterPanelOpen(true)}
                    onClearFilters={handleClearFilters}
                    activeFilterCount={activeFilterCount}
                />
            )}

            <section className="streaming-provider-section">
                <div className="streaming-provider-section-header">
                    <MediaTypeToggle
                        activeType={activeMediaType}
                        onToggle={handleMediaTypeChange}
                        disabled={{ movie: movieCount === 0, tv: tvCount === 0 }}
                    />
                </div>
                <span className="streaming-provider-section-count">{feed.totalResults} titles</span>
                
                <div className="content-rows">
                    <DiscoverGrid
                        items={feed.visibleItems}
                        enrichedMap={feed.enrichedMap}
                        mediaType={activeMediaType}
                        loading={feed.loading}
                        error={feed.error}
                        emptyMessage={`No ${activeMediaType === 'movie' ? 'movies' : 'TV shows'} match these filters. Try clearing a few.`}
                        isFetchingMore={feed.isFetchingMore}
                        sentinelRef={feed.sentinelRef}
                        canLoadMore={feed.canLoadMore}
                        onItemClick={handleItemClick}
                    />
                </div>
            </section>

            <FilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                mediaType={activeMediaType}
                categories={activeMediaType === 'movie' ? MOVIE_BAR_CATEGORIES : TV_BAR_CATEGORIES}
                defaults={PANEL_DEFAULTS}
                filters={{
                    genres: splitIds(filters.with_genres).map(Number),
                    keywords: splitIds(filters.with_keywords).map(Number),
                    year: currentYear ? String(currentYear) : '',
                    rating: filters['vote_average.gte'] ? String(filters['vote_average.gte']) : '',
                    sort_by: filters.sort_by || PANEL_DEFAULTS.sort_by
                }}
                onApply={handleApplyFilters}
            />

            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={() => { setIsModalOpen(false); setSelectedItem(null); }} />
            )}
        </div>
    );
};

export default StreamingProviderPage;
