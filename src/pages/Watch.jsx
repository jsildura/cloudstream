import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import { useToast } from '../contexts/ToastContext';
import useWatchHistory from '../hooks/useWatchHistory';

const Watch = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const urlSeason = searchParams.get('season');
  const urlEpisode = searchParams.get('episode');

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

  const { POSTER_URL } = useTMDB();
  const { showNowPlaying } = useToast();
  const { addToHistory } = useWatchHistory();
  const hasShownToast = useRef(false);

  // Show "Now Playing" toast when page is fully loaded
  useEffect(() => {
    if (!loading && contentInfo && !hasShownToast.current) {
      // Add a small delay to ensure the page is fully rendered
      const timer = setTimeout(() => {
        const title = contentInfo.title || contentInfo.name;
        showNowPlaying(title);
        hasShownToast.current = true;
      }, 4000); // 4000ms delay after loading completes

      return () => clearTimeout(timer);
    }
  }, [loading, contentInfo, showNowPlaying]);

  // Track watch history when player loads
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
    }
  }, [playerLoaded, contentInfo, currentSeason, currentEpisode, type, seasons.length, addToHistory]);

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
    if (isFullscreen) {
      hideControlsTimer.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement);
      setIsFullscreen(isFs);
      if (isFs) {
        resetHideTimer();
      } else {
        setControlsVisible(true);
        if (hideControlsTimer.current) {
          clearTimeout(hideControlsTimer.current);
        }
      }
    };

    const handleDocumentMouseMove = () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        resetHideTimer();
      }
    };

    const handleKeyDown = (e) => {
      if (isFullscreen) {
        resetHideTimer();
      }
    };

    const handleFocusIn = () => {
      if (isFullscreen) {
        resetHideTimer();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [isFullscreen]);

  const _serverData = useMemo(() => [
    {
      n: 'Server 1', d: 'Fast Streaming. Movies & TV. Main Server.', r: true, ss: true, p: 0,
      u: ['aHR0cHM6Ly93d3cuenhjc3RyZWFtLnh5ei9lbWJlZC8=', '?autoPlay=true']
    },
    {
      n: 'Server 2', d: 'English Audio Track. Reliable Backup.', r: true, ss: true, p: 0,
      u: ['aHR0cHM6Ly96eGNzdHJlYW0ueHl6L3BsYXllci8=', '/en']
    },
    {
      n: 'Server 3', d: 'Fast & Ad-free. Auto-play Enabled.', r: true, ss: true, p: 0,
      u: ['aHR0cHM6Ly92aWRzcmMuY2MvdjIvZW1iZWQv', '?autoPlay=true']
    },
    {
      n: 'Server 4', d: 'Fast & Reliable. Movies, TV & Anime.', r: true, ss: false, p: 0,
      u: ['aHR0cHM6Ly92aWRzeW5jLnh5ei9lbWJlZC8=', '']
    },
    {
      n: 'Server 5', d: '4K Ultra HD with TMDB Integration.', r: true, ss: false, p: 0,
      u: ['aHR0cHM6Ly9hcGkuY2luZWJ5LmhvbWVzL2VtYmVkLw==', '']
    },
    {
      n: 'Server 6', d: 'Reliable Server with Vast Collection, Fast Streaming.', r: true, ss: false, p: 5,
      u: ['aHR0cHM6Ly92aWRzcmMueHl6L2VtYmVkLw==', '']
    },
    {
      n: 'Server 7', d: 'Premium Quality. Customizable Player.', r: false, ss: false, p: 0, ads: true,
      u: ['aHR0cHM6Ly92aWRsaW5rLnByby8=', '']
    },
    {
      n: 'Server 8', d: 'Lightning Fast. Multiple Mirrors.', r: false, ss: false, p: 0, ads: true,
      u: ['aHR0cHM6Ly92aWRmYXN0LnByby8=', '']
    },
    {
      n: 'Server 9', d: 'Huge Catalog. Quick Load Times.', r: false, ss: false, p: 0, ads: true,
      u: ['aHR0cHM6Ly92aXhzcmMudG8v', '']
    },
    {
      n: 'Server 10', d: '4K Movies with Multi-Language Subtitles.', r: false, ss: true, p: 3,
      u: ['aHR0cHM6Ly9mbW92aWVzNHUuY29tL2VtYmVkL3RtZGItbW92aWUt', '']
    },
    {
      n: 'Server 11', d: '1080p HD Movies. Clean Interface.', r: false, ss: true, p: 1,
      u: ['aHR0cHM6Ly93d3cudmlka2luZy5uZXQvZW1iZWQvbW92aWUv', '']
    },
    {
      n: 'Server 12', d: 'High Bitrate Movies. Alternative Source.', r: false, ss: false, p: 2, ads: true,
      u: ['aHR0cHM6Ly92aWRzcmMud3RmL2FwaS8zL21vdmllLz9pZD0=', '']
    },
    {
      n: 'Server 13', d: 'Multi-Source Backup Servers. Subtitle Support.', r: true, ss: false, p: 0, ads: true, locked: true, pwd: 'c3RyZWFtZmxpeEBfMTM=', // Remove both locked: true, and pwd: '...', to disable the lock for that server.
      u: ['aHR0cHM6Ly9wbGF5ZXIudmlkemVlLnd0Zi9lbWJlZC8=', '']
    },
    {
      n: 'Server 14', d: 'Multi-Source. Customizable Subtitles. Up to 1080p.', r: true, ss: false, p: 0, ads: true, locked: true, pwd: 'c3RyZWFtZmxpeEBfMTQ=', // Remove both locked: true, and pwd: '...', to disable the lock for that server.
      u: ['aHR0cHM6Ly9wbGF5ZXIudmlkZWFzeS5uZXQv', '']
    },
    {
      n: 'Server 15', d: 'Subtitle Support. Up to 1080p Quality.', r: true, ss: false, p: 0, ads: true, locked: true, pwd: 'c3RyZWFtZmxpeEBfMTU=', // Remove both locked: true, and pwd: '...', to disable the lock for that server.
      u: ['aHR0cHM6Ly9tYXBwbGUudWsvd2F0Y2gv', '']
    }
  ], []);

  const servers = useMemo(() => _serverData.map(s => ({
    name: s.n,
    description: s.d,
    isRecommended: s.r,
    sandboxSupport: s.ss,
    hasAds: s.ads || false,
    isLocked: s.locked || false,
    password: s.pwd || null,
    getUrl: (season, episode) => {
      const base = atob(s.u[0]);
      const suffix = s.u[1];
      const tvPath = type === 'tv' ? `/${season}/${episode}` : '';
      switch (s.p) {
        case 1: // Movie-only path (e.g., /embed/movie/{id})
          return type === 'movie' ? `${base}${id}${suffix}` : null;
        case 2: // ID as query param (e.g., ?id={id})
          return type === 'movie' ? `${base}${id}${suffix}` : null;
        case 3: // TMDB prefix (e.g., tmdb-movie-{id})
          return type === 'movie' ? `${base}${id}${suffix}` : null;
        case 4: // PrimeSRC format: {base}{type}?tmdb={id} with TV support
          if (type === 'tv') {
            return `${base}${type}?tmdb=${id}&season=${season}&episode=${episode}`;
          }
          return `${base}${type}?tmdb=${id}`;
        case 5: // vidsrc.xyz format: movie/{id} or tv?tmdb={id}&season=&episode=
          if (type === 'tv') {
            return `${base}tv?tmdb=${id}&season=${season}&episode=${episode}`;
          }
          return `${base}movie/${id}`;
        default: // Standard pattern: {base}{type}/{id}{tvPath}{suffix}
          return `${base}${type}/${id}${tvPath}${suffix}`;
      }
    }
  })), [_serverData, type, id]);


  useEffect(() => {
    if (type && id) {
      fetchContentData();
    } else {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    setSandboxEnabled(servers[currentServer].sandboxSupport);
    setPlayerLoaded(false); // Reset lazy load when server changes
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
        // Use URL parameters if available, otherwise default to first season
        const seasonToLoad = urlSeason ? parseInt(urlSeason) : validSeasons[0].season_number;

        // Only set season if no URL parameter (avoid overwriting initial state)
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

      // Only reset to episode 1 if:
      // - No URL episode parameter exists, OR
      // - We're loading a different season than the URL season
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

    // Check if server is locked and not yet unlocked for this specific server
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
      // Store unlock for this specific server in localStorage
      const newUnlocked = { ...unlockedServers, [server.name]: true };
      localStorage.setItem('unlockedServers', JSON.stringify(newUnlocked));
      setUnlockedServers(newUnlocked);
      setPasswordModalOpen(false);

      // Now select the server
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
    navigate(-1);
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
    <div className={`watch-fullscreen${isFullscreen ? ' css-fullscreen-mode' : ''}`} ref={watchContainerRef} onMouseMove={resetHideTimer} onTouchStart={resetHideTimer}>
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
          {/* Invisible overlay to capture mouse when controls hidden in fullscreen */}
          {isFullscreen && !controlsVisible && (
            <div
              className="watch-mouse-capture"
              onMouseMove={resetHideTimer}
              onClick={resetHideTimer}
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
          </div>
        </div>
      )}

      {/* Overlay Buttons */}
      <button className={`watch-overlay-btn watch-back-btn${!controlsVisible ? ' controls-hidden' : ''}`} onClick={handleBack}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 19-7-7 7-7"></path>
          <path d="M19 12H5"></path>
        </svg>
        Back
      </button>

      <button className={`watch-overlay-btn watch-server-btn${!controlsVisible ? ' controls-hidden' : ''}`} onClick={() => setServerDrawerOpen(true)}>
        Server
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7 15 5 5 5-5"></path>
          <path d="m7 9 5-5 5 5"></path>
        </svg>
      </button>

      {/* Playback Warning Icon - Toggle Button */}
      <button
        className={`watch-playback-warning-icon${!controlsVisible ? ' controls-hidden' : ''}`}
        onClick={() => setWarningExpanded(!warningExpanded)}
        aria-label="Show playback help"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
          <path d="M12 9v4"></path>
          <path d="M12 17h.01"></path>
        </svg>
      </button>

      {/* Playback Warning Tooltip - Appears Below Icon */}
      {warningExpanded && (
        <div className={`watch-playback-warning-tooltip${!controlsVisible ? ' controls-hidden' : ''}`}>
          Switch servers if the video doesn't start
        </div>
      )}

      {/* Custom Fullscreen Button */}
      <button className={`watch-overlay-btn watch-fullscreen-btn${!controlsVisible ? ' controls-hidden' : ''}`} onClick={() => {
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
              elem.requestFullscreen().then(() => {
                setIsFullscreen(true);
              }).catch(err => {
                console.log('Standard fullscreen failed, trying fallback:', err);
                setIsFullscreen(true);
              });
            } else if (elem.webkitRequestFullscreen) {
              elem.webkitRequestFullscreen();
              setIsFullscreen(true);
            } else if (elem.webkitEnterFullscreen) {
              elem.webkitEnterFullscreen();
              setIsFullscreen(true);
            } else if (elem.mozRequestFullScreen) {
              elem.mozRequestFullScreen();
              setIsFullscreen(true);
            } else if (elem.msRequestFullscreen) {
              elem.msRequestFullscreen();
              setIsFullscreen(true);
            } else {
              setIsFullscreen(true);
            }
          } else {
            if (doc.exitFullscreen) {
              doc.exitFullscreen().then(() => {
                setIsFullscreen(false);
              }).catch(() => setIsFullscreen(false));
            } else if (doc.webkitExitFullscreen) {
              doc.webkitExitFullscreen();
              setIsFullscreen(false);
            } else if (doc.mozCancelFullScreen) {
              doc.mozCancelFullScreen();
              setIsFullscreen(false);
            } else if (doc.msExitFullscreen) {
              doc.msExitFullscreen();
              setIsFullscreen(false);
            } else {
              setIsFullscreen(false);
            }
          }
        }
      }}>
        {isFullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
            <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
            <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
            <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
            <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
          </svg>
        )}
      </button>

      {/* TV Episode Badge */}
      {type === 'tv' && (
        <div className="watch-episode-badge">
          S{currentSeason} • E{currentEpisode}
        </div>
      )}

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

            {/* TV Show Episode Selector */}
            {type === 'tv' && seasons.length > 0 && (
              <div className="watch-episode-section">
                <div className="watch-season-row">
                  <label className="watch-season-label">Season</label>
                  <select
                    value={currentSeason}
                    onChange={(e) => handleSeasonChange(Number(e.target.value))}
                    className="watch-season-select"
                  >
                    {seasons.map(season => (
                      <option key={season.season_number} value={season.season_number}>
                        {season.name} ({season.episode_count} eps)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="watch-episodes-grid">
                  {episodes.map(episode => (
                    <button
                      key={episode.episode_number}
                      className={`watch-episode-btn ${currentEpisode === episode.episode_number ? 'active' : ''}`}
                      onClick={() => setCurrentEpisode(episode.episode_number)}
                    >
                      E{episode.episode_number}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
    </div>
  );
};

export default Watch;