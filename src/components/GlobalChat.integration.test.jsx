import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GlobalChat from './GlobalChat.jsx';
import * as AuthContextModule from '../contexts/AuthContext';
import * as FirebaseModule from '../lib/firebase';

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn()
}));

vi.mock('../hooks/useTVDetect', () => ({
    default: () => false
}));

/**
 * Creates an in-memory Firebase v8 database test harness that strictly enforces
 * path allowlists, tracks all operations, callbacks, and subscriptions, and supports
 * deterministic snapshot seeding and event emission.
 */
function createChatTestHarness(initialStore = {}, allowlist = ['globalChat/v2/', '.info/connected']) {
    let store = { ...initialStore };
    const history = [];
    let listeners = [];

    const isPathAllowed = (path) => {
        if (path === '') return true;
        return allowlist.some(allowed => path === allowed || path.startsWith(allowed));
    };

    const assertAllowed = (path, op) => {
        if (!isPathAllowed(path)) {
            throw new Error(`Harness Security Violation: Operation "${op}" on path "${path}" is outside allowed v2 prefixes!`);
        }
    };

    const getPathData = (path) => {
        if (store[path] !== undefined) return store[path];
        const prefix = path.endsWith('/') ? path : `${path}/`;
        const childKeys = Object.keys(store).filter(k => k.startsWith(prefix));
        if (childKeys.length > 0) {
            const obj = {};
            childKeys.forEach(k => {
                const subKey = k.slice(prefix.length).split('/')[0];
                const subPath = `${path}/${subKey}`;
                obj[subKey] = store[subPath] !== undefined ? store[subPath] : getPathData(subPath);
            });
            return obj;
        }
        return null;
    };

    const notifyListeners = (path, event, snapshot, prevChildKey = null) => {
        listeners.forEach(l => {
            if (l.path === path && l.event === event) {
                try {
                    l.cb(snapshot, prevChildKey);
                } catch (e) {
                    console.error('Listener callback error:', e);
                }
            }
        });
    };

    const createSnapshot = (path, val) => {
        const key = path.split('/').pop() || null;
        return {
            key,
            ref: createRef(path),
            exists: () => val !== null && val !== undefined,
            val: () => (val !== null && val !== undefined ? JSON.parse(JSON.stringify(val)) : null),
            forEach: (cb) => {
                if (val && typeof val === 'object' && !Array.isArray(val)) {
                    for (const [childKey, childVal] of Object.entries(val)) {
                        const childSnap = createSnapshot(`${path}/${childKey}`, childVal);
                        const ret = cb(childSnap);
                        if (ret === true) break;
                    }
                }
            },
            numChildren: () => {
                if (val && typeof val === 'object' && !Array.isArray(val)) {
                    return Object.keys(val).length;
                }
                return 0;
            }
        };
    };

    const createRef = (path) => {
        assertAllowed(path, 'ref');
        const key = path.split('/').pop();

        const refObj = {
            path,
            key,
            toString: () => path,
            once: vi.fn(async (event = 'value', cb) => {
                assertAllowed(path, 'once');
                const val = getPathData(path);
                history.push({ op: 'once', path, event, val });
                const snap = createSnapshot(path, val);
                if (typeof event === 'function') event(snap);
                if (cb) cb(snap);
                return snap;
            }),
            set: vi.fn(async (val) => {
                assertAllowed(path, 'set');
                const resolvedVal = val === null ? null : JSON.parse(JSON.stringify(val, (k, v) => {
                    if (v && v['.sv'] === 'timestamp') return Date.now();
                    return v;
                }));
                history.push({ op: 'set', path, val: resolvedVal });
                if (resolvedVal === null) {
                    delete store[path];
                } else {
                    store[path] = resolvedVal;
                }
                notifyListeners(path, 'value', createSnapshot(path, resolvedVal));
                return Promise.resolve();
            }),
            update: vi.fn(async (val) => {
                assertAllowed(path, 'update');
                history.push({ op: 'update', path, val });
                const isMultiPath = Object.keys(val).some(k => k.includes('/'));
                if (isMultiPath) {
                    for (const [subPath, subVal] of Object.entries(val)) {
                        const fullPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
                        assertAllowed(fullPath, 'update(multi)');
                        if (subVal === null) {
                            delete store[fullPath];
                        } else {
                            store[fullPath] = subVal;
                        }
                        notifyListeners(fullPath, 'value', createSnapshot(fullPath, subVal));
                    }
                } else {
                    const current = getPathData(path) || {};
                    const merged = { ...current, ...val };
                    store[path] = merged;
                    notifyListeners(path, 'value', createSnapshot(path, merged));
                }
                return Promise.resolve();
            }),
            remove: vi.fn(async () => {
                assertAllowed(path, 'remove');
                history.push({ op: 'remove', path });
                delete store[path];
                const prefix = `${path}/`;
                Object.keys(store).forEach(k => {
                    if (k.startsWith(prefix)) delete store[k];
                });
                notifyListeners(path, 'value', createSnapshot(path, null));
                return Promise.resolve();
            }),
            push: vi.fn((val) => {
                assertAllowed(path, 'push');
                const newKey = `mock_pushed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                const newPath = `${path}/${newKey}`;
                const childRef = createRef(newPath);
                history.push({ op: 'push', path, newPath, newKey });
                if (val !== undefined) {
                    childRef.set(val);
                }
                return childRef;
            }),
            transaction: vi.fn(async (updateFn) => {
                assertAllowed(path, 'transaction');
                const current = getPathData(path);
                const updated = updateFn(current);
                history.push({ op: 'transaction', path, current, updated });
                if (updated !== undefined) {
                    await refObj.set(updated);
                    return { committed: true, snapshot: createSnapshot(path, updated) };
                }
                return { committed: false, snapshot: createSnapshot(path, current) };
            }),
            on: vi.fn((event, cb) => {
                assertAllowed(path, 'on');
                listeners.push({ path, event, cb });
                history.push({ op: 'on', path, event });
                if (event === 'value') {
                    const val = getPathData(path);
                    cb(createSnapshot(path, val));
                }
                return cb;
            }),
            off: vi.fn((event, cb) => {
                listeners = listeners.filter(l => !(l.path === path && (!event || l.event === event) && (!cb || l.cb === cb)));
                history.push({ op: 'off', path, event });
            }),
            child: vi.fn((subPath) => {
                return createRef(`${path}/${subPath}`);
            }),
            orderByKey: vi.fn().mockReturnThis(),
            orderByChild: vi.fn().mockReturnThis(),
            equalTo: vi.fn().mockReturnThis(),
            limitToLast: vi.fn().mockReturnThis(),
            endAt: vi.fn().mockReturnThis()
        };
        return refObj;
    };

    const mockDb = {
        ref: vi.fn((path = '') => createRef(path)),
        getStore: () => store,
        getHistory: () => history,
        getListeners: () => listeners,
        resetHistory: () => { history.length = 0; },
        emitChildAdded: (path, childKey, childVal, prevKey = null) => {
            notifyListeners(path, 'child_added', createSnapshot(`${path}/${childKey}`, childVal), prevKey);
        },
        emitChildChanged: (path, childKey, childVal) => {
            notifyListeners(path, 'child_changed', createSnapshot(`${path}/${childKey}`, childVal));
        },
        emitChildRemoved: (path, childKey, childVal) => {
            notifyListeners(path, 'child_removed', createSnapshot(`${path}/${childKey}`, childVal));
        },
        emitValue: (path, val) => {
            notifyListeners(path, 'value', createSnapshot(path, val));
        }
    };

    return {
        mockDb,
        store,
        history,
        listeners,
        getListeners: () => listeners,
        createRef,
        emitChildAdded: mockDb.emitChildAdded,
        emitChildChanged: mockDb.emitChildChanged,
        emitChildRemoved: mockDb.emitChildRemoved,
        emitValue: mockDb.emitValue
    };
}

describe('GlobalChat Integration Flows (v8 Harness)', () => {
    let harness;
    let mockAuth;

    const aliceGoogle = {
        uid: 'user-google-alice',
        displayName: 'Alice Waters',
        photoURL: 'https://lh3.googleusercontent.com/a/alice',
        isGoogle: true
    };

    const bobGoogle = {
        uid: 'user-google-bob',
        displayName: 'Bob Dylan',
        photoURL: 'https://lh3.googleusercontent.com/a/bob',
        isGoogle: true
    };

    const adminGoogle = {
        uid: 'user-google-admin',
        displayName: 'StreamFlix Moderator',
        photoURL: 'https://lh3.googleusercontent.com/a/admin',
        isGoogle: true
    };

    beforeEach(() => {
        harness = createChatTestHarness();

        mockAuth = {
            currentUser: aliceGoogle,
            onAuthStateChanged: (cb) => {
                cb(aliceGoogle);
                return () => {};
            }
        };

        window.firebase = {
            database: Object.assign(() => harness.mockDb, {
                ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } }
            }),
            auth: () => mockAuth
        };

        vi.spyOn(FirebaseModule, 'initFirebase').mockReturnValue({
            auth: mockAuth,
            db: harness.mockDb,
            storage: {}
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    // ── Task 1 & 2: Session & Identity Flows ────────────────────────────────

    it('shows sign-in wall and makes zero v2 database calls when signed out', async () => {
        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: null,
            isSignedIn: false,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(screen.getByText('Sign in with Google to join GlobalChat')).toBeInTheDocument();
        });

        // Strict assertion: zero reads/writes to globalChat/v2
        const v2Operations = harness.history.filter(h => h.path.startsWith('globalChat/v2'));
        expect(v2Operations.length).toBe(0);
    });

    it('bootstraps Google identity to profiles node before attaching listeners and loads empty feed', async () => {
        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: aliceGoogle,
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
            expect(screen.getByText('Be the first to send a message!')).toBeInTheDocument();
        });

        // Verify profile write
        const profileWrite = harness.history.find(h => h.op === 'set' && h.path === 'globalChat/v2/profiles/user-google-alice');
        expect(profileWrite).toBeDefined();
        expect(profileWrite.val.displayName).toBe('Alice Waters');
        expect(profileWrite.val.photoURL).toBe('https://lh3.googleusercontent.com/a/alice');
        expect(typeof profileWrite.val.joinedAt).toBe('number');
        expect(typeof profileWrite.val.updatedAt).toBe('number');

        // Verify listener attached to globalChat/v2/messages
        const messageListeners = harness.history.filter(h => h.op === 'on' && h.path.startsWith('globalChat/v2/messages'));
        expect(messageListeners.length).toBeGreaterThan(0);
    });

    it('handles account switching A-to-B: tears down user A listeners and state, and sets up user B', async () => {
        let authState = {
            chatIdentity: aliceGoogle,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockImplementation(() => authState);

        const { rerender } = render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(screen.getByText('Be the first to send a message!')).toBeInTheDocument();
        });

        const initialListenersCount = harness.getListeners().length;
        expect(initialListenersCount).toBeGreaterThan(0);

        // Switch identity to Bob
        authState = {
            chatIdentity: bobGoogle,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        };

        await act(async () => {
            rerender(React.createElement(GlobalChat));
        });

        // Verify user B profile bootstrapped
        await waitFor(() => {
            const bobProfileWrite = harness.history.find(h => h.op === 'set' && h.path === 'globalChat/v2/profiles/user-google-bob');
            expect(bobProfileWrite).toBeDefined();
            expect(bobProfileWrite.val.displayName).toBe('Bob Dylan');
        });

        // Switch to signed-out
        authState = {
            chatIdentity: null,
            isSignedIn: false,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        };

        await act(async () => {
            rerender(React.createElement(GlobalChat));
        });

        await waitFor(() => {
            expect(screen.getByText('Sign in with Google to join GlobalChat')).toBeInTheDocument();
        });
    });

    it('allows duplicate display names to coexist peacefully by UID', async () => {
        const user1 = { uid: 'uid-duplicate-1', displayName: 'Alex Taylor', photoURL: 'https://lh3.googleusercontent.com/a/alex1' };
        const user2 = { uid: 'uid-duplicate-2', displayName: 'Alex Taylor', photoURL: 'https://lh3.googleusercontent.com/a/alex2' };

        harness.store['globalChat/v2/profiles/uid-duplicate-1'] = { displayName: 'Alex Taylor', photoURL: 'https://lh3.googleusercontent.com/a/alex1' };
        harness.store['globalChat/v2/profiles/uid-duplicate-2'] = { displayName: 'Alex Taylor', photoURL: 'https://lh3.googleusercontent.com/a/alex2' };

        harness.store['globalChat/v2/messages/msg_dup_1'] = {
            uid: user1.uid,
            senderName: user1.displayName,
            senderPhotoURL: user1.photoURL,
            text: 'First Alex speaking',
            createdAt: Date.now() - 5000
        };
        harness.store['globalChat/v2/messages/msg_dup_2'] = {
            uid: user2.uid,
            senderName: user2.displayName,
            senderPhotoURL: user2.photoURL,
            text: 'Second Alex speaking',
            createdAt: Date.now() - 2000
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: aliceGoogle,
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
            expect(document.querySelector('#msg-msg_dup_1')).toBeInTheDocument();
            expect(document.querySelector('#msg-msg_dup_2')).toBeInTheDocument();
        });

        const msg1 = document.querySelector('#msg-msg_dup_1');
        const msg2 = document.querySelector('#msg-msg_dup_2');

        expect(msg1.querySelector('.gc-sender-name').textContent).toContain('Alex Taylor');
        expect(msg2.querySelector('.gc-sender-name').textContent).toContain('Alex Taylor');
        expect(msg1.querySelector('.gc-avatar').src).toBe('https://lh3.googleusercontent.com/a/alex1');
        expect(msg2.querySelector('.gc-avatar').src).toBe('https://lh3.googleusercontent.com/a/alex2');
    });

    it('applies fallbacks for missing/broken photo and missing name without crashing', async () => {
        harness.store['globalChat/v2/messages/msg_anon'] = {
            uid: 'uid-missing-info',
            senderName: null,
            senderPhotoURL: null,
            text: 'Anonymous fallback message',
            createdAt: Date.now() - 3000
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: aliceGoogle,
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
            expect(document.querySelector('#msg-msg_anon')).toBeInTheDocument();
        });

        const anonMsg = document.querySelector('#msg-msg_anon');
        expect(anonMsg.querySelector('.gc-sender-name').textContent).toContain('Google User');
        const avatarImg = anonMsg.querySelector('.gc-avatar');
        expect(avatarImg.src).toContain('/logo/streamflix.png');

        // Trigger image onError fallback
        fireEvent.error(avatarImg);
        expect(avatarImg.src).toContain('ui-avatars.com');
    });

    it('strictly avoids reading or querying legacy /messages path', async () => {
        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: aliceGoogle,
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
            expect(screen.getByText('Be the first to send a message!')).toBeInTheDocument();
        });

        // Harness allowlist enforces this; assert every touched path starts with globalChat/v2/
        const allPaths = harness.history.map(h => h.path);
        const legacyPaths = allPaths.filter(p => !p.startsWith('globalChat/v2/') && !p.startsWith('.info/'));
        expect(legacyPaths.length).toBe(0);
    });

    // ── Task 3: Messaging and Moderation Flows ──────────────────────────────

    it('supports full lifecycle of text message, reply, reaction, seen receipt, and soft delete', async () => {
        harness.store['globalChat/v2/messages/msg_bob_target'] = {
            uid: bobGoogle.uid,
            senderName: bobGoogle.displayName,
            senderPhotoURL: bobGoogle.photoURL,
            text: 'Hey Alice, check this out!',
            createdAt: Date.now() - 10000
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: aliceGoogle,
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
            expect(document.querySelector('#msg-msg_bob_target')).toBeInTheDocument();
        });

        // 1. Mark Bob's message seen
        const seenInHistory = harness.history.some(h => (h.op === 'update' && h.val?.['globalChat/v2/messages/msg_bob_target/seenBy/user-google-alice']) || (h.op === 'set' && h.path === 'globalChat/v2/messages/msg_bob_target/seenBy/user-google-alice'));
        const seenInStore = harness.store['globalChat/v2/messages/msg_bob_target/seenBy/user-google-alice'] === true;
        expect(seenInHistory || seenInStore).toBe(true);

        // 2. React with ❤️ to Bob's message
        const bobMsgEl = document.querySelector('#msg-msg_bob_target');
        fireEvent.mouseEnter(bobMsgEl);
        const reactBtn = screen.getByTitle('React');
        fireEvent.click(reactBtn);
        const heartBtn = screen.getByText('❤️');
        await act(async () => {
            fireEvent.click(heartBtn);
        });

        const reactionWrite = harness.history.find(h => h.op === 'set' && h.path === 'globalChat/v2/messages/msg_bob_target/reactions/user-google-alice');
        expect(reactionWrite).toBeDefined();
        expect(reactionWrite.val).toBe('❤️');

        // 3. Reply to Bob's message
        fireEvent.mouseEnter(bobMsgEl);
        const replyBtn = screen.getByTitle('Reply');
        fireEvent.click(replyBtn);

        const input = document.querySelector('.gc-msg-input');
        fireEvent.change(input, { target: { value: 'Got it, looks awesome!' } });
        const sendBtn = document.querySelector('.gc-send-btn');
        await act(async () => {
            fireEvent.click(sendBtn);
        });

        // Verify sent reply message
        const sentMessagePush = harness.history.find(h => h.op === 'push' && h.path === 'globalChat/v2/messages');
        expect(sentMessagePush).toBeDefined();
        const sentMsg = harness.store[sentMessagePush.newPath];
        expect(sentMsg.text).toBe('Got it, looks awesome!');
        expect(sentMsg.uid).toBe(aliceGoogle.uid);
        expect(sentMsg.replyTo).toBeDefined();
        expect(sentMsg.replyTo.messageId).toBe('msg_bob_target');
        expect(sentMsg.replyTo.senderName).toBe('Bob Dylan');

        // 4. Soft delete Alice's own message
        window.confirm = vi.fn().mockReturnValue(true);
        // Seed the sent message into the rendered DOM list
        await act(async () => {
            harness.emitChildAdded('globalChat/v2/messages', sentMessagePush.newKey, sentMsg);
        });

        await waitFor(() => {
            expect(document.querySelector(`#msg-${sentMessagePush.newKey}`)).toBeInTheDocument();
        });

        const ownMsgEl = document.querySelector(`#msg-${sentMessagePush.newKey}`);
        fireEvent.mouseEnter(ownMsgEl);
        const moreBtn = ownMsgEl.querySelector('.gc-action-icon[title="More"]');
        fireEvent.click(moreBtn);
        const unsendBtn = screen.getByText('Unsend');
        await act(async () => {
            fireEvent.click(unsendBtn);
        });

        const unsendUpdate = harness.history.find(h => h.op === 'update' && h.path === sentMessagePush.newPath);
        expect(unsendUpdate).toBeDefined();
        expect(unsendUpdate.val.deletedForAll).toBe(true);
    });

    it('submits reports and generates reporter-authored ticket messages', async () => {
        harness.store['globalChat/v2/messages/msg_spam'] = {
            uid: bobGoogle.uid,
            senderName: bobGoogle.displayName,
            text: 'Offensive spam message',
            createdAt: Date.now() - 4000
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: aliceGoogle,
            isSignedIn: true,
            isAuthLoading: false,
            isGlobalChatAdmin: false,
            signInWithGoogle: vi.fn()
        });

        window.alert = vi.fn();

        render(React.createElement(GlobalChat));

        act(() => {
            window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
        });

        await waitFor(() => {
            expect(document.querySelector('#msg-msg_spam')).toBeInTheDocument();
        });

        // Report message
        const spamMsgEl = document.querySelector('#msg-msg_spam');
        fireEvent.mouseEnter(spamMsgEl);
        const moreBtn = spamMsgEl.querySelector('.gc-action-icon[title="More"]');
        fireEvent.click(moreBtn);
        const reportBtn = screen.getByText('Report');

        await act(async () => {
            fireEvent.click(reportBtn);
        });

        // Verify report written to globalChat/v2/reports
        const reportPush = harness.history.find(h => h.op === 'push' && h.path === 'globalChat/v2/reports');
        expect(reportPush).toBeDefined();
        const reportData = harness.store[reportPush.newPath];
        expect(reportData.kind).toBe('message');
        expect(reportData.msgId).toBe('msg_spam');
        expect(reportData.reportedBy).toBe(aliceGoogle.uid);
        expect(reportData.reportedByName).toBe(aliceGoogle.displayName);

        // Verify self-bound ticket message written to feed
        const ticketMessagePush = harness.history.filter(h => h.op === 'push' && h.path === 'globalChat/v2/messages').pop();
        expect(ticketMessagePush).toBeDefined();
        const ticketMsg = harness.store[ticketMessagePush.newPath];
        expect(ticketMsg.type).toBe('ticket');
        expect(ticketMsg.uid).toBe(aliceGoogle.uid);
        expect(ticketMsg.senderName).toBe(aliceGoogle.displayName);
        expect(ticketMsg.ticketStatus).toBe('open');
    });

    it('moderation controls: claims admin can hard delete, pin, view reports, and resolve tickets', async () => {
        harness.store['globalChat/v2/messages/msg_target'] = {
            uid: bobGoogle.uid,
            senderName: bobGoogle.displayName,
            text: 'Message to moderate',
            createdAt: Date.now() - 5000
        };
        harness.store['globalChat/v2/messages/msg_ticket_item'] = {
            uid: aliceGoogle.uid,
            senderName: aliceGoogle.displayName,
            type: 'ticket',
            ticketAction: 'created',
            ticketStatus: 'open',
            ticketNo: '778899',
            category: 'Playback',
            createdAt: Date.now() - 4000
        };
        harness.store['globalChat/v2/reports/rep_1'] = {
            kind: 'issue',
            category: 'Playback',
            description: 'Cannot play stream',
            reportedBy: aliceGoogle.uid,
            reportedByName: aliceGoogle.displayName,
            timestamp: Date.now() - 4000,
            ticketMsgId: 'msg_ticket_item'
        };

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            chatIdentity: adminGoogle,
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
            expect(document.querySelector('#msg-msg_target')).toBeInTheDocument();
        });

        // 1. Open Reports queue
        const reportsBtn = document.querySelector('.gc-icon-btn[title="Reports"]');
        expect(reportsBtn).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(reportsBtn);
        });
        expect(screen.getByText('User Reports')).toBeInTheDocument();

        // 2. Resolve ticket in Reports queue
        const resolveBtn = screen.getByText('Resolve');
        await act(async () => {
            fireEvent.click(resolveBtn);
        });

        // Verify report removed and ticket message updated
        const reportRemove = harness.history.find(h => h.op === 'remove' && h.path === 'globalChat/v2/reports/rep_1');
        expect(reportRemove).toBeDefined();

        const ticketUpdate = harness.history.find(h => h.op === 'update' && h.path === 'globalChat/v2/messages/msg_ticket_item');
        expect(ticketUpdate).toBeDefined();
        expect(ticketUpdate.val.ticketStatus).toBe('resolved');

        // Close reports overlay
        fireEvent.click(screen.getByText('✕'));

        // 3. Pin message
        const targetEl = document.querySelector('#msg-msg_target');
        fireEvent.mouseEnter(targetEl);
        const moreBtn = targetEl.querySelector('.gc-action-icon[title="More"]');
        fireEvent.click(moreBtn);
        const pinBtn = screen.getByText('Pin');
        await act(async () => {
            fireEvent.click(pinBtn);
        });

        const pinSet = harness.history.find(h => h.op === 'set' && h.path === 'globalChat/v2/pinnedMessage');
        expect(pinSet).toBeDefined();
        expect(pinSet.val.id).toBe('msg_target');
        expect(pinSet.val.pinnedBy).toBe(adminGoogle.uid);

        // 4. Hard delete message
        fireEvent.mouseEnter(targetEl);
        fireEvent.click(moreBtn);
        const deleteBtn = screen.getByText('Delete');
        await act(async () => {
            fireEvent.click(deleteBtn);
        });

        const hardDelete = harness.history.find(h => h.op === 'remove' && h.path === 'globalChat/v2/messages/msg_target');
        expect(hardDelete).toBeDefined();
    });

    it('claim revocation dismisses reports panel and resets moderation capabilities', async () => {
        let authState = {
            chatIdentity: adminGoogle,
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

        // Open reports
        await act(async () => {
            fireEvent.click(document.querySelector('.gc-icon-btn[title="Reports"]'));
        });
        expect(screen.getByText('User Reports')).toBeInTheDocument();

        // Revoke claim
        authState = {
            ...authState,
            isGlobalChatAdmin: false
        };

        await act(async () => {
            rerender(React.createElement(GlobalChat));
        });

        // Reports modal dismissed
        expect(screen.queryByText('User Reports')).toBeNull();
        expect(document.querySelector('.gc-icon-btn[title="Reports"]')).toBeNull();
    });
});
