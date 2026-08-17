import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AccountSettings from './AccountSettings';

let mockAuth = {
  accountUser: null,
  isSignedIn: false,
  signInWithGoogle: vi.fn(),
  signOutAccount: vi.fn()
};

let mockProfiles = {
  activeProfile: null,
  isKidsMode: false,
  requestKidsExit: vi.fn()
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuth
}));

vi.mock('../../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn()
  })
}));

describe('AccountSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      accountUser: null,
      isSignedIn: false,
      signInWithGoogle: vi.fn(),
      signOutAccount: vi.fn()
    };
    mockProfiles = {
      activeProfile: null,
      isKidsMode: false,
      requestKidsExit: vi.fn()
    };
  });

  it('renders Google sign-in within .navbar-settings-signin when user is not signed in', () => {
    const { container } = render(<AccountSettings onClose={() => {}} />);

    const signinSection = container.querySelector('.navbar-settings-signin');
    expect(signinSection).not.toBeNull();
    expect(screen.getByText(/WELCOME/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in to continue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle when Google sign-in button is clicked in Settings', async () => {
    mockAuth.signInWithGoogle.mockResolvedValue({ ok: true });
    render(<AccountSettings onClose={() => {}} />);

    const btn = screen.getByRole('button', { name: /Sign in with Google/i });
    await React.act(async () => {
      fireEvent.click(btn);
    });

    expect(mockAuth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('renders connected account details and active profile when signed in', () => {
    mockAuth.isSignedIn = true;
    mockAuth.accountUser = {
      displayName: 'Alice Cooper',
      email: 'alice@example.com'
    };
    mockProfiles.activeProfile = {
      id: '-Nx12345678901234567',
      name: 'Alice',
      avatar: 'avatar_01',
      isKids: false
    };

    render(
      <AccountSettings
        onClose={() => {}}
        onNavigateToProfiles={() => {}}
      />
    );

    expect(screen.getByText(/CONNECTED ACCOUNT/i)).toBeDefined();
    expect(screen.getByText('Alice Cooper')).toBeDefined();
    expect(screen.getByText('alice@example.com')).toBeDefined();
    expect(screen.getByText('Active Profile')).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign Out of Google/i })).toBeDefined();
  });

  it('handles sign-out when sign-out button is clicked', async () => {
    mockAuth.isSignedIn = true;
    mockAuth.accountUser = { displayName: 'Bob', email: 'bob@example.com' };
    mockAuth.signOutAccount.mockResolvedValue({ ok: true });

    render(<AccountSettings onClose={() => {}} />);

    const signOutBtn = screen.getByRole('button', { name: /Sign Out of Google/i });
    await React.act(async () => {
      fireEvent.click(signOutBtn);
    });

    expect(mockAuth.signOutAccount).toHaveBeenCalled();
  });

  it('requests Kids exit when attempting sign-out in Kids mode', () => {
    mockAuth.isSignedIn = true;
    mockAuth.accountUser = { displayName: 'Parent', email: 'parent@example.com' };
    mockProfiles.isKidsMode = true;
    mockProfiles.requestKidsExit.mockReturnValue({ ok: true, modalOpened: true });
    const onNavigateToPin = vi.fn();

    render(
      <AccountSettings
        onClose={() => {}}
        onNavigateToPin={onNavigateToPin}
      />
    );

    const signOutBtn = screen.getByRole('button', { name: /Sign Out of Google/i });
    fireEvent.click(signOutBtn);

    expect(mockProfiles.requestKidsExit).toHaveBeenCalled();
    expect(onNavigateToPin).toHaveBeenCalled();
    expect(mockAuth.signOutAccount).not.toHaveBeenCalled();
  });
});
