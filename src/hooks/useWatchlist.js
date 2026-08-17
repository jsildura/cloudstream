import { useProfileData } from '../contexts/ProfileDataContext';

/**
 * Adapter hook for accessing watchlist from ProfileDataContext.
 * Preserves backwards-compatible API for existing components.
 */
const useWatchlist = () => {
  const {
    watchlist,
    isWatchlistLoading,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist
  } = useProfileData();

  return {
    watchlist,
    isLoading: isWatchlistLoading,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist,
    watchlistCount: watchlist.length
  };
};

export default useWatchlist;
