/**
 * Download Utilities for Music
 * 
 * Ported from tidal-ui/src/lib/downloads.ts
 * Provides:
 * - Single track download
 * - Album download (individual files, ZIP, or CSV)
 * - CSV link generation
 * - Retry logic with exponential backoff
 * - Cover art download
 */

import { losslessAPI } from './losslessApi';
import JSZip from 'jszip';
import { API_CONFIG } from './musicConfig';

/**
 * Get proxied URL for images if needed
 */
function getProxyUrl(url) {
    if (API_CONFIG.useProxy && API_CONFIG.proxyUrl) {
        return `${API_CONFIG.proxyUrl}?url=${encodeURIComponent(url)}`;
    }
    return url;
}

/**
 * Detect image format from binary data
 */
function detectImageFormat(data) {
    if (!data || data.length < 4) {
        return null;
    }

    // Check for JPEG magic bytes (FF D8 FF)
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return { extension: 'jpg', mimeType: 'image/jpeg' };
    }

    // Check for PNG magic bytes (89 50 4E 47)
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
        return { extension: 'png', mimeType: 'image/png' };
    }

    // Check for WebP magic bytes (52 49 46 46 ... 57 45 42 50)
    if (data.length >= 12 &&
        data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
        data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
        return { extension: 'webp', mimeType: 'image/webp' };
    }

    return null;
}

/**
 * Sanitize string for use in filename
 */
export function sanitizeForFilename(value) {
    if (!value) return 'Unknown';
    return value
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Get file extension for quality
 */
export function getExtensionForQuality(quality, convertAacToMp3 = false) {
    switch (quality) {
        case 'LOW':
        case 'HIGH':
            return convertAacToMp3 ? 'mp3' : 'm4a';
        default:
            return 'flac';
    }
}

/**
 * Format artists array to string
 */
export function formatArtists(artists) {
    if (!artists || !Array.isArray(artists) || artists.length === 0) {
        return 'Unknown Artist';
    }
    return artists.map(a => a.name).join(', ');
}

/**
 * Build track filename
 */
export function buildTrackFilename(album, track, quality, artistName, convertAacToMp3 = false) {
    const extension = getExtensionForQuality(quality, convertAacToMp3);
    const trackNumber = Number(track.trackNumber);

    const trackPart = Number.isFinite(trackNumber) && trackNumber > 0
        ? `${trackNumber}`.padStart(2, '0') : '00';

    let title = track.title;
    if (track.version) {
        title = `${title} (${track.version})`;
    }

    const artist = artistName ?? formatArtists(track.artists);

    return `${trackPart} ${sanitizeForFilename(title)} - ${sanitizeForFilename(artist)}.${extension}`;
}

/**
 * Escape value for CSV
 */
function escapeCsvValue(value) {
    const normalized = String(value ?? '').replace(/\r?\n|\r/g, ' ');
    if (/[",]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

/**
 * Format duration in mm:ss
 */
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Build CSV with track links
 */
export async function buildTrackLinksCsv(tracks, quality) {
    const header = ['Index', 'Title', 'Artist', 'Album', 'Duration', 'FLAC URL'];
    const rows = [];

    for (const [index, track] of tracks.entries()) {
        try {
            const streamData = await losslessAPI.getStreamData(track.id, quality);
            rows.push([
                `${index + 1}`,
                track.title ?? '',
                formatArtists(track.artists),
                track.album?.title ?? '',
                formatDuration(track.duration ?? 0),
                streamData.url ?? ''
            ]);
        } catch (err) {
            console.warn(`Failed to get stream URL for track ${track.id}:`, err);
            rows.push([
                `${index + 1}`,
                track.title ?? '',
                formatArtists(track.artists),
                track.album?.title ?? '',
                formatDuration(track.duration ?? 0),
                'ERROR: Failed to get URL'
            ]);
        }
    }

    return [header, ...rows]
        .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
        .join('\n');
}

/**
 * Trigger file download in browser
 */
export function triggerFileDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Download track with retry logic
 */
export async function downloadTrackWithRetry(trackId, quality, filename, track, callbacks, options = {}) {
    const maxAttempts = 3;
    const baseDelay = 1000;
    const trackTitle = track?.title ?? 'Unknown Track';
    const artistName = formatArtists(track?.artists);

    console.log(`[Track Download] Starting download: "${trackTitle}" by ${artistName} (ID: ${trackId}, Quality: ${quality})`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[Track Download] Retry attempt ${attempt}/${maxAttempts} for "${trackTitle}"`);
            }

            // Get stream data
            const streamData = await losslessAPI.getStreamData(trackId, quality);

            // Fetch the audio file
            const response = await fetch(streamData.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Get total length
            const contentLength = response.headers.get('content-length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
            let receivedBytes = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedBytes += value.length;

                // Report progress
                if (callbacks?.onProgress) {
                    callbacks.onProgress(receivedBytes, totalBytes);
                }
            }

            // Assemble blob - save raw audio without metadata embedding for faster downloads
            const blob = new Blob(chunks, { type: 'audio/flac' });

            console.log(`[Track Download] ✓ Success: "${trackTitle}" (${(blob.size / 1024 / 1024).toFixed(2)} MB)${attempt > 1 ? ` - succeeded on attempt ${attempt}` : ''}`);
            return { success: true, blob };
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            console.warn(
                `[Track Download] ✗ Attempt ${attempt}/${maxAttempts} failed for "${trackTitle}": ${errorObj.message}`
            );

            callbacks?.onTrackFailed?.(track, errorObj, attempt);

            if (attempt < maxAttempts) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`[Track Download] Waiting ${delay}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                console.error(
                    `[Track Download] ✗✗✗ All ${maxAttempts} attempts failed for "${trackTitle}" - giving up`
                );
                return { success: false, error: errorObj };
            }
        }
    }

    return { success: false, error: new Error('Download failed after all retry attempts') };
}

/**
 * Download a single track
 */
export async function downloadTrack(track, quality, options = {}) {
    const artistName = track.artist?.name ?? formatArtists(track.artists);
    const album = track.album ?? { title: 'Unknown Album' };
    const filename = options.filename ?? buildTrackFilename(album, track, quality, artistName, options.convertAacToMp3);

    const result = await downloadTrackWithRetry(track.id, quality, filename, track, options.callbacks, options);

    if (result.success && result.blob) {
        triggerFileDownload(result.blob, filename);
        return { success: true, filename };
    }

    return { success: false, error: result.error };
}

/**
 * Download album cover
 */
export async function downloadCover(coverId, preferredFilename = 'cover') {
    const coverSizes = ['1280', '640', '320'];

    for (const size of coverSizes) {
        const rawCoverUrl = `https://resources.tidal.com/images/${coverId.replace(/-/g, '/')}/${size}x${size}.jpg`;
        const coverUrl = getProxyUrl(rawCoverUrl);

        try {
            const response = await fetch(coverUrl, {
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) continue;

            const contentType = response.headers.get('Content-Type');
            if (contentType && !contentType.startsWith('image/')) continue;

            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) continue;

            const uint8Array = new Uint8Array(arrayBuffer);
            const imageFormat = detectImageFormat(uint8Array);
            if (!imageFormat) continue;

            const blob = new Blob([uint8Array], { type: imageFormat.mimeType });
            triggerFileDownload(blob, `${preferredFilename}.${imageFormat.extension}`);
            return { success: true };
        } catch (err) {
            console.warn(`Failed to download cover at size ${size}:`, err);
        }
    }

    return { success: false, error: new Error('All cover download attempts failed') };
}



/**
 * Download album (individual, ZIP, or CSV mode)
 */
export async function downloadAlbum(album, tracks, quality, callbacks, options = {}) {
    const total = tracks.length;
    callbacks?.onTotalResolved?.(total);

    const mode = options.mode ?? 'individual';
    const convertAacToMp3 = options.convertAacToMp3 ?? false;
    const downloadCoverSeperately = options.downloadCoverSeperately ?? false;

    const artistName = sanitizeForFilename(
        options.preferredArtistName ?? album.artist?.name ?? 'Unknown Artist'
    );
    const albumTitle = sanitizeForFilename(album.title ?? 'Unknown Album');

    console.log(`[Album Download] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Album Download] Starting: "${albumTitle}" by ${artistName}`);
    console.log(`[Album Download] Tracks: ${total} | Quality: ${quality} | Mode: ${mode}`);
    console.log(`[Album Download] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // CSV mode
    if (mode === 'csv') {
        let completed = 0;
        for (const track of tracks) {
            completed += 1;
            callbacks?.onTrackDownloaded?.(completed, total, track);
        }
        const csvContent = await buildTrackLinksCsv(tracks, quality);
        const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        triggerFileDownload(csvBlob, `${artistName} - ${albumTitle}.csv`);
        return { success: true, mode: 'csv' };
    }

    // ZIP mode
    if (mode === 'zip') {
        const zip = new JSZip();
        let completed = 0;
        let failedCount = 0;

        // Download tracks
        for (const track of tracks) {
            const filename = buildTrackFilename(
                album,
                track,
                quality,
                options.preferredArtistName,
                convertAacToMp3
            );

            const result = await downloadTrackWithRetry(
                track.id,
                quality,
                filename,
                track,
                callbacks,
                { convertAacToMp3 }
            );

            if (result.success && result.blob) {
                zip.file(filename, result.blob);
            } else {
                console.error(`[ZIP Download] Track failed: ${track.title}`, result.error);
                failedCount++;
            }

            completed += 1;
            callbacks?.onTrackDownloaded?.(completed, total, track);
        }

        // Download cover if requested
        if (downloadCoverSeperately && album.cover) {
            try {
                // Reuse existing downloadCover but we need the blob, not trigger download
                // We'll verify what downloadCover does. It triggers download. 
                // We should probably fetch it manually here or modify downloadCover to return blob.
                // For now, let's just fetch it here to be safe and simple.
                const coverSizes = ['1280', '640', '320'];
                let coverAdded = false;

                for (const size of coverSizes) {
                    if (coverAdded) break;
                    const rawCoverUrl = `https://resources.tidal.com/images/${album.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
                    const coverUrl = getProxyUrl(rawCoverUrl);
                    try {
                        const response = await fetch(coverUrl, { signal: AbortSignal.timeout(10000) });
                        if (response.ok) {
                            const blob = await response.blob();
                            // simple check if it's an image
                            if (blob.size > 0 && blob.type.startsWith('image/')) {
                                const ext = blob.type.split('/')[1] || 'jpg';
                                zip.file(`${artistName} - ${albumTitle} - cover.${ext}`, blob);
                                coverAdded = true;
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            } catch (e) {
                console.warn('Failed to add cover to ZIP', e);
            }
        }

        if (failedCount < total) {
            try {
                const zipContent = await zip.generateAsync({ type: 'blob' });
                triggerFileDownload(zipContent, `${artistName} - ${albumTitle}.zip`);
            } catch (err) {
                console.error('Failed to generate ZIP file:', err);
                return { success: false, error: err };
            }
        }

        // Summary logging
        const successCount = total - failedCount;
        console.log(`[Album Download] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[Album Download] Complete: "${albumTitle}" (ZIP)`);
        console.log(`[Album Download] ✓ Success: ${successCount}/${total} tracks`);
        if (failedCount > 0) {
            console.log(`[Album Download] ✗ Failed: ${failedCount} track(s)`);
        }
        console.log(`[Album Download] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        return {
            success: failedCount === 0,
            successCount,
            failedCount,
            total
        };
    }

    // Individual downloads (legacy/default)
    let completed = 0;
    let failedCount = 0;

    for (const track of tracks) {
        const filename = buildTrackFilename(
            album,
            track,
            quality,
            options.preferredArtistName,
            convertAacToMp3
        );

        const result = await downloadTrackWithRetry(
            track.id,
            quality,
            filename,
            track,
            callbacks,
            { convertAacToMp3 }
        );

        if (result.success && result.blob) {
            triggerFileDownload(result.blob, filename);
        } else {
            console.error(`[Individual Download] Track failed: ${track.title}`, result.error);
            failedCount++;
        }

        completed += 1;
        callbacks?.onTrackDownloaded?.(completed, total, track);
    }

    // Download cover separately if enabled
    if (downloadCoverSeperately && album.cover) {
        await downloadCover(album.cover, `${artistName} - ${albumTitle} - cover`);
    }

    // Summary logging
    const successCount = total - failedCount;
    console.log(`[Album Download] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Album Download] Complete: "${albumTitle}"`);
    console.log(`[Album Download] ✓ Success: ${successCount}/${total} tracks`);
    if (failedCount > 0) {
        console.log(`[Album Download] ✗ Failed: ${failedCount} track(s)`);
    }
    console.log(`[Album Download] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return {
        success: failedCount === 0,
        successCount,
        failedCount,
        total
    };
}

export default {
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
};
