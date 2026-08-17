import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileSelectorSettings from './ProfileSelectorSettings';

let mockProfiles = {
  profiles: [],
  activeProfileId: null,
  selectProfile: vi.fn(),
  isKidsMode: false,
  requestKidsExit: vi.fn()
};

vi.mock('../../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn()
  })
}));

describe('ProfileSelectorSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = {
      profiles: [
        { id: '-Nx12345678901234567', name: 'Profile 1', avatar: 'avatar_01', isKids: false },
        { id: '-Nx23456789012345678', name: 'Kids Zone', avatar: 'avatar_09', isKids: true }
      ],
      activeProfileId: '-Nx12345678901234567',
      selectProfile: vi.fn().mockReturnValue({ ok: true }),
      isKidsMode: false,
      requestKidsExit: vi.fn()
    };
  });

  it('renders profile cards and Add Profile card', () => {
    render(
      <ProfileSelectorSettings
        onClose={() => {}}
        onCreateProfile={() => {}}
        onEditProfile={() => {}}
      />
    );

    expect(screen.getByText("Who's Watching?")).toBeDefined();
    expect(screen.getByText('Profile 1')).toBeDefined();
    expect(screen.getByText('Kids Zone')).toBeDefined();
    expect(screen.getByText('Add Profile')).toBeDefined();
  });

  it('switches profile on card click when not in Kids mode', () => {
    render(
      <ProfileSelectorSettings
        onClose={() => {}}
        onCreateProfile={() => {}}
        onEditProfile={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Kids Zone'));
    expect(mockProfiles.selectProfile).toHaveBeenCalledWith('-Nx23456789012345678');
  });

  it('toggles manage mode and invokes onEditProfile on click', () => {
    const onEditProfile = vi.fn();
    render(
      <ProfileSelectorSettings
        onClose={() => {}}
        onCreateProfile={() => {}}
        onEditProfile={onEditProfile}
      />
    );

    const manageBtn = screen.getByText('Manage');
    fireEvent.click(manageBtn);

    expect(screen.getByText('Manage Profiles')).toBeDefined();

    fireEvent.click(screen.getByText('Profile 1'));
    expect(onEditProfile).toHaveBeenCalledWith(mockProfiles.profiles[0]);
  });

  it('disables add profile card when 5 profiles reached', () => {
    mockProfiles.profiles = [
      { id: '-Nx11111111111111111', name: 'P1', avatar: 'avatar_01' },
      { id: '-Nx22222222222222222', name: 'P2', avatar: 'avatar_02' },
      { id: '-Nx33333333333333333', name: 'P3', avatar: 'avatar_03' },
      { id: '-Nx44444444444444444', name: 'P4', avatar: 'avatar_04' },
      { id: '-Nx55555555555555555', name: 'P5', avatar: 'avatar_05' }
    ];

    render(
      <ProfileSelectorSettings
        onClose={() => {}}
        onCreateProfile={() => {}}
        onEditProfile={() => {}}
      />
    );

    expect(screen.getByText(/Max Limit \(5\)/i)).toBeDefined();
    expect(screen.queryByText('Add Profile')).toBeNull();
  });

  it('requests Kids exit when attempting profile switch from Kids mode', () => {
    mockProfiles.isKidsMode = true;
    mockProfiles.activeProfileId = '-Nx23456789012345678';
    mockProfiles.requestKidsExit.mockReturnValue({ ok: true, modalOpened: true });
    const onNavigateToPin = vi.fn();

    render(
      <ProfileSelectorSettings
        onClose={() => {}}
        onNavigateToPin={onNavigateToPin}
      />
    );

    fireEvent.click(screen.getByText('Profile 1'));
    expect(mockProfiles.requestKidsExit).toHaveBeenCalled();
    expect(onNavigateToPin).toHaveBeenCalled();
  });

  it('hides the manage button when in Kids mode and shows it in normal mode', () => {
    mockProfiles.isKidsMode = true;

    const { rerender } = render(
      <ProfileSelectorSettings
        onClose={() => {}}
        onCreateProfile={() => {}}
        onEditProfile={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /manage/i })).toBeNull();

    mockProfiles.isKidsMode = false;
    rerender(
      <ProfileSelectorSettings
        onClose={() => {}}
        onCreateProfile={() => {}}
        onEditProfile={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /manage/i })).toBeDefined();
  });
});
