import { describe, it, expect } from 'vitest';
import {
    GLOBAL_CHAT_ROOT,
    chatPath,
    buildChatProfile,
    buildChatMessage,
    buildTicketMessage,
    MAX_NAME_LENGTH,
    MAX_TEXT_LENGTH,
    MAX_REC_NOTE_LENGTH,
    MAX_REC_TITLE_LENGTH,
    MAX_MOVIES_COUNT,
    MAX_REPLY_PREVIEW_LENGTH
} from './globalChatModel';

describe('globalChatModel', () => {
    const timestamp = 1718000000000;
    const testIdentity = {
        uid: 'user-google-1',
        displayName: 'Alice Wonderland',
        photoURL: 'https://lh3.googleusercontent.com/alice.jpg'
    };

    describe('Paths and Constants', () => {
        it('has root exactly globalChat/v2', () => {
            expect(GLOBAL_CHAT_ROOT).toBe('globalChat/v2');
        });

        it('constructs correct chat paths', () => {
            expect(chatPath()).toBe('globalChat/v2');
            expect(chatPath('')).toBe('globalChat/v2');
            expect(chatPath('messages')).toBe('globalChat/v2/messages');
            expect(chatPath('messages/msg-123')).toBe('globalChat/v2/messages/msg-123');
            expect(chatPath('profiles/user-1')).toBe('globalChat/v2/profiles/user-1');
            expect(chatPath('/leading/slash')).toBe('globalChat/v2/leading/slash');
        });
    });

    describe('buildChatProfile', () => {
        it('builds valid profile with photoURL', () => {
            const profile = buildChatProfile(testIdentity, timestamp);
            expect(profile).toEqual({
                uid: 'user-google-1',
                displayName: 'Alice Wonderland',
                photoURL: 'https://lh3.googleusercontent.com/alice.jpg',
                joinedAt: timestamp,
                updatedAt: timestamp
            });
        });

        it('omits photoURL when identity photo is null or invalid', () => {
            const identityWithoutPhoto = {
                uid: 'user-google-2',
                displayName: 'Bob Builder',
                photoURL: null
            };
            const profile = buildChatProfile(identityWithoutPhoto, timestamp);
            expect(profile).toEqual({
                uid: 'user-google-2',
                displayName: 'Bob Builder',
                joinedAt: timestamp,
                updatedAt: timestamp
            });
            expect('photoURL' in profile).toBe(false);
        });

        it('preserves existing joinedAt timestamp', () => {
            const existingJoined = 1700000000000;
            const profile = buildChatProfile(testIdentity, timestamp, existingJoined);
            expect(profile.joinedAt).toBe(existingJoined);
            expect(profile.updatedAt).toBe(timestamp);
        });

        it('throws on missing or invalid identity', () => {
            expect(() => buildChatProfile(null, timestamp)).toThrow(/identity/i);
            expect(() => buildChatProfile({}, timestamp)).toThrow(/identity/i);
            expect(() => buildChatProfile({ uid: '' }, timestamp)).toThrow(/identity/i);
        });
    });

    describe('buildChatMessage', () => {
        it('builds standard plain text message with optional photo', () => {
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                text: 'Hello world!',
                timestamp
            });

            expect(msg).toEqual({
                uid: 'user-google-1',
                senderName: 'Alice Wonderland',
                senderPhotoURL: 'https://lh3.googleusercontent.com/alice.jpg',
                senderIsAdmin: false,
                text: 'Hello world!',
                broadcast: false,
                createdAt: timestamp,
                deletedForAll: false
            });
        });

        it('handles non-admin attempting @everyone broadcast (broadcast must be false)', () => {
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                text: '@everyone Attention please!',
                timestamp
            });
            expect(msg.broadcast).toBe(false);
            expect(msg.senderIsAdmin).toBe(false);
        });

        it('sets broadcast to true only for admin sender with @everyone text', () => {
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: true,
                text: '@everyone Important announcement',
                timestamp
            });
            expect(msg.broadcast).toBe(true);
            expect(msg.senderIsAdmin).toBe(true);
        });

        it('omits senderPhotoURL when not present', () => {
            const msg = buildChatMessage({
                identity: { uid: 'u3', displayName: 'Charlie', photoURL: null },
                isAdmin: false,
                text: 'No photo here',
                timestamp
            });
            expect('senderPhotoURL' in msg).toBe(false);
        });

        it('handles reply snapshot with senderName and capped preview text', () => {
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                text: 'Replying to you',
                timestamp,
                replyTo: {
                    messageId: 'orig-123',
                    nickname: 'Old Nickname', // legacy nickname should map to senderName
                    text: 'This is a very long original message text that exceeds the fifty character limit easily'
                }
            });

            expect(msg.replyTo).toBeDefined();
            expect(msg.replyTo.messageId).toBe('orig-123');
            expect(msg.replyTo.senderName).toBe('Old Nickname');
            expect(msg.replyTo.text.length).toBeLessThanOrEqual(MAX_REPLY_PREVIEW_LENGTH);
            expect('nickname' in msg.replyTo).toBe(false);
        });

        it('handles recommendation and media fields with bounds and omission', () => {
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                timestamp,
                recTitle: ' Inception ',
                recText: ' Must watch! ',
                mediaUrl: 'https://example.com/movie.jpg',
                mediaType: 'image/jpeg',
                movies: [{ id: 1, title: 'Inception' }]
            });

            expect(msg.recTitle).toBe('Inception');
            expect(msg.recText).toBe('Must watch!');
            expect(msg.mediaUrl).toBe('https://example.com/movie.jpg');
            expect(msg.mediaType).toBe('image/jpeg');
            expect(msg.movies).toEqual([{ id: 1, title: 'Inception' }]);
            expect(msg.text).toBe('');
        });

        it('caps movies array to MAX_MOVIES_COUNT (10)', () => {
            const twelveMovies = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Movie ${i + 1}` }));
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                timestamp,
                movies: twelveMovies
            });
            expect(msg.movies.length).toBe(MAX_MOVIES_COUNT);
        });

        it('never emits legacy forbidden fields', () => {
            const msg = buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                text: 'Hello',
                timestamp,
                nickname: 'Hacker',
                avatarUrl: 'fake',
                adminBadge: 'gold',
                email: 'test@hacker.com',
                uid: 'impostor-uid'
            });

            expect(msg.uid).toBe('user-google-1');
            expect(msg.senderName).toBe('Alice Wonderland');
            expect('nickname' in msg).toBe(false);
            expect('avatarUrl' in msg).toBe(false);
            expect('adminBadge' in msg).toBe(false);
            expect('email' in msg).toBe(false);
        });

        it('throws when message has zero content', () => {
            expect(() => buildChatMessage({
                identity: testIdentity,
                isAdmin: false,
                text: '   ',
                timestamp
            })).toThrow(/content/i);
        });
    });

    describe('buildTicketMessage', () => {
        it('builds complete ticket message with reporter identity and open status', () => {
            const ticket = buildTicketMessage({
                identity: testIdentity,
                timestamp,
                ticketNo: 'TICK-1001',
                category: 'Broken Stream'
            });

            expect(ticket).toEqual({
                uid: 'user-google-1',
                senderName: 'Alice Wonderland',
                senderPhotoURL: 'https://lh3.googleusercontent.com/alice.jpg',
                senderIsAdmin: false,
                text: '',
                broadcast: false,
                createdAt: timestamp,
                deletedForAll: false,
                type: 'ticket',
                ticketAction: 'created',
                ticketStatus: 'open',
                ticketNo: 'TICK-1001',
                category: 'Broken Stream',
                reporterUid: 'user-google-1'
            });
        });

        it('omits senderPhotoURL if reporter has no photo', () => {
            const ticket = buildTicketMessage({
                identity: { uid: 'u4', displayName: 'Dave', photoURL: null },
                timestamp,
                ticketNo: 'TICK-1002',
                category: 'Feature Request'
            });
            expect('senderPhotoURL' in ticket).toBe(false);
            expect(ticket.reporterUid).toBe('u4');
            expect(ticket.type).toBe('ticket');
        });

        it('throws on missing ticket number or category', () => {
            expect(() => buildTicketMessage({
                identity: testIdentity,
                timestamp,
                ticketNo: '',
                category: 'Bug'
            })).toThrow(/ticketNo/i);

            expect(() => buildTicketMessage({
                identity: testIdentity,
                timestamp,
                ticketNo: 'TICK-1',
                category: ''
            })).toThrow(/category/i);
        });
    });
});
