import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import Modal from '../components/Modal';
import FilterPanel from '../components/FilterPanel';
import MediaTypeToggle from '../components/MediaTypeToggle';
import { useTMDB } from '../hooks/useTMDB';
import './Crunchyroll.css';

const Crunchyroll = () => {
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
    const [activeMediaType, setActiveMediaType] = useState('movie');
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
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

    const getFilteredMovies = () => {
        let filtered = [...movies];
        if (filters.year) filtered = filtered.filter(m => m.release_date && new Date(m.release_date).getFullYear() === filters.year);
        if (filters.with_genres) filtered = filtered.filter(m => m.genre_ids?.includes(parseInt(filters.with_genres)));
        if (filters['vote_average.gte']) filtered = filtered.filter(m => m.vote_average >= filters['vote_average.gte']);
        if (filters.sort_by === 'popularity.desc') filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        return filtered;
    };

    const getFilteredTVShows = () => {
        let filtered = [...tvShows];
        if (filters.year) filtered = filtered.filter(s => s.first_air_date && new Date(s.first_air_date).getFullYear() === filters.year);
        if (filters.with_genres) filtered = filtered.filter(s => s.genre_ids?.includes(parseInt(filters.with_genres)));
        if (filters['vote_average.gte']) filtered = filtered.filter(s => s.vote_average >= filters['vote_average.gte']);
        if (filters.sort_by === 'popularity.desc') filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        return filtered;
    };

    useEffect(() => {
        const fetchInitialContent = async () => {
            try {
                const moviePromises = [], tvPromises = [];
                for (let page = 1; page <= 5; page++) {
                    moviePromises.push(fetch(`/api/discover/movie?with_watch_providers=283&watch_region=US&sort_by=popularity.desc&page=${page}`));
                    tvPromises.push(fetch(`/api/discover/tv?with_watch_providers=283&watch_region=US&sort_by=popularity.desc&page=${page}`));
                }
                const [movieResponses, tvResponses] = await Promise.all([Promise.all(moviePromises), Promise.all(tvPromises)]);
                const movieData = await Promise.all(movieResponses.map(res => res.json()));
                const tvData = await Promise.all(tvResponses.map(res => res.json()));
                setMoviesTotalPages(movieData[0]?.total_pages || 1);
                setTVTotalPages(tvData[0]?.total_pages || 1);
                const allMovies = [], movieIds = new Set();
                movieData.forEach(data => (data.results || []).forEach(movie => { if (!movieIds.has(movie.id)) { movieIds.add(movie.id); allMovies.push({ ...movie, media_type: 'movie' }); } }));
                const allTVShows = [], tvIds = new Set();
                tvData.forEach(data => (data.results || []).forEach(show => { if (!tvIds.has(show.id)) { tvIds.add(show.id); allTVShows.push({ ...show, media_type: 'tv' }); } }));
                setMovies(allMovies); setTVShows(allTVShows); setMoviesPage(5); setTVPage(5);
            } catch (err) { console.error('Error fetching Crunchyroll content:', err); } finally { setLoading(false); }
        };
        fetchInitialContent();
    }, []);

    const loadMoreMovies = async () => {
        if (loadingMoreMovies || moviesPage >= moviesTotalPages) return;
        setLoadingMoreMovies(true);
        try {
            const nextPages = [];
            for (let page = moviesPage + 1; page <= Math.min(moviesPage + 3, moviesTotalPages); page++) nextPages.push(fetch(`/api/discover/movie?with_watch_providers=283&watch_region=US&sort_by=popularity.desc&page=${page}`));
            const data = await Promise.all((await Promise.all(nextPages)).map(res => res.json()));
            const existingIds = new Set(movies.map(m => m.id)), newMovies = [];
            data.forEach(d => (d.results || []).forEach(movie => { if (!existingIds.has(movie.id)) { existingIds.add(movie.id); newMovies.push({ ...movie, media_type: 'movie' }); } }));
            setMovies(prev => [...prev, ...newMovies]); setMoviesPage(Math.min(moviesPage + 3, moviesTotalPages));
        } catch (err) { console.error('Error loading more movies:', err); } finally { setLoadingMoreMovies(false); }
    };

    const loadMoreTV = async () => {
        if (loadingMoreTV || tvPage >= tvTotalPages) return;
        setLoadingMoreTV(true);
        try {
            const nextPages = [];
            for (let page = tvPage + 1; page <= Math.min(tvPage + 3, tvTotalPages); page++) nextPages.push(fetch(`/api/discover/tv?with_watch_providers=283&watch_region=US&sort_by=popularity.desc&page=${page}`));
            const data = await Promise.all((await Promise.all(nextPages)).map(res => res.json()));
            const existingIds = new Set(tvShows.map(s => s.id)), newShows = [];
            data.forEach(d => (d.results || []).forEach(show => { if (!existingIds.has(show.id)) { existingIds.add(show.id); newShows.push({ ...show, media_type: 'tv' }); } }));
            setTVShows(prev => [...prev, ...newShows]); setTVPage(Math.min(tvPage + 3, tvTotalPages));
        } catch (err) { console.error('Error loading more TV shows:', err); } finally { setLoadingMoreTV(false); }
    };

    const handleItemClick = async (item) => {
        const type = item.media_type || 'movie';
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
        const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];
        const [cast, contentRating] = await Promise.all([fetchCredits(type, item.id), fetchContentRating(type, item.id)]);
        setSelectedItem({ ...item, type, genres: genreNames, cast: cast.join(', ') || 'N/A', contentRating }); setIsModalOpen(true);
    };

    const handleApplyFilters = (newFilters) => {
        const newFilterState = { sort_by: newFilters.sort_by || 'popularity.desc' };
        if (newFilters.genres?.length > 0) newFilterState.with_genres = newFilters.genres.join(',');
        if (newFilters.year) newFilterState.year = parseInt(newFilters.year);
        if (newFilters.rating) newFilterState['vote_average.gte'] = parseFloat(newFilters.rating);
        setFilters(newFilterState);
    };

    const getActiveFilterCount = () => [filters.with_genres, filters.year, filters['vote_average.gte'], filters.sort_by !== 'popularity.desc' ? filters.sort_by : null].filter(Boolean).length;

    if (loading) return (<div className="crunchyroll-page"><div className="crunchyroll-page-header"><Link to="/" className="back-button"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>Back</Link><div className="crunchyroll-page-title-section"><img src="/provider/crunchyroll_logo.png" alt="Crunchyroll" className="crunchyroll-page-logo" /></div></div><div className="crunchyroll-page-loading"><div className="loading-spinner" /><p>Loading Crunchyroll content...</p></div></div>);

    const filteredMovies = getFilteredMovies(), filteredTVShows = getFilteredTVShows();
    const currentContent = activeMediaType === 'movie' ? filteredMovies : filteredTVShows;
    const currentPage = activeMediaType === 'movie' ? moviesPage : tvPage;
    const totalPages = activeMediaType === 'movie' ? moviesTotalPages : tvTotalPages;
    const isLoadingMore = activeMediaType === 'movie' ? loadingMoreMovies : loadingMoreTV;
    const loadMore = activeMediaType === 'movie' ? loadMoreMovies : loadMoreTV;

    return (
        <div className="crunchyroll-page">
            <div className="crunchyroll-page-header">
                <Link to="/" className="back-button"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>Back</Link>
                <div className="crunchyroll-page-title-section"><img src="/provider/crunchyroll_logo.png" alt="Crunchyroll" className="crunchyroll-page-logo" /></div>
                <p className="crunchyroll-page-subtitle">Popular anime movies and TV shows available on Crunchyroll</p>
            </div>
            <FilterPanel isOpen={isFilterPanelOpen} onClose={() => setIsFilterPanelOpen(false)} filters={{ genres: filters.with_genres ? filters.with_genres.split(',').map(Number) : [], rating: filters['vote_average.gte'] ? String(filters['vote_average.gte']) : '', year: filters.year ? String(filters.year) : '', sort_by: filters.sort_by || 'popularity.desc' }} onApply={handleApplyFilters} mediaType={activeMediaType} />
            <section className="crunchyroll-content-section">
                <div className="crunchyroll-section-header">
                    <MediaTypeToggle activeType={activeMediaType} onToggle={setActiveMediaType} />
                    <button className="select-filter-btn" onClick={() => setIsFilterPanelOpen(true)}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>Filters{getActiveFilterCount() > 0 && <span style={{ background: 'rgba(255,255,255,0.9)', color: '#000', borderRadius: '10px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: '600', marginLeft: '4px' }}>{getActiveFilterCount()}</span>}</button>
                </div>
                <span className="crunchyroll-section-count">{currentContent.length} titles</span>
                <div className="crunchyroll-grid">{currentContent.map(item => <MovieCard key={item.id} item={item} onClick={() => handleItemClick(item)} />)}</div>
                {currentPage < totalPages && <div className="load-more-container"><button className="load-more-btn crunchyroll-load-more" onClick={loadMore} disabled={isLoadingMore}>{isLoadingMore ? <><div className="btn-spinner" />Loading...</> : <>Load More {activeMediaType === 'movie' ? 'Anime Movies' : 'Anime Series'}<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></>}</button></div>}
            </section>
            {isModalOpen && selectedItem && <Modal item={selectedItem} onClose={() => { setIsModalOpen(false); setSelectedItem(null); }} />}
        </div>
    );
};

export default Crunchyroll;
