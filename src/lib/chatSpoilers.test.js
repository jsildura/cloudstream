import { describe, it, expect } from 'vitest';
import {
    SPOILER_OPEN,
    SPOILER_CLOSE,
    MAX_SPOILERS_PER_MESSAGE,
    MAX_SPOILER_LENGTH,
    extractSpoilers,
    splitSpoilerParts,
    hasSpoilerTokens,
    stripSpoilerTokens,
    buildSpoilerPayload
} from './chatSpoilers';

describe('chatSpoilers', () => {
    describe('extractSpoilers', () => {
        it('handles single spoiler pair', () => {
            const raw = 'Hello [spoiler]secret123[/spoiler] world';
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe('Hello [[spoiler:1]] world');
            expect(items).toEqual({ '1': 'secret123' });
        });

        it('handles multiple spoiler pairs', () => {
            const raw = 'Part A [spoiler]first[/spoiler] Part B [spoiler]second[/spoiler]';
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe('Part A [[spoiler:1]] Part B [[spoiler:2]]');
            expect(items).toEqual({ '1': 'first', '2': 'second' });
        });

        it('handles spoiler spanning newlines', () => {
            const raw = "Drop:\n[spoiler]Key 1\nKey 2\nKey 3[/spoiler]\nEnjoy!";
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe("Drop:\n[[spoiler:1]]\nEnjoy!");
            expect(items).toEqual({ '1': "Key 1\nKey 2\nKey 3" });
        });

        it('handles emoji, numbers, and special characters inside spoiler', () => {
            const raw = 'Code: [spoiler]🎁 SFX-2026! @#% & 🚀[/spoiler]';
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe('Code: [[spoiler:1]]');
            expect(items).toEqual({ '1': '🎁 SFX-2026! @#% & 🚀' });
        });

        it('drops empty or whitespace-only spoiler pairs', () => {
            const raw1 = 'Empty [spoiler][/spoiler] test';
            const { text: text1, items: items1 } = extractSpoilers(raw1);
            expect(text1).toBe('Empty  test');
            expect(items1).toEqual({});

            const raw2 = 'Spaced [spoiler]   \n  [/spoiler] test';
            const { text: text2, items: items2 } = extractSpoilers(raw2);
            expect(text2).toBe('Spaced  test');
            expect(items2).toEqual({});
        });

        it('leaves unclosed [spoiler] as literal text', () => {
            const raw = 'Unclosed [spoiler]secret without close tag';
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe(raw);
            expect(items).toEqual({});
        });

        it('escapes pre-typed [[spoiler:1]] tokens', () => {
            const raw = 'Spoof attempt [[spoiler:1]] test [spoiler]real[/spoiler]';
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe('Spoof attempt [ [spoiler:1]] test [[spoiler:1]]');
            expect(items).toEqual({ '1': 'real' });
        });

        it('caps max spoilers per message at MAX_SPOILERS_PER_MESSAGE (5)', () => {
            const raw = '[spoiler]1[/spoiler] [spoiler]2[/spoiler] [spoiler]3[/spoiler] [spoiler]4[/spoiler] [spoiler]5[/spoiler] [spoiler]6[/spoiler]';
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe('[[spoiler:1]] [[spoiler:2]] [[spoiler:3]] [[spoiler:4]] [[spoiler:5]] [spoiler]6[/spoiler]');
            expect(items).toEqual({
                '1': '1',
                '2': '2',
                '3': '3',
                '4': '4',
                '5': '5'
            });
        });

        it('trims spoiler inner text and caps at MAX_SPOILER_LENGTH (500)', () => {
            const longSecret = 'x'.repeat(600);
            const raw = `[spoiler]   ${longSecret}   [/spoiler]`;
            const { text, items } = extractSpoilers(raw);
            expect(text).toBe('[[spoiler:1]]');
            expect(items['1'].length).toBe(MAX_SPOILER_LENGTH);
            expect(items['1']).toBe('x'.repeat(500));
        });

        it('handles null, empty, or non-string input safely', () => {
            expect(extractSpoilers('')).toEqual({ text: '', items: {} });
            expect(extractSpoilers(null)).toEqual({ text: '', items: {} });
            expect(extractSpoilers(undefined)).toEqual({ text: '', items: {} });
            expect(extractSpoilers(123)).toEqual({ text: '', items: {} });
        });
    });

    describe('splitSpoilerParts', () => {
        it('splits text with spoiler tokens into string parts and spoiler index objects', () => {
            const parts = splitSpoilerParts('Prefix [[spoiler:1]] middle [[spoiler:2]] suffix');
            expect(parts).toEqual([
                'Prefix ',
                { spoilerIndex: 1 },
                ' middle ',
                { spoilerIndex: 2 },
                ' suffix'
            ]);
        });

        it('handles text with only a spoiler token', () => {
            const parts = splitSpoilerParts('[[spoiler:1]]');
            expect(parts).toEqual([
                { spoilerIndex: 1 }
            ]);
        });

        it('handles text with no spoiler tokens', () => {
            const parts = splitSpoilerParts('Plain text message');
            expect(parts).toEqual(['Plain text message']);
        });

        it('handles empty or non-string input', () => {
            expect(splitSpoilerParts('')).toEqual([]);
            expect(splitSpoilerParts(null)).toEqual([]);
        });
    });

    describe('hasSpoilerTokens', () => {
        it('returns true when text contains spoiler tokens', () => {
            expect(hasSpoilerTokens('Check [[spoiler:1]]')).toBe(true);
            expect(hasSpoilerTokens('[[spoiler:12]]')).toBe(true);
        });

        it('returns false when text contains no spoiler tokens', () => {
            expect(hasSpoilerTokens('Normal text [spoiler]')).toBe(false);
            expect(hasSpoilerTokens('[ [spoiler:1]]')).toBe(false);
            expect(hasSpoilerTokens('')).toBe(false);
            expect(hasSpoilerTokens(null)).toBe(false);
        });
    });

    describe('stripSpoilerTokens', () => {
        it('replaces tokens with default replacement 🔒', () => {
            expect(stripSpoilerTokens('Key: [[spoiler:1]] here')).toBe('Key: 🔒 here');
        });

        it('replaces tokens with custom replacement', () => {
            expect(stripSpoilerTokens('Key: [[spoiler:1]] [[spoiler:2]]', '[hidden]')).toBe('Key: [hidden] [hidden]');
        });

        it('handles empty or non-string input', () => {
            expect(stripSpoilerTokens('')).toBe('');
            expect(stripSpoilerTokens(null)).toBe('');
        });
    });

    describe('buildSpoilerPayload', () => {
        it('builds valid payload structure', () => {
            const payload = buildSpoilerPayload({
                items: { '1': 'Secret Key' },
                authorUid: 'user-123',
                timestamp: 1700000000000
            });
            expect(payload).toEqual({
                authorUid: 'user-123',
                createdAt: 1700000000000,
                items: { '1': 'Secret Key' }
            });
        });

        it('throws when items is empty or invalid', () => {
            expect(() => buildSpoilerPayload({ items: {}, authorUid: 'u-1' })).toThrow();
            expect(() => buildSpoilerPayload({ items: null, authorUid: 'u-1' })).toThrow();
            expect(() => buildSpoilerPayload({ items: ['a'], authorUid: 'u-1' })).toThrow();
        });

        it('throws when authorUid is missing', () => {
            expect(() => buildSpoilerPayload({ items: { '1': 'key' }, authorUid: '' })).toThrow();
            expect(() => buildSpoilerPayload({ items: { '1': 'key' } })).toThrow();
        });
    });
});
