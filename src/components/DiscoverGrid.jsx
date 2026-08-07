import React from 'react';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { getPosterAlt } from '../utils/altTextUtils';
import { cardBackdrop, posterAsBackdrop, cardLogo } from '../utils/images';
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
  gridClassName = 'movie-discover-grid',
  variant = 'grid'   // 'search' = portrait poster + title overlay + mobile row meta
}) => {
  const isSearch = variant === 'search';
  const { getPreviewProps } = useHoverPreview();

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
          const itemTitle = item.title || item.name;
          // Search returns mixed movie/tv in one list, so the type lives on the
          // item. /discover results have no media_type and fall back to the prop.
          const itemType = item.media_type || mediaType;
          // useDiscoverFeed keys enrichment by bare id (one media type per
          // feed); useSearchFeed keys by "type-id" because /search/multi mixes
          // both. Look the composite key up first so either map works here.
          const enriched = enrichedMap.get(`${itemType}-${item.id}`)
            || enrichedMap.get(item.id)
            || {};
          // `enriched.backdrop_path` only exists once enrichment lands, and
          // search never enriches. `item.backdrop_path` ships with both the
          // /discover and /search/multi payloads, so it covers the gap — and
          // since enrichOne resolves to that same value, /discover no longer
          // flickers from poster-crop to backdrop when enrichment arrives.
          const backdropSrc = cardBackdrop(enriched.backdrop_path)
            ?? cardBackdrop(item.backdrop_path)
            ?? posterAsBackdrop(item.poster_path)
            ?? '/icons/placeholder.svg';
          // The placeholder SVG is decorative art, not a real backdrop — keep
          // it letterboxed (contain) on a dark ground instead of stretching it
          // full-bleed like a real backdrop. See DiscoverGrid.css.
          const isPlaceholder = backdropSrc === '/icons/placeholder.svg';
          const logoSrc = cardLogo(enriched.logo_path);
          // Enrichment lives in a side Map, so fold it back onto the item for
          // anything downstream that reads `logo_path`/`backdrop_path` off the
          // item directly — the hover preview does, for both.
          const previewItem = enriched.logo_path || enriched.backdrop_path
            ? { ...item, ...enriched }
            : item;

          return (
            <div
              key={`${itemType}-${item.id}`}
              className="trending-card"
              onClick={() => onItemClick(item)}
              // The preview seeds its logo from `item.logo_path` and only
              // falls back to a network fetch when that is missing. The grid
              // already holds the logo, so hand it over rather than making
              // the preview re-fetch what we have — that round-trip is what
              // made the logo appear a beat after the card opened.
              {...(!isSearch && getPreviewProps(previewItem, itemType, false, onItemClick))}
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
                  alt={getPosterAlt({ ...item, media_type: itemType })}
                  className={isPlaceholder ? 'trending-card-placeholder-img' : undefined}
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
