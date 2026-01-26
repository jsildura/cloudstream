/**
 * Music Library - Main Entry Point
 * 
 * Re-exports all music-related API and utility functions
 */

// API Client
export { default as LosslessAPI, losslessAPI, DASH_MANIFEST_UNAVAILABLE_CODE } from './losslessApi.js';

// Config
export {
    API_CONFIG,
    selectApiTarget,
    getPrimaryTarget,
    getTargetsForRegion,
    selectApiTargetForRegion,
    hasRegionTargets,
    isProxyTarget,
    getProxiedUrl,
    fetchWithCORS
} from './musicConfig.js';

// URL Parser
export { parseTidalUrl, isTidalUrl } from './urlParser.js';

// Songlink
export {
    SUPPORTED_PLATFORMS,
    isSupportedStreamingUrl,
    isSpotifyPlaylistUrl,
    extractTidalInfo,
    fetchSonglinkData,
    convertToTidal,
    getPlatformName,
    convertSpotifyPlaylist,
    extractTidalSongEntity
} from './songlink.js';

// Downloads
export {
    sanitizeForFilename,
    getExtensionForQuality,
    formatArtists,
    buildTrackFilename,
    buildTrackLinksCsv,
    triggerFileDownload,
    downloadTrackWithRetry,
    downloadTrack,
    downloadCover,
    downloadAlbum
} from './downloads.js';

// FFmpeg
export {
    isFFmpegSupported,
    isFFmpegLoaded,
    isFFmpegAvailable,
    getFFmpeg,
    fetchFile,
    convertAacToMp3,
    embedMetadata,
    estimateFfmpegDownloadSize,
    unloadFFmpeg
} from './ffmpegClient.js';
