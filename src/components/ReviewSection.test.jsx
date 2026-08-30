import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReviewSection from './ReviewSection';

vi.mock('../hooks/useTMDBReviews', () => ({
  default: () => ({
    reviews: [
      {
        id: '1',
        author: 'John Doe',
        username: 'johndoe',
        avatarUrl: null,
        rating: 8,
        content: 'Great movie! Highly recommended.',
        createdAt: '2026-01-01T00:00:00.000Z',
        url: 'https://tmdb.org/review/1'
      }
    ],
    totalResults: 1,
    loading: false,
    error: null
  })
}));

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => ({ isKidsMode: false })
}));

describe('ReviewSection Collapsible Behavior', () => {
  it('renders collapsed by default', () => {
    render(<ReviewSection contentId={123} type="movie" voteAverage={8.5} voteCount={100} />);

    const header = screen.getByRole('button', { name: /Audience Reviews/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Great movie! Highly recommended.')).toBeNull();
  });

  it('expands when header is clicked', () => {
    render(<ReviewSection contentId={123} type="movie" voteAverage={8.5} voteCount={100} />);

    const header = screen.getByRole('button', { name: /Audience Reviews/i });
    fireEvent.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Great movie! Highly recommended.')).toBeDefined();
  });

  it('toggles using keyboard Enter and Space keys', () => {
    render(<ReviewSection contentId={123} type="movie" voteAverage={8.5} voteCount={100} />);

    const header = screen.getByRole('button', { name: /Audience Reviews/i });

    // Press Enter to expand
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Great movie! Highly recommended.')).toBeDefined();

    // Press Space to collapse again
    fireEvent.keyDown(header, { key: ' ' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Great movie! Highly recommended.')).toBeNull();
  });
});
