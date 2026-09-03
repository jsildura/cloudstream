import React, { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import useWatchlist from '../hooks/useWatchlist';
import { useProfiles } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';
import { maybeOpenSmartlinkAd } from '../utils/adGating';
import { getKidsRating, filterKidsCandidates } from '../lib/tmdbClient';
import SchemaMarkup from './SchemaMarkup';
import ReviewSection from './ReviewSection';
import { generateMovieSchema, generateTVSeriesSchema } from '../utils/schemaUtils';
import { getBackdropAlt, getPosterAlt } from '../utils/altTextUtils';
import { cardPoster } from '../utils/images';

// Maps TMDB's full genre names → the short names the app's search resolver
// recognises (see constants/genres.js). Any genre not listed here is passed
// through as-is (which already works for "Action", "Drama", etc.).
const GENRE_SEARCH_ALIASES = {
  'Science Fiction':    'Sci-Fi',
  'Sci-Fi & Fantasy':  'Sci-Fi & Fantasy',
  'Action & Adventure': 'Action & Adventure',
  'War & Politics':    'War & Politics',
  'TV Movie':          'TV Movie',
};

const Modal = memo(({ item: initialItem, onClose, collection = [] }) => {
  const navigate = useNavigate();
  const { isKidsMode } = useProfiles();
  const {
    BACKDROP_URL,
    POSTER_URL,
    fetchVideos,
    fetchLogo,
    fetchMovieRecommendations,
    fetchTVRecommendations,
    fetchCredits,
    fetchContentRating,
    fetchTVDetails,
    fetchSeasonEpisodes,
    fetchItemBundle,
    movieGenres,
    tvGenres
  } = useTMDB();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();

  // Current item being displayed (can change when clicking recommendations)
  const [item, setItem] = useState(initialItem);

  // Sync local item state when the parent updates initialItem
  // (e.g. Home opens modal immediately then enriches selectedItem async)
  useEffect(() => {
    if (initialItem?.id && initialItem.id === item?.id) {
      // Merge: only overwrite fields that the parent has now filled in
      setItem(prev => ({ ...prev, ...initialItem }));
    } else if (initialItem?.id && initialItem.id !== item?.id) {
      setItem(initialItem);
    }
  }, [initialItem]);

  // Internal recommendations state
  const [internalRecs, setInternalRecs] = useState([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const { showSuccess, showError } = useToast();
  const [isClosing, setIsClosing] = useState(false);

  const mediaType = item?.type || item?.media_type || (item?.first_air_date || (item?.name && !item?.title) ? 'tv' : 'movie');
  const isTV = mediaType === 'tv';
  const [seasons, setSeasons] = useState(item?.seasons || []);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(() => {
    if (item?.lastSeason) return item.lastSeason;
    if (Array.isArray(item?.seasons) && item.seasons.length > 0) {
      const valid = item.seasons.filter(s => s.season_number > 0);
      const list = valid.length > 0 ? valid : item.seasons;
      const todayStr = new Date().toISOString().split('T')[0];
      const aired = list.filter(s => s.air_date && s.air_date <= todayStr && (s.episode_count ?? 1) > 0);
      if (aired.length > 0) {
        aired.sort((a, b) => {
          if (a.air_date !== b.air_date) return b.air_date.localeCompare(a.air_date);
          return b.season_number - a.season_number;
        });
        return aired[0].season_number;
      }
      return list[list.length - 1].season_number;
    }
    return 1;
  });
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [visibleEpisodesCount, setVisibleEpisodesCount] = useState(6);

  const inWatchlist = Boolean(item?.id && isInWatchlist(item.media_type || item.type || 'movie', item.id));
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [logoPath, setLogoPath] = useState(initialItem?.logo_path || null);
  const [logoLoaded, setLogoLoaded] = useState(Boolean(initialItem?.logo_path));
  const [contentRating, setContentRating] = useState(initialItem?.contentRating || null);
  // Lazily-loaded cast — populated from item.cast if present, otherwise fetched.
  const [cast, setCast] = useState(initialItem?.cast || null);

  // Get badge color class based on rating
  const getRatingBadgeClass = (rating) => {
    if (!rating) return '';
    const r = rating.toUpperCase();
    // Green - Family friendly
    if (['G', 'TV-G', 'TV-Y', 'TV-Y7', 'U', 'ALL'].includes(r)) return 'rating-badge-green';
    // Blue - Parental guidance
    if (['PG', 'TV-PG', 'PG-13', 'TV-14', '12', '12A', '12+'].includes(r)) return 'rating-badge-blue';
    // Orange - Teen/Mature
    if (['R', 'TV-MA', '15', '16', '16+', 'M', 'MA15+'].includes(r)) return 'rating-badge-orange';
    // Red - Adults only
    if (['NC-17', '18', '18+', 'X', 'XXX', 'R18+', 'ADULTS'].includes(r)) return 'rating-badge-red';
    // Default - gray
    return 'rating-badge-gray';
  };

  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Fetch trailer, logo, cast, contentRating, and recommendations when item changes.
  // cast and contentRating are fetched lazily here so the parent can open the
  // modal immediately with basic data and let these arrive a moment later.
  useEffect(() => {
    const loadData = async () => {
      if (item?.id) {
        const type = item.media_type || item.type || 'movie';
        const isTvItem = type === 'tv';

        // Reset states for new item
        setTrailerKey(null);
        setLogoPath(item.logo_path || null);
        setLogoLoaded(Boolean(item.logo_path));
        setIsTrailerPlaying(false);
        setRecsLoading(true);
        setSeasonsLoading(isTvItem);
        if (!isTvItem) {
          setSeasons([]);
        }
        // Seed cast/rating from item if already enriched; clear otherwise
        setCast(item.cast || null);
        setContentRating(item.contentRating || null);

        // Enforce Kids mode rating policy
        if (isKidsMode) {
          try {
            const check = await getKidsRating(type, item.id);
            if (!check.approved) {
              showErrorRef.current?.('This title is not available in Kids mode.');
              onCloseRef.current?.();
              return;
            }
          } catch {
            showErrorRef.current?.('This title is not available in Kids mode.');
            onCloseRef.current?.();
            return;
          }
        }

        const needsDetails = !item.overview || !item.genres?.length || (!item.release_date && !item.first_air_date);

        // Fetch trailer, logo, cast, content rating, and TV details in parallel
        const [key, logo, fetchedCast, fetchedRating, tvDetails, fetchedDetails] = await Promise.all([
          fetchVideos(type, item.id),
          item.logo_path ? Promise.resolve(item.logo_path) : fetchLogo(type, item.id),
          item.cast ? Promise.resolve(null) : fetchCredits(type, item.id),
          item.contentRating ? Promise.resolve(null) : fetchContentRating(type, item.id),
          isTvItem ? fetchTVDetails(item.id).catch(() => null) : Promise.resolve(null),
          (needsDetails && typeof fetchItemBundle === 'function') ? fetchItemBundle(type, item.id).catch(() => null) : Promise.resolve(null),
        ]);
        setTrailerKey(key);
        if (logo) {
          setLogoPath(logo);
          setLogoLoaded(true);
        }
        setLogoLoaded(true);
        if (fetchedCast) setCast(fetchedCast.join(', ') || 'N/A');
        if (fetchedRating) setContentRating(fetchedRating);
        if (fetchedDetails) {
          const fallbackGenres = fetchedDetails.genres?.map(g => g.name) || [];
          setItem(prev => ({
            ...fetchedDetails,
            ...prev,
            overview: prev.overview || fetchedDetails.overview || '',
            release_date: prev.release_date || fetchedDetails.release_date || '',
            first_air_date: prev.first_air_date || fetchedDetails.first_air_date || '',
            genres: (prev.genres && prev.genres.length > 0) ? prev.genres : fallbackGenres,
          }));
        }

        if (isTvItem) {
          const rawSeasons = tvDetails?.seasons || item.seasons || [];
          const validSeasons = rawSeasons.filter(s => s.season_number > 0);
          const finalSeasons = validSeasons.length > 0 ? validSeasons : rawSeasons;
          setSeasons(finalSeasons);
          if (finalSeasons.length > 0) {
            let defaultSeason;
            // 1. Check last_episode_to_air from TMDB details
            const lastAiredSeasonNum = tvDetails?.last_episode_to_air?.season_number;
            if (lastAiredSeasonNum && finalSeasons.some(s => s.season_number === lastAiredSeasonNum)) {
              defaultSeason = lastAiredSeasonNum;
            } else {
              // 2. Filter seasons that have already aired (air_date <= today)
              const todayStr = new Date().toISOString().split('T')[0];
              const airedSeasons = finalSeasons.filter(s => s.air_date && s.air_date <= todayStr && (s.episode_count ?? 1) > 0);
              if (airedSeasons.length > 0) {
                airedSeasons.sort((a, b) => {
                  if (a.air_date !== b.air_date) {
                    return b.air_date.localeCompare(a.air_date);
                  }
                  return b.season_number - a.season_number;
                });
                defaultSeason = airedSeasons[0].season_number;
              } else if (item.lastSeason && finalSeasons.some(s => s.season_number === item.lastSeason)) {
                defaultSeason = item.lastSeason;
              } else {
                // 3. Fallback to latest season in the list
                defaultSeason = finalSeasons[finalSeasons.length - 1].season_number;
              }
            }
            setSelectedSeason(defaultSeason);
          }
          setSeasonsLoading(false);
        }

        // Fetch recommendations internally
        try {
          const fetchRecs = type === 'movie' ? fetchMovieRecommendations : fetchTVRecommendations;
          let recs = await fetchRecs(item.id);

          // Fallback to similar if no recommendations
          if (!recs || recs.length === 0) {
            const similarUrl = `/api/${type}/${item.id}/similar`;
            const res = await fetch(similarUrl);
            if (res.ok) {
              const data = await res.json();
              recs = data.results || [];
            }
          }

          let filteredRecs = recs.filter(r => r.id !== item.id);
          if (isKidsMode) {
            filteredRecs = await filterKidsCandidates(filteredRecs, { maxCandidates: 20 });
          }

          // Limit to 10 items and filter out current item
          setInternalRecs(filteredRecs.slice(0, 10));
        } catch (err) {
          console.error('Failed to fetch recommendations:', err);
          setInternalRecs([]);
        } finally {
          setRecsLoading(false);
        }
      }
    };
    loadData();
  }, [item?.id, item?.media_type, item?.type, isKidsMode, fetchVideos, fetchLogo, fetchCredits, fetchContentRating, fetchTVDetails, fetchMovieRecommendations, fetchTVRecommendations]);

  // Load episodes when selected season changes (for TV shows)
  useEffect(() => {
    if (!isTV || !item?.id || !selectedSeason) {
      setEpisodes([]);
      setEpisodesLoading(false);
      return;
    }

    let cancelled = false;
    setEpisodesLoading(true);

    fetchSeasonEpisodes(item.id, selectedSeason)
      .then((epData) => {
        if (!cancelled) {
          setEpisodes(epData || []);
          setEpisodesLoading(false);
          setVisibleEpisodesCount(6);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load season episodes:', err);
          setEpisodes([]);
          setEpisodesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isTV, item?.id, selectedSeason, fetchSeasonEpisodes]);

  const handleEpisodeClick = useCallback((episodeNumber) => {
    maybeOpenSmartlinkAd();
    navigate(`/watch?type=tv&id=${item.id}&season=${selectedSeason}&episode=${episodeNumber}`, {
      state: { fromModal: true }
    });
    onClose();
  }, [item?.id, selectedSeason, navigate, onClose]);

  const toggleMoreEpisodes = useCallback(() => {
    setVisibleEpisodesCount(prev => (prev >= episodes.length ? 6 : episodes.length));
  }, [episodes.length]);

  const formatAirDate = useCallback((dateStr) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      if (!y || !m || !d) return dateStr;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }, []);

  // Animated close handler
  const handleClose = useCallback(() => {
    if (isClosing) return; // Prevent double-close
    setIsClosing(true);
    // Wait for exit animation to complete (300ms matches CSS)
    setTimeout(() => {
      onClose();
    }, 300);
  }, [isClosing, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  const playButtonClick = useCallback(() => {
    // No-op while the ad gate is pending or the account is ad-free.
    maybeOpenSmartlinkAd();

    // Normal navigation to watch page (always happens)
    const effectiveMediaType = item.type || item.media_type || (item.first_air_date || (item.name && !item.title) ? 'tv' : 'movie');
    let url = `/watch?type=${effectiveMediaType}&id=${item.id}`;
    if (effectiveMediaType === 'tv') {
      const seasonToPlay = selectedSeason || item.lastSeason || 1;
      const episodeToPlay = (seasonToPlay === item.lastSeason && item.lastEpisode) ? item.lastEpisode : 1;
      url += `&season=${seasonToPlay}&episode=${episodeToPlay}`;
    }
    navigate(url, { state: { fromModal: true } });  // Use React Router navigation - NO page reload
    onClose();  // Close modal after navigation
  }, [item.type, item.media_type, item.first_air_date, item.name, item.title, item.id, item.lastSeason, item.lastEpisode, selectedSeason, navigate, onClose]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: item.title || item.name,
      text: `Check out ${item.title || item.name}`,
      url: `${window.location.origin}/watch?type=${item.type || 'movie'}&id=${item.id}`
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareData.url);
        alert('Link copied to clipboard!');
      }
    } catch (error) {
      // User cancelled or error occurred
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    }
  }, [item.title, item.name, item.type, item.id]);

  // Handle clicking a recommendation card - update modal to show that content
  const handleRecClick = useCallback((recItem) => {
    const type = recItem.media_type || (recItem.first_air_date ? 'tv' : 'movie');
    const genreMap = type === 'movie' ? movieGenres : tvGenres;
    const genreNames = recItem.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

    // Switch immediately — cast & contentRating are lazily fetched by the effect.
    setItem({
      ...recItem,
      type,
      media_type: type,
      genres: genreNames,
    });

    // Scroll modal back to top
    const scrollContainer = document.querySelector('.modal-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [movieGenres, tvGenres]);

  // Ref to track if user manually toggled the trailer (to prevent auto-play interference)
  const userToggledTrailerRef = useRef(false);
  const autoPlayTimerRef = useRef(null);
  // Track if user has interacted with page (required for browser autoplay policy)
  const [userHasInteracted, setUserHasInteracted] = useState(false);

  // Detect user interaction to enable autoplay (browser autoplay policy)
  // Without user interaction, browsers block autoplay of videos/iframes
  useEffect(() => {
    // Check if already marked as interacted (persists during session)
    if (sessionStorage.getItem('userHasInteracted') === 'true') {
      setUserHasInteracted(true);
      return;
    }

    const markInteracted = () => {
      setUserHasInteracted(true);
      sessionStorage.setItem('userHasInteracted', 'true');
      // Remove listeners after first interaction
      document.removeEventListener('click', markInteracted);
      document.removeEventListener('touchstart', markInteracted);
      document.removeEventListener('keydown', markInteracted);
    };

    document.addEventListener('click', markInteracted, { once: true });
    document.addEventListener('touchstart', markInteracted, { once: true, passive: true });
    document.addEventListener('keydown', markInteracted, { once: true });

    return () => {
      document.removeEventListener('click', markInteracted);
      document.removeEventListener('touchstart', markInteracted);
      document.removeEventListener('keydown', markInteracted);
    };
  }, []);

  // Toggle trailer playback
  const toggleTrailer = useCallback(() => {
    if (trailerKey) {
      userToggledTrailerRef.current = true; // Mark as user-controlled
      // Clear auto-play timer if user toggles manually
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      setIsTrailerPlaying(prev => !prev);
    }
  }, [trailerKey]);

  // Auto-play trailer after 7 seconds delay (only if user has interacted with page)
  useEffect(() => {
    // Only auto-play if:
    // 1. Trailer key exists
    // 2. Not already playing
    // 3. User hasn't toggled manually
    // 4. User has interacted with the page (browser autoplay policy)
    if (trailerKey && !isTrailerPlaying && !userToggledTrailerRef.current && userHasInteracted) {
      autoPlayTimerRef.current = setTimeout(() => {
        setIsTrailerPlaying(true);
      }, 3000); // 3 second delay
    }

    return () => {
      // Cleanup timer on unmount or when dependencies change
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [trailerKey, isTrailerPlaying, userHasInteracted]);

  // Get year from release date
  const year = item.release_date?.substring(0, 4) ||
    item.first_air_date?.substring(0, 4) || '';

  // Format rating
  const rating = item.vote_average ? `${(item.vote_average).toFixed(1)}/10` : '';

  // Drawer bar drag state - use refs for performance (avoid re-renders during drag)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const modalContentRef = useRef(null);
  const rafIdRef = useRef(null);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();  // Prevent pull-to-refresh
    setIsDragging(true);
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    dragStartYRef.current = clientY;
    dragOffsetRef.current = 0;
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!modalContentRef.current) return;
    e.preventDefault();  // Prevent pull-to-refresh
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    const offset = Math.max(0, clientY - dragStartYRef.current);
    dragOffsetRef.current = offset;

    // Cancel any pending animation frame
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    // Use requestAnimationFrame for smooth 60fps updates - direct DOM manipulation
    // Use translate3d for GPU acceleration - critical for low-tier mobile
    rafIdRef.current = requestAnimationFrame(() => {
      if (modalContentRef.current) {
        modalContentRef.current.style.transform = `translate3d(-50%, ${offset}px, 0)`;
      }
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    // Cancel any pending animation frame
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // If dragged down more than 50% of viewport height, close the modal
    const closeThreshold = window.innerHeight * 0.5;
    if (dragOffsetRef.current > closeThreshold) {
      // Close directly without exit animation (already dragged past threshold)
      onClose();
    } else {
      // Animate back to original position with GPU-accelerated transform
      if (modalContentRef.current) {
        modalContentRef.current.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        modalContentRef.current.style.transform = 'translate3d(-50%, 0, 0)';
        // Remove transition after animation completes
        setTimeout(() => {
          if (modalContentRef.current) {
            modalContentRef.current.style.transition = '';
          }
        }, 300);
      }
    }
    setIsDragging(false);
    dragOffsetRef.current = 0;
  }, [onClose]);

  // Add/remove global mouse/touch event listeners for drag
  useEffect(() => {
    if (isDragging) {
      // Remove transition and animation during drag for instant response
      if (modalContentRef.current) {
        modalContentRef.current.style.transition = 'none';
        modalContentRef.current.style.animation = 'none';
      }

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      // Use passive: false to allow preventDefault on touch events
      document.addEventListener('touchmove', handleDragMove, { passive: false });
      document.addEventListener('touchend', handleDragEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleDragMove);
      document.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Generate schema based on content type (memoized to avoid recalculation)
  const contentSchema = useMemo(() => {
    if (!item?.id) return null;
    const type = item.media_type || item.type || 'movie';
    return type === 'movie'
      ? generateMovieSchema(item)
      : generateTVSeriesSchema(item);
  }, [item]);

  return createPortal(
    <>
      <SchemaMarkup schema={contentSchema} />
      <div className="modal-overlay" onClick={handleBackdropClick} data-nav-trap>
        <div
          ref={modalContentRef}
          className={`modal-content-new${isClosing ? ' closing' : ''}`}
          style={{ transform: 'translate3d(-50%, 0, 0)' }}
        >
          {/* Drawer Bar */}
          <div
            className="modal-drawer-bar"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className="modal-drawer-handle"></div>
          </div>

          {/* Close Button */}
          <button className="modal-close-new" onClick={handleClose} aria-label="Close details modal">✕</button>

          {/* Scrollable Content */}
          <div className={`modal-scroll-container ${isTrailerPlaying ? 'trailer-playing' : ''}`}>
            {/* Hero Header with Backdrop/Trailer */}
            <div className="modal-hero">
              <div className={`modal-backdrop-container${item.backdrop_path ? '' : ' placeholder'}`}>
                {isTrailerPlaying && trailerKey ? (
                  /* YouTube Trailer Iframe - with controls for mobile unmute */
                  <iframe
                    className="modal-trailer-video"
                    src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&playsinline=1&loop=1&playlist=${trailerKey}&controls=1&showinfo=0&modestbranding=1&rel=0`}
                    title={`${item.title || item.name} Trailer`}
                    frameBorder="0"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                ) : (
                  /* Backdrop Image - fall back to the placeholder art when the
                     title has no backdrop_path (avoids a broken .../w1280null URL) */
                  <img
                    src={item.backdrop_path
                      ? `${BACKDROP_URL}${item.backdrop_path}`
                      : '/icons/placeholder.svg'}
                    alt={getBackdropAlt(item)}
                    className={`modal-backdrop-img${item.backdrop_path ? '' : ' placeholder'}`}
                  />
                )}
              </div>
              {/* Movie Logo/Title Overlay - hide when trailer is playing, wait for logo check */}
              {!isTrailerPlaying && logoLoaded && (
                <div className="modal-logo-overlay">
                  {logoPath ? (
                    <img
                      src={logoPath.startsWith('http') ? logoPath : `${POSTER_URL}${logoPath}`}
                      alt={`${item.title || item.name} logo`}
                      className="modal-logo-img"
                    />
                  ) : (
                    <h2 className="modal-title-overlay">{item.title || item.name}</h2>
                  )}
                </div>
              )}
            </div>

            {/* Content Section */}
            <div className="modal-body-new">
              {/* Two Column Main Layout */}
              <div className="modal-main-layout">
                {/* Left Column */}
                <div className="modal-left-col">
                  {/* Action Buttons Row */}
                  <div className="modal-actions-row">
                    <button onClick={playButtonClick} className="modal-btn-play">
                      <span className="modal-btn-icon">▶</span>
                      Watch Now
                    </button>
                    <button
                      onClick={async () => {
                        if (!item) return;
                        const mediaType = item.type || item.media_type || (item.first_air_date || (item.name && !item.title) ? 'tv' : 'movie');
                        const res = await toggleWatchlist({
                          id: item.id,
                          type: mediaType,
                          title: item.title || item.name,
                          poster_path: item.poster_path,
                          backdrop_path: item.backdrop_path,
                          overview: item.overview,
                          vote_average: item.vote_average,
                          release_date: item.release_date || item.first_air_date,
                          genres: item.genres || item.genre_ids
                        });

                        if (res?.ok) {
                          showSuccess(res.action === 'added' ? 'Added to Watchlist' : 'Removed from Watchlist');
                        } else if (res?.reason === 'sign-in-required') {
                          showError('Sign in with Google to add to Watchlist');
                        } else if (res?.message) {
                          showError(res.message);
                        }
                      }}
                      className={`modal-btn-icon-only ${inWatchlist ? 'active' : ''}`}
                      title={inWatchlist ? "Remove from My List" : "Add to My List"}
                    >
                      {inWatchlist ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12h14" />
                          <path d="M12 5v14" />
                        </svg>
                      )}
                    </button>
                    <button onClick={handleShare} className="modal-btn-icon-only" title="Share">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"></line><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"></line></svg>
                    </button>
                    <button
                      onClick={toggleTrailer}
                      className={`modal-btn-icon-only ${isTrailerPlaying ? 'active' : ''} ${!trailerKey ? 'disabled' : ''}`}
                      title={isTrailerPlaying ? "Stop Trailer" : "Play Trailer"}
                      disabled={!trailerKey}
                    >
                      {isTrailerPlaying ? (
                        /* Monitor-X icon when playing */
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m14.5 12.5-5-5"></path>
                          <path d="m9.5 12.5 5-5"></path>
                          <rect width="20" height="14" x="2" y="3" rx="2"></rect>
                          <path d="M12 17v4"></path>
                          <path d="M8 21h8"></path>
                        </svg>
                      ) : (
                        /* Monitor-Play icon when stopped */
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"></path>
                          <path d="M12 17v4"></path>
                          <path d="M8 21h8"></path>
                          <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Metadata Row */}
                  <div className="modal-meta-row">
                    {year && <span>{year}</span>}
                    {rating && (
                      <>
                        <span className="meta-dot">·</span>
                        <span className="modal-rating">
                          <span className="star-icon">★</span>
                          {rating}
                        </span>
                      </>
                    )}
                    {contentRating && (
                      <>
                        <span className="meta-dot">·</span>
                        <span className={`content-rating-badge ${getRatingBadgeClass(contentRating)}`}>
                          {contentRating}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Description */}
                  <p className="modal-description-new">{item.overview}</p>
                </div>

                {/* Right Column - Info */}
                <div className="modal-right-col">
                  <div className="modal-info-item">
                    <span className="modal-info-label">Genres:</span>
                    <span className="modal-info-value">
                      {item.genres && item.genres.length > 0 ? item.genres.map((genre, i) => {
                        const searchGenre = GENRE_SEARCH_ALIASES[genre] || genre;
                        return (
                          <React.Fragment key={genre}>
                            <span
                              className="modal-cast-link"
                              role="link"
                              tabIndex={0}
                              onClick={() => {
                                handleClose();
                                navigate(`/search?q=${encodeURIComponent(searchGenre)}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleClose();
                                  navigate(`/search?q=${encodeURIComponent(searchGenre)}`);
                                }
                              }}
                            >
                              {genre}
                            </span>
                            {i < item.genres.length - 1 && ', '}
                          </React.Fragment>
                        );
                      }) : 'N/A'}
                    </span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-label">Cast:</span>
                    <span className="modal-info-value">
                      {(() => {
                        const castStr = cast || item.cast || '';
                        if (!castStr) return 'N/A';
                        const names = castStr.split(',').map(n => n.trim()).filter(Boolean);
                        return names.map((name, i) => (
                          <React.Fragment key={name}>
                            <span
                              className="modal-cast-link"
                              role="link"
                              tabIndex={0}
                              onClick={() => {
                                handleClose();
                                navigate(`/search?q=${encodeURIComponent(name)}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleClose();
                                  navigate(`/search?q=${encodeURIComponent(name)}`);
                                }
                              }}
                            >
                              {name}
                            </span>
                            {i < names.length - 1 && ', '}
                          </React.Fragment>
                        ));
                      })()}
                    </span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-label">Status:</span>
                    <span className="modal-info-value">{item.status || 'Released'}</span>
                  </div>
                </div>
              </div>

              {/* Season Selector for TV Shows */}
              {isTV && (seasons.length > 0 || seasonsLoading) && (
                <div className="modal-seasons-section">
                  <div className="modal-seasons-header">
                    <div className="modal-seasons-title-row">
                      <h3 className="modal-seasons-title">Seasons</h3>
                      <div className="modal-seasons-divider" />
                    </div>
                    <span className="modal-seasons-count">
                      {seasonsLoading
                        ? 'Loading seasons...'
                        : `${seasons.length} ${seasons.length === 1 ? 'season' : 'seasons'}`}
                    </span>
                  </div>

                  <div className="modal-seasons-row" role="region" aria-label="Seasons">
                    {seasonsLoading ? (
                      [...Array(4)].map((_, i) => (
                        <div key={i} className="modal-season-card skeleton">
                          <div className="modal-season-skeleton" />
                        </div>
                      ))
                    ) : (
                      seasons.map((season, index) => {
                        const isSelected = selectedSeason === season.season_number;
                        const posterSrc = season.poster_path
                          ? `${POSTER_URL}${season.poster_path}`
                          : (item.poster_path ? `${POSTER_URL}${item.poster_path}` : '/icons/placeholder.svg');
                        const seasonBadgeText = season.season_number === 0
                          ? 'SP'
                          : (season.season_number != null ? `S${season.season_number}` : `S${index + 1}`);

                        return (
                          <div
                            key={season.id || season.season_number}
                            className={`modal-season-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedSeason(season.season_number)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedSeason(season.season_number);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            aria-pressed={isSelected}
                            aria-label={`${season.name || `Season ${season.season_number}`}${isSelected ? ' (Selected)' : ''}`}
                            title={`${season.name || `Season ${season.season_number}`}${season.episode_count ? ` • ${season.episode_count} episodes` : ''}`}
                          >
                            <span className="modal-season-badge" aria-hidden="true">
                              {seasonBadgeText}
                            </span>
                            <img
                              src={posterSrc}
                              alt={season.name || `Season ${season.season_number}`}
                              className="modal-season-poster"
                              loading="lazy"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Episodes Section for TV Shows */}
              {isTV && (episodes.length > 0 || episodesLoading) && (
                <div className="modal-episodes-section">
                  <div className="modal-episodes-header">
                    <div className="modal-episodes-title-row">
                      <h3 className="modal-episodes-title">
                        Season {selectedSeason} Episodes
                      </h3>
                      <div className="modal-episodes-divider" />
                    </div>

                    <div className="modal-episodes-subrow">
                      <span className="modal-episodes-count">
                        {episodesLoading
                          ? 'Loading episodes...'
                          : `${episodes.length} ${episodes.length === 1 ? 'episode' : 'episodes'}`}
                      </span>

                      <button
                        type="button"
                        className="modal-spoilers-btn"
                        onClick={() => setShowSpoilers(prev => !prev)}
                        aria-pressed={showSpoilers}
                      >
                        {showSpoilers ? (
                          <>
                            <svg className="modal-spoilers-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            Hide Spoilers
                          </>
                        ) : (
                          <>
                            <svg className="modal-spoilers-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            Show Spoilers
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="modal-episodes-grid" role="list">
                    {episodesLoading ? (
                      [...Array(6)].map((_, i) => (
                        <div key={i} className="modal-episode-card skeleton" role="listitem">
                          <div className="modal-episode-thumb-wrap">
                            <div className="modal-episode-skeleton" />
                          </div>
                          <div className="modal-episode-meta-skeleton">
                            <div className="modal-ep-line skeleton-title" />
                            <div className="modal-ep-line skeleton-sub" />
                          </div>
                        </div>
                      ))
                    ) : (
                      episodes.slice(0, visibleEpisodesCount).map((ep) => {
                        const stillSrc = ep.still_path
                          ? `${BACKDROP_URL}${ep.still_path}`
                          : (item.backdrop_path ? `${BACKDROP_URL}${item.backdrop_path}` : '/icons/placeholder.svg');
                        const epTitle = ep.name && !ep.name.match(/^Episode \d+$/i)
                          ? `Episode ${ep.episode_number}. ${ep.name}`
                          : `Episode ${ep.episode_number}.`;
                        const epDate = formatAirDate(ep.air_date);
                        const epRuntime = ep.runtime ? `${ep.runtime} min` : '';
                        const metaLine = [epDate, epRuntime].filter(Boolean).join(' • ');
                        const epVote = typeof ep.vote_average === 'number' ? ep.vote_average : 0;
                        const epRating = epVote > 0 ? epVote.toFixed(1) : null;
                        const ratingTierClass = epVote >= 7.0
                          ? 'rating-high'
                          : (epVote >= 5.0 ? 'rating-mid' : 'rating-low');

                        return (
                          <div
                            key={ep.id || ep.episode_number}
                            className="modal-episode-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleEpisodeClick(ep.episode_number)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleEpisodeClick(ep.episode_number);
                              }
                            }}
                            aria-label={`Play ${epTitle}`}
                          >
                            <div className={`modal-episode-thumb-wrap ${showSpoilers ? 'spoilers-revealed' : 'spoilers-hidden'}`}>
                              <img
                                src={stillSrc}
                                alt={epTitle}
                                className="modal-episode-still"
                                loading="lazy"
                              />

                              {epRating && (
                                <div className={`modal-episode-rating-badge ${ratingTierClass}`} title={`Rating: ${epRating}/10`}>
                                  <span>{epRating}</span>
                                </div>
                              )}

                              {!showSpoilers && (
                                <div className="modal-episode-spoiler-overlay">
                                  <svg className="modal-spoiler-hidden-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                  <span className="modal-spoiler-hidden-text">Spoiler Hidden</span>
                                </div>
                              )}

                              <div className="modal-episode-play-hover" aria-hidden="true">
                                <span className="modal-episode-play-icon">▶</span>
                              </div>
                            </div>

                            <div className="modal-episode-info">
                              <h4 className="modal-episode-title">{epTitle}</h4>
                              {metaLine && (
                                <span className="modal-episode-meta">{metaLine}</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {episodes.length > 6 && !episodesLoading && (
                    <div className="modal-episodes-more-wrap">
                      <button
                        type="button"
                        className="modal-episodes-more-btn"
                        onClick={toggleMoreEpisodes}
                        aria-expanded={visibleEpisodesCount >= episodes.length}
                      >
                        <span>{visibleEpisodesCount >= episodes.length ? 'Show Less' : 'Show More'}</span>
                        <svg
                          className={`modal-episodes-more-chevron ${visibleEpisodesCount >= episodes.length ? 'expanded' : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Ratings & Reviews Section */}
              <ReviewSection
                contentId={item.id}
                type={item.type || item.media_type || 'movie'}
                voteAverage={item.vote_average}
                voteCount={item.vote_count}
              />

              {/* Collection Section */}
              {collection.length > 0 && (
                <div className="modal-section">
                  <h3 className="modal-section-title">{item.collection_name || 'Collection'}</h3>
                  <div className="modal-collection-grid">
                    {collection.map((movie, index) => (
                      <div key={index} className="modal-collection-item">
                        <img
                          src={`${BACKDROP_URL}${movie.backdrop_path}`}
                          alt={getBackdropAlt(movie)}
                          className="modal-collection-img"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* You May Also Like Section */}
              {(internalRecs.length > 0 || recsLoading) && (
                <div className="modal-section">
                  <h3 className="modal-section-title">You may also like</h3>
                  <div className="modal-recommendations-scroll">
                    {recsLoading ? (
                      // Skeleton loading state
                      [...Array(5)].map((_, i) => (
                        <div key={i} className="modal-recommendation-item skeleton">
                          <div className="modal-recommendation-skeleton" />
                        </div>
                      ))
                    ) : (
                      internalRecs.map((rec) => {
                        const recYear = rec.release_date
                          ? rec.release_date.slice(0, 4)
                          : rec.first_air_date
                          ? rec.first_air_date.slice(0, 4)
                          : null;

                        return (
                          <div
                            key={rec.id}
                            className="modal-recommendation-item clickable"
                            onClick={() => handleRecClick(rec)}
                            role="button"
                            tabIndex={0}
                            aria-label={rec.title || rec.name}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleRecClick(rec);
                              }
                            }}
                          >
                            <img
                              src={cardPoster(rec.poster_path) ?? '/placeholder-poster.jpg'}
                              alt={getPosterAlt(rec)}
                              className="modal-recommendation-img"
                              loading="lazy"
                            />
                            {recYear && (
                              <span className="modal-rec-badge-year">{recYear}</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
});

Modal.displayName = 'Modal';
export default Modal;