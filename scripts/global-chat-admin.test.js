import { describe, it, expect } from 'vitest';
import { parseArgs, nextClaims, maskEmail } from './global-chat-admin.mjs';

describe('global-chat-admin CLI helpers', () => {
    describe('parseArgs', () => {
        it('parses valid grant arguments with matching confirmation', () => {
            const result = parseArgs(['grant', '--uid', 'google-1', '--confirm', 'google-1']);
            expect(result).toEqual({ action: 'grant', uid: 'google-1', confirm: 'google-1' });
        });

        it('parses valid revoke arguments with matching confirmation', () => {
            const result = parseArgs(['revoke', '--uid', 'google-1', '--confirm', 'google-1']);
            expect(result).toEqual({ action: 'revoke', uid: 'google-1', confirm: 'google-1' });
        });

        it('parses valid inspect arguments without confirmation', () => {
            const result = parseArgs(['inspect', '--uid', 'google-1']);
            expect(result).toEqual({ action: 'inspect', uid: 'google-1', confirm: null });
        });

        it('throws on missing action or unknown action', () => {
            expect(() => parseArgs([])).toThrow(/action/i);
            expect(() => parseArgs(['delete', '--uid', 'google-1'])).toThrow(/Unknown action/i);
        });

        it('throws on missing --uid', () => {
            expect(() => parseArgs(['grant'])).toThrow('Missing --uid');
            expect(() => parseArgs(['inspect'])).toThrow('Missing --uid');
            expect(() => parseArgs(['revoke'])).toThrow('Missing --uid');
        });

        it('throws on missing or mismatched --confirm for mutating actions', () => {
            expect(() => parseArgs(['grant', '--uid', 'google-1'])).toThrow('Missing --confirm');
            expect(() => parseArgs(['grant', '--uid', 'google-1', '--confirm', 'other'])).toThrow('Confirmation must match UID');
            expect(() => parseArgs(['revoke', '--uid', 'google-1'])).toThrow('Missing --confirm');
            expect(() => parseArgs(['revoke', '--uid', 'google-1', '--confirm', 'other'])).toThrow('Confirmation must match UID');
        });

        it('throws on unknown flags or duplicate flags', () => {
            expect(() => parseArgs(['grant', '--uid', 'google-1', '--confirm', 'google-1', '--force'])).toThrow(/Unknown flag/i);
            expect(() => parseArgs(['grant', '--uid', 'google-1', '--uid', 'google-2', '--confirm', 'google-1'])).toThrow(/Duplicate/i);
        });
    });

    describe('nextClaims', () => {
        it('adds globalChatAdmin: true and preserves unrelated claims on grant', () => {
            expect(nextClaims({ paid: true }, 'grant')).toEqual({ paid: true, globalChatAdmin: true });
            expect(nextClaims({}, 'grant')).toEqual({ globalChatAdmin: true });
            expect(nextClaims(null, 'grant')).toEqual({ globalChatAdmin: true });
        });

        it('removes globalChatAdmin and preserves unrelated claims on revoke', () => {
            expect(nextClaims({ paid: true, globalChatAdmin: true }, 'revoke')).toEqual({ paid: true });
            expect(nextClaims({ globalChatAdmin: true }, 'revoke')).toEqual({});
            expect(nextClaims({ paid: true }, 'revoke')).toEqual({ paid: true });
            expect(nextClaims(null, 'revoke')).toEqual({});
        });
    });

    describe('maskEmail', () => {
        it('masks standard email addresses safely', () => {
            const masked = maskEmail('alice@example.com');
            expect(masked).toContain('@example.com');
            expect(masked).not.toBe('alice@example.com');
            expect(masked.startsWith('a')).toBe(true);
        });

        it('handles null, undefined, or invalid emails', () => {
            expect(maskEmail(null)).toBe('[no email]');
            expect(maskEmail('')).toBe('[no email]');
            expect(maskEmail('invalid-email')).toBe('[no email]');
        });
    });
});
