import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import InstallAppButton from './InstallAppButton';
import SearchModal from './SearchModal';

const RECENT_SEARCHES_KEY = 'streamflix_recent_searches';
const MAX_RECENT_SEARCHES = 5;
const MAX_TRENDING = 10;

const Navbar = ({ onSearch, searchResults, onItemClick, isSearching }) => {
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [trendingSearches, setTrendingSearches] = useState([]);
  const [tvDropdownOpen, setTvDropdownOpen] = useState(false);
  const [tvMenuOpen, setTvMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const debounceTimerRef = useRef(null);

  // Bottom sheet drag state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const sheetRef = useRef(null);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading recent searches:', e);
    }
  }, []);

  // Fetch trending from TMDB on mount
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const response = await fetch('/api/trending/all/week');
        if (response.ok) {
          const data = await response.json();
          const trending = data.results
            ?.slice(0, MAX_TRENDING)
            .map(item => ({
              id: item.id,
              name: item.title || item.name,
              title: item.title,
              media_type: item.media_type,
              type: item.media_type,
              backdrop_path: item.backdrop_path,
              poster_path: item.poster_path,
              overview: item.overview,
              vote_average: item.vote_average,
              genre_ids: item.genre_ids,
              release_date: item.release_date,
              first_air_date: item.first_air_date
            })) || [];
          setTrendingSearches(trending);
        }
      } catch (e) {
        console.error('Error fetching trending:', e);
      }
    };
    fetchTrending();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Function to get poster image URL
  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/w92${posterPath}`;
  };

  // Save a search to recent searches
  const saveRecentSearch = useCallback((query) => {
    if (!query || query.trim().length === 0) return;

    const trimmed = query.trim();
    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving recent searches:', e);
    }
  }, [recentSearches]);

  // Remove a recent search
  const removeRecentSearch = useCallback((query, e) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== query);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error removing recent search:', e);
    }
  }, [recentSearches]);

  // Clear search input
  const clearSearchInput = useCallback(() => {
    setSearchQuery('');
    if (onSearch) {
      onSearch('');
    }
  }, [onSearch]);

  // Handle suggestion click (recent or trending)
  const handleSuggestionClick = useCallback((query) => {
    setSearchQuery(query);
    if (onSearch) {
      onSearch(query);
    }
  }, [onSearch]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce search API call by 300ms
    debounceTimerRef.current = setTimeout(() => {
      if (onSearch) {
        onSearch(value);
      }
    }, 300);
  };

  const handleInputFocus = () => {
    setIsSearchFocused(true);
  };

  const handleSearchBlur = () => {
    setTimeout(() => {
      setIsSearchFocused(false);
    }, 200);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleItemSelect = (item) => {
    // Save the search query to recent searches
    if (searchQuery) {
      saveRecentSearch(searchQuery);
    }
    if (onItemClick) {
      onItemClick(item);
    }
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsMobileSearchOpen(false);
  };

  const toggleMobileSearch = () => {
    setIsMobileSearchOpen(!isMobileSearchOpen);
    if (!isMobileSearchOpen) {
      setTimeout(() => {
        const input = document.querySelector('.navbar-search-input');
        if (input) input.focus();
      }, 100);
    }
  };

  // Bottom sheet drag handlers
  const handleTouchStart = useCallback((e) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - dragStartY.current;
    // Only allow dragging down (positive diff)
    if (diff > 0) {
      setDragY(diff);
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // Close if dragged more than 100px down
    if (dragY > 100) {
      closeMenu();
    }
    setDragY(0);
  }, [dragY]);

  // Reset drag state when menu closes and toggle body class for FAB hiding
  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add('mobile-menu-open');
    } else {
      document.body.classList.remove('mobile-menu-open');
      setDragY(0);
      setIsDragging(false);
      // Reset the one remaining submenu (TV / live content) when closing
      setTvMenuOpen(false);
    }
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('mobile-menu-open');
    };
  }, [isMenuOpen]);


  // Show suggestions when focused and no query
  const showSuggestions = isSearchFocused && !searchQuery && (recentSearches.length > 0 || trendingSearches.length > 0);


  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`} data-nav-section="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img
            src="/logo/streamflix-nav-logo.png"
            alt="StreamFlix Logo"
            className="logo-image"
          />
        </Link>

        <div className="navbar-links">
          <NavLink to="/" end className="nav-link">Home</NavLink>
          <NavLink to="/tv-shows" className="nav-link">Shows</NavLink>

          <NavLink to="/discover" className="nav-link">Movies</NavLink>

          {/* TV Dropdown */}
          <div
            className="nav-dropdown-wrapper"
            onMouseEnter={() => setTvDropdownOpen(true)}
            onMouseLeave={() => setTvDropdownOpen(false)}
          >
            <span className={`nav-link nav-link-dropdown ${location.pathname.startsWith('/iptv') ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
              TV
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dropdown-arrow">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>

            {tvDropdownOpen && (
              <div className="nav-mega-dropdown">
                {/* Header */}
                <div className="mega-dropdown-header">
                  <div className="mega-dropdown-header-title-row">
                    <img src="/icons/tv.svg" alt="TV" className="mega-dropdown-icon" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                    <h3>TV</h3>
                  </div>
                  <p className="mega-dropdown-header-desc">Dive into a world of live television featuring your favorite news, sports, and entertainment. With a constantly evolving channel lineup, you’ll always be in the loop. Experience the best of live broadcasting, delivered straight to your screen, anytime, anywhere.</p>
                </div>

                <div className="mega-dropdown-grid">
                  <Link to="/iptv" className="mega-dropdown-card" onClick={() => setTvDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                        <polyline points="17 2 12 7 7 2" />
                      </svg>
                    </div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Live TV</div>
                      <p>Your destination for live TV. Enjoy news, sports, and entertainment on demand with a fresh, diverse lineup of channels at your fingertips.</p>
                    </div>
                  </Link>

                  {/* Temporarily disabled - Live Sports
                  <Link to="/sports" className="mega-dropdown-card" onClick={() => setTvDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">
                      <img src="/icons/sports.svg" alt="Live Sports" width="20" height="20" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                    </div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Live Sports</div>
                      <p>Stream global sports, matches, and tournaments in real-time. Your front-row seat to every game, anywhere in the world.</p>
                    </div>
                  </Link>
                  */}

                </div>
              </div>
            )}
          </div>

          {/* Temporarily disabled - Music
          <NavLink to="/music" className="nav-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Music
          </NavLink>
          */}

          <NavLink to="/my-list" className="nav-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Watchlist
          </NavLink>

        </div>

        {/* PWA Install Button - Desktop View */}
        <InstallAppButton />

        {/* Desktop Search Button - Opens Modal */}
        <button
          className="navbar-search-btn"
          onClick={() => setIsSearchModalOpen(true)}
          aria-label="Search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
        </button>

        {/* Mobile Search Button - Opens Modal */}
        <button
          className="mobile-search-btn"
          onClick={() => setIsSearchModalOpen(true)}
          aria-label="Search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          <span className="mobile-search-label">Search</span>
        </button>

        <button
          className={`menu-toggle ${isMenuOpen ? 'open' : ''}`}
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Bottom Sheet Mobile Menu */}
        <div
          ref={sheetRef}
          className={`bottom-sheet-menu ${isMenuOpen ? 'open' : ''}`}
          style={{
            transform: isMenuOpen ? `translateY(${dragY}px)` : 'translateY(100%)',
            transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag Handle */}
          <div className="bottom-sheet-handle-container">
            <div className="bottom-sheet-handle"></div>
          </div>

          {/* Header */}
          <div className="bottom-sheet-header">
            <h3>Menu</h3>
          </div>

          {/* Menu Items */}
          <div className="bottom-sheet-content">
            {/* Home - Non-expandable */}
            <NavLink to="/" end className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
              <div className="bottom-sheet-item-header">
                <div className="bottom-sheet-item-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                </div>
                <span className="bottom-sheet-item-label">Home</span>
              </div>
            </NavLink>

            {/* Movies - Non-expandable */}
            <NavLink to="/discover" className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
              <div className="bottom-sheet-item-header">
                <div className="bottom-sheet-item-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                    <line x1="7" y1="2" x2="7" y2="22" />
                    <line x1="17" y1="2" x2="17" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="2" y1="7" x2="7" y2="7" />
                    <line x1="2" y1="17" x2="7" y2="17" />
                    <line x1="17" y1="17" x2="22" y2="17" />
                    <line x1="17" y1="7" x2="22" y2="7" />
                  </svg>
                </div>
                <span className="bottom-sheet-item-label">Movies</span>
              </div>
            </NavLink>

            {/* Shows - Non-expandable */}
            <NavLink to="/tv-shows" className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
              <div className="bottom-sheet-item-header">
                <div className="bottom-sheet-item-icon">
                  <img src="/icons/shows.svg" alt="Shows" width="20" height="20" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                </div>
                <span className="bottom-sheet-item-label">Shows</span>
              </div>
            </NavLink>

            {/* TV Section */}
            <div className="bottom-sheet-item">
              <div
                className={`bottom-sheet-item-header ${tvMenuOpen ? 'open' : ''} ${location.pathname.startsWith('/iptv') ? 'active' : ''}`}
                onClick={() => setTvMenuOpen(!tvMenuOpen)}
              >
                <div className="bottom-sheet-item-icon">
                  <img src="/icons/tv.svg" alt="TV" width="20" height="20" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                </div>
                <span className="bottom-sheet-item-label">TV</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bottom-sheet-chevron">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              <div className={`bottom-sheet-submenu ${tvMenuOpen ? 'open' : ''}`}>
                <Link to="/iptv" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                    <polyline points="17 2 12 7 7 2" />
                  </svg>
                  <span>Live TV</span>
                </Link>
                {/* Temporarily disabled - Live Sports
                <Link to="/sports" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <img src="/icons/sports.svg" alt="Live Sports" width="16" height="16" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                  <span>Live Sports</span>
                </Link>
                */}
              </div>
            </div>

            {/* Temporarily disabled - Music
            <NavLink to="/music" className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
              <div className="bottom-sheet-item-header">
                <div className="bottom-sheet-item-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <span className="bottom-sheet-item-label">Music</span>
              </div>
            </NavLink>
            */}

            {/* Watchlist - Non-expandable */}
            <NavLink to="/my-list" className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
              <div className="bottom-sheet-item-header">
                <div className="bottom-sheet-item-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </div>
                <span className="bottom-sheet-item-label">Watchlist</span>
              </div>
            </NavLink>

            {/* Install App Button */}
            <div className="bottom-sheet-install">
              <InstallAppButton />
            </div>
          </div>
        </div>

        {/* Backdrop Overlay */}
        {isMenuOpen && <div className="bottom-sheet-overlay" onClick={closeMenu} data-nav-trap></div>}

      </div>

      {/* Search Modal */}
      {isSearchModalOpen && (
        <SearchModal
          searchResults={searchResults}
          onSearch={onSearch}
          onClose={() => setIsSearchModalOpen(false)}
          onItemClick={onItemClick}
          isSearching={isSearching}
          trendingItems={trendingSearches}
        />
      )}
    </nav >
  );
};

export default Navbar;