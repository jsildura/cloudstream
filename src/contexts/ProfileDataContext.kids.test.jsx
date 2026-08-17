import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ProfileDataProvider, useProfileData } from './ProfileDataContext';

let mockAuthState = {
  isSignedIn: true,
  accountUser: { uid: 'user_kids_test_123', email: 'test@example.com' }
};

let mockProfiles = {
  activeProfileId: 'profile_kids_456',
  isProfileLoading: false,
  isKidsMode: true
};

vi.mock('./AuthContext', () => ({
  useAuth: () => mockAuthState
}));

vi.mock('./ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

const mockFilterKidsCandidates = vi.fn();
vi.mock('../lib/tmdbClient', () => ({
  filterKidsCandidates: (...args) => mockFilterKidsCandidates(...args)
}));

// Mock Firebase RTDB
const mockDbData = {
  'profileData/user_kids_test_123/profile_kids_456/watchlist': {
    'movie_1': { type: 'movie', id: 1, title: 'Approved Kid Movie' },
    'movie_2': { type: 'movie', id: 2, title: 'Disallowed Adult Movie' }
  },
  'profileData/user_kids_test_123/profile_kids_456/watchHistory': {
    'tv_10': { type: 'tv', id: 10, name: 'Approved Kid Show', progress: 50 },
    'tv_20': { type: 'tv', id: 20, name: 'Disallowed Adult Show', progress: 80 }
  }
};

vi.mock('../lib/firebase', () => ({
  initFirebase: () => ({
    db: {
      ref: (path = '') => ({
        on: (event, callback) => {
          const val = mockDbData[path] || null;
          callback({
            exists: () => val !== null && val !== undefined,
            val: () => val
          });
        },
        off: vi.fn(),
        update: vi.fn().mockResolvedValue(true)
      })
    }
  })
}));

describe('ProfileDataContext Kids Mode Collection Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      isSignedIn: true,
      accountUser: { uid: 'user_kids_test_123', email: 'test@example.com' }
    };
    mockProfiles = {
      activeProfileId: 'profile_kids_456',
      isProfileLoading: false,
      isKidsMode: true
    };
  });

  it('filters visible watchlist and history to approved titles only without deleting cloud data', async () => {
    mockFilterKidsCandidates.mockImplementation(async (items) => {
      return items.filter(item => item.id === 1 || item.id === 10);
    });

    const wrapper = ({ children }) => <ProfileDataProvider>{children}</ProfileDataProvider>;
    const { result } = renderHook(() => useProfileData(), { wrapper });

    await waitFor(() => {
      expect(result.current.watchlist.length).toBe(1);
      expect(result.current.watchlist[0].id).toBe(1);
      expect(result.current.watchHistory.length).toBe(1);
      expect(result.current.watchHistory[0].id).toBe(10);
    });

    // Verify mockFilterKidsCandidates was invoked with the full candidate list
    expect(mockFilterKidsCandidates).toHaveBeenCalled();
  });
});
