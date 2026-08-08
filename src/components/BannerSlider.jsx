import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTMDB, pickLogoPath, pickTrailerKey, parseContentRating } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';
import { getPosterAlt } from '../utils/altTextUtils';
import useTVDetect from '../hooks/useTVDetect';

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
  const [isMuted, setIsMuted] = useState(false);
  const trailerRef = useRef(null);
  const { BACKDROP_URL, POSTER_URL, LOGO_URL, fetchItemBundle, fetchSeasonEpisodes, movieGenres, tvGenres } = useTMDB();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const { showSuccess } = useToast();
  const isTVMode = useTVDetect();

  // Auto-advance slides with progress tracking (pause when trailer is playing)
  useEffect(() => {
    // Don't auto-advance when trailer is playing
    if (isTrailerPlaying) {
      setProgress(0);
      return;
    }

    const slideDuration = isTVMode ? 14000 : 7000;
    const progressInterval = isTVMode ? 200 : 50;
    let progressTimer;
    let slideTimer;

    const startProgress = () => {
      setProgress(0);
      progressTimer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 100;
          return prev + (progressInterval / slideDuration) * 100;
        });
      }, progressInterval);

      slideTimer = setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % movies.length);
      }, slideDuration);
    };

    startProgress();

    return () => {
      clearInterval(progressTimer);
      clearTimeout(slideTimer);
    };
  }, [currentSlide, movies.length, isTrailerPlaying, isTVMode]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setProgress(0);
    setIsTrailerPlaying(false); // Stop trailer when changing slides
  };

  // Determine if we should show skeleton (loading or no movies)
  const showSkeleton = loading || !movies.length;

  // Safe currentMovie - use first movie or a placeholder object when no movies
  const currentMovie = movies.length > 0 ? movies[currentSlide] : { id: 0 };
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

  // Toggle trailer playback
  const toggleTrailer = () => {
    if (currentTrailerKey) {
      setIsTrailerPlaying(prev => !prev);
    }
  };

  // Handle add to watchlist with toast notification
  const handleToggleWatchlist = () => {
    const wasInWatchlist = isInWatchlist(currentMovie.id);
    toggleWatchlist(currentMovie);
    if (!wasInWatchlist) {
      showSuccess('Added to Watchlist');
    } else {
      showSuccess('Removed from Watchlist');
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

  // Adsterra configuration smartlink
  const AD_URL = 'https://consumptionbackwardsentiments.com/kjy2d6bi?key=b2d063ec2be89ba5e928fdd367071bbd';
  const AD_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

  // Handle Watch Now button click with ad popup
  const handleWatchNow = () => {
    // Check if this is user's first ever click (grace period)
    const hasClickedBefore = localStorage.getItem('hasClickedWatch') === 'true';

    if (!hasClickedBefore) {
      // First click ever - mark it and skip ad
      localStorage.setItem('hasClickedWatch', 'true');
    } else {
      // Not first click - check cooldown timer
      const lastAdTime = parseInt(localStorage.getItem('lastAdTrigger') || '0', 10);
      const now = Date.now();

      if (now - lastAdTime >= AD_COOLDOWN_MS) {
        // Cooldown expired - open ad and reset timer
        window.open(AD_URL, '_blank');
        localStorage.setItem('lastAdTrigger', now.toString());
      }
    }

    // Normal navigation to watch page
    const type = currentMovie.media_type || (currentMovie.release_date ? 'movie' : 'tv');
    navigate(`/watch?type=${type}&id=${currentMovie.id}`, { state: { fromModal: true } });
  };

  // Split title for last word highlight
  const titleWords = (currentMovie.title || currentMovie.name || '').split(' ');
  const titleMain = titleWords.slice(0, -1).join(' ');
  const titleHighlight = titleWords[titleWords.length - 1];

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
    return (currentSlide + offset + movies.length) % movies.length;
  };

  // Swipe handlers with momentum - longer swipes move more slides
  const swipeHandlers = useSwipe({
    onSwipe: (itemsToMove) => {
      let newIndex = currentSlide + itemsToMove;
      // Wrap around for banner slides
      newIndex = ((newIndex % movies.length) + movies.length) % movies.length;
      goToSlide(newIndex);
    },
    threshold: 50,
    maxItems: 3 // Max slides to move per swipe on banner
  });

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
    <div className="banner-slider">
      {/* Progress Bar */}
      <div className="banner-progress">
        <div
          className="banner-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="banner-slide" {...swipeHandlers}>
        {/* Background Image/Video with Mask */}
        {isTrailerPlaying && currentTrailerKey ? (
          <div className="banner-backdrop banner-trailer-container">
            <iframe
              ref={trailerRef}
              className="banner-trailer-video"
              src={`https://www.youtube-nocookie.com/embed/${currentTrailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${currentTrailerKey}&controls=0&showinfo=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
              title={`${currentMovie.title || currentMovie.name} Trailer`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="banner-backdrop" key={currentSlide}>
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
            <div className="banner-logo-container" key={`logo-${currentSlide}`}>
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
              <h2 className="banner-title-new banner-title-fallback" style={{ display: 'none' }}>
                {titleMain} <span className="title-highlight">{titleHighlight}</span>
              </h2>
            </div>
          ) : (
            <h2 className="banner-title-new" key={`title-${currentSlide}`}>
              {titleMain} <span className="title-highlight">{titleHighlight}</span>
            </h2>
          )}

          {/* IMDb + Metadata Row */}
          <div className="banner-meta-row" key={`meta-${currentSlide}`}>
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
          <p className="banner-description-new" key={`desc-${currentSlide}`}>
            {currentMovie.overview?.length > 200
              ? `${currentMovie.overview.substring(0, 200)}...`
              : currentMovie.overview
            }
          </p>

          {/* Action Buttons Row */}
          <div className="banner-actions-row" key={`actions-${currentSlide}`}>
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
              className={`banner-action-icon ${isInWatchlist(currentMovie.id) ? 'in-watchlist' : ''}`}
              aria-label={isInWatchlist(currentMovie.id) ? "Remove from My List" : "Add to My List"}
              title={isInWatchlist(currentMovie.id) ? "Remove from My List" : "Add to My List"}
              onClick={handleToggleWatchlist}
            >
              {isInWatchlist(currentMovie.id) ? (
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
              onClick={() => goToSlide((currentSlide - 1 + movies.length) % movies.length)}
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
              onClick={() => goToSlide((currentSlide + 1) % movies.length)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
              </svg>
            </button>
          </div>

          {/* Genre Tags - Dynamic based on movie data */}
          <div className="banner-genre-tags" key={`genres-${currentSlide}`}>
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
              className={`banner-indicator${index === currentSlide ? ' active' : ''}`}
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