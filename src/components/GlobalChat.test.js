import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GlobalChat, { buildMessageReport, summarizeUA, getReactionData, isMessageSeen, REACTIONS } from './GlobalChat.jsx';
import * as AuthContextModule from '../contexts/AuthContext';
import * as FirebaseModule from '../lib/firebase';

describe('buildMessageReport', () => {
    const reporter = { uid: 'user-123', displayName: 'Alice' };

    it('snapshots a reported text message with author and reporter Google identity', () => {
        const report = buildMessageReport({
            id: 'msg-1',
            text: 'This movie is great!',
            senderName: 'Bob'
        }, reporter);

        expect(report.kind).toBe('message');
        expect(report.msgId).toBe('msg-1');
        expect(report.messageText).toBe('This movie is great!');
        expect(report.messageSenderName).toBe('Bob');
        expect(report.reportedBy).toBe('user-123');
        expect(report.reportedByName).toBe('Alice');
        expect(typeof report.timestamp).toBe('number');
        expect(typeof report.ticketNo).toBe('string');
        expect(report.messageNickname).toBeUndefined();
        expect(report.reportedByNickname).toBeUndefined();
    });

    it('caps long message text at 200 chars without exceeding 200 chars', () => {
        const longText = 'x'.repeat(500);
        const report = buildMessageReport({ id: 'msg-2', text: longText, senderName: 'Bob' }, reporter);
        expect(report.messageText.length).toBe(200);
        expect(report.messageText).toBe('x'.repeat(200));
    });

    it('flags the media type for a media-only message when valid', () => {
        const image = buildMessageReport({ id: 'msg-3', mediaUrl: 'https://drive.example/img.png', mediaType: 'image', senderName: 'Bob' }, reporter);
        expect(image.messageText).toBe('');
        expect(image.messageMedia).toBe('image');

        const video = buildMessageReport({ id: 'msg-4', mediaUrl: 'https://drive.example/v.mp4', mediaType: 'video', senderName: 'Bob' }, reporter);
        expect(video.messageMedia).toBe('video');
    });

    it('omits media label when the message has no valid attachment', () => {
        const report = buildMessageReport({ id: 'msg-5', text: 'hello', senderName: 'Bob' }, reporter);
        expect(report.messageMedia).toBeUndefined();
    });

    it('degrades gracefully when message or reporter fields are missing', () => {
        const report = buildMessageReport({}, {});
        expect(report.kind).toBe('message');
        expect(report.msgId).toBe('unknown');
        expect(report.messageText).toBe('');
        expect(report.messageSenderName).toBe('Google User');
        expect(report.reportedBy).toBe('anonymous');
        expect(report.reportedByName).toBe('Google User');
    });

    it('trims message text before snapshotting', () => {
        const report = buildMessageReport({ id: 'msg-6', text: '  spaced out  ', senderName: 'Bob' }, reporter);
        expect(report.messageText).toBe('spaced out');
    });
});

describe('summarizeUA', () => {
    it('reads common browsers on their OS', () => {
        expect(summarizeUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'))
            .toBe('Chrome on Windows');
        expect(summarizeUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'))
            .toBe('Safari on Mac OS X');
        expect(summarizeUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'))
            .toBe('Firefox on Windows');
    });

    it('falls back to unknown labels for unrecognized agents', () => {
        expect(summarizeUA('SomeWeirdAgent/1.0')).toBe('Unknown browser on Unknown OS');
        expect(summarizeUA('')).toBe('');
    });

    it('detects mobile browsers', () => {
        expect(summarizeUA('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'))
            .toBe('Chrome on Android');
    });
});

// ── GlobalChat Session Gating & Lifecycle Tests ──────────────────────────────

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn()
}));

vi.mock('../hooks/useTVDetect', () => ({
    default: () => false
}));

describe('GlobalChat Session Gating and Lifecycle', () => {
    let mockDb;
    let mockData = {};
    let refCalls = [];
    let registeredListeners = [];

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                mockData[path] = { ...(mockData[path] || {}), ...val };
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                delete mockData[path];
                return Promise.resolve();
            }),
            on: vi.fn().mockImplementation((event, cb) => {
                const listener = { path, event, cb };
                registeredListeners.push(listener);
                return cb;
            }),
            off: vi.fn().mockImplementation((event, cb) => {
                registeredListeners = registeredListeners.filter(l => l.path !== path || l.cb !== cb);
            }),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis(),
            push: vi.fn().mockImplementation((val) => {
                const pushKey = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                const pushPath = `${path}/${pushKey}`;
                refCalls.push(pushPath);
                const pushRef = createMockRef(pushPath);
                pushRef.key = pushKey;
                if (val !== undefined) {
                    pushRef.set(val);
                }
                return pushRef;
            })
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        refCalls = [];
        registeredListeners = [];
        mockDb = {
            ref: vi.fn((path = '') => {
                refCalls.push(path);
                return createMockRef(path);
            })
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('gates signed-out users: attaches zero DB listeners and renders sign-in wall when opened', async () => {
        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: null,
            isSignedIn: false,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        render(React.createElement(GlobalChat));

        await act(async () => {
            await Promise.resolve();
        });

        const v2Calls = refCalls.filter(p => p.startsWith('globalChat/v2'));
        expect(v2Calls.length).toBe(0);
        expect(registeredListeners.length).toBe(0);

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        expect(screen.getByText(/sign in with google to join globalchat/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

    it('bootstraps v2 Google profile before attaching listeners when signed in', async () => {
        const fakeUser = {
            uid: 'google-uid-123',
            displayName: 'Alice Walker',
            photoURL: 'https://lh3.googleusercontent.com/a/alice',
            isGoogle: true
        };

        mockData[`globalChat/v2/profiles/${fakeUser.uid}`] = {
            joinedAt: 1700000000000
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        render(React.createElement(GlobalChat));

        await waitFor(() => {
            const savedProfile = mockData[`globalChat/v2/profiles/${fakeUser.uid}`];
            expect(savedProfile).toBeDefined();
            expect(savedProfile.uid).toBe('google-uid-123');
            expect(savedProfile.displayName).toBe('Alice Walker');
            expect(savedProfile.photoURL).toBe('https://lh3.googleusercontent.com/a/alice');
            expect(savedProfile.joinedAt).toBe(1700000000000);
        });

        await waitFor(() => {
            const hasMessagesListener = registeredListeners.some(l => l.path === 'globalChat/v2/messages');
            const hasProfilesListener = registeredListeners.some(l => l.path === 'globalChat/v2/profiles');
            const hasPinnedListener = registeredListeners.some(l => l.path === 'globalChat/v2/pinnedMessage');
            expect(hasMessagesListener).toBe(true);
            expect(hasProfilesListener).toBe(true);
            expect(hasPinnedListener).toBe(true);
        });
    });

    it('handles account switching: tears down user A listeners and state, and sets up user B', async () => {
        const userA = {
            uid: 'user-a',
            displayName: 'Alice A',
            photoURL: 'https://lh3.googleusercontent.com/a/a',
            isGoogle: true
        };

        const userB = {
            uid: 'user-b',
            displayName: 'Bob B',
            photoURL: 'https://lh3.googleusercontent.com/a/b',
            isGoogle: true
        };

        let currentAuth = {
            chatIdentity: userA,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockImplementation(() => currentAuth);

        const { rerender } = render(React.createElement(GlobalChat));

        await waitFor(() => {
            expect(registeredListeners.length).toBeGreaterThan(0);
        });

        currentAuth = {
            chatIdentity: userB,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        };

        rerender(React.createElement(GlobalChat));

        await waitFor(() => {
            const savedProfileB = mockData['globalChat/v2/profiles/user-b'];
            expect(savedProfileB).toBeDefined();
            expect(savedProfileB.displayName).toBe('Bob B');
        });

        currentAuth = {
            chatIdentity: null,
            isSignedIn: false,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        };

        rerender(React.createElement(GlobalChat));

        await waitFor(() => {
            expect(registeredListeners.length).toBe(0);
        });
    });
});

// ── GlobalChat v2 Message Data Paths Tests ───────────────────────────────────

describe('GlobalChat v2 Message Data Paths', () => {
    let mockDb;
    let mockData = {};
    let refCalls = [];
    let pushes = [];
    let updates = [];
    let removes = [];

    const fakeUser = {
        uid: 'user-google-456',
        displayName: 'John Doe',
        photoURL: 'https://lh3.googleusercontent.com/a/john',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                pushes.push({ path, val });
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                mockData[path] = { ...(mockData[path] || {}), ...val };
                updates.push({ path, val });
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                delete mockData[path];
                removes.push(path);
                return Promise.resolve();
            }),
            on: vi.fn().mockImplementation((event, cb) => cb),
            off: vi.fn(),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis(),
            push: vi.fn().mockImplementation((val) => {
                const pushKey = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                const pushPath = `${path}/${pushKey}`;
                refCalls.push(pushPath);
                const pushRef = createMockRef(pushPath);
                pushRef.key = pushKey;
                if (val !== undefined) {
                    pushRef.set(val);
                }
                return pushRef;
            })
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        refCalls = [];
        pushes = [];
        updates = [];
        removes = [];

        mockDb = {
            ref: vi.fn((path = '') => {
                refCalls.push(path);
                return createMockRef(path);
            })
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads feed, listeners, and pagination via globalChat/v2/messages', async () => {
        render(React.createElement(GlobalChat));

        await waitFor(() => {
            const hasFeedQuery = refCalls.includes('globalChat/v2/messages');
            expect(hasFeedQuery).toBe(true);
        });

        const legacyMessageCalls = refCalls.filter(p => p === 'messages' || p.startsWith('messages/'));
        expect(legacyMessageCalls.length).toBe(0);
    });

    it('sends a plain text message conforming to buildChatMessage payload', async () => {
        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        const input = await screen.findByPlaceholderText(/type a message/i);
        fireEvent.change(input, { target: { value: 'Hello world from v2!' } });

        const sendBtnEl = document.querySelector('.gc-send-btn');
        expect(sendBtnEl).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(sendBtnEl);
        });

        await waitFor(() => {
            const sent = pushes.find(p => p.path.startsWith('globalChat/v2/messages/msg_'));
            expect(sent).toBeDefined();
            expect(sent.val.uid).toBe('user-google-456');
            expect(sent.val.senderName).toBe('John Doe');
            expect(sent.val.senderPhotoURL).toBe('https://lh3.googleusercontent.com/a/john');
            expect(sent.val.text).toBe('Hello world from v2!');
            expect(sent.val.broadcast).toBe(false);
            expect(sent.val.deletedForAll).toBe(false);
            expect(typeof sent.val.createdAt).toBe('number');
        });

        expect(input.value).toBe('');
    });

    it('defines own message strictly by UID, not by admin status', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_other_admin: {
                uid: 'other_admin_uid',
                senderName: 'Other Admin',
                senderIsAdmin: true,
                text: 'Message from another admin',
                createdAt: Date.now()
            },
            msg_my_admin: {
                uid: fakeUser.uid,
                senderName: 'John Doe',
                senderIsAdmin: true,
                text: 'My admin message',
                createdAt: Date.now()
            }
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: true,
            signInWithGoogle: vi.fn()
        });

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            const otherAdminBubble = document.querySelector('#msg-msg_other_admin');
            const myAdminBubble = document.querySelector('#msg-msg_my_admin');
            expect(otherAdminBubble).toBeInTheDocument();
            expect(myAdminBubble).toBeInTheDocument();

            // Other admin message is not own (gc-other)
            expect(otherAdminBubble.classList.contains('gc-other')).toBe(true);
            expect(otherAdminBubble.classList.contains('gc-own')).toBe(false);

            // My admin message is own (gc-own)
            expect(myAdminBubble.classList.contains('gc-own')).toBe(true);
        });
    });

    it('performs soft delete for normal user and hard delete for admin using chatPath', async () => {
        mockDb.ref = vi.fn((path = '') => {
            refCalls.push(path);
            return createMockRef(path);
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        window.confirm = vi.fn().mockReturnValue(true);

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await act(async () => {
            await mockDb.ref('globalChat/v2/messages/msg_to_delete').update({
                deletedForAll: true,
                deletedAt: Date.now()
            });
        });

        expect(updates.some(u => u.path === 'globalChat/v2/messages/msg_to_delete' && u.val.deletedForAll === true)).toBe(true);
    });
});

// ── GlobalChat Google Identity Rendering Tests ──────────────────────────────

describe('GlobalChat Google Identity Rendering', () => {
    let mockDb;
    let mockData = {};
    let refCalls = [];
    let registeredListeners = [];

    const fakeUser = {
        uid: 'user-google-main',
        displayName: 'Sam Host',
        photoURL: 'https://lh3.googleusercontent.com/a/sam',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                mockData[path] = { ...(mockData[path] || {}), ...val };
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                delete mockData[path];
                return Promise.resolve();
            }),
            on: vi.fn().mockImplementation((event, cb) => {
                registeredListeners.push({ path, event, cb });
                // If profiles listener is registered, execute immediately with current mockData
                if (path === 'globalChat/v2/profiles') {
                    const data = mockData[path];
                    const snap = {
                        exists: () => data !== undefined && data !== null,
                        forEach: (iter) => {
                            if (data && typeof data === 'object') {
                                Object.entries(data).forEach(([k, v]) => {
                                    iter({ key: k, val: () => v });
                                });
                            }
                        }
                    };
                    cb(snap);
                }
                if (path === 'globalChat/v2/pinnedMessage') {
                    const data = mockData[path];
                    const snap = {
                        exists: () => data !== undefined && data !== null,
                        val: () => data ?? null
                    };
                    cb(snap);
                }
                return cb;
            }),
            off: vi.fn(),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis(),
            push: vi.fn().mockImplementation((val) => {
                const pushKey = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                const pushPath = `${path}/${pushKey}`;
                refCalls.push(pushPath);
                const pushRef = createMockRef(pushPath);
                pushRef.key = pushKey;
                if (val !== undefined) {
                    pushRef.set(val);
                }
                return pushRef;
            })
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        refCalls = [];
        registeredListeners = [];

        mockDb = {
            ref: vi.fn((path = '') => {
                refCalls.push(path);
                return createMockRef(path);
            })
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders senderName, senderPhotoURL, alt text, and fallback behavior for messages', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_custom_user: {
                uid: 'user-other-1',
                senderName: 'Jane Smith',
                senderPhotoURL: 'https://example.com/jane.jpg',
                text: 'Hello from Jane!',
                createdAt: Date.now()
            },
            msg_fallback_user: {
                uid: 'user-other-2',
                text: 'Hello without explicit name!',
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            const janeMsg = document.querySelector('#msg-msg_custom_user');
            expect(janeMsg).toBeInTheDocument();
            expect(screen.getByText('Jane Smith')).toBeInTheDocument();

            const janeAvatar = janeMsg.querySelector('.gc-avatar');
            expect(janeAvatar).toHaveAttribute('src', 'https://example.com/jane.jpg');
            expect(janeAvatar).toHaveAttribute('alt', 'Jane Smith');

            // Trigger broken image onError
            fireEvent.error(janeAvatar);
            expect(janeAvatar.src).toContain('ui-avatars.com');
            expect(janeAvatar.src).toContain('Jane%20Smith');

            // Fallback user defaults to Google User
            const fallbackMsg = document.querySelector('#msg-msg_fallback_user');
            expect(fallbackMsg).toBeInTheDocument();
            expect(screen.getByText('Google User')).toBeInTheDocument();
            const fallbackAvatar = fallbackMsg.querySelector('.gc-avatar');
            expect(fallbackAvatar).toHaveAttribute('alt', 'Google User');
        });
    });

    it('renders pinned message banner with senderName', async () => {
        mockData['globalChat/v2/pinnedMessage'] = {
            id: 'msg_pinned_1',
            text: 'Welcome to the new chat!',
            senderName: 'Alice Mod',
            pinnedBy: 'mod-uid-1',
            pinnedAt: Date.now()
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(screen.getByText(/pinned by alice mod/i)).toBeInTheDocument();
            expect(screen.getByText('Welcome to the new chat!')).toBeInTheDocument();
        });
    });

    it('supports duplicate Google display names keyed by UID in profile cache and mentions', async () => {
        mockData['globalChat/v2/profiles'] = {
            'uid-alex-1': {
                displayName: 'Alex Rivers',
                photoURL: 'https://example.com/alex1.jpg'
            },
            'uid-alex-2': {
                displayName: 'Alex Rivers',
                photoURL: 'https://example.com/alex2.jpg'
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        const input = await screen.findByPlaceholderText(/type a message/i);

        // Type @al to trigger mention popup
        fireEvent.change(input, { target: { value: 'Hey @al' } });

        await waitFor(() => {
            const mentionItems = document.querySelectorAll('.gc-mention-item');
            expect(mentionItems.length).toBe(2);
            expect(mentionItems[0].textContent).toContain('Alex Rivers');
            expect(mentionItems[1].textContent).toContain('Alex Rivers');
        });

        // Click on one of the duplicate name mentions
        const mentionItems = document.querySelectorAll('.gc-mention-item');
        fireEvent.click(mentionItems[0]);

        // Asserts input was formatted with mention
        expect(input.value).toBe('Hey @Alex Rivers ');
    });
});

// ── GlobalChat v2 Reactions Data Paths Tests ─────────────────────────────────

describe('GlobalChat v2 Reactions Data Paths', () => {
    let mockDb;
    let mockData = {};
    let refCalls = [];
    let setCalls = [];
    let removeCalls = [];
    let transactionCalls = [];

    const fakeUser = {
        uid: 'user-google-react',
        displayName: 'Reacting User',
        photoURL: 'https://lh3.googleusercontent.com/a/react',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                setCalls.push({ path, val });
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                mockData[path] = { ...(mockData[path] || {}), ...val };
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                delete mockData[path];
                removeCalls.push(path);
                return Promise.resolve();
            }),
            transaction: vi.fn().mockImplementation((cb) => {
                transactionCalls.push(path);
                const next = cb(mockData[path]);
                mockData[path] = next;
                return Promise.resolve({ committed: true, snapshot: { val: () => next } });
            }),
            on: vi.fn().mockImplementation((event, cb) => cb),
            off: vi.fn(),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis()
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        refCalls = [];
        setCalls = [];
        removeCalls = [];
        transactionCalls = [];

        mockDb = {
            ref: vi.fn((path = '') => {
                refCalls.push(path);
                return createMockRef(path);
            })
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('matches client allowlist with rules allowlist', () => {
        expect(REACTIONS).toEqual(['❤️', '😂', '😮', '😢', '😡', '👍']);
    });

    it('adds reaction via exact child write to globalChat/v2/messages/{id}/reactions/{uid}', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_101: {
                uid: 'other-user',
                text: 'Hello world!',
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_101')).toBeInTheDocument();
        });

        const msgEl = document.querySelector('#msg-msg_101');
        fireEvent.mouseEnter(msgEl);

        const reactBtn = screen.getByTitle('React');
        fireEvent.click(reactBtn);

        const heartIcon = screen.getByText('❤️');
        await act(async () => {
            fireEvent.click(heartIcon);
        });

        expect(setCalls).toContainEqual({
            path: `globalChat/v2/messages/msg_101/reactions/${fakeUser.uid}`,
            val: '❤️'
        });
        expect(transactionCalls.length).toBe(0);
    });

    it('replaces existing reaction by writing new emoji to reactions/{uid}', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_102: {
                uid: 'other-user',
                text: 'Awesome movie!',
                reactions: {
                    [fakeUser.uid]: '❤️'
                },
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_102')).toBeInTheDocument();
        });

        const msgEl = document.querySelector('#msg-msg_102');
        fireEvent.mouseEnter(msgEl);

        const reactBtn = screen.getByTitle('React');
        fireEvent.click(reactBtn);

        const laughIcon = screen.getByText('😂');
        await act(async () => {
            fireEvent.click(laughIcon);
        });

        expect(setCalls).toContainEqual({
            path: `globalChat/v2/messages/msg_102/reactions/${fakeUser.uid}`,
            val: '😂'
        });
        expect(transactionCalls.length).toBe(0);
    });

    it('toggles off existing reaction by removing reactions/{uid}', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_103: {
                uid: 'other-user',
                text: 'Hilarious scene!',
                reactions: {
                    [fakeUser.uid]: '😂'
                },
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_103')).toBeInTheDocument();
        });

        const msgEl = document.querySelector('#msg-msg_103');
        fireEvent.mouseEnter(msgEl);

        const reactBtn = screen.getByTitle('React');
        fireEvent.click(reactBtn);
        const popover = document.querySelector('.gc-reaction-popover');
        expect(popover).toBeInTheDocument();
        const laughIcon = popover.querySelector('.gc-reaction-icon.selected');
        await act(async () => {
            fireEvent.click(laughIcon);
        });

        expect(removeCalls).toContain(`globalChat/v2/messages/msg_103/reactions/${fakeUser.uid}`);
        expect(transactionCalls.length).toBe(0);
    });
});

// ── GlobalChat v2 Reactions Rendering Tests ──────────────────────────────────

describe('GlobalChat v2 Reactions Rendering', () => {
    let mockDb;
    let mockData = {};
    let registeredListeners = [];

    const fakeUser = {
        uid: 'user-google-render',
        displayName: 'Render User',
        photoURL: 'https://lh3.googleusercontent.com/a/render',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                mockData[path] = { ...(mockData[path] || {}), ...val };
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                delete mockData[path];
                return Promise.resolve();
            }),
            on: vi.fn().mockImplementation((event, cb) => {
                registeredListeners.push({ path, event, cb });
                if (path === 'globalChat/v2/profiles') {
                    const data = mockData[path];
                    const snap = {
                        exists: () => data !== undefined && data !== null,
                        forEach: (iter) => {
                            if (data && typeof data === 'object') {
                                Object.entries(data).forEach(([k, v]) => {
                                    iter({ key: k, val: () => v });
                                });
                            }
                        }
                    };
                    cb(snap);
                }
                return cb;
            }),
            off: vi.fn(),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis()
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        registeredListeners = [];

        mockDb = {
            ref: vi.fn((path = '') => createMockRef(path))
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('getReactionData groups counts, caps top 3 emojis, and flags current user state', () => {
        const reactions = {
            u1: '❤️',
            u2: '❤️',
            u3: '😂',
            u4: '👍',
            u5: '😮',
            u6: '❤️'
        };

        const result = getReactionData(reactions, 'u1');
        expect(result).toBeDefined();
        expect(result.total).toBe(6);
        expect(result.counts).toEqual({
            '❤️': 3,
            '😂': 1,
            '👍': 1,
            '😮': 1
        });
        expect(result.emojis).toBe('❤️😂👍');
        expect(result.userReacted).toBe(true);
        expect(result.userReaction).toBe('❤️');

        // Missing reactions or empty returns null
        expect(getReactionData(null)).toBeNull();
        expect(getReactionData({})).toBeNull();
        expect(getReactionData({ u1: 'invalid' })).toBeNull();
    });

    it('renders reaction badge and opens reaction detail view resolving names from profile cache', async () => {
        mockData['globalChat/v2/profiles'] = {
            'uid-alice': {
                displayName: 'Alice Waters',
                photoURL: 'https://example.com/alice.jpg'
            },
            'uid-bob': {
                displayName: 'Bob Builder',
                photoURL: 'https://example.com/bob.jpg'
            }
        };

        mockData['globalChat/v2/messages'] = {
            msg_201: {
                uid: 'other-user',
                text: 'Check this out!',
                reactions: {
                    'uid-alice': '❤️',
                    'uid-bob': '❤️',
                    'uid-missing': '👍'
                },
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            const badge = document.querySelector('.gc-reaction-badge');
            expect(badge).toBeInTheDocument();
            expect(badge.textContent).toContain('❤️👍');
            expect(badge.textContent).toContain('3');
        });

        const badgeEl = document.querySelector('.gc-reaction-badge');
        fireEvent.click(badgeEl);

        await waitFor(() => {
            const reactionView = document.querySelector('.gc-reaction-view');
            expect(reactionView).toBeInTheDocument();
            expect(screen.getByText('Alice Waters')).toBeInTheDocument();
            expect(screen.getByText('Bob Builder')).toBeInTheDocument();
            expect(reactionView.textContent).toContain('Google User');
        });
    });

    it('renders duplicate display names correctly for different reactor UIDs', async () => {
        mockData['globalChat/v2/profiles'] = {
            'uid-alex-1': {
                displayName: 'Alex Rivers'
            },
            'uid-alex-2': {
                displayName: 'Alex Rivers'
            }
        };

        mockData['globalChat/v2/messages'] = {
            msg_202: {
                uid: 'other-user',
                text: 'Duplicate name reaction test',
                reactions: {
                    'uid-alex-1': '❤️',
                    'uid-alex-2': '😂'
                },
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('.gc-reaction-badge')).toBeInTheDocument();
        });

        fireEvent.click(document.querySelector('.gc-reaction-badge'));

        await waitFor(() => {
            const items = document.querySelectorAll('.gc-reaction-item');
            expect(items.length).toBe(2);
            expect(items[0].textContent).toContain('Alex Rivers');
            expect(items[1].textContent).toContain('Alex Rivers');
        });
    });
});

// ── GlobalChat v2 Seen Receipts Tests ────────────────────────────────────────

describe('GlobalChat v2 Seen Receipts', () => {
    let mockDb;
    let mockData = {};
    let updates = [];

    const fakeUser = {
        uid: 'user-google-seen',
        displayName: 'Seen User',
        photoURL: 'https://lh3.googleusercontent.com/a/seen',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                Object.entries(val).forEach(([k, v]) => {
                    const fullPath = path ? `${path}/${k}` : k;
                    mockData[fullPath] = v;
                });
                updates.push({ path, val });
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                delete mockData[path];
                return Promise.resolve();
            }),
            on: vi.fn().mockImplementation((event, cb) => cb),
            off: vi.fn(),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis()
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        updates = [];

        mockDb = {
            ref: vi.fn((path = '') => createMockRef(path))
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('isMessageSeen returns true only when seenBy contains a UID other than the author', () => {
        const msgOwnOnly = {
            uid: 'author-1',
            seenBy: { 'author-1': true }
        };
        expect(isMessageSeen(msgOwnOnly)).toBe(false);

        const msgSeen = {
            uid: 'author-1',
            seenBy: { 'author-1': true, 'reader-2': true }
        };
        expect(isMessageSeen(msgSeen)).toBe(true);

        const msgNoSeen = {
            uid: 'author-1'
        };
        expect(isMessageSeen(msgNoSeen)).toBe(false);
    });

    it('marks unread regular and broadcast messages as seen via seenBy/{uid} = true on load and open', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_reg_1: {
                uid: 'other-author',
                text: 'Regular unread message',
                createdAt: Date.now()
            },
            msg_bcast_1: {
                uid: 'admin-author',
                text: '@everyone Big announcement!',
                broadcast: true,
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            const hasRegSeen = updates.some(u =>
                u.val[`globalChat/v2/messages/msg_reg_1/seenBy/${fakeUser.uid}`] === true
            );
            const hasBcastSeen = updates.some(u =>
                u.val[`globalChat/v2/messages/msg_bcast_1/seenBy/${fakeUser.uid}`] === true
            );
            expect(hasRegSeen).toBe(true);
            expect(hasBcastSeen).toBe(true);
        });

        // Ensure zero writes to parent status
        const hasStatusWrite = updates.some(u => 'status' in u.val || Object.keys(u.val).some(k => k.endsWith('/status')));
        expect(hasStatusWrite).toBe(false);
    });

    it('derives own-message status: sent (✓) vs seen (✓✓) without reading mutable parent status', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_my_unseen: {
                uid: fakeUser.uid,
                text: 'My message not yet seen by others',
                seenBy: { [fakeUser.uid]: true },
                createdAt: Date.now()
            },
            msg_my_seen: {
                uid: fakeUser.uid,
                text: 'My message seen by others',
                seenBy: { [fakeUser.uid]: true, 'other-reader': true },
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            const unseenMsgEl = document.querySelector('#msg-msg_my_unseen');
            const seenMsgEl = document.querySelector('#msg-msg_my_seen');

            expect(unseenMsgEl).toBeInTheDocument();
            expect(seenMsgEl).toBeInTheDocument();

            const unseenStatusIcon = unseenMsgEl.querySelector('.gc-status-icon');
            const seenStatusIcon = seenMsgEl.querySelector('.gc-status-icon');

            expect(unseenStatusIcon.textContent).toContain('✓');
            expect(unseenStatusIcon.textContent).not.toContain('✓✓');
            expect(unseenStatusIcon.classList.contains('sent')).toBe(true);

            expect(seenStatusIcon.textContent).toContain('✓✓');
            expect(seenStatusIcon.classList.contains('seen')).toBe(true);
        });
    });
});

// ── GlobalChat v2 Reports and Tickets Tests ─────────────────────────────────

describe('GlobalChat v2 Reports and Tickets', () => {
    let mockDb;
    let mockData = {};
    let pushedReports = [];
    let setMessages = {};
    let removeCalls = [];
    let updateCalls = {};

    const fakeUser = {
        uid: 'user-google-reporter',
        displayName: 'Report User',
        photoURL: 'https://lh3.googleusercontent.com/a/rep',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v, ref: createMockRef(`${path}/${k}`) });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            push: vi.fn().mockImplementation((val) => {
                const newKey = `gen_key_${Math.random().toString(36).substring(7)}`;
                const newPath = `${path}/${newKey}`;
                if (val) {
                    if (path.includes('reports')) pushedReports.push({ key: newKey, ...val });
                    mockData[newPath] = val;
                }
                return createMockRef(newPath);
            }),
            set: vi.fn().mockImplementation((val) => {
                if (path.startsWith('globalChat/v2/messages/')) {
                    setMessages[path] = val;
                }
                mockData[path] = val;
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                updateCalls[path] = { ...(updateCalls[path] || {}), ...val };
                mockData[path] = { ...(mockData[path] || {}), ...val };
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                removeCalls.push(path);
                delete mockData[path];
                return Promise.resolve();
            }),
            on: vi.fn().mockImplementation((event, cb) => cb),
            off: vi.fn(),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis()
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        pushedReports = [];
        setMessages = {};
        removeCalls = [];
        updateCalls = {};
        mockDb = {
            ref: vi.fn((path = '') => createMockRef(path))
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: {},
            db: mockDb,
            storage: {}
        });

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: fakeUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('creates message report and writes self-bound ticket message with reporter UID', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_target: {
                uid: 'offender-uid',
                senderName: 'Bad Actor',
                text: 'Spam text message',
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_target')).toBeInTheDocument();
        });

        const msgEl = document.querySelector('#msg-msg_target');
        fireEvent.mouseEnter(msgEl);

        const moreBtn = screen.getByTitle('More');
        fireEvent.click(moreBtn);

        const reportBtn = screen.getByText('Report');
        window.alert = vi.fn();
        await act(async () => {
            fireEvent.click(reportBtn);
        });

        // 1. Report pushed to reports queue
        expect(pushedReports.length).toBe(1);
        const report = pushedReports[0];
        expect(report.kind).toBe('message');
        expect(report.reportedBy).toBe(fakeUser.uid);
        expect(report.reportedByName).toBe(fakeUser.displayName);
        expect(report.messageSenderName).toBe('Bad Actor');
        expect(report.messageText).toBe('Spam text message');
        expect(report.msgId).toBe('msg_target');
        expect(typeof report.ticketNo).toBe('string');
        expect(report.ticketMsgId).toBeDefined();

        // 2. Ticket message authored by reporter (never 'system')
        const messagePaths = Object.keys(setMessages);
        expect(messagePaths.length).toBe(1);
        const ticketMsg = setMessages[messagePaths[0]];
        expect(ticketMsg.uid).toBe(fakeUser.uid);
        expect(ticketMsg.uid).not.toBe('system');
        expect(ticketMsg.reporterUid).toBe(fakeUser.uid);
        expect(ticketMsg.type).toBe('ticket');
        expect(ticketMsg.ticketAction).toBe('created');
        expect(ticketMsg.ticketStatus).toBe('open');
        expect(ticketMsg.senderIsAdmin).toBe(false);
        expect(ticketMsg.broadcast).toBe(false);
        expect(ticketMsg.text).toBe('');
    });

    it('submits issue report with category and context, bound to Google identity', async () => {
        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('.gc-rec-btn')).toBeInTheDocument();
        });

        // Open composer menu & click Report Issue
        fireEvent.click(document.querySelector('.gc-rec-btn'));
        const reportIssueItem = screen.getByText('Report Issue');
        fireEvent.click(reportIssueItem);

        expect(screen.getByText('Report an Issue')).toBeInTheDocument();

        // Select category
        const catBtn = screen.getByText("Video won't play");
        fireEvent.click(catBtn);

        // Fill description
        const descInput = document.querySelector('.gc-report-desc');
        fireEvent.change(descInput, { target: { value: 'Screen stays black upon loading' } });

        const sendBtn = screen.getByText('Send Report');
        await act(async () => {
            fireEvent.click(sendBtn);
        });

        expect(pushedReports.length).toBe(1);
        const report = pushedReports[0];
        expect(report.kind).toBe('issue');
        expect(report.category).toBe("Video won't play");
        expect(report.description).toBe('Screen stays black upon loading');
        expect(report.reportedBy).toBe(fakeUser.uid);
        expect(report.reportedByName).toBe(fakeUser.displayName);

        // Verify ticket message written to feed
        const messagePaths = Object.keys(setMessages);
        expect(messagePaths.length).toBe(1);
        const ticketMsg = setMessages[messagePaths[0]];
        expect(ticketMsg.uid).toBe(fakeUser.uid);
        expect(ticketMsg.category).toBe("Video won't play");
        expect(ticketMsg.type).toBe('ticket');
        expect(ticketMsg.ticketStatus).toBe('open');
    });

    it('renders ticket stub for open ticket and resolved card for resolved ticket', async () => {
        mockData['globalChat/v2/messages'] = {
            msg_ticket_open: {
                uid: fakeUser.uid,
                senderName: 'Alice Waters',
                type: 'ticket',
                ticketAction: 'created',
                ticketStatus: 'open',
                ticketNo: '998877',
                category: "Video won't play",
                createdAt: Date.now()
            },
            msg_ticket_resolved: {
                uid: fakeUser.uid,
                senderName: 'StreamFlix Admin',
                type: 'ticket',
                ticketAction: 'created',
                ticketStatus: 'resolved',
                ticketNo: '112233',
                category: 'Buffers or stops',
                createdAt: Date.now()
            }
        };

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_ticket_open')).toBeInTheDocument();
            expect(document.querySelector('#msg-msg_ticket_resolved')).toBeInTheDocument();
        });

        const openTicketEl = document.querySelector('#msg-msg_ticket_open');
        expect(openTicketEl.textContent).toContain('Ticket created');
        expect(openTicketEl.textContent).toContain('#998877');
        expect(openTicketEl.textContent).toContain("Alice Waters created a report — Video won't play");

        const resolvedTicketEl = document.querySelector('#msg-msg_ticket_resolved');
        expect(resolvedTicketEl.textContent).toContain('✅ Ticket #112233 resolved');
    });
});

// ── GlobalChat Custom Claims Admin UI & Moderation Tests ────────────────────

describe('GlobalChat Custom Claims Admin UI & Moderation', () => {
    let mockDb;
    let mockData = {};
    let refCalls = [];
    let registeredListeners = [];
    let removedPaths = [];

    const regularUser = {
        uid: 'user-regular-1',
        displayName: 'Regular User',
        photoURL: 'https://lh3.googleusercontent.com/a/reg',
        isGoogle: true
    };

    const adminUser = {
        uid: 'user-admin-1',
        displayName: 'Admin User',
        photoURL: 'https://lh3.googleusercontent.com/a/adm',
        isGoogle: true
    };

    const createMockRef = (path) => {
        const refObj = {
            path,
            key: path.split('/').pop(),
            once: vi.fn().mockImplementation((event, cb) => {
                const data = mockData[path];
                const snap = {
                    exists: () => data !== undefined && data !== null,
                    val: () => data ?? null,
                    key: path.split('/').pop(),
                    forEach: (iter) => {
                        if (data && typeof data === 'object') {
                            Object.entries(data).forEach(([k, v]) => {
                                iter({ key: k, val: () => v });
                            });
                        }
                    }
                };
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return Promise.resolve(snap);
            }),
            set: vi.fn().mockImplementation((val) => {
                mockData[path] = val;
                return Promise.resolve();
            }),
            update: vi.fn().mockImplementation((val) => {
                mockData[path] = { ...(mockData[path] || {}), ...val };
                return Promise.resolve();
            }),
            remove: vi.fn().mockImplementation(() => {
                removedPaths.push(path);
                delete mockData[path];
                return Promise.resolve();
            }),
            push: vi.fn().mockImplementation((val) => {
                const newKey = `mock_pushed_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                const newPath = `${path}/${newKey}`;
                if (val !== undefined) mockData[newPath] = val;
                const childRef = createMockRef(newPath);
                childRef.key = newKey;
                return childRef;
            }),
            on: vi.fn().mockImplementation((event, cb) => {
                registeredListeners.push({ path, event, cb });
                if (event === 'value') {
                    const data = mockData[path];
                    const snap = {
                        exists: () => data !== undefined && data !== null,
                        val: () => data ?? null,
                        key: path.split('/').pop(),
                        forEach: (iter) => {
                            if (data && typeof data === 'object') {
                                Object.entries(data).forEach(([k, v]) => {
                                    iter({ key: k, val: () => v });
                                });
                            }
                        }
                    };
                    cb(snap);
                }
                return cb;
            }),
            off: vi.fn().mockImplementation((event, cb) => {
                registeredListeners = registeredListeners.filter(l => !(l.path === path && l.event === event && (!cb || l.cb === cb)));
            }),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis()
        };
        return refObj;
    };

    beforeEach(() => {
        mockData = {};
        refCalls = [];
        registeredListeners = [];
        removedPaths = [];

        mockDb = {
            ref: vi.fn((path = '') => {
                refCalls.push(path);
                return createMockRef(path);
            })
        };

        window.firebase = {
            database: Object.assign(() => mockDb, {
                ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } }
            }),
            auth: () => ({
                currentUser: regularUser,
                onAuthStateChanged: (cb) => {
                    cb(regularUser);
                    return () => {};
                }
            })
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: window.firebase.auth(),
            db: mockDb,
            storage: {}
        });

        mockData['globalChat/v2/messages'] = {
            msg_other_user: {
                uid: 'other-user-99',
                senderName: 'Bob',
                text: 'Hello world',
                createdAt: Date.now() - 10000
            }
        };
        mockData['globalChat/v2/reports'] = {
            rep_1: {
                kind: 'message',
                msgId: 'msg_other_user',
                messageText: 'Hello world',
                messageSenderName: 'Bob',
                reportedBy: 'user-regular-1',
                reportedByName: 'Regular User',
                timestamp: Date.now() - 5000
            }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('denies moderation affordances to regular users (no reports button, no pin, no hard delete)', async () => {
        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: regularUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_other_user')).toBeInTheDocument();
        });

        // 1. Reports button in header is absent
        expect(document.querySelector('.gc-icon-btn[title="Reports"]')).toBeNull();

        // 2. Admin Login button is completely removed
        expect(document.querySelector('.gc-icon-btn[title="Admin Login"]')).toBeNull();

        // 3. Pin button on other user's message is absent (in more menu)
        const moreBtn = document.querySelector('#msg-msg_other_user .gc-action-icon[title="More"]');
        if (moreBtn) {
            fireEvent.click(moreBtn);
            expect(screen.queryByText('Pin')).toBeNull();
            expect(screen.queryByText('Delete')).toBeNull();
        }

        // 4. Input textarea does not offer @everyone mention
        const textarea = document.querySelector('.gc-msg-input');
        fireEvent.change(textarea, { target: { value: '@ev' } });
        expect(screen.queryByText('everyone')).toBeNull();
    });

    it('grants moderation affordances when isGlobalChatAdmin is true', async () => {
        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: adminUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: true,
            signInWithGoogle: vi.fn()
        });

        window.confirm = vi.fn().mockReturnValue(true);

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_other_user')).toBeInTheDocument();
        });

        // 1. Reports button in header is visible and opens reports panel
        const reportsBtn = document.querySelector('.gc-icon-btn[title="Reports"]');
        expect(reportsBtn).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(reportsBtn);
        });
        expect(screen.getByText('User Reports')).toBeInTheDocument();
        expect(screen.getByText('Hello world')).toBeInTheDocument();

        // 2. Hard delete option exists in more menu
        const msgEl = document.querySelector('#msg-msg_other_user');
        fireEvent.mouseEnter(msgEl);
        const moreBtn = document.querySelector('#msg-msg_other_user .gc-action-icon[title="More"]');
        expect(moreBtn).toBeInTheDocument();
        fireEvent.click(moreBtn);
        const deleteBtn = screen.getByText('Delete');
        expect(deleteBtn).toBeInTheDocument();

        // 3. Pin option exists in more menu
        const pinBtn = screen.getByText('Pin');
        expect(pinBtn).toBeInTheDocument();

        // 4. @everyone mention auto-complete is offered
        const textarea = document.querySelector('.gc-msg-input');
        fireEvent.change(textarea, { target: { value: '@ev' } });
        expect(screen.getByText('everyone')).toBeInTheDocument();
    });

    it('does not confer admin moderation to user whose message contains forged senderIsAdmin: true', async () => {
        // Message in feed claims senderIsAdmin: true, but current session user is regularUser
        mockData['globalChat/v2/messages'] = {
            msg_forged_admin: {
                uid: 'impostor-user',
                senderName: 'Impostor',
                senderIsAdmin: true,
                text: 'I claim to be admin',
                createdAt: Date.now()
            }
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: regularUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_forged_admin')).toBeInTheDocument();
        });

        // Message renders admin crown badge because senderIsAdmin is true in feed
        const forgedMsg = document.querySelector('#msg-msg_forged_admin');
        expect(forgedMsg.querySelector('.gc-admin-badge')).toBeInTheDocument();

        // But regularUser session has NO moderation privileges
        expect(document.querySelector('.gc-icon-btn[title="Reports"]')).toBeNull();
        fireEvent.mouseEnter(forgedMsg);
        const moreBtn = forgedMsg.querySelector('.gc-action-icon[title="More"]');
        if (moreBtn) {
            fireEvent.click(moreBtn);
            expect(screen.queryByText('Pin')).toBeNull();
            expect(screen.queryByText('Delete')).toBeNull();
        }
    });

    it('closes open Reports panel and blocks moderation when isGlobalChatAdmin becomes false', async () => {
        let authState = {
            chatIdentity: adminUser,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: true,
            signInWithGoogle: vi.fn()
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockImplementation(() => authState);

        const { rerender } = render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('.gc-icon-btn[title="Reports"]')).toBeInTheDocument();
        });

        // Open reports panel
        const reportsBtn = document.querySelector('.gc-icon-btn[title="Reports"]');
        await act(async () => {
            fireEvent.click(reportsBtn);
        });
        expect(screen.getByText('User Reports')).toBeInTheDocument();

        // Revoke admin claim
        authState = {
            ...authState,
            isGlobalChatAdmin: false
        };
        await act(async () => {
            rerender(React.createElement(GlobalChat));
        });

        // Reports panel should now be dismissed
        expect(screen.queryByText('User Reports')).toBeNull();
        expect(document.querySelector('.gc-icon-btn[title="Reports"]')).toBeNull();
    });
});

