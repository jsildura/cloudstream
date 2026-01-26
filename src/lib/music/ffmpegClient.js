/**
 * FFmpeg Client for Browser
 * 
 * Ported from tidal-ui/src/lib/ffmpegClient.ts
 * Provides:
 * - Progressive WASM loading with progress tracking
 * - AAC to MP3 conversion
 * - Asset caching
 * - Metadata embedding
 * 
 * NOTE: This module uses lazy loading. FFmpeg packages are optional
 * and will only be loaded when conversion features are used.
 */

// Use @ffmpeg/core-st (single-threaded) - specifically designed to work without SharedArrayBuffer
const CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/umd';
const CORE_JS_NAME = 'ffmpeg-core.js';
const CORE_WASM_NAME = 'ffmpeg-core.wasm';

// Singleton state
let ffmpegInstance = null;
let loadPromise = null;
let fetchFileFn = null;
let assetsPromise = null;
let estimatedSizePromise = null;
let ffmpegAvailable = null;

/**
 * Check if FFmpeg packages are available
 */
async function checkFFmpegAvailable() {
    if (ffmpegAvailable !== null) return ffmpegAvailable;

    try {
        // Try to dynamically import - will fail if not installed
        await import('@ffmpeg/ffmpeg');
        ffmpegAvailable = true;
    } catch {
        console.warn('[FFmpeg] @ffmpeg/ffmpeg package not installed. Audio conversion features will be disabled.');
        ffmpegAvailable = false;
    }

    return ffmpegAvailable;
}

/**
 * Dynamically import FFmpeg class
 */
async function ensureFFmpegClass() {
    if (!await checkFFmpegAvailable()) {
        throw new Error('FFmpeg is not available. Install @ffmpeg/ffmpeg and @ffmpeg/util to enable conversion features.');
    }
    const module = await import('@ffmpeg/ffmpeg');
    return module.FFmpeg;
}

/**
 * Dynamically import fetchFile utility
 */
async function ensureFetchFile() {
    if (fetchFileFn) return fetchFileFn;

    if (!await checkFFmpegAvailable()) {
        throw new Error('FFmpeg is not available. Install @ffmpeg/ffmpeg and @ffmpeg/util to enable conversion features.');
    }

    try {
        const module = await import('@ffmpeg/util');
        fetchFileFn = module.fetchFile;
        return fetchFileFn;
    } catch {
        throw new Error('@ffmpeg/util package not installed. Install it to enable conversion features.');
    }
}

/**
 * Fetch asset size via HEAD request
 */
async function fetchHeadSize(path) {
    try {
        console.log(`[FFmpeg] Checking size: ${path}`);
        const response = await fetch(`${CORE_BASE_URL}/${path}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return undefined;
        const length = response.headers.get('Content-Length');
        if (!length) return undefined;
        const numeric = Number(length);
        return Number.isFinite(numeric) ? numeric : undefined;
    } catch (error) {
        console.warn(`[FFmpeg] Failed to probe asset size for ${path}`, error);
        return undefined;
    }
}

/**
 * Stream asset with progress tracking
 */
async function streamAsset(path, options, context) {
    console.log(`[FFmpeg] Downloading asset: ${path}`);
    const response = await fetch(`${CORE_BASE_URL}/${path}`, {
        signal: options?.signal ?? AbortSignal.timeout(120000)
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${path} (${response.status})`);
    }

    const totalBytes = Number(response.headers.get('Content-Length') ?? '0');
    const resolvedTotal = Number.isFinite(totalBytes) && totalBytes > 0
        ? totalBytes
        : context?.totalKnown;

    if (!response.body) {
        const blob = await response.blob();
        const size = blob.size > 0 ? blob.size : resolvedTotal;
        console.log(`[FFmpeg] Asset downloaded (blob): ${path} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        return {
            url: URL.createObjectURL(blob),
            size
        };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let downloaded = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            downloaded += value.byteLength;
            context?.onChunk?.(value.byteLength);
        }
    }

    const blob = new Blob(chunks, {
        type: response.headers.get('Content-Type') ?? 'application/octet-stream'
    });

    console.log(`[FFmpeg] Asset downloaded (stream): ${path} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
        url: URL.createObjectURL(blob),
        size: blob.size > 0 ? blob.size : resolvedTotal
    };
}

/**
 * Ensure assets are loaded (with caching)
 */
async function ensureAssets(options) {
    if (assetsPromise) {
        return assetsPromise;
    }

    assetsPromise = (async () => {
        const [jsSize, wasmSize] = await Promise.all([
            fetchHeadSize(CORE_JS_NAME),
            fetchHeadSize(CORE_WASM_NAME)
        ]);

        const totalKnown = [jsSize, wasmSize]
            .map((value) => (Number.isFinite(value ?? NaN) ? Number(value) : 0))
            .reduce((sum, value) => sum + value, 0);

        let cumulative = 0;
        const notify = (bytes) => {
            cumulative += bytes;
            if (options?.onProgress) {
                options.onProgress({
                    receivedBytes: cumulative,
                    totalBytes: totalKnown > 0 ? totalKnown : undefined
                });
            }
        };

        const { url: coreUrl, size: fetchedJsSize } = await streamAsset(CORE_JS_NAME, options, {
            totalKnown: totalKnown > 0 ? totalKnown : undefined,
            onChunk: notify
        });

        const { url: wasmUrl, size: fetchedWasmSize } = await streamAsset(CORE_WASM_NAME, options, {
            totalKnown: totalKnown > 0 ? totalKnown : undefined,
            onChunk: notify
        });

        const totalBytes = [jsSize ?? fetchedJsSize, wasmSize ?? fetchedWasmSize]
            .filter((value) => Number.isFinite(value ?? NaN))
            .reduce((sum, value) => sum + value, 0);

        return {
            coreUrl,
            wasmUrl,
            totalBytes: totalBytes > 0 ? totalBytes : undefined
        };
    })().catch((error) => {
        assetsPromise = null;
        throw error;
    });

    return assetsPromise;
}

/**
 * Estimate FFmpeg download size
 */
export async function estimateFfmpegDownloadSize() {
    if (!estimatedSizePromise) {
        estimatedSizePromise = (async () => {
            const [jsSize, wasmSize] = await Promise.all([
                fetchHeadSize(CORE_JS_NAME),
                fetchHeadSize(CORE_WASM_NAME)
            ]);
            const total = [jsSize, wasmSize]
                .filter((value) => Number.isFinite(value ?? NaN))
                .reduce((sum, value) => sum + value, 0);
            return total > 0 ? total : undefined;
        })();
    }
    return estimatedSizePromise ?? Promise.resolve(undefined);
}

/**
 * Check if FFmpeg is supported in current environment
 */
export function isFFmpegSupported() {
    return typeof window !== 'undefined' &&
        typeof ReadableStream !== 'undefined' &&
        typeof WebAssembly !== 'undefined';
}

/**
 * Check if FFmpeg is already loaded
 */
export function isFFmpegLoaded() {
    return ffmpegInstance !== null;
}

/**
 * Check if FFmpeg packages are installed
 * Returns a promise that resolves to true if available
 */
export async function isFFmpegAvailable() {
    return checkFFmpegAvailable();
}

/**
 * Get FFmpeg instance (load if not already loaded)
 */
export async function getFFmpeg(options) {
    if (!isFFmpegSupported()) {
        throw new Error('FFmpeg is not supported in this environment.');
    }

    if (ffmpegInstance) {
        return ffmpegInstance;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const FFmpegConstructor = await ensureFFmpegClass();
            const instance = new FFmpegConstructor();

            // Use direct CDN URLs - more reliable than blob URLs for WASM loading
            const coreURL = `${CORE_BASE_URL}/${CORE_JS_NAME}`;
            const wasmURL = `${CORE_BASE_URL}/${CORE_WASM_NAME}`;

            console.log('[FFmpeg] Starting WASM compilation/load (single-threaded @ffmpeg/core-st)...');
            console.log(`[FFmpeg] Core URL: ${coreURL}`);

            // classWorkerURL: false disables web worker (single-threaded mode)
            await instance.load({
                coreURL,
                wasmURL,
                classWorkerURL: false
            });
            console.log('[FFmpeg] Instance loaded successfully.');

            ffmpegInstance = instance;
            return instance;
        })().catch((error) => {
            console.error('[FFmpeg] Load failed:', error);
            loadPromise = null;
            throw error;
        });
    }

    return loadPromise;
}

/**
 * Fetch file for FFmpeg processing
 */
export async function fetchFile(input) {
    const fn = await ensureFetchFile();
    return fn(input);
}

/**
 * Convert AAC to MP3 using FFmpeg
 */
export async function convertAacToMp3(aacData, options = {}) {
    const ffmpeg = await getFFmpeg(options);

    const inputName = 'input.m4a';
    const outputName = 'output.mp3';

    // Write input file
    await ffmpeg.writeFile(inputName, aacData);

    // Build FFmpeg command
    const args = [
        '-i', inputName,
        '-codec:a', 'libmp3lame',
        '-q:a', '2', // VBR quality (0-9, 0=best)
    ];

    // Add metadata if provided
    if (options.metadata) {
        const meta = options.metadata;
        if (meta.title) args.push('-metadata', `title=${meta.title}`);
        if (meta.artist) args.push('-metadata', `artist=${meta.artist}`);
        if (meta.album) args.push('-metadata', `album=${meta.album}`);
        if (meta.year) args.push('-metadata', `date=${meta.year}`);
        if (meta.track) args.push('-metadata', `track=${meta.track}`);
    }

    args.push(outputName);

    // Run conversion
    await ffmpeg.exec(args);

    // Read output
    const data = await ffmpeg.readFile(outputName);

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    return data;
}

/**
 * Embed metadata into audio file
 */
export async function embedMetadata(audioData, inputFormat, metadata, coverData = null) {
    const ffmpeg = await getFFmpeg();

    const uniqueId = Date.now().toString() + Math.random().toString().slice(2, 8);
    const inputName = `input_${uniqueId}.${inputFormat}`;
    const outputName = `output_${uniqueId}.${inputFormat}`;

    // Write input file
    await ffmpeg.writeFile(inputName, audioData);

    const args = ['-i', inputName];
    let coverName = null;

    if (coverData) {
        // Simple signature check for png
        const isPng = coverData[0] === 0x89 && coverData[1] === 0x50 && coverData[2] === 0x4e && coverData[3] === 0x47;
        const ext = isPng ? 'png' : 'jpg';
        coverName = `cover_${uniqueId}.${ext}`;
        await ffmpeg.writeFile(coverName, coverData);

        args.push('-i', coverName);
        args.push('-map', '0:a');
        args.push('-map', '1');
        args.push('-c', 'copy');
        args.push('-disposition:v:0', 'attached_pic');
        args.push('-metadata:s:v', 'title=Album cover');
        args.push('-metadata:s:v', 'comment=Cover (front)');
    } else {
        args.push('-codec', 'copy');
    }

    // Add metadata
    if (metadata.title) args.push('-metadata', `title=${metadata.title}`);
    if (metadata.artist) args.push('-metadata', `artist=${metadata.artist}`);
    if (metadata.album) args.push('-metadata', `album=${metadata.album}`);
    if (metadata.albumArtist) args.push('-metadata', `album_artist=${metadata.albumArtist}`);
    if (metadata.year) args.push('-metadata', `date=${metadata.year}`);
    if (metadata.track) args.push('-metadata', `track=${metadata.track}`);
    if (metadata.disc) args.push('-metadata', `disc=${metadata.disc}`);
    if (metadata.genre) args.push('-metadata', `genre=${metadata.genre}`);
    if (metadata.copyright) args.push('-metadata', `copyright=${metadata.copyright}`);
    if (metadata.isrc) args.push('-metadata', `isrc=${metadata.isrc}`);
    if (metadata.upc) args.push('-metadata', `upc=${metadata.upc}`); // Some formats use 'barcode' or 'upc'

    // ReplayGain
    if (metadata.replayGainTrack) args.push('-metadata', `REPLAYGAIN_TRACK_GAIN=${metadata.replayGainTrack}`);
    if (metadata.replayGainAlbum) args.push('-metadata', `REPLAYGAIN_ALBUM_GAIN=${metadata.replayGainAlbum}`);

    // Allow overwriting outputs
    args.push('-y');
    args.push(outputName);

    // Run
    try {
        await ffmpeg.exec(args);
    } catch (e) {
        // Cleanup on failure
        try { await ffmpeg.deleteFile(inputName); } catch { }
        if (coverName) try { await ffmpeg.deleteFile(coverName); } catch { }
        throw e;
    }

    // Read output
    const data = await ffmpeg.readFile(outputName);

    // Cleanup
    try { await ffmpeg.deleteFile(inputName); } catch { }
    if (coverName) { try { await ffmpeg.deleteFile(coverName); } catch { } }
    try { await ffmpeg.deleteFile(outputName); } catch { }

    return data;
}

/**
 * Unload FFmpeg to free memory
 */
export function unloadFFmpeg() {
    if (ffmpegInstance) {
        ffmpegInstance.terminate();
        ffmpegInstance = null;
    }
    loadPromise = null;
}

export default {
    isFFmpegSupported,
    isFFmpegLoaded,
    isFFmpegAvailable,
    getFFmpeg,
    fetchFile,
    convertAacToMp3,
    embedMetadata,
    estimateFfmpegDownloadSize,
    unloadFFmpeg
};
