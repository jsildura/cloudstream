import React, { memo, useEffect, useState } from 'react';
import { getPosterAlt } from '../utils/altTextUtils';
import { cardBackdrop, posterAsBackdrop, cardLogo } from '../utils/images';
import { useTMDB } from '../hooks/useTMDB';
import { useHoverPreview } from '../contexts/HoverPreviewContext';

const MovieCard = memo(({ item, onClick }) => {
  const { fetchItemBundle } = useTMDB();
  const { getPreviewProps, closeNow } = useHoverPreview();
  const [enrichedItem, setEnrichedItem] = useState(item);

  useEffect(() => {
    let cancelled = false;
    const type = item.type || item.media_type || (item.first_air_date ? 'tv' : 'movie');

    setEnrichedItem(item);
    fetchItemBundle(type, item.id, ['images'])
      .then((data) => {
        if (cancelled) return;
        const logos = data.images?.logos || [];
        const logo = logos.find((image) => image.iso_639_1 === 'en') || logos[0];
        setEnrichedItem({
          ...item,
          backdrop_path: item.backdrop_path || data.backdrop_path || data.images?.backdrops?.[0]?.file_path,
          logo_path: item.logo_path || logo?.file_path || null,
          vote_average: item.vote_average ?? data.vote_average
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [fetchItemBundle, item]);

  const title = enrichedItem.title || enrichedItem.name;
  const type = enrichedItem.type || enrichedItem.media_type || (enrichedItem.first_air_date ? 'tv' : 'movie');
  const backdropSrc = cardBackdrop(enrichedItem.backdrop_path)
    ?? posterAsBackdrop(enrichedItem.poster_path)
    ?? '/placeholder-backdrop.jpg';
  const logoSrc = cardLogo(enrichedItem.logo_path);

  const handleClick = () => {
    closeNow();
    onClick?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="movie-card"
      onClick={handleClick}
      {...getPreviewProps(enrichedItem, type, false, handleClick)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Play ${title}`}
    >
      <div className="card-image-container">
        {enrichedItem.backdrop_path || enrichedItem.poster_path ? (
          <img
            src={backdropSrc}
            alt={getPosterAlt(enrichedItem)}
            loading="lazy"
          />
        ) : (
          <div className="poster-placeholder">
            <span>{title}</span>
          </div>
        )}
        <div className="card-hover-overlay">
          <button className="play-hover-btn" tabIndex={-1} aria-hidden="true">
            <span className="play-icon">▶</span>
            Play
          </button>
        </div>

        {enrichedItem.vote_average > 0 && (
          <div className="card-rating">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{enrichedItem.vote_average.toFixed(1)}</span>
          </div>
        )}

        {logoSrc ? (
          <div className="card-logo-overlay">
            <img src={logoSrc} alt={title} draggable="false" />
          </div>
        ) : (
          <div className="card-title-overlay">
            <span>{title}</span>
          </div>
        )}
      </div>
    </div>
  );
});

MovieCard.displayName = 'MovieCard';
export default MovieCard;
