import { describe, it, expect } from 'vitest';
import {
  MAX_WATCHLIST_ITEMS,
  MAX_HISTORY_ITEMS,
  MEDIA_KEY_REGEX,
  isValidMediaKey,
  mediaKey,
  normalizeGenres,
  normalizeWatchlistItem,
  validateWatchlistItem,
  normalizeHistoryItem,
  validateHistoryItem,
  normalizeLegacyData
} from './mediaData.js';

describe('mediaData', () => {
  describe('Constants and Media Key', () => {
    it('defines expected limits and regexes', () => {
      expect(MAX_WATCHLIST_ITEMS).toBe(500);
      expect(MAX_HISTORY_ITEMS).toBe(20);
      expect(MEDIA_KEY_REGEX.test('movie_123')).toBe(true);
      expect(MEDIA_KEY_REGEX.test('tv_456')).toBe(true);
    });

    it('validates media keys with isValidMediaKey', () => {
      expect(isValidMediaKey('movie_1')).toBe(true);
      expect(isValidMediaKey('tv_99999')).toBe(true);
      expect(isValidMediaKey('anime_123')).toBe(false);
      expect(isValidMediaKey('movie_')).toBe(false);
      expect(isValidMediaKey('123')).toBe(false);
      expect(isValidMediaKey('')).toBe(false);
      expect(isValidMediaKey(null)).toBe(false);
    });

    it('generates composite media keys', () => {
      expect(mediaKey('movie', 123)).toBe('movie_123');
      expect(mediaKey('tv', '456')).toBe('tv_456');
    });

    it('throws when mediaKey receives invalid parameters', () => {
      expect(() => mediaKey('anime', 123)).toThrow('Invalid media type');
      expect(() => mediaKey('movie', -5)).toThrow('Invalid media ID');
      expect(() => mediaKey('movie', 0)).toThrow('Invalid media ID');
      expect(() => mediaKey('movie', 'abc')).toThrow('Invalid media ID');
      expect(() => mediaKey(null, 123)).toThrow('Invalid media type');
    });
  });

  describe('normalizeGenres', () => {
    it('converts array of numeric IDs to keyed object', () => {
      const result = normalizeGenres([28, 12, 878]);
      expect(result).toEqual({ '28': true, '12': true, '878': true });
    });

    it('converts array of objects with id property', () => {
      const result = normalizeGenres([{ id: 28, name: 'Action' }, { id: '12', name: 'Adventure' }]);
      expect(result).toEqual({ '28': true, '12': true });
    });

    it('sanitizes existing keyed object', () => {
      const result = normalizeGenres({ '28': true, '12': true, 'invalid': false, 'abc': true });
      expect(result).toEqual({ '28': true, '12': true });
    });

    it('returns empty object for falsy or empty input', () => {
      expect(normalizeGenres(null)).toEqual({});
      expect(normalizeGenres(undefined)).toEqual({});
      expect(normalizeGenres([])).toEqual({});
    });
  });

  describe('normalizeWatchlistItem and validateWatchlistItem', () => {
    it('normalizes valid movie watchlist item', () => {
      const input = {
        id: 550,
        title: 'Fight Club',
        type: 'movie',
        poster_path: '/path.jpg',
        backdrop_path: '/back.jpg',
        overview: 'An insomniac office worker...',
        vote_average: 8.4,
        release_date: '1999-10-15',
        genres: [18, 53],
        addedAt: 1700000000000
      };

      const normalized = normalizeWatchlistItem(input);
      expect(normalized).toEqual({
        id: 550,
        type: 'movie',
        title: 'Fight Club',
        poster_path: '/path.jpg',
        backdrop_path: '/back.jpg',
        overview: 'An insomniac office worker...',
        vote_average: 8.4,
        release_date: '1999-10-15',
        genres: { '18': true, '53': true },
        addedAt: 1700000000000
      });

      const validation = validateWatchlistItem(normalized);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('handles TV show and maps media_type/name fallback', () => {
      const input = {
        id: '1399',
        name: 'Game of Thrones',
        media_type: 'tv',
        first_air_date: '2011-04-17'
      };

      const normalized = normalizeWatchlistItem(input);
      expect(normalized.id).toBe(1399);
      expect(normalized.type).toBe('tv');
      expect(normalized.title).toBe('Game of Thrones');
      expect(normalized.release_date).toBe('2011-04-17');
      expect(typeof normalized.addedAt).toBe('number');
      expect(validateWatchlistItem(normalized).valid).toBe(true);
    });

    it('returns null for unnormalizable items', () => {
      expect(normalizeWatchlistItem(null)).toBeNull();
      expect(normalizeWatchlistItem({})).toBeNull();
      expect(normalizeWatchlistItem({ id: -1, title: 'Invalid ID' })).toBeNull();
      expect(normalizeWatchlistItem({ id: 10, type: 'anime', title: 'Invalid Type' })).toBeNull();
      expect(normalizeWatchlistItem({ id: 10, type: 'movie', title: '   ' })).toBeNull();
    });

    it('rejects invalid items in validateWatchlistItem', () => {
      expect(validateWatchlistItem(null).valid).toBe(false);
      expect(validateWatchlistItem([]).valid).toBe(false);
      expect(validateWatchlistItem({ id: 1, type: 'movie', title: 'Test', addedAt: 100, genres: [28] }).valid).toBe(false); // genres as array
      expect(validateWatchlistItem({ id: 1, type: 'movie', title: 'Test', addedAt: 100, extra: 'forbidden' }).valid).toBe(false); // unknown field
      expect(validateWatchlistItem({ id: 1, type: 'movie', title: '', addedAt: 100 }).valid).toBe(false); // empty title
      expect(validateWatchlistItem({ id: -1, type: 'movie', title: 'Test', addedAt: 100 }).valid).toBe(false); // negative ID
    });
  });

  describe('normalizeHistoryItem and validateHistoryItem', () => {
    it('normalizes valid movie history item and calculates progress', () => {
      const input = {
        id: 550,
        title: 'Fight Club',
        type: 'movie',
        currentTime: 3600,
        duration: 7200,
        lastWatched: 1700000000000
      };

      const normalized = normalizeHistoryItem(input);
      expect(normalized).toEqual({
        id: 550,
        type: 'movie',
        title: 'Fight Club',
        lastWatched: 1700000000000,
        currentTime: 3600,
        duration: 7200,
        progress: 0.5
      });

      const validation = validateHistoryItem(normalized);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('handles TV history with episode/season metadata', () => {
      const input = {
        id: 1399,
        title: 'Game of Thrones',
        type: 'tv',
        currentTime: 1800,
        duration: 3600,
        progress: 0.5,
        lastSeason: 3,
        lastEpisode: 9,
        totalSeasons: 8,
        lastWatched: 1700000000000
      };

      const normalized = normalizeHistoryItem(input);
      expect(normalized.lastSeason).toBe(3);
      expect(normalized.lastEpisode).toBe(9);
      expect(normalized.totalSeasons).toBe(8);
      expect(validateHistoryItem(normalized).valid).toBe(true);
    });

    it('clamps progress between 0 and 1', () => {
      const overProgress = normalizeHistoryItem({
        id: 100,
        title: 'Test',
        type: 'movie',
        progress: 1.5
      });
      expect(overProgress.progress).toBe(1);

      const underProgress = normalizeHistoryItem({
        id: 100,
        title: 'Test',
        type: 'movie',
        progress: -0.5
      });
      expect(underProgress.progress).toBe(0);
    });

    it('rejects invalid items in validateHistoryItem', () => {
      expect(validateHistoryItem(null).valid).toBe(false);
      expect(validateHistoryItem({ id: 1, type: 'movie', title: 'Test', lastWatched: 100, currentTime: 0, duration: 100, progress: 1.2 }).valid).toBe(false); // progress > 1
      expect(validateHistoryItem({ id: 1, type: 'movie', title: 'Test', lastWatched: 100, currentTime: 0, duration: 100, progress: 0.5, lastSeason: 1 }).valid).toBe(false); // TV fields on movie
      expect(validateHistoryItem({ id: 1, type: 'movie', title: 'Test', lastWatched: 100, currentTime: 0, duration: 100, progress: 0.5, unknownField: true }).valid).toBe(false);
    });
  });

  describe('normalizeLegacyData', () => {
    it('migrates legacy localStorage watchlist and history', () => {
      const legacyWatchlist = [
        { id: 101, media_type: 'movie', title: 'Legacy Movie 1', genre_ids: [28, 12] },
        { id: 102, name: 'Legacy TV Show', type: 'tv', first_air_date: '2020-01-01' },
        { id: 103, title: 'No Type Movie' }, // defaults to movie
        { id: 'invalid', title: 'Bad Item' } // rejected
      ];

      const legacyHistory = [
        { id: 201, type: 'movie', title: 'History Movie', currentTime: 50, duration: 100, lastWatched: 1000 },
        { id: 202, type: 'tv', title: 'History TV', lastSeason: 1, lastEpisode: 2, lastWatched: 2000 },
        { id: -99, title: 'Negative ID' } // rejected
      ];

      const result = normalizeLegacyData(legacyWatchlist, legacyHistory);

      expect(result.watchlist).toHaveLength(3);
      expect(result.history).toHaveLength(2);
      expect(result.rejectedCount).toBe(2);

      // Verify watchlist item 1
      expect(result.watchlistByKey['movie_101']).toMatchObject({
        id: 101,
        type: 'movie',
        title: 'Legacy Movie 1',
        genres: { '28': true, '12': true }
      });

      // Verify watchlist item 2
      expect(result.watchlistByKey['tv_102']).toMatchObject({
        id: 102,
        type: 'tv',
        title: 'Legacy TV Show'
      });

      // Verify watchlist item 3 (defaulted to movie)
      expect(result.watchlistByKey['movie_103']).toMatchObject({
        id: 103,
        type: 'movie',
        title: 'No Type Movie'
      });

      // Verify history sorting (most recent first)
      expect(result.history[0].id).toBe(202);
      expect(result.history[1].id).toBe(201);
    });

    it('handles JSON string inputs', () => {
      const watchlistJson = JSON.stringify([{ id: 301, title: 'Json Movie', type: 'movie' }]);
      const historyJson = JSON.stringify([{ id: 301, title: 'Json Movie', type: 'movie', lastWatched: 500 }]);

      const result = normalizeLegacyData(watchlistJson, historyJson);
      expect(result.watchlist).toHaveLength(1);
      expect(result.history).toHaveLength(1);
      expect(result.rejectedCount).toBe(0);
    });

    it('handles malformed JSON strings gracefully', () => {
      const result = normalizeLegacyData('{ bad json', 'not json');
      expect(result.watchlist).toEqual([]);
      expect(result.history).toEqual([]);
      expect(result.rejectedCount).toBe(0);
    });

    it('enforces limits (500 watchlist, 20 history)', () => {
      const manyWatchlist = Array.from({ length: 600 }, (_, i) => ({
        id: i + 1,
        title: `Movie ${i + 1}`,
        type: 'movie',
        addedAt: i + 1
      }));

      const manyHistory = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        title: `History ${i + 1}`,
        type: 'movie',
        lastWatched: i + 1
      }));

      const result = normalizeLegacyData(manyWatchlist, manyHistory);
      expect(result.watchlist.length).toBe(MAX_WATCHLIST_ITEMS);
      expect(result.history.length).toBe(MAX_HISTORY_ITEMS);
      expect(Object.keys(result.watchlistByKey).length).toBe(MAX_WATCHLIST_ITEMS);
      expect(Object.keys(result.historyByKey).length).toBe(MAX_HISTORY_ITEMS);
    });
  });
});
