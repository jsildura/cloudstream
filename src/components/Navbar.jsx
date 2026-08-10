import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import InstallAppButton from './InstallAppButton';

const SEARCH_DEBOUNCE_MS = 350;   // must match Search.jsx
// Must match Search.jsx and the desktop @media blocks in the CSS, exactly.
const DESKTOP_SEARCH_MQ = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [tvDropdownOpen, setTvDropdownOpen] = useState(false);
  const [tvMenuOpen, setTvMenuOpen] = useState(false);

  // Bottom sheet drag state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const sheetRef = useRef(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // STATE, not a ref. This value is read while rendering (it decides which icon
  // the button shows), so React has to re-render when it changes. v3 used a ref
  // here and the icon silently went stale on resize — see plan section 0.2.
  const [isDesktopSearch, setIsDesktopSearch] = useState(
    () => window.matchMedia(DESKTOP_SEARCH_MQ).matches
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');

  const navInputRef = useRef(null);
  const inlineWrapRef = useRef(null);
  const returnPathRef = useRef('/');   // where ✕ / Escape sends you back to
  const keepOpenRef = useRef(false);   // survive the route change on manual clear

  const onSearchPage = location.pathname === '/search';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
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

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_SEARCH_MQ);
    const onChange = (e) => setIsDesktopSearch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Three rules, in order:
  //   not a desktop  -> always collapsed (the page input is the UI there)
  //   on /search     -> always expanded; it is the only input on that page
  //   anywhere else  -> collapsed by default; the button opens it
  //
  // `keepOpenRef` is an escape hatch for one case: emptying the field by hand
  // navigates off /search but must leave the bar open so the user can keep
  // typing. Without it, this effect would fire on that route change and
  // collapse the bar out from under them.
  useEffect(() => {
    if (!isDesktopSearch) { setIsSearchOpen(false); return; }
    if (onSearchPage) {
      setIsSearchOpen(true);
      const id = setTimeout(() => navInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    if (keepOpenRef.current) { keepOpenRef.current = false; return; }
    setIsSearchOpen(false);
  }, [onSearchPage, isDesktopSearch]);

  useEffect(() => {
    if (!isDesktopSearch || !isSearchOpen) return;

    const trimmed = navQuery.trim();
    const urlQuery = onSearchPage ? (searchParams.get('q') || '') : '';
    if (trimmed === urlQuery) return;

    const timer = setTimeout(() => {
      if (onSearchPage) {
        // Already on /search: just rewrite ?q=. `replace`, not `push` —
        // otherwise every debounced keystroke becomes a history entry and
        // Back walks the query backwards one word at a time.
        setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true });
      } else if (trimmed) {
        // First real keystroke from another page: this is the navigation.
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [navQuery, isSearchOpen, isDesktopSearch, onSearchPage,
    searchParams, setSearchParams, navigate]);

  useEffect(() => {
    if (!onSearchPage) return;
    const urlQuery = searchParams.get('q') || '';
    setNavQuery(prev => (prev.trim() === urlQuery ? prev : urlQuery));
  }, [onSearchPage, searchParams]);

  const openNavSearch = () => {
    // Remember where to return to. Include the query string so, e.g.,
    // /discover?genre=28 comes back intact.
    if (!onSearchPage) {
      returnPathRef.current = location.pathname + location.search;
    }
    setIsSearchOpen(true);
    setTimeout(() => navInputRef.current?.focus(), 0);
  };

  const clearNavSearch = () => {
    setNavQuery('');
    navInputRef.current?.focus();
  };

  // Collapse first, navigate after. Both happen in the same React commit, so
  // routing away in the same tick unmounts /search while the width transition
  // is still running and the bar snaps shut instead of sliding. One frame of
  // delay lets the collapsed width take effect first.
  const exitNavSearch = () => {
    setNavQuery('');
    setIsSearchOpen(false);
    const target = returnPathRef.current || '/';
    requestAnimationFrame(() => navigate(target));
  };

  const handleNavKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    if (navQuery) setNavQuery('');   // first press: clear
    else exitNavSearch();            // second press: leave
  };

  // Emptying the field by hand (backspace/select-all-delete) leaves /search and
  // discards the results, but keeps the bar OPEN and focused — the user is
  // mid-edit. Only ✕ or an outside click collapses it. Guarded on
  // `onSearchPage` so clearing the field elsewhere just empties it.
  // `prevQueryRef` detects the non-empty -> empty transition; without it,
  // landing on /search with an empty field would trigger a spurious exit.
  const prevQueryRef = useRef(navQuery);
  useEffect(() => {
    if (!isDesktopSearch || !onSearchPage || !isSearchOpen) return;
    const wasNonEmpty = prevQueryRef.current !== '';
    prevQueryRef.current = navQuery;
    if (!wasNonEmpty || navQuery !== '') return;
    keepOpenRef.current = true;   // tell the route effect not to collapse
    navigate(returnPathRef.current || '/');
  }, [navQuery, isDesktopSearch, onSearchPage, isSearchOpen, navigate]);

  // Mobile/tablet/TV only: while on /search the navbar button is a "close" control.
  const isMobileSearchExit = !isDesktopSearch && onSearchPage;

  const handleSearchBtnClick = () => {
    if (isDesktopSearch) {
      openNavSearch();               // expand in place — no navigation yet
      return;
    }
    if (onSearchPage) {
      exitNavSearch();               // the ✕
      return;
    }
    returnPathRef.current = location.pathname + location.search;
    navigate('/search');             // non-desktop: go to the page with the big input
  };

  // Only when: desktop, open, empty, and NOT on /search. On /search this is the
  // page's only input, so collapsing it would leave nothing to type into.
  useEffect(() => {
    if (!isDesktopSearch || !isSearchOpen || navQuery || onSearchPage) return;
    const onPointerDown = (e) => {
      if (inlineWrapRef.current && !inlineWrapRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isDesktopSearch, isSearchOpen, navQuery, onSearchPage]);

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

        {/* Single search control at every breakpoint: magnifier, or ✕ while on
            /search on non-desktop devices. */}
        <button
          className={`navbar-search-btn ${isSearchOpen ? 'is-expanded' : ''}`}
          onClick={handleSearchBtnClick}
          aria-label={isMobileSearchExit ? 'Close search' : 'Search'}
          aria-expanded={isDesktopSearch ? isSearchOpen : undefined}
        >
          {isMobileSearchExit ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
          )}
        </button>

        {/* Desktop inline search bar. Hidden by default; the desktop @media block
            in components.css is what reveals it. */}
        <div ref={inlineWrapRef} className={`navbar-inline-search ${isSearchOpen ? 'open' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          <input
            ref={navInputRef}
            className="navbar-inline-input"
            type="text"
            placeholder="titles, people, genres..."
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            onKeyDown={handleNavKeyDown}
            autoComplete="off"
            aria-label="Search movies and TV shows"
          />
          {navQuery && (
            <button className="navbar-inline-clear" onClick={clearNavSearch} aria-label="Clear search">×</button>
          )}
        </div>

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

    </nav >
  );
};

export default Navbar;