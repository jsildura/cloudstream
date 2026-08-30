import { useEffect, useRef, useState } from 'react';
import { tmdbJson } from '../lib/tmdbClient';

/**
 * Fetches one representative backdrop path per genre/keyword category, for the
 * card-style discover filter pills (see MovieDiscoverFilterBar / TVDiscoverFilterBar
 * `variant="cards"`).
 *
 * For each category it runs a popularity-sorted /discover query filtered to that
 * single genre (or keyword) and takes the first result that actually has a
 * backdrop. Results fill in progressively as each request resolves.
 *
 * Caching is two-layered so this stays cheap: a local ref map means a category is
 * never re-queried once resolved (even across breakpoint-driven re-renders that
 * change which categories are visible), and `tmdbJson`'s own namespaced 10-minute
 * cache dedups across component mounts / page revisits.
 *
 * @param {Array<{key:string,id:number,param:'with_genres'|'with_keywords'}>} categories
 * @param {'movie'|'tv'} mediaType
 * @param {boolean} [enabled=true] - when false, no requests run (plain text-pill mode)
 * @returns {Object<string, string|null>} map of category.key -> backdrop_path | null
 */
export default function useGenreBackdrops(categories, mediaType, enabled = true) {
  const [backdrops, setBackdrops] = useState({});
  // key -> backdrop_path | null once a request has settled. Prevents re-querying
  // a category whose lookup already completed (success OR "no backdrop found").
  const resolvedRef = useRef({});

  // Stable dependency: the set of category keys currently on screen. `categories`
  // is a fresh array every render, so keying the effect on its identity would
  // refetch on every render — join the keys into a string instead.
  const categoryKeys = enabled ? categories.map((c) => c.key).join('|') : '';

  useEffect(() => {
    if (!enabled || categories.length === 0) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    // Only query categories we haven't already resolved.
    const pending = categories.filter((c) => !(c.key in resolvedRef.current));

    pending.forEach(async (category) => {
      try {
        const data = await tmdbJson(`/discover/${mediaType}`, {
          params: {
            [category.param]: category.id,
            sort_by: 'popularity.desc',
            page: 1,
          },
          signal: controller.signal,
          cacheNamespace: 'genre_backdrops',
        });
        const path =
          (data?.results || []).find((r) => r.backdrop_path)?.backdrop_path ?? null;
        if (cancelled) return;
        resolvedRef.current[category.key] = path;
        setBackdrops((prev) => ({ ...prev, [category.key]: path }));
      } catch (err) {
        // Abort (unmount / key change) is expected; anything else we simply leave
        // unresolved so a later mount can retry and the pill falls back to text.
        if (err?.name === 'AbortError' || cancelled) return;
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKeys, mediaType, enabled]);

  return backdrops;
}
