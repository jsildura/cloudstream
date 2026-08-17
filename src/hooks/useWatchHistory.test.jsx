import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useWatchHistory from './useWatchHistory';

let mockProfileData = {
  watchHistory: [{ id: 550, type: 'movie', title: 'Fight Club', currentTime: 10, duration: 100 }],
  isLoaded: true,
  addToHistory: vi.fn(),
  updateProgress: vi.fn(),
  getLastWatched: vi.fn(),
  isInHistory: vi.fn(),
  removeFromHistory: vi.fn(),
  clearHistory: vi.fn()
};

vi.mock('../contexts/ProfileDataContext', () => ({
  useProfileData: () => mockProfileData
}));

describe('useWatchHistory Hook Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates state and functions to useProfileData', () => {
    const { result } = renderHook(() => useWatchHistory());

    expect(result.current.watchHistory).toEqual(mockProfileData.watchHistory);
    expect(result.current.historyCount).toBe(1);
    expect(result.current.isLoaded).toBe(true);

    const item = { id: 600, type: 'movie', title: 'Movie 600' };
    result.current.addToHistory(item);
    expect(mockProfileData.addToHistory).toHaveBeenCalledWith(item);

    result.current.updateProgress(550, 20, 100);
    expect(mockProfileData.updateProgress).toHaveBeenCalledWith(550, 20, 100);

    result.current.getLastWatched(550);
    expect(mockProfileData.getLastWatched).toHaveBeenCalledWith(550);

    result.current.isInHistory(550);
    expect(mockProfileData.isInHistory).toHaveBeenCalledWith(550);

    result.current.removeFromHistory(550);
    expect(mockProfileData.removeFromHistory).toHaveBeenCalledWith(550);

    result.current.clearHistory();
    expect(mockProfileData.clearHistory).toHaveBeenCalled();

    expect(result.current.getWatchHistory()).toEqual(mockProfileData.watchHistory);
  });
});
