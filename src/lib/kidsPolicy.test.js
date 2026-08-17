import { describe, it, expect } from 'vitest';
import {
  extractUsMovieCertification,
  extractUsTvRating,
  isMovieRatingAllowed,
  isTvRatingAllowed,
  isRatingApproved,
  ALLOWED_KIDS_MOVIE_RATINGS,
  ALLOWED_KIDS_TV_RATINGS
} from './kidsPolicy';

describe('Kids Policy & Rating Extraction', () => {
  describe('extractUsMovieCertification', () => {
    it('extracts US certification from valid payload', () => {
      const payload = {
        id: 12,
        results: [
          {
            iso_3166_1: 'GB',
            release_dates: [{ certification: '12A' }]
          },
          {
            iso_3166_1: 'US',
            release_dates: [
              { certification: '' },
              { certification: 'PG' }
            ]
          }
        ]
      };
      expect(extractUsMovieCertification(payload)).toBe('PG');
    });

    it('returns null when US entry is missing', () => {
      const payload = {
        results: [
          { iso_3166_1: 'CA', release_dates: [{ certification: 'PG' }] },
          { iso_3166_1: 'GB', release_dates: [{ certification: 'U' }] }
        ]
      };
      expect(extractUsMovieCertification(payload)).toBeNull();
    });

    it('returns null when US release_dates contains only empty certifications', () => {
      const payload = {
        results: [
          { iso_3166_1: 'US', release_dates: [{ certification: '   ' }] }
        ]
      };
      expect(extractUsMovieCertification(payload)).toBeNull();
    });

    it('handles malformed, null, or empty payloads gracefully', () => {
      expect(extractUsMovieCertification(null)).toBeNull();
      expect(extractUsMovieCertification({})).toBeNull();
      expect(extractUsMovieCertification({ results: null })).toBeNull();
      expect(extractUsMovieCertification({ results: [] })).toBeNull();
    });
  });

  describe('extractUsTvRating', () => {
    it('extracts US TV rating from valid payload', () => {
      const payload = {
        id: 100,
        results: [
          { iso_3166_1: 'GB', rating: '12' },
          { iso_3166_1: 'US', rating: 'TV-Y7' }
        ]
      };
      expect(extractUsTvRating(payload)).toBe('TV-Y7');
    });

    it('returns null when US entry is missing or has international-only ratings', () => {
      const payload = {
        results: [
          { iso_3166_1: 'CA', rating: 'G' },
          { iso_3166_1: 'DE', rating: 'FSK 6' }
        ]
      };
      expect(extractUsTvRating(payload)).toBeNull();
    });

    it('handles malformed, null, or empty payloads gracefully', () => {
      expect(extractUsTvRating(null)).toBeNull();
      expect(extractUsTvRating({})).toBeNull();
      expect(extractUsTvRating({ results: [] })).toBeNull();
    });
  });

  describe('isMovieRatingAllowed', () => {
    it('allows G and PG', () => {
      expect(isMovieRatingAllowed('G')).toBe(true);
      expect(isMovieRatingAllowed('g')).toBe(true);
      expect(isMovieRatingAllowed('PG')).toBe(true);
      expect(isMovieRatingAllowed('pg')).toBe(true);
    });

    it('rejects PG-13, R, NC-17, NR, and empty ratings', () => {
      expect(isMovieRatingAllowed('PG-13')).toBe(false);
      expect(isMovieRatingAllowed('R')).toBe(false);
      expect(isMovieRatingAllowed('NC-17')).toBe(false);
      expect(isMovieRatingAllowed('NR')).toBe(false);
      expect(isMovieRatingAllowed('UR')).toBe(false);
      expect(isMovieRatingAllowed('')).toBe(false);
      expect(isMovieRatingAllowed(null)).toBe(false);
      expect(isMovieRatingAllowed(undefined)).toBe(false);
    });
  });

  describe('isTvRatingAllowed', () => {
    it('allows TV-Y, TV-Y7, TV-Y7-FV, TV-G, TV-PG', () => {
      ALLOWED_KIDS_TV_RATINGS.forEach((rating) => {
        expect(isTvRatingAllowed(rating)).toBe(true);
        expect(isTvRatingAllowed(rating.toLowerCase())).toBe(true);
      });
    });

    it('rejects TV-14, TV-MA, and non-US TV ratings', () => {
      expect(isTvRatingAllowed('TV-14')).toBe(false);
      expect(isTvRatingAllowed('TV-MA')).toBe(false);
      expect(isTvRatingAllowed('NR')).toBe(false);
      expect(isTvRatingAllowed('')).toBe(false);
      expect(isTvRatingAllowed(null)).toBe(false);
    });
  });

  describe('isRatingApproved', () => {
    it('correctly approves or rejects based on media type', () => {
      expect(isRatingApproved('movie', 'PG')).toBe(true);
      expect(isRatingApproved('movie', 'PG-13')).toBe(false);
      expect(isRatingApproved('tv', 'TV-G')).toBe(true);
      expect(isRatingApproved('tv', 'TV-14')).toBe(false);
      expect(isRatingApproved('unknown', 'PG')).toBe(false);
    });
  });
});
