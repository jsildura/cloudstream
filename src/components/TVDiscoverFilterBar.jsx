import React, { useState, useEffect, useRef } from 'react';
import { TV_BAR_CATEGORIES, getCategoryColor } from '../constants/genres';
import useGenreBackdrops from '../hooks/useGenreBackdrops';
import CarouselControls from './CarouselControls';
import { wsUrl } from '../utils/images';
import './TVDiscoverFilterBar.css';

// How many category pills fit beside the "More" button at each width, derived
// from the real label widths and the pill padding/font-size in the stylesheet.
//
// The counts are not monotonic in viewport width, and that is deliberate: the
// TV scaling media queries enlarge pills sharply (12.8px→17.6px font and
// 14px→24px padding at 1920, again at 3840), so a 1920px TV fits *fewer*
// categories than a 1600px laptop. Each step below is measured against the
// scale tier that actually applies at that width. Ordered widest first; the
// first match wins.
const VISIBLE_STEPS = [
  // 4K tier (>=3840px): 40px pill padding, 1.8rem text.
  { min: 6500, count: TV_BAR_CATEGORIES.length },
  { min: 6000, count: 24 },
  { min: 5600, count: 22 },
  { min: 5120, count: 20 },
  { min: 4600, count: 18 },
  { min: 4200, count: 16 },
  { min: 3840, count: 14 },
  // 1080p tier (1920-3839px): 24px pill padding, 1.1rem text.
  { min: 3400, count: 22 },
  { min: 3000, count: 19 },
  { min: 2800, count: 18 },
  { min: 2560, count: 16 },
  { min: 2400, count: 14 },
  { min: 2200, count: 13 },
  { min: 2048, count: 12 },
  { min: 1920, count: 11 },
  // Default tier (<1920px): 14px pill padding, 0.8rem text.
  { min: 1800, count: 17 },
  { min: 1728, count: 16 },
  { min: 1680, count: 15 },
  { min: 1536, count: 14 },
  { min: 1440, count: 13 },
  { min: 1366, count: 12 },
  { min: 1280, count: 11 },
  { min: 1152, count: 9 },
  { min: 1024, count: 8 },
  { min: 900, count: 7 },
  { min: 769, count: 6 },
  // Mobile tier (<= 768px): Show all genres so users can horizontally scroll through all categories
  { min: 0, count: TV_BAR_CATEGORIES.length }
];

const countForWidth = (width) =>
  (VISIBLE_STEPS.find(step => width >= step.min) ?? VISIBLE_STEPS[VISIBLE_STEPS.length - 1]).count;

// Pseudo-random pill widths (em, so they scale with the TV/4K font tiers).
const SKELETON_WIDTHS = ['5em', '6.5em', '4.5em', '7em', '5.5em', '6em', '4.8em', '6.8em'];

const CardBackdrop = ({ backdropPath }) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [backdropPath]);

  return (
    <>
      {(!backdropPath || !loaded) && (
        <div className="tv-filter-pill-card-skeleton" aria-hidden="true" />
      )}
      {backdropPath && (
        <img
          className="tv-filter-pill-bg"
          src={wsUrl(backdropPath, { w: 300 })}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable="false"
          onLoad={() => setLoaded(true)}
          ref={(img) => {
            if (img && img.complete && img.naturalWidth > 0 && !loaded) {
              setLoaded(true);
            }
          }}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </>
  );
};

// Resolved from matchMedia rather than a resize listener so the browser only
// notifies us when a breakpoint is actually crossed.
const useVisibleCount = () => {
  const [count, setCount] = useState(() =>
    typeof window === 'undefined' ? TV_BAR_CATEGORIES.length : countForWidth(window.innerWidth)
  );

  useEffect(() => {
    const queries = VISIBLE_STEPS.filter(step => step.min > 0).map(step =>
      window.matchMedia(`(min-width: ${step.min}px)`)
    );
    const sync = () => setCount(countForWidth(window.innerWidth));
    sync();
    queries.forEach(q => q.addEventListener('change', sync));
    return () => queries.forEach(q => q.removeEventListener('change', sync));
  }, []);

  return count;
};

// Netflix-style bar: top categories inline, everything else behind "More"
// (FilterPanel).
const TVDiscoverFilterBar = ({
  filters,
  onMoreClick,
  onFilterChange,
  onClearFilters,
  activeFilterCount = 0,
  loading = false,
  variant = 'pills',
  title = 'Genres',
  subtitle = 'Find something by mood'
}) => {
  const visibleCount = useVisibleCount();
  const cards = variant === 'cards';

  // Split on either separator: genres join with "," and keywords with "|"
  // (see TV_BAR_BY_KEY in constants/genres.js), and a hand-edited URL may carry
  // either. Only joining is separator-sensitive.
  const selectedFor = (param) =>
    (filters[param] ? String(filters[param]).split(/[,|]/).filter(Boolean) : []);

  const handleCategoryClick = (category) => {
    const selected = selectedFor(category.param);
    const idStr = String(category.id);
    const next = selected.includes(idStr)
      ? selected.filter(v => v !== idStr)
      : [...selected, idStr];
    onFilterChange({ [category.param]: next.join(category.sep) || undefined });
  };

  const isActive = (category) => selectedFor(category.param).includes(String(category.id));

  const showClear = activeFilterCount > 0 && Boolean(onClearFilters);

  const carouselRef = useRef(null);

  // Truncation must never hide an *active* pill — a genre selected in the panel
  // or restored from the URL would otherwise be impossible to switch off. Any
  // active overflow entry is appended, keeping the canonical order.
  //
  // VISIBLE_STEPS is measured against the "More" button alone, so the Clear pill
  // costs one category slot while it is on screen (except in cards mode or when
  // all genres are visible).
  const isAllVisible = cards || visibleCount >= TV_BAR_CATEGORIES.length;
  const headCount = isAllVisible
    ? TV_BAR_CATEGORIES.length
    : Math.max(1, visibleCount - (showClear ? 1 : 0));
  const head = TV_BAR_CATEGORIES.slice(0, headCount);
  const pinnedOverflow = TV_BAR_CATEGORIES.slice(headCount).filter(isActive);
  const visibleCategories = [...head, ...pinnedOverflow];

  // Card variant only: one representative backdrop per visible genre. No-op (and
  // no requests) when variant === 'pills'.
  const backdrops = useGenreBackdrops(visibleCategories, 'tv', cards);

  const renderMoreGroup = () => (
    <div className="tv-filter-more-group">
      {loading ? (
        <span className="tv-filter-pill tv-filter-pill-skeleton" style={{ width: '7em' }} />
      ) : (
        <>
          {showClear && (
            <button
              type="button"
              className="tv-filter-pill tv-filter-clear"
              onClick={onClearFilters}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="tv-filter-pill tv-filter-more"
            onClick={onMoreClick}
            aria-haspopup="dialog"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
            More
            {activeFilterCount > 0 && (
              <span className="tv-filter-more-badge" aria-label={`${activeFilterCount} active filters`}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className={`tv-discover-filterbar${cards ? ' tv-discover-filterbar--cards' : ''}`}>
      {cards && (
        <div className="tv-filter-header">
          <div className="tv-filter-title-group">
            <span className="tv-filter-title-indicator" aria-hidden="true" />
            <div className="tv-filter-title-content">
              <h2 className="tv-filter-title">
                {title}
                <svg
                  className="tv-filter-title-chevron"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </h2>
              {subtitle && <p className="tv-filter-subtitle">{subtitle}</p>}
            </div>
          </div>
          {renderMoreGroup()}
        </div>
      )}
      {cards ? (
        <div className="tv-filter-carousel-wrapper carousel-container">
          <div
            ref={carouselRef}
            className="tv-filter-genres tv-filter-genres--cards"
            role="group"
            aria-label="Categories"
            aria-busy={loading}
          >
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="tv-filter-pill tv-filter-pill--card tv-filter-pill-skeleton" />
              ))
            ) : (
              visibleCategories.map(category => {
                const active = isActive(category);
                const backdropPath = backdrops[category.key];
                const categoryColor = getCategoryColor(category);
                return (
                  <button
                    key={category.key}
                    type="button"
                    className={`tv-filter-pill tv-filter-pill--card${active ? ' active' : ''}`}
                    style={categoryColor ? {
                      '--genre-color': categoryColor.hex,
                      '--genre-rgb': categoryColor.rgb
                    } : undefined}
                    aria-pressed={active}
                    onClick={() => handleCategoryClick(category)}
                  >
                    <CardBackdrop backdropPath={backdropPath} />
                    <span className="tv-filter-pill-shade" aria-hidden="true" />
                    <span className="tv-filter-pill-label">{category.name}</span>
                  </button>
                );
              })
            )}
          </div>
          <CarouselControls carouselRef={carouselRef} />
        </div>
      ) : (
        <>
          <div className="tv-filter-genres" role="group" aria-label="Categories" aria-busy={loading}>
            {loading ? (
              SKELETON_WIDTHS.map((width, i) => (
                <span key={i} className="tv-filter-pill tv-filter-pill-skeleton" style={{ width }} />
              ))
            ) : (
              visibleCategories.map(category => {
                const active = isActive(category);
                return (
                  <button
                    key={category.key}
                    type="button"
                    className={`tv-filter-pill${active ? ' active' : ''}`}
                    aria-pressed={active}
                    onClick={() => handleCategoryClick(category)}
                  >
                    {category.name}
                  </button>
                );
              })
            )}
          </div>
          {renderMoreGroup()}
        </>
      )}
    </div>
  );
};

export default TVDiscoverFilterBar;
