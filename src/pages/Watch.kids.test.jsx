import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import KidsRatedWatchGuard from '../components/KidsRatedWatchGuard';
import Watch from './Watch';

let mockProfiles = {
  isKidsMode: true,
  isProfileLoading: false
};

const mockShowError = vi.fn();

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showError: mockShowError,
    showSuccess: vi.fn()
  })
}));

const mockGetKidsRating = vi.fn();
vi.mock('../lib/tmdbClient', () => ({
  getKidsRating: (...args) => mockGetKidsRating(...args)
}));

// Mock DirectPlayer to verify mounting
const mockDirectPlayerMount = vi.fn();
vi.mock('../components/DirectPlayer', () => ({
  default: (props) => {
    mockDirectPlayerMount(props);
    return <div data-testid="direct-player">Direct Player Mounted</div>;
  }
}));

// Mock useTMDB
vi.mock('../hooks/useTMDB', () => ({
  useTMDB: () => ({
    fetchContentDetails: vi.fn().mockResolvedValue({ id: 12, title: 'Kids Movie', media_type: 'movie' }),
    fetchVideos: vi.fn().mockResolvedValue([]),
    fetchLogo: vi.fn().mockResolvedValue(null),
    fetchMovieRecommendations: vi.fn().mockResolvedValue([]),
    fetchTVRecommendations: vi.fn().mockResolvedValue([])
  })
}));

// Mock useProfileData
vi.mock('../contexts/ProfileDataContext', () => ({
  useProfileData: () => ({
    watchlist: [],
    watchHistory: [],
    isInWatchlist: () => false,
    toggleWatchlist: vi.fn(),
    isInHistory: () => false,
    addToHistory: vi.fn(),
    updateProgress: vi.fn(),
    getLastWatched: () => null,
    flushPendingHistory: vi.fn()
  })
}));

describe('Watch Page Kids Rating Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = { isKidsMode: true, isProfileLoading: false };
  });

  it('blocks disallowed movie and never mounts DirectPlayer', async () => {
    mockGetKidsRating.mockResolvedValueOnce({
      approved: false,
      rating: 'R',
      type: 'movie',
      id: 999
    });

    render(
      <MemoryRouter initialEntries={['/watch?type=movie&id=999']}>
        <Routes>
          <Route path="/" element={<div>Home Landing Page</div>} />
          <Route path="/watch" element={
            <KidsRatedWatchGuard>
              <Watch />
            </KidsRatedWatchGuard>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Home Landing Page')).toBeDefined();
    });

    // DirectPlayer must NEVER have mounted
    expect(mockDirectPlayerMount).not.toHaveBeenCalled();
    expect(screen.queryByTestId('direct-player')).toBeNull();
    expect(mockShowError).toHaveBeenCalledWith('This title is not available in Kids mode.');
  });

  it('allows approved PG movie and mounts Watch page', async () => {
    mockGetKidsRating.mockResolvedValueOnce({
      approved: true,
      rating: 'PG',
      type: 'movie',
      id: 12
    });

    render(
      <MemoryRouter initialEntries={['/watch?type=movie&id=12']}>
        <Routes>
          <Route path="/watch" element={
            <KidsRatedWatchGuard>
              <Watch />
            </KidsRatedWatchGuard>
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull();
    });
  });
});
