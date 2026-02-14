/**
 * Server Configuration for StreamFlix Video Player
 * 
 * This file contains all streaming server configurations.
 * To add, remove, or modify servers, edit the serverConfig array below.
 * 
 * URL PATTERNS:
 * - 'default'    : {baseUrl}{type}/{id}/{season}/{episode}{suffix}
 * - 'movie-only' : {baseUrl}{id}{suffix} (returns null for TV)
 * - 'query-id'   : {baseUrl}{id}{suffix} (returns null for TV)
 * - 'tmdb-prefix': {baseUrl}{id}{suffix} (returns null for TV)
 * - 'primesrc'   : {baseUrl}{type}?tmdb={id}&season={s}&episode={e}
 * - 'vidsrc-xyz' : movie/{id} or tv?tmdb={id}&season={s}&episode={e}
 */

export const serverConfig = [
    {
        name: 'Server 1',
        description: 'Main Server, Fast Streaming.',
        baseUrl: 'https://vidsrc.cc/v2/embed/',
        suffix: '?autoPlay=true',
        isRecommended: true,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 2',
        description: '2nd Reliable Server Backup',
        baseUrl: 'https://zxcstream.xyz/player/',
        suffix: '/en',
        isRecommended: true,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 3',
        description: 'A Good Server Backup with 4K Ultra HD Content.',
        baseUrl: 'https://api.cineby.homes/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 4',
        description: 'Reliable Server with Vast Collections',
        baseUrl: 'https://vidsrc.xyz/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'vidsrc-xyz',
    },
    {
        name: 'Server 5',
        description: 'Fast Streaming Server.',
        baseUrl: 'https://screenfetch.xyz/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'primesrc',
    },
    {
        name: 'Server 6',
        description: 'Fast & Reliable Server, Minimal Ads',
        baseUrl: 'https://vidsync.xyz/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 7',
        description: 'Premium Server, Supports Adaptive Bitrate Switching.',
        baseUrl: 'https://vidlink.pro/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 8',
        description: 'Subtitle Support. Up to 4k Quality.',
        baseUrl: 'https://mapple.uk/watch/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
        // To disable password protection, remove 'locked' and 'password' properties
        locked: false,
        password: 'c3RyZWFtZmxpeEBfMTU=', // Base64 encoded
    },
    {
        name: 'Server 9',
        description: 'Lightning Fast. Multiple Mirrors.',
        baseUrl: 'https://vidfast.pro/',
        suffix: '?autoplay=true&autoNext=true',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 10',
        description: 'Huge Catalog. Fast Streaming.',
        baseUrl: 'https://vixsrc.to/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 11',
        description: '4K Movies with Multi-Language Subtitles, (Movie Only).',
        baseUrl: 'https://fmovies4u.com/embed/movie/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'movie-only', // Updated format: /embed/movie/{id}
    },
    {
        name: 'Server 12',
        description: 'Fast Streaming. (Movie Only).',
        baseUrl: 'https://www.vidking.net/embed/movie/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'movie-only',
    },
    {
        name: 'Server 13',
        description: 'Fast Streaming. also (Movie Only)',
        baseUrl: 'https://vidsrc.wtf/api/3/movie/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'query-id', // Movie-only
    },
    {
        name: 'Server 14',
        description: 'Multi-Source Backup Servers. Subtitle Support.',
        baseUrl: 'https://player.vidzee.wtf/embed/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
        // To disable password protection, remove 'locked' and 'password' properties
        locked: false,
        password: 'c3RyZWFtZmxpeEBfMTM=', // Base64 encoded
    },
    {
        name: 'Server 15',
        description: 'Multi-Source. Customizable Subtitles. Up to 1080p.',
        baseUrl: 'https://player.videasy.net/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
        // To disable password protection, remove 'locked' and 'password' properties
        locked: false,
        password: 'c3RyZWFtZmxpeEBfMTQ=', // Base64 encoded
    },
    {
        name: 'Server 16',
        description: 'Reliable Server',
        baseUrl: 'https://www.zxcstream.xyz/embed/',
        suffix: '?autoPlay=true',
        isRecommended: false,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 17',
        description: 'Backup Server',
        baseUrl: 'https://vidsrc-embed.ru/embed/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'vidsrc-xyz',
    },
];

/**
 * Builds the streaming URL for a given server configuration.
 * 
 * @param {Object} server - Server configuration object from serverConfig
 * @param {string} type - Content type: 'movie' or 'tv'
 * @param {string|number} id - TMDB ID of the content
 * @param {number} season - Season number (for TV shows)
 * @param {number} episode - Episode number (for TV shows)
 * @returns {string|null} The constructed URL, or null if server doesn't support the content type
 */
export function buildServerUrl(server, type, id, season, episode) {
    const { baseUrl, suffix, pattern } = server;
    const tvPath = type === 'tv' ? `/${season}/${episode}` : '';

    switch (pattern) {
        case 'movie-only':
            // e.g., /embed/movie/{id}
            return type === 'movie' ? `${baseUrl}${id}${suffix}` : null;

        case 'query-id':
            // e.g., ?id={id}
            return type === 'movie' ? `${baseUrl}${id}${suffix}` : null;

        case 'tmdb-prefix':
            // e.g., tmdb-movie-{id}
            return type === 'movie' ? `${baseUrl}${id}${suffix}` : null;

        case 'primesrc':
            // e.g., {base}{type}?tmdb={id}&season={s}&episode={e}
            if (type === 'tv') {
                return `${baseUrl}${type}?tmdb=${id}&season=${season}&episode=${episode}`;
            }
            return `${baseUrl}${type}?tmdb=${id}`;

        case 'vidsrc-xyz':
            // movie/{id} or tv?tmdb={id}&season=&episode=
            if (type === 'tv') {
                return `${baseUrl}tv?tmdb=${id}&season=${season}&episode=${episode}`;
            }
            return `${baseUrl}movie/${id}`;

        case 'default':
        default:
            // Standard: {base}{type}/{id}{tvPath}{suffix}
            return `${baseUrl}${type}/${id}${tvPath}${suffix}`;
    }
}

/**
 * Gets the total number of configured servers.
 * @returns {number}
 */
export function getServerCount() {
    return serverConfig.length;
}
