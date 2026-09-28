import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NewEpisodeBadge from './NewEpisodeBadge';

describe('src/components/NewEpisodeBadge', () => {
  it('renders both badge pills with proper text and labels', () => {
    render(<NewEpisodeBadge />);

    const badge = screen.getByLabelText('New Episode - Watch Now');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('new-episode-badge');

    expect(screen.getByText('New Episode')).toBeInTheDocument();
    expect(screen.getByText('Watch Now')).toBeInTheDocument();
  });

  it('accepts custom className and style props', () => {
    render(<NewEpisodeBadge className="custom-test" style={{ opacity: 0.8 }} />);

    const badge = screen.getByLabelText('New Episode - Watch Now');
    expect(badge).toHaveClass('new-episode-badge');
    expect(badge).toHaveClass('custom-test');
    expect(badge).toHaveStyle({ opacity: '0.8' });
  });
});
