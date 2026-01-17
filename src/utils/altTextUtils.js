/**
 * Alt Text Utilities
 * Generate descriptive, SEO-friendly alt text for images
 */

/**
 * Generate descriptive alt text for movie/TV show poster images
 * @param {Object} item - The content item with title/name and metadata
 * @returns {string} Descriptive alt text
 */
export const getPosterAlt = (item) => {
    if (!item) return 'Movie or TV show poster';

    const title = item.title || item.name || 'Unknown title';
    const year = item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0];
    const type = item.media_type === 'tv' || item.first_air_date ? 'TV series' : 'movie';

    return year
        ? `${title} (${year}) ${type} poster`
        : `${title} ${type} poster`;
};

/**
 * Generate descriptive alt text for backdrop/scene images
 * @param {Object} item - The content item with title/name
 * @returns {string} Descriptive alt text
 */
export const getBackdropAlt = (item) => {
    if (!item) return 'Movie or TV show scene';

    const title = item.title || item.name || 'content';
    return `Scene from ${title}`;
};

/**
 * Generate alt text for streaming provider logos
 * @param {string} providerName - Name of the streaming provider
 * @returns {string} Descriptive alt text
 */
export const getLogoAlt = (providerName) => {
    if (!providerName) return 'Streaming service logo';
    return `${providerName} streaming service logo`;
};

/**
 * Generate alt text for episode thumbnails
 * @param {Object} episode - Episode object with name and episode number
 * @param {string} showName - Name of the TV show
 * @returns {string} Descriptive alt text
 */
export const getEpisodeAlt = (episode, showName) => {
    if (!episode) return 'Episode thumbnail';

    const episodeName = episode.name || `Episode ${episode.episode_number || ''}`;
    return showName
        ? `${showName} - ${episodeName} thumbnail`
        : `${episodeName} thumbnail`;
};

/**
 * Generate alt text for studio logos
 * @param {string} studioName - Name of the studio
 * @returns {string} Descriptive alt text
 */
export const getStudioAlt = (studioName) => {
    if (!studioName) return 'Production studio logo';
    return `${studioName} production studio logo`;
};
