import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import KidsFeatureGuard from './KidsFeatureGuard';
import KidsRatedWatchGuard from './KidsRatedWatchGuard';

let mockProfiles = {
  isKidsMode: false,
  isProfileLoading: false
};

const mockShowError = vi.fn();

vi.mock('../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showError: mockShowError,
    showSuccess: vi.fn()
  })
}));

const mockGetKidsRating = vi.fn();
vi.mock('../lib/tmdbClient', () => ({
  getKidsRating: (...args) => mockGetKidsRating(...args)
}));

describe('Kids Route & Feature Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = { isKidsMode: false, isProfileLoading: false };
  });

  describe('KidsFeatureGuard', () => {
    it('renders protected content when not in Kids mode', () => {
      mockProfiles.isKidsMode = false;

      render(
        <MemoryRouter initialEntries={['/iptv']}>
          <Routes>
            <Route path="/iptv" element={
              <KidsFeatureGuard>
                <div>IPTV Content</div>
              </KidsFeatureGuard>
            } />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('IPTV Content')).toBeDefined();
      expect(mockShowError).not.toHaveBeenCalled();
    });

    it('redirects to / and displays toast when in Kids mode', () => {
      mockProfiles.isKidsMode = true;

      render(
        <MemoryRouter initialEntries={['/iptv']}>
          <Routes>
            <Route path="/" element={<div>Home Page</div>} />
            <Route path="/iptv" element={
              <KidsFeatureGuard>
                <div>IPTV Content</div>
              </KidsFeatureGuard>
            } />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Home Page')).toBeDefined();
      expect(screen.queryByText('IPTV Content')).toBeNull();
      expect(mockShowError).toHaveBeenCalledWith('This feature is unavailable in Kids mode.');
    });
  });

  describe('KidsRatedWatchGuard', () => {
    it('redirects on invalid query params (missing or invalid ID)', () => {
      render(
        <MemoryRouter initialEntries={['/watch?type=movie&id=-5']}>
          <Routes>
            <Route path="/" element={<div>Home Page</div>} />
            <Route path="/watch" element={
              <KidsRatedWatchGuard>
                <div>Watch Player</div>
              </KidsRatedWatchGuard>
            } />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Home Page')).toBeDefined();
      expect(screen.queryByText('Watch Player')).toBeNull();
    });

    it('renders player directly when not in Kids mode', () => {
      mockProfiles.isKidsMode = false;

      render(
        <MemoryRouter initialEntries={['/watch?type=movie&id=550']}>
          <Routes>
            <Route path="/watch" element={
              <KidsRatedWatchGuard>
                <div>Watch Player</div>
              </KidsRatedWatchGuard>
            } />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Watch Player')).toBeDefined();
      expect(mockGetKidsRating).not.toHaveBeenCalled();
    });

    it('blocks and redirects disallowed movie in Kids mode', async () => {
      mockProfiles.isKidsMode = true;
      mockGetKidsRating.mockResolvedValueOnce({ approved: false, rating: 'R', type: 'movie', id: 550 });

      render(
        <MemoryRouter initialEntries={['/watch?type=movie&id=550']}>
          <Routes>
            <Route path="/" element={<div>Home Page</div>} />
            <Route path="/watch" element={
              <KidsRatedWatchGuard>
                <div>Watch Player</div>
              </KidsRatedWatchGuard>
            } />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Home Page')).toBeDefined();
        expect(screen.queryByText('Watch Player')).toBeNull();
        expect(mockShowError).toHaveBeenCalledWith('This title is not available in Kids mode.');
      });
    });

    it('approves and renders player for PG movie in Kids mode', async () => {
      mockProfiles.isKidsMode = true;
      mockGetKidsRating.mockResolvedValueOnce({ approved: true, rating: 'PG', type: 'movie', id: 12 });

      render(
        <MemoryRouter initialEntries={['/watch?type=movie&id=12']}>
          <Routes>
            <Route path="/watch" element={
              <KidsRatedWatchGuard>
                <div>Watch Player</div>
              </KidsRatedWatchGuard>
            } />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Watch Player')).toBeDefined();
      });
    });
  });
});
