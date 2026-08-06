import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import MetaTags from '../components/MetaTags';
import DiscoverGrid from '../components/DiscoverGrid';
import { useTMDB } from '../hooks/useTMDB';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { useSearchFeed } from '../hooks/useSearchFeed';
import { loadRecent, saveRecent, removeRecent, clearRecent } from '../utils/searchHistory';
import '../components/TrendingSection.css';
import './Search.css';

const DEBOUNCE_MS = 250;
const MAX_TOP_SEARCHES = 10;

// Stable identity: DiscoverGrid takes an enrichedMap, and search doesn't
// enrich (see plan section 4.4). A literal here would be a new Map every
// render and would defeat memoisation downstream.
const NO_ENRICHMENT = new Map();

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // `urlQuery` is the source of truth and what we actually search.
  // `input` is what the user sees; it flows into the URL after a debounce.
  const urlQuery = searchParams.get('q') || '';
  const [input, setInput] = useState(urlQuery);

  const [recent, setRecent] = useState(loadRecent);
  const [topSearches, setTopSearches] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const inputRef = useRef(null);

  const { movieGenres, tvGenres } = useTMDB();
  const { closeNow } = useHoverPreview();
  const feed = useSearchFeed(urlQuery);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Typing → URL, debounced. `replace` not `push`: otherwise every debounced
  // keystroke becomes a history entry and Back walks the query backwards
  // one word at a time. See plan section 4.6.
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === urlQuery) return;
    const timer = setTimeout(() => {
      setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, urlQuery, setSearchParams]);

  // URL → input, for direct navigation and chip clicks. The trim comparison
  // keeps this from fighting the effect above.
  useEffect(() => {
    setInput(prev => (prev.trim() === urlQuery ? prev : urlQuery));
  }, [urlQuery]);

  // "Top searches" for the empty state. This request used to live in Navbar
  // and fired on EVERY page load; here it only runs when someone opens search.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/trending/all/week');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setTopSearches(
          (data.results || [])
            .filter(i => i.title || i.name)
            .slice(0, MAX_TOP_SEARCHES)
        );
      } catch {
        // Empty state just renders without this section.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runQuery = useCallback((q) => {
    setInput(q);
    setSearchParams({ q }, { replace: true });
    inputRef.current?.focus();
  }, [setSearchParams]);

  const handleItemClick = useCallback((item) => {
    closeNow();
    const type = item.media_type === 'movie' ? 'movie' : 'tv';
    const genreMap = type === 'movie' ? movieGenres : tvGenres;
    const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

    // Only now is the query worth remembering — the user acted on it.
    if (urlQuery) setRecent(saveRecent(urlQuery));

    // Modal lazily loads cast + contentRating itself, so open immediately.
    setSelectedItem({ ...item, type, media_type: type, genres: genreNames });
    setIsModalOpen(true);
  }, [closeNow, movieGenres, tvGenres, urlQuery]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    // First Escape clears the query; a second one leaves the page.
    if (input) setInput('');
    else navigate('/');
  };

  const showEmptyState = !urlQuery;

  return (
    // NOTE: deliberately NO data-nav-trap. That attribute is modal-only —
    // a page carrying it out-ranks an open Modal and traps D-pad focus
    // behind the dialog. See plan section 4.7.
    <div className="search-page">
      <MetaTags
        title={urlQuery ? `${urlQuery} — Search | StreamFlix` : 'Search | StreamFlix'}
        description="Search movies and TV shows on StreamFlix."
      />

      <div className="search-page-input-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-page-input"
          placeholder="Search for a show, movie, genre..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-label="Search movies and TV shows"
        />
        {input && (
          <button className="search-page-clear" onClick={() => setInput('')} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {showEmptyState ? (
        <>
          {recent.length > 0 && (
            <section className="search-page-section">
              <div className="search-page-section-head">
                {/* Our feature, not a Netflix one — Netflix hides search history. */}
                <h2>Recent searches</h2>
                <button
                  className="search-page-clear-all"
                  onClick={() => setRecent(clearRecent())}
                >
                  Clear all
                </button>
              </div>
              <div className="search-page-chips">
                {recent.map(term => (
                  <span key={term} className="search-page-chip" role="button" tabIndex={0}
                        onClick={() => runQuery(term)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runQuery(term); }
                        }}>
                    {term}
                    <span
                      className="search-page-chip-x"
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove ${term}`}
                      onClick={(e) => { e.stopPropagation(); setRecent(removeRecent(term)); }}
                    >
                      ×
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {topSearches.length > 0 && (
            <section className="search-page-section">
              <div className="search-page-section-head"><h2>Top searches</h2></div>
              <div className="search-page-chips">
                {topSearches.map(item => {
                  const label = item.title || item.name;
                  return (
                    <button key={`${item.media_type}-${item.id}`} className="search-page-chip"
                            onClick={() => runQuery(label)}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      ) : (
        <DiscoverGrid
          items={feed.items}
          enrichedMap={NO_ENRICHMENT}
          mediaType="movie"           /* fallback only; each item carries its own */
          loading={feed.loading}
          error={feed.error}
          emptyMessage={`No results for "${urlQuery}". Try a different spelling.`}
          isFetchingMore={feed.isFetchingMore}
          sentinelRef={feed.sentinelRef}
          canLoadMore={feed.canLoadMore}
          onItemClick={handleItemClick}
          gridClassName="search-results-grid"
        />
      )}

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default Search;
