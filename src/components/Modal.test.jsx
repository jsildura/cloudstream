import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Modal from './Modal';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

const mockFetchTVDetails = vi.fn();
const mockFetchSeasonEpisodes = vi.fn();
const mockFetchVideos = vi.fn().mockResolvedValue(null);
const mockFetchLogo = vi.fn().mockResolvedValue('/logo.png');
const mockFetchCredits = vi.fn().mockResolvedValue(['Alan Ritchson', 'Malcolm Goodwin']);
const mockFetchContentRating = vi.fn().mockResolvedValue('TV-MA');
const mockFetchMovieRecs = vi.fn().mockResolvedValue([]);
const mockFetchTVRecs = vi.fn().mockResolvedValue([]);

vi.mock('../hooks/useTMDB', () => ({
  useTMDB: () => ({
    BACKDROP_URL: 'https://image.tmdb.org/t/p/w1280',
    POSTER_URL: 'https://image.tmdb.org/t/p/w500',
    fetchVideos: mockFetchVideos,
    fetchLogo: mockFetchLogo,
    fetchCredits: mockFetchCredits,
    fetchContentRating: mockFetchContentRating,
    fetchTVDetails: mockFetchTVDetails,
    fetchSeasonEpisodes: mockFetchSeasonEpisodes,
    fetchMovieRecommendations: mockFetchMovieRecs,
    fetchTVRecommendations: mockFetchTVRecs,
    movieGenres: [],
    tvGenres: []
  })
}));

const mockWatchlist = {
  isInWatchlist: vi.fn().mockReturnValue(false),
  toggleWatchlist: vi.fn()
};
vi.mock('../hooks/useWatchlist', () => ({
  default: () => mockWatchlist
}));

const profileContextVal = { isKidsMode: false };
vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => profileContextVal
}));

const toastContextVal = { showSuccess: vi.fn(), showError: vi.fn() };
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => toastContextVal
}));

vi.mock('../utils/adGating', () => ({
  maybeOpenSmartlinkAd: vi.fn()
}));

vi.mock('./ReviewSection', () => ({
  default: () => (
    <div className="review-section">
      <button className="review-section-header">Audience Reviews</button>
    </div>
  )
}));

vi.mock('./SchemaMarkup', () => ({
  default: () => null
}));

describe('Modal - Season & Episode Selector for TV Shows', () => {
  const mockOnClose = vi.fn();
  const tvItem = {
    id: 108978,
    name: 'Reacher',
    type: 'tv',
    overview: 'Jack Reacher, a veteran military police investigator, enters civilian life...',
    poster_path: '/reacher_main.jpg',
    backdrop_path: '/reacher_backdrop.jpg',
    first_air_date: '2022-02-03',
    vote_average: 8.1,
    vote_count: 2500
  };

  const tvDetailsMock = {
    id: 108978,
    name: 'Reacher',
    number_of_seasons: 4,
    seasons: [
      { id: 101, season_number: 0, name: 'Specials', poster_path: '/specials.jpg', episode_count: 2, air_date: '2022-01-01' },
      { id: 102, season_number: 1, name: 'Season 1', poster_path: '/reacher_s1.jpg', episode_count: 8, air_date: '2022-02-03' },
      { id: 103, season_number: 2, name: 'Season 2', poster_path: '/reacher_s2.jpg', episode_count: 8, air_date: '2023-12-14' },
      { id: 104, season_number: 3, name: 'Season 3', poster_path: '/reacher_s3.jpg', episode_count: 8, air_date: '2024-12-15' },
      { id: 105, season_number: 4, name: 'Season 4', poster_path: '/reacher_s4.jpg', episode_count: 8, air_date: '2026-08-12' }
    ]
  };

  const mockEpisodes = [
    { id: 1, episode_number: 1, name: 'Welcome to Margrave', air_date: '2026-08-12', runtime: 46, vote_average: 6.5, still_path: '/s1.jpg' },
    { id: 2, episode_number: 2, name: 'First Dance', air_date: '2026-08-12', runtime: 48, vote_average: 6.3, still_path: '/s2.jpg' },
    { id: 3, episode_number: 3, name: 'Spoonful', air_date: '2026-08-12', runtime: 44, vote_average: 6.3, still_path: '/s3.jpg' },
    { id: 4, episode_number: 4, name: 'In a Tree', air_date: '2026-08-19', runtime: 44, vote_average: 6.5, still_path: '/s4.jpg' },
    { id: 5, episode_number: 5, name: 'No Apologies', air_date: '2026-08-26', runtime: 47, vote_average: 6.6, still_path: '/s5.jpg' },
    { id: 6, episode_number: 6, name: 'Papier', air_date: '2026-09-02', runtime: 39, vote_average: 6.8, still_path: '/s6.jpg' },
    { id: 7, episode_number: 7, name: 'Reacher Said Nothing', air_date: '2026-09-09', runtime: 42, vote_average: 7.0, still_path: '/s7.jpg' },
    { id: 8, episode_number: 8, name: 'Pie', air_date: '2026-09-16', runtime: 45, vote_average: 7.2, still_path: '/s8.jpg' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchTVDetails.mockResolvedValue(tvDetailsMock);
    mockFetchSeasonEpisodes.mockResolvedValue(mockEpisodes);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders season selector before review-section-header for TV shows', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Seasons')).toBeDefined();
    });

    expect(screen.getByText('4 seasons')).toBeDefined();

    const seasonsSection = document.body.querySelector('.modal-seasons-section');
    const reviewHeader = document.body.querySelector('.review-section-header');

    expect(seasonsSection).toBeTruthy();
    expect(reviewHeader).toBeTruthy();
    expect(Boolean(seasonsSection.compareDocumentPosition(reviewHeader) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('renders all numbered season cards with posters and selects latest aired season by default', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('4 seasons')).toBeDefined();
    });

    const seasonCards = screen.getAllByRole('button', { name: /Season/i });
    expect(seasonCards).toHaveLength(4);

    // Season 4 is the latest aired season and should be selected by default
    expect(seasonCards[3].classList.contains('selected')).toBe(true);
    expect(seasonCards[3]).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes selected season when clicking a different season card', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('4 seasons')).toBeDefined();
    });

    const seasonCards = screen.getAllByRole('button', { name: /Season/i });

    // Initially Season 4 is selected
    expect(seasonCards[3].classList.contains('selected')).toBe(true);

    // Click Season 1
    fireEvent.click(seasonCards[0]);

    await waitFor(() => {
      const updatedCards = screen.getAllByRole('button', { name: /Season/i });
      expect(updatedCards[0].classList.contains('selected')).toBe(true);
      expect(updatedCards[0]).toHaveAttribute('aria-pressed', 'true');
      expect(updatedCards[3].classList.contains('selected')).toBe(false);
    });
  });

  it('navigates to the selected season when clicking Watch Now', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('4 seasons')).toBeDefined();
    });

    // Watch Now should default to latest aired season (Season 4)
    const watchNowBtn = screen.getByRole('button', { name: /Watch Now/i });
    fireEvent.click(watchNowBtn);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/watch?type=tv&id=108978&season=4&episode=1',
      { state: { fromModal: true } }
    );
  });

  it('renders episodes area with default hidden spoilers, exactly 6 visible, and show more button', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Season 4 Episodes/i)).toBeDefined();
    });

    expect(screen.getByText('8 episodes')).toBeDefined();

    // Verify hidden spoilers by default
    const hiddenLabels = screen.getAllByText('Spoiler Hidden');
    expect(hiddenLabels.length).toBe(6);

    const spoilerBtn = screen.getByRole('button', { name: /Show Spoilers/i });
    expect(spoilerBtn).toBeDefined();

    // Verify visible count defaulting to 6
    const episodeCards = screen.getAllByRole('button', { name: /Play Episode/i });
    expect(episodeCards).toHaveLength(6);

    // Verify Show More button exists
    const showMoreBtn = screen.getByRole('button', { name: /Show More/i });
    expect(showMoreBtn).toBeDefined();

    // Click Show More
    fireEvent.click(showMoreBtn);

    await waitFor(() => {
      const allEpisodes = screen.getAllByRole('button', { name: /Play Episode/i });
      expect(allEpisodes).toHaveLength(8);
    });

    // Toggle spoilers to revealed
    fireEvent.click(spoilerBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Hide Spoilers/i })).toBeDefined();
      expect(screen.queryByText('Spoiler Hidden')).toBeNull();
    });
  });

  it('navigates to the clicked episode playback when an episode is clicked', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Season 4 Episodes/i)).toBeDefined();
    });

    const ep3 = screen.getByRole('button', { name: /Play Episode 3/i });
    fireEvent.click(ep3);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/watch?type=tv&id=108978&season=4&episode=3',
      { state: { fromModal: true } }
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('color codes episode rating badges based on score (green rating-high for 7.0+)', async () => {
    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Season 4 Episodes/i)).toBeDefined();
    });

    // Expand all episodes so ep 7 and ep 8 (rating >= 7.0) are in the DOM
    const showMoreBtn = screen.getByRole('button', { name: /Show More/i });
    fireEvent.click(showMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('7.2')).toBeDefined();
    });

    const badge72 = screen.getByText('7.2').closest('.modal-episode-rating-badge');
    const badge70 = screen.getByText('7.0').closest('.modal-episode-rating-badge');
    const badge65 = screen.getAllByText('6.5')[0].closest('.modal-episode-rating-badge');

    expect(badge72.classList.contains('rating-high')).toBe(true);
    expect(badge70.classList.contains('rating-high')).toBe(true);
    expect(badge65.classList.contains('rating-mid')).toBe(true);
  });

  it('ignores future unreleased seasons and selects the latest aired season', async () => {
    const tvWithFutureSeason = {
      ...tvDetailsMock,
      seasons: [
        ...tvDetailsMock.seasons,
        { id: 106, season_number: 5, name: 'Season 5', poster_path: '/reacher_s5.jpg', episode_count: 8, air_date: '2099-01-01' }
      ]
    };
    mockFetchTVDetails.mockResolvedValue(tvWithFutureSeason);

    render(<Modal item={tvItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('5 seasons')).toBeDefined();
    });

    const seasonCards = screen.getAllByRole('button', { name: /Season/i });
    // Season 4 (index 3) is latest aired; Season 5 (index 4) is future unreleased
    expect(seasonCards[3].classList.contains('selected')).toBe(true);
    expect(seasonCards[4].classList.contains('selected')).toBe(false);
  });

  it('does NOT render season selector or episodes for movie content', async () => {
    const movieItem = {
      id: 550,
      title: 'Fight Club',
      type: 'movie',
      overview: 'An insomniac office worker...',
      poster_path: '/fight_club.jpg'
    };

    render(<Modal item={movieItem} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/An insomniac office worker/i)).toBeDefined();
    });

    expect(screen.queryByText('Seasons')).toBeNull();
    expect(screen.queryByText(/Episodes/i)).toBeNull();
  });
});
