import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RequireActiveProfile from './RequireActiveProfile';

let mockAuthContext = {
  isSignedIn: false,
  isAuthLoading: false
};

let mockProfileContext = {
  activeProfile: null,
  isProfileLoading: false,
  profileError: null
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext
}));

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfileContext
}));

describe('RequireActiveProfile Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthContext = {
      isSignedIn: false,
      isAuthLoading: false
    };
    mockProfileContext = {
      activeProfile: null,
      isProfileLoading: false,
      profileError: null
    };
  });

  it('renders fallback during auth loading', () => {
    mockAuthContext.isAuthLoading = true;
    render(
      <RequireActiveProfile fallback={<div data-testid="loader">Loading...</div>}>
        <div data-testid="content">Protected Content</div>
      </RequireActiveProfile>
    );

    expect(screen.getByTestId('loader')).toBeDefined();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders fallback during profile loading for signed-in user', () => {
    mockAuthContext.isSignedIn = true;
    mockProfileContext.isProfileLoading = true;
    render(
      <RequireActiveProfile fallback={<div data-testid="loader">Loading Profiles...</div>}>
        <div data-testid="content">Protected Content</div>
      </RequireActiveProfile>
    );

    expect(screen.getByTestId('loader')).toBeDefined();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders signedOutFallback when user is not signed in and requireAuth is true', () => {
    mockAuthContext.isSignedIn = false;
    render(
      <RequireActiveProfile signedOutFallback={<div data-testid="signin-prompt">Please Sign In</div>}>
        <div data-testid="content">Protected Content</div>
      </RequireActiveProfile>
    );

    expect(screen.getByTestId('signin-prompt')).toBeDefined();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders children when signed in with valid active profile', () => {
    mockAuthContext.isSignedIn = true;
    mockProfileContext.activeProfile = { id: '-Nx12345678901234567', name: 'Alice' };
    render(
      <RequireActiveProfile>
        <div data-testid="content">Protected Content</div>
      </RequireActiveProfile>
    );

    expect(screen.getByTestId('content')).toBeDefined();
  });

  it('renders fallback when profileError exists', () => {
    mockAuthContext.isSignedIn = true;
    mockProfileContext.activeProfile = null;
    mockProfileContext.profileError = 'malformed-account';
    render(
      <RequireActiveProfile fallback={<div data-testid="error-fallback">Error Loading Profile</div>}>
        <div data-testid="content">Protected Content</div>
      </RequireActiveProfile>
    );

    expect(screen.getByTestId('error-fallback')).toBeDefined();
    expect(screen.queryByTestId('content')).toBeNull();
  });
});
