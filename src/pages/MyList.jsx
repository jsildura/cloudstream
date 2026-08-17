import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import { useAuth } from '../contexts/AuthContext';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import PageLoader from '../components/PageLoader';
import { cardPoster } from '../utils/images';
import { LogIn, Bookmark, Trash2, ArrowUpDown, Compass } from 'lucide-react';
import './MyList.css';

const MyList = () => {
    const navigate = useNavigate();
    const { isSignedIn, signInWithGoogle } = useAuth();
    const { movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
    const { watchlist, isLoading, removeFromWatchlist, clearWatchlist } = useWatchlist();
    const { showSuccess, showError } = useToast();
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

    const handleRemove = async (e, item) => {
        e.stopPropagation();
        const res = await removeFromWatchlist(item.type || 'movie', item.id);
        if (res?.ok !== false) {
            showSuccess('Removed from Watchlist');
        } else {
            showError('Failed to remove item');
        }
    };

    const selectedLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort By';

    // State 1: Loading
    if (isLoading) {
        return (
            <div className="mylist-page">
                <PageLoader />
            </div>
        );
    }

    // State 2: Signed-Out CTA
    if (!isSignedIn) {
        return (
            <div className="mylist-page">
                <div className="mylist-empty signed-out-cta">
                    <div className="mylist-empty-icon">
                        <Bookmark size={36} />
                    </div>
                    <h3>Sign in to track your Watchlist</h3>
                    <p>
                        Keep your movies and TV shows synchronized across all your devices and profiles.
                    </p>
                    <button
                        className="mylist-empty-cta"
                        onClick={async () => {
                            try {
                                await signInWithGoogle();
                            } catch {
                                // Handled in AuthContext
                            }
                        }}
                    >
                        <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>Sign In with Google</span>
                    </button>
                </div>
            </div>
        );
    }

    // State 3: Signed-In Empty or List
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
                        <Compass size={18} />
                        <span>Browse Movies &amp; TV Shows</span>
                    </button>
                </div>
            ) : (
                <>
                    <p className="mylist-count">{watchlist.length} item{watchlist.length !== 1 ? 's' : ''}</p>
                    <div className="mylist-grid">
                        {sortedWatchlist.map((item) => {
                            const poster = cardPoster(item.poster_path) ?? '/icons/placeholder.svg';
                            const isPlaceholder = poster === '/icons/placeholder.svg';
                            return (
                                <div
                                    key={`${item.type || 'movie'}_${item.id}`}
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
                                            onClick={(e) => handleRemove(e, item)}
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
