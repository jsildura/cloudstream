import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    MAX_FILE_SIZE,
    AVATAR_MIME_TYPES,
    AVATAR_EXTENSIONS,
    fileToBase64,
    uploadToDrive,
    formatDriveUrl,
    validateAvatarFile
} from './globalChatUpload';

const makeFile = (name, type, size = 1024) => ({ name, type, size });

describe('formatDriveUrl', () => {
    it('passes an lh3 URL through unchanged', () => {
        const url = 'https://lh3.googleusercontent.com/d/1AbC_dEf';
        expect(formatDriveUrl(url)).toBe(url);
    });

    it('normalizes all three Drive URL shapes to the lh3 form', () => {
        expect(formatDriveUrl('https://drive.google.com/file/d/1AbC_dEf/view?usp=sharing'))
            .toBe('https://lh3.googleusercontent.com/d/1AbC_dEf');
        expect(formatDriveUrl('https://drive.google.com/open?id=1AbC_dEf'))
            .toBe('https://lh3.googleusercontent.com/d/1AbC_dEf');
        expect(formatDriveUrl('https://drive.google.com/d/1AbC_dEf'))
            .toBe('https://lh3.googleusercontent.com/d/1AbC_dEf');
    });

    it('returns a download URL when asked', () => {
        expect(formatDriveUrl('https://drive.google.com/file/d/1AbC_dEf/view', 'download'))
            .toBe('https://drive.google.com/uc?export=download&id=1AbC_dEf');
    });

    it('passes non-Drive and empty values through unchanged', () => {
        expect(formatDriveUrl('https://example.com/pic.png')).toBe('https://example.com/pic.png');
        expect(formatDriveUrl('')).toBe('');
        expect(formatDriveUrl(null)).toBe(null);
    });
});

describe('validateAvatarFile', () => {
    it('accepts jpg, jpeg, webp, and gif', () => {
        expect(validateAvatarFile(makeFile('a.jpg', 'image/jpeg')).ok).toBe(true);
        expect(validateAvatarFile(makeFile('a.jpeg', 'image/jpeg')).ok).toBe(true);
        expect(validateAvatarFile(makeFile('a.webp', 'image/webp')).ok).toBe(true);
        expect(validateAvatarFile(makeFile('a.gif', 'image/gif')).ok).toBe(true);
    });

    it('is case-insensitive about the extension', () => {
        expect(validateAvatarFile(makeFile('A.JPG', 'image/jpeg')).ok).toBe(true);
        expect(validateAvatarFile(makeFile('A.WebP', 'image/webp')).ok).toBe(true);
    });

    it('rejects other image types even with a matching MIME', () => {
        expect(validateAvatarFile(makeFile('a.png', 'image/png')).ok).toBe(false);
        expect(validateAvatarFile(makeFile('a.svg', 'image/svg+xml')).ok).toBe(false);
        expect(validateAvatarFile(makeFile('a.avif', 'image/avif')).ok).toBe(false);
    });

    it('rejects non-images outright', () => {
        expect(validateAvatarFile(makeFile('a.pdf', 'application/pdf')).ok).toBe(false);
        expect(validateAvatarFile(makeFile('a.exe', 'application/octet-stream')).ok).toBe(false);
    });

    // Extension and MIME must agree, so neither a renamed payload nor a spoofed
    // content type alone is enough to get through.
    it('rejects a mismatch between extension and MIME type', () => {
        expect(validateAvatarFile(makeFile('a.jpg', 'image/svg+xml')).ok).toBe(false);
        expect(validateAvatarFile(makeFile('a.svg', 'image/jpeg')).ok).toBe(false);
        expect(validateAvatarFile(makeFile('a.gif', 'image/webp')).ok).toBe(false);
    });

    it('rejects a file with no extension', () => {
        expect(validateAvatarFile(makeFile('avatar', 'image/jpeg')).ok).toBe(false);
    });

    it('enforces MAX_FILE_SIZE at the boundary', () => {
        expect(validateAvatarFile(makeFile('a.jpg', 'image/jpeg', MAX_FILE_SIZE)).ok).toBe(true);
        expect(validateAvatarFile(makeFile('a.jpg', 'image/jpeg', MAX_FILE_SIZE + 1)).ok).toBe(false);
    });

    it('rejects an empty file', () => {
        expect(validateAvatarFile(makeFile('a.jpg', 'image/jpeg', 0)).ok).toBe(false);
    });

    it('rejects null and non-file input', () => {
        [null, undefined, {}, 'a.jpg'].forEach(v => expect(validateAvatarFile(v).ok).toBe(false));
    });

    it('always explains why it rejected', () => {
        const result = validateAvatarFile(makeFile('a.png', 'image/png'));
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
    });

    it('exposes the accept lists used by the file input', () => {
        expect(AVATAR_MIME_TYPES).toEqual(['image/jpeg', 'image/webp', 'image/gif']);
        expect(AVATAR_EXTENSIONS).toEqual(['.jpg', '.jpeg', '.webp', '.gif']);
    });
});

describe('fileToBase64', () => {
    it('resolves with the FileReader data URL', async () => {
        class MockFileReader {
            readAsDataURL() { setTimeout(() => { this.result = 'data:image/jpeg;base64,AAAA'; this.onload(); }, 0); }
        }
        vi.stubGlobal('FileReader', MockFileReader);
        await expect(fileToBase64(makeFile('a.jpg', 'image/jpeg'))).resolves.toBe('data:image/jpeg;base64,AAAA');
    });

    it('rejects when the FileReader errors', async () => {
        class MockFileReader {
            readAsDataURL() { setTimeout(() => this.onerror(new Error('read failed')), 0); }
        }
        vi.stubGlobal('FileReader', MockFileReader);
        await expect(fileToBase64(makeFile('a.jpg', 'image/jpeg'))).rejects.toThrow('read failed');
    });
});

describe('uploadToDrive', () => {
    beforeEach(() => {
        class MockFileReader {
            readAsDataURL() { setTimeout(() => { this.result = 'data:image/jpeg;base64,AAAA'; this.onload(); }, 0); }
        }
        vi.stubGlobal('FileReader', MockFileReader);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('posts the payload and returns the uploaded URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            text: () => Promise.resolve(JSON.stringify({ status: 'success', url: 'https://drive.google.com/file/d/1AbC/view' }))
        });
        vi.stubGlobal('fetch', fetchMock);

        const url = await uploadToDrive({ file: makeFile('a.jpg', 'image/jpeg'), uid: 'google-admin-1' });
        expect(url).toBe('https://drive.google.com/file/d/1AbC/view');

        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse(init.body);
        expect(payload.mimeType).toBe('image/jpeg');
        expect(payload.base64).toBe('data:image/jpeg;base64,AAAA');
        // The uid identifies the uploader; an email must never be sent.
        expect(payload.userName).toBe('google-admin-1');
        expect(JSON.stringify(payload)).not.toContain('@');
    });

    it('throws when the response is not JSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve('<html>error</html>') }));
        await expect(uploadToDrive({ file: makeFile('a.jpg', 'image/jpeg'), uid: 'u1' }))
            .rejects.toThrow('Invalid response from upload server');
    });

    it('throws the server message when status is not success', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            text: () => Promise.resolve(JSON.stringify({ status: 'error', message: 'Quota exceeded' }))
        }));
        await expect(uploadToDrive({ file: makeFile('a.jpg', 'image/jpeg'), uid: 'u1' }))
            .rejects.toThrow('Quota exceeded');
    });

    it('returns null without fetching when uid is missing', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(uploadToDrive({ file: makeFile('a.jpg', 'image/jpeg'), uid: null })).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propagates a network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await expect(uploadToDrive({ file: makeFile('a.jpg', 'image/jpeg'), uid: 'u1' })).rejects.toThrow('offline');
    });
});
