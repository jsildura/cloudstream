import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BannerSlider from './BannerSlider';

vi.mock('../hooks/useTMDB', () => ({
  pickLogoPath: vi.fn(() => null),
  pickTrailerKey: vi.fn(() => null),
  parseContentRating: vi.fn(() => null),
  useTMDB: () => ({
    BACKDROP_URL: 'https://images.test',
    POSTER_URL: 'https://posters.test',
    LOGO_URL: 'https://logos.test',
    fetchItemBundle: vi.fn().mockResolvedValue(null),
    fetchSeasonEpisodes: vi.fn().mockResolvedValue([]),
    movieGenres: new Map(),
    tvGenres: new Map(),
  }),
}));

vi.mock('../hooks/useWatchlist', () => ({
  default: () => ({
    isInWatchlist: vi.fn(() => false),
    toggleWatchlist: vi.fn(),
  }),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('../hooks/useTVDetect', () => ({ default: () => false }));
vi.mock('./YouTubePlayer', () => ({ default: () => null }));

const makeMovies = (prefix, count) => Array.from({ length: count }, (_, index) => ({
  id: index + 1,
  title: `${prefix} ${index + 1}`,
  media_type: 'movie',
  release_date: '2026-01-01',
  backdrop_path: `/backdrop-${index + 1}.jpg`,
  poster_path: `/poster-${index + 1}.jpg`,
}));

describe('BannerSlider', () => {
  it('resets to a valid slide when movies is replaced by a shorter list', () => {
    const initialMovies = makeMovies('Initial', 5);
    const { rerender } = render(
      <MemoryRouter>
        <BannerSlider movies={initialMovies} onItemClick={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 5' }));
    expect(screen.getByRole('heading', { name: 'Initial 5' })).toBeInTheDocument();

    const shorterMovies = makeMovies('Replacement', 2);
    expect(() => rerender(
      <MemoryRouter>
        <BannerSlider movies={shorterMovies} onItemClick={vi.fn()} />
      </MemoryRouter>
    )).not.toThrow();

    expect(screen.getByRole('heading', { name: 'Replacement 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to slide 1' })).toHaveClass('active');
  });

  it('renders h2.banner-title-new without span.title-highlight and displays plain title text', () => {
    const movies = [{
      id: 99,
      title: 'Rage of Stars',
      media_type: 'movie',
      release_date: '2026-01-01',
      backdrop_path: '/rage.jpg',
      poster_path: '/rage-poster.jpg',
    }];
    render(
      <MemoryRouter>
        <BannerSlider movies={movies} onItemClick={vi.fn()} />
      </MemoryRouter>
    );

    const titleHeading = screen.getByRole('heading', { name: 'Rage of Stars' });
    expect(titleHeading).toBeInTheDocument();
    expect(titleHeading).toHaveClass('banner-title-new');
    expect(titleHeading.querySelector('.title-highlight')).toBeNull();
    expect(titleHeading.textContent).toBe('Rage of Stars');
    expect(titleHeading.style.getPropertyValue('--poster-url')).toContain('/rage-poster.jpg');
  });
});
