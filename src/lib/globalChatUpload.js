/**
 * GlobalChat media upload transport.
 *
 * Extracted from GlobalChat.jsx so both the message composer and the admin
 * dashboard's avatar picker share one implementation, and so the validation and
 * URL normalization are unit-testable without mounting the chat.
 *
 * Uploads go to a Google Apps Script endpoint backed by Drive — the project does
 * not use Firebase Storage (no storage.rules exists).
 */

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxzTmKrwPjOOhL-H7rXVLvs_p9ZPb5aulvhzNhxRlA3x3byy81tUnyFl66MQ5DvEvNo/exec';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Avatar formats the admin dashboard accepts. Extension and MIME must agree. */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/webp', 'image/gif'];
export const AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.webp', '.gif'];

/** `accept` attribute value for the avatar file input. */
export const AVATAR_ACCEPT = [...AVATAR_MIME_TYPES, ...AVATAR_EXTENSIONS].join(',');

const EXTENSION_TO_MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

const formatBytes = bytes => `${Math.round(bytes / (1024 * 1024))}MB`;

/**
 * Reads a file into a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
    });
}

/**
 * Validates a candidate avatar before any bytes leave the browser.
 *
 * Requires the extension and the MIME type to agree, so neither a renamed
 * payload nor a spoofed content type alone gets through.
 *
 * @param {File|null} file
 * @returns {{ok: boolean, error: string|null}}
 */
export function validateAvatarFile(file) {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.size !== 'number') {
        return { ok: false, error: 'Choose an image file.' };
    }

    const dot = file.name.lastIndexOf('.');
    const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
    if (!extension || !AVATAR_EXTENSIONS.includes(extension)) {
        return { ok: false, error: `Use a ${AVATAR_EXTENSIONS.join(', ')} file.` };
    }

    const mime = typeof file.type === 'string' ? file.type.toLowerCase() : '';
    if (!AVATAR_MIME_TYPES.includes(mime)) {
        return { ok: false, error: `Use a ${AVATAR_EXTENSIONS.join(', ')} file.` };
    }
    if (EXTENSION_TO_MIME[extension] !== mime) {
        return { ok: false, error: `That file's type (${mime}) does not match its ${extension} extension.` };
    }

    if (file.size === 0) {
        return { ok: false, error: 'That file is empty.' };
    }
    if (file.size > MAX_FILE_SIZE) {
        return { ok: false, error: `Keep the image under ${formatBytes(MAX_FILE_SIZE)}.` };
    }

    return { ok: true, error: null };
}

/**
 * Uploads a file to Drive via the Apps Script endpoint.
 *
 * The uploader is identified by uid only — never by email, which must not leave
 * GlobalChat in any payload.
 *
 * @param {{file: File, uid: string|null}} args
 * @returns {Promise<string|null>} the raw Drive URL, or null when there is no uid
 */
export async function uploadToDrive({ file, uid }) {
    if (!uid || !file) return null;

    try {
        const base64String = await fileToBase64(file);
        const payload = {
            base64: base64String,
            mimeType: file.type,
            filename: `StreamFlix_${Date.now()}_${file.name}`,
            userName: uid
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch {
            console.error('Response was not JSON:', text);
            throw new Error('Invalid response from upload server');
        }

        if (result.status !== 'success') {
            throw new Error(result.message || 'Upload Failed');
        }
        return result.url;
    } catch (err) {
        console.error('Upload error:', err);
        throw err;
    }
}

/**
 * Normalizes a Drive URL for embedding (lh3.googleusercontent.com is far more
 * reliable in an <img> than drive.google.com).
 *
 * @param {string} url
 * @param {'view'|'download'} [type='view']
 * @returns {string} the normalized URL, or the input unchanged if not a Drive URL
 */
export function formatDriveUrl(url, type = 'view') {
    if (!url) return url;

    // If already in lh3 format, return as-is
    if (url.includes('lh3.googleusercontent.com')) return url;

    // If not a drive URL, return as-is
    if (!url.includes('drive.google.com')) return url;

    // Extract file ID from various Google Drive URL formats
    let id = null;
    const patterns = [
        /\/file\/d\/([^/]+)/,
        /id=([^&]+)/,
        /\/d\/([^/]+)/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) { id = m[1]; break; }
    }
    if (!id) return url;

    // Use lh3.googleusercontent.com format for reliable embedding
    if (type === 'download') {
        return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    return `https://lh3.googleusercontent.com/d/${id}`;
}
