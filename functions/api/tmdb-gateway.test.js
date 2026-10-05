import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onRequest,
  isAllowedTmdbPath,
  ALLOWED_TMDB_PREFIXES,
  getTmdbCors,
} from './[[path]].js';

describe('functions/api/[[path]].js - Hardened TMDB API Gateway', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Path Allowlist (isAllowedTmdbPath)', () => {
    it('allows valid TMDB paths used by the application', () => {
      expect(isAllowedTmdbPath('movie/550')).toBe(true);
      expect(isAllowedTmdbPath('movie/popular')).toBe(true);
      expect(isAllowedTmdbPath('movie/123/videos')).toBe(true);
      expect(isAllowedTmdbPath('movie/123/images')).toBe(true);
      expect(isAllowedTmdbPath('tv/1399')).toBe(true);
      expect(isAllowedTmdbPath('tv/1399/season/1')).toBe(true);
      expect(isAllowedTmdbPath('trending/all/week')).toBe(true);
      expect(isAllowedTmdbPath('trending/movie/day')).toBe(true);
      expect(isAllowedTmdbPath('discover/movie')).toBe(true);
      expect(isAllowedTmdbPath('discover/tv')).toBe(true);
      expect(isAllowedTmdbPath('search/multi')).toBe(true);
      expect(isAllowedTmdbPath('genre/movie/list')).toBe(true);
      expect(isAllowedTmdbPath('person/287')).toBe(true);
      expect(isAllowedTmdbPath('person/287/combined_credits')).toBe(true);
      expect(isAllowedTmdbPath('collection/10')).toBe(true);
      expect(isAllowedTmdbPath('configuration')).toBe(true);
    });

    it('rejects unallowed TMDB endpoints outside the application scope', () => {
      expect(isAllowedTmdbPath('account')).toBe(false);
      expect(isAllowedTmdbPath('account/123/lists')).toBe(false);
      expect(isAllowedTmdbPath('authentication/token/new')).toBe(false);
      expect(isAllowedTmdbPath('certification/movie/list')).toBe(false);
      expect(isAllowedTmdbPath('credit/12345')).toBe(false);
      expect(isAllowedTmdbPath('network/123')).toBe(false);
      expect(isAllowedTmdbPath('review/123')).toBe(false);
      expect(isAllowedTmdbPath('company/123')).toBe(false);
    });

    it('rejects path traversal attempts', () => {
      expect(isAllowedTmdbPath('../account')).toBe(false);
      expect(isAllowedTmdbPath('movie/../../account')).toBe(false);
      expect(isAllowedTmdbPath('..')).toBe(false);
      expect(isAllowedTmdbPath('')).toBe(false);
      expect(isAllowedTmdbPath(null)).toBe(false);
    });
  });

  describe('Origin-Scoped CORS (getTmdbCors)', () => {
    it('scopes Access-Control-Allow-Origin to own origin', () => {
      const fakeReq = {
        url: 'https://streamflix.me/api/movie/550',
        headers: new Headers({ origin: 'https://streamflix.me' }),
      };
      const { headers, isOriginAllowed } = getTmdbCors(fakeReq, { APP_URL: 'https://streamflix.me' });
      expect(isOriginAllowed).toBe(true);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://streamflix.me');
      expect(headers['Vary']).toBe('Origin');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('rejects untrusted third-party origins', () => {
      const fakeReq = {
        url: 'https://streamflix.me/api/movie/550',
        headers: new Headers({ origin: 'https://unauthorized-scraper.com' }),
      };
      const { isOriginAllowed } = getTmdbCors(fakeReq, { APP_URL: 'https://streamflix.me' });
      expect(isOriginAllowed).toBe(false);
    });

    it('allows dev origins on localhost', () => {
      const fakeReq = {
        url: 'http://localhost:5173/api/movie/550',
        headers: new Headers({ origin: 'http://localhost:5173' }),
      };
      const { isOriginAllowed, headers } = getTmdbCors(fakeReq);
      expect(isOriginAllowed).toBe(true);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });
  });

  describe('Method & Path Enforcement in onRequest', () => {
    const baseContext = {
      request: {
        url: 'https://streamflix.me/api/movie/550',
        method: 'GET',
        headers: new Headers({ origin: 'https://streamflix.me' }),
      },
      env: {
        APP_URL: 'https://streamflix.me',
        VITE_TMDB_READ_ACCESS_TOKEN: 'fake-test-token',
      },
    };

    it('rejects POST requests with 405 Method Not Allowed', async () => {
      const context = {
        ...baseContext,
        request: {
          ...baseContext.request,
          method: 'POST',
        },
      };

      const resp = await onRequest(context);
      expect(resp.status).toBe(405);
      const data = await resp.json();
      expect(data.status_code).toBe(405);
      expect(data.status_message).toContain('Only GET is permitted');
      expect(resp.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
    });

    it('rejects DELETE requests with 405 Method Not Allowed', async () => {
      const context = {
        ...baseContext,
        request: {
          ...baseContext.request,
          method: 'DELETE',
        },
      };

      const resp = await onRequest(context);
      expect(resp.status).toBe(405);
    });

    it('rejects requests from untrusted origins with 403 Forbidden', async () => {
      const context = {
        ...baseContext,
        request: {
          url: 'https://streamflix.me/api/movie/550',
          method: 'GET',
          headers: new Headers({ origin: 'https://evil.com' }),
        },
      };

      const resp = await onRequest(context);
      expect(resp.status).toBe(403);
      const data = await resp.json();
      expect(data.status_message).toContain('Forbidden origin');
    });

    it('rejects unallowed path with 403 Forbidden', async () => {
      const context = {
        ...baseContext,
        request: {
          url: 'https://streamflix.me/api/account/details',
          method: 'GET',
          headers: new Headers({ origin: 'https://streamflix.me' }),
        },
      };

      const resp = await onRequest(context);
      expect(resp.status).toBe(403);
      const data = await resp.json();
      expect(data.status_message).toContain('not in the allowed TMDB API endpoints');
    });

    it('handles OPTIONS preflight for allowed origin', async () => {
      const context = {
        ...baseContext,
        request: {
          url: 'https://streamflix.me/api/movie/550',
          method: 'OPTIONS',
          headers: new Headers({ origin: 'https://streamflix.me' }),
        },
      };

      const resp = await onRequest(context);
      expect(resp.status).toBe(204);
      expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('https://streamflix.me');
    });

    it('fetches TMDB with Bearer token and returns response with s-maxage caching header', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 550, title: 'Fight Club' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const resp = await onRequest(baseContext);
      expect(resp.status).toBe(200);
      expect(resp.headers.get('Cache-Control')).toContain('s-maxage=14400');
      expect(resp.headers.get('Cache-Control')).toContain('max-age=3600');
      expect(resp.headers.get('X-Cache')).toBe('MISS');

      const data = await resp.json();
      expect(data.title).toBe('Fight Club');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/movie/550',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-test-token',
          }),
        })
      );
    });

    it('returns 401 when TMDB token is missing', async () => {
      const context = {
        ...baseContext,
        env: {
          APP_URL: 'https://streamflix.me',
        },
      };

      const resp = await onRequest(context);
      expect(resp.status).toBe(401);
      const data = await resp.json();
      expect(data.status_code).toBe(401);
      expect(data.status_message).toContain('TMDB Access Token not configured');
    });
  });
});
