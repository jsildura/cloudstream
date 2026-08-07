import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import { cardPoster } from '../utils/images';
import './MyList.css';

const MyList = () => {
    const navigate = useNavigate();
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
    const { watchlist, removeFromWatchlist, clearWatchlist } = useWatchlist();
    const { showSuccess } = useToast();
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Sort logic
    const [sortBy, setSortBy] = useState('addedAt');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const sortOptions = [
        { value: 'addedAt', label: 'Recently Added' },
        { value: 'title', label: 'Title A-Z' },
        { value: 'rating', label: 'Highest Rated' }
    ];

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sort watchlist based on selected option
    const sortedWatchlist = [...watchlist].sort((a, b) => {
        switch (sortBy) {
            case 'title':
                return (a.title || '').localeCompare(b.title || '');
            case 'rating':
                return (b.vote_average || 0) - (a.vote_average || 0);
            case 'addedAt':
            default:
                return (b.addedAt || 0) - (a.addedAt || 0);
        }
    });

    const handleItemClick = async (item) => {
        const type = item.type || 'movie';
        const genreMap = type === 'movie' ? movieGenres : tvGenres;
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

    const handleRemove = (e, id) => {
        e.stopPropagation();
        removeFromWatchlist(id);
        showSuccess('Removed from Watchlist');
    };

    const selectedLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort By';

    return (
        <div className="mylist-page">
            <div className="mylist-header">
                <h1 className="mylist-title">My Watchlist</h1>
                <div className="mylist-controls">
                    {/* Custom Dropdown */}
                    <div className="mylist-custom-select" ref={dropdownRef}>
                        <div
                            className={`mylist-custom-select-trigger ${isDropdownOpen ? 'open' : ''}`}
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            role="button"
                            tabIndex={0}
                        >
                            <span>{selectedLabel}</span>
                            <svg
                                className="mylist-select-arrow"
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                        {isDropdownOpen && (
                            <div className="mylist-custom-select-options">
                                {sortOptions.map(option => (
                                    <div
                                        key={option.value}
                                        className={`mylist-custom-option ${sortBy === option.value ? 'selected' : ''}`}
                                        onClick={() => {
                                            setSortBy(option.value);
                                            setIsDropdownOpen(false);
                                        }}
                                        role="option"
                                        aria-selected={sortBy === option.value}
                                    >
                                        <span>{option.label}</span>
                                        {sortBy === option.value && (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mylist-check-icon">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {watchlist.length > 0 && (
                        <button
                            onClick={() => {
                                if (window.confirm('Clear all items from your list?')) {
                                    clearWatchlist();
                                }
                            }}
                            className="mylist-clear-btn"
                        >
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {watchlist.length === 0 ? (
                <div className="mylist-empty">
                    <div className="mylist-empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                        </svg>
                    </div>
                    <h3>Your list is empty</h3>
                    <p>Add movies and TV shows to your list to watch later.</p>
                    <button className="mylist-empty-cta" onClick={() => navigate('/discover')}>
                        Browse Movies &amp; TV Shows
                    </button>
                </div>
            ) : (
                <>
                    <p className="mylist-count">{watchlist.length} item{watchlist.length !== 1 ? 's' : ''}</p>
                    <div className="mylist-grid">
                        {sortedWatchlist.map((item) => {
                        // Portrait 2:3 card — the placeholder art is decorative,
                        // so letterbox it via CSS when TMDB has no poster.
                        const poster = cardPoster(item.poster_path) ?? '/icons/placeholder.svg';
                        const isPlaceholder = poster === '/icons/placeholder.svg';
                        return (
                            <div
                                key={item.id}
                                className="mylist-card"
                                onClick={() => handleItemClick(item)}
                                tabIndex={0}
                                role="button"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleItemClick(item);
                                    }
                                }}
                            >
                                <div className="mylist-card-image-container">
                                    <img
                                        src={poster}
                                        alt={item.title || item.name || 'Title'}
                                        className={`mylist-card-image${isPlaceholder ? ' mylist-card-image-placeholder' : ''}`}
                                        loading="lazy"
                                    />
                                    <button
                                        className="mylist-remove-btn"
                                        onClick={(e) => handleRemove(e, item.id)}
                                        title="Remove from list"
                                        aria-label={`Remove ${item.title || item.name} from list`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 6 6 18" />
                                            <path d="m6 6 12 12" />
                                        </svg>
                                    </button>
                                    <span className="mylist-card-type">{item.type === 'tv' ? 'TV' : 'Movie'}</span>
                                </div>
                                <div className="mylist-card-info">
                                    <h3 className="mylist-card-title">{item.title || item.name}</h3>
                                    {item.vote_average > 0 && (
                                        <span className="mylist-card-rating">
                                            ★ {item.vote_average.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                        })}
                    </div>
                </>
            )}

            {isModalOpen && selectedItem && (
                <Modal item={selectedItem} onClose={closeModal} />
            )}
        </div>
    );
};

export default MyList;
