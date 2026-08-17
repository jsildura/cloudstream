import { describe, it, expect } from 'vitest';
import { getGoogleTokenIdentity } from './globalChatIdentity';

describe('getGoogleTokenIdentity', () => {
    it('returns identity when name and valid https photo are present', () => {
        const identity = getGoogleTokenIdentity('google-123', {
            name: 'Alice Wonderland',
            picture: 'https://lh3.googleusercontent.com/a/alice-photo'
        });
        expect(identity).toEqual({
            uid: 'google-123',
            displayName: 'Alice Wonderland',
            photoURL: 'https://lh3.googleusercontent.com/a/alice-photo'
        });
    });

    it('falls back to "Google User" when name is missing or empty', () => {
        expect(getGoogleTokenIdentity('google-123', { name: '', picture: 'https://example.com/p.jpg' })).toEqual({
            uid: 'google-123',
            displayName: 'Google User',
            photoURL: 'https://example.com/p.jpg'
        });
        expect(getGoogleTokenIdentity('google-123', {})).toEqual({
            uid: 'google-123',
            displayName: 'Google User',
            photoURL: null
        });
        expect(getGoogleTokenIdentity('google-123', { name: null })).toEqual({
            uid: 'google-123',
            displayName: 'Google User',
            photoURL: null
        });
    });

    it('falls back to "Google User" when name exceeds 80 characters', () => {
        const longName = 'A'.repeat(81);
        const identity = getGoogleTokenIdentity('google-123', { name: longName });
        expect(identity.displayName).toBe('Google User');

        const exact80 = 'A'.repeat(80);
        const identity80 = getGoogleTokenIdentity('google-123', { name: exact80 });
        expect(identity80.displayName).toBe(exact80);
    });

    it('rejects non-https and unsafe photo schemes', () => {
        expect(getGoogleTokenIdentity('google-123', { picture: 'http://insecure.com/pic.png' }).photoURL).toBeNull();
        expect(getGoogleTokenIdentity('google-123', { picture: 'javascript:alert(1)' }).photoURL).toBeNull();
        expect(getGoogleTokenIdentity('google-123', { picture: 'data:image/png;base64,123' }).photoURL).toBeNull();
        expect(getGoogleTokenIdentity('google-123', { picture: 'ftp://ftp.example.com/pic.png' }).photoURL).toBeNull();
    });

    it('returns null when uid is missing or null', () => {
        expect(getGoogleTokenIdentity(null, { name: 'Alice' })).toBeNull();
        expect(getGoogleTokenIdentity('', { name: 'Alice' })).toBeNull();
        expect(getGoogleTokenIdentity(undefined, { name: 'Alice' })).toBeNull();
    });
});
