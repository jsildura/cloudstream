import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deduplicateMedia,
  buildKidsCatalog
} from './kidsCatalog';
import { clearTmdbCache } from './tmdbClient';

describe('Kids Catalog Builder', () => {
  beforeEach(() => {
    clearTmdbCache();
    vi.restoreAllMocks();
  });

  describe('deduplicateMedia', () => {
    it('deduplicates items using composite mediaKey', () => {
      const items = [
        { id: 100, media_type: 'movie', title: 'Movie 100' },
        { id: 100, media_type: 'tv', name: 'Show 100' }, // Different media type -> kept!
        { id: 100, media_type: 'movie', title: 'Movie 100 Duplicate' }, // Duplicate -> removed
        { id: 200, media_type: 'movie', title: 'Movie 200' }
      ];

      const deduped = deduplicateMedia(items);
      expect(deduped.length).toBe(3);
      expect(deduped[0].media_type).toBe('movie');
      expect(deduped[0].id).toBe(100);
      expect(deduped[1].media_type).toBe('tv');
      expect(deduped[1].id).toBe(100);
      expect(deduped[2].id).toBe(200);
    });
  });

  describe('buildKidsCatalog', () => {
    it('fetches candidate sources and filters through Kids policy', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        // Mock discover endpoints
        if (url.includes('/discover/movie')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                { id: 1, title: 'Finding Nemo', backdrop_path: '/nemo.jpg' },
                { id: 2, title: 'Toy Story', backdrop_path: '/toy.jpg' }
              ]
            })
          };
        }
        if (url.includes('/discover/tv')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                { id: 10, name: 'Paw Patrol', backdrop_path: '/paw.jpg' }
              ]
            })
          };
        }

        // Mock rating endpoints
        if (url.includes('/movie/1/release_dates') || url.includes('/movie/2/release_dates')) {
          return {
            ok: true,
            json: async () => ({
              results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'G' }] }]
            })
          };
        }
        if (url.includes('/tv/10/content_ratings')) {
          return {
            ok: true,
            json: async () => ({
              results: [{ iso_3166_1: 'US', rating: 'TV-Y' }]
            })
          };
        }

        return { ok: false, status: 404, statusText: 'Not Found' };
      });

      const catalog = await buildKidsCatalog();

      expect(catalog.allApproved.length).toBeGreaterThan(0);
      expect(catalog.sections.familyMovies.length).toBe(2);
      expect(catalog.sections.kidsShows.length).toBe(1);
      expect(catalog.bannerItems.length).toBeGreaterThan(0);
      expect(catalog.bannerItems[0].backdrop_path).toBeDefined();
    });

    it('propagates AbortError when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(buildKidsCatalog({ signal: controller.signal })).rejects.toThrow();
    });
  });
});
