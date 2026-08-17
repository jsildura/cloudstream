import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import MetaTags from '../components/MetaTags';
import DiscoverGrid from '../components/DiscoverGrid';
import { useTMDB } from '../hooks/useTMDB';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { useProfiles } from '../contexts/ProfileContext';
import { useSearchFeed } from '../hooks/useSearchFeed';
import { filterKidsCandidates } from '../lib/tmdbClient';
import { resolveGenreQuery } from '../constants/genres';
import PeopleStrip from '../components/PeopleStrip';
import '../components/TrendingSection.css';
import './Search.css';

const DEBOUNCE_MS = 350;   // was 250. Keep in lockstep with Navbar.jsx
// Must match Navbar.jsx and the desktop @media blocks in components.css /
// Search.css exactly. See plan section 2.
const DESKTOP_SEARCH_MQ = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';
const MAX_TOP_SEARCHES = 10;

const Search = () => {
  const { isKidsMode } = useProfiles();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // `urlQuery` is the source of truth and what we actually search.
  // `input` is what the user sees; it flows into the URL after a debounce.
  const urlQuery = searchParams.get('q') || '';
  const [input, setInput] = useState(urlQuery);

  const [topSearches, setTopSearches] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const inputRef = useRef(null);

  const { movieGenres, tvGenres } = useTMDB();
  const { closeNow } = useHoverPreview();

  // Check if the query matches a genre name (e.g. "Action" → genre 28)
  const genreQuery = useMemo(() => resolveGenreQuery(urlQuery), [urlQuery]);
  const feed = useSearchFeed(urlQuery, genreQuery);

  // On desktop the page input is display:none and the navbar input has focus
  // instead, so focusing this would silently drop focus to <body>.
  useEffect(() => {
    if (!window.matchMedia(DESKTOP_SEARCH_MQ).matches) {
      inputRef.current?.focus();
    }
  }, []);

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
        let results = (data.results || []).filter(i => i.title || i.name);
        if (isKidsMode) {
          results = await filterKidsCandidates(results, { maxCandidates: 20 });
        }
        if (cancelled) return;
        setTopSearches(results.slice(0, MAX_TOP_SEARCHES));
      } catch {
        // Empty state just renders without this section.
      }
    })();
    return () => { cancelled = true; };
  }, [isKidsMode]);

  const runQuery = useCallback((q) => {
    setInput(q);
    setSearchParams({ q }, { replace: true });
    if (!window.matchMedia(DESKTOP_SEARCH_MQ).matches) {
      inputRef.current?.focus();
    }
  }, [setSearchParams]);

  const handleItemClick = useCallback((item) => {
    closeNow();
    const type = item.media_type === 'movie' ? 'movie' : 'tv';
    const genreMap = type === 'movie' ? movieGenres : tvGenres;
    const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

    // Modal lazily loads cast + contentRating itself, so open immediately.
    setSelectedItem({ ...item, type, media_type: type, genres: genreNames });
    setIsModalOpen(true);
  }, [closeNow, movieGenres, tvGenres]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const handlePersonClick = useCallback((person) => {
    closeNow();
    navigate(`/person/${person.id}`);
  }, [closeNow, navigate]);

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
          placeholder="Titles, people, genres..."
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

      {topSearches.length > 0 && (
        <section className="search-page-section">
          {/* Inline list, not chips: "Top Searches: a | b | c". The
              separators are decorative, so they sit outside the buttons. */}
          <p className="search-page-top">
            <span className="search-page-top-label">Top Searches:</span>
            {topSearches.map((item, i) => {
              const label = item.title || item.name;
              return (
                <React.Fragment key={`${item.media_type}-${item.id}`}>
                  {i > 0 && <span className="search-page-top-sep" aria-hidden="true">|</span>}
                  <button className="search-page-top-link" onClick={() => runQuery(label)}>
                    {label}
                  </button>
                </React.Fragment>
              );
            })}
          </p>
        </section>
      )}

      {!showEmptyState && (
        <>
          {/* People strip: horizontal row of person cards above the grid */}
          {feed.people && feed.people.length > 0 && (
            <PeopleStrip people={feed.people} onSelect={handlePersonClick} />
          )}

          <DiscoverGrid
            items={feed.items}
            enrichedMap={feed.enrichedMap}
            mediaType="movie"
            loading={feed.loading}
            error={feed.error}
            emptyMessage={
              feed.personMode
                ? `No content found for ${feed.personMode.name}.`
                : genreQuery
                  ? `No titles in the ${genreQuery.displayName} category were found.`
                  : feed.people && feed.people.length > 0
                    ? `No titles found for "${urlQuery}", but check the people above.`
                    : `No results for "${urlQuery}". Try a different spelling.`
            }
            isFetchingMore={feed.isFetchingMore}
            sentinelRef={feed.sentinelRef}
            canLoadMore={feed.canLoadMore}
            onItemClick={handleItemClick}
            gridClassName={`search-results-grid ${feed.isRefreshing ? 'is-refreshing' : ''}`}
            variant="search"
          />

          {/* Lazy-enrich sentinel: while person-mode cards below the current
              logo chunk remain, bump the chunk as the user scrolls. Keyed so
              every bump re-observes and re-fires while in view. */}
          {feed.personMode && feed.personEnrichCount < feed.items.length && (
            <div
              key={feed.personEnrichCount}
              ref={feed.personSentinelRef}
              className="person-enrich-sentinel"
              aria-hidden="true"
            />
          )}
        </>
      )}

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default Search;
