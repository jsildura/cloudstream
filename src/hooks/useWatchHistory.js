import { useProfileData } from '../contexts/ProfileDataContext';

/**
 * Adapter hook for accessing watch history from ProfileDataContext.
 * Preserves backwards-compatible API for existing components.
 */
const useWatchHistory = () => {
  const {
    watchHistory,
    isLoaded,
    addToHistory,
    updateProgress,
    getLastWatched,
    isInHistory,
    removeFromHistory,
    clearHistory
  } = useProfileData();

  return {
    watchHistory,
    isLoaded,
    addToHistory,
    updateProgress,
    getWatchHistory: () => watchHistory,
    getLastWatched,
    isInHistory,
    removeFromHistory,
    clearHistory,
    historyCount: watchHistory.length
  };
};

export default useWatchHistory;
