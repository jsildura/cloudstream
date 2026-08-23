import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useProfiles } from '../contexts/ProfileContext';
import { useProfileData } from '../contexts/ProfileDataContext';

// Navbar pulls in the whole settings panel; stub the sub-views so this file only
// exercises Navbar's own tab gating.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ isSignedIn: false, authEvent: null, clearAuthEvent: vi.fn() }))
}));

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: vi.fn(() => ({
    profiles: [],
    isProfileLoading: false,
    activeProfile: null,
    isKidsMode: false,
    isPinModalOpen: false,
    cancelKidsExit: vi.fn(),
    resetKidsUnlock: vi.fn()
  }))
}));

vi.mock('../contexts/ProfileDataContext', () => ({
  useProfileData: vi.fn(() => ({ isMigrationRequired: false }))
}));

vi.mock('./InstallAppButton', () => ({ default: () => null }));
vi.mock('./settings/AccountSettings', () => ({
  default: () => <div data-testid="account-settings" />
}));
vi.mock('./settings/ProfileSelectorSettings', () => ({ default: () => null }));
vi.mock('./settings/ProfileFormSettings', () => ({ default: () => null }));
vi.mock('./settings/KidsSettings', () => ({ default: () => null }));
vi.mock('./settings/PinSettings', () => ({
  default: () => <div data-testid="pin-settings" />
}));
vi.mock('./settings/DataMigrationSettings', () => ({
  default: () => <div data-testid="migration-settings" />
}));
vi.mock('./settings/AdFreeSettings', () => ({
  default: () => <div data-testid="adfree-settings" />
}));

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

const settingsPanel = () => document.querySelector('.navbar-settings-panel');

const openSettings = () => {
  // Navbar swallows clicks within 350ms of mount (ghost-click guard for the
  // watch-page back button), so step past that window first.
  act(() => {
    vi.advanceTimersByTime(400);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
};

describe('Navbar — Disable Ads tab gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: false, authEvent: null, clearAuthEvent: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the Disable Ads tab from signed-out visitors', () => {
    renderNavbar();
    openSettings();

    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.queryByText('Disable Ads')).not.toBeInTheDocument();
    expect(screen.queryByTestId('adfree-settings')).not.toBeInTheDocument();
  });

  it('shows the Disable Ads tab and its pane to signed-in accounts', () => {
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, authEvent: null, clearAuthEvent: vi.fn() });

    renderNavbar();
    openSettings();

    fireEvent.click(screen.getByText('Disable Ads'));

    expect(screen.getByTestId('adfree-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('account-settings')).not.toBeInTheDocument();
  });

  it('falls back to the Account tab when the user signs out while Disable Ads is open', () => {
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, authEvent: null, clearAuthEvent: vi.fn() });

    const { rerender } = renderNavbar();
    openSettings();
    fireEvent.click(screen.getByText('Disable Ads'));
    expect(screen.getByTestId('adfree-settings')).toBeInTheDocument();

    // Signing out must not leave the tab selected with an empty content pane.
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: false, authEvent: null, clearAuthEvent: vi.fn() });
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('adfree-settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Disable Ads')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-settings')).toBeInTheDocument();
  });
});

/**
 * App.jsx does not render the Navbar on /watch, /iptv/watch or /sports/watch, so
 * pressing "Back" in the player mounts a brand new Navbar. Any trigger that opens
 * the settings panel from *standing* state therefore replays on that return trip
 * and the panel appears to open on its own.
 *
 * These tests pin the invariant: auto-open only for a signal that arrives while
 * the Navbar is mounted. New auto-open triggers need a case here.
 */
describe('Navbar — settings panel auto-open', () => {
  const profilesValue = (overrides = {}) => ({
    profiles: [],
    isProfileLoading: false,
    activeProfile: null,
    isKidsMode: false,
    isPinModalOpen: false,
    cancelKidsExit: vi.fn(),
    resetKidsUnlock: vi.fn(),
    ...overrides
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: false, authEvent: null, clearAuthEvent: vi.fn() });
    vi.mocked(useProfiles).mockReturnValue(profilesValue());
    vi.mocked(useProfileData).mockReturnValue({ isMigrationRequired: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays closed on a fresh mount', () => {
    renderNavbar();
    expect(settingsPanel()).toBeNull();
  });

  it('opens when an interactive sign-in event arrives while mounted', () => {
    const clearAuthEvent = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: false, authEvent: null, clearAuthEvent });

    const { rerender } = renderNavbar();
    expect(settingsPanel()).toBeNull();

    vi.mocked(useAuth).mockReturnValue({
      isSignedIn: true,
      authEvent: { type: 'interactive-google-sign-in-complete', uid: 'u1' },
      clearAuthEvent
    });
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(settingsPanel()).not.toBeNull();
    // One-shot: consumed so no later mount can react to it again.
    expect(clearAuthEvent).toHaveBeenCalled();
  });

  it('does not open for a sign-in event that was already published before mount', () => {
    // Reproduces the reported bug: the user signed in earlier in the session, went
    // to /watch (Navbar unmounted) and pressed Back (Navbar mounts with the event
    // still sitting in AuthContext).
    const clearAuthEvent = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isSignedIn: true,
      authEvent: { type: 'interactive-google-sign-in-complete', uid: 'u1' },
      clearAuthEvent
    });

    renderNavbar();

    expect(settingsPanel()).toBeNull();
    // Still consumed, so it cannot linger for yet another mount.
    expect(clearAuthEvent).toHaveBeenCalled();
  });

  it('does not re-open after a consumed sign-in event when profiles later change', () => {
    const clearAuthEvent = vi.fn();
    const authEvent = { type: 'interactive-google-sign-in-complete', uid: 'u1' };
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: false, authEvent: null, clearAuthEvent });

    const { rerender } = renderNavbar();

    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, authEvent, clearAuthEvent });
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(settingsPanel()).not.toBeNull();

    // AuthContext has now cleared the event; the user dismissed the panel.
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, authEvent: null, clearAuthEvent });
    fireEvent.keyDown(window, { key: 'Escape' });
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(settingsPanel()).toBeNull();

    // A later profile-list update must not force the panel back open.
    vi.mocked(useProfiles).mockReturnValue(
      profilesValue({ profiles: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] })
    );
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(settingsPanel()).toBeNull();
  });

  it('does not open for a Kids-exit PIN request left pending before mount', () => {
    const cancelKidsExit = vi.fn();
    vi.mocked(useProfiles).mockReturnValue(profilesValue({ isPinModalOpen: true, cancelKidsExit }));

    renderNavbar();

    expect(settingsPanel()).toBeNull();
    // The keypad only exists inside the panel, so the stale request is cancelled —
    // otherwise the flag would block the next requestKidsExit() from transitioning.
    expect(cancelKidsExit).toHaveBeenCalled();
  });

  it('opens the PIN view when a Kids-exit request arrives while mounted', () => {
    const { rerender } = renderNavbar();
    expect(settingsPanel()).toBeNull();

    vi.mocked(useProfiles).mockReturnValue(profilesValue({ isPinModalOpen: true }));
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(settingsPanel()).not.toBeNull();
    expect(screen.getByTestId('pin-settings')).toBeInTheDocument();
  });

  it('cancels a pending Kids-exit request when the Navbar unmounts', () => {
    const cancelKidsExit = vi.fn();
    const { rerender, unmount } = renderNavbar();

    vi.mocked(useProfiles).mockReturnValue(profilesValue({ isPinModalOpen: true, cancelKidsExit }));
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );
    expect(cancelKidsExit).not.toHaveBeenCalled();

    // Entering a watch route removes the Navbar from the tree.
    unmount();
    expect(cancelKidsExit).toHaveBeenCalled();
  });

  it('does not open for a migration requirement that predates the mount', () => {
    vi.mocked(useProfileData).mockReturnValue({ isMigrationRequired: true });

    renderNavbar();

    expect(settingsPanel()).toBeNull();
  });

  it('opens the migration tab when the requirement is detected while mounted', () => {
    const { rerender } = renderNavbar();

    // isMigrationRequired starts false and flips once the legacy-data check
    // resolves, so a genuine first-load prompt still produces a transition.
    vi.mocked(useProfileData).mockReturnValue({ isMigrationRequired: true });
    rerender(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    expect(settingsPanel()).not.toBeNull();
    expect(screen.getByTestId('migration-settings')).toBeInTheDocument();
  });
});
