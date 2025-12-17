import React, { useState, useEffect } from 'react';
import { useTMDB } from '../hooks/useTMDB';
import useSwipe from '../hooks/useSwipe';

const BannerSlider = ({ movies, onItemClick }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const { BACKDROP_URL, POSTER_URL } = useTMDB();

  // Auto-advance slides with progress tracking
  useEffect(() => {
    const slideDuration = 5000;
    const progressInterval = 50;
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
  }, [currentSlide, movies.length]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setProgress(0);
  };

  if (!movies.length) return null;

  const currentMovie = movies[currentSlide];

  // Split title for last word highlight
  const titleWords = (currentMovie.title || currentMovie.name || '').split(' ');
  const titleMain = titleWords.slice(0, -1).join(' ');
  const titleHighlight = titleWords[titleWords.length - 1];

  // Get media type badge text
  const mediaType = currentMovie.media_type === 'tv' ? 'TV' : 'Movie';

  // Get year
  const year = currentMovie.release_date?.substring(0, 4) ||
    currentMovie.first_air_date?.substring(0, 4) || 'N/A';

  // Get content rating (simplified - you may want to fetch actual ratings)
  const contentRating = currentMovie.adult ? 'R' : 'PG-13';

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
        {/* Background Image with Mask */}
        <div
          className="banner-backdrop"
          style={{
            backgroundImage: `url(${BACKDROP_URL}${currentMovie.backdrop_path})`
          }}
        />

        {/* Desktop Content - Hidden on Mobile */}
        <div className="banner-content banner-desktop-content">
          {/* Title with Last Word Highlighted */}
          <h1 className="banner-title-new">
            {titleMain} <span className="title-highlight">{titleHighlight}</span>
          </h1>

          {/* Outline Badges */}
          <div className="banner-badges">
            <span className="banner-badge">{mediaType}</span>
            <span className="banner-badge">{year}</span>
            <span className="banner-badge">{contentRating}</span>
          </div>

          {/* Description */}
          <p className="banner-description-new">
            {currentMovie.overview?.length > 250
              ? `${currentMovie.overview.substring(0, 250)}...`
              : currentMovie.overview
            }
          </p>

          {/* Buttons */}
          <div className="banner-buttons-new">
            <button
              className="btn-play-now-new"
              onClick={() => onItemClick(currentMovie)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
              Play Now
            </button>
            <button
              className="btn-outline-new"
              onClick={() => onItemClick(currentMovie)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
              More Info
            </button>
          </div>
        </div>

        {/* Mobile Poster Carousel - Visible only on Mobile */}
        <div className="mobile-poster-carousel">
          {/* Stacked Cards */}
          <div className="mobile-cards-container">
            {/* Far Left Card */}
            <div className="mobile-poster-card card-far-prev">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(-2)]?.poster_path}`}
                alt={movies[getSlideIndex(-2)]?.title || movies[getSlideIndex(-2)]?.name}
              />
            </div>
            {/* Previous Card */}
            <div className="mobile-poster-card card-prev">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(-1)]?.poster_path}`}
                alt={movies[getSlideIndex(-1)]?.title || movies[getSlideIndex(-1)]?.name}
              />
            </div>
            {/* Active Card */}
            <div className="mobile-poster-card card-active">
              <img
                src={`${POSTER_URL}${currentMovie.poster_path}`}
                alt={currentMovie.title || currentMovie.name}
              />
            </div>
            {/* Next Card */}
            <div className="mobile-poster-card card-next">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(1)]?.poster_path}`}
                alt={movies[getSlideIndex(1)]?.title || movies[getSlideIndex(1)]?.name}
              />
            </div>
            {/* Far Right Card */}
            <div className="mobile-poster-card card-far-next">
              <img
                src={`${POSTER_URL}${movies[getSlideIndex(2)]?.poster_path}`}
                alt={movies[getSlideIndex(2)]?.title || movies[getSlideIndex(2)]?.name}
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
      </div>

      {/* Navigation Arrows */}
      <button
        className="banner-nav-btn banner-nav-prev"
        onClick={() => goToSlide((currentSlide - 1 + movies.length) % movies.length)}
        aria-label="Previous slide"
      >
        ❮
      </button>
      <button
        className="banner-nav-btn banner-nav-next"
        onClick={() => goToSlide((currentSlide + 1) % movies.length)}
        aria-label="Next slide"
      >
        ❯
      </button>
    </div>
  );
};

export default BannerSlider;