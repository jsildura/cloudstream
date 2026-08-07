import { useState, useEffect, useRef, useCallback } from 'react';

// TMDB refuses `page` above 500 regardless of what `total_pages` reports.
const MAX_TMDB_PAGE = 500;

// A /search/multi page is 20 mixed items INCLUDING people. Once people are
// dropped a page can yield 2-3 tiles, which leaves the scroll sentinel on
// screen and fires another fetch immediately. When a page comes back this
// thin, top it up once inside the same operation.
const THIN_PAGE = 10;
const MAX_PAGES_PER_LOAD = 2;

// Person mode swaps the grid for the person's full filmography. Cap keeps the
// grid sane and bounds enrichment cost.
const PERSON_FILMOGRAPHY_CAP = 80;

// In person mode only the first screenful of cards gets logo enrichment — the
// visible rows get logos, the rest keep the title-overlay fallback. Combined
// with the pe| LRU cache below, repeat person searches cost ~0 requests.
const ENRICH_PERSON_CAP = 24;

const ENRICH_CONCURRENCY = 6;
const ENRICH_ATTEMPTS = 2;
const ENRICH_RETRY_BASE_MS = 150;
const ENRICH_MAX_PASSES = 2;

const isPlayable = (item) =>
  item.media_type === 'movie' || item.media_type === 'tv';

// Movie 123 and TV 123 are different titles, so the dedupe key needs both.
const keyOf = (item) => `${item.media_type}-${item.id}`;

// Exact-name person match: "Tom Cruise" and "tom   cruise" both normalize to
// "tom cruise". No fuzzy matching — "tom c" must NOT trigger person mode.
const normalizePersonName = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

// In-memory LRU cache: "query|page" -> the exact shape the fetch loop consumes.
// Re-running a recent query renders straight from here. Bounded at 60 entries
// so it can never grow without limit. Only successful responses are stored —
// errors and aborts never enter the map, so a failed query retries normally.
const CACHE_LIMIT = 60;
const cache = new Map(); // insertion order doubles as LRU order

const cacheGet = (key) => {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value); // re-insert = mark as most recently used
  return value;
};

const cacheSet = (key, value) => {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value); // evict the oldest
  }
};

/**
 * Paginated TMDB multi-search with abort + out-of-order protection.
 *
 * @param {string} query Already debounced by the caller. Empty string resets.
 */
export function useSearchFeed(query, genreQuery = null) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [people, setPeople] = useState([]);

  // Person mode: { id, name } when the query resolved to a person; null otherwise.
  const [personMode, setPersonMode] = useState(null);

  // Person mode: logo enrichment is chunked. Only the first ENRICH_PERSON_CAP
  // cards are enriched up front; scrolling the grid bottom bumps this count in
  // chunks so every filmography card eventually gets a logo without firing ~80
  // billable /images requests at once.
  const [personEnrichCount, setPersonEnrichCount] = useState(ENRICH_PERSON_CAP);
  const personSentinelRef = useRef(null);

  // True while a NEW query is loading but we still have old results on screen.
  // The page uses this to dim the grid instead of blanking it.
  const [isRefreshing, setIsRefreshing] = useState(false);

  // A ref, not state, on purpose: fetchPage needs to read "do we currently have
  // results?" without re-creating itself every time `items` changes.
  const hasItemsRef = useRef(false);

  const sentinelRef = useRef(null);
  const abortRef = useRef(null);
  // Bumped on every request. A response whose generation is stale gets
  // discarded — this is what stops a slow "a" from overwriting a fast "az".
  const generationRef = useRef(0);

  // Genre-mode: one cursor per discover source (movie, tv, or both)
  const sourcesRef = useRef([]);

  // Title-logo enrichment, mirroring useDiscoverFeed. Keyed by
  // "mediaType-id", never bare id: /search/multi mixes movies and TV in one
  // list, and movie 123 is a different title from tv 123.
  const [enrichedMap, setEnrichedMap] = useState(new Map());
  const enrichedMapRef = useRef(new Map());
  const enrichInFlightRef = useRef(new Set());
  const enrichFailuresRef = useRef(new Map());

  // ─── Person-mode filmography ──────────────────────────────────────
  // /person/{id}/combined_credits is unpaginated and complete. Build the same
  // deduped, date-sorted list PersonPage uses, stamped with media_type.
  const loadCombinedCredits = useCallback(async (personId, signal) => {
    const cacheKey = `pc|${personId}`;
    let data = cacheGet(cacheKey);

    if (!data) {
      const res = await fetch(`/api/person/${personId}/combined_credits`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();

      // Same dedup + sort logic as PersonPage.jsx:
      // Cast entries win over crew (if someone acts in AND directs a title,
      // the cast entry is kept because it has the character name).
      const seen = new Map();  // "media_type-id" → item
      for (const item of (raw.cast || [])) {
        const type = item.media_type || 'movie';
        const key = `${type}-${item.id}`;
        if (!seen.has(key)) {
          seen.set(key, {
            ...item,
            media_type: type,
            _sortDate: item.release_date || item.first_air_date || ''
          });
        }
      }
      for (const item of (raw.crew || [])) {
        const type = item.media_type || 'movie';
        const key = `${type}-${item.id}`;
        if (!seen.has(key)) {
          seen.set(key, {
            ...item,
            media_type: type,
            _sortDate: item.release_date || item.first_air_date || ''
          });
        }
      }

      const results = [...seen.values()]
        .sort((a, b) => {
          // Titles WITH a date sort before titles without
          if (a._sortDate && !b._sortDate) return -1;
          if (!a._sortDate && b._sortDate) return 1;
          // Among dated titles, newest first
          return b._sortDate.localeCompare(a._sortDate);
        })
        .slice(0, PERSON_FILMOGRAPHY_CAP);

      // Cache in the same shape every consumer reads:
      // { results, people, total_pages, total_results }
      data = {
        results,
        people: [],
        total_pages: 1,
        total_results: results.length
      };
      cacheSet(cacheKey, data);
    }

    return data;
  }, []);

  const fetchPage = useCallback(async (page, append) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    if (append) {
      setIsFetchingMore(true);
    } else {
      // Stale-while-revalidate: only show skeletons on a cold grid. If results
      // are already on screen, keep them and just dim — blanking the grid on
      // every keystroke pause is what made search feel slow.
      setLoading(!hasItemsRef.current);
      setIsRefreshing(hasItemsRef.current);
      setError(null);
    }

    try {
      const collected = [];
      const collectedPeople = [];
      let pageCursor = page;

      for (let attempt = 0; attempt < MAX_PAGES_PER_LOAD; attempt++) {
        const cacheKey = `${trimmed}|${pageCursor}`;
        let pageData = cacheGet(cacheKey);

        if (!pageData) {
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

          const media = [];
          const personResults = [];
          for (const r of (data.results || [])) {
            if (r.media_type === 'person') personResults.push(r);
            else if (isPlayable(r)) media.push(r);
          }
          pageData = {
            results: media,
            people: personResults,
            total_pages: data.total_pages || 1,
            total_results: data.total_results || 0
          };
          cacheSet(cacheKey, pageData);
        }

        collected.push(...pageData.results);
        if (pageData.people) collectedPeople.push(...pageData.people);

        const cap = Math.min(pageData.total_pages, MAX_TMDB_PAGE);
        setTotalPages(cap);
        setTotalResults(pageData.total_results);

        // Enough to fill a screen, or nothing left to ask for.
        if (collected.length >= THIN_PAGE || pageCursor >= cap) break;
        pageCursor += 1;
      }

      setCurrentPage(pageCursor);

      if (append) {
        setItems(prev => {
          const seen = new Set(prev.map(keyOf));
          const next = [...prev, ...collected.filter(i => !seen.has(keyOf(i)))];
          hasItemsRef.current = next.length > 0;
          return next;
        });
        // Append-mode: merge new people, deduplicate by keyOf
        setPeople(prev => {
          const seen = new Set(prev.map(keyOf));
          return [...prev, ...collectedPeople.filter(p => !seen.has(keyOf(p)))];
        });
      } else {
        // ─── Person-intent decision ───────────────────────────────────
        // Derived from page 1 of THIS multi response (zero extra requests).
        // First person entry whose normalized name equals the query →
        // the grid becomes that person's filmography.
        // Page 1 was just fetched + cached by this operation (non-append
        // always starts at page 1), so it is guaranteed present here.
        const p1 = cacheGet(`${trimmed}|1`);                // LRU touch is fine
        const topPerson = (p1 && p1.people) ? p1.people[0] : null;
        const personMatch = topPerson &&
          normalizePersonName(topPerson.name) === normalizePersonName(trimmed);

        if (personMatch) {
          // PERSON MODE: swap grid contents with filmography. personMode is
          // set AFTER the generation guard so a superseded fetch can never
          // leave a stale person header over the wrong items.
          const creds = await loadCombinedCredits(topPerson.id, controller.signal);
          // Superseded while awaiting — another query came in, drop this.
          if (generation !== generationRef.current) return;
          setPersonMode({ id: topPerson.id, name: topPerson.name });
          setPersonEnrichCount(ENRICH_PERSON_CAP);   // restart the logo chunks
          setItems(creds.results);
          hasItemsRef.current = creds.results.length > 0;
          setTotalResults(creds.total_results);
          setTotalPages(1);       // filmography is one complete payload
          setCurrentPage(1);
          // Strip still shows the ranked people from multi (incl. the match).
          setPeople(collectedPeople);
        } else {
          // NORMAL TEXT MODE: unchanged behavior
          setPersonMode(null);
          setItems(collected);
          hasItemsRef.current = collected.length > 0;
          setPeople(collectedPeople);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (generation !== generationRef.current) return;
      console.error('Search failed:', err);
      if (!append) {
        setItems([]);
        hasItemsRef.current = false;
        setPersonMode(null);   // never linger a person header over an error
        setTotalResults(0);
        setError('We could not run that search. Please try again.');
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    }
  }, [query, loadCombinedCredits]);

  // ─── Genre-mode fetch ──────────────────────────────────────────────
  const fetchGenrePage = useCallback(async (append) => {
    if (!genreQuery || !genreQuery.entries || genreQuery.entries.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    if (append) {
      setIsFetchingMore(true);
    } else {
      setLoading(!hasItemsRef.current);
      setIsRefreshing(hasItemsRef.current);
      setError(null);
      // Initialize per-source cursors on first load
      sourcesRef.current = genreQuery.entries.map(e => ({
        ...e,
        page: 1,
        totalPages: 1,
        done: false
      }));
    }

    try {
      const allResults = [];

      // Fan out: one /discover call per source (e.g. movie + tv for "Comedy")
      for (const source of sourcesRef.current) {
        if (source.done) continue;

        // Namespace by media AND param: same id on with_genres vs with_keywords
        // must never share a cache entry (e.g. a future keyword id equal to a
        // genre id would otherwise serve the wrong catalogue).
        const cacheKey = `g${source.media[0]}|${source.param}:${source.id}|${source.page}`;
        let pageData = cacheGet(cacheKey);

        if (!pageData) {
          const url = new URL(`/api/discover/${source.media}`, window.location.origin);
          url.searchParams.set(source.param, String(source.id));
          url.searchParams.set('include_adult', 'false');
          url.searchParams.set('language', 'en-US');
          url.searchParams.set('sort_by', 'popularity.desc');
          url.searchParams.set('page', String(source.page));

          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          if (generation !== generationRef.current) return;

          // CRITICAL: stamp media_type — discover results do NOT carry it
          pageData = {
            results: (data.results || []).map(r => ({ ...r, media_type: source.media })),
            people: [],
            total_pages: data.total_pages || 1,
            total_results: data.total_results || 0
          };
          cacheSet(cacheKey, pageData);
        }

        source.totalPages = Math.min(pageData.total_pages, MAX_TMDB_PAGE);
        allResults.push(...pageData.results);

        // Advance cursor for next time
        if (source.page >= source.totalPages) {
          source.done = true;
        } else {
          source.page += 1;
        }
      }

      // Update totals (rough estimate from the first source)
      const activeSources = sourcesRef.current.filter(s => !s.done);
      setTotalPages(activeSources.length > 0 ? Math.max(...sourcesRef.current.map(s => s.totalPages)) : 1);
      setTotalResults(allResults.length);

      if (append) {
        setItems(prev => {
          const seen = new Set(prev.map(keyOf));
          const next = [...prev, ...allResults.filter(i => !seen.has(keyOf(i)))];
          hasItemsRef.current = next.length > 0;
          return next;
        });
      } else {
        setItems(allResults);
        hasItemsRef.current = allResults.length > 0;
      }

      // Genre mode never has people
      setPeople([]);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (generation !== generationRef.current) return;
      console.error('Genre search failed:', err);
      if (!append) {
        setItems([]);
        hasItemsRef.current = false;
        setError('Could not load genre results. Please try again.');
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    }
  }, [genreQuery]);

  const isGenre = !!(genreQuery && genreQuery.entries && genreQuery.entries.length);

  // New query → reset and fetch page 1. Empty query → clear, fetch nothing.
  useEffect(() => {
    if (!query.trim()) {
      abortRef.current?.abort();
      generationRef.current++;
      setItems([]);
      setPeople([]);
      setPersonMode(null);     // clear person mode on empty
      hasItemsRef.current = false;
      setError(null);
      setLoading(false);
      setIsRefreshing(false);
      setCurrentPage(1);
      setTotalPages(1);
      setTotalResults(0);
      return;
    }
    if (isGenre) {
      setPersonMode(null);     // genre wins over person
      setPeople([]);
      fetchGenrePage(false);
      return;
    }
    setPeople([]);
    fetchPage(1, false);      // normal text search
  }, [query, fetchPage, isGenre, fetchGenrePage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // A new query throws away the old enrichment bookkeeping. The map itself is
  // rebuilt from scratch so results from the previous query can never leak a
  // logo onto a same-id title of the other media type.
  useEffect(() => {
    enrichedMapRef.current = new Map();
    enrichInFlightRef.current = new Set();
    enrichFailuresRef.current = new Map();
    setEnrichedMap(new Map());
  }, [query]);

  // Title-logo enrichment. /search/multi carries backdrop_path but no logos,
  // so each card starts with its text overlay and swaps to the logo once this
  // resolves. Same chunk-claiming discipline as useDiscoverFeed: ids are
  // claimed synchronously per chunk, so a cancelled run strands nothing.
  useEffect(() => {
    // Person mode: clear the previous query's enrichment, then enrich only the
    // first screenful of the filmography (ENRICH_PERSON_CAP). Logos appear on
    // the visible cards; the rest keep the title-overlay fallback. Enrich
    // results are also cached in the shared LRU (pe| key) so a repeat person
    // search reuses them instead of firing ~24 billable /images requests again.
    if (personMode) {
      enrichedMapRef.current = new Map();
      enrichInFlightRef.current = new Set();
      enrichFailuresRef.current = new Map();
      setEnrichedMap(new Map());
    }
    let isCancelled = false;

    const enrichOne = async (item) => {
      const key = keyOf(item);
      const type = item.media_type;
      try {
        let imagesData = null;
        let lastError = null;

        for (let attempt = 0; attempt < ENRICH_ATTEMPTS; attempt++) {
          if (isCancelled) return;
          try {
            const response = await fetch(`/api/${type}/${item.id}/images`);
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
        const value = {
          logo_path: englishLogo?.file_path || null,
          backdrop_path: backdrop || item.poster_path || null
        };

        enrichFailuresRef.current.delete(key);
        enrichedMapRef.current.set(key, value);
        // Cache the result so repeat person searches don't re-fetch it.
        cacheSet(`pe|${key}`, value);
      } catch {
        const failures = (enrichFailuresRef.current.get(key) || 0) + 1;
        enrichFailuresRef.current.set(key, failures);
        if (failures >= ENRICH_MAX_PASSES) {
          const fallback = {
            logo_path: null,
            backdrop_path: item.backdrop_path || item.poster_path || null
          };
          enrichedMapRef.current.set(key, fallback);
          cacheSet(`pe|${key}`, fallback);   // don't refire failed lookups
        }
      } finally {
        enrichInFlightRef.current.delete(key);
      }
    };

    const enrichNewItems = async () => {
      // Person mode: enrich up to personEnrichCount cards (chunked by the
      // scroll sentinel); text mode enriches everything.
      const source = personMode ? items.slice(0, personEnrichCount) : items;

      // Seed from the LRU cache first — repeat searches render logos instantly
      // with zero requests. pe| entries are plain {logo_path, backdrop_path}
      // objects, never page payloads, so they can't collide with page keys.
      let changed = false;
      const pending = [];
      for (const item of source) {
        const key = keyOf(item);
        if (enrichedMapRef.current.has(key)) continue;
        const cached = cacheGet(`pe|${key}`);
        if (cached) {
          enrichedMapRef.current.set(key, cached);
          changed = true;
        } else {
          pending.push(item);
        }
      }
      if (changed) setEnrichedMap(new Map(enrichedMapRef.current));

      const newItems = pending.filter(item => !enrichInFlightRef.current.has(keyOf(item)));
      if (newItems.length === 0) return;

      for (let i = 0; i < newItems.length; i += ENRICH_CONCURRENCY) {
        const chunk = newItems.slice(i, i + ENRICH_CONCURRENCY);
        chunk.forEach(item => enrichInFlightRef.current.add(keyOf(item)));
        await Promise.all(chunk.map(enrichOne));
        setEnrichedMap(new Map(enrichedMapRef.current));
        if (isCancelled) return;
      }
    };

    enrichNewItems();
    return () => { isCancelled = true; };
  }, [items, personMode, personEnrichCount]);

  // Person mode: lazy-enrich sentinel. Search.jsx renders a keyed spacer after
  // the grid; each bump re-observes it, and if it's still in view the next
  // enrichment chunk fires. Converges at items.length (spacer unmounts then).
  useEffect(() => {
    if (!personMode) return;
    const el = personSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPersonEnrichCount(c => Math.min(items.length, c + ENRICH_PERSON_CAP));
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [personMode, personEnrichCount, items]);

  const canLoadMore = personMode
    ? false
    : isGenre
      ? sourcesRef.current.some(s => !s.done)
      : currentPage < totalPages;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || isFetchingMore || loading || !canLoadMore) return;
        if (personMode) return;     // filmography is complete, nothing to page
        if (isGenre) {
          fetchGenrePage(true);
        } else {
          fetchPage(currentPage + 1, true);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFetchingMore, loading, canLoadMore, currentPage, fetchPage, isGenre, fetchGenrePage, personMode]);

  return {
    items,
    people,
    personMode,
    personEnrichCount,
    personSentinelRef,
    enrichedMap,
    loading,
    isRefreshing,
    isFetchingMore,
    error,
    canLoadMore,
    sentinelRef,
    totalResults
  };
}
