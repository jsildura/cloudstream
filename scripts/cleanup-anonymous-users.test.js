import { describe, it, expect } from 'vitest';
import { isAnonymousUser } from './cleanup-anonymous-users.mjs';

describe('Anonymous User Filter Logic', () => {
    it('identifies anonymous users with empty providerData and no email', () => {
        const anonUser = {
            uid: 'anon-123',
            email: null,
            providerData: []
        };
        expect(isAnonymousUser(anonUser)).toBe(true);
    });

    it('preserves Google users with google.com in providerData', () => {
        const googleUser = {
            uid: 'google-uid-456',
            email: 'user@example.com',
            providerData: [
                { providerId: 'google.com', email: 'user@example.com' }
            ]
        };
        expect(isAnonymousUser(googleUser)).toBe(false);
    });

    it('preserves any user with an email address even if providerData is empty', () => {
        const emailUser = {
            uid: 'custom-uid-789',
            email: 'admin@streamflix.stream',
            providerData: []
        };
        expect(isAnonymousUser(emailUser)).toBe(false);
    });

    it('returns false for null or undefined input', () => {
        expect(isAnonymousUser(null)).toBe(false);
        expect(isAnonymousUser(undefined)).toBe(false);
    });
});
