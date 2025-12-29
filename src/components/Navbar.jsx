import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';

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
  const [moviesMenuOpen, setMoviesMenuOpen] = useState(false);
  const [tvShowsMenuOpen, setTvShowsMenuOpen] = useState(false);
  const [platformsMenuOpen, setPlatformsMenuOpen] = useState(false);
  const debounceTimerRef = useRef(null);

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
              type: item.media_type
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
              TV Shows
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dropdown-arrow">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>

            {tvShowsDropdownOpen && (
              <div className="nav-mega-dropdown">
                {/* Header */}
                <div className="mega-dropdown-header">
                  <div className="mega-dropdown-header-title-row">
                    <img src="/logo/tv-outline.svg" alt="TV Shows" className="mega-dropdown-icon" style={{ filter: 'brightness(0) invert(1)' }} />
                    <h3>TV Shows</h3>
                  </div>
                  <p className="mega-dropdown-header-desc">Discover captivating TV series from around the world. From binge-worthy dramas to hilarious comedies, find your next obsession.</p>
                </div>

                {/* Categories Grid */}
                <div className="mega-dropdown-grid">
                  <Link to="/tv-shows" className="mega-dropdown-card mega-dropdown-card-featured" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">✦</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Discover</div>
                      <p>Browse our extensive collection of TV series across all genres.</p>
                    </div>
                  </Link>

                  <Link to="/trending-tv" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">♡</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Trending Now</div>
                      <p>See what TV shows everyone is talking about right now.</p>
                    </div>
                  </Link>

                  <Link to="/top-rated-tv" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">☆</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Top Rated</div>
                      <p>Explore the highest-rated TV series of all time.</p>
                    </div>
                  </Link>

                  <Link to="/anime-series" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">◉</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Anime Series</div>
                      <p>Dive into the world of Japanese animated series.</p>
                    </div>
                  </Link>

                  <Link to="/popular-tv" className="mega-dropdown-card" onClick={() => setTvShowsDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">★</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Popular</div>
                      <p>Discover the most popular TV shows worldwide.</p>
                    </div>
                  </Link>
                </div>

                {/* Streaming Platforms */}
                <div className="mega-dropdown-platforms">
                  <Link to="/netflix" className="mega-dropdown-platform" onClick={() => setTvShowsDropdownOpen(false)}>
                    <img src="/logo/brand-netflix.svg" alt="Netflix" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Netflix</span>
                      <p>Stream hit TV series and original content.</p>
                    </div>
                  </Link>

                  <Link to="/disney" className="mega-dropdown-platform" onClick={() => setTvShowsDropdownOpen(false)}>
                    <img src="/logo/brand-disney.svg" alt="Disney+" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Disney</span>
                      <p>Explore Disney's magical TV series collection.</p>
                    </div>
                  </Link>

                  <Link to="/apple-tv" className="mega-dropdown-platform" onClick={() => setTvShowsDropdownOpen(false)}>
                    <img src="/logo/appletv.svg" alt="Apple TV+" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Apple TV+</span>
                      <p>Watch award-winning Apple Original series.</p>
                    </div>
                  </Link>

                  <Link to="/prime-video" className="mega-dropdown-platform" onClick={() => setTvShowsDropdownOpen(false)}>
                    <img src="/logo/amazon_prime_video.svg" alt="Amazon Prime" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Amazon Prime</span>
                      <p>Enjoy exclusive Prime Video original series.</p>
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
                    <div className="mega-dropdown-card-icon">✦</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Discover</div>
                      <p>Find fresh discoveries and exciting new titles in cinema today.</p>
                    </div>
                  </Link>

                  <Link to="/trending" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">♡</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Trending Now</div>
                      <p>Dive into the world of trending movies that have captured hearts.</p>
                    </div>
                  </Link>

                  <Link to="/top-rated" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">☆</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Top Rated</div>
                      <p>Explore the pinnacle of cinematic excellence with top-rated films.</p>
                    </div>
                  </Link>

                  <Link to="/anime-movies" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">◉</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Anime Movies</div>
                      <p>Embark on an epic journey with our handpicked anime movies.</p>
                    </div>
                  </Link>

                  <Link to="/popular" className="mega-dropdown-card" onClick={() => setMoviesDropdownOpen(false)}>
                    <div className="mega-dropdown-card-icon">★</div>
                    <div className="mega-dropdown-card-content">
                      <div className="mega-dropdown-card-title">Popular</div>
                      <p>Discover what everyone is watching right now.</p>
                    </div>
                  </Link>
                </div>

                {/* Streaming Platforms */}
                <div className="mega-dropdown-platforms">
                  <Link to="/netflix" className="mega-dropdown-platform" onClick={() => setMoviesDropdownOpen(false)}>
                    <img src="/logo/brand-netflix.svg" alt="Netflix" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Netflix</span>
                      <p>Explore Netflix’s expansive library of blockbuster hits.</p>
                    </div>
                  </Link>

                  <Link to="/disney" className="mega-dropdown-platform" onClick={() => setMoviesDropdownOpen(false)}>
                    <img src="/logo/brand-disney.svg" alt="Disney+" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Disney</span>
                      <p>Discover Disney’s iconic films and heartwarming stories.</p>
                    </div>
                  </Link>

                  <Link to="/apple-tv" className="mega-dropdown-platform" onClick={() => setMoviesDropdownOpen(false)}>
                    <img src="/logo/appletv.svg" alt="Apple TV+" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Apple TV+</span>
                      <p>Discover Apple TV+'s lineup of critically acclaimed series...</p>
                    </div>
                  </Link>

                  <Link to="/prime-video" className="mega-dropdown-platform" onClick={() => setMoviesDropdownOpen(false)}>
                    <img src="/logo/amazon_prime_video.svg" alt="Amazon Prime" className="platform-logo" />
                    <div className="platform-info">
                      <span className="platform-name">Amazon Prime</span>
                      <p>Explore Amazon Prime's diverse offerings and exclusives...</p>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>


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

        <div className={`navbar-search-container ${isMobileSearchOpen ? 'mobile-open' : ''}`}>
          <div className="search-bar-wrapper">
            <input
              type="text"
              placeholder="Search movies and TV shows..."
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleSearchBlur}
              className="navbar-search-input"
            />

            {/* Clear Button */}
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={clearSearchInput}
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}

            {/* Search Results Dropdown */}
            {isSearchFocused && searchQuery && (
              <div className="search-results-dropdown">
                <div className="search-results-list">
                  {searchResults && searchResults.length > 0 ? (
                    searchResults.map(item => (
                      <div
                        key={`${item.id}-${item.media_type}`}
                        className="search-result-item"
                        onClick={() => handleItemSelect(item)}
                      >
                        <div className="search-result-poster">
                          {getPosterUrl(item.poster_path) ? (
                            <img
                              src={getPosterUrl(item.poster_path)}
                              alt={item.title || item.name}
                              loading="lazy"
                            />
                          ) : (
                            <div className="poster-placeholder">
                              <span>No Image</span>
                            </div>
                          )}
                        </div>
                        <div className="search-result-info">
                          <div className="search-result-title">
                            {item.title || item.name}
                          </div>
                          <div className="search-result-meta">
                            <span className="search-result-type">
                              {item.media_type}
                            </span>
                            {item.release_date && (
                              <span className="search-result-year">
                                ({new Date(item.release_date).getFullYear()})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : isSearching ? (
                    <div className="search-loading">
                      <p>Searching...</p>
                    </div>
                  ) : (
                    <div className="search-no-results">
                      <p>No results found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Suggestions Dropdown (Recent + Trending) */}
            {showSuggestions && (
              <div className="search-results-dropdown search-suggestions">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-header">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>Recent Searches</span>
                    </div>
                    {recentSearches.map((query, index) => (
                      <div
                        key={`recent-${index}`}
                        className="search-suggestion-item"
                        onClick={() => handleSuggestionClick(query)}
                      >
                        <span className="suggestion-text">{query}</span>
                        <button
                          type="button"
                          className="suggestion-remove-btn"
                          onClick={(e) => removeRecentSearch(query, e)}
                          aria-label="Remove from recent searches"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trending Searches */}
                {trendingSearches.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-header">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v8l4-4"></path>
                        <path d="M12 2v8l-4-4"></path>
                        <path d="M20 12a8 8 0 1 1-16 0"></path>
                      </svg>
                      <span>Trending Searches This Week</span>
                    </div>
                    {trendingSearches.map((item, index) => (
                      <div
                        key={`trending-${item.id}-${index}`}
                        className="search-suggestion-item trending-item"
                        onClick={() => handleSuggestionClick(item.name)}
                      >
                        <span className="trending-rank">{index + 1}</span>
                        <span className="suggestion-text">{item.name}</span>
                        <span className="suggestion-type">{item.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Search Button */}
        <button
          className="mobile-search-btn"
          onClick={toggleMobileSearch}
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

        <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
          <div className="side-menu-header">
            <h3>Menu</h3>
          </div>
          <div className="side-menu-links">
            <Link to="/" className="nav-link" onClick={closeMenu}>Home</Link>

            {/* TV Shows Section with Collapsible Submenu */}
            <div className="side-menu-section">
              <span
                className={`nav-link side-menu-section-title ${tvShowsMenuOpen ? 'open' : ''}`}
                onClick={() => setTvShowsMenuOpen(!tvShowsMenuOpen)}
              >
                TV Shows
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="submenu-arrow">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
              {tvShowsMenuOpen && (
                <div className="side-menu-submenu">
                  <Link to="/tv-shows" className="nav-link submenu-link" onClick={closeMenu}>Discover</Link>
                  <Link to="/trending-tv" className="nav-link submenu-link" onClick={closeMenu}>Trending Now</Link>
                  <Link to="/top-rated-tv" className="nav-link submenu-link" onClick={closeMenu}>Top Rated</Link>
                  <Link to="/anime-series" className="nav-link submenu-link" onClick={closeMenu}>Anime Series</Link>
                  <Link to="/popular-tv" className="nav-link submenu-link" onClick={closeMenu}>Popular</Link>

                  {/* Streaming Platforms */}
                  <Link to="/netflix" className="nav-link submenu-link" onClick={closeMenu}>Netflix</Link>
                  <Link to="/disney" className="nav-link submenu-link" onClick={closeMenu}>Disney+</Link>
                  <Link to="/apple-tv" className="nav-link submenu-link" onClick={closeMenu}>Apple TV+</Link>
                  <Link to="/prime-video" className="nav-link submenu-link" onClick={closeMenu}>Amazon Prime</Link>
                </div>
              )}
            </div>

            {/* Movies Section with Collapsible Submenu */}
            <div className="side-menu-section">
              <span
                className={`nav-link side-menu-section-title ${moviesMenuOpen ? 'open' : ''}`}
                onClick={() => setMoviesMenuOpen(!moviesMenuOpen)}
              >
                Movies
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="submenu-arrow">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
              {moviesMenuOpen && (
                <div className="side-menu-submenu">
                  <Link to="/discover" className="nav-link submenu-link" onClick={closeMenu}>Discover</Link>
                  <Link to="/trending" className="nav-link submenu-link" onClick={closeMenu}>Trending Now</Link>
                  <Link to="/top-rated" className="nav-link submenu-link" onClick={closeMenu}>Top Rated</Link>
                  <Link to="/anime-movies" className="nav-link submenu-link" onClick={closeMenu}>Anime Movies</Link>
                  <Link to="/popular" className="nav-link submenu-link" onClick={closeMenu}>Popular</Link>

                  {/* Streaming Platforms */}
                  <Link to="/netflix" className="nav-link submenu-link" onClick={closeMenu}>Netflix</Link>
                  <Link to="/disney" className="nav-link submenu-link" onClick={closeMenu}>Disney+</Link>
                  <Link to="/apple-tv" className="nav-link submenu-link" onClick={closeMenu}>Apple TV+</Link>
                  <Link to="/prime-video" className="nav-link submenu-link" onClick={closeMenu}>Amazon Prime</Link>
                </div>
              )}
            </div>

            <Link to="/my-list" className="nav-link" onClick={closeMenu}>Watchlist</Link>
          </div>
        </div>

        {isMenuOpen && <div className="menu-overlay" onClick={closeMenu}></div>}
      </div>
    </nav >
  );
};

export default Navbar;