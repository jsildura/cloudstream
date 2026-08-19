import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import { useToast } from '../contexts/ToastContext';
import useWatchHistory from '../hooks/useWatchHistory';
import usePopularTracking from '../hooks/usePopularTracking';
import useWatchlist from '../hooks/useWatchlist';
import { serverConfig, buildServerUrl, isServerEnabled, getFirstEnabledServerIndex } from '../config/servers';
import SchemaMarkup from '../components/SchemaMarkup';
import MetaTags from '../components/MetaTags';
import { generateVideoObjectSchema } from '../utils/schemaUtils';
import { generateContentMeta } from '../utils/metaUtils';
import { episodeStill, cardBackdrop, posterAsBackdrop } from '../utils/images';
import DirectPlayer from '../components/DirectPlayer';
import { useProfiles } from '../contexts/ProfileContext';
import { filterKidsCandidates } from '../lib/tmdbClient';

// Adsterra smartlink — same monetization used by the Watch Now / Play buttons
// (Modal, BannerSlider, HoverPreviewCard): open the ad in a new tab with a
// first-click grace period and a 2-minute cooldown between popups.
const AD_URL = 'https://consumptionbackwardsentiments.com/kjy2d6bi?key=b2d063ec2be89ba5e928fdd367071bbd';
const AD_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

const Watch = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isKidsMode } = useProfiles();
  const searchParams = new URLSearchParams(location.search);

  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const urlSeason = searchParams.get('season');
  const urlEpisode = searchParams.get('episode');

  // Check if we came from modal navigation (has fromModal flag in state)
  const cameFromModal = location.state?.fromModal === true;
  // True when auto-next handed off to this movie — skip the lazy-load overlay
  // and start with the player loaded so it streams immediately.
  const autoPlayNext = location.state?.autoPlay === true;

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: redirect runs once on mount

  const [currentServer, setCurrentServer] = useState(() => {
    try {
      const saved = localStorage.getItem(`server-${id}`);
      if (saved !== null) {
        const idx = parseInt(saved, 10);
        // A saved pick that has since been disabled falls through to the default.
        if (Number.isFinite(idx) && isServerEnabled(idx)) return idx;
      }
    } catch { /* localStorage unavailable */ }
    return getFirstEnabledServerIndex();
  });
  const [currentSeason, setCurrentSeason] = useState(urlSeason ? parseInt(urlSeason) : 1);
  const [currentEpisode, setCurrentEpisode] = useState(urlEpisode ? parseInt(urlEpisode) : 1);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [contentInfo, setContentInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playerLoaded, setPlayerLoaded] = useState(autoPlayNext);
  // Consumed on first render: lets an auto-play handoff keep the player
  // mounted once, then behaves like any other watch page.
  const autoPlayHandledRef = useRef(autoPlayNext);

  const [serverDrawerOpen, setServerDrawerOpen] = useState(false);
  const [sandboxEnabled, setSandboxEnabled] = useState(true);
  const [drawerTranslateY, setDrawerTranslateY] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsLocked, setControlsLocked] = useState(false);
  const lockOverlayRef = useRef(null);

  // Auto-advance: "Up Next" card with countdown. Triggered either when
  // DirectPlayer fires onEnded (TV/movie) or, via the end-credits heuristic,
  // when playback enters the title's final minutes. TMDB has no credit-start
  // timestamps, so this is the fallback: 2 minutes for episodes (their credits
  // are short), 5 minutes for movies (their end-credit roll runs much longer).
  const CREDIT_WINDOW_SECONDS = type === 'movie' ? 300 : 120;
  const [autoAdvanceActive, setAutoAdvanceActive] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(10);
  const [autoAdvanceTotal, setAutoAdvanceTotal] = useState(10);
  const autoAdvanceTimerRef = useRef(null);
  // Mirrors autoAdvanceActive so interval/event callbacks can read it synchronously.
  const autoAdvanceActiveRef = useRef(false);
  // True while the running countdown came from the credits window — it freezes
  // while paused. The on-ended countdown always ticks (playback is over).
  const creditsCountdownRef = useRef(false);
  // True when the user canceled the card during the credits: don't re-show it
  // when the episode actually ends.
  const creditsOverlayDismissedRef = useRef(false);
  // Guards against the credits countdown and the ended event double-advancing.
  const advancingRef = useRef(false);
  const isPlayingRef = useRef(false);
  // Set before skipping to the next episode so the player stays mounted and
  // plays it directly instead of dropping to the lazy-load overlay.
  const keepPlayerLoadedRef = useRef(false);

  useEffect(() => {
    if (controlsLocked && lockOverlayRef.current) {
      lockOverlayRef.current.focus();
    }
  }, [controlsLocked]);

  // Episode drawer state
  const [episodeDrawerOpen, setEpisodeDrawerOpen] = useState(false);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [episodeDrawerTranslateY, setEpisodeDrawerTranslateY] = useState(0);

  const watchContainerRef = useRef(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);
  const hideControlsTimer = useRef(null);
  const episodeDragStartY = useRef(0);
  const isEpisodeDragging = useRef(false);
  const episodeDrawerTranslateRef = useRef(0);

  const { POSTER_URL } = useTMDB();
  const { showNowPlaying, showSuccess, showError } = useToast();
  const { addToHistory, updateProgress, getLastWatched, flushPendingHistory } = useWatchHistory();
  const getLastWatchedRef = useRef(getLastWatched);
  getLastWatchedRef.current = getLastWatched;
  const flushPendingHistoryRef = useRef(flushPendingHistory);
  flushPendingHistoryRef.current = flushPendingHistory;
  const { trackWatch } = usePopularTracking();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const hasShownToast = useRef(false);
  const wakeLockRef = useRef(null);
  const isSaved = contentInfo ? isInWatchlist(type, contentInfo.id) : false;

  // Persist the final playback position as soon as the player is left, instead of
  // waiting out the remainder of the progress throttle window.
  useEffect(() => {
    return () => {
      flushPendingHistoryRef.current?.();
    };
  }, []);

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
            } catch {
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

  const hasAddedHistoryKeyRef = useRef('');

  useEffect(() => {
    if (playerLoaded && contentInfo) {
      const sessionKey = `${type}_${contentInfo.id}_${currentSeason || 1}_${currentEpisode || 1}`;
      if (hasAddedHistoryKeyRef.current === sessionKey) return;
      hasAddedHistoryKeyRef.current = sessionKey;

      // Keep any previously saved progress so a fresh session doesn't reset it.
      const prev = getLastWatchedRef.current(type, contentInfo.id);
      addToHistory({
        id: contentInfo.id,
        type,
        title: contentInfo.title || contentInfo.name,
        poster_path: contentInfo.poster_path,
        backdrop_path: contentInfo.backdrop_path,
        currentTime: prev?.currentTime || 0,
        duration: prev?.duration || 0,
        genres: contentInfo.genres || contentInfo.genre_ids,
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

  // Progress updates from DirectPlayer — entry already exists (see above),
  // so only the time/duration/progress fields are refreshed.
  const handlePlayerProgress = useCallback((data) => {
    if (!contentInfo) return;
    updateProgress(type, contentInfo.id, data.timestamp, data.duration, {
      title: contentInfo.title || contentInfo.name,
      poster_path: contentInfo.poster_path,
      backdrop_path: contentInfo.backdrop_path,
      genres: contentInfo.genres || contentInfo.genre_ids,
      ...(type === 'tv' && {
        lastSeason: currentSeason,
        lastEpisode: currentEpisode,
        totalSeasons: seasons.length,
      })
    });
    if (type === 'tv' || type === 'movie') {
      // Keep the live position so the credits heuristic can fire mid-title.
      setPlayerProgress({
        id: data.id,
        type: data.type,
        season: data.season,
        episode: data.episode,
        timestamp: data.timestamp,
        duration: data.duration,
      });
    }
  }, [contentInfo, updateProgress, type, currentSeason, currentEpisode, seasons.length]);

  // Live playback position for the current episode (drives the credits
  // heuristic). Gated on season/episode so stale progress from a previous
  // episode can never trigger the overlay.
  const [playerProgress, setPlayerProgress] = useState(null);

  const handlePlayStateChange = useCallback((playing) => {
    isPlayingRef.current = playing;
  }, []);

  // Resume position: captured once per title/episode so live progress
  // updates can't re-seek mid-playback. TV resumes only when the saved
  // season/episode match; movies restart once >= 95% finished.
  const [resumeTime, setResumeTime] = useState(0);
  useEffect(() => {
    if (!contentInfo) {
      setResumeTime(0);
      return;
    }
    const prev = getLastWatchedRef.current(contentInfo.id);
    if (!prev) {
      setResumeTime(0);
      return;
    }
    if (type === 'tv') {
      const sameEpisode =
        prev.lastSeason === currentSeason && prev.lastEpisode === currentEpisode;
      setResumeTime(sameEpisode ? prev.currentTime || 0 : 0);
    } else {
      const t = prev.currentTime || 0;
      const d = prev.duration || 0;
      setResumeTime(t > 0 && d > 0 && t / d < 0.95 ? t : 0);
    }
  }, [contentInfo, type, currentSeason, currentEpisode]);

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

  const [_devToolsOpen, setDevToolsOpen] = useState(false);

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
    directPlayer: s.directPlayer || false,
    disabled: s.disabled || false,
    getUrl: (season, episode) => buildServerUrl(s, type, id, season, episode)
  })), [type, id]);

  // Only these are listed in the picker. Disabled servers keep their slot in
  // `servers` so persisted indices stay valid, they just aren't offered.
  const selectableServers = useMemo(
    () => servers
      .map((server, index) => ({ server, index }))
      .filter(({ server }) => !server.disabled),
    [servers]
  );

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
    // `fetchContentData` is recreated every render; its real inputs are
    // type/id (+ URL params read via closure). Listing it would refetch each
    // render. Incl. only the inputs is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  useEffect(() => {
    setSandboxEnabled(servers[currentServer].sandboxSupport);
  }, [currentServer, servers]);

  // Any change that forces a fresh load resets the player to the lazy overlay.
  // Player mode is derived from the server config: `directPlayer` servers
  // render DirectPlayer, everything else embeds an iframe.
  useEffect(() => {
    // Skipping straight into the next episode keeps the player mounted; an
    // auto-play handoff (movie auto-next) keeps it loaded on first mount.
    // Every other change (manual nav, server switch, fresh load) drops to the
    // lazy-load overlay.
    if (!keepPlayerLoadedRef.current && !autoPlayHandledRef.current) {
      setPlayerLoaded(false);
    }
    keepPlayerLoadedRef.current = false;
    autoPlayHandledRef.current = false;
    setAutoAdvanceActive(false);
    autoAdvanceActiveRef.current = false;
    setAutoAdvanceCountdown(10);
    setAutoAdvanceTotal(10);
    creditsCountdownRef.current = false;
    creditsOverlayDismissedRef.current = false;
    advancingRef.current = false;
    if (autoAdvanceTimerRef.current) {
      clearInterval(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, [currentServer, currentSeason, currentEpisode, type, id]);

  // The "next" movie for auto-next: first recommendation with card art,
  // falling back to /similar when TMDB returns nothing useful.
  const [nextMovie, setNextMovie] = useState(null);

  useEffect(() => {
    if (type !== 'movie') return;
    let active = true;
    setNextMovie(null);
    const pickNext = async (results) => {
      let list = (results || [])
        .filter((m) => m.id !== Number(id) && (m.backdrop_path || m.poster_path))
        .map((m) => ({ ...m, media_type: 'movie' }));
      if (isKidsMode) {
        list = await filterKidsCandidates(list, { maxCandidates: 10 });
      }
      return list[0] || null;
    };
    (async () => {
      try {
        const res = await fetch(`/api/movie/${id}/recommendations`);
        const data = await res.json();
        let pick = await pickNext(data.results);
        if (!pick) {
          const similarRes = await fetch(`/api/movie/${id}/similar`);
          const similarData = await similarRes.json();
          pick = await pickNext(similarData.results);
        }
        if (active) setNextMovie(pick);
      } catch (error) {
        console.error('Failed to fetch next-movie recommendation:', error);
      }
    })();
    return () => { active = false; };
  }, [type, id, isKidsMode]);

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
        // TMDB lists Season 0 (Specials) first — default to the first real
        // season instead, unless the URL explicitly asked for specials.
        const seasonToLoad = urlSeason
          ? parseInt(urlSeason)
          : (validSeasons.find((s) => s.season_number > 0) ?? validSeasons[0]).season_number;

        if (!urlSeason) {
          setCurrentSeason(seasonToLoad);
        }

        await fetchEpisodes(seasonToLoad);
      }
    } catch (error) {
      console.error('Failed to fetch seasons:', error);
    }
  };

  const fetchEpisodes = useCallback(async (seasonNumber) => {
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
  }, [id, urlEpisode, urlSeason]);

  const handleSeasonChange = async (seasonNumber) => {
    setCurrentSeason(seasonNumber);
    await fetchEpisodes(seasonNumber);
  };

  // Navigate to previous episode (with cross-season support)
  const handlePrevEpisode = async () => {
    if (currentEpisode > 1) {
      setCurrentEpisode(currentEpisode - 1);
    } else if (seasons.length > 0) {
      // Find previous season
      const currentSeasonIndex = seasons.findIndex(s => s.season_number === currentSeason);
      if (currentSeasonIndex > 0) {
        const prevSeason = seasons[currentSeasonIndex - 1];
        setCurrentSeason(prevSeason.season_number);
        try {
          const res = await fetch(`/api/tv/${id}/season/${prevSeason.season_number}`);
          const data = await res.json();
          const prevEpisodes = data.episodes || [];
          setEpisodes(prevEpisodes);
          setCurrentEpisode(prevEpisodes.length);
        } catch (error) {
          console.error('Failed to load previous season:', error);
        }
      }
    }
  };

  // Navigate to next episode (with cross-season support), or to the next
  // recommended movie for movies (auto-next). The receiving movie page gets
  // an autoPlay flag so it streams without the lazy-load overlay.
  const handleNextEpisode = useCallback(async () => {
    if (type === 'movie') {
      if (!nextMovie) return;
      navigate(`/watch?type=movie&id=${nextMovie.id}`, {
        state: { fromModal: true, autoPlay: true },
      });
      return;
    }
    if (currentEpisode < episodes.length) {
      setCurrentEpisode(currentEpisode + 1);
    } else if (seasons.length > 0) {
      // Find next season
      const currentSeasonIndex = seasons.findIndex(s => s.season_number === currentSeason);
      if (currentSeasonIndex < seasons.length - 1) {
        const nextSeason = seasons[currentSeasonIndex + 1];
        // Set season + episode together (batched) so a player kept mounted for
        // direct play never transiently loads the old episode number of the
        // new season.
        setCurrentSeason(nextSeason.season_number);
        setCurrentEpisode(1);
        await fetchEpisodes(nextSeason.season_number);
      }
    }
  }, [type, nextMovie, navigate, currentEpisode, episodes, seasons, currentSeason, fetchEpisodes]);

  // Derived: can navigate prev/next?
  const canGoPrev = type === 'tv' && (
    currentEpisode > 1 ||
    seasons.findIndex(s => s.season_number === currentSeason) > 0
  );
  // Derived: can navigate prev/next? TV advances in-page to the next episode;
  // movies navigate to the next recommended movie (when one exists).
  const canGoNext = type === 'tv'
    ? (currentEpisode < episodes.length ||
       seasons.findIndex(s => s.season_number === currentSeason) < seasons.length - 1)
    : type === 'movie'
      ? !!nextMovie
      : false;

  // TMDB runtime of the current title in minutes (includes credits) — used by
  // the credits heuristic only when the stream's real duration isn't known.
  const currentEpisodeRuntime = useMemo(() => {
    if (type === 'movie') return contentInfo?.runtime || 0;
    if (type !== 'tv') return 0;
    const ep = episodes.find((e) => e.episode_number === currentEpisode);
    return ep?.runtime || contentInfo?.episode_run_time?.[0] || 0;
  }, [type, episodes, currentEpisode, contentInfo]);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearInterval(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  // Shared countdown engine. `initialSeconds` is the full countdown length
  // (10s after onEnded, up to 120s for the credits window). Reaching zero
  // advances to the next episode via the effect below.
  const startAutoAdvanceCountdown = useCallback((initialSeconds) => {
    clearAutoAdvanceTimer();
    setAutoAdvanceActive(true);
    autoAdvanceActiveRef.current = true;
    setAutoAdvanceCountdown(initialSeconds);
    setAutoAdvanceTotal(initialSeconds);
    autoAdvanceTimerRef.current = setInterval(() => {
      // The credits-window countdown freezes while paused (Netflix-style);
      // the on-ended countdown always runs because playback is over.
      if (creditsCountdownRef.current && !isPlayingRef.current) return;
      setAutoAdvanceCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
  }, [clearAutoAdvanceTimer]);

  // Countdown reaching zero → advance to the next episode / movie. Auto
  // advances play directly (no lazy-load overlay); only a manual skip shows
  // the ad.
  useEffect(() => {
    if (autoAdvanceActive && autoAdvanceCountdown <= 0 && !advancingRef.current) {
      advancingRef.current = true;
      clearAutoAdvanceTimer();
      setAutoAdvanceActive(false);
      autoAdvanceActiveRef.current = false;
      creditsCountdownRef.current = false;
      keepPlayerLoadedRef.current = true;
      handleNextEpisode();
    }
  }, [autoAdvanceActive, autoAdvanceCountdown, clearAutoAdvanceTimer, handleNextEpisode]);

  // Auto-advance: only for TV/movies on the direct player, only if there's a
  // next episode or next movie.
  const handleVideoEnded = useCallback(() => {
    if ((type !== 'tv' && type !== 'movie') || !canGoNext) return;
    if (!servers[currentServer]?.directPlayer) return;
    // The Up Next card may already be showing (credits window) — the video is
    // truly over now, so advance immediately instead of a fresh countdown.
    if (autoAdvanceActiveRef.current && !advancingRef.current) {
      advancingRef.current = true;
      clearAutoAdvanceTimer();
      setAutoAdvanceActive(false);
      autoAdvanceActiveRef.current = false;
      creditsCountdownRef.current = false;
      keepPlayerLoadedRef.current = true;
      handleNextEpisode();
      return;
    }
    creditsCountdownRef.current = false;
    startAutoAdvanceCountdown(10);
  }, [type, canGoNext, currentServer, servers, handleNextEpisode, clearAutoAdvanceTimer, startAutoAdvanceCountdown]);

  const cancelAutoAdvance = useCallback(() => {
    clearAutoAdvanceTimer();
    setAutoAdvanceActive(false);
    autoAdvanceActiveRef.current = false;
    setAutoAdvanceCountdown(10);
    setAutoAdvanceTotal(10);
    // Canceled during the credits: don't re-pop the card at the real end —
    // the user has already declined the next episode.
    if (creditsCountdownRef.current) {
      creditsOverlayDismissedRef.current = true;
    }
    creditsCountdownRef.current = false;
  }, [clearAutoAdvanceTimer]);

  const skipAutoAdvance = useCallback(() => {
    // Ad popup: first ever click is a grace period (no ad), then the smartlink
    // opens in a new tab at most once per cooldown window. Same as the Watch
    // Now / Play buttons elsewhere in the app.
    const hasClickedBefore = localStorage.getItem('hasClickedWatch') === 'true';
    if (!hasClickedBefore) {
      localStorage.setItem('hasClickedWatch', 'true');
    } else {
      const lastAdTime = parseInt(localStorage.getItem('lastAdTrigger') || '0', 10);
      const now = Date.now();
      if (now - lastAdTime >= AD_COOLDOWN_MS) {
        window.open(AD_URL, '_blank');
        localStorage.setItem('lastAdTrigger', now.toString());
      }
    }

    clearAutoAdvanceTimer();
    setAutoAdvanceActive(false);
    autoAdvanceActiveRef.current = false;
    setAutoAdvanceCountdown(10);
    setAutoAdvanceTotal(10);
    creditsCountdownRef.current = false;
    // Play the next episode directly instead of dropping to the lazy overlay.
    keepPlayerLoadedRef.current = true;
    handleNextEpisode();
  }, [clearAutoAdvanceTimer, handleNextEpisode]);

  // End-credits heuristic fallback: TMDB has no credit-start timestamps, so
  // assume the credits begin in the final CREDIT_WINDOW_SECONDS of the title
  // (TMDB runtime includes the credits; the stream's real duration wins when
  // known). Once playback crosses that point on the direct player, show the
  // Up Next card with a countdown capped at that window.
  useEffect(() => {
    if ((type !== 'tv' && type !== 'movie') || !canGoNext) return;
    if (!servers[currentServer]?.directPlayer) return;
    if (!playerProgress) return;
    // Gate on the exact content being watched so stale progress from a
    // previous episode/movie can never trigger the overlay.
    if (type === 'tv') {
      if (playerProgress.season !== currentSeason || playerProgress.episode !== currentEpisode) return;
    } else if (playerProgress.type !== 'movie' || String(playerProgress.id) !== String(id)) {
      return;
    }
    if (creditsOverlayDismissedRef.current) return;

    const durationSec = playerProgress.duration > 0
      ? playerProgress.duration
      : currentEpisodeRuntime * 60;
    if (!durationSec || durationSec <= CREDIT_WINDOW_SECONDS) return;

    const creditsStart = durationSec - CREDIT_WINDOW_SECONDS;
    const inCredits = playerProgress.timestamp > 0 && playerProgress.timestamp >= creditsStart;

    if (autoAdvanceActiveRef.current) {
      // Scrubbed back before the credits: hide the card, stop the countdown.
      if (!inCredits) {
        clearAutoAdvanceTimer();
        setAutoAdvanceActive(false);
        autoAdvanceActiveRef.current = false;
        creditsCountdownRef.current = false;
        setAutoAdvanceCountdown(10);
        setAutoAdvanceTotal(10);
      }
      return;
    }

    if (!inCredits) return;

    const remaining = Math.max(1, Math.min(
      CREDIT_WINDOW_SECONDS,
      Math.round(durationSec - playerProgress.timestamp)
    ));
    creditsCountdownRef.current = true;
    startAutoAdvanceCountdown(remaining);
  }, [playerProgress, type, id, canGoNext, currentServer, servers, currentSeason, currentEpisode, currentEpisodeRuntime, CREDIT_WINDOW_SECONDS, clearAutoAdvanceTimer, startAutoAdvanceCountdown]);

  const getVideoUrl = () => {
    return servers[currentServer].getUrl(currentSeason, currentEpisode);
  };

  const handleServerSelect = (index) => {
    const server = servers[index];
    setCurrentServer(index);
    setSandboxEnabled(server.sandboxSupport);
    setServerDrawerOpen(false);
    try { localStorage.setItem(`server-${id}`, index); } catch { /* noop */ }
  };

  const handleBack = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
      // w1280: it's a blurred lazy-load backdrop — the 2-6MB original is
      // wasted storage (and it fills the SW tmdb-images cache on mobile).
      return `https://image.tmdb.org/t/p/w1280${contentInfo.backdrop_path}`;
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

  const formatCountdown = (seconds) => {
    const s = Math.max(0, seconds);
    if (s >= 60) {
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }
    return `${s}s`;
  };

  return (
    <>
      <MetaTags {...metaData} />
      <SchemaMarkup schema={videoSchema} />
      <div className={`watch-fullscreen${isFullscreen ? ' css-fullscreen-mode' : ''}${controlsVisible ? ' sidebar-visible' : ''}`} ref={watchContainerRef} onMouseMove={resetHideTimer} onTouchStart={resetHideTimer}>
        {/* Video Player - Lazy Loaded */}
        {playerLoaded ? (
          <>
            {servers[currentServer].directPlayer ? (
              <DirectPlayer
                type={type}
                id={id}
                season={currentSeason}
                episode={currentEpisode}
                title={contentInfo?.title || contentInfo?.name}
                year={contentInfo?.release_date?.slice(0, 4) || contentInfo?.first_air_date?.slice(0, 4)}
                date={contentInfo?.release_date || contentInfo?.first_air_date}
                runtime={contentInfo?.runtime || contentInfo?.episode_run_time?.[0]}
                onFallback={() => {
                  // Direct resolution failed (e.g. the zxcstream backend is
                  // rate-limiting our resolver). Fall back to Server 2 — the
                  // zxcstream iframe — which plays from the browser's own IP
                  // and usually still works when the direct path is throttled.
                  const nextServer = servers.findIndex(
                    (s, i) => i > currentServer && !s.disabled
                  );
                  if (nextServer !== -1) {
                    // Let GlobalChat's Report Issue auto-attach what the user
                    // was watching and which server failed — the user only has
                    // to pick a category and describe what happened.
                    window.dispatchEvent(new CustomEvent('streamflix:playback-issue', {
                      detail: {
                        title: contentInfo?.title || contentInfo?.name || '',
                        tmdbId: id,
                        mediaType: type,
                        season: currentSeason,
                        episode: currentEpisode,
                        fromServer: servers[currentServer]?.name || '',
                        toServer: servers[nextServer]?.name || '',
                      },
                    }));
                    setCurrentServer(nextServer);
                    try { localStorage.setItem(`server-${id}`, nextServer); } catch { /* noop */ }
                  }
                }}
                showControls={!controlsLocked}
                backdrop={getBackdropUrl()}
                onProgress={handlePlayerProgress}
                resumeTime={resumeTime}
                onEnded={handleVideoEnded}
                onPlayStateChange={handlePlayStateChange}
              />
            ) : (
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
            )}
            {/* Invisible overlay to capture touch/mouse when controls are hidden */}
            {!controlsVisible && (
              <div
                className="watch-mouse-capture"
                onMouseMove={resetHideTimer}
                onClick={resetHideTimer}
                onTouchStart={resetHideTimer}
              />
            )}
            {/* Lock overlay: blocks all interaction with the embed/player while locked */}
            {controlsLocked && (
              <div
                ref={lockOverlayRef}
                className="watch-lock-overlay"
                tabIndex={-1}
                aria-label="Controls locked"
                onMouseMove={resetHideTimer}
                onTouchStart={resetHideTimer}
                onClick={(e) => e.preventDefault()}
                onWheel={(e) => e.preventDefault()}
                onKeyDown={(e) => e.preventDefault()}
              />
            )}
            {/* Streamflix-side overlay (title badge) belongs to the native
                DirectPlayer only — iframe servers render their own
                title/player UI, so they must not be covered by ours. */}
            {servers[currentServer].directPlayer && (
              <>
                {controlsVisible && (
                  <div className="watch-title-badge" aria-hidden="true">
                    <p className="watch-title-badge-eyebrow">Your Watching</p>
                    {type === 'tv' && (
                      <p className="watch-title-badge-kicker">
                        Season {currentSeason} • Episode {currentEpisode}
                      </p>
                    )}
                    <h1 className="watch-title-badge-title">
                      {contentInfo?.title || contentInfo?.name}
                    </h1>
                  </div>
                )}
              </>
            )}
            {/* Auto-advance overlay: shown when the title ends (or its credits
                begin) on DirectPlayer — TV shows the next episode, movies the
                next recommended movie. */}
            {autoAdvanceActive && (type === 'tv' || type === 'movie') && (
              <div className="watch-auto-advance-overlay">
                <div className="watch-auto-advance-card">
                  {(() => {
                    if (type === 'movie') {
                      if (!nextMovie) return null;
                      const movieTitle = nextMovie.title || nextMovie.name || 'Up Next';
                      const movieMeta = [
                        nextMovie.release_date ? nextMovie.release_date.slice(0, 4) : null,
                        nextMovie.runtime ? `${nextMovie.runtime} min` : null,
                      ].filter(Boolean).join(' · ');
                      return (
                        <>
                          <p className="watch-auto-advance-label">Up Next</p>
                          <div className="watch-auto-advance-body">
                            <div className="watch-auto-advance-thumbnail">
                              {nextMovie.backdrop_path ? (
                                <img
                                  src={cardBackdrop(nextMovie.backdrop_path)}
                                  alt={movieTitle}
                                  loading="lazy"
                                />
                              ) : nextMovie.poster_path ? (
                                <img
                                  src={posterAsBackdrop(nextMovie.poster_path)}
                                  alt={movieTitle}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="watch-auto-advance-thumbnail-placeholder" aria-hidden="true">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <path d="M8 21h8" />
                                    <path d="M12 17v4" />
                                    <path d="m10 9 4 2.5L10 14V9z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="watch-auto-advance-info">
                              <p className="watch-auto-advance-ep-title">{movieTitle}</p>
                              <p className="watch-auto-advance-overview">
                                {nextMovie.overview || 'No synopsis available.'}
                              </p>
                              {movieMeta && (
                                <p className="watch-auto-advance-meta">{movieMeta}</p>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    }
                    const nextEp = currentEpisode < episodes.length
                      ? episodes.find(e => e.episode_number === currentEpisode + 1)
                      : null;
                    if (nextEp) {
                      return (
                        <>
                          <p className="watch-auto-advance-label">Up Next</p>
                          <div className="watch-auto-advance-body">
                            <div className="watch-auto-advance-thumbnail">
                              {nextEp.still_path ? (
                                <img
                                  src={episodeStill(nextEp.still_path)}
                                  alt={nextEp.name || `Episode ${nextEp.episode_number}`}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="watch-auto-advance-thumbnail-placeholder" aria-hidden="true">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <path d="M8 21h8" />
                                    <path d="M12 17v4" />
                                    <path d="m10 9 4 2.5L10 14V9z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="watch-auto-advance-info">
                              <p className="watch-auto-advance-ep-title">
                                E{nextEp.episode_number} · {nextEp.name || `Episode ${nextEp.episode_number}`}
                              </p>
                              <p className="watch-auto-advance-overview">
                                {nextEp.overview || 'No synopsis available.'}
                              </p>
                              {nextEp.runtime > 0 && (
                                <p className="watch-auto-advance-meta">{nextEp.runtime} min</p>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    }
                    return (
                      <>
                        <p className="watch-auto-advance-label">Up Next</p>
                        <div className="watch-auto-advance-body">
                          <div className="watch-auto-advance-thumbnail watch-auto-advance-thumbnail--season" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="17" rx="2" />
                              <path d="M8 2v4" />
                              <path d="M16 2v4" />
                              <path d="M3 9h18" />
                            </svg>
                          </div>
                          <div className="watch-auto-advance-info">
                            <p className="watch-auto-advance-ep-title">Next Season</p>
                            <p className="watch-auto-advance-overview">
                              The next season of {contentInfo?.title || contentInfo?.name || 'this show'} is coming up.
                            </p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <div className="watch-auto-advance-actions">
                    <button className="watch-auto-advance-skip" onClick={skipAutoAdvance}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Play Now
                    </button>
                    <button className="watch-auto-advance-cancel" onClick={cancelAutoAdvance}>
                      Cancel
                    </button>
                  </div>
                  <div className="watch-auto-advance-bar-row">
                    <div className="watch-auto-advance-bar">
                      <div
                        className="watch-auto-advance-bar-fill"
                        style={{ width: `${(autoAdvanceCountdown / Math.max(1, autoAdvanceTotal)) * 100}%` }}
                      />
                    </div>
                    <span className="watch-auto-advance-seconds">{formatCountdown(autoAdvanceCountdown)}</span>
                  </div>
                </div>
              </div>
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
        <div className={`watch-control-bar${type === 'tv' ? ' watch-control-bar-tv' : ''}${controlsVisible ? ' visible' : ''}`}>
          {/* Back Button */}
          <div className="watch-control-bar-item">
            <button
              className="watch-control-bar-btn"
              onClick={handleBack}
              disabled={controlsLocked}
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
                disabled={controlsLocked}
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

          {/* Previous Episode - TV Shows Only */}
          {type === 'tv' && canGoPrev && (
            <div className="watch-control-bar-item">
              <button
                className="watch-control-bar-btn watch-nav-btn"
                onClick={handlePrevEpisode}
                disabled={controlsLocked}
                title="Previous Episode"
                aria-label="Previous Episode"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="watch-control-bar-label">Prev</span>
            </div>
          )}

          {/* Next Episode - TV Shows Only */}
          {type === 'tv' && canGoNext && (
            <div className="watch-control-bar-item">
              <button
                className="watch-control-bar-btn watch-nav-btn"
                onClick={handleNextEpisode}
                disabled={controlsLocked}
                title="Next Episode"
                aria-label="Next Episode"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <span className="watch-control-bar-label">Next</span>
            </div>
          )}

          {/* Save / Watchlist Button */}
          <div className="watch-control-bar-item">
            <button
              className={`watch-control-bar-btn${isSaved ? ' active' : ''}`}
              onClick={async () => {
                if (contentInfo) {
                  const res = await toggleWatchlist({
                    id: contentInfo.id,
                    title: contentInfo.title || contentInfo.name,
                    poster_path: contentInfo.poster_path,
                    backdrop_path: contentInfo.backdrop_path,
                    type: type,
                    vote_average: contentInfo.vote_average,
                    release_date: contentInfo.release_date || contentInfo.first_air_date,
                    overview: contentInfo.overview,
                    genres: contentInfo.genres || contentInfo.genre_ids,
                  });

                  if (res?.ok) {
                    showSuccess(res.action === 'added' ? 'Added to Watchlist' : 'Removed from Watchlist');
                  } else if (res?.reason === 'sign-in-required') {
                    showError('Sign in with Google to add to Watchlist');
                  } else if (res?.message) {
                    showError(res.message);
                  }
                }
              }}
              disabled={controlsLocked}
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
              disabled={controlsLocked}
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
              disabled={controlsLocked}
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

          {/* Lock / Unlock Controls Button */}
          <div className="watch-control-bar-item">
            <button
              className={`watch-control-bar-btn${controlsLocked ? ' active' : ''}`}
              onClick={() => setControlsLocked((prev) => !prev)}
              title={controlsLocked ? 'Unlock Controls' : 'Lock Controls'}
              aria-label={controlsLocked ? 'Unlock Controls' : 'Lock Controls'}
              aria-pressed={controlsLocked}
            >
              {controlsLocked ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
            </button>
            <span className="watch-control-bar-label">{controlsLocked ? 'Unlock' : 'Lock'}</span>
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
                {selectableServers.map(({ server, index }) => (
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

        {/* Episode Drawer Modal */}
        {episodeDrawerOpen && type === 'tv' && (
          <div className="watch-episode-drawer-overlay" onClick={() => { setEpisodeDrawerOpen(false); setEpisodeSearchQuery(''); }} data-nav-trap>
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
                            src={episodeStill(episode.still_path)}
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