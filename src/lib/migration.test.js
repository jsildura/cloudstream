import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeLegacyProfileData,
  getMigrationKey,
  getMigrationDecision,
  setMigrationDecision,
  STORAGE_MIGRATION_PREFIX
} from './migration';

describe('Profile Migration Pure Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('mergeLegacyProfileData', () => {
    it('handles empty and null inputs safely', () => {
      const result = mergeLegacyProfileData();
      expect(result.watchlistByKey).toEqual({});
      expect(result.historyByKey).toEqual({});
      expect(result.rejectedRecords).toBe(0);
      expect(result.watchlistItemsToMigrate).toEqual([]);
      expect(result.historyItemsToMigrate).toEqual([]);
    });

    it('handles malformed JSON strings without throwing', () => {
      const result = mergeLegacyProfileData({
        legacyWatchlist: '{not valid json',
        legacyHistory: '[not valid json'
      });
      expect(result.watchlistByKey).toEqual({});
      expect(result.historyByKey).toEqual({});
      expect(result.rejectedRecords).toBe(0);
    });

    it('normalizes legacy fields (media_type -> type, title || name, default type to movie)', () => {
      const legacyWatchlist = [
        { id: 10, media_type: 'tv', name: 'Show 10', addedAt: 100 },
        { id: 20, title: 'Movie 20', addedAt: 200 } // type omitted -> defaults to movie
      ];

      const legacyHistory = [
        { id: 30, media_type: 'movie', title: 'Movie 30', lastWatched: 300, currentTime: 10, duration: 100 }
      ];

      const result = mergeLegacyProfileData({ legacyWatchlist, legacyHistory });

      expect(result.watchlistByKey['tv_10']).toBeDefined();
      expect(result.watchlistByKey['tv_10'].type).toBe('tv');
      expect(result.watchlistByKey['tv_10'].title).toBe('Show 10');

      expect(result.watchlistByKey['movie_20']).toBeDefined();
      expect(result.watchlistByKey['movie_20'].type).toBe('movie');
      expect(result.watchlistByKey['movie_20'].title).toBe('Movie 20');

      expect(result.historyByKey['movie_30']).toBeDefined();
      expect(result.historyByKey['movie_30'].type).toBe('movie');
      expect(result.historyByKey['movie_30'].progress).toBe(0.1);
      expect(result.rejectedRecords).toBe(0);
    });

    it('rejects invalid records (negative ID, missing title, invalid type)', () => {
      const legacyWatchlist = [
        { id: -5, title: 'Negative ID' },
        { id: 0, title: 'Zero ID' },
        { id: 15, title: '' }, // empty title
        { id: 25, type: 'podcast', title: 'Invalid Type' },
        { id: 35, title: 'Valid Movie' }
      ];

      const result = mergeLegacyProfileData({ legacyWatchlist });
      expect(result.rejectedRecords).toBe(4);
      expect(Object.keys(result.watchlistByKey)).toEqual(['movie_35']);
    });

    it('lets cloud items win exact-key conflicts', () => {
      const cloudWatchlist = [
        { id: 550, type: 'movie', title: 'Fight Club (Cloud Version)', addedAt: 500 }
      ];

      const legacyWatchlist = [
        { id: 550, type: 'movie', title: 'Fight Club (Legacy Version)', addedAt: 100 },
        { id: 600, type: 'movie', title: 'The Matrix', addedAt: 200 }
      ];

      const result = mergeLegacyProfileData({ cloudWatchlist, legacyWatchlist });

      expect(result.watchlistByKey['movie_550'].title).toBe('Fight Club (Cloud Version)');
      expect(result.watchlistByKey['movie_550'].addedAt).toBe(500);
      expect(result.watchlistByKey['movie_600'].title).toBe('The Matrix');
      // Only The Matrix is counted as an item to migrate into cloud
      expect(result.watchlistItemsToMigrate.map(i => i.id)).toEqual([600]);
    });

    it('caps history at newest 20 items', () => {
      const legacyHistory = [];
      for (let i = 1; i <= 25; i++) {
        legacyHistory.push({
          id: i,
          type: 'movie',
          title: `Movie ${i}`,
          lastWatched: 1000 + i,
          currentTime: 10,
          duration: 100
        });
      }

      const result = mergeLegacyProfileData({ legacyHistory });
      const historyKeys = Object.keys(result.historyByKey);
      expect(historyKeys.length).toBe(20);
      expect(result.historyByKey['movie_25']).toBeDefined(); // newest
      expect(result.historyByKey['movie_6']).toBeDefined();  // 20th newest
      expect(result.historyByKey['movie_1']).toBeUndefined(); // evicted oldest
    });
  });

  describe('Migration Decision Storage', () => {
    it('manages decision per UID accurately', () => {
      const uid1 = 'user-google-1';
      const uid2 = 'user-google-2';

      expect(getMigrationKey(uid1)).toBe(`${STORAGE_MIGRATION_PREFIX}${uid1}`);
      expect(getMigrationDecision(uid1)).toBeNull();

      setMigrationDecision(uid1, 'accepted');
      expect(getMigrationDecision(uid1)).toBe('accepted');
      expect(getMigrationDecision(uid2)).toBeNull();

      setMigrationDecision(uid2, 'declined');
      expect(getMigrationDecision(uid1)).toBe('accepted');
      expect(getMigrationDecision(uid2)).toBe('declined');
    });
  });
});
