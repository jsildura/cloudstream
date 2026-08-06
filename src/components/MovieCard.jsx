import React, { memo } from 'react';
import { getPosterAlt } from '../utils/altTextUtils';
import { cardPoster } from '../utils/images';

const MovieCard = memo(({ item, onClick }) => {

  const title = item.title || item.name;
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const year = item.release_date ? item.release_date.substring(0, 4) :
    (item.first_air_date ? item.first_air_date.substring(0, 4) : '');

  const posterSrc = cardPoster(item.poster_path) ?? '/placeholder-poster.jpg';

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick && onClick();
    }
  };

  return (
    <div
      className="movie-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Play ${title}`}
    >
      <div className="card-image-container">
        {item.poster_path ? (
          <img
            src={posterSrc}
            alt={getPosterAlt(item)}
            loading="lazy"
          />
        ) : (
          <div className="poster-placeholder">
            <span>{title}</span>
          </div>
        )}
        <div className="card-hover-overlay">
          <button className="play-hover-btn">
            <span className="play-icon">▶</span>
            Play
          </button>
        </div>
      </div>

      <div className="card-content">
        <h3 className="card-title">{title}</h3>
        <div className="card-meta">
          <span className="rating">⭐ {rating}</span>
          <span className="year">{year}</span>
        </div>
      </div>
    </div>
  );
});

MovieCard.displayName = 'MovieCard';
export default MovieCard;