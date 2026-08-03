import React, { useState, useEffect, useRef } from 'react';
import { MOVIE_GENRES, TV_GENRES } from '../constants/genres';
import './FilterPanel.css';

// Ratings
const RATINGS = [
    { value: '', name: 'Any rating' },
    { value: '9', name: '9+ Excellent' },
    { value: '8', name: '8+ Great' },
    { value: '7', name: '7+ Good' },
    { value: '6', name: '6+ Fair' },
    { value: '5', name: '5+ Average' }
];

// Sort options. TV uses `first_air_date` — `primary_release_date` is a movie-only
// field and TMDB silently ignores it on /discover/tv.
const MOVIE_SORT_OPTIONS = [
    { value: 'primary_release_date.desc', name: 'Most Recent' },
    { value: 'primary_release_date.asc', name: 'Least Recent' },
    { value: 'vote_average.desc', name: 'Highest Rating' },
    { value: 'vote_average.asc', name: 'Lowest Rating' }
];

const TV_SORT_OPTIONS = [
    { value: 'first_air_date.desc', name: 'Most Recent' },
    { value: 'first_air_date.asc', name: 'Least Recent' },
    { value: 'vote_average.desc', name: 'Highest Rating' },
    { value: 'vote_average.asc', name: 'Lowest Rating' }
];

const CURRENT_YEAR = new Date().getFullYear();

// What "no filter" means. Pages that want a different baseline pass `defaults`;
// Clear returns to whatever that baseline is, so the panel and its caller always
// agree on which values count as unfiltered.
const BASE_DEFAULTS = { year: '', rating: '', sort_by: 'popularity.desc' };

const FilterPanel = ({
    isOpen,
    onClose,
    filters = {},
    onApply,
    mediaType = 'movie', // 'movie', 'tv', or 'both'
    // Optional ordered category list (see TV_BAR_CATEGORIES). When supplied it
    // replaces the plain genre chips, letting the panel mirror the discover bar
    // exactly — keyword-backed categories included. Selections come back split
    // into `genres` and `keywords` on the onApply payload.
    categories = null,
    // Baseline values for year/rating/sort. A non-empty year or rating here also
    // drops the matching "Any …" option, because with a real baseline "Any" is
    // no longer the default — it would be a filter change disguised as a reset.
    defaults = BASE_DEFAULTS
}) => {
    const panelRef = useRef(null);
    // Callers build the `filters` prop inline, so it is a new object on every
    // parent render. Keeping it in a ref lets the reset effect depend on `isOpen`
    // alone — otherwise an unrelated parent re-render wipes pending edits.
    const filtersRef = useRef(filters);
    filtersRef.current = filters;
    const defaultsRef = useRef(defaults);
    defaultsRef.current = defaults;

    // Pending filters (not applied until Save Changes). The open-effect below
    // re-seeds this on every open; this initial value only covers the first
    // render, when the panel is not visible yet.
    const [pendingFilters, setPendingFilters] = useState({
        genres: [],
        keywords: [],
        ...defaults,
        ...filters
    });

    // Seed the pending filters from the applied ones each time the panel opens.
    useEffect(() => {
        if (isOpen) {
            const applied = filtersRef.current || {};
            const base = defaultsRef.current || BASE_DEFAULTS;
            setPendingFilters({
                // Anything the caller tracks that this panel does not render is
                // spread first so Save hands it straight back untouched.
                ...applied,
                genres: applied.genres || [],
                keywords: applied.keywords || [],
                // `||`, not `??`: callers build these from query params and pass
                // '' for "not set", which has to fall through to the baseline.
                year: applied.year || base.year || '',
                rating: applied.rating || base.rating || '',
                sort_by: applied.sort_by || base.sort_by || 'popularity.desc'
            });
        }
    }, [isOpen]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Prevent body scroll when panel is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const getGenres = () => {
        if (mediaType === 'tv') return TV_GENRES;
        if (mediaType === 'movie') return MOVIE_GENRES;
        // For 'both', merge and dedupe
        const merged = [...MOVIE_GENRES];
        TV_GENRES.forEach(g => {
            if (!merged.find(m => m.id === g.id)) {
                merged.push(g);
            }
        });
        return merged.sort((a, b) => a.name.localeCompare(b.name));
    };

    const getSortOptions = () => (mediaType === 'tv' ? TV_SORT_OPTIONS : MOVIE_SORT_OPTIONS);

    // Which pending list a category writes to. Keyword categories are kept apart
    // from genres because they go out on a different TMDB param.
    const listKeyFor = (category) =>
        category.param === 'with_keywords' ? 'keywords' : 'genres';

    const isCategorySelected = (category) =>
        (pendingFilters[listKeyFor(category)] || []).includes(category.id);

    const toggleCategory = (category) => {
        const listKey = listKeyFor(category);
        setPendingFilters(prev => {
            const list = prev[listKey] || [];
            return {
                ...prev,
                [listKey]: list.includes(category.id)
                    ? list.filter(id => id !== category.id)
                    : [...list, category.id]
            };
        });
    };

    const toggleGenre = (genreId) => {
        setPendingFilters(prev => {
            const genres = prev.genres || [];
            if (genres.includes(genreId)) {
                return { ...prev, genres: genres.filter(id => id !== genreId) };
            } else {
                return { ...prev, genres: [...genres, genreId] };
            }
        });
    };

    const handleClear = () => {
        setPendingFilters({
            genres: [],
            keywords: [],
            ...BASE_DEFAULTS,
            ...defaults
        });
    };

    const handleSave = () => {
        onApply(pendingFilters);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="filter-panel-backdrop" onClick={onClose} aria-hidden="true" />

            {/* Panel */}
            <div className="filter-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="filter-panel-title" data-nav-trap>
                {/* Header */}
                <div className="filter-panel-header">
                    <h2 id="filter-panel-title">Filters</h2>
                    <button className="filter-panel-close" onClick={onClose} aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <p className="filter-panel-description">
                    Narrow down your search results with the following filters.
                </p>

                {/* Scrollable Content */}
                <div className="filter-panel-content">
                    {/* Categories / Genres Section. `categories` mirrors the
                        discover bar one-for-one so every pill there is also
                        deselectable here; without it we fall back to genres. */}
                    <div className="filter-section">
                        <h3 className="filter-section-title">{categories ? 'Categories' : 'Genres'}</h3>
                        <div className="filter-genre-chips" role="group" aria-label={categories ? 'Category filters' : 'Genre filters'}>
                            {categories
                                ? categories.map(category => (
                                    <button
                                        key={category.key}
                                        className={`filter-genre-chip ${isCategorySelected(category) ? 'selected' : ''}`}
                                        onClick={() => toggleCategory(category)}
                                        aria-pressed={isCategorySelected(category)}
                                        aria-label={`Filter by ${category.name}`}
                                    >
                                        {category.name}
                                    </button>
                                ))
                                : getGenres().map(genre => (
                                    <button
                                        key={genre.id}
                                        className={`filter-genre-chip ${pendingFilters.genres?.includes(genre.id) ? 'selected' : ''}`}
                                        onClick={() => toggleGenre(genre.id)}
                                        aria-pressed={pendingFilters.genres?.includes(genre.id)}
                                        aria-label={`Filter by ${genre.name}`}
                                    >
                                        {genre.name}
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Year Section */}
                    <div className="filter-section">
                        <h3 className="filter-section-title">{mediaType === 'tv' ? 'First Air Year' : 'Release Year'}</h3>
                        <select
                            className="filter-select"
                            value={pendingFilters.year || ''}
                            onChange={(e) => setPendingFilters(prev => ({ ...prev, year: e.target.value }))}
                        >
                            {!defaults.year && <option value="">Any year</option>}
                            {Array.from({ length: CURRENT_YEAR - 1950 + 1 }, (_, i) => CURRENT_YEAR - i).map(year => (
                                <option key={year} value={year}>
                                    {year === CURRENT_YEAR ? `${year} (Latest Year)` : year}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Rating Section */}
                    <div className="filter-section">
                        <h3 className="filter-section-title">Rating</h3>
                        <select
                            className="filter-select"
                            value={pendingFilters.rating || ''}
                            onChange={(e) => setPendingFilters(prev => ({ ...prev, rating: e.target.value }))}
                        >
                            {RATINGS.filter(r => r.value || !defaults.rating).map(r => (
                                <option key={r.value} value={r.value}>{r.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sort By Section */}
                    <div className="filter-section">
                        <h3 className="filter-section-title">Sort by</h3>
                        <select
                            className="filter-select"
                            value={pendingFilters.sort_by || ''}
                            onChange={(e) => setPendingFilters(prev => ({ ...prev, sort_by: e.target.value }))}
                        >
                            <option value="popularity.desc">Most Popular</option>
                            {getSortOptions().map(s => (
                                <option key={s.value} value={s.value}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="filter-panel-footer">
                    <button className="filter-btn-clear" onClick={handleClear}>
                        Clear
                    </button>
                    <button className="filter-btn-save" onClick={handleSave}>
                        Save Changes
                    </button>
                </div>
            </div>
        </>
    );
};

export default FilterPanel;
