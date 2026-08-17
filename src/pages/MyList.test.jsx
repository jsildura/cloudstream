import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyList from './MyList';

let mockAuth = {
  isSignedIn: false,
  signInWithGoogle: vi.fn()
};

let mockWatchlist = {
  watchlist: [],
  isLoading: false,
  removeFromWatchlist: vi.fn(),
  clearWatchlist: vi.fn()
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth
}));

vi.mock('../hooks/useWatchlist', () => ({
  default: () => mockWatchlist
}));

vi.mock('../hooks/useTMDB', () => ({
  useTMDB: () => ({
    movieGenres: new Map(),
    tvGenres: new Map(),
    fetchCredits: vi.fn().mockResolvedValue([]),
    fetchContentRating: vi.fn().mockResolvedValue(null)
  })
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn()
  })
}));

describe('MyList Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      isSignedIn: false,
      signInWithGoogle: vi.fn()
    };
    mockWatchlist = {
      watchlist: [],
      isLoading: false,
      removeFromWatchlist: vi.fn(),
      clearWatchlist: vi.fn()
    };
  });

  it('renders loading state when isLoading is true', () => {
    mockAuth.isSignedIn = true;
    mockWatchlist.isLoading = true;

    render(
      <MemoryRouter>
        <MyList />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders signed-out CTA when user is not signed in', () => {
    mockAuth.isSignedIn = false;

    render(
      <MemoryRouter>
        <MyList />
      </MemoryRouter>
    );

    expect(screen.getByText(/Sign in to track your Watchlist/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign In with Google/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Sign In with Google/i }));
    expect(mockAuth.signInWithGoogle).toHaveBeenCalled();
  });

  it('renders empty list state when signed in with 0 items', () => {
    mockAuth.isSignedIn = true;
    mockWatchlist.watchlist = [];

    render(
      <MemoryRouter>
        <MyList />
      </MemoryRouter>
    );

    expect(screen.getByText(/Your list is empty/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Browse Movies & TV Shows/i })).toBeDefined();
  });

  it('renders watchlist grid when signed in with items', () => {
    mockAuth.isSignedIn = true;
    mockWatchlist.watchlist = [
      { id: 550, type: 'movie', title: 'Fight Club', vote_average: 8.4, addedAt: 100 },
      { id: 1399, type: 'tv', title: 'Game of Thrones', vote_average: 9.0, addedAt: 200 }
    ];

    render(
      <MemoryRouter>
        <MyList />
      </MemoryRouter>
    );

    expect(screen.getByText('Fight Club')).toBeDefined();
    expect(screen.getByText('Game of Thrones')).toBeDefined();
    expect(screen.getByText('2 items')).toBeDefined();
  });
});
