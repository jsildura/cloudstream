import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTMDB, pickLogoPath, pickTrailerKey, parseContentRating } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';
import { maybeOpenSmartlinkAd } from '../utils/adGating';
import { getPosterAlt } from '../utils/altTextUtils';
import useTVDetect from '../hooks/useTVDetect';
import YouTubePlayer from './YouTubePlayer';

// Matches HoverPreviewCard's VIDEO_DELAY so the banner and the hover previews
// hold their still frame for the same beat before cutting to video.
const TRAILER_DELAY = 1600;

// Fallback hold for an auto-started trailer that never reports a duration
// (metadata still loading, or a live stream, which reports 0 forever). Real
// playback drives the slide instead — see handleTrailerEnded. Without any hold
// the carousel would stop on the first slide that has a trailer.
const TRAILER_SLIDE_FALLBACK = 30000;

// Slack on the duration-based safety net, covering buffering and the gap
// between the last position poll and ENDED firing.
const TRAILER_END_GRACE = 2000;

// Desktop only. Same query Navbar uses for its desktop search, kept identical
// so "desktop" means one thing across the app. The pointer/hover clauses do the
// real work: they exclude tablets that are wide enough to pass the width test
// (iPad Pro landscape is 1366px), and remote-driven TVs, which report a coarse
// pointer. Note this is NOT useTVDetect — that returns true for any viewport
// ≥1920px, so gating on it would disable autoplay on ordinary 1080p monitors.
const DESKTOP_TRAILER_MQ = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';

const BannerSlider = ({ movies, onItemClick, loading = false }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [logoCache, setLogoCache] = useState({});
  const [trailerCache, setTrailerCache] = useState({});
  const [ratingCache, setRatingCache] = useState({});
  const [runtimeCache, setRuntimeCache] = useState({});
  const [, setTvDetailsCache] = useState({});
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  // Whether the current trailer started on its own vs. from the toggle button.
  // Manual playback holds the slide indefinitely (the user asked to watch it);
  // auto playback only extends it.
  const [trailerAutoStarted, setTrailerAutoStarted] = useState(false);
  // Runtime of the playing trailer, in seconds, once the player reports it.
  // Sizes the safety-net timer so it lands after the video instead of cutting it off.
  const [trailerDuration, setTrailerDuration] = useState(null);

  // Whether the banner is on screen. A trailer nobody can see shouldn't keep
  // playing — it burns bandwidth and, unmuted, plays audio with no visible
  // source. Starts true so the trailer isn't held back before the first
  // observer callback, and for browsers without IntersectionObserver.
  const [isInView, setIsInView] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const sliderRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const { BACKDROP_URL, POSTER_URL, LOGO_URL, fetchItemBundle, fetchSeasonEpisodes, movieGenres, tvGenres } = useTMDB();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const { showSuccess, showError } = useToast();
  const isTVMode = useTVDetect();
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_TRAILER_MQ).matches
  );

  // Declared up here because the effects below depend on it, and a `const` read
  // from a dependency array before its declaration is a TDZ error, not a hoist.
  const showSkeleton = loading || !movies.length;

  // Tracked live so rotating a tablet or dragging a window across the
  // breakpoint stops or starts autoplay without a reload.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_TRAILER_MQ);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Pause the trailer once the banner has essentially left the viewport. The
  // threshold is deliberately low rather than 0: with a full-height banner,
  // requiring "any pixel visible" keeps it playing through a long scroll past
  // the fold, which is the case being fixed.
  //
  // Runs against showSkeleton because the ref target only exists on the real
  // render — the skeleton branch returns a different element.
  useEffect(() => {
    if (showSkeleton || typeof IntersectionObserver === 'undefined') return undefined;

    const el = sliderRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.intersectionRatio >= 0.15),
      { threshold: [0, 0.15, 0.5] }
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [showSkeleton]);

  // Tab-away is the other way the banner stops being watched. visibilitychange
  // is the only signal for it — IntersectionObserver reports a backgrounded tab
  // as still intersecting.
  useEffect(() => {
    const onVisibility = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // On screen and in a foreground tab. Gates trailer playback and, with a
  // trailer driving the slide, the advance too.
  const isBannerWatched = isInView && isPageVisible;

  const advanceSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % movies.length);
  }, [movies.length]);

  // Auto-advance slides with progress tracking.
  //
  // While an auto-started trailer plays, the trailer owns both the progress bar
  // and the advance — the bar tracks real playback position and the slide turns
  // over when the video ends. The old fixed duration here cut trailers off part
  // way through and made the bar measure a number nothing else respected.
  // The timer below is only a safety net for a trailer that never reports a
  // duration, so a missing onEnded can't strand the carousel.
  useEffect(() => {
    if (showSkeleton) {
      setProgress(0);
      return undefined;
    }

    // A trailer the user started by hand holds the slide until they stop it.
    if (isTrailerPlaying && !trailerAutoStarted) {
      setProgress(0);
      return undefined;
    }

    const trailerDriven = isTrailerPlaying && trailerAutoStarted;
    // Once the runtime is known, arm the net just past the end so onEnded gets
    // first go; before that, fall back to a flat hold. Either way it must never
    // land mid-trailer — that was the original bug.
    const slideDuration = trailerDriven
      ? (trailerDuration
          ? trailerDuration * 1000 + TRAILER_END_GRACE
          : TRAILER_SLIDE_FALLBACK)
      : (isTVMode ? 14000 : 7000);
    const progressInterval = isTVMode ? 200 : 50;
    let progressTimer;
    let slideTimer;

    // Playback position feeds the bar while a trailer is driving, so don't also
    // tick it forward on a clock — the two would fight over the same state. Nor
    // reset it: the duration arriving re-runs this effect mid-trailer, and a
    // reset here would drop the bar back to zero on a slide already in progress.
    if (!trailerDriven) {
      setProgress(0);
      progressTimer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 100;
          return prev + (progressInterval / slideDuration) * 100;
        });
      }, progressInterval);
    }

    // A paused trailer makes no progress, so its safety net must not run either
    // — otherwise the slide turns over off-screen and the user scrolls back to a
    // trailer that skipped ahead. The net re-arms when playback resumes.
    if (!(trailerDriven && !isBannerWatched)) {
      slideTimer = setTimeout(advanceSlide, slideDuration);
    }

    return () => {
      clearInterval(progressTimer);
      clearTimeout(slideTimer);
    };
  }, [currentSlide, isTrailerPlaying, trailerAutoStarted, trailerDuration, isTVMode, isBannerWatched, advanceSlide, showSkeleton]);

  // Mirror playback position onto the progress bar. Only while the trailer is
  // driving the slide: a manually started one holds the slide indefinitely, so
  // a filling bar would promise an advance that isn't coming.
  const handleTrailerProgress = useCallback((fraction, duration) => {
    if (!trailerAutoStarted) return;
    setProgress(Math.min(100, fraction * 100));
    // Same value every poll, so only commit the first one — a setState with an
    // unchanged value still costs a render.
    setTrailerDuration((prev) => (prev === duration ? prev : duration));
  }, [trailerAutoStarted]);

  // The trailer finishing is what turns the slide over now.
  const handleTrailerEnded = useCallback(() => {
    if (!trailerAutoStarted) return;
    setProgress(100);
    advanceSlide();
  }, [trailerAutoStarted, advanceSlide]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setProgress(0);
    setIsTrailerPlaying(false); // Stop trailer when changing slides
  };

  // The data source can be replaced while the carousel is on a later slide
  // (for example when profile data loads after sign-in). Render a valid slide
  // immediately, then synchronize the stored index after the render.
  const activeSlide = Number.isInteger(currentSlide) && currentSlide >= 0 && currentSlide < movies.length
    ? currentSlide
    : 0;
  const currentMovie = movies[activeSlide] || { id: 0 };

  useEffect(() => {
    if (movies.length > 0 && currentSlide !== activeSlide) {
      setCurrentSlide(activeSlide);
    }
  }, [activeSlide, currentSlide, movies.length]);
  const currentLogoKey = `${currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv')}_${currentMovie.id}`;
  const currentLogoPath = logoCache[currentLogoKey];
  const currentTrailerKey = trailerCache[currentLogoKey];

  // --- Bundled fetch: logo + trailer + rating + runtime in ONE call per slide ---
  // Replaces four separate useEffects that each hit /api/ independently.
  // fetchSeasonEpisodes stays separate — season data can't be appended.
  useEffect(() => {
    if (showSkeleton || !currentMovie.id) return;

    // Skip entirely if we already have all four pieces cached for this slide.
    // Use `in` so an explicit null (meaning "fetched, nothing found") still counts
    // as cached — !! would coerce null to false and re-trigger the bundle call.
    const hasLogo    = currentLogoKey in logoCache;
    const hasTrailer = currentLogoKey in trailerCache;
    const hasRating  = currentLogoKey in ratingCache;
    const hasRuntime = currentLogoKey in runtimeCache;
    if (hasLogo && hasTrailer && hasRating && hasRuntime) return;

    let alive = true;

    (async () => {
      const type = currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv');

      // Build appends list: images for logo, videos for trailer,
      // release_dates (movie) or content_ratings (TV) for the age badge.
      // The detail record itself carries runtime / number_of_seasons.
      const appends = ['images', 'videos'];
      appends.push(type === 'tv' ? 'content_ratings' : 'release_dates');

      const data = await fetchItemBundle(type, currentMovie.id, appends).catch(() => null);
      if (!alive || !data) return;

      // --- Logo ---
      if (!hasLogo) {
        const logo = pickLogoPath(data.images?.logos || []);
        // Always store (even null) so the `in` guard marks this slide as fetched
        // and prevents a re-fetch on the next banner loop.
        setLogoCache(prev => ({ ...prev, [currentLogoKey]: logo || null }));
      }

      // --- Trailer ---
      if (!hasTrailer) {
        const key = pickTrailerKey(data.videos?.results || []);
        // Store even if null so we don't re-fetch
        setTrailerCache(prev => ({ ...prev, [currentLogoKey]: key }));
      }

      // --- Content rating ---
      if (!hasRating) {
        const rating = parseContentRating(
          type,
          type === 'tv' ? data.content_ratings : data.release_dates
        );
        // Always store (even null) so the `in` guard marks this slide as fetched.
        setRatingCache(prev => ({ ...prev, [currentLogoKey]: rating || null }));
      }

      // --- Runtime ---
      if (!hasRuntime) {
        if (type === 'movie') {
          // Always store (even null) so the `in` guard marks this slide as fetched.
          setRuntimeCache(prev => ({ ...prev, [currentLogoKey]: { runtime: data.runtime || null, type: 'movie' } }));
        } else {
          // TV: details come from the bundle; season episodes stay separate
          setTvDetailsCache(prev => ({ ...prev, [currentLogoKey]: data }));

          const latestSeason = data.number_of_seasons || 1;
          if (latestSeason >= 1) {
            try {
              const episodes = await fetchSeasonEpisodes(currentMovie.id, latestSeason);
              if (!alive) return;
              const totalRuntime = episodes.length > 0
                ? episodes.reduce((sum, ep) => sum + (ep.runtime || 0), 0)
                : null;
              // Always store so the `in` guard marks this TV slide as fetched.
              setRuntimeCache(prev => ({
                ...prev,
                [currentLogoKey]: {
                  runtime: totalRuntime,
                  type: 'tv',
                  episodeCount: episodes.length,
                  latestSeason: latestSeason
                }
              }));
            } catch (err) {
              console.error('Failed to fetch latest season episodes:', err);
              // Store a sentinel so we don't re-fetch on the next banner loop visit.
              if (alive) setRuntimeCache(prev => ({ ...prev, [currentLogoKey]: { runtime: null, type: 'tv' } }));
            }
          } else {
            // No seasons — mark as fetched with null runtime.
            setRuntimeCache(prev => ({ ...prev, [currentLogoKey]: { runtime: null, type: 'tv' } }));
          }
        }
      }
    })();

    return () => { alive = false; };
  }, [currentMovie.id, currentLogoKey, showSkeleton, fetchItemBundle, fetchSeasonEpisodes]);

  // Auto-play the trailer once the slide settles, mirroring HoverPreviewCard:
  // the still frame holds for TRAILER_DELAY, then the video takes over. Desktop
  // only — on phones and tablets the backdrop stays a still image, since a
  // background video there costs cellular data and battery for a surface the
  // user can't mute without hunting for the control.
  //
  // Resetting here rather than in goToSlide is deliberate: auto-advance calls
  // setCurrentSlide directly, so goToSlide's reset never ran on a timed change.
  // Keying on currentLogoKey covers both paths. Stopping a trailer by hand does
  // not re-arm the timer, since toggleTrailer touches none of these deps.
  useEffect(() => {
    setIsTrailerPlaying(false);
    setTrailerAutoStarted(false);
    setTrailerDuration(null);

    if (showSkeleton || !currentTrailerKey || !isDesktop) return undefined;

    const timer = setTimeout(() => {
      setIsTrailerPlaying(true);
      setTrailerAutoStarted(true);
      // The bar spent TRAILER_DELAY filling against the still-image duration.
      // Zero it as the trailer takes over so it doesn't animate backwards when
      // the first position poll lands.
      setProgress(0);
    }, TRAILER_DELAY);

    return () => clearTimeout(timer);
  }, [currentLogoKey, currentTrailerKey, showSkeleton, isDesktop]);

  // Toggle trailer playback. Stopping by hand clears the auto flag so the
  // slide timer returns to its normal duration instead of the extended one.
  const toggleTrailer = () => {
    if (currentTrailerKey) {
      setIsTrailerPlaying(prev => !prev);
      setTrailerAutoStarted(false);
    }
  };


  // Handle share button click
  const handleShare = async () => {
    const type = currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv');
    const shareData = {
      title: currentMovie.title || currentMovie.name,
      text: `Check out ${currentMovie.title || currentMovie.name}`,
      url: `${window.location.origin}/watch?type=${type}&id=${currentMovie.id}`
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareData.url);
        showSuccess('Link copied to clipboard!');
      }
    } catch (error) {
      // User cancelled or error occurred
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    }
  };

  // Handle Watch Now button click with ad popup
  const handleWatchNow = () => {
    // Shared smartlink gate: no-op while pending or ad-free.
    maybeOpenSmartlinkAd();

    // Normal navigation to watch page
    const type = currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv');
    navigate(`/watch?type=${type}&id=${currentMovie.id}`, { state: { fromModal: true } });
  };

  const movieTitle = currentMovie.title || currentMovie.name || '';
  const currentPosterUrl = currentMovie?.poster_path
    ? (currentMovie.poster_path.startsWith('http')
      ? currentMovie.poster_path
      : `${POSTER_URL}${currentMovie.poster_path}`)
    : '';

  // Get media type badge text
  const mediaType = currentMovie.media_type === 'tv' ? 'TV' : 'Movie';

  // Get year
  const year = currentMovie.release_date?.substring(0, 4) ||
    currentMovie.first_air_date?.substring(0, 4) || 'N/A';

  // Get content rating from cache or fallback
  const contentRating = ratingCache[currentLogoKey] || (currentMovie.adult ? 'R' : 'NR');

  // Format runtime as "Xh Ym"
  const formatRuntime = (minutes) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const runtimeData = runtimeCache[currentLogoKey];
  const formattedRuntime = formatRuntime(runtimeData?.runtime);
  const isTV = (currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv')) === 'tv';

  // Get adjacent slides for 3D card effect
  const getSlideIndex = (offset) => {
    return (activeSlide + offset + movies.length) % movies.length;
  };

  // Swipe handlers with momentum - longer swipes move more slides
  const swipeHandlers = useSwipe({
    onSwipe: (itemsToMove) => {
      let newIndex = activeSlide + itemsToMove;
      // Wrap around for banner slides
      newIndex = ((newIndex % movies.length) + movies.length) % movies.length;
      goToSlide(newIndex);
    },
    threshold: 50,
    maxItems: 3 // Max slides to move per swipe on banner
  });

  const handleToggleWatchlist = async () => {
    if (!currentMovie) return;
    const type = currentMovie.type || currentMovie.media_type || (currentMovie.first_air_date || (currentMovie.name && !currentMovie.title) ? 'tv' : 'movie');
    const res = await toggleWatchlist({
      id: currentMovie.id,
      type,
      title: currentMovie.title || currentMovie.name,
      poster_path: currentMovie.poster_path,
      backdrop_path: currentMovie.backdrop_path,
      overview: currentMovie.overview,
      vote_average: currentMovie.vote_average,
      release_date: currentMovie.release_date || currentMovie.first_air_date,
      genres: currentMovie.genre_ids || currentMovie.genres
    });

    if (res?.ok) {
      showSuccess(res.action === 'added' ? 'Added to Watchlist' : 'Removed from Watchlist');
    } else if (res?.reason === 'sign-in-required') {
      showError('Sign in with Google to add to Watchlist');
    } else if (res?.message) {
      showError(res.message);
    }
  };

  const isCurrentInWatchlist = Boolean(
    currentMovie && isInWatchlist(currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv'), currentMovie.id)
  );

  // Skeleton loading - shown when loading or no movies
  if (showSkeleton) {
    return (
      <div className="banner-slider banner-skeleton">
        <div className="banner-skeleton-backdrop" />
        <div className="banner-skeleton-content">
          <div className="banner-skeleton-title" />
          <div className="banner-skeleton-meta" />
          <div className="banner-skeleton-description" />
          <div className="banner-skeleton-buttons" />
        </div>
      </div>
    );
  }

  return (
    <div className="banner-slider" ref={sliderRef}>
      {/* Progress Bar */}
      <div className="banner-progress">
        <div
          className={`banner-progress-fill${isTrailerPlaying && trailerAutoStarted ? ' trailer-driven' : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="banner-slide" {...swipeHandlers}>
        {/* Background Image/Video with Mask */}
        {isTrailerPlaying && currentTrailerKey ? (
          <div className="banner-backdrop banner-trailer-container">
            {/* Keyed on the trailer id so each one gets a fresh player. The YT
                API swaps the container div out for its iframe, which leaves the
                mounted component holding a detached node — remounting avoids
                re-initialising against it. */}
            <YouTubePlayer
              key={currentTrailerKey}
              videoId={currentTrailerKey}
              isMuted={isMuted}
              onMuteChange={setIsMuted}
              className="banner-trailer-video"
              host="https://www.youtube-nocookie.com"
              // An auto-started trailer plays through once and hands off to the
              // next slide; a manually started one loops until the user stops it.
              loop={!trailerAutoStarted}
              onEnded={handleTrailerEnded}
              onProgress={handleTrailerProgress}
              // Held rather than torn down, so scrolling back resumes where the
              // trailer left off instead of restarting it.
              paused={!isBannerWatched}
            />
          </div>
        ) : (
          <div className="banner-backdrop" key={activeSlide}>
            <img
              srcSet={`https://image.tmdb.org/t/p/w780${currentMovie.backdrop_path} 780w, https://image.tmdb.org/t/p/w1280${currentMovie.backdrop_path} 1280w`}
              sizes="(max-width: 768px) 780px, 1280px"
              src={`${BACKDROP_URL}${currentMovie.backdrop_path}`}
              alt={`${currentMovie.title || currentMovie.name} backdrop`}
              className="banner-backdrop-img"
              fetchPriority="high"
              loading="eager"
            />
          </div>
        )}

        {/* Desktop Content - Hidden on Mobile */}
        <div className="banner-content banner-desktop-content">
          {/* Title - Logo Image or Text Fallback */}
          {currentLogoPath ? (
            <div className="banner-logo-container" key={`logo-${activeSlide}`}>
              <img
                src={`${LOGO_URL}${currentLogoPath}`}
                alt={`${currentMovie.title || currentMovie.name} logo`}
                className="banner-logo-image"
                onError={(e) => {
                  // Hide the image on error, text fallback will show
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'block';
                }}
              />
              <h2
                className="banner-title-new banner-title-fallback"
                style={{
                  display: 'none',
                  '--poster-url': currentPosterUrl ? `url("${currentPosterUrl}")` : 'none'
                }}
              >
                {movieTitle}
              </h2>
            </div>
          ) : (
            <h2
              className="banner-title-new"
              key={`title-${activeSlide}`}
              style={{
                '--poster-url': currentPosterUrl ? `url("${currentPosterUrl}")` : 'none'
              }}
            >
              {movieTitle}
            </h2>
          )}

          {/* IMDb + Metadata Row */}
          <div className="banner-meta-row" key={`meta-${activeSlide}`}>
            <span className="imdb-badge">IMDb</span>
            <span className="meta-rating">{currentMovie.vote_average?.toFixed(1) || '8.5'}</span>
            <span className="meta-separator">·</span>
            <span className="meta-item">{year}</span>
            <span className="meta-separator">·</span>
            {isTV ? (
              <>
                <span className="meta-item">Season {runtimeData?.latestSeason || 1}</span>
                {formattedRuntime && (
                  <>
                    <span className="meta-separator">·</span>
                    <span className="meta-runtime">{formattedRuntime}</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="meta-item">Movie</span>
                {formattedRuntime && (
                  <>
                    <span className="meta-separator">·</span>
                    <span className="meta-runtime">{formattedRuntime}</span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Description */}
          <p className="banner-description-new" key={`desc-${activeSlide}`}>
            {currentMovie.overview?.length > 200
              ? `${currentMovie.overview.substring(0, 200)}...`
              : currentMovie.overview
            }
          </p>

          {/* Action Buttons Row */}
          <div className="banner-actions-row" key={`actions-${activeSlide}`}>
            {/* Play Trailer Button */}
            <button
              className={`banner-action-icon ${isTrailerPlaying ? 'active' : ''} ${!currentTrailerKey ? 'disabled' : ''}`}
              aria-label={isTrailerPlaying ? "Stop Trailer" : "Play Trailer"}
              title={isTrailerPlaying ? "Stop Trailer" : "Play Trailer"}
              onClick={toggleTrailer}
              disabled={!currentTrailerKey}
            >
              {isTrailerPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m14.5 12.5-5-5"></path>
                  <path d="m9.5 12.5 5-5"></path>
                  <rect width="20" height="14" x="2" y="3" rx="2"></rect>
                  <path d="M12 17v4"></path>
                  <path d="M8 21h8"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"></path>
                  <path d="M12 17v4"></path>
                  <path d="M8 21h8"></path>
                  <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                </svg>
              )}
            </button>

            {/* Watch Now Button */}
            <button
              className="banner-watch-btn"
              onClick={handleWatchNow}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3"></polygon>
              </svg>
              Watch now
            </button>

            {/* Share Button */}
            <button
              className="banner-action-icon"
              aria-label="Share"
              title="Share"
              onClick={handleShare}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" x2="15.42" y1="13.51" y2="17.49"></line>
                <line x1="15.41" x2="8.59" y1="6.51" y2="10.49"></line>
              </svg>
            </button>

            {/* Add to List Button */}
            <button
              className={`banner-action-icon ${isCurrentInWatchlist ? 'in-watchlist' : ''}`}
              aria-label={isCurrentInWatchlist ? "Remove from My List" : "Add to My List"}
              title={isCurrentInWatchlist ? "Remove from My List" : "Add to My List"}
              onClick={handleToggleWatchlist}
            >
              {isCurrentInWatchlist ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              )}
            </button>

            {/* Previous Button */}
            <button
              className="banner-action-icon"
              aria-label="Previous"
              onClick={() => goToSlide((activeSlide - 1 + movies.length) % movies.length)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19 4 9 12 19 20 19 4"></polygon>
                <line x1="5" y1="5" x2="5" y2="19"></line>
              </svg>
            </button>

            {/* Next Button */}
            <button
              className="banner-action-icon"
              aria-label="Next"
              onClick={() => goToSlide((activeSlide + 1) % movies.length)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
              </svg>
            </button>
          </div>

          {/* Genre Tags - Dynamic based on movie data */}
          <div className="banner-genre-tags" key={`genres-${activeSlide}`}>
            {(() => {
              const type = currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv');
              const genreMap = type === 'movie' ? movieGenres : tvGenres;
              const genreNames = currentMovie.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];
              return genreNames.slice(0, 3).map((genre, index) => (
                <React.Fragment key={genre}>
                  {index > 0 && <span className="genre-separator">·</span>}
                  <span className="genre-tag">{genre}</span>
                </React.Fragment>
              ));
            })()}
          </div>
        </div>

        {/* Bottom Right Controls */}
        <div className="banner-bottom-controls">
          {isTrailerPlaying && (
            <button
              className="banner-mute-btn"
              aria-label={isMuted ? "Unmute" : "Mute"}
              title={isMuted ? "Unmute" : "Mute"}
              onClick={() => setIsMuted(prev => !prev)}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
              )}
            </button>
          )}
          <span className="banner-age-badge">{contentRating}</span>
        </div>

        {/* Mobile Poster Carousel - Visible only on Mobile */}
        <div className="mobile-poster-carousel">
          {/* Stacked Cards */}
          <div className="mobile-cards-container">
            {/* Far Left Card */}
            <div className="mobile-poster-card card-far-prev">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(-2)]?.poster_path}`}
                alt={getPosterAlt(movies[getSlideIndex(-2)])}
              />
            </div>
            {/* Previous Card */}
            <div className="mobile-poster-card card-prev">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(-1)]?.poster_path}`}
                alt={getPosterAlt(movies[getSlideIndex(-1)])}
              />
            </div>
            {/* Active Card */}
            <div className="mobile-poster-card card-active">
              <img
                src={`${POSTER_URL}${currentMovie.poster_path}`}
                alt={getPosterAlt(currentMovie)}
                fetchPriority="high"
                loading="eager"
              />
            </div>
            {/* Next Card */}
            <div className="mobile-poster-card card-next">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(1)]?.poster_path}`}
                alt={getPosterAlt(movies[getSlideIndex(1)])}
              />
            </div>
            {/* Far Right Card */}
            <div className="mobile-poster-card card-far-next">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(2)]?.poster_path}`}
                alt={getPosterAlt(movies[getSlideIndex(2)])}
              />
            </div>
          </div>
        </div>

        {/* Mobile Controls at Bottom - Visible only on Mobile */}
        <div className="mobile-banner-controls">
          <div className="mobile-badges-grid">
            <span className="mobile-badge">{mediaType}</span>
            <span className="mobile-badge">{year}</span>
            <span className="mobile-badge">{contentRating}</span>
          </div>
          <button
            className="mobile-watch-btn"
            onClick={() => onItemClick(currentMovie)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="6 3 20 12 6 21 6 3"></polygon>
            </svg>
            Watch Now
          </button>
        </div>

        {/* Carousel Indicators - Mapple.uk style pills */}
        <div className="banner-indicators">
          {movies.map((_, index) => (
            <button
              key={index}
              className={`banner-indicator${index === activeSlide ? ' active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BannerSlider;
