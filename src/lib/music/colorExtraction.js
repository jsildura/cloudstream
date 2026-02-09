/**
 * Color Extraction Utilities
 * 
 * Ported from tidal-ui/src/lib/utils/colorExtraction.ts
 * Extracts color palettes from album art for dynamic background
 */

/**
 * CORS proxy services for fallback
 * Priority order:
 * 1. Local proxy (works in both dev via vite middleware and prod via Cloudflare Function)
 * 2. External proxies as last resort
 */
const CORS_PROXIES = [
    (url) => `/api/proxy?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

/**
 * Extract color palette from an image URL
 * Creates a grid of averaged colors for the WebGL background
 * Tries multiple CORS strategies:
 * 1. Direct fetch with CORS mode
 * 2. CORS proxy services
 * 3. Fallback to default palette
 */
export async function extractPaletteFromImage(
    imageUrl,
    gridWidth = 8,
    gridHeight = 5,
    stretchedWidth = 32,
    stretchedHeight = 18
) {
    // Check if URL is external (cross-origin) - skip direct fetch for these
    const isExternal = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');

    // Only try direct fetch for same-origin URLs (they won't have CORS issues)
    if (!isExternal) {
        try {
            const palette = await fetchAndExtract(imageUrl, gridWidth, gridHeight, stretchedWidth, stretchedHeight);
            if (palette) return palette;
        } catch (e) {
            console.debug('Direct fetch failed, trying proxies...', e.message);
        }
    }

    // For external URLs, use proxy (first one is our local /api/proxy)
    for (const proxyFn of CORS_PROXIES) {
        try {
            const proxiedUrl = proxyFn(imageUrl);
            const palette = await fetchAndExtract(proxiedUrl, gridWidth, gridHeight, stretchedWidth, stretchedHeight);
            if (palette) {
                console.debug('Extracted colors via proxy successfully');
                return palette;
            }
        } catch (e) {
            console.debug('Proxy attempt failed:', e.message);
        }
    }

    // Fallback: generate default purple/blue gradient palette
    console.warn('All color extraction methods failed, using default palette');
    return generateDefaultPalette(gridWidth, gridHeight);
}

/**
 * Fetch image and extract palette
 */
async function fetchAndExtract(url, gridWidth, gridHeight, stretchedWidth, stretchedHeight) {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }

                canvas.width = stretchedWidth;
                canvas.height = stretchedHeight;
                ctx.drawImage(img, 0, 0, stretchedWidth, stretchedHeight);

                const imageData = ctx.getImageData(0, 0, stretchedWidth, stretchedHeight);
                const palette = extractPaletteFromImageData(imageData, gridWidth, gridHeight, stretchedWidth, stretchedHeight);
                resolve(palette);
            } catch (err) {
                reject(err);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image'));
        };
        img.src = objectUrl;
    });
}

/**
 * Extract palette from ImageData
 */
function extractPaletteFromImageData(imageData, gridWidth, gridHeight, stretchedWidth, stretchedHeight) {
    const pixels = imageData.data;
    const cellWidth = stretchedWidth / gridWidth;
    const cellHeight = stretchedHeight / gridHeight;
    const palette = [];
    const totalCells = gridWidth * gridHeight;

    for (let cellIdx = 0; cellIdx < totalCells; cellIdx++) {
        const cellX = cellIdx % gridWidth;
        const cellY = Math.floor(cellIdx / gridWidth);

        const startX = Math.floor(cellX * cellWidth);
        const startY = Math.floor(cellY * cellHeight);
        const endX = Math.floor((cellX + 1) * cellWidth);
        const endY = Math.floor((cellY + 1) * cellHeight);

        let r = 0, g = 0, b = 0, count = 0;

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const idx = (y * stretchedWidth + x) * 4;
                r += pixels[idx];
                g += pixels[idx + 1];
                b += pixels[idx + 2];
                count++;
            }
        }

        if (count > 0) {
            palette.push({
                r: Math.round(r / count),
                g: Math.round(g / count),
                b: Math.round(b / count),
                a: 255
            });
        } else {
            palette.push({ r: 0, g: 0, b: 0, a: 255 });
        }
    }

    return palette;
}

/**
 * Generate a default purple/blue gradient palette
 */
function generateDefaultPalette(gridWidth, gridHeight) {
    const palette = [];
    const totalCells = gridWidth * gridHeight;

    // Create a gradient from deep purple to blue
    const colors = [
        { r: 88, g: 28, b: 135 },   // Deep purple
        { r: 124, g: 58, b: 237 },  // Violet
        { r: 99, g: 102, b: 241 },  // Indigo
        { r: 59, g: 130, b: 246 },  // Blue
        { r: 34, g: 211, b: 238 },  // Cyan
    ];

    for (let i = 0; i < totalCells; i++) {
        const colorIdx = Math.floor((i / totalCells) * colors.length);
        const nextIdx = Math.min(colorIdx + 1, colors.length - 1);
        const t = ((i / totalCells) * colors.length) % 1;

        const c1 = colors[colorIdx];
        const c2 = colors[nextIdx];

        palette.push({
            r: Math.round(c1.r + (c2.r - c1.r) * t),
            g: Math.round(c1.g + (c2.g - c1.g) * t),
            b: Math.round(c1.b + (c2.b - c1.b) * t),
            a: 255
        });
    }

    return palette;
}

/**
 * Calculate color saturation
 */
function getSaturation(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0) return 0;
    return (max - min) / max;
}

/**
 * Calculate color luminance
 */
function getLuminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Get the most vibrant color from a palette
 * Vibrant = high saturation and medium luminance
 */
export function getMostVibrantColor(palette) {
    if (!palette || palette.length === 0) {
        return { r: 102, g: 126, b: 234, a: 255 }; // Default purple
    }

    let bestColor = palette[0];
    let bestScore = 0;

    for (const color of palette) {
        const saturation = getSaturation(color.r, color.g, color.b);
        const luminance = getLuminance(color.r, color.g, color.b);

        // Score based on saturation and preferring medium luminance
        const luminanceScore = 1 - Math.abs(luminance - 0.5) * 2;
        const score = saturation * 0.7 + luminanceScore * 0.3;

        if (score > bestScore) {
            bestScore = score;
            bestColor = color;
        }
    }

    return bestColor;
}

/**
 * Get average color from palette
 */
export function getAverageColor(palette) {
    if (!palette || palette.length === 0) {
        return { r: 102, g: 126, b: 234, a: 255 };
    }

    let r = 0, g = 0, b = 0;

    for (const color of palette) {
        r += color.r;
        g += color.g;
        b += color.b;
    }

    const count = palette.length;
    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
        a: 255
    };
}

/**
 * Get dominant color from palette
 */
export function getDominantColor(palette) {
    if (!palette || palette.length === 0) {
        return { r: 102, g: 126, b: 234, a: 255 };
    }

    // Simple bucket-based approach
    const buckets = new Map();

    for (const color of palette) {
        // Quantize to 8 levels per channel
        const key = `${Math.floor(color.r / 32)},${Math.floor(color.g / 32)},${Math.floor(color.b / 32)}`;
        const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        bucket.count++;
        bucket.r += color.r;
        bucket.g += color.g;
        bucket.b += color.b;
        buckets.set(key, bucket);
    }

    let dominant = null;
    let maxCount = 0;

    for (const bucket of buckets.values()) {
        if (bucket.count > maxCount) {
            maxCount = bucket.count;
            dominant = bucket;
        }
    }

    if (!dominant) {
        return { r: 102, g: 126, b: 234, a: 255 };
    }

    return {
        r: Math.round(dominant.r / dominant.count),
        g: Math.round(dominant.g / dominant.count),
        b: Math.round(dominant.b / dominant.count),
        a: 255
    };
}

export default {
    extractPaletteFromImage,
    getMostVibrantColor,
    getAverageColor,
    getDominantColor
};
