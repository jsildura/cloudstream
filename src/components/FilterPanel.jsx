import React, { useState, useEffect, useRef } from 'react';
import './FilterPanel.css';

// Genre lists for movies and TV
const MOVIE_GENRES = [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 14, name: 'Fantasy' },
    { id: 36, name: 'History' },
    { id: 27, name: 'Horror' },
    { id: 10402, name: 'Music' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Sci-Fi' },
    { id: 53, name: 'Thriller' },
    { id: 10752, name: 'War' },
    { id: 37, name: 'Western' }
];

const TV_GENRES = [
    { id: 10759, name: 'Action & Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 10762, name: 'Kids' },
    { id: 9648, name: 'Mystery' },
    { id: 10763, name: 'News' },
    { id: 10764, name: 'Reality' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 10766, name: 'Soap' },
    { id: 10767, name: 'Talk' },
    { id: 10768, name: 'War & Politics' },
    { id: 37, name: 'Western' }
];

// Streaming providers
const PROVIDERS = [
    { id: 8, name: 'Netflix', logo: '/provider/netflix.png' },
    { id: 337, name: 'Disney Plus', logo: '/provider/disney_plus.png' },
    { id: 9, name: 'Prime Video', logo: '/provider/prime_video.png' },
    { id: 350, name: 'Apple TV+', logo: '/provider/apple_tv_plus.png' },
    { id: 384, name: 'HBO Max', logo: '/provider/hbo_max.png' },
    { id: 158, name: 'Viu', logo: '/provider/viu.png' }
];

// Ratings
const RATINGS = [
    { value: '', name: 'Any rating' },
    { value: '9', name: '9+ Excellent' },
    { value: '8', name: '8+ Great' },
    { value: '7', name: '7+ Good' },
    { value: '6', name: '6+ Fair' },
    { value: '5', name: '5+ Average' }
];

// Sort options
const SORT_OPTIONS = [
    { value: 'primary_release_date.desc', name: 'Most Recent' },
    { value: 'primary_release_date.asc', name: 'Least Recent' },
    { value: 'vote_average.desc', name: 'Highest Rating' },
    { value: 'vote_average.asc', name: 'Lowest Rating' }
];

const FilterPanel = ({
    isOpen,
    onClose,
    filters = {},
    onApply,
    mediaType = 'movie', // 'movie', 'tv', or 'both'
    showProviders = false
}) => {
    const panelRef = useRef(null);

    // Pending filters (not applied until Save Changes)
    const [pendingFilters, setPendingFilters] = useState({
        genres: [],
        year: '',
        rating: '',
        providers: [],
        sort_by: 'popularity.desc',
        ...filters
    });

    // Provider search
    const [providerSearch, setProviderSearch] = useState('');
    const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);

    // Reset pending filters when panel opens
    useEffect(() => {
        if (isOpen) {
            setPendingFilters({
                genres: filters.genres || [],
                year: filters.year || '',
                rating: filters.rating || '',
                providers: filters.providers || [],
                sort_by: filters.sort_by || 'popularity.desc',
                ...filters
            });
        }
    }, [isOpen, filters]);

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

    const toggleProvider = (providerId) => {
        setPendingFilters(prev => {
            const providers = prev.providers || [];
            if (providers.includes(providerId)) {
                return { ...prev, providers: providers.filter(id => id !== providerId) };
            } else {
                return { ...prev, providers: [...providers, providerId] };
            }
        });
    };

    const handleClear = () => {
        setPendingFilters({
            genres: [],
            year: '',
            rating: '',
            providers: [],
            sort_by: 'popularity.desc'
        });
    };

    const handleSave = () => {
        onApply(pendingFilters);
        onClose();
    };

    const filteredProviders = PROVIDERS.filter(p =>
        p.name.toLowerCase().includes(providerSearch.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="filter-panel-backdrop" onClick={onClose} />

            {/* Panel */}
            <div className="filter-panel" ref={panelRef}>
                {/* Header */}
                <div className="filter-panel-header">
                    <h2>Filters</h2>
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
                    {/* Genres Section */}
                    <div className="filter-section">
                        <h3 className="filter-section-title">Genres</h3>
                        <div className="filter-genre-chips">
                            {getGenres().map(genre => (
                                <button
                                    key={genre.id}
                                    className={`filter-genre-chip ${pendingFilters.genres?.includes(genre.id) ? 'selected' : ''}`}
                                    onClick={() => toggleGenre(genre.id)}
                                >
                                    {genre.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Year Section */}
                    <div className="filter-section">
                        <h3 className="filter-section-title">Release Year</h3>
                        <select
                            className="filter-select"
                            value={pendingFilters.year || ''}
                            onChange={(e) => setPendingFilters(prev => ({ ...prev, year: e.target.value }))}
                        >
                            <option value="">Any year</option>
                            {Array.from({ length: new Date().getFullYear() - 1950 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                <option key={year} value={year}>{year}</option>
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
                            {RATINGS.map(r => (
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
                            <option value="">Default</option>
                            {SORT_OPTIONS.map(s => (
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
