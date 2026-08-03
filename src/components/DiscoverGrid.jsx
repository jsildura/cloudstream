import React from 'react';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { getPosterAlt } from '../utils/altTextUtils';
import { useTMDB } from '../hooks/useTMDB';
import { SKELETON_COUNT } from '../hooks/useDiscoverFeed';
import './TrendingSection.css';
import './DiscoverGrid.css';

const DiscoverGrid = ({
  items,
  enrichedMap,
  mediaType,
  loading,
  error,
  emptyMessage,
  isFetchingMore,
  sentinelRef,
  canLoadMore,
  onItemClick,
  gridClassName = 'movie-discover-grid'
}) => {
  const { getPreviewProps } = useHoverPreview();
  const { POSTER_URL, LOGO_URL } = useTMDB();

  return (
    <>
      <div className={gridClassName}>
        {/* Skeleton tiles hold the grid's shape during the first fetch, the
            same as /tv-shows and the home page rows. Only the initial load
            shows them: an append is driven by `isFetchingMore`, which leaves
            `loading` false so already-rendered cards are never replaced. */}
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={`skeleton-${i}`} className="trending-card-skeleton" />
          ))
          : items.map(item => {
          const enriched = enrichedMap.get(item.id) || {};
          const itemTitle = item.title || item.name;
          const backdropSrc = enriched.backdrop_path
            ? `https://image.tmdb.org/t/p/w780${enriched.backdrop_path}`
            : item.poster_path
              ? `${POSTER_URL}${item.poster_path}`
              : '/placeholder-backdrop.jpg';
          const logoSrc = enriched.logo_path ? `${LOGO_URL}${enriched.logo_path}` : null;
          // Enrichment lives in a side Map, so fold it back onto the item for
          // anything downstream that reads `logo_path`/`backdrop_path` off the
          // item directly — the hover preview does, for both.
          const previewItem = enriched.logo_path || enriched.backdrop_path
            ? { ...item, ...enriched }
            : item;

          return (
            <div
              key={`${mediaType}-${item.id}`}
              className="trending-card"
              onClick={() => onItemClick(item)}
              // The preview seeds its logo from `item.logo_path` and only
              // falls back to a network fetch when that is missing. The grid
              // already holds the logo, so hand it over rather than making
              // the preview re-fetch what we have — that round-trip is what
              // made the logo appear a beat after the card opened.
              {...getPreviewProps(previewItem, mediaType, false, onItemClick)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onItemClick(item);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`View details for ${itemTitle}`}
            >
              <div className="trending-card-backdrop">
                <img
                  src={backdropSrc}
                  alt={getPosterAlt({ ...item, media_type: mediaType })}
                  loading="lazy"
                  draggable="false"
                />
                <div className="trending-hover-overlay" aria-hidden="true">
                  <span className="trending-play-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
                    </svg>
                  </span>
                </div>

                {item.vote_average > 0 && (
                  <div className="trending-card-rating">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span>{item.vote_average.toFixed(1)}</span>
                  </div>
                )}

                {logoSrc ? (
                  <div className="trending-logo-overlay">
                    <img src={logoSrc} alt={itemTitle} draggable="false" />
                  </div>
                ) : (
                  <div className="trending-title-overlay">
                    <span>{itemTitle}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && error && (
        <p className="no-results" role="alert">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="no-results">{emptyMessage}</p>
      )}

      {canLoadMore && !loading && (
        <div ref={sentinelRef} className="movie-discover-sentinel" aria-hidden="true" />
      )}

      {isFetchingMore && (
        <div className="movie-discover-loading-more" role="status">
          <span className="load-more-spinner"></span>
          <span>Loading...</span>
        </div>
      )}
    </>
  );
};

export default DiscoverGrid;
