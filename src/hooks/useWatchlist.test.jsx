import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useWatchlist from './useWatchlist';

let mockProfileData = {
  watchlist: [{ id: 550, type: 'movie', title: 'Fight Club' }],
  isWatchlistLoading: false,
  isInWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
  toggleWatchlist: vi.fn(),
  clearWatchlist: vi.fn()
};

vi.mock('../contexts/ProfileDataContext', () => ({
  useProfileData: () => mockProfileData
}));

describe('useWatchlist Hook Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates state and functions to useProfileData', () => {
    const { result } = renderHook(() => useWatchlist());

    expect(result.current.watchlist).toEqual(mockProfileData.watchlist);
    expect(result.current.watchlistCount).toBe(1);
    expect(result.current.isLoading).toBe(false);

    result.current.isInWatchlist(550);
    expect(mockProfileData.isInWatchlist).toHaveBeenCalledWith(550);

    const newItem = { id: 600, type: 'movie', title: 'Movie 600' };
    result.current.addToWatchlist(newItem);
    expect(mockProfileData.addToWatchlist).toHaveBeenCalledWith(newItem);

    result.current.removeFromWatchlist(550);
    expect(mockProfileData.removeFromWatchlist).toHaveBeenCalledWith(550);

    result.current.toggleWatchlist(newItem);
    expect(mockProfileData.toggleWatchlist).toHaveBeenCalledWith(newItem);

    result.current.clearWatchlist();
    expect(mockProfileData.clearWatchlist).toHaveBeenCalled();
  });
});
