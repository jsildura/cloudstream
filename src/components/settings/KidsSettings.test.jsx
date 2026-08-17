import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KidsSettings from './KidsSettings';

let mockProfiles = {
  activeProfile: null,
  isKidsMode: false,
  requestKidsExit: vi.fn()
};

vi.mock('../../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

describe('KidsSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = {
      activeProfile: { id: '-Nx11111111111111111', name: 'Adult User', isKids: false },
      isKidsMode: false,
      requestKidsExit: vi.fn()
    };
  });

  it('renders parental info when not in Kids mode', () => {
    render(
      <KidsSettings
        onClose={() => {}}
        onNavigateToProfiles={() => {}}
        onNavigateToPin={() => {}}
      />
    );

    expect(screen.getByText('Parental Controls')).toBeDefined();
    expect(screen.getByText(/Create a Safe Space for Kids/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Manage Profiles & Add Kids Profile/i })).toBeDefined();
  });

  it('renders active Kids mode protections when in Kids mode', () => {
    mockProfiles.isKidsMode = true;
    mockProfiles.activeProfile = { id: '-Nx22222222222222222', name: 'Little Tommy', isKids: true };

    render(
      <KidsSettings
        onClose={() => {}}
        onNavigateToProfiles={() => {}}
        onNavigateToPin={() => {}}
      />
    );

    expect(screen.getByText('KIDS MODE ACTIVE')).toBeDefined();
    expect(screen.getByText(/Active Protections for Little Tommy/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Exit Kids Mode \(Requires PIN\)/i })).toBeDefined();
  });

  it('requests PIN exit when Exit Kids Mode is clicked', () => {
    mockProfiles.isKidsMode = true;
    mockProfiles.activeProfile = { id: '-Nx22222222222222222', name: 'Little Tommy', isKids: true };
    mockProfiles.requestKidsExit.mockReturnValue({ ok: true, modalOpened: true });
    const onNavigateToPin = vi.fn();

    render(
      <KidsSettings
        onClose={() => {}}
        onNavigateToProfiles={() => {}}
        onNavigateToPin={onNavigateToPin}
      />
    );

    const exitBtn = screen.getByRole('button', { name: /Exit Kids Mode \(Requires PIN\)/i });
    fireEvent.click(exitBtn);

    expect(mockProfiles.requestKidsExit).toHaveBeenCalled();
    expect(onNavigateToPin).toHaveBeenCalled();
  });
});
