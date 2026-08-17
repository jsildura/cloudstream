import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GlobalChatSignInWall from './GlobalChatSignInWall';

describe('GlobalChatSignInWall Component (Passive Participation Wall)', () => {
  it('renders passive participation notice directing users to Settings', () => {
    render(<GlobalChatSignInWall />);
    expect(screen.getByRole('heading', { name: /sign in in settings to participate in globalchat/i })).toBeInTheDocument();
    expect(screen.getByText(/chat with the community, share recommendations/i)).toBeInTheDocument();
  });

  it('contains no Google sign-in button or interactive authentication controls', () => {
    render(<GlobalChatSignInWall />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByAltText(/google/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders community perks information', () => {
    render(<GlobalChatSignInWall />);
    expect(screen.getByText(/real, verified profiles/i)).toBeInTheDocument();
    expect(screen.getByText(/live movie & show recommendations/i)).toBeInTheDocument();
    expect(screen.getByText(/community chat/i)).toBeInTheDocument();
  });
});
