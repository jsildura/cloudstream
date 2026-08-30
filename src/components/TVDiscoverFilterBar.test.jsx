import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TVDiscoverFilterBar from './TVDiscoverFilterBar';
import MovieDiscoverFilterBar from './MovieDiscoverFilterBar';
import { TV_BAR_CATEGORIES, MOVIE_BAR_CATEGORIES, GENRE_COLORS } from '../constants/genres';

vi.mock('../hooks/useGenreBackdrops', () => ({
  default: () => ({})
}));

describe('TVDiscoverFilterBar', () => {
  const originalWidth = window.innerWidth;

  afterEach(() => {
    window.innerWidth = originalWidth;
  });

  it('renders header with title, subtitle, indicator, and more-group above genres when variant is cards', () => {
    const { container } = render(
      <TVDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
      />
    );

    const bar = container.querySelector('.tv-discover-filterbar');
    expect(bar).toHaveClass('tv-discover-filterbar--cards');

    // Header exists
    const header = container.querySelector('.tv-filter-header');
    expect(header).toBeInTheDocument();

    // Title and subtitle are present
    expect(screen.getByText('Genres')).toBeInTheDocument();
    expect(screen.getByText('Find something by mood')).toBeInTheDocument();

    // Red indicator bar is present
    expect(container.querySelector('.tv-filter-title-indicator')).toBeInTheDocument();

    // More group is inside the header
    expect(header.querySelector('.tv-filter-more-group')).toBeInTheDocument();

    // Header comes before genres
    const children = Array.from(bar.children);
    const headerIndex = children.indexOf(header);
    const genresIndex = children.findIndex(el => el.classList.contains('tv-filter-genres') || el.querySelector('.tv-filter-genres'));

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(genresIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeLessThan(genresIndex);

    // Carousel control buttons are present
    expect(container.querySelector('.carousel-control-btn.left')).toBeInTheDocument();
    expect(container.querySelector('.carousel-control-btn.right')).toBeInTheDocument();
  });

  it('renders custom title and subtitle when provided', () => {
    render(
      <TVDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
        title="Featured Categories"
        subtitle="Explore our top selections"
      />
    );

    expect(screen.getByText('Featured Categories')).toBeInTheDocument();
    expect(screen.getByText('Explore our top selections')).toBeInTheDocument();
  });

  it('renders more-group directly after genres without header when variant is pills', () => {
    const { container } = render(
      <TVDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="pills"
      />
    );

    const bar = container.querySelector('.tv-discover-filterbar');
    expect(bar).not.toHaveClass('tv-discover-filterbar--cards');
    expect(container.querySelector('.tv-filter-header')).not.toBeInTheDocument();

    const children = Array.from(bar.children);
    const moreGroupIndex = children.findIndex(el => el.classList.contains('tv-filter-more-group'));
    const genresIndex = children.findIndex(el => el.classList.contains('tv-filter-genres'));

    expect(moreGroupIndex).toBeGreaterThanOrEqual(0);
    expect(genresIndex).toBeGreaterThanOrEqual(0);
    expect(moreGroupIndex).toBeGreaterThan(genresIndex);

    // No carousel controls in pills mode
    expect(container.querySelector('.carousel-control-btn')).not.toBeInTheDocument();
  });

  it('shows all genre pills on mobile viewports (<= 768px)', () => {
    window.innerWidth = 390;
    const { container } = render(
      <TVDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
      />
    );

    const buttons = container.querySelectorAll('.tv-filter-genres .tv-filter-pill');
    expect(buttons.length).toBe(TV_BAR_CATEGORIES.length);
  });

  it('renders card shade and applies dominant genre color variables when variant is cards', () => {
    const { container } = render(
      <TVDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
      />
    );

    const cards = container.querySelectorAll('.tv-filter-pill--card');
    expect(cards.length).toBeGreaterThan(0);

    const firstCard = cards[0];
    expect(firstCard.querySelector('.tv-filter-pill-shade')).toBeInTheDocument();
    expect(firstCard.querySelector('.tv-filter-pill-label')).toBeInTheDocument();
    expect(firstCard.style.getPropertyValue('--genre-color')).toBeTruthy();
    expect(firstCard.style.getPropertyValue('--genre-rgb')).toBeTruthy();
    // Loading skeleton is present while backdrop image is loading
    expect(firstCard.querySelector('.tv-filter-pill-card-skeleton')).toBeInTheDocument();
  });

  it('renders card skeletons when loading is true in cards mode', () => {
    const { container } = render(
      <TVDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
        loading={true}
      />
    );

    const skeletons = container.querySelectorAll('.tv-filter-genres--cards .tv-filter-pill-skeleton');
    expect(skeletons.length).toBe(8);
    expect(skeletons[0]).toHaveClass('tv-filter-pill--card');
  });
});

describe('MovieDiscoverFilterBar', () => {
  const originalWidth = window.innerWidth;

  afterEach(() => {
    window.innerWidth = originalWidth;
  });

  it('renders header with title, subtitle, indicator, and more-group above genres when variant is cards', () => {
    const { container } = render(
      <MovieDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
      />
    );

    const bar = container.querySelector('.tv-discover-filterbar');
    expect(bar).toHaveClass('tv-discover-filterbar--cards');

    const header = container.querySelector('.tv-filter-header');
    expect(header).toBeInTheDocument();
    expect(screen.getByText('Genres')).toBeInTheDocument();
    expect(screen.getByText('Find something by mood')).toBeInTheDocument();
    expect(container.querySelector('.tv-filter-title-indicator')).toBeInTheDocument();
    expect(header.querySelector('.tv-filter-more-group')).toBeInTheDocument();

    const children = Array.from(bar.children);
    const headerIndex = children.indexOf(header);
    const genresIndex = children.findIndex(el => el.classList.contains('tv-filter-genres') || el.querySelector('.tv-filter-genres'));

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(genresIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeLessThan(genresIndex);

    // Carousel control buttons are present
    expect(container.querySelector('.carousel-control-btn.left')).toBeInTheDocument();
    expect(container.querySelector('.carousel-control-btn.right')).toBeInTheDocument();
  });

  it('renders more-group after genres without header when variant is pills', () => {
    const { container } = render(
      <MovieDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="pills"
      />
    );

    const bar = container.querySelector('.tv-discover-filterbar');
    expect(bar).not.toHaveClass('tv-discover-filterbar--cards');
    expect(container.querySelector('.tv-filter-header')).not.toBeInTheDocument();

    const children = Array.from(bar.children);
    const moreGroupIndex = children.findIndex(el => el.classList.contains('tv-filter-more-group'));
    const genresIndex = children.findIndex(el => el.classList.contains('tv-filter-genres'));

    expect(moreGroupIndex).toBeGreaterThanOrEqual(0);
    expect(genresIndex).toBeGreaterThanOrEqual(0);
    expect(moreGroupIndex).toBeGreaterThan(genresIndex);

    expect(container.querySelector('.carousel-control-btn')).not.toBeInTheDocument();
  });

  it('shows all genre pills on mobile viewports (<= 768px)', () => {
    window.innerWidth = 390;
    const { container } = render(
      <MovieDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
      />
    );

    const buttons = container.querySelectorAll('.tv-filter-genres .tv-filter-pill');
    expect(buttons.length).toBe(MOVIE_BAR_CATEGORIES.length);
  });

  it('renders card shade and applies dominant genre color variables when variant is cards', () => {
    const { container } = render(
      <MovieDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
      />
    );

    const cards = container.querySelectorAll('.tv-filter-pill--card');
    expect(cards.length).toBeGreaterThan(0);

    const firstCard = cards[0];
    expect(firstCard.querySelector('.tv-filter-pill-shade')).toBeInTheDocument();
    expect(firstCard.querySelector('.tv-filter-pill-label')).toBeInTheDocument();
    expect(firstCard.style.getPropertyValue('--genre-color')).toBeTruthy();
    expect(firstCard.style.getPropertyValue('--genre-rgb')).toBeTruthy();
    expect(firstCard.querySelector('.tv-filter-pill-card-skeleton')).toBeInTheDocument();
  });

  it('renders card skeletons when loading is true in cards mode', () => {
    const { container } = render(
      <MovieDiscoverFilterBar
        filters={{}}
        onFilterChange={() => { }}
        onMoreClick={() => { }}
        variant="cards"
        loading={true}
      />
    );

    const skeletons = container.querySelectorAll('.tv-filter-genres--cards .tv-filter-pill-skeleton');
    expect(skeletons.length).toBe(8);
    expect(skeletons[0]).toHaveClass('tv-filter-pill--card');
  });

  it('verifies exact colors for Horror, Romance, and Adventure match the photo reference', () => {
    expect(GENRE_COLORS['Horror']).toEqual({ hex: '#4a1259', rgb: '74, 18, 89' });
    expect(GENRE_COLORS['Romance']).toEqual({ hex: '#991b1b', rgb: '153, 27, 27' });
    expect(GENRE_COLORS['Adventure']).toEqual({ hex: '#854d0e', rgb: '133, 77, 14' });
  });
});
