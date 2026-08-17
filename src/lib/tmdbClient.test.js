import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSortedQueryUrl,
  clearTmdbCache,
  tmdbJson,
  getKidsRating,
  filterKidsCandidates
} from './tmdbClient';

describe('TMDB Client & Bounded Hydration', () => {
  beforeEach(() => {
    clearTmdbCache();
    vi.restoreAllMocks();
  });

  describe('buildSortedQueryUrl', () => {
    it('sorts query parameters alphabetically', () => {
      const url = buildSortedQueryUrl('/discover/movie', {
        page: 2,
        with_genres: '16,10751',
        include_adult: false,
        certification_country: 'US'
      });

      expect(url).toBe(
        '/api/discover/movie?certification_country=US&include_adult=false&page=2&with_genres=16%2C10751'
      );
    });

    it('handles leading slashes and omitted query params', () => {
      const url = buildSortedQueryUrl('trending/all/day');
      expect(url).toBe('/api/trending/all/day');
    });
  });

  describe('tmdbJson', () => {
    it('caches successful JSON responses in separate namespaces', async () => {
      const mockData1 = { results: [{ id: 1 }] };
      const mockData2 = { results: [{ id: 2 }] };

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData1
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData2
        });

      // Fetch with namespace A
      const resA1 = await tmdbJson('/test', { cacheNamespace: 'nsA' });
      expect(resA1).toEqual(mockData1);

      // Cached in namespace A -> no second fetch
      const resA2 = await tmdbJson('/test', { cacheNamespace: 'nsA' });
      expect(resA2).toEqual(mockData1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Fetch with namespace B -> executes second fetch
      const resB1 = await tmdbJson('/test', { cacheNamespace: 'nsB' });
      expect(resB1).toEqual(mockData2);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws on non-2xx response without caching error', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] })
        });

      await expect(tmdbJson('/missing')).rejects.toThrow(/TMDB HTTP error 404/);

      // Second attempt should re-fetch since errors are not cached
      const res = await tmdbJson('/missing');
      expect(res).toEqual({ results: [] });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('propagates AbortError when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(tmdbJson('/test', { signal: controller.signal })).rejects.toThrow();
    });
  });

  describe('getKidsRating', () => {
    it('checks and caches movie rating approval', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12,
          results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG' }] }]
        })
      });

      const res = await getKidsRating('movie', 12);
      expect(res.approved).toBe(true);
      expect(res.rating).toBe('PG');

      // Second call uses cache without fetching
      const cached = await getKidsRating('movie', 12);
      expect(cached.approved).toBe(true);
    });

    it('checks and caches TV rating denial', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 99,
          results: [{ iso_3166_1: 'US', rating: 'TV-MA' }]
        })
      });

      const res = await getKidsRating('tv', 99);
      expect(res.approved).toBe(false);
      expect(res.rating).toBe('TV-MA');
    });
  });

  describe('filterKidsCandidates', () => {
    it('preserves candidate order and limits to maxCandidates', async () => {
      const candidates = [
        { id: 1, title: 'Item 1', media_type: 'movie' },
        { id: 2, title: 'Item 2', media_type: 'movie' },
        { id: 3, title: 'Item 3', media_type: 'tv' }
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.includes('/movie/1/')) {
          return {
            ok: true,
            json: async () => ({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'G' }] }] })
          };
        }
        if (url.includes('/movie/2/')) {
          return {
            ok: true,
            json: async () => ({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }] })
          };
        }
        if (url.includes('/tv/3/')) {
          return {
            ok: true,
            json: async () => ({ results: [{ iso_3166_1: 'US', rating: 'TV-Y' }] })
          };
        }
        return { ok: false, status: 404, statusText: 'Not Found' };
      });

      const approved = await filterKidsCandidates(candidates, { concurrency: 2 });
      expect(approved.length).toBe(2);
      expect(approved[0].id).toBe(1);
      expect(approved[0].rating).toBe('G');
      expect(approved[1].id).toBe(3);
      expect(approved[1].rating).toBe('TV-Y');
    });
  });
});
