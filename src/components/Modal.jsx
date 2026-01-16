import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTMDB } from '../hooks/useTMDB';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';

const Modal = memo(({ item, onClose, recommendations = [], collection = [] }) => {
  const navigate = useNavigate();
  const { BACKDROP_URL, POSTER_URL, fetchVideos, fetchLogo } = useTMDB();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const { showSuccess } = useToast();
  const [inWatchlist, setInWatchlist] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Check if item is in watchlist on mount
  useEffect(() => {
    if (item?.id) {
      setInWatchlist(isInWatchlist(item.id));
    }
  }, [item?.id, isInWatchlist]);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [logoPath, setLogoPath] = useState(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [contentRating, setContentRating] = useState(null);

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

  // Fetch trailer key, logo when modal opens. Use pre-loaded contentRating if available.
  useEffect(() => {
    const loadData = async () => {
      if (item?.id) {
        const type = item.media_type || item.type || 'movie';
        const [key, logo] = await Promise.all([
          fetchVideos(type, item.id),
          fetchLogo(type, item.id)
        ]);
        setTrailerKey(key);
        setLogoPath(logo);
        setLogoLoaded(true);

        // Use pre-loaded contentRating if available, otherwise skip (no fetch delay)
        if (item.contentRating) {
          setContentRating(item.contentRating);
        }
      }
    };
    loadData();
  }, [item?.id, item?.media_type, item?.type, item?.contentRating, fetchVideos, fetchLogo]);

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

  // Ad configuration
  const AD_URL = 'https://www.effectivegatecpm.com/kjy2d6bi?key=b2d063ec2be89ba5e928fdd367071bbd';
  const AD_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

  const playButtonClick = useCallback(() => {
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

    // Normal navigation to watch page (always happens)
    let url = `/watch?type=${item.type}&id=${item.id}`;
    if (item.type === 'tv' && item.lastSeason && item.lastEpisode) {
      url += `&season=${item.lastSeason}&episode=${item.lastEpisode}`;
    }
    navigate(url, { state: { fromModal: true } });  // Use React Router navigation - NO page reload
    onClose();  // Close modal after navigation
  }, [item.type, item.id, item.lastSeason, item.lastEpisode, navigate, onClose]);

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

  // Ref to track if user manually toggled the trailer (to prevent auto-play interference)
  const userToggledTrailerRef = useRef(false);
  const autoPlayTimerRef = useRef(null);

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

  // Auto-play trailer after 3 seconds delay
  useEffect(() => {
    // Only auto-play if trailer key exists, not already playing, and user hasn't toggled manually
    if (trailerKey && !isTrailerPlaying && !userToggledTrailerRef.current) {
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
  }, [trailerKey, isTrailerPlaying]);

  // Get year from release date
  const year = item.release_date?.substring(0, 4) ||
    item.first_air_date?.substring(0, 4) || '';

  // Format runtime
  const runtime = item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : '';

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

  return createPortal(
    <div className="modal-overlay" onClick={handleBackdropClick}>
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
        <button className="modal-close-new" onClick={handleClose}>✕</button>

        {/* Scrollable Content */}
        <div className={`modal-scroll-container ${isTrailerPlaying ? 'trailer-playing' : ''}`}>
          {/* Hero Header with Backdrop/Trailer */}
          <div className="modal-hero">
            <div className="modal-backdrop-container">
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
                /* Backdrop Image */
                <img
                  src={`${BACKDROP_URL}${item.backdrop_path}`}
                  alt={item.title || item.name}
                  className="modal-backdrop-img"
                />
              )}
            </div>
            {/* Movie Logo/Title Overlay - hide when trailer is playing, wait for logo check */}
            {!isTrailerPlaying && logoLoaded && (
              <div className="modal-logo-overlay">
                {logoPath ? (
                  <img
                    src={`${POSTER_URL}${logoPath}`}
                    alt={item.title || item.name}
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
                    <span className="modal-btn-icon">▷</span>
                    Watch Now
                  </button>
                  <button
                    onClick={() => {
                      const wasInList = inWatchlist;
                      toggleWatchlist(item);
                      setInWatchlist(!inWatchlist);
                      if (wasInList) {
                        showSuccess('Removed from Watchlist');
                      } else {
                        showSuccess('Added to Watchlist');
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
                        <span className="star-icon">☆</span>
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
                  <span className="modal-info-value">{item.genres?.join(', ') || 'N/A'}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Cast:</span>
                  <span className="modal-info-value">{item.cast || 'N/A'}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">Status:</span>
                  <span className="modal-info-value">{item.status || 'Released'}</span>
                </div>
              </div>
            </div>

            {/* Collection Section */}
            {collection.length > 0 && (
              <div className="modal-section">
                <h3 className="modal-section-title">{item.collection_name || 'Collection'}</h3>
                <div className="modal-collection-grid">
                  {collection.map((movie, index) => (
                    <div key={index} className="modal-collection-item">
                      <img
                        src={`${BACKDROP_URL}${movie.backdrop_path}`}
                        alt={movie.title || movie.name}
                        className="modal-collection-img"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* You May Also Like Section */}
            {recommendations.length > 0 && (
              <div className="modal-section">
                <h3 className="modal-section-title">You may also like</h3>
                <div className="modal-recommendations-scroll">
                  {recommendations.map((movie, index) => (
                    <div key={index} className="modal-recommendation-item">
                      <img
                        src={`${POSTER_URL}${movie.poster_path}`}
                        alt={movie.title || movie.name}
                        className="modal-recommendation-img"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});

Modal.displayName = 'Modal';
export default Modal;