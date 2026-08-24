import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clapperboard,
  Home as HomeIcon,
  ListVideo,
  MessageCircle,
  Radio,
  Search as SearchIcon,
  Settings,
  ShieldCheck,
  TvMinimal,
  X,
  LogIn,
  User,
  Users,
  DownloadCloud,
  Sparkles
} from 'lucide-react';
import InstallAppButton from './InstallAppButton';
import { useAuth } from '../contexts/AuthContext';
import { useProfiles } from '../contexts/ProfileContext';
import { useProfileData } from '../contexts/ProfileDataContext';

// Settings sub-views
import AccountSettings from './settings/AccountSettings';
import ProfileSelectorSettings from './settings/ProfileSelectorSettings';
import ProfileFormSettings from './settings/ProfileFormSettings';
import KidsSettings from './settings/KidsSettings';
import PinSettings from './settings/PinSettings';
import DataMigrationSettings from './settings/DataMigrationSettings';
import AdFreeSettings from './settings/AdFreeSettings';

const SEARCH_DEBOUNCE_MS = 350;   // must match Search.jsx
// Must match Search.jsx and the desktop @media blocks in the CSS, exactly.
const DESKTOP_SEARCH_MQ = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn, authEvent, clearAuthEvent } = useAuth();
  const {
    profiles,
    isProfileLoading,
    activeProfile,
    isKidsMode,
    isPinModalOpen,
    cancelKidsExit,
    resetKidsUnlock
  } = useProfiles();
  const { isMigrationRequired } = useProfileData();

  const [isScrolled, setIsScrolled] = useState(false);
  const [tvDropdownOpen, setTvDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('account');
  const [previousSettingsTab, setPreviousSettingsTab] = useState('account');
  const [editingProfile, setEditingProfile] = useState(null);
  const [chatState, setChatState] = useState({ isOpen: false, unreadCount: 0 });
  // A sign-in just landed and we are still waiting for the profile list to
  // settle before choosing which tab to show. See the auth-event effect below.
  const [awaitingSignInLanding, setAwaitingSignInLanding] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  const [isDesktopSearch, setIsDesktopSearch] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia(DESKTOP_SEARCH_MQ).matches : false)
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');

  const navInputRef = useRef(null);
  const inlineWrapRef = useRef(null);
  const settingsRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const returnPathRef = useRef('/');
  const keepOpenRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  const onSearchPage = location.pathname === '/search';

  // Record mount timestamp to protect against ghost/click-through events
  useEffect(() => {
    mountTimeRef.current = Date.now();
  }, []);

  /*
   * ---------------------------------------------------------------------------
   * SETTINGS PANEL AUTO-OPEN RULES — read this before adding another one.
   *
   * App.jsx does not render the Navbar on /watch, /iptv/watch or /sports/watch,
   * so leaving the player (the "Back" control) MOUNTS A BRAND NEW NAVBAR and
   * every effect in this component runs again from scratch.
   *
   * INVARIANT: the panel may only auto-open for a signal that arrives *while
   * this Navbar instance is mounted*. A signal that is already set on our first
   * render is left over from before the player, and acting on it is exactly what
   * makes the panel appear to open on its own after pressing Back.
   *
   * Every trigger below therefore fires on a transition, never on standing
   * state. Locked down by the "settings panel auto-open" tests in
   * Navbar.test.jsx — if you add a trigger, add a case there too.
   * ---------------------------------------------------------------------------
   */

  // Whatever auth event is already published on our first render was published
  // while we were unmounted, so it has been served already: record it as handled.
  const handledAuthEventRef = useRef(authEvent);
  // isPinModalOpen / isMigrationRequired are standing provider state, so compare
  // against the previous value and only react to a falsy -> truthy edge. Both
  // start out false and are set asynchronously, so a genuine first-load request
  // still produces an edge; only a value inherited from a previous mount does not.
  const prevPinModalOpenRef = useRef(isPinModalOpen);
  const prevMigrationRequiredRef = useRef(isMigrationRequired);

  // Latest values for cleanups that must not re-run every time they change.
  const pinRequestPendingRef = useRef(isPinModalOpen);
  const cancelKidsExitRef = useRef(cancelKidsExit);
  useEffect(() => {
    pinRequestPendingRef.current = isPinModalOpen;
    cancelKidsExitRef.current = cancelKidsExit;
  }, [isPinModalOpen, cancelKidsExit]);

  /**
   * The Kids-exit PIN keypad only exists inside this panel, so a pending request
   * must not outlive it. handleCloseSettings() cancels it, but two paths dismiss
   * the panel without going through there — a route change, and the Navbar being
   * unmounted on a watch route. Both cancel here, otherwise isPinModalOpen stays
   * true in the provider and (a) re-opens the panel on the PIN view at the next
   * mount, and (b) makes the next requestKidsExit() a no-op because the flag is
   * already set, so the edge guard above would never see a transition.
   */
  const dismissPendingPinRequest = useCallback(() => {
    if (!pinRequestPendingRef.current) return;
    pinRequestPendingRef.current = false;
    // Deliberately does NOT touch prevPinModalOpenRef: the cancel flips
    // isPinModalOpen back to false in the provider, and the effect below records
    // that on the resulting render. Clearing it here instead would forge a
    // falsy -> truthy edge for the effect running later in this same commit,
    // which is the very thing the guard exists to prevent.
    cancelKidsExitRef.current?.();
  }, []);

  // Close settings panel when navigating to a new route
  useEffect(() => {
    setIsSettingsOpen(false);
    setEditingProfile(null);
    setAwaitingSignInLanding(false);
    dismissPendingPinRequest();
  }, [location.pathname, dismissPendingPinRequest]);

  // ...and when this Navbar goes away entirely (i.e. entering a watch route).
  useEffect(() => {
    return () => dismissPendingPinRequest();
  }, [dismissPendingPinRequest]);

  // Handle scroll state
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle chat state
  useEffect(() => {
    const handleChatState = (event) => setChatState(event.detail);
    window.addEventListener('streamflix:global-chat-state', handleChatState);
    return () => window.removeEventListener('streamflix:global-chat-state', handleChatState);
  }, []);

  // Open PIN view when provider requests Kids exit
  useEffect(() => {
    const requested = isPinModalOpen && !prevPinModalOpenRef.current;
    prevPinModalOpenRef.current = isPinModalOpen;
    if (!requested) return;

    setIsSettingsOpen(true);
    if (activeSettingsTab !== 'pin') {
      setPreviousSettingsTab(activeSettingsTab);
    }
    setActiveSettingsTab('pin');
  }, [isPinModalOpen, activeSettingsTab]);

  // Interactive sign-in listener (open panel automatically on interactive sign-in).
  //
  // The event is CONSUMED here: clearing it is what stops it from re-opening the
  // panel on every later mount. It also has to be consumed unconditionally,
  // because re-running this effect while the event is still set (any `profiles`
  // update did that) forced the panel back open over whatever the user was doing.
  useEffect(() => {
    if (!authEvent) return;

    const alreadyHandled = authEvent === handledAuthEventRef.current;
    handledAuthEventRef.current = authEvent;

    if (!alreadyHandled && authEvent.type === 'interactive-google-sign-in-complete') {
      setIsSettingsOpen(true);
      setActiveSettingsTab('account');
      setAwaitingSignInLanding(true);
    }

    clearAuthEvent?.();
  }, [authEvent, clearAuthEvent]);

  // Land a fresh sign-in on the profile picker when the account has more than one
  // profile. This is deferred because profiles arrive from RTDB a moment after the
  // sign-in event, so the list is not yet known when the event is consumed above.
  // Resolves exactly once, as soon as the list has settled.
  useEffect(() => {
    if (!awaitingSignInLanding || isProfileLoading) return;
    if (profiles && profiles.length > 1) {
      setActiveSettingsTab('profiles');
    }
    setAwaitingSignInLanding(false);
  }, [awaitingSignInLanding, isProfileLoading, profiles]);

  // Open migration tab if decision required
  useEffect(() => {
    const requested = isMigrationRequired && !prevMigrationRequiredRef.current;
    prevMigrationRequiredRef.current = isMigrationRequired;
    if (!requested) return;

    setIsSettingsOpen(true);
    setActiveSettingsTab('migration');
  }, [isMigrationRequired]);

  // Disable Ads is signed-in only: signing out while it is open would otherwise
  // leave the tab selected with an empty content pane.
  useEffect(() => {
    if (!isSignedIn && activeSettingsTab === 'adfree') {
      setActiveSettingsTab('account');
    }
  }, [isSignedIn, activeSettingsTab]);

  // Lets surfaces outside the navbar send a user to Disable Ads — the adblock
  // notice offers it as the alternative to turning the blocker off. The panel is
  // navbar-local state rather than a route, so an event is the only way in.
  //
  // No sign-in check here on purpose: setting 'adfree' while signed out is caught
  // by the guard above and lands on 'account', which renders the Sign In view —
  // exactly the step such a user needs first.
  useEffect(() => {
    const openAdFree = () => {
      setIsSettingsOpen(true);
      setActiveSettingsTab('adfree');
    };
    window.addEventListener('streamflix:open-adfree-settings', openAdFree);
    return () => window.removeEventListener('streamflix:open-adfree-settings', openAdFree);
  }, []);

  const handleCloseSettings = useCallback(() => {
    if (activeSettingsTab === 'pin') {
      cancelKidsExit();
    }
    resetKidsUnlock();
    setIsSettingsOpen(false);
    setEditingProfile(null);
    setAwaitingSignInLanding(false);
    if (settingsBtnRef.current) {
      settingsBtnRef.current.focus();
    }
  }, [activeSettingsTab, cancelKidsExit, resetKidsUnlock]);

  const handleToggleSettings = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Ignore clicks that fire within 350ms of Navbar mounting
    // (prevents ghost/click-through events from overlapping back buttons on watch pages)
    if (Date.now() - mountTimeRef.current < 350) {
      return;
    }
    setIsSettingsOpen((open) => !open);
  }, []);

  // Click outside to close settings panel
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handlePointerDown = (event) => {
      if (!settingsRef.current?.contains(event.target)) {
        handleCloseSettings();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isSettingsOpen, handleCloseSettings]);

  // Keyboard accessibility for settings panel
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseSettings();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, handleCloseSettings]);

  // Search media query listener
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_SEARCH_MQ);
    const onChange = (e) => setIsDesktopSearch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isDesktopSearch) {
      setIsSearchOpen(false);
      return;
    }
    if (onSearchPage) {
      setIsSearchOpen(true);
      const id = setTimeout(() => navInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    if (keepOpenRef.current) {
      keepOpenRef.current = false;
      return;
    }
    setIsSearchOpen(false);
  }, [onSearchPage, isDesktopSearch]);

  useEffect(() => {
    if (!isDesktopSearch || !isSearchOpen) return;

    const trimmed = navQuery.trim();
    const urlQuery = onSearchPage ? (searchParams.get('q') || '') : '';
    if (trimmed === urlQuery) return;

    const timer = setTimeout(() => {
      if (onSearchPage) {
        setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true });
      } else if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [navQuery, isDesktopSearch, isSearchOpen, onSearchPage, searchParams, setSearchParams, navigate]);

  useEffect(() => {
    if (onSearchPage) {
      setNavQuery(searchParams.get('q') || '');
    }
  }, [onSearchPage, searchParams]);

  const openNavSearch = () => {
    returnPathRef.current = location.pathname + location.search;
    setIsSearchOpen(true);
    setTimeout(() => navInputRef.current?.focus(), 0);
  };

  const exitNavSearch = () => {
    setNavQuery('');
    setIsSearchOpen(false);
    if (onSearchPage) {
      navigate(returnPathRef.current || '/', { replace: true });
    }
  };

  const clearNavSearch = () => {
    setNavQuery('');
    if (onSearchPage) {
      keepOpenRef.current = true;
      navigate(returnPathRef.current || '/', { replace: true });
    }
    navInputRef.current?.focus();
  };

  const handleNavKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitNavSearch();
    }
  };

  const isMobileSearchExit = !isDesktopSearch && onSearchPage;

  const handleSearchBtnClick = () => {
    if (isDesktopSearch) {
      if (!isSearchOpen) openNavSearch();
      else exitNavSearch();
      return;
    }
    if (onSearchPage) {
      exitNavSearch();
      return;
    }
    returnPathRef.current = location.pathname + location.search;
    navigate('/search');
  };

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
          {isKidsMode && (
            <span className="kids-pill-badge navbar-kids-badge">KIDS</span>
          )}
        </Link>

        <div className="navbar-links">
          <NavLink to="/" end className="nav-link">Home</NavLink>

          {/* In Kids mode, hide Shows and TV */}
          {!isKidsMode && (
            <NavLink to="/tv-shows" className="nav-link">Shows</NavLink>
          )}

          <NavLink to="/discover" className="nav-link">Movies</NavLink>

          {/* TV Dropdown - Hidden in Kids mode */}
          {!isKidsMode && (
            <div
              className="nav-dropdown-wrapper"
              onMouseEnter={() => setTvDropdownOpen(true)}
              onMouseLeave={() => setTvDropdownOpen(false)}
            >
              <span
                className={`nav-link nav-link-dropdown ${location.pathname.startsWith('/iptv') ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                TV
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="dropdown-arrow"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>

              {tvDropdownOpen && (
                <div className="nav-mega-dropdown">
                  <div className="mega-dropdown-header">
                    <div className="mega-dropdown-header-title-row">
                      <img
                        src="/icons/tv.svg"
                        alt="TV"
                        className="mega-dropdown-icon"
                        style={{ filter: 'brightness(0) invert(1) opacity(0.7)' }}
                      />
                      <h3>TV</h3>
                    </div>
                    <p className="mega-dropdown-header-desc">
                      Dive into a world of live television featuring your favorite news,
                      sports, and entertainment. With a constantly evolving channel lineup,
                      you’ll always be in the loop.
                    </p>
                  </div>

                  <div className="mega-dropdown-grid">
                    <Link
                      to="/iptv"
                      className="mega-dropdown-card"
                      onClick={() => setTvDropdownOpen(false)}
                    >
                      <div className="mega-dropdown-card-icon">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                          <polyline points="17 2 12 7 7 2" />
                        </svg>
                      </div>
                      <div className="mega-dropdown-card-content">
                        <div className="mega-dropdown-card-title">Live TV</div>
                        <p>Your destination for live TV.</p>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <NavLink to="/my-list" className="nav-link">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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

        {/* Search button */}
        <button
          className={`navbar-search-btn ${isSearchOpen ? 'is-expanded' : ''}`}
          onClick={handleSearchBtnClick}
          aria-label={isMobileSearchExit ? 'Close search' : 'Search'}
          aria-expanded={isDesktopSearch ? isSearchOpen : undefined}
        >
          {isMobileSearchExit ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
          )}
        </button>

        {/* Desktop inline search bar */}
        <div ref={inlineWrapRef} className={`navbar-inline-search ${isSearchOpen ? 'open' : ''}`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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

        {/* Settings Button & Panel */}
        <div className="navbar-settings-wrapper" ref={settingsRef}>
          <button
            ref={settingsBtnRef}
            type="button"
            className={`navbar-settings-btn ${isSettingsOpen ? 'active' : ''}`}
            onClick={handleToggleSettings}
            aria-label="Settings"
            aria-expanded={isSettingsOpen}
          >
            {isSignedIn && activeProfile ? (
              <img
                src={`/avatars/${activeProfile.avatar}.webp`}
                alt={activeProfile.name}
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  objectFit: 'cover'
                }}
                onError={(e) => {
                  e.currentTarget.src = '/avatars/avatar_01.webp';
                }}
              />
            ) : (
              <Settings />
            )}
          </button>

          {isSettingsOpen && (
            <div
              className="navbar-settings-overlay"
              onClick={handleCloseSettings}
              data-nav-trap
            >
              <div
                className="navbar-settings-panel"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="navbar-settings-title"
              >
                <aside className="navbar-settings-sidebar">
                  <div>
                    <h2 id="navbar-settings-title">Settings</h2>
                    <nav aria-label="Settings categories">
                      {/* Account tab */}
                      <div
                        className={`navbar-settings-nav-item ${activeSettingsTab === 'account' ? 'active' : ''}`}
                        onClick={() => {
                          setEditingProfile(null);
                          setActiveSettingsTab('account');
                        }}
                      >
                        {isSignedIn ? <User aria-hidden="true" /> : <LogIn aria-hidden="true" />}
                        <span>{isSignedIn ? 'Account' : 'Sign In'}</span>
                      </div>

                      {/* Profiles tab (only enabled if signed in) */}
                      {isSignedIn && (
                        <div
                          className={`navbar-settings-nav-item ${activeSettingsTab === 'profiles' || activeSettingsTab === 'profile_form' ? 'active' : ''}`}
                          onClick={() => {
                            setEditingProfile(null);
                            setActiveSettingsTab('profiles');
                          }}
                        >
                          <Users aria-hidden="true" />
                          <span>Profiles</span>
                        </div>
                      )}

                      {/* Parental Controls tab (only enabled if signed in) */}
                      {isSignedIn && (
                        <div
                          className={`navbar-settings-nav-item ${activeSettingsTab === 'parental' ? 'active' : ''}`}
                          onClick={() => {
                            setEditingProfile(null);
                            setActiveSettingsTab('parental');
                          }}
                        >
                          <ShieldCheck aria-hidden="true" />
                          <span>Parental Controls</span>
                        </div>
                      )}

                      {/* Data Migration tab (only enabled if signed in) */}
                      {isSignedIn && (
                        <div
                          className={`navbar-settings-nav-item ${activeSettingsTab === 'migration' ? 'active' : ''}`}
                          onClick={() => {
                            setEditingProfile(null);
                            setActiveSettingsTab('migration');
                          }}
                        >
                          <DownloadCloud aria-hidden="true" />
                          <span>Data Migration</span>
                        </div>
                      )}

                      {/* Disable Ads tab (only enabled if signed in) */}
                      {isSignedIn && (
                        <div
                          className={`navbar-settings-nav-item ${activeSettingsTab === 'adfree' ? 'active' : ''}`}
                          onClick={() => {
                            setEditingProfile(null);
                            setActiveSettingsTab('adfree');
                          }}
                        >
                          <Sparkles aria-hidden="true" />
                          <span>Disable Ads</span>
                        </div>
                      )}

                    </nav>
                  </div>
                </aside>

                <section className="navbar-settings-content">
                  {/* Account View */}
                  {activeSettingsTab === 'account' && (
                    <AccountSettings
                      onClose={handleCloseSettings}
                      onNavigateToProfiles={() => setActiveSettingsTab('profiles')}
                      onNavigateToPin={() => {
                        setPreviousSettingsTab('account');
                        setActiveSettingsTab('pin');
                      }}
                    />
                  )}

                  {/* Disable Ads View */}
                  {isSignedIn && activeSettingsTab === 'adfree' && (
                    <AdFreeSettings onClose={handleCloseSettings} />
                  )}

                  {/* Profile Selector View */}
                  {activeSettingsTab === 'profiles' && (
                    <ProfileSelectorSettings
                      onClose={handleCloseSettings}
                      onCreateProfile={() => {
                        setEditingProfile(null);
                        setActiveSettingsTab('profile_form');
                      }}
                      onEditProfile={(p) => {
                        setEditingProfile(p);
                        setActiveSettingsTab('profile_form');
                      }}
                      onNavigateToPin={() => {
                        setPreviousSettingsTab('profiles');
                        setActiveSettingsTab('pin');
                      }}
                    />
                  )}

                  {/* Profile Form View */}
                  {activeSettingsTab === 'profile_form' && (
                    <ProfileFormSettings
                      profile={editingProfile}
                      onCancel={() => setActiveSettingsTab('profiles')}
                      onSuccess={() => setActiveSettingsTab('profiles')}
                    />
                  )}

                  {/* Parental Controls View */}
                  {activeSettingsTab === 'parental' && (
                    <KidsSettings
                      onClose={handleCloseSettings}
                      onNavigateToProfiles={() => setActiveSettingsTab('profiles')}
                      onNavigateToPin={() => {
                        setPreviousSettingsTab('parental');
                        setActiveSettingsTab('pin');
                      }}
                    />
                  )}

                  {/* Data Migration View */}
                  {activeSettingsTab === 'migration' && (
                    <DataMigrationSettings
                      onComplete={() => setActiveSettingsTab('account')}
                      onCancel={() => setActiveSettingsTab('account')}
                    />
                  )}

                  {/* PIN Keypad View */}
                  {activeSettingsTab === 'pin' && (
                    <PinSettings
                      onCancel={() => setActiveSettingsTab(previousSettingsTab || 'account')}
                      onSuccess={() => setActiveSettingsTab((curr) => (curr === 'pin' ? 'profiles' : curr))}
                    />
                  )}

                </section>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Sheet Navigation */}
        <div className={`bottom-sheet-menu ${isKidsMode ? 'kids-mode' : ''}`} aria-label="Primary mobile navigation">
          <NavLink to="/" end className="bottom-sheet-item bottom-sheet-link">
            <HomeIcon /><span>Home</span>
          </NavLink>

          {/* In Kids mode, hide Shows and TV from bottom sheet */}
          {!isKidsMode && (
            <NavLink to="/tv-shows" className="bottom-sheet-item bottom-sheet-link">
              <TvMinimal /><span>Shows</span>
            </NavLink>
          )}

          <NavLink to="/discover" className="bottom-sheet-item bottom-sheet-link">
            <Clapperboard /><span>Movies</span>
          </NavLink>

          <NavLink to="/search" className="bottom-sheet-item bottom-sheet-link">
            <SearchIcon /><span>Search</span>
          </NavLink>

          {!isKidsMode && (
            <NavLink to="/iptv" className="bottom-sheet-item bottom-sheet-link">
              <Radio /><span>TV</span>
            </NavLink>
          )}

          <NavLink to="/my-list" className="bottom-sheet-item bottom-sheet-link">
            <ListVideo /><span>My List</span>
          </NavLink>

          {!isKidsMode && (
            <button
              type="button"
              className={`bottom-sheet-item bottom-sheet-chat-trigger ${chatState.isOpen ? 'active' : ''}`}
              onClick={() => window.dispatchEvent(new Event('streamflix:open-global-chat'))}
              aria-label="Open global chat"
              aria-expanded={chatState.isOpen}
            >
              <MessageCircle /><span>Chat</span>
              {chatState.unreadCount > 0 && (
                <span className="bottom-sheet-chat-badge">
                  {chatState.unreadCount > 99 ? '99+' : chatState.unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

      </div>
    </nav>
  );
};

export default Navbar;
