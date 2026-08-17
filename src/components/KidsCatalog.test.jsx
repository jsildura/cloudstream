import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

let mockProfiles = {
  isKidsMode: true,
  isProfileLoading: false
};

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() })
}));

vi.mock('../hooks/useTMDB', () => ({
  useTMDB: () => ({
    movieGenres: new Map(),
    tvGenres: new Map(),
    fetchNowPlaying: vi.fn().mockResolvedValue([]),
    fetchPopularByRegion: vi.fn().mockResolvedValue([]),
    fetchCredits: vi.fn().mockResolvedValue([]),
    fetchContentRating: vi.fn().mockResolvedValue(null)
  })
}));

const mockBuildKidsCatalog = vi.fn();
vi.mock('../lib/kidsCatalog', () => ({
  buildKidsCatalog: (...args) => mockBuildKidsCatalog(...args)
}));

// Mock BannerSlider & TopTenRow
vi.mock('./BannerSlider', () => ({
  default: ({ movies, loading }) => (
    <div data-testid="banner-slider">Banner ({movies.length} items, loading: {String(loading)})</div>
  )
}));

vi.mock('./TopTenRow', () => ({
  default: ({ items, title, showRanks = true }) => (
    <div data-testid={`carousel-row-${title}`}>{title || 'Top 10'} ({items.length} items, ranks: {String(showRanks)})</div>
  )
}));

vi.mock('./PopularCollections', () => ({
  default: () => <div data-testid="popular-collections">Popular Collections</div>
}));

vi.mock('./ContinueWatching', () => ({
  default: () => <div data-testid="continue-watching">Continue Watching</div>
}));

vi.mock('./RecommendedForYou', () => ({
  default: () => null
}));

vi.mock('./LazyLoadSection', () => ({
  default: ({ children }) => <div>{children}</div>
}));

vi.mock('./NativeAd', () => ({
  default: () => <section data-testid="native-ad">Native Ad</section>
}));

vi.mock('./SpreadTheWordModal', () => ({
  default: () => null
}));

vi.mock('./MetaTags', () => ({
  default: () => null
}));

describe('Home Page Kids Catalog Composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = { isKidsMode: true, isProfileLoading: false };
  });

  it('renders Kids sections meeting minimum thresholds and hides Popular Collections', async () => {
    const makeItems = (count, type = 'movie') =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        title: `Item ${i + 1}`,
        media_type: type,
        backdrop_path: `/backdrop${i}.jpg`
      }));

    mockBuildKidsCatalog.mockResolvedValueOnce({
      bannerItems: makeItems(5),
      sections: {
        familyMovies: makeItems(10),
        familyShows: makeItems(10, 'tv'),
        animationMovies: makeItems(8),
        kidsShows: makeItems(8, 'tv')
      },
      allApproved: makeItems(12)
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('carousel-row-Top 10 for Kids')).toBeDefined();
      expect(screen.getByTestId('carousel-row-Top 10 for Kids')).toHaveTextContent('10 items, ranks: true');
      expect(screen.queryByTestId('carousel-row-Popular for Kids')).toBeNull();
      expect(screen.getByTestId('carousel-row-Trending for Kids')).toHaveTextContent('ranks: false');
      expect(screen.getByTestId('carousel-row-Animated Favorites')).toHaveTextContent('ranks: false');
      expect(screen.getByTestId('carousel-row-Kids Shows')).toHaveTextContent('ranks: false');
    });

    // Popular Collections must NOT be present in Kids mode
    expect(screen.queryByTestId('popular-collections')).toBeNull();
    expect(screen.queryByTestId('native-ad')).toBeNull();
  });

  it('hides sections that do not meet minimum thresholds in Kids mode', async () => {
    const makeItems = (count, type = 'movie') =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        title: `Item ${i + 1}`,
        media_type: type
      }));

    // Sparser feed below thresholds (e.g. only 3 top ten items, min is 5)
    mockBuildKidsCatalog.mockResolvedValueOnce({
      bannerItems: [],
      sections: {
        familyMovies: makeItems(4), // < 8 min
        familyShows: [],
        animationMovies: makeItems(2), // < 6 min
        kidsShows: []
      },
      allApproved: makeItems(3) // < 5 min
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('continue-watching')).toBeDefined();
    });

    expect(screen.queryByTestId('carousel-row-Top 10 for Kids')).toBeNull();
    expect(screen.queryByTestId('carousel-row-Popular for Kids')).toBeNull();
    expect(screen.queryByTestId('carousel-row-Animated Favorites')).toBeNull();
    expect(screen.queryByTestId('popular-collections')).toBeNull();
  });
});
