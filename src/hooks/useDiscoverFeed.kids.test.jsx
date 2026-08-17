import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDiscoverFeed } from './useDiscoverFeed';

let mockProfiles = {
  isKidsMode: true,
  isProfileLoading: false
};

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

const mockFilterKidsCandidates = vi.fn();
vi.mock('../lib/tmdbClient', () => ({
  filterKidsCandidates: (...args) => mockFilterKidsCandidates(...args)
}));

describe('useDiscoverFeed Kids Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = { isKidsMode: true, isProfileLoading: false };
  });

  it('injects Kids prefilters and filters candidates when in Kids mode', async () => {
    mockFilterKidsCandidates.mockImplementation(async (items) => {
      return items.filter(i => i.id === 50);
    });
    const capturedUrls = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/discover/')) {
        capturedUrls.push(urlStr);
      }
      return {
        ok: true,
        json: async () => ({
          results: [
            { id: 40, title: 'Disallowed Movie' },
            { id: 50, title: 'Allowed Movie' }
          ],
          total_pages: 1,
          total_results: 2
        })
      };
    });

    const { result } = renderHook(() => useDiscoverFeed({
      mediaType: 'movie',
      filters: {},
      extraParams: {}
    }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(capturedUrls.length).toBeGreaterThan(0);
      expect(capturedUrls[0]).toContain('certification_country=US');
      expect(capturedUrls[0]).toContain('certification.lte=PG');
      expect(capturedUrls[0]).toContain('include_adult=false');
      expect(result.current.items.length).toBe(1);
      expect(result.current.items[0].id).toBe(50);
    });
  });

  it('does not inject Kids prefilters or filter candidates in normal mode', async () => {
    mockProfiles.isKidsMode = false;
    let capturedUrl = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        json: async () => ({
          results: [
            { id: 1, title: 'Any Movie 1' },
            { id: 2, title: 'Any Movie 2' }
          ],
          total_pages: 1,
          total_results: 2
        })
      };
    });

    const { result } = renderHook(() => useDiscoverFeed({
      mediaType: 'movie',
      filters: {},
      extraParams: {}
    }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(capturedUrl).not.toContain('certification.lte=PG');
      expect(mockFilterKidsCandidates).not.toHaveBeenCalled();
      expect(result.current.items.length).toBe(2);
    });
  });
});
