import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import InstallAppButton from './InstallAppButton';
import SearchModal from './SearchModal';

const RECENT_SEARCHES_KEY = 'streamflix_recent_searches';
const MAX_RECENT_SEARCHES = 5;
const MAX_TRENDING = 10;

const Navbar = ({ onSearch, searchResults, onItemClick, isSearching }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [trendingSearches, setTrendingSearches] = useState([]);
  const [moviesDropdownOpen, setMoviesDropdownOpen] = useState(false);
  const [tvShowsDropdownOpen, setTvShowsDropdownOpen] = useState(false);
  const [tvDropdownOpen, setTvDropdownOpen] = useState(false);
  const [moviesMenuOpen, setMoviesMenuOpen] = useState(false);
  const [tvShowsMenuOpen, setTvShowsMenuOpen] = useState(false);
  const [tvMenuOpen, setTvMenuOpen] = useState(false);
  const [platformsMenuOpen, setPlatformsMenuOpen] = useState(false);
  const [trendingMenuOpen, setTrendingMenuOpen] = useState(false);
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
      // Reset all submenus when closing
      setMoviesMenuOpen(false);
      setTvShowsMenuOpen(false);
      setTvMenuOpen(false);
      setTrendingMenuOpen(false);
    }
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('mobile-menu-open');
    };
  }, [isMenuOpen]);


  // Show suggestions when focused and no query
  const showSuggestions = isSearchFocused && !searchQuery && (recentSearches.length > 0 || trendingSearches.length > 0);


  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img
            src="/logo/streamflix-nav-logo.png"
            alt="StreamFlix Logo"
            className="logo-image"
          />
        </Link>

        <div className="navbar-links">
          <Link to="/" className="nav-link">Home</Link>
          {/* TV Shows Dropdown */}
          <div
            className="nav-dropdown-wrapper"
            onMouseEnter={() => setTvShowsDropdownOpen(true)}
            onMouseLeave={() => setTvShowsDropdownOpen(false)}
          >
            <span className="nav-link nav-link-dropdown" style={{ cursor: 'pointer' }}>
              Shows
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dropdown-arrow">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>

            {tvShowsDropdownOpen && (
              <div className="nav-mega-dropdown">
                {/* Header */}
                <div className="mega-dropdown-header">
                  <div className="mega-dropdown-header-title-row">
                    <img src="/icons/shows.svg" alt="Shows" className="mega-dropdown-icon" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                    <h3>Shows</h3>
                  </div>
                  <p className="mega-dropdown-header-desc">Discover captivating TV series from around the world. From binge-worthy dramas to hilarious comedies, find your next obsession.</p>
                </div>

                {/* Categories Grid */}
                <div className="mega-dropdown-grid">
                  <Link to="/tv-shows" className="mega-dropdown-card mega-dropdown-card-featured" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Discover</div>
                      <p>Browse our extensive collection of TV series across all genres.</p>
                    </div>
                  </Link>

                  <Link to="/trending-tv" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><img src="/icons/trend.svg" alt="Trending" width="20" height="20" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} /></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Trending Now</div>
                      <p>See what TV shows everyone is talking about right now.</p>
                    </div>
                  </Link>

                  <Link to="/top-rated-tv" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Top Rated</div>
                      <p>Explore the highest-rated TV series of all time.</p>
                    </div>
                  </Link>

                  <Link to="/anime-series" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg stroke="currentColor" fill="currentColor" strokeWidth="0" role="img" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M2.933 13.467a10.55 10.55 0 1 1 21.067-.8V12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12h.8a10.617 10.617 0 0 1-9.867-10.533zM19.2 14a3.85 3.85 0 0 1-1.333-7.467A7.89 7.89 0 0 0 14 5.6a8.4 8.4 0 1 0 8.4 8.4 6.492 6.492 0 0 0-.133-1.6A3.415 3.415 0 0 1 19.2 14z"></path></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Anime Series</div>
                      <p>Dive into the world of Japanese animated series.</p>
                    </div>
                  </Link>

                  <Link to="/popular-tv" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Popular</div>
                      <p>Discover the most popular TV shows worldwide.</p>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Movies Dropdown */}
          <div
            className="nav-dropdown-wrapper"
            onMouseEnter={() => setMoviesDropdownOpen(true)}
            onMouseLeave={() => setMoviesDropdownOpen(false)}
          >
            <span className="nav-link nav-link-dropdown" style={{ cursor: 'pointer' }}>
              Movies
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dropdown-arrow">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>

            {moviesDropdownOpen && (
              <div className="nav-mega-dropdown">
                {/* Header */}
                <div className="mega-dropdown-header">
                  <div className="mega-dropdown-header-title-row">
                    <img src="/logo/movie-outline.svg" alt="Movies" className="mega-dropdown-icon" style={{ filter: 'brightness(0) invert(1)' }} />
                    <h3>Movies</h3>
                  </div>
                  <p className="mega-dropdown-header-desc">Explore a world of movies with our extensive film library. From iconic classics to today’s biggest hits, discover your next must-watch anytime.</p>
                </div>
                <div className="mega-dropdown-grid">
                  <Link to="/discover" className="mega-dropdown-card mega-dropdown-card-featured" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Discover</div>
                      <p>Find fresh discoveries and exciting new titles in cinema today.</p>
                    </div>
                  </Link>

                  <Link to="/trending" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><img src="/icons/trend.svg" alt="Trending" width="20" height="20" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} /></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Trending Now</div>
                      <p>Dive into the world of trending movies that have captured hearts.</p>
                    </div>
                  </Link>

                  <Link to="/top-rated" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Top Rated</div>
                      <p>Explore the pinnacle of cinematic excellence with top-rated films.</p>
                    </div>
                  </Link>

                  <Link to="/anime-movies" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg stroke="currentColor" fill="currentColor" strokeWidth="0" role="img" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M2.933 13.467a10.55 10.55 0 1 1 21.067-.8V12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12h.8a10.617 10.617 0 0 1-9.867-10.533zM19.2 14a3.85 3.85 0 0 1-1.333-7.467A7.89 7.89 0 0 0 14 5.6a8.4 8.4 0 1 0 8.4 8.4 6.492 6.492 0 0 0-.133-1.6A3.415 3.415 0 0 1 19.2 14z"></path></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Anime Movies</div>
                      <p>Embark on an epic journey with our handpicked anime movies.</p>
                    </div>
                  </Link>

                  <Link to="/popular" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Popular</div>
                      <p>Discover what everyone is watching right now.</p>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* TV Dropdown */}
          <div
            className="nav-dropdown-wrapper"
            onMouseEnter={() => setTvDropdownOpen(true)}
            onMouseLeave={() => setTvDropdownOpen(false)}
          >
            <span className="nav-link nav-link-dropdown" style={{ cursor: 'pointer' }}>
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

          <Link to="/music" className="nav-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Music
          </Link>

          <Link to="/my-list" className="nav-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Watchlist
          </Link>

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
            {/* Movies Section */}
            <div className="bottom-sheet-item">
              <div
                className={`bottom-sheet-item-header ${moviesMenuOpen ? 'open' : ''}`}
                onClick={() => setMoviesMenuOpen(!moviesMenuOpen)}
              >
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
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bottom-sheet-chevron">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              <div className={`bottom-sheet-submenu ${moviesMenuOpen ? 'open' : ''}`}>
                <Link to="/discover" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                  <span>Discover</span>
                </Link>
                <Link to="/trending" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <img src="/icons/trend.svg" alt="Trending" width="16" height="16" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                  <span>Trending Now</span>
                </Link>
                <Link to="/top-rated" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>Top Rated</span>
                </Link>
                <Link to="/anime-movies" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" role="img" viewBox="0 0 24 24" className="mr-2 size-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M2.933 13.467a10.55 10.55 0 1 1 21.067-.8V12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12h.8a10.617 10.617 0 0 1-9.867-10.533zM19.2 14a3.85 3.85 0 0 1-1.333-7.467A7.89 7.89 0 0 0 14 5.6a8.4 8.4 0 1 0 8.4 8.4 6.492 6.492 0 0 0-.133-1.6A3.415 3.415 0 0 1 19.2 14z"></path></svg>
                  <span>Anime Movies</span>
                </Link>
                <Link to="/popular" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span>Popular</span>
                </Link>
              </div>
            </div>

            {/* Shows Section */}
            <div className="bottom-sheet-item">
              <div
                className={`bottom-sheet-item-header ${tvShowsMenuOpen ? 'open' : ''}`}
                onClick={() => setTvShowsMenuOpen(!tvShowsMenuOpen)}
              >
                <div className="bottom-sheet-item-icon">
                  <img src="/icons/shows.svg" alt="Shows" width="20" height="20" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                </div>
                <span className="bottom-sheet-item-label">Shows</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bottom-sheet-chevron">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              <div className={`bottom-sheet-submenu ${tvShowsMenuOpen ? 'open' : ''}`}>
                <Link to="/tv-shows" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                  <span>Discover</span>
                </Link>
                <Link to="/trending-tv" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <img src="/icons/trend.svg" alt="Trending" width="16" height="16" style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }} />
                  <span>Trending Now</span>
                </Link>
                <Link to="/top-rated-tv" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>Top Rated</span>
                </Link>
                <Link to="/anime-series" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" role="img" viewBox="0 0 24 24" className="mr-2 size-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M2.933 13.467a10.55 10.55 0 1 1 21.067-.8V12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12h.8a10.617 10.617 0 0 1-9.867-10.533zM19.2 14a3.85 3.85 0 0 1-1.333-7.467A7.89 7.89 0 0 0 14 5.6a8.4 8.4 0 1 0 8.4 8.4 6.492 6.492 0 0 0-.133-1.6A3.415 3.415 0 0 1 19.2 14z"></path></svg>
                  <span>Anime Series</span>
                </Link>
                <Link to="/popular-tv" className="bottom-sheet-submenu-item" onClick={closeMenu}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span>Popular</span>
                </Link>
              </div>
            </div>

            {/* TV Section */}
            <div className="bottom-sheet-item">
              <div
                className={`bottom-sheet-item-header ${tvMenuOpen ? 'open' : ''}`}
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

            {/* Music - Non-expandable */}
            <Link to="/music" className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
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
            </Link>

            {/* Watchlist - Non-expandable */}
            <Link to="/my-list" className="bottom-sheet-item bottom-sheet-link" onClick={closeMenu}>
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
            </Link>

            {/* Install App Button */}
            <div className="bottom-sheet-install">
              <InstallAppButton />
            </div>
          </div>
        </div>

        {/* Backdrop Overlay */}
        {isMenuOpen && <div className="bottom-sheet-overlay" onClick={closeMenu}></div>}

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