import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import { useToast } from '../contexts/ToastContext';
import useWatchHistory from '../hooks/useWatchHistory';
import usePopularTracking from '../hooks/usePopularTracking';
import useWatchlist from '../hooks/useWatchlist';
import { serverConfig, buildServerUrl } from '../config/servers';
import SchemaMarkup from '../components/SchemaMarkup';
import MetaTags from '../components/MetaTags';
import { generateVideoObjectSchema } from '../utils/schemaUtils';
import { generateContentMeta } from '../utils/metaUtils';

const Watch = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const urlSeason = searchParams.get('season');
  const urlEpisode = searchParams.get('episode');

  // Check if we came from modal navigation (has fromModal flag in state)
  const cameFromModal = location.state?.fromModal === true;

  // Redirect direct URL access to homepage with modal
  useEffect(() => {
    if (type && id && !cameFromModal) {
      navigate('/', {
        state: {
          openModalForContent: { type, id, season: urlSeason, episode: urlEpisode }
        },
        replace: true  // Replace history entry so "Back" goes to actual previous page
      });
    }
  }, []);  // Run once on mount

  const [currentServer, setCurrentServer] = useState(0);
  const [currentSeason, setCurrentSeason] = useState(urlSeason ? parseInt(urlSeason) : 1);
  const [currentEpisode, setCurrentEpisode] = useState(urlEpisode ? parseInt(urlEpisode) : 1);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [contentInfo, setContentInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playerLoaded, setPlayerLoaded] = useState(false);

  const [serverDrawerOpen, setServerDrawerOpen] = useState(false);
  const [sandboxEnabled, setSandboxEnabled] = useState(true);
  const [drawerTranslateY, setDrawerTranslateY] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [warningExpanded, setWarningExpanded] = useState(false);

  // Episode drawer state
  const [episodeDrawerOpen, setEpisodeDrawerOpen] = useState(false);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [episodeDrawerTranslateY, setEpisodeDrawerTranslateY] = useState(0);

  // Password protection state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingServerIndex, setPendingServerIndex] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [unlockedServers, setUnlockedServers] = useState(() => {
    try {
      const stored = localStorage.getItem('unlockedServers');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const watchContainerRef = useRef(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);
  const hideControlsTimer = useRef(null);
  const episodeDragStartY = useRef(0);
  const isEpisodeDragging = useRef(false);
  const episodeDrawerTranslateRef = useRef(0);

  const { POSTER_URL } = useTMDB();
  const { showNowPlaying } = useToast();
  const { addToHistory } = useWatchHistory();
  const { trackWatch } = usePopularTracking();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const hasShownToast = useRef(false);
  const wakeLockRef = useRef(null);
  const isSaved = contentInfo ? isInWatchlist(contentInfo.id) : false;

  // Screen Wake Lock - Prevents screen from turning off during playback
  // Works on: Chrome 84+, Safari iOS 16.4+, Edge 84+, Brave, Opera
  // Note: May be rejected in battery saver mode - will retry on user interaction
  useEffect(() => {
    let isActive = true;
    let retryTimeout = null;

    const requestWakeLock = async () => {
      // Don't request if component is unmounting or player not loaded
      if (!isActive || !playerLoaded) return false;

      try {
        if ('wakeLock' in navigator) {
          // Release existing lock before acquiring new one
          if (wakeLockRef.current) {
            try {
              await wakeLockRef.current.release();
            } catch (e) {
              // Ignore release errors
            }
            wakeLockRef.current = null;
          }

          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock acquired - screen will stay on');

          // Listen for release events (can happen due to tab switch, battery saver, etc.)
          wakeLockRef.current.addEventListener('release', () => {
            console.log('Wake Lock was released');
            // Only re-acquire if still active and visible
            if (isActive && playerLoaded && document.visibilityState === 'visible') {
              // Small delay before retry to avoid rapid re-requests
              retryTimeout = setTimeout(() => {
                requestWakeLock();
              }, 1000);
            }
          });

          return true;
        }
      } catch (err) {
        // Common rejection reasons:
        // - Battery saver mode active
        // - Low battery (some Android devices)
        // - No user gesture (iOS Safari requires user interaction first)
        // - Document not visible
        console.log('Wake Lock request failed:', err.name, err.message);

        // If rejected due to not visible, don't retry - visibilitychange will handle it
        if (err.name !== 'NotAllowedError') {
          // For other errors, retry after a delay
          retryTimeout = setTimeout(() => {
            if (isActive && playerLoaded) {
              requestWakeLock();
            }
          }, 5000);
        }
        return false;
      }
      return false;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && playerLoaded && isActive) {
        // Clear any pending retry
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        requestWakeLock();
      }
    };

    const handleFullscreenChange = () => {
      // Re-acquire wake lock when entering/exiting fullscreen
      if (playerLoaded && isActive && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    // iOS Safari requires user gesture - also try on touch/click
    const handleUserInteraction = () => {
      if (playerLoaded && isActive && !wakeLockRef.current) {
        requestWakeLock();
      }
    };

    if (playerLoaded) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      // iOS Safari may need user gesture to acquire wake lock
      document.addEventListener('touchstart', handleUserInteraction, { once: true, passive: true });
      document.addEventListener('click', handleUserInteraction, { once: true });
    }

    return () => {
      isActive = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
          .then(() => console.log('Wake Lock released on cleanup'))
          .catch(() => { });
        wakeLockRef.current = null;
      }
    };
  }, [playerLoaded]);

  useEffect(() => {
    if (!loading && contentInfo && !hasShownToast.current) {
      const timer = setTimeout(() => {
        const title = contentInfo.title || contentInfo.name;
        showNowPlaying(title);
        hasShownToast.current = true;
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [loading, contentInfo, showNowPlaying]);

  useEffect(() => {
    if (playerLoaded && contentInfo) {
      addToHistory({
        id: contentInfo.id,
        type,
        title: contentInfo.title || contentInfo.name,
        poster_path: contentInfo.poster_path,
        backdrop_path: contentInfo.backdrop_path,
        ...(type === 'tv' && {
          lastSeason: currentSeason,
          lastEpisode: currentEpisode,
          totalSeasons: seasons.length,
        }),
      });

      // Track view for "Popular on Streamflix" section
      trackWatch(contentInfo.id, type, {
        title: contentInfo.title || contentInfo.name,
        poster_path: contentInfo.poster_path
      });
    }
  }, [playerLoaded, contentInfo, currentSeason, currentEpisode, type, seasons.length, addToHistory, trackWatch]);

  const isBot = () => {
    if (typeof navigator === 'undefined') return false;
    const botPatterns = [
      'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
      'yandexbot', 'sogou', 'exabot', 'facebot', 'facebookexternalhit',
      'twitterbot', 'rogerbot', 'linkedinbot', 'embedly', 'quora link preview',
      'showyoubot', 'outbrain', 'pinterest', 'applebot', 'semrushbot',
      'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot', 'bytespider'
    ];
    const userAgent = navigator.userAgent.toLowerCase();
    return botPatterns.some(pattern => userAgent.includes(pattern));
  };

  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    const detectDevTools = () => {
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      setDevToolsOpen(widthThreshold || heightThreshold);
    };

    window.addEventListener('resize', detectDevTools);
    detectDevTools();

    return () => window.removeEventListener('resize', detectDevTools);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (playerLoaded) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    const handleBlur = () => {
      if (playerLoaded) {
        setTimeout(() => window.focus(), 100);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleBlur);
    };
  }, [playerLoaded]);

  const resetHideTimer = () => {
    setControlsVisible(true);
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    hideControlsTimer.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement);
      setIsFullscreen(isFs);
      resetHideTimer();
    };

    const handleDocumentMouseMove = () => {
      resetHideTimer();
    };

    const handleTouchActivity = () => {
      resetHideTimer();
    };

    const handleKeyDown = () => {
      resetHideTimer();
    };

    const handleFocusIn = () => {
      resetHideTimer();
    };

    // Start initial auto-hide timer
    resetHideTimer();

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('touchstart', handleTouchActivity, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('touchstart', handleTouchActivity);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [isFullscreen]);

  // Server configuration is imported from src/config/servers.js
  // To add/remove/modify servers, edit that file instead of this component
  const servers = useMemo(() => serverConfig.map(s => ({
    name: s.name,
    description: s.description,
    isRecommended: s.isRecommended,
    sandboxSupport: s.sandboxSupport,
    hasAds: s.hasAds || false,
    isLocked: s.locked || false,
    password: s.password || null,
    getUrl: (season, episode) => buildServerUrl(s, type, id, season, episode)
  })), [type, id]);

  // Generate VideoObject schema for SEO (memoized) - must be before early returns
  const videoSchema = useMemo(() => {
    if (!contentInfo?.id) return null;
    return generateVideoObjectSchema(contentInfo, type, currentSeason, currentEpisode);
  }, [contentInfo, type, currentSeason, currentEpisode]);

  // Generate meta tags data for SEO (memoized) - must be before early returns
  const metaData = useMemo(() => {
    return generateContentMeta(contentInfo, type, currentSeason, currentEpisode);
  }, [contentInfo, type, currentSeason, currentEpisode]);

  useEffect(() => {
    if (type && id) {
      fetchContentData();
    } else {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    setSandboxEnabled(servers[currentServer].sandboxSupport);
    setPlayerLoaded(false);
  }, [currentServer]);

  useEffect(() => {
    setPlayerLoaded(false);
  }, [currentSeason, currentEpisode]);

  const fetchContentData = async () => {
    try {
      setLoading(true);
      const contentRes = await fetch(`/api/${type}/${id}`);
      const contentData = await contentRes.json();
      setContentInfo(contentData);

      if (type === 'tv') {
        await fetchSeasons();
      }
    } catch (error) {
      console.error('Failed to fetch content data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasons = async () => {
    try {
      const res = await fetch(`/api/tv/${id}`);
      const data = await res.json();
      const validSeasons = data.seasons || [];
      setSeasons(validSeasons);

      if (validSeasons.length > 0) {
        const seasonToLoad = urlSeason ? parseInt(urlSeason) : validSeasons[0].season_number;

        if (!urlSeason) {
          setCurrentSeason(seasonToLoad);
        }

        await fetchEpisodes(seasonToLoad);
      }
    } catch (error) {
      console.error('Failed to fetch seasons:', error);
    }
  };

  const fetchEpisodes = async (seasonNumber) => {
    try {
      const res = await fetch(`/api/tv/${id}/season/${seasonNumber}`);
      const data = await res.json();
      setEpisodes(data.episodes || []);

      const isUrlSeason = urlSeason && parseInt(urlSeason) === seasonNumber;
      if (!urlEpisode || !isUrlSeason) {
        setCurrentEpisode(1);
      }
    } catch (error) {
      console.error('Failed to fetch episodes:', error);
    }
  };

  const handleSeasonChange = async (seasonNumber) => {
    setCurrentSeason(seasonNumber);
    await fetchEpisodes(seasonNumber);
  };

  const getVideoUrl = () => {
    return servers[currentServer].getUrl(currentSeason, currentEpisode);
  };

  const handleServerSelect = (index) => {
    const server = servers[index];

    if (server.isLocked && !unlockedServers[server.name]) {
      setPendingServerIndex(index);
      setPasswordInput('');
      setPasswordError('');
      setPasswordModalOpen(true);
      return;
    }

    setCurrentServer(index);
    setSandboxEnabled(server.sandboxSupport);
    setServerDrawerOpen(false);
  };

  const handlePasswordSubmit = () => {
    if (pendingServerIndex === null) return;

    const server = servers[pendingServerIndex];
    const correctPassword = atob(server.password);

    if (passwordInput === correctPassword) {
      const newUnlocked = { ...unlockedServers, [server.name]: true };
      localStorage.setItem('unlockedServers', JSON.stringify(newUnlocked));
      setUnlockedServers(newUnlocked);
      setPasswordModalOpen(false);
      setCurrentServer(pendingServerIndex);
      setSandboxEnabled(server.sandboxSupport);
      setServerDrawerOpen(false);
      setPendingServerIndex(null);
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const handlePasswordCancel = () => {
    setPasswordModalOpen(false);
    setPendingServerIndex(null);
    setPasswordInput('');
    setPasswordError('');
  };

  const handleBack = () => {
    // Navigate directly to homepage to avoid stacked history entries
    // (changing servers/episodes may add history entries, making navigate(-1) unreliable)
    navigate('/');
  };

  const drawerTranslateRef = useRef(0);

  const handleDragStart = (clientY) => {
    isDragging.current = true;
    dragStartY.current = clientY;
    drawerTranslateRef.current = 0;
  };

  const handleDragMove = (clientY) => {
    if (!isDragging.current) return;
    const deltaY = clientY - dragStartY.current;
    if (deltaY > 0) {
      drawerTranslateRef.current = deltaY;
      setDrawerTranslateY(deltaY);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (drawerTranslateRef.current > 100) {
      setServerDrawerOpen(false);
    }
    drawerTranslateRef.current = 0;
    setDrawerTranslateY(0);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    handleDragStart(e.clientY);

    const onMouseMove = (moveEvent) => {
      handleDragMove(moveEvent.clientY);
    };

    const onMouseUp = () => {
      handleDragEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleTouchStart = (e) => {
    e.preventDefault(); // Prevent pull-to-refresh
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e) => {
    e.preventDefault(); // Prevent pull-to-refresh
    handleDragMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Episode drawer drag handlers
  const handleEpisodeDragStart = (clientY) => {
    isEpisodeDragging.current = true;
    episodeDragStartY.current = clientY;
    episodeDrawerTranslateRef.current = 0;
  };

  const handleEpisodeDragMove = (clientY) => {
    if (!isEpisodeDragging.current) return;
    const deltaY = clientY - episodeDragStartY.current;
    if (deltaY > 0) {
      episodeDrawerTranslateRef.current = deltaY;
      setEpisodeDrawerTranslateY(deltaY);
    }
  };

  const handleEpisodeDragEnd = () => {
    if (!isEpisodeDragging.current) return;
    isEpisodeDragging.current = false;
    if (episodeDrawerTranslateRef.current > 100) {
      setEpisodeDrawerOpen(false);
      setEpisodeSearchQuery('');
    }
    episodeDrawerTranslateRef.current = 0;
    setEpisodeDrawerTranslateY(0);
  };

  const handleEpisodeMouseDown = (e) => {
    e.preventDefault();
    handleEpisodeDragStart(e.clientY);

    const onMouseMove = (moveEvent) => {
      handleEpisodeDragMove(moveEvent.clientY);
    };

    const onMouseUp = () => {
      handleEpisodeDragEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleEpisodeTouchStart = (e) => {
    e.preventDefault();
    handleEpisodeDragStart(e.touches[0].clientY);
  };

  const handleEpisodeTouchMove = (e) => {
    e.preventDefault();
    handleEpisodeDragMove(e.touches[0].clientY);
  };

  const handleEpisodeTouchEnd = () => {
    handleEpisodeDragEnd();
  };

  if (loading) {
    return (
      <div className="watch-fullscreen">
        <div className="watch-loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading player...</p>
        </div>
      </div>
    );
  }

  if (!type || !id) {
    return (
      <div className="watch-fullscreen">
        <div className="watch-error-overlay">
          <h1>Content Not Found</h1>
          <p>The requested content could not be loaded.</p>
          <button className="watch-overlay-btn" onClick={() => navigate('/')}>
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  const getBackdropUrl = () => {
    if (contentInfo?.backdrop_path) {
      return `https://image.tmdb.org/t/p/original${contentInfo.backdrop_path}`;
    }
    return null;
  };

  if (isBot()) {
    return (
      <div className="watch-fullscreen">
        <div
          className="watch-lazy-overlay"
          style={{
            backgroundImage: getBackdropUrl() ? `url(${getBackdropUrl()})` : 'none'
          }}
        >
          <div className="watch-lazy-gradient"></div>
          <div className="watch-lazy-content">
            <p className="watch-lazy-title">
              {contentInfo?.title || contentInfo?.name || 'Content'}
            </p>
            {type === 'tv' && (
              <p className="watch-lazy-episode">Season {currentSeason} • Episode {currentEpisode}</p>
            )}
            <p className="watch-lazy-hint">Stream Now</p>
          </div>
        </div>
        <button className="watch-overlay-btn watch-back-btn" onClick={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7"></path>
            <path d="M19 12H5"></path>
          </svg>
          Back
        </button>
      </div>
    );
  }

  return (
    <>
      <MetaTags {...metaData} />
      <SchemaMarkup schema={videoSchema} />
      <div className={`watch-fullscreen${isFullscreen ? ' css-fullscreen-mode' : ''}${controlsVisible ? ' sidebar-visible' : ''}`} ref={watchContainerRef} onMouseMove={resetHideTimer} onTouchStart={resetHideTimer}>
        {/* Video Player - Lazy Loaded */}
        {playerLoaded ? (
          <>
            <iframe
              key={`${currentServer}-${currentSeason}-${currentEpisode}-${sandboxEnabled}`}
              src={getVideoUrl()}
              className="watch-video-player"
              allowFullScreen
              title="Video Player"
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              {...(sandboxEnabled && {
                sandbox: "allow-scripts allow-same-origin allow-forms allow-presentation"
              })}
            />
            {/* Invisible overlay to capture touch/mouse when controls are hidden */}
            {!controlsVisible && (
              <div
                className="watch-mouse-capture"
                onMouseMove={resetHideTimer}
                onClick={resetHideTimer}
                onTouchStart={resetHideTimer}
              />
            )}
          </>
        ) : (
          <div
            className="watch-lazy-overlay"
            style={{
              backgroundImage: getBackdropUrl() ? `url(${getBackdropUrl()})` : 'none'
            }}
          >
            <div className="watch-lazy-gradient"></div>
            <div className="watch-lazy-content">
              <button
                className="watch-play-button"
                onClick={() => setPlayerLoaded(true)}
                aria-label="Play video"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <p className="watch-lazy-title">
                {contentInfo?.title || contentInfo?.name || 'Loading...'}
              </p>
              {type === 'tv' && (
                <p className="watch-lazy-episode">Season {currentSeason} • Episode {currentEpisode}</p>
              )}
              <p className="watch-lazy-hint">Click to start streaming</p>
              <p className="watch-lazy-server-hint">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                  <path d="M12 9v4"></path>
                  <path d="M12 17h.01"></path>
                </svg>
                If media is not available, choose a different <span className="highlight">Server</span>
              </p>
            </div>
          </div>
        )}

        {/* Vertical Control Bar */}
        <div className={`watch-control-bar${controlsVisible ? ' visible' : ''}`}>
          {/* Back Button */}
          <div className="watch-control-bar-item">
            <button
              className="watch-control-bar-btn"
              onClick={handleBack}
              title="Back to Home"
              aria-label="Back to Home"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" stroke="currentColor" strokeWidth="0">
                <path fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="48" d="M244 400 100 256l144-144M120 256h292" />
              </svg>
            </button>
            <span className="watch-control-bar-label">Back</span>
          </div>

          {/* Episodes Button - TV Shows Only */}
          {type === 'tv' && (
            <div className="watch-control-bar-item">
              <button
                className="watch-control-bar-btn"
                onClick={() => setEpisodeDrawerOpen(true)}
                title={`S${currentSeason} E${currentEpisode}`}
                aria-label="Open episode selector"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                  <path d="m10 9 4 2.5L10 14V9z" />
                </svg>
              </button>
              <span className="watch-control-bar-label">S{currentSeason} E{currentEpisode}</span>
            </div>
          )}

          {/* Save / Watchlist Button */}
          <div className="watch-control-bar-item">
            <button
              className={`watch-control-bar-btn${isSaved ? ' active' : ''}`}
              onClick={() => {
                if (contentInfo) {
                  toggleWatchlist({
                    id: contentInfo.id,
                    title: contentInfo.title || contentInfo.name,
                    poster_path: contentInfo.poster_path,
                    backdrop_path: contentInfo.backdrop_path,
                    type: type,
                    vote_average: contentInfo.vote_average,
                    release_date: contentInfo.release_date || contentInfo.first_air_date,
                    overview: contentInfo.overview,
                    genre_ids: contentInfo.genre_ids,
                  });
                }
              }}
              title={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
              aria-label={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
              {isSaved ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0">
                  <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0">
                  <path fill="none" d="M0 0h24v24H0z" />
                  <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
                </svg>
              )}
            </button>
            <span className="watch-control-bar-label">Save</span>
          </div>

          {/* Server Button */}
          <div className="watch-control-bar-item">
            <button
              className="watch-control-bar-btn server-pulse"
              onClick={() => setServerDrawerOpen(true)}
              title="Change Server"
              aria-label="Change Server"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0">
                <path d="M4.08 5.227A3 3 0 0 1 6.979 3H17.02a3 3 0 0 1 2.9 2.227l2.113 7.926A5.228 5.228 0 0 0 18.75 12H5.25a5.228 5.228 0 0 0-3.284 1.153L4.08 5.227Z" />
                <path fillRule="evenodd" d="M5.25 13.5a3.75 3.75 0 1 0 0 7.5h13.5a3.75 3.75 0 1 0 0-7.5H5.25Zm10.5 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm3.75-.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="watch-control-bar-label">Server</span>
          </div>

          {/* Fullscreen Button */}
          <div className="watch-control-bar-item">
            <button
              className="watch-control-bar-btn"
              onClick={() => {
                if (watchContainerRef.current) {
                  const elem = watchContainerRef.current;
                  const doc = document;
                  const isCurrentlyFullscreen = doc.fullscreenElement ||
                    doc.webkitFullscreenElement ||
                    doc.mozFullScreenElement ||
                    doc.msFullscreenElement ||
                    isFullscreen;
                  if (!isCurrentlyFullscreen) {
                    if (elem.requestFullscreen) {
                      elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(true));
                    } else if (elem.webkitRequestFullscreen) {
                      elem.webkitRequestFullscreen(); setIsFullscreen(true);
                    } else if (elem.webkitEnterFullscreen) {
                      elem.webkitEnterFullscreen(); setIsFullscreen(true);
                    } else if (elem.mozRequestFullScreen) {
                      elem.mozRequestFullScreen(); setIsFullscreen(true);
                    } else if (elem.msRequestFullscreen) {
                      elem.msRequestFullscreen(); setIsFullscreen(true);
                    } else {
                      setIsFullscreen(true);
                    }
                  } else {
                    if (doc.exitFullscreen) {
                      doc.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => setIsFullscreen(false));
                    } else if (doc.webkitExitFullscreen) {
                      doc.webkitExitFullscreen(); setIsFullscreen(false);
                    } else if (doc.mozCancelFullScreen) {
                      doc.mozCancelFullScreen(); setIsFullscreen(false);
                    } else if (doc.msExitFullscreen) {
                      doc.msExitFullscreen(); setIsFullscreen(false);
                    } else {
                      setIsFullscreen(false);
                    }
                  }
                }
              }}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
            </button>
            <span className="watch-control-bar-label">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </div>
        </div>

        {/* Server Drawer Overlay */}
        {serverDrawerOpen && (
          <div className="watch-drawer-overlay" onClick={() => setServerDrawerOpen(false)}>
            <div
              className="watch-drawer"
              onClick={(e) => e.stopPropagation()}
              style={{
                transform: `translateY(${drawerTranslateY}px)`,
                transition: isDragging.current ? 'none' : 'transform 0.3s ease'
              }}
            >
              {/* Drawer Handle */}
              <div
                className="watch-drawer-handle"
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              ></div>

              {/* Sandbox Toggle */}
              <div className="watch-sandbox-row">
                <div className="watch-sandbox-info">
                  <p className="watch-sandbox-title">
                    Sandbox <span className="watch-sandbox-label">(Adblocker)</span>
                  </p>
                  <p className="watch-sandbox-desc">
                    Some servers do not support sandbox. Turn it off if video doesn't load.
                  </p>
                </div>
                <label className="watch-toggle">
                  <input
                    type="checkbox"
                    checked={sandboxEnabled}
                    onChange={(e) => setSandboxEnabled(e.target.checked)}
                  />
                  <span className="watch-toggle-slider"></span>
                </label>
              </div>

              {/* Server List */}
              <div className="watch-server-list">
                <p className="watch-server-list-title">Select Server</p>
                {servers.map((server, index) => (
                  <div
                    key={server.name}
                    className={`watch-server-card ${currentServer === index ? 'active' : ''}`}
                    onClick={() => handleServerSelect(index)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleServerSelect(index);
                      }
                    }}
                  >
                    <div className="watch-server-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="16" fill="#090A15" />
                        <path
                          fill="#fff"
                          fillRule="evenodd"
                          d="M8.004 19.728a.996.996 0 0 1-.008-1.054l7.478-12.199a.996.996 0 0 1 1.753.104l6.832 14.82a.996.996 0 0 1-.618 1.37l-10.627 3.189a.996.996 0 0 1-1.128-.42l-3.682-5.81Zm8.333-9.686a.373.373 0 0 1 .709-.074l4.712 10.904a.374.374 0 0 1-.236.506L14.18 23.57a.373.373 0 0 1-.473-.431l2.63-13.097Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {server.isLocked && !unlockedServers[server.name] && (
                        <span className="watch-server-lock-badge">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="watch-server-details">
                      <p className="watch-server-name">
                        {server.name}
                        {server.isRecommended && (
                          <span className="watch-server-recommended"> (Recommended)</span>
                        )}
                        {server.hasAds && (
                          <span className="watch-server-ads-badge"> (Ads)</span>
                        )}
                      </p>
                      <p className="watch-server-desc">{server.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Close Button */}
              <button className="watch-drawer-close" onClick={() => setServerDrawerOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Password Modal */}
        {passwordModalOpen && (
          <div className="watch-password-overlay" onClick={handlePasswordCancel}>
            <div className="watch-password-modal" onClick={(e) => e.stopPropagation()}>
              <div className="watch-password-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className="watch-password-title">Beta Server</h3>
              <p className="watch-password-desc">This server is in beta testing. Password available to early supporters only.</p>
              <input
                type="password"
                className="watch-password-input"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordSubmit();
                }}
                autoFocus
              />
              {passwordError && (
                <p className="watch-password-error">{passwordError}</p>
              )}
              <div className="watch-password-buttons">
                <button className="watch-password-btn cancel" onClick={handlePasswordCancel}>
                  Cancel
                </button>
                <button className="watch-password-btn submit" onClick={handlePasswordSubmit}>
                  Unlock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Episode Drawer Modal */}
        {episodeDrawerOpen && type === 'tv' && (
          <div className="watch-episode-drawer-overlay" onClick={() => { setEpisodeDrawerOpen(false); setEpisodeSearchQuery(''); }}>
            <div
              className="watch-episode-drawer"
              onClick={(e) => e.stopPropagation()}
              style={{
                transform: `translateY(${episodeDrawerTranslateY}px)`,
                transition: isEpisodeDragging.current ? 'none' : 'transform 0.3s ease'
              }}
            >
              {/* Drawer Handle */}
              <div
                className="watch-drawer-handle"
                onMouseDown={handleEpisodeMouseDown}
                onTouchStart={handleEpisodeTouchStart}
                onTouchMove={handleEpisodeTouchMove}
                onTouchEnd={handleEpisodeTouchEnd}
              ></div>

              {/* Header */}
              <div className="watch-episode-drawer-header">
                <div className="watch-episode-drawer-title">
                  <h2>Episodes</h2>
                  <span className="watch-episode-count">{episodes.length}</span>
                </div>
              </div>

              {/* Season Selector */}
              <div className="watch-episode-drawer-season">
                <select
                  value={currentSeason}
                  onChange={(e) => handleSeasonChange(Number(e.target.value))}
                  className="watch-episode-season-select"
                >
                  {seasons.map(season => (
                    <option key={season.season_number} value={season.season_number}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Input */}
              <div className="watch-episode-search-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.3-4.3"></path>
                </svg>
                <input
                  type="text"
                  className="watch-episode-search"
                  placeholder="Search episodes..."
                  value={episodeSearchQuery}
                  onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                />
              </div>

              {/* Episode List */}
              <div className="watch-episode-list">
                {episodes
                  .filter(ep => {
                    if (episodeSearchQuery === '') return true;

                    const query = episodeSearchQuery.toLowerCase().trim();

                    // Check standard text search (name, overview)
                    if (ep.name?.toLowerCase().includes(query) ||
                      ep.overview?.toLowerCase().includes(query)) {
                      return true;
                    }

                    // Parse episode number patterns: "Episode 1", "EP1", "EP 1", "Ep. 1"
                    const epOnlyMatch = query.match(/^(?:episode|ep\.?)\s*(\d+)$/i);
                    if (epOnlyMatch) {
                      const searchEpNum = parseInt(epOnlyMatch[1], 10);
                      return ep.episode_number === searchEpNum;
                    }

                    // Parse season+episode patterns: "S1 EP1", "S1E1", "Season 1 Episode 1", "S1 E1"
                    const seasonEpMatch = query.match(/^(?:s(?:eason)?\s*(\d+)\s*)?(?:ep(?:isode)?\.?\s*|e)(\d+)$/i);
                    if (seasonEpMatch) {
                      const searchSeasonNum = seasonEpMatch[1] ? parseInt(seasonEpMatch[1], 10) : null;
                      const searchEpNum = parseInt(seasonEpMatch[2], 10);

                      // If season is specified, check if viewing that season
                      if (searchSeasonNum !== null && searchSeasonNum !== currentSeason) {
                        return false;
                      }
                      return ep.episode_number === searchEpNum;
                    }

                    // Direct number search (just "1" or "12")
                    const directNum = query.match(/^(\d+)$/);
                    if (directNum) {
                      const searchNum = parseInt(directNum[1], 10);
                      return ep.episode_number === searchNum;
                    }

                    return false;
                  })
                  .map(episode => (
                    <div
                      key={episode.episode_number}
                      className={`watch-episode-item ${currentEpisode === episode.episode_number ? 'active' : ''}`}
                      onClick={() => {
                        setCurrentEpisode(episode.episode_number);
                        setEpisodeDrawerOpen(false);
                        setEpisodeSearchQuery('');
                      }}
                    >
                      {/* Thumbnail */}
                      <div className="watch-episode-thumbnail">
                        {episode.still_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w300${episode.still_path}`}
                            alt={episode.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="watch-episode-thumbnail-placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m22 8-6 4 6 4V8Z"></path>
                              <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
                            </svg>
                          </div>
                        )}
                        {currentEpisode === episode.episode_number && (
                          <div className="watch-episode-play-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z"></path>
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="watch-episode-content">
                        <div className="watch-episode-badges">
                          <span className="watch-episode-number">EP {episode.episode_number}</span>
                          {currentEpisode === episode.episode_number && (
                            <span className="watch-episode-playing">Playing</span>
                          )}
                        </div>
                        <h3 className="watch-episode-title">{episode.name || `Episode ${episode.episode_number}`}</h3>
                        {episode.overview && (
                          <p className="watch-episode-overview">{episode.overview}</p>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="watch-episode-meta">
                        {episode.vote_average > 0 && (
                          <span className="watch-episode-rating">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                            {episode.vote_average.toFixed(1)}
                          </span>
                        )}
                        {episode.runtime && (
                          <span className="watch-episode-duration">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            {episode.runtime} min
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Watch;