import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileFormSettings from './ProfileFormSettings';

let mockProfiles = {
  profiles: [{ id: '-Nx11111111111111111', name: 'Adult 1', avatar: 'avatar_01', isKids: false }],
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn()
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

describe('ProfileFormSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = {
      profiles: [{ id: '-Nx11111111111111111', name: 'Adult 1', avatar: 'avatar_01', isKids: false }],
      createProfile: vi.fn().mockResolvedValue({ ok: true }),
      updateProfile: vi.fn().mockResolvedValue({ ok: true }),
      deleteProfile: vi.fn().mockResolvedValue({ ok: true })
    };
  });

  it('renders creation form with empty name input and 8 adult avatars for normal profile', () => {
    render(<ProfileFormSettings onCancel={() => {}} onSuccess={() => {}} />);

    expect(screen.getByText('Add Profile')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. Sarah')).toBeDefined();
    expect(screen.getByText('Choose Avatar')).toBeDefined();
    expect(screen.getByRole('button', { name: /Create Profile/i })).toBeDefined();

    // Adult avatars visible
    expect(screen.getByRole('button', { name: /Select avatar avatar_01/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Select avatar avatar_08/i })).toBeDefined();
    // Kids avatars hidden
    expect(screen.queryByRole('button', { name: /Select avatar avatar_09/i })).toBeNull();
  });

  it('filters avatars and defaults to avatar_09 when Kids toggle is activated', () => {
    render(<ProfileFormSettings onCancel={() => {}} onSuccess={() => {}} />);

    // Select avatar_02
    fireEvent.click(screen.getByRole('button', { name: /Select avatar avatar_02/i }));

    // Toggle Kids ON
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Only kids avatars (avatar_09 to avatar_12) should be visible
    expect(screen.getByRole('button', { name: /Select avatar avatar_09/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Select avatar avatar_12/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Select avatar_01/i })).toBeNull();

    // Select another kids avatar
    fireEvent.click(screen.getByRole('button', { name: /Select avatar avatar_11/i }));

    // Toggle Kids OFF
    fireEvent.click(checkbox);

    // Adult avatars visible again, defaults to avatar_01
    expect(screen.getByRole('button', { name: /Select avatar avatar_01/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Select avatar avatar_11/i })).toBeNull();
  });

  it('creates profile on valid form submission', async () => {
    const onSuccess = vi.fn();
    render(<ProfileFormSettings onCancel={() => {}} onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('e.g. Sarah');
    fireEvent.change(input, { target: { value: 'New Kid' } });

    const createBtn = screen.getByRole('button', { name: /Create Profile/i });
    fireEvent.click(createBtn);

    await vi.waitFor(() => {
      expect(mockProfiles.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Kid', avatar: 'avatar_01', isKids: false }),
        ''
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('requires 4-digit PIN when creating Kids profile', async () => {
    render(<ProfileFormSettings onCancel={() => {}} onSuccess={() => {}} />);

    const input = screen.getByPlaceholderText('e.g. Sarah');
    fireEvent.change(input, { target: { value: 'Kiddo' } });

    // Enable Kids toggle
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByLabelText(/Parental Exit PIN/i)).toBeDefined();

    // Try submit without PIN
    const createBtn = screen.getByRole('button', { name: /Create Profile/i });
    fireEvent.click(createBtn);

    expect(screen.getByText(/A 4-digit numeric PIN is required for Kids mode/i)).toBeDefined();
    expect(mockProfiles.createProfile).not.toHaveBeenCalled();

    // Enter 4-digit PIN and submit
    const pinInput = screen.getByPlaceholderText('••••');
    fireEvent.change(pinInput, { target: { value: '1234' } });
    fireEvent.click(createBtn);

    await vi.waitFor(() => {
      expect(mockProfiles.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kiddo', isKids: true }),
        '1234'
      );
    });
  });

  it('populates fields in edit mode and allows inline deletion for non-final profile', async () => {
    mockProfiles.profiles = [
      { id: '-Nx11111111111111111', name: 'Profile 1', avatar: 'avatar_01', isKids: false },
      { id: '-Nx22222222222222222', name: 'Profile 2', avatar: 'avatar_02', isKids: false }
    ];

    const targetProfile = mockProfiles.profiles[1];
    const onSuccess = vi.fn();

    render(
      <ProfileFormSettings
        profile={targetProfile}
        onCancel={() => {}}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Edit Profile')).toBeDefined();
    expect(screen.getByDisplayValue('Profile 2')).toBeDefined();

    // Trigger delete confirmation
    const deleteBtn = screen.getByRole('button', { name: /Delete Profile/i });
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/Delete this profile\?/i)).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: /Yes, Delete/i });
    fireEvent.click(confirmBtn);

    await vi.waitFor(() => {
      expect(mockProfiles.deleteProfile).toHaveBeenCalledWith(targetProfile.id);
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('requires current PIN when changing PIN on an existing Kids profile', async () => {
    mockProfiles.profiles = [
      { id: '-Nx11111111111111111', name: 'Profile 1', avatar: 'avatar_01', isKids: false },
      { id: '-Nx22222222222222222', name: 'Kids Profile', avatar: 'avatar_09', isKids: true, pinHash: 'salt:digest' }
    ];

    const kidsProfile = mockProfiles.profiles[1];
    const onSuccess = vi.fn();

    render(
      <ProfileFormSettings
        profile={kidsProfile}
        onCancel={() => {}}
        onSuccess={onSuccess}
      />
    );

    // Current and New PIN fields are visible
    const currentPinInput = screen.getByLabelText(/Current PIN/i);
    const newPinInput = screen.getByLabelText(/New Parental Exit PIN/i);

    // Enter new PIN without current PIN -> error
    fireEvent.change(newPinInput, { target: { value: '7777' } });
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    expect(screen.getByText(/Current 4-digit PIN is required to change PIN/i)).toBeDefined();
    expect(mockProfiles.updateProfile).not.toHaveBeenCalled();

    // Enter current PIN and submit
    fireEvent.change(currentPinInput, { target: { value: '1234' } });
    fireEvent.click(saveBtn);

    await vi.waitFor(() => {
      expect(mockProfiles.updateProfile).toHaveBeenCalledWith(
        kidsProfile.id,
        expect.objectContaining({ name: 'Kids Profile', avatar: 'avatar_09', isKids: true }),
        '7777',
        '1234'
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
