import { useState, useEffect, useRef, useCallback } from 'react';

// TMDB refuses `page` above 500 regardless of what `total_pages` reports.
const MAX_TMDB_PAGE = 500;

// No skeleton-count export here: DiscoverGrid takes its own from
// useDiscoverFeed's SKELETON_COUNT, so search inherits 12 automatically.

// A /search/multi page is 20 mixed items INCLUDING people. Once people are
// dropped a page can yield 2-3 tiles, which leaves the scroll sentinel on
// screen and fires another fetch immediately. When a page comes back this
// thin, top it up once inside the same operation. See plan section 4.5.
const THIN_PAGE = 10;
const MAX_PAGES_PER_LOAD = 2;

const isPlayable = (item) =>
  item.media_type === 'movie' || item.media_type === 'tv';

// Movie 123 and TV 123 are different titles, so the dedupe key needs both.
const keyOf = (item) => `${item.media_type}-${item.id}`;

/**
 * Paginated TMDB multi-search with abort + out-of-order protection.
 *
 * @param {string} query Already debounced by the caller. Empty string resets.
 */
export function useSearchFeed(query) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  const sentinelRef = useRef(null);
  const abortRef = useRef(null);
  // Bumped on every request. A response whose generation is stale gets
  // discarded — this is what stops a slow "a" from overwriting a fast "az".
  const generationRef = useRef(0);

  const fetchPage = useCallback(async (page, append) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    if (append) setIsFetchingMore(true);
    else { setLoading(true); setError(null); }

    try {
      const collected = [];
      let pageCursor = page;

      for (let attempt = 0; attempt < MAX_PAGES_PER_LOAD; attempt++) {
        const url = new URL('/api/search/multi', window.location.origin);
        url.searchParams.set('query', trimmed);
        url.searchParams.set('include_adult', 'false');
        url.searchParams.set('language', 'en-US');
        url.searchParams.set('page', String(pageCursor));

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Superseded while awaiting — drop it on the floor.
        if (generation !== generationRef.current) return;

        collected.push(...(data.results || []).filter(isPlayable));

        const cap = Math.min(data.total_pages || 1, MAX_TMDB_PAGE);
        setTotalPages(cap);
        setTotalResults(data.total_results || 0);

        // Enough to fill a screen, or nothing left to ask for.
        if (collected.length >= THIN_PAGE || pageCursor >= cap) break;
        pageCursor += 1;
      }

      setCurrentPage(pageCursor);

      if (append) {
        setItems(prev => {
          const seen = new Set(prev.map(keyOf));
          return [...prev, ...collected.filter(i => !seen.has(keyOf(i)))];
        });
      } else {
        setItems(collected);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (generation !== generationRef.current) return;
      console.error('Search failed:', err);
      if (!append) {
        setItems([]);
        setError('We could not run that search. Please try again.');
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setIsFetchingMore(false);
      }
    }
  }, [query]);

  // New query → reset and fetch page 1. Empty query → clear, fetch nothing.
  useEffect(() => {
    if (!query.trim()) {
      abortRef.current?.abort();
      generationRef.current++;      // invalidate anything still in flight
      setItems([]);
      setError(null);
      setLoading(false);
      setCurrentPage(1);
      setTotalPages(1);
      setTotalResults(0);
      return;
    }
    fetchPage(1, false);
  }, [query, fetchPage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canLoadMore = currentPage < totalPages;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || isFetchingMore || loading || !canLoadMore) return;
        fetchPage(currentPage + 1, true);
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFetchingMore, loading, canLoadMore, currentPage, fetchPage]);

  return {
    items,
    loading,
    isFetchingMore,
    error,
    canLoadMore,
    sentinelRef,
    totalResults
  };
}
