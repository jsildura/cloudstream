import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DataMigrationSettings from './DataMigrationSettings';

let mockProfileData = {
  migrationPreview: { legacyWatchlistCount: 5, legacyHistoryCount: 12 },
  acceptMigration: vi.fn(),
  declineMigration: vi.fn(),
  isMigrating: false
};

let mockProfiles = {
  activeProfile: { id: '-NxProfile11111111111', name: 'Alex' }
};

vi.mock('../../contexts/ProfileDataContext', () => ({
  useProfileData: () => mockProfileData
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

describe('DataMigrationSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileData = {
      migrationPreview: { legacyWatchlistCount: 5, legacyHistoryCount: 12 },
      acceptMigration: vi.fn().mockResolvedValue({ ok: true, migratedWatchlist: 5, migratedHistory: 12 }),
      declineMigration: vi.fn().mockResolvedValue({ ok: true }),
      isMigrating: false
    };
  });

  it('renders explanatory prompt and preview counts', () => {
    render(<DataMigrationSettings onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/Your existing device watchlist and viewing history can be copied into this profile/i)).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByRole('button', { name: /Import into Alex/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Not Now/i })).toBeDefined();
  });

  it('calls acceptMigration and displays success screen on positive result', async () => {
    const onComplete = vi.fn();
    render(<DataMigrationSettings onComplete={onComplete} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Import into Alex/i }));
    expect(mockProfileData.acceptMigration).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText(/Data Migration Complete/i)).toBeDefined();
      expect(screen.getByText(/5 watchlist items and 12 history items were imported/i)).toBeDefined();
    });
  });

  it('displays error banner when migration fails', async () => {
    mockProfileData.acceptMigration.mockResolvedValueOnce({
      ok: false,
      message: 'Network write error'
    });

    render(<DataMigrationSettings onComplete={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Import into Alex/i }));

    await waitFor(() => {
      expect(screen.getByText('Network write error')).toBeDefined();
    });
  });

  it('calls declineMigration when Not Now is clicked', async () => {
    const onCancel = vi.fn();
    render(<DataMigrationSettings onComplete={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /Not Now/i }));
    expect(mockProfileData.declineMigration).toHaveBeenCalled();
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
