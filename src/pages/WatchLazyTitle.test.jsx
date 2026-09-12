import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Watch from './Watch';

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => ({ isKidsMode: false, isProfileLoading: false })
}));

vi.mock('../contexts/AdFreeContext', () => ({
  useAdFree: () => ({ isAdFree: true, loading: false })
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showNowPlaying: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn()
  })
}));

vi.mock('../hooks/useWatchHistory', () => ({
  default: () => ({
    addToHistory: vi.fn(),
    updateProgress: vi.fn(),
    getLastWatched: vi.fn(),
    flushPendingHistory: vi.fn()
  })
}));

vi.mock('../hooks/usePopularTracking', () => ({
  default: () => ({ trackWatch: vi.fn() })
}));

vi.mock('../hooks/useWatchlist', () => ({
  default: () => ({
    isInWatchlist: () => false,
    toggleWatchlist: vi.fn()
  })
}));

vi.mock('../components/DirectPlayer', () => ({
  default: () => <div data-testid="direct-player" />
}));

const mockGetCachedLogo = vi.fn().mockReturnValue(null);

vi.mock('../hooks/useTMDB', () => ({
  useTMDB: () => ({
    POSTER_URL: 'https://image.tmdb.org/t/p/w500',
    getCachedLogo: mockGetCachedLogo
  }),
  getCachedLogo: (...args) => mockGetCachedLogo(...args)
}));

describe('Watch Lazy Title Overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('/api/tv/71914') || url.includes('/api/movie/71914')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 71914,
            name: 'The Wheel of Time',
            title: 'The Wheel of Time',
            seasons: [{ season_number: 1, name: 'Season 1', episode_count: 8 }]
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('renders backdrop title logo when logoPath is provided from modal navigation state', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/watch',
          search: '?type=tv&id=71914&season=1&episode=1',
          state: {
            fromModal: true,
            logoPath: '/wheel_of_time_logo.png',
            backdropTitle: '/wheel_of_time_logo.png',
            title: 'The Wheel of Time'
          }
        }]}
      >
        <Routes>
          <Route path="/watch" element={<Watch />} />
        </Routes>
      </MemoryRouter>
    );

    const logoImg = await screen.findByRole('img', { name: /The Wheel of Time logo/i });
    expect(logoImg).toBeDefined();
    expect(logoImg.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w500/wheel_of_time_logo.png');
    expect(logoImg.className).toContain('watch-lazy-title-logo');
    expect(logoImg.closest('.watch-lazy-title-logo-wrap')).toBeDefined();

    // Text title <p class="watch-lazy-title"> should not be rendered while logo is active
    expect(screen.queryByText('The Wheel of Time', { selector: 'p.watch-lazy-title' })).toBeNull();
  });

  it('falls back to text title if backdrop title is not available', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/watch',
          search: '?type=tv&id=71914&season=1&episode=1',
          state: {
            fromModal: true,
            title: 'The Wheel of Time'
          }
        }]}
      >
        <Routes>
          <Route path="/watch" element={<Watch />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const textTitle = screen.getByText('The Wheel of Time', { selector: 'p.watch-lazy-title' });
      expect(textTitle).toBeDefined();
    });

    // Logo image should not be present
    expect(screen.queryByRole('img', { name: /logo/i })).toBeNull();
  });

  it('falls back to text title when backdrop title image fails to load (onError)', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/watch',
          search: '?type=tv&id=71914&season=1&episode=1',
          state: {
            fromModal: true,
            logoPath: '/broken_logo.png',
            title: 'The Wheel of Time'
          }
        }]}
      >
        <Routes>
          <Route path="/watch" element={<Watch />} />
        </Routes>
      </MemoryRouter>
    );

    const logoImg = await screen.findByRole('img', { name: /The Wheel of Time logo/i });
    expect(logoImg).toBeDefined();

    // Trigger onError on the logo image
    fireEvent.error(logoImg);

    // Should gracefully fallback to the text title
    await waitFor(() => {
      const textTitle = screen.getByText('The Wheel of Time', { selector: 'p.watch-lazy-title' });
      expect(textTitle).toBeDefined();
    });
    expect(screen.queryByRole('img', { name: /The Wheel of Time logo/i })).toBeNull();
  });

  it('uses cached logo from getCachedLogo when not passed in location state', async () => {
    mockGetCachedLogo.mockReturnValueOnce('/cached_wot_logo.png');

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/watch',
          search: '?type=tv&id=71914&season=1&episode=1',
          state: {
            fromModal: true,
            title: 'The Wheel of Time'
          }
        }]}
      >
        <Routes>
          <Route path="/watch" element={<Watch />} />
        </Routes>
      </MemoryRouter>
    );

    const logoImg = await screen.findByRole('img', { name: /The Wheel of Time logo/i });
    expect(logoImg).toBeDefined();
    expect(logoImg.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w500/cached_wot_logo.png');
  });
});
