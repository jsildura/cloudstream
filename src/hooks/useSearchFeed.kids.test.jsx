import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSearchFeed } from './useSearchFeed';

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

describe('useSearchFeed Kids Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = { isKidsMode: true, isProfileLoading: false };
  });

  it('discards person results and skips person filmography mode in Kids mode', async () => {
    mockFilterKidsCandidates.mockImplementation(async (items) => {
      return items.filter(i => i.id === 101); // Only approved movie
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 999, name: 'Tom Hanks', media_type: 'person' },
          { id: 101, title: 'Toy Story', media_type: 'movie' }
        ],
        total_pages: 1,
        total_results: 2
      })
    });

    const { result } = renderHook(() => useSearchFeed('Tom Hanks'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.personMode).toBeNull();
      expect(result.current.people).toEqual([]);
      expect(result.current.items.length).toBe(1);
      expect(result.current.items[0].id).toBe(101);
    });
  });

  it('filters multi-search results through Kids policy', async () => {
    mockFilterKidsCandidates.mockImplementation(async (items) => {
      return items.filter(i => i.id === 202);
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 201, title: 'Adult Movie', media_type: 'movie' },
          { id: 202, title: 'Kids Movie', media_type: 'movie' }
        ],
        total_pages: 1,
        total_results: 2
      })
    });

    const { result } = renderHook(() => useSearchFeed('Movie'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.items.length).toBe(1);
      expect(result.current.items[0].id).toBe(202);
    });
  });
});
