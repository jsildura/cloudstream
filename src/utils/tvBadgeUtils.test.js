import { describe, it, expect } from 'vitest';
import { isRecentEpisode, RECENT_EPISODE_THRESHOLD_DAYS } from './tvBadgeUtils';

describe('src/utils/tvBadgeUtils', () => {
  const refDate = new Date('2026-09-28T12:00:00Z');

  it('returns false for null or undefined', () => {
    expect(isRecentEpisode(null)).toBe(false);
    expect(isRecentEpisode(undefined)).toBe(false);
    expect(isRecentEpisode({})).toBe(false);
  });

  it('returns false for movies even if recent', () => {
    const movie = {
      type: 'movie',
      release_date: '2026-09-26',
      title: 'Action Movie'
    };
    expect(isRecentEpisode(movie, 7, refDate)).toBe(false);

    const movieWithMediaType = {
      media_type: 'movie',
      release_date: '2026-09-26',
      title: 'Action Movie'
    };
    expect(isRecentEpisode(movieWithMediaType, 7, refDate)).toBe(false);
  });

  it('returns true for a TV show with an episode aired 2 days ago via last_episode_to_air', () => {
    const tvShow = {
      type: 'tv',
      name: 'The Scandal',
      last_episode_to_air: {
        air_date: '2026-09-26',
        episode_number: 12
      }
    };
    expect(isRecentEpisode(tvShow, 7, refDate)).toBe(true);
  });

  it('returns true for a TV show with last_air_date 5 days ago', () => {
    const tvShow = {
      media_type: 'tv',
      name: 'Lanterns',
      last_air_date: '2026-09-23'
    };
    expect(isRecentEpisode(tvShow, 7, refDate)).toBe(true);
  });

  it('returns false for an old TV show (e.g. The Mentalist ended years ago)', () => {
    const oldShow = {
      type: 'tv',
      name: 'The Mentalist',
      last_air_date: '2015-02-18',
      last_episode_to_air: {
        air_date: '2015-02-18',
        episode_number: 13
      }
    };
    expect(isRecentEpisode(oldShow, 7, refDate)).toBe(false);
  });

  it('respects the thresholdDays argument', () => {
    const tvShow = {
      type: 'tv',
      name: 'Weekly Show',
      last_air_date: '2026-09-18' // 10 days ago relative to 2026-09-28
    };

    // 7-day threshold -> false
    expect(isRecentEpisode(tvShow, 7, refDate)).toBe(false);
    // 14-day threshold -> true
    expect(isRecentEpisode(tvShow, 14, refDate)).toBe(true);
  });

  it('returns true for a brand-new show that premiered 3 days ago using first_air_date fallback', () => {
    const newShow = {
      media_type: 'tv',
      name: 'Brand New Pilot',
      first_air_date: '2026-09-25'
    };
    expect(isRecentEpisode(newShow, 7, refDate)).toBe(true);
  });

  it('returns false if air_date is too far in the future', () => {
    const futureShow = {
      type: 'tv',
      name: 'Future Show',
      first_air_date: '2026-10-15'
    };
    expect(isRecentEpisode(futureShow, 7, refDate)).toBe(false);
  });

  it('tolerates up to 1 day ahead for timezone differences', () => {
    const todayEpisode = {
      type: 'tv',
      name: 'Simulcast Today',
      last_air_date: '2026-09-29' // 1 day ahead due to UTC / timezone
    };
    expect(isRecentEpisode(todayEpisode, 7, refDate)).toBe(true);
  });
});
