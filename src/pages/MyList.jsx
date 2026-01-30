import React, { useState, useRef, useEffect } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import './MyList.css';

const POSTER_URL = 'https://image.tmdb.org/t/p/w500';

const MyList = () => {
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                    </svg>
                    <h3>Your list is empty</h3>
                    <p>Add movies and TV shows to your list to watch later.</p>
                </div>
            ) : (
                <>
                    <p className="mylist-count">{watchlist.length} item{watchlist.length !== 1 ? 's' : ''}</p>
                    <div className="mylist-grid">
                        {sortedWatchlist.map((item) => (
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
                                        src={item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/placeholder-poster.jpg'}
                                        alt={item.title}
                                        className="mylist-card-image"
                                        loading="lazy"
                                    />
                                    <div className="mylist-card-overlay">
                                        <button
                                            className="mylist-remove-btn"
                                            onClick={(e) => handleRemove(e, item.id)}
                                            title="Remove from list"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 6 6 18" />
                                                <path d="m6 6 12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <span className="mylist-card-type">{item.type === 'tv' ? 'TV' : 'Movie'}</span>
                                </div>
                                <div className="mylist-card-info">
                                    <h3 className="mylist-card-title">{item.title}</h3>
                                    {item.vote_average > 0 && (
                                        <span className="mylist-card-rating">
                                            ★ {item.vote_average.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
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
