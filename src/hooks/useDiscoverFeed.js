import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// TMDB refuses `page` above 500 regardless of what `total_pages` reports.
const MAX_TMDB_PAGE = 500;
// Cap on parallel /images requests so a fast scroll can't open 100 sockets.
const ENRICH_CONCURRENCY = 8;
// /images is the flakiest call on the page: a fast scroll puts dozens in flight
// and TMDB drops some. Retry within a request before giving up on it.
const ENRICH_ATTEMPTS = 3;
const ENRICH_RETRY_BASE_MS = 250;
// How many separate passes an item gets before the grid stops asking. Without a
// cap, an id that always fails would be retried on every append for the session.
const ENRICH_MAX_PASSES = 3;
export const SKELETON_COUNT = 12;
// How many cards each scroll-to-bottom reveals. TMDB's page size is fixed at 20
// and is not configurable, so a fetch fills a 20-item pool and the grid renders
// half of it. The next scroll reveals the remainder straight from the pool with
// no request; only the scroll after that goes back to the network. Images for
// the buffered half are enriched on arrival, so it is already warm when shown.
export const REVEAL_STEP = 10;

export function useDiscoverFeed({ mediaType, filters, extraParams }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  // How many of the fetched pool are on screen. Grows a REVEAL_STEP at a time so
  // a 20-item TMDB page lands as two scrolls.
  const [visibleCount, setVisibleCount] = useState(REVEAL_STEP);

  const sentinelRef = useRef(null);
  const enrichedMapRef = useRef(new Map());
  const enrichInFlightRef = useRef(new Set());
  // Failure count per id, so a transient /images error is retried on the next
  // pass instead of being cached as "this title has no logo" forever.
  const enrichFailuresRef = useRef(new Map());
  const [enrichedMap, setEnrichedMap] = useState(new Map());

  // Guards against a filter change landing while an append fetch is in flight:
  // `generationRef` invalidates any response that is no longer the newest one.
  const abortRef = useRef(null);
  const generationRef = useRef(0);

  useEffect(() => {
    setItems([]);
    setVisibleCount(REVEAL_STEP);
    setLoading(true);
    enrichedMapRef.current.clear();
    enrichInFlightRef.current.clear();
    enrichFailuresRef.current.clear();
    setEnrichedMap(new Map());
  }, [mediaType]);

  const fetchItems = useCallback(async (page = 1, append = false) => {
    // Supersede whatever is in flight; its response must not be applied.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    if (append) {
      setIsFetchingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const url = new URL(`/api/discover/${mediaType}`, window.location.origin);
      const scopedExtra = extraParams && typeof extraParams === 'object' && !Array.isArray(extraParams)
        && (mediaType in extraParams) ? extraParams[mediaType] : extraParams;
      Object.entries({ ...filters, ...scopedExtra, page }).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        }
      });

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (generation !== generationRef.current) return;

      const newResults = data.results || [];
      setTotalPages(Math.min(data.total_pages || 1, MAX_TMDB_PAGE));
      setTotalResults(data.total_results || 0);
      setCurrentPage(page);

      if (append) {
        setItems(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const merged = [...prev, ...newResults.filter(s => !existingIds.has(s.id))];
          // Reveal one step into the pool we just grew, clamped to what actually
          // arrived: TMDB pages can overlap, so dedupe may yield fewer than
          // REVEAL_STEP new items and visibleCount must not outrun the array.
          setVisibleCount(v => Math.min(v + REVEAL_STEP, merged.length));
          return merged;
        });
      } else {
        setItems(newResults);
        // First page: show only the first batch; the buffered half stays hidden
        // until the user scrolls.
        setVisibleCount(REVEAL_STEP);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (generation !== generationRef.current) return;
      console.error(`Failed to fetch ${mediaType}s:`, err);
      if (!append) {
        setItems([]);
        setError(`We could not load ${mediaType === 'movie' ? 'movies' : 'TV shows'} right now. Please try again.`);
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setIsFetchingMore(false);
      }
    }
  }, [mediaType, filters, extraParams]);

  useEffect(() => {
    fetchItems(1, false);
  }, [fetchItems]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Logo/backdrop enrichment. Each chunk's IDs are claimed synchronously in
  // `enrichInFlightRef` before its first await, otherwise a page append that
  // re-runs this effect would re-request every item still in flight.
  useEffect(() => {
    let isCancelled = false;

    const enrichOne = async (item) => {
      try {
        let imagesData = null;
        let lastError = null;

        // Retry transient failures. Without this a dropped request is cached as
        // `logo_path: null` and the card keeps its text overlay for good.
        for (let attempt = 0; attempt < ENRICH_ATTEMPTS; attempt++) {
          if (isCancelled) return;
          try {
            const response = await fetch(`/api/${mediaType}/${item.id}/images`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            imagesData = await response.json();
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            if (attempt < ENRICH_ATTEMPTS - 1) {
              await new Promise(r => setTimeout(r, ENRICH_RETRY_BASE_MS * (attempt + 1)));
            }
          }
        }

        if (isCancelled) return;
        if (lastError) throw lastError;

        const logos = imagesData.logos || [];
        const englishLogo = logos.find(l => l.iso_639_1 === 'en') || logos[0];
        const backdrop = item.backdrop_path || imagesData.backdrops?.[0]?.file_path;

        enrichFailuresRef.current.delete(item.id);
        enrichedMapRef.current.set(item.id, {
          logo_path: englishLogo?.file_path || null,
          backdrop_path: backdrop || item.poster_path || null
        });
      } catch {
        // Record a backdrop so the card still renders, but only commit to the
        // map — which is what stops future passes — once we have exhausted the
        // retries. Until then the id stays eligible for the next append.
        const failures = (enrichFailuresRef.current.get(item.id) || 0) + 1;
        enrichFailuresRef.current.set(item.id, failures);
        if (failures >= ENRICH_MAX_PASSES) {
          enrichedMapRef.current.set(item.id, {
            logo_path: null,
            backdrop_path: item.backdrop_path || item.poster_path || null
          });
        }
      } finally {
        enrichInFlightRef.current.delete(item.id);
      }
    };

    const enrichNewItems = async () => {
      const newItems = items.filter(item =>
        !enrichedMapRef.current.has(item.id) && !enrichInFlightRef.current.has(item.id)
      );
      if (newItems.length === 0) return;

      // Claim only the chunk being worked on. Claiming all of them up front
      // strands every unprocessed id when a `items` change cancels this run
      // mid-loop: nothing releases the claim, so the filter above skips those
      // ids forever and their cards keep the text overlay. Rapid scrolling
      // appends — and therefore cancels — constantly, which is when it showed.
      // Claiming per chunk means a cancel leaves nothing behind: the chunk in
      // hand is released by enrichOne, and later chunks were never claimed.
      for (let i = 0; i < newItems.length; i += ENRICH_CONCURRENCY) {
        const chunk = newItems.slice(i, i + ENRICH_CONCURRENCY);
        chunk.forEach(item => enrichInFlightRef.current.add(item.id));
        await Promise.all(chunk.map(enrichOne));
        // Publish before the cancel check: this chunk's results are already in
        // the ref, and a superseding run may early-return without ever flushing
        // them. The map is keyed by id and only grows, so there is no staleness
        // hazard in a cancelled run committing what it finished.
        setEnrichedMap(new Map(enrichedMapRef.current));
        if (isCancelled) return;
      }
    };

    enrichNewItems();

    return () => {
      isCancelled = true;
    };
  }, [items, mediaType]);

  const hasMorePages = currentPage < totalPages;
  // What the grid actually renders: the revealed slice of the fetched pool.
  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );
  // Items already fetched but not yet revealed — the next scroll is free.
  const hasBufferedItems = visibleCount < items.length;
  const canLoadMore = hasBufferedItems || hasMorePages;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || isFetchingMore || loading) return;
        if (hasBufferedItems) {
          // Second half of an already-fetched page: reveal it without a request.
          setVisibleCount(prev => Math.min(prev + REVEAL_STEP, items.length));
        } else if (hasMorePages) {
          fetchItems(currentPage + 1, true);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFetchingMore, loading, hasMorePages, hasBufferedItems, items.length, currentPage, fetchItems]);

  return {
    items,
    visibleItems,
    enrichedMap,
    loading,
    isFetchingMore,
    error,
    canLoadMore,
    sentinelRef,
    totalResults
  };
}
