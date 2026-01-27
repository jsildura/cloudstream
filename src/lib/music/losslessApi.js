/**
 * Lossless Music API Client
 * 
 * Ported from tidal-ui/src/lib/api.ts
 * Provides:
 * - Search functionality (tracks, albums, artists, playlists)
 * - Album/Artist/Track/Playlist detail fetches
 * - DASH manifest parsing  
 * - Stream URL resolution
 * - Download with metadata embedding
 */

import {
    API_CONFIG,
    fetchWithCORS,
    selectApiTargetForRegion
} from './musicConfig.js';
import { parseTidalUrl } from './urlParser.js';

const API_BASE = API_CONFIG.baseUrl;
const RATE_LIMIT_ERROR_MESSAGE = 'Too Many Requests. Please wait a moment and try again.';
export const DASH_MANIFEST_UNAVAILABLE_CODE = 'DASH_MANIFEST_UNAVAILABLE';

/**
 * LosslessAPI class for interacting with the music streaming API
 */
class LosslessAPI {
    constructor(baseUrl = API_BASE) {
        this.baseUrl = baseUrl;
        this.metadataQueue = Promise.resolve();
    }

    /**
     * Resolve regional base URL
     */
    resolveRegionalBase(region = 'auto') {
        try {
            const target = selectApiTargetForRegion(region);
            if (target?.baseUrl) {
                return target.baseUrl;
            }
        } catch (error) {
            console.warn('Falling back to default API base URL', { region, error });
        }
        return this.baseUrl;
    }

    /**
     * Build full URL for regional endpoint
     */
    buildRegionalUrl(path, region = 'auto') {
        const base = this.resolveRegionalBase(region).replace(/\/+$/, '');
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return `${base}${normalizedPath}`;
    }

    /**
     * Fetch wrapper with CORS handling
     */
    async fetch(url, options = {}) {
        return fetchWithCORS(url, options);
    }

    /**
     * Check for rate limit errors
     */
    ensureNotRateLimited(response) {
        if (response.status === 429) {
            throw new Error(RATE_LIMIT_ERROR_MESSAGE);
        }
    }

    /**
     * Delay helper
     */
    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Normalize search response structure
     */
    normalizeSearchResponse(data, key) {
        const section = this.findSearchSection(data, key, new Set());
        return this.buildSearchResponse(section);
    }

    /**
     * Build search response object
     */
    buildSearchResponse(section) {
        const items = section?.items;
        const list = Array.isArray(items) ? items : [];
        const limit = typeof section?.limit === 'number' ? section.limit : list.length;
        const offset = typeof section?.offset === 'number' ? section.offset : 0;
        const total = typeof section?.totalNumberOfItems === 'number'
            ? section.totalNumberOfItems
            : list.length;

        return {
            items: list,
            limit,
            offset,
            totalNumberOfItems: total
        };
    }

    /**
     * Recursively find search section in response
     */
    findSearchSection(source, key, visited) {
        if (!source) return undefined;

        if (Array.isArray(source)) {
            for (const entry of source) {
                const found = this.findSearchSection(entry, key, visited);
                if (found) return found;
            }
            return undefined;
        }

        if (typeof source !== 'object') return undefined;

        if (visited.has(source)) return undefined;
        visited.add(source);

        if (!Array.isArray(source) && 'items' in source && Array.isArray(source.items)) {
            return source;
        }

        if (key in source) {
            const nested = source[key];
            const fromKey = this.findSearchSection(nested, key, visited);
            if (fromKey) return fromKey;
        }

        for (const value of Object.values(source)) {
            const found = this.findSearchSection(value, key, visited);
            if (found) return found;
        }

        return undefined;
    }

    /**
     * Prepare track data (normalize artist, derive quality)
     */
    prepareTrack(track) {
        let normalized = track;
        if (!track.artist && Array.isArray(track.artists) && track.artists.length > 0) {
            normalized = { ...track, artist: track.artists[0] };
        }
        return normalized;
    }

    /**
     * Prepare album data
     */
    prepareAlbum(album) {
        if (!album.artist && Array.isArray(album.artists) && album.artists.length > 0) {
            return { ...album, artist: album.artists[0] };
        }
        return album;
    }

    /**
     * Prepare artist data
     */
    prepareArtist(artist) {
        if (!artist.type && Array.isArray(artist.artistTypes) && artist.artistTypes.length > 0) {
            return { ...artist, type: artist.artistTypes[0] };
        }
        return artist;
    }

    /**
     * Check if response is V2 API container
     */
    isV2ApiContainer(payload) {
        return Boolean(
            payload &&
            typeof payload === 'object' &&
            'version' in payload &&
            String(payload.version).startsWith('2.')
        );
    }

    // =====================
    // SEARCH METHODS
    // =====================

    /**
     * Search for tracks
     * @param {string} query - Search query
     * @param {string} region - Region preference
     * @returns {Promise<{items: Array, limit: number, offset: number, totalNumberOfItems: number}>}
     */
    async searchTracks(query, region = 'auto') {
        const response = await this.fetch(
            this.buildRegionalUrl(`/search/?s=${encodeURIComponent(query)}`, region)
        );
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to search tracks');
        const data = await response.json();
        const normalized = this.normalizeSearchResponse(data, 'tracks');
        return {
            ...normalized,
            items: normalized.items.map((track) => this.prepareTrack(track))
        };
    }

    /**
     * Search for artists
     * @param {string} query - Search query
     * @param {string} region - Region preference
     * @returns {Promise<{items: Array, limit: number, offset: number, totalNumberOfItems: number}>}
     */
    async searchArtists(query, region = 'auto') {
        const response = await this.fetch(
            this.buildRegionalUrl(`/search/?a=${encodeURIComponent(query)}`, region)
        );
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to search artists');
        const data = await response.json();
        const normalized = this.normalizeSearchResponse(data, 'artists');
        return {
            ...normalized,
            items: normalized.items.map((artist) => this.prepareArtist(artist))
        };
    }

    /**
     * Search for albums
     * @param {string} query - Search query
     * @param {string} region - Region preference
     * @returns {Promise<{items: Array, limit: number, offset: number, totalNumberOfItems: number}>}
     */
    async searchAlbums(query, region = 'auto') {
        const response = await this.fetch(
            this.buildRegionalUrl(`/search/?al=${encodeURIComponent(query)}`, region)
        );
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to search albums');
        const data = await response.json();
        const normalized = this.normalizeSearchResponse(data, 'albums');
        return {
            ...normalized,
            items: normalized.items.map((album) => this.prepareAlbum(album))
        };
    }

    /**
     * Search for playlists
     * @param {string} query - Search query
     * @param {string} region - Region preference
     * @returns {Promise<{items: Array, limit: number, offset: number, totalNumberOfItems: number}>}
     */
    async searchPlaylists(query, region = 'auto') {
        const response = await this.fetch(
            this.buildRegionalUrl(`/search/?p=${encodeURIComponent(query)}`, region)
        );
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to search playlists');
        const data = await response.json();
        return this.normalizeSearchResponse(data, 'playlists');
    }

    // =====================
    // ENTITY DETAIL METHODS
    // =====================

    /**
     * Get track info and stream data
     * @param {number} id - Track ID
     * @param {string} quality - Audio quality (LOSSLESS, HI_RES_LOSSLESS, HIGH, LOW)
     * @returns {Promise<{track: object, info: object, originalTrackUrl?: string}>}
     */
    async getTrack(id, quality = 'LOSSLESS') {
        const url = `${this.baseUrl}/track/?id=${id}&quality=${quality}`;
        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            const response = await this.fetch(url, {
                apiVersion: 'v2',
                validateResponse: async (res) => {
                    try {
                        const data = await res.json();
                        const container = data?.data ?? data;
                        return container?.assetPresentation !== 'PREVIEW';
                    } catch {
                        return true;
                    }
                }
            });

            this.ensureNotRateLimited(response);

            if (response.ok) {
                const data = await response.json();
                if (this.isV2ApiContainer(data)) {
                    return await this.parseTrackLookupV2(id, data, 'v2');
                }
                return this.parseTrackLookup(data);
            }

            let detail;
            let userMessage;
            let subStatus;

            try {
                const errorData = await response.json();
                if (typeof errorData?.detail === 'string') detail = errorData.detail;
                if (typeof errorData?.userMessage === 'string') {
                    userMessage = errorData.userMessage;
                    if (!detail) detail = errorData.userMessage;
                }
                if (typeof errorData?.subStatus === 'number') subStatus = errorData.subStatus;
            } catch {
                // Ignore JSON parse errors
            }

            const isTokenRetry = response.status === 401 && subStatus === 11002;
            const message = detail ?? `Failed to get track (status ${response.status})`;
            lastError = new Error(isTokenRetry ? (userMessage ?? message) : message);

            const shouldRetry = isTokenRetry ||
                (detail ? /quality not found/i.test(detail) : response.status >= 500);

            if (attempt === 3 || !shouldRetry) {
                throw lastError;
            }

            await this.delay(200 * attempt);
        }

        throw lastError ?? new Error('Failed to get track');
    }

    /**
     * Parse track lookup response
     */
    parseTrackLookup(data) {
        const entries = Array.isArray(data) ? data : [data];
        let track;
        let info;
        let originalTrackUrl;

        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            if (!track && 'album' in entry && 'artist' in entry && 'duration' in entry) {
                track = entry;
                continue;
            }
            if (!info && 'manifest' in entry) {
                info = entry;
                continue;
            }
            if (!originalTrackUrl && 'OriginalTrackUrl' in entry) {
                const candidate = entry.OriginalTrackUrl;
                if (typeof candidate === 'string') {
                    originalTrackUrl = candidate;
                }
            }
        }

        if (!track || !info) {
            throw new Error('Malformed track response');
        }

        return { track, info, originalTrackUrl };
    }

    /**
     * Parse V2 API track lookup response
     */
    async parseTrackLookupV2(trackId, payload, apiVersion = 'v2') {
        const container = payload?.data ?? payload;
        const trackInfo = this.buildTrackInfoFromV2(container, trackId);
        let track = this.extractTrackFromPayload(container) ?? null;

        if (!track) {
            track = await this.fetchTrackMetadata(trackId, apiVersion);
        }

        return {
            track: this.prepareTrack(track),
            info: trackInfo,
            originalTrackUrl: this.extractOriginalTrackUrl(container)
        };
    }

    /**
     * Build track info from V2 response
     */
    buildTrackInfoFromV2(data, fallbackTrackId) {
        const manifestMimeType =
            typeof data.manifestMimeType === 'string' && data.manifestMimeType.trim().length > 0
                ? data.manifestMimeType
                : 'application/dash+xml';

        return {
            trackId: typeof data.trackId === 'number' ? data.trackId : fallbackTrackId,
            audioMode: typeof data.audioMode === 'string' ? data.audioMode : 'STEREO',
            audioQuality: typeof data.audioQuality === 'string' ? data.audioQuality : 'LOSSLESS',
            manifest: typeof data.manifest === 'string' ? data.manifest : '',
            manifestMimeType,
            manifestHash: typeof data.manifestHash === 'string' ? data.manifestHash : undefined,
            assetPresentation: typeof data.assetPresentation === 'string' ? data.assetPresentation : 'FULL',
            albumReplayGain: typeof data.albumReplayGain === 'number' ? data.albumReplayGain : undefined,
            albumPeakAmplitude: typeof data.albumPeakAmplitude === 'number' ? data.albumPeakAmplitude : undefined,
            trackReplayGain: typeof data.trackReplayGain === 'number' ? data.trackReplayGain : undefined,
            trackPeakAmplitude: typeof data.trackPeakAmplitude === 'number' ? data.trackPeakAmplitude : undefined,
            bitDepth: typeof data.bitDepth === 'number' ? data.bitDepth : undefined,
            sampleRate: typeof data.sampleRate === 'number' ? data.sampleRate : undefined
        };
    }

    /**
     * Extract track from payload
     */
    extractTrackFromPayload(payload) {
        const candidates = [];
        if (!payload) return undefined;

        if (Array.isArray(payload)) {
            candidates.push(...payload);
        } else if (typeof payload === 'object') {
            candidates.push(payload);
            for (const value of Object.values(payload)) {
                if (value && (typeof value === 'object' || Array.isArray(value))) {
                    candidates.push(value);
                }
            }
        }

        const isTrackLike = (entry) => {
            if (!entry || typeof entry !== 'object') return false;
            return (
                typeof entry.id === 'number' &&
                typeof entry.title === 'string' &&
                typeof entry.duration === 'number'
            );
        };

        for (const candidate of candidates) {
            if (isTrackLike(candidate)) {
                return candidate;
            }
        }
        return undefined;
    }

    /**
     * Extract original track URL from payload
     */
    extractOriginalTrackUrl(payload) {
        return typeof payload.OriginalTrackUrl === 'string'
            ? payload.OriginalTrackUrl
            : typeof payload.originalTrackUrl === 'string'
                ? payload.originalTrackUrl
                : undefined;
    }

    /**
     * Fetch track metadata separately
     */
    async fetchTrackMetadata(trackId, apiVersion = 'v2') {
        const response = await this.fetch(`${this.baseUrl}/info/?id=${trackId}`, { apiVersion });
        this.ensureNotRateLimited(response);
        if (!response.ok) {
            throw new Error('Failed to fetch track metadata');
        }
        const payload = await response.json();
        const data = this.isV2ApiContainer(payload) ? payload.data : payload;
        const track = this.extractTrackFromPayload(data);
        if (!track) {
            throw new Error('Track metadata not found');
        }
        return this.prepareTrack(track);
    }

    /**
     * Get album details with track listing
     * @param {number} id - Album ID
     * @returns {Promise<{album: object, tracks: Array}>}
     */
    async getAlbum(id) {
        const response = await this.fetch(`${this.baseUrl}/album/?id=${id}`);
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to get album');
        const data = await response.json();

        // Handle v2/new API structure
        if (data && typeof data === 'object' && 'data' in data && 'items' in data.data) {
            const items = data.data.items;
            if (Array.isArray(items) && items.length > 0) {
                const firstItem = items[0];
                const firstTrack = firstItem.item || firstItem;

                if (firstTrack && firstTrack.album) {
                    let albumEntry = this.prepareAlbum(firstTrack.album);
                    if (!albumEntry.artist && firstTrack.artist) {
                        albumEntry = { ...albumEntry, artist: firstTrack.artist };
                    }

                    const tracks = items
                        .map((i) => {
                            if (!i || typeof i !== 'object') return null;
                            const t = i.item || i;
                            if (!t) return null;
                            return this.prepareTrack({ ...t, album: albumEntry });
                        })
                        .filter((t) => t !== null);

                    return { album: albumEntry, tracks };
                }
            }
        }

        // Handle v1 API structure
        const entries = Array.isArray(data) ? data : [data];
        let albumEntry;
        let trackCollection;

        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            if (!albumEntry && 'title' in entry && 'id' in entry && 'cover' in entry) {
                albumEntry = this.prepareAlbum(entry);
                continue;
            }

            if (!trackCollection && 'items' in entry && Array.isArray(entry.items)) {
                trackCollection = entry;
            }
        }

        if (!albumEntry) {
            throw new Error('Album not found');
        }

        const tracks = [];
        if (trackCollection?.items) {
            for (const rawItem of trackCollection.items) {
                if (!rawItem || typeof rawItem !== 'object') continue;

                let trackCandidate;
                if ('item' in rawItem && rawItem.item && typeof rawItem.item === 'object') {
                    trackCandidate = rawItem.item;
                } else {
                    trackCandidate = rawItem;
                }

                if (!trackCandidate) continue;

                const candidateWithAlbum = trackCandidate.album
                    ? trackCandidate
                    : { ...trackCandidate, album: albumEntry };
                tracks.push(this.prepareTrack(candidateWithAlbum));
            }
        }

        return { album: albumEntry, tracks };
    }

    /**
     * Get playlist details
     * @param {string} uuid - Playlist UUID
     * @returns {Promise<{playlist: object, items: Array}>}
     */
    async getPlaylist(uuid) {
        const response = await this.fetch(`${this.baseUrl}/playlist/?id=${uuid}`);
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to get playlist');
        const data = await response.json();

        // Handle v2 structure
        if (data && typeof data === 'object' && 'playlist' in data && 'items' in data) {
            return {
                playlist: data.playlist,
                items: data.items
            };
        }

        return {
            playlist: Array.isArray(data) ? data[0] : data,
            items: Array.isArray(data) && data[1] ? data[1].items : []
        };
    }

    /**
     * Get artist details with discography
     * @param {number} id - Artist ID
     * @returns {Promise<object>}
     */
    async getArtist(id) {
        const response = await this.fetch(`${this.baseUrl}/artist/?f=${id}`);
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to get artist');
        const data = await response.json();
        const entries = Array.isArray(data) ? data : [data];

        const visited = new Set();
        const albumMap = new Map();
        const trackMap = new Map();
        let artist;

        const isTrackLike = (value) => {
            if (!value || typeof value !== 'object') return false;
            return (
                typeof value.id === 'number' &&
                typeof value.title === 'string' &&
                typeof value.duration === 'number' &&
                'trackNumber' in value &&
                value.album !== undefined &&
                value.album !== null
            );
        };

        const isAlbumLike = (value) => {
            if (!value || typeof value !== 'object') return false;
            return (
                typeof value.id === 'number' &&
                typeof value.title === 'string' &&
                'cover' in value
            );
        };

        const isArtistLike = (value) => {
            if (!value || typeof value !== 'object') return false;
            return (
                typeof value.id === 'number' &&
                typeof value.name === 'string' &&
                typeof value.type === 'string' &&
                ('artistRoles' in value || 'artistTypes' in value || 'url' in value)
            );
        };

        const recordArtist = (candidate) => {
            if (!candidate) return;
            const normalized = this.prepareArtist(candidate);
            if (!artist || artist.id === normalized.id) {
                artist = normalized;
            }
        };

        const addAlbum = (candidate) => {
            if (!candidate || typeof candidate.id !== 'number') return;
            const normalized = this.prepareAlbum({ ...candidate });
            albumMap.set(normalized.id, normalized);
            recordArtist(normalized.artist ?? normalized.artists?.[0]);
        };

        const addTrack = (candidate) => {
            if (!candidate || typeof candidate.id !== 'number') return;
            const normalized = this.prepareTrack({ ...candidate });
            if (!normalized.album) return;
            addAlbum(normalized.album);
            const knownAlbum = albumMap.get(normalized.album.id);
            if (knownAlbum) normalized.album = knownAlbum;
            trackMap.set(normalized.id, normalized);
            recordArtist(normalized.artist);
        };

        const parseModuleItems = (items) => {
            if (!Array.isArray(items)) return;
            for (const entry of items) {
                if (!entry || typeof entry !== 'object') continue;
                const candidate = 'item' in entry ? entry.item : entry;
                if (isAlbumLike(candidate)) {
                    addAlbum(candidate);
                    continue;
                }
                if (isTrackLike(candidate)) {
                    addTrack(candidate);
                    continue;
                }
                scanValue(candidate);
            }
        };

        const scanValue = (value) => {
            if (!value) return;
            if (Array.isArray(value)) {
                const trackCandidates = value.filter(isTrackLike);
                if (trackCandidates.length > 0) {
                    for (const track of trackCandidates) addTrack(track);
                    return;
                }
                for (const entry of value) scanValue(entry);
                return;
            }

            if (typeof value !== 'object') return;
            if (visited.has(value)) return;
            visited.add(value);

            if (isArtistLike(value)) recordArtist(value);
            if ('modules' in value && Array.isArray(value.modules)) {
                for (const moduleEntry of value.modules) scanValue(moduleEntry);
            }
            if ('pagedList' in value && value.pagedList?.items) {
                parseModuleItems(value.pagedList.items);
            }
            if ('items' in value && Array.isArray(value.items)) parseModuleItems(value.items);
            if ('rows' in value && Array.isArray(value.rows)) parseModuleItems(value.rows);
            if ('listItems' in value && Array.isArray(value.listItems)) parseModuleItems(value.listItems);
            for (const nested of Object.values(value)) scanValue(nested);
        };

        for (const entry of entries) scanValue(entry);

        if (!artist) {
            const trackPrimaryArtist = Array.from(trackMap.values())
                .map((t) => t.artist ?? t.artists?.[0])
                .find(Boolean);
            const albumPrimaryArtist = Array.from(albumMap.values())
                .map((a) => a.artist ?? a.artists?.[0])
                .find(Boolean);
            recordArtist(trackPrimaryArtist ?? albumPrimaryArtist);
        }

        if (!artist) {
            throw new Error('Artist not found');
        }

        const albums = Array.from(albumMap.values()).map((album) => {
            if (!album.artist && artist) return { ...album, artist };
            return album;
        });

        const albumById = new Map(albums.map((album) => [album.id, album]));

        const tracks = Array.from(trackMap.values()).map((track) => {
            const enrichedArtist = track.artist ?? artist;
            const album = track.album;
            const enrichedAlbum = album
                ? (albumById.get(album.id) ?? (artist && !album.artist ? { ...album, artist } : album))
                : undefined;
            return {
                ...track,
                artist: enrichedArtist ?? track.artist,
                album: enrichedAlbum ?? album
            };
        });

        const parseDate = (value) => {
            if (!value) return NaN;
            const timestamp = Date.parse(value);
            return Number.isFinite(timestamp) ? timestamp : NaN;
        };

        const sortedAlbums = albums.sort((a, b) => {
            const timeA = parseDate(a.releaseDate);
            const timeB = parseDate(b.releaseDate);
            if (isNaN(timeA) && isNaN(timeB)) return (b.popularity ?? 0) - (a.popularity ?? 0);
            if (isNaN(timeA)) return 1;
            if (isNaN(timeB)) return -1;
            return timeB - timeA;
        });

        const sortedTracks = tracks
            .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
            .slice(0, 100);

        return {
            ...artist,
            albums: sortedAlbums,
            tracks: sortedTracks
        };
    }

    /**
     * Get cover image
     * @param {number} id - Cover ID
     * @param {string} query - Search query
     * @returns {Promise<Array>}
     */
    async getCover(id, query) {
        let url = `${this.baseUrl}/cover/?`;
        if (id) url += `id=${id}`;
        if (query) url += `q=${encodeURIComponent(query)}`;
        const response = await this.fetch(url);
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to get cover');
        return response.json();
    }

    /**
     * Get lyrics for a track
     * @param {number} id - Track ID
     * @returns {Promise<object>}
     */
    async getLyrics(id) {
        const response = await this.fetch(`${this.baseUrl}/lyrics/?id=${id}`);
        this.ensureNotRateLimited(response);
        if (!response.ok) throw new Error('Failed to get lyrics');
        const data = await response.json();
        return Array.isArray(data) ? data[0] : data;
    }

    /**
     * Import content from a Tidal URL
     * @param {string} url - Tidal URL
     * @returns {Promise<{type: string, data: object}>}
     */
    async importFromUrl(url) {
        const parsed = parseTidalUrl(url);

        if (parsed.type === 'unknown') {
            throw new Error('Invalid Tidal URL. Please provide a valid track, album, artist, or playlist URL.');
        }

        switch (parsed.type) {
            case 'track': {
                if (!parsed.trackId) throw new Error('Could not extract track ID from URL');
                const lookup = await this.getTrack(parsed.trackId);
                return { type: 'track', data: this.prepareTrack(lookup.track) };
            }
            case 'album': {
                if (!parsed.albumId) throw new Error('Could not extract album ID from URL');
                const { album } = await this.getAlbum(parsed.albumId);
                return { type: 'album', data: this.prepareAlbum(album) };
            }
            case 'artist': {
                if (!parsed.artistId) throw new Error('Could not extract artist ID from URL');
                const artist = await this.getArtist(parsed.artistId);
                return { type: 'artist', data: this.prepareArtist(artist) };
            }
            case 'playlist': {
                if (!parsed.playlistId) throw new Error('Could not extract playlist ID from URL');
                const { playlist, items } = await this.getPlaylist(parsed.playlistId);
                const tracks = items.map((item) => this.prepareTrack(item.item));
                return { type: 'playlist', data: { playlist, tracks } };
            }
            default:
                throw new Error('Unsupported URL type');
        }
    }

    /**
     * Decode base64 manifest
     */
    decodeBase64Manifest(manifest) {
        if (typeof manifest !== 'string') return '';
        const trimmed = manifest.trim();
        if (!trimmed) return '';
        try {
            let value = trimmed.replace(/-/g, '+').replace(/_/g, '/');
            const pad = value.length % 4;
            if (pad === 2) value += '==';
            if (pad === 3) value += '=';
            const decoded = atob(value);
            return decoded || trimmed;
        } catch {
            return trimmed;
        }
    }

    /**
     * Extract stream URL from manifest
     */
    extractStreamUrlFromManifest(manifest) {
        try {
            const decoded = this.decodeBase64Manifest(manifest);
            try {
                const parsed = JSON.parse(decoded);
                if (parsed && Array.isArray(parsed.urls) && parsed.urls.length > 0) {
                    return parsed.urls[0] ?? null;
                }
            } catch {
                // Not JSON, try regex
            }

            const urlRegex = /https?:\/\/[\w\-.~:?#[\]@!$&'()*+,;=%/]+/g;
            let match;
            while ((match = urlRegex.exec(decoded)) !== null) {
                const url = match[0];
                if (url.includes('$Number$')) continue;
                if (/\/\d+\.mp4/.test(url)) continue;
                if (this.isValidMediaUrl(url)) return url;
            }
            return null;
        } catch (error) {
            console.error('Failed to decode manifest:', error);
            return null;
        }
    }

    /**
     * Check if URL is valid media URL
     */
    isValidMediaUrl(url) {
        if (!url) return false;
        const normalized = url.toLowerCase();
        if (normalized.includes('w3.org')) return false;
        if (normalized.includes('xmlschema')) return false;
        if (normalized.includes('xmlns')) return false;
        if (
            normalized.includes('.flac') ||
            normalized.includes('.mp4') ||
            normalized.includes('.m4a') ||
            normalized.includes('.aac') ||
            normalized.includes('token=') ||
            normalized.includes('/audio/')
        ) {
            return true;
        }
        if (/\/[^/]+\.[a-z0-9]{2,5}(\?|$)/i.test(url)) return true;
        return false;
    }

    /**
     * Get stream data for a track
     * @param {number} trackId - Track ID
     * @param {string} quality - Audio quality
     * @returns {Promise<{url: string, replayGain: number|null, sampleRate: number|null, bitDepth: number|null}>}
     */
    async getStreamData(trackId, quality = 'LOSSLESS') {
        let replayGain = null;
        let sampleRate = null;
        let bitDepth = null;
        let lastError = null;
        let effectiveQuality = quality;

        // Hi-Res to CD Lossless fallback: if Hi-Res is requested, try it first
        // but fall back to LOSSLESS if it fails or returns lower quality
        if (quality === 'HI_RES_LOSSLESS') {
            try {
                const hiResLookup = await this.getTrack(trackId, 'HI_RES_LOSSLESS');
                const returnedQuality = hiResLookup.info?.audioQuality;

                // Check if the returned quality is actually Hi-Res
                const isHiRes = returnedQuality === 'HI_RES_LOSSLESS' || returnedQuality === 'HI_RES';
                if (!isHiRes) {
                    console.log(`[Stream] Track ${trackId} does not support Hi-Res (returned: ${returnedQuality}), using LOSSLESS stream`);
                }

                // Use the lookup we already have - it contains valid stream data
                replayGain = hiResLookup.info.trackReplayGain ?? null;
                sampleRate = hiResLookup.info.sampleRate ?? null;
                bitDepth = hiResLookup.info.bitDepth ?? null;

                if (hiResLookup.originalTrackUrl) {
                    return { url: hiResLookup.originalTrackUrl, replayGain, sampleRate, bitDepth };
                }

                const manifestUrl = this.extractStreamUrlFromManifest(hiResLookup.info.manifest);
                if (manifestUrl) {
                    return { url: manifestUrl, replayGain, sampleRate, bitDepth };
                }

                // If we got here, Hi-Res lookup succeeded but no URL - try LOSSLESS explicitly
                effectiveQuality = 'LOSSLESS';
            } catch (hiResError) {
                // Hi-Res request failed, fall back to LOSSLESS
                console.log(`[Stream] Hi-Res failed for track ${trackId}, falling back to CD Lossless`);
                effectiveQuality = 'LOSSLESS';
            }
        }

        // Main streaming loop (used for LOSSLESS fallback or non-Hi-Res requests)
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const lookup = await this.getTrack(trackId, effectiveQuality);

                replayGain = lookup.info.trackReplayGain ?? null;
                sampleRate = lookup.info.sampleRate ?? null;
                bitDepth = lookup.info.bitDepth ?? null;

                const isLossless = effectiveQuality === 'LOSSLESS' || effectiveQuality === 'HI_RES_LOSSLESS';

                if (lookup.originalTrackUrl && isLossless) {
                    return { url: lookup.originalTrackUrl, replayGain, sampleRate, bitDepth };
                }

                const manifestUrl = this.extractStreamUrlFromManifest(lookup.info.manifest);
                if (manifestUrl) {
                    return { url: manifestUrl, replayGain, sampleRate, bitDepth };
                }

                if (lookup.originalTrackUrl) {
                    return { url: lookup.originalTrackUrl, replayGain, sampleRate, bitDepth };
                }

                lastError = new Error('Unable to resolve stream URL for track');
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }

            if (attempt < 3) {
                await this.delay(200 * attempt);
            }
        }

        throw lastError ?? new Error('Unable to resolve stream URL for track');
    }

    /**
     * Get stream URL for a track
     * @param {number} trackId - Track ID
     * @param {string} quality - Audio quality
     * @returns {Promise<string>}
     */
    async getStreamUrl(trackId, quality = 'LOSSLESS') {
        const data = await this.getStreamData(trackId, quality);
        return data.url;
    }
}

// Create singleton instance
export const losslessAPI = new LosslessAPI();

export default LosslessAPI;
