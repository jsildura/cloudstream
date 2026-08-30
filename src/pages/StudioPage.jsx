import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
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
import './StudioPage.css';

const STUDIO_DATA = {
    420: { name: 'Marvel Studios', logo: 'https://image.tmdb.org/t/p/w500/hUzeosd33nzE5MCNsZxCGEKTXaQ.png', color: '#eb1a13', colorRgb: '235, 26, 19' },
    3: { name: 'Pixar', logo: 'https://image.tmdb.org/t/p/w500/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png', color: '#000000', colorRgb: '0, 0, 0' },
    521: { name: 'DreamWorks', logo: 'https://image.tmdb.org/t/p/w500/3BPX5VGBov8SDqTV7wC1L1xShAS.png', color: '#0066cc', colorRgb: '0, 102, 204' },
    41077: { name: 'A24', logo: 'https://image.tmdb.org/t/p/w500/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png', color: '#1a1a1a', colorRgb: '26, 26, 26' },
    3172: { name: 'Blumhouse', logo: 'https://image.tmdb.org/t/p/w500/kDedjRZwO8uyFhuHamomOhN6fzG.png', color: '#8b0000', colorRgb: '139, 0, 0' },
    174: { name: 'Warner Bros', logo: 'https://image.tmdb.org/t/p/w500/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png', color: '#ffc233', colorRgb: '255, 194, 51' },
    33: { name: 'Universal', logo: 'https://image.tmdb.org/t/p/w500/8lvHyhjr8oUKOOy2dKXoALWKdp0.png', color: '#00a652', colorRgb: '0, 166, 82' },
    1632: { name: 'Lionsgate', logo: '/logo/lionsgate.png', color: '#053d56', colorRgb: '5, 61, 86' },
    25: { name: '20th Century', logo: 'https://image.tmdb.org/t/p/w500/qZCc1lty5FzX30aOCVRBLzaVmcp.png', color: '#000000', colorRgb: '0, 0, 0' },
    4: { name: 'Paramount', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Paramount_Pictures_Corporation_logo.svg/976px-Paramount_Pictures_Corporation_logo.svg.png', color: '#006baf', colorRgb: '0, 107, 175' },
    128064: { name: 'DC Studios', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/DC_Comics_logo.png/960px-DC_Comics_logo.png', color: '#0877ea', colorRgb: '8, 119, 234' },
    2348: { name: 'Nickelodeon', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2009_logo.svg/1280px-Nickelodeon_2009_logo.svg.png', color: '#fa7f23', colorRgb: '250, 127, 35' },
    8356: { name: 'Vivamax', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Vivamax_logo.png', color: '#ff8315', colorRgb: '255, 131, 21' },
};

const PANEL_DEFAULTS = { year: '', rating: '', sort_by: 'popularity.desc' };
const SHARED_SORTS = new Set(['popularity.desc', 'vote_average.desc', 'vote_average.asc']);

const splitIds = (value) => value ? String(value).split(/[,|]/).filter(Boolean) : [];

const StudioPage = () => {
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
    const { closeNow } = useHoverPreview();

    const studioId = parseInt(id);
    const studioInfo = STUDIO_DATA[studioId] || { name: 'Studio', logo: '', color: '#e50914', colorRgb: '229, 9, 20' };

    const [activeMediaType, setActiveMediaType] = useState('movie');
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [movieCount, setMovieCount] = useState(null);
    const [tvCount, setTvCount] = useState(null);
    const [isProbing, setIsProbing] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const probeCounts = async () => {
            setIsProbing(true);
            try {
                const [movieRes, tvRes] = await Promise.all([
                    fetch(`/api/discover/movie?with_companies=${studioId}&page=1`),
                    fetch(`/api/discover/tv?with_companies=${studioId}&page=1`)
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
                console.error('Failed to probe studio counts:', err);
            } finally {
                if (isMounted) setIsProbing(false);
            }
        };
        probeCounts();
        return () => { isMounted = false; };
    }, [studioId]);

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

    const extraParams = useMemo(() => ({ with_companies: studioId }), [studioId]);
    const feed = useDiscoverFeed({ mediaType: activeMediaType, filters, extraParams });

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
            <div className="studio-page">
                <div className="studio-page-header" style={{ '--studio-color': studioInfo.color, '--studio-color-rgb': studioInfo.colorRgb }}>
                    <Link to="/" state={{ scrollToSection: 'studios' }} className="back-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                        </svg>
                        Back
                    </Link>
                    <div className="studio-page-title-section">
                        <img src={studioInfo.logo} alt={studioInfo.name} className="studio-page-logo" />
                    </div>
                </div>
                {activeMediaType === 'movie' ? (
                    <MovieDiscoverFilterBar
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        onMoreClick={() => setIsFilterPanelOpen(true)}
                        onClearFilters={handleClearFilters}
                        activeFilterCount={activeFilterCount}
                        variant="cards"
                        loading
                    />
                ) : (
                    <TVDiscoverFilterBar
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        onMoreClick={() => setIsFilterPanelOpen(true)}
                        onClearFilters={handleClearFilters}
                        activeFilterCount={activeFilterCount}
                        variant="cards"
                        loading
                    />
                )}
                <div className="studio-page-loading">
                    <div className="loading-spinner" />
                    <p>Loading {studioInfo.name} content...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="studio-page">
            <div className="studio-page-header" style={{ '--studio-color': studioInfo.color, '--studio-color-rgb': studioInfo.colorRgb }}>
                <Link to="/" state={{ scrollToSection: 'studios' }} className="back-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                    </svg>
                    Back
                </Link>
                <div className="studio-page-title-section">
                    <img src={studioInfo.logo} alt={studioInfo.name} className="studio-page-logo" />
                </div>
                <p className="studio-page-subtitle">Movies and TV shows from {studioInfo.name}</p>
            </div>

            {activeMediaType === 'movie' ? (
                <MovieDiscoverFilterBar
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onMoreClick={() => setIsFilterPanelOpen(true)}
                    onClearFilters={handleClearFilters}
                    activeFilterCount={activeFilterCount}
                    variant="cards"
                />
            ) : (
                <TVDiscoverFilterBar
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onMoreClick={() => setIsFilterPanelOpen(true)}
                    onClearFilters={handleClearFilters}
                    activeFilterCount={activeFilterCount}
                    variant="cards"
                />
            )}

            <section className="studio-section">
                <div className="studio-section-header">
                    <MediaTypeToggle 
                        activeType={activeMediaType} 
                        onToggle={handleMediaTypeChange} 
                        disabled={{ movie: movieCount === 0, tv: tvCount === 0 }}
                    />
                </div>
                <span className="studio-section-count">{feed.totalResults} titles</span>
                
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

export default StudioPage;
