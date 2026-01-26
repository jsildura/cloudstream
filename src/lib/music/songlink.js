/**
 * Songlink API utilities for converting streaming links between platforms
 * 
 * Ported from tidal-ui/src/lib/utils/songlink.ts
 */

/**
 * Supported streaming platforms
 */
export const SUPPORTED_PLATFORMS = [
    { id: 'spotify', name: 'Spotify', pattern: /spotify\.com\/(track|album|playlist)/ },
    { id: 'appleMusic', name: 'Apple Music', pattern: /music\.apple\.com/ },
    { id: 'youtubeMusic', name: 'YouTube Music', pattern: /music\.youtube\.com/ },
    { id: 'deezer', name: 'Deezer', pattern: /deezer\.com\/(track|album|playlist)/ },
    { id: 'soundcloud', name: 'SoundCloud', pattern: /soundcloud\.com/ },
    { id: 'tidal', name: 'TIDAL', pattern: /tidal\.com\/(browse\/)?(track|album|playlist)/ },
    { id: 'amazon', name: 'Amazon Music', pattern: /music\.amazon\.com/ },
    { id: 'pandora', name: 'Pandora', pattern: /pandora\.com/ }
];

/**
 * Detect if URL is from a supported streaming platform
 * 
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isSupportedStreamingUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return SUPPORTED_PLATFORMS.some((platform) => platform.pattern.test(parsedUrl.href));
    } catch {
        return false;
    }
}

/**
 * Detect if URL is a Spotify playlist
 * 
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isSpotifyPlaylistUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return /spotify\.com\/playlist/.test(parsedUrl.href);
    } catch {
        return false;
    }
}

/**
 * Extract TIDAL information from Songlink response
 * 
 * @param {object} response - Songlink API response
 * @returns {{ type: string, id: string, url: string } | null}
 */
export function extractTidalInfo(response) {
    // Find TIDAL link in linksByPlatform
    const tidalLink = response.linksByPlatform?.tidal;
    if (!tidalLink?.url) {
        return null;
    }

    // Parse TIDAL URL to extract type and ID
    const url = tidalLink.url;
    const match = url.match(/tidal\.com\/(?:browse\/)?(\w+)\/(\d+)/);

    if (!match) {
        return null;
    }

    const [, type, id] = match;

    // Map Songlink types to our types
    let tidalType;
    if (type === 'track' || type === 'song') {
        tidalType = 'track';
    } else if (type === 'album') {
        tidalType = 'album';
    } else if (type === 'playlist') {
        tidalType = 'playlist';
    } else {
        return null;
    }

    // Validate that the ID is numeric
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
        console.warn('TIDAL ID is not a valid number:', id);
        return null;
    }

    return {
        type: tidalType,
        id,
        url
    };
}

/**
 * Fetch Songlink data for a given URL
 * 
 * @param {string} url - URL to convert
 * @param {object} options - Options
 * @param {string} options.userCountry - User's country code
 * @param {boolean} options.songIfSingle - Return song if single track album
 * @returns {Promise<object>}
 */
export async function fetchSonglinkData(url, options = {}) {
    const params = new URLSearchParams();
    params.set('url', url);

    if (options.userCountry) {
        params.set('userCountry', options.userCountry);
    }

    if (options.songIfSingle !== undefined) {
        params.set('songIfSingle', options.songIfSingle.toString());
    }

    // Randomly prefer backup API 50% of the time for load balancing
    const preferBackup = Math.random() < 0.5;
    if (preferBackup) {
        params.set('preferBackup', 'true');
    }

    const apiUrl = `/api/songlink?${params.toString()}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to fetch Songlink data: ${response.status}`);
    }

    return response.json();
}

/**
 * Convert a streaming platform URL to TIDAL information
 * 
 * @param {string} url - URL to convert
 * @param {object} options - Options
 * @returns {Promise<{ type: string, id: string, url: string } | null>}
 */
export async function convertToTidal(url, options = {}) {
    try {
        const songlinkData = await fetchSonglinkData(url, options);
        return extractTidalInfo(songlinkData);
    } catch (error) {
        console.error('Failed to convert URL to TIDAL:', error);
        return null;
    }
}

/**
 * Get platform name from URL
 * 
 * @param {string} url - URL to check
 * @returns {string | null}
 */
export function getPlatformName(url) {
    try {
        const parsedUrl = new URL(url);
        const platform = SUPPORTED_PLATFORMS.find((p) => p.pattern.test(parsedUrl.href));
        return platform?.name || null;
    } catch {
        return null;
    }
}

/**
 * Convert a Spotify playlist to an array of track URLs for Songlink conversion
 * 
 * @param {string} playlistUrl - Spotify playlist URL
 * @returns {Promise<string[]>}
 */
export async function convertSpotifyPlaylist(playlistUrl) {
    // Strip query parameters from the URL
    let cleanUrl = playlistUrl;
    try {
        const url = new URL(playlistUrl);
        cleanUrl = `${url.origin}${url.pathname}`;
    } catch (e) {
        // If URL parsing fails, use original URL
        console.warn('Failed to parse playlist URL, using as-is:', e);
    }

    const response = await fetch('/api/spotify-playlist', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playlistUrl: cleanUrl })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to fetch Spotify playlist: ${response.status}`);
    }

    const data = await response.json();
    return data.songLinks;
}

/**
 * Extract TIDAL song entity from Songlink response for display
 * Prioritizes the entityUniqueId, then falls back to any TIDAL_SONG entity
 * 
 * @param {object} response - Songlink API response
 * @returns {object | null}
 */
export function extractTidalSongEntity(response) {
    // First try the primary entity if it's a TIDAL song
    const primaryEntity = response.entitiesByUniqueId?.[response.entityUniqueId];
    if (primaryEntity?.apiProvider === 'tidal') {
        return primaryEntity;
    }

    // Fallback: find any TIDAL_SONG entity
    const tidalKey = Object.keys(response.entitiesByUniqueId || {}).find((key) =>
        key.startsWith('TIDAL_SONG::')
    );

    return tidalKey ? response.entitiesByUniqueId[tidalKey] || null : null;
}

export default {
    SUPPORTED_PLATFORMS,
    isSupportedStreamingUrl,
    isSpotifyPlaylistUrl,
    extractTidalInfo,
    fetchSonglinkData,
    convertToTidal,
    getPlatformName,
    convertSpotifyPlaylist,
    extractTidalSongEntity
};
