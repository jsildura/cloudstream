/**
 * Utility functions for TV show badges (e.g. "New Episode | Watch Now").
 */

// Default threshold in days for considering an episode "recently released"
export const RECENT_EPISODE_THRESHOLD_DAYS = 7;

/**
 * Checks if a media item is a TV show and has released an episode recently.
 *
 * @param {Object} item - Media item object (from TMDB or enriched)
 * @param {number} [thresholdDays=7] - Maximum age in days for the latest episode
 * @param {Date} [referenceDate=new Date()] - Reference date for comparison (useful for testing)
 * @returns {boolean} True if the item is a TV show with a recently released episode
 */
export function isRecentEpisode(item, thresholdDays = RECENT_EPISODE_THRESHOLD_DAYS, referenceDate = new Date()) {
  if (!item || typeof item !== 'object') return false;

  // Exclude movies explicitly
  const isMovie = item.type === 'movie'
    || item.media_type === 'movie'
    || Boolean(item.release_date && !item.first_air_date);

  if (isMovie) return false;

  const isTV = item.type === 'tv'
    || item.media_type === 'tv'
    || Boolean(item.first_air_date && !item.release_date && !item.title)
    || Boolean(item.name && !item.title);

  if (!isTV) return false;

  // Retrieve the latest air date from enriched details or basic item
  // 1. last_episode_to_air.air_date (most accurate, from TMDB /tv/{id})
  // 2. last_air_date (from TMDB /tv/{id})
  // 3. first_air_date (for brand-new series whose pilot recently premiered)
  const airDateStr = item.last_episode_to_air?.air_date
    || item.last_air_date
    || item.first_air_date;

  if (!airDateStr || typeof airDateStr !== 'string') return false;

  // Parse YYYY-MM-DD
  const airDate = new Date(`${airDateStr}T00:00:00Z`);
  if (isNaN(airDate.getTime())) return false;

  const refTime = referenceDate.getTime();
  const airTime = airDate.getTime();
  const diffMs = refTime - airTime;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Must have aired (allowing up to 1 day ahead for timezone offsets between UTC and local time)
  // and must be within the specified threshold
  return diffDays >= -1 && diffDays <= thresholdDays;
}
