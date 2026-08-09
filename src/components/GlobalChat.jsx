import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useTVDetect from '../hooks/useTVDetect';
import ChatLinkPreview from './ChatLinkPreview';
import MovieRecRow from './MovieRecRow';
import { cardPoster } from '../utils/images';
import './GlobalChat.css';

// Firebase configuration for StreamFlix Chat
const firebaseConfig = {
    apiKey: "AIzaSyA-VQT6muzrgv12mQ9_Afdgx-OtWR8eun0",
    authDomain: "streamflix-chat.firebaseapp.com",
    databaseURL: "https://streamflix-chat-default-rtdb.firebaseio.com",
    projectId: "streamflix-chat",
    storageBucket: "streamflix-chat.firebasestorage.app",
    messagingSenderId: "234688078034",
    appId: "1:234688078034:web:4d3f94dc91426252410d0b"
};

// Constants
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

// Report Issue categories — plain language for non-technical users. Short and
// distinct so reports stay sortable without a taxonomy.
const REPORT_CATEGORIES = [
    "Video won't play",
    'Buffers or stops',
    'Wrong info (title, poster, etc.)',
    'Search not working',
    'Something else'
];
// One report per user per 2 minutes (per device; stored in localStorage so it
// survives reloads). Keeps spam from drowning out real reports.
const ISSUE_COOLDOWN_MS = 2 * 60 * 1000;
const ISSUE_COOLDOWN_KEY = 'gc_last_issue_report';

// Snapshot a reported message's visible content into the report payload. The
// admin moderation panel renders this snippet directly, so a report stays
// useful even if the message is later edited, deleted, or purged — the report
// carries its own copy of what was said.
// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export const buildMessageReport = (msg, reporter) => {
    const text = (msg?.text || '').trim();
    return {
        kind: 'message',
        msgId: msg?.id || null,
        messageText: text ? (text.length > 200 ? text.slice(0, 200) + '…' : text) : '',
        messageNickname: msg?.nickname || 'Unknown',
        messageMedia: msg?.mediaUrl ? (msg.mediaType || 'media') : null,
        reportedBy: reporter?.uid || null,
        reportedByNickname: reporter?.nickname || 'Unknown',
        timestamp: Date.now()
    };
};

// Condense a raw user-agent into a short "Browser on OS" line so the admin
// panel shows device context at a glance instead of a wall of text.
// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export const summarizeUA = (ua) => {
    if (!ua) return '';
    const os = ['Android', 'iPhone', 'iPad', 'Windows', 'Mac OS X', 'Linux', 'CrOS']
        .find(o => ua.includes(o)) || 'Unknown OS';
    let browser = 'Unknown browser';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    return `${browser} on ${os}`;
};

// Hover action buttons (React/Reply/⋮) are a mouse-only affordance. Touch
// devices long-press for the action sheet instead, so only track hover when
// the primary pointer actually hovers.
const HOVER_MQ = window.matchMedia('(hover: hover) and (pointer: fine)');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ADMIN_NICKNAME = "StreamFlix";
const ADMIN_AVATAR = "/logo/streamflix.png";
// Normalize a nickname into the key used by the global `nicknames` registry:
// trimmed, lowercased, and stripped of the characters Firebase keys can't
// contain (., #, $, /, [, ]). The registry makes names case-insensitively
// unique across the whole chat.
// eslint-disable-next-line no-useless-escape -- \/ and \[ are required members here
const nicknameKey = (name) => (name || '').trim().toLowerCase().replace(/[.#$\/\[\]]/g, '');
// Google Apps Script URL for file uploads (same as Shakzz-TV)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzTmKrwPjOOhL-H7rXVLvs_p9ZPb5aulvhzNhxRlA3x3byy81tUnyFl66MQ5DvEvNo/exec";

// ─── Chat link support ─────────────────────────────────────────────────
// URLs inside message text are rendered as clickable links. The app's own
// /watch links open the existing content detail modal (modal-content-new)
// via Home's `openModalForContent` location-state mechanism — the same path
// Watch.jsx uses when someone visits a /watch URL directly. Any other URL
// opens in a new tab.
const CHAT_URL_RE = /(https?:\/\/[^\s<>"']+|\/watch\?[^\s<>"']*)/g;
// A greedy URL match can swallow sentence punctuation (".", ",", ")", "?",
// ...). Strip it so the link stays clean and the punctuation stays in the
// message text.
const CHAT_URL_TRAILING_RE = /[.,;:!?'")\]}]+$/;

// Parse a /watch URL (absolute or relative) into the fields the content
// modal needs. Returns null for anything that isn't a valid watch link.
// Deliberately host-agnostic: a watch URL shared from any origin (dev
// localhost, the deployed site, a share link) opens the same modal, and it
// never navigates to the foreign host — clicking stays in this app.
const parseWatchLink = (url) => {
    try {
        const u = new URL(url, window.location.origin);
        if (u.pathname.replace(/\/+$/, '') !== '/watch') return null;
        const type = u.searchParams.get('type');
        const id = u.searchParams.get('id');
        if ((type === 'movie' || type === 'tv') && id && /^\d+$/.test(id)) {
            return {
                type,
                id,
                season: u.searchParams.get('season'),
                episode: u.searchParams.get('episode')
            };
        }
    } catch { /* not a parseable URL */ }
    return null;
};

// Split message text into plain-text chunks and { url } link parts.
const splitChatLinks = (text) => {
    const parts = [];
    let lastIndex = 0;
    let match;
    CHAT_URL_RE.lastIndex = 0;
    while ((match = CHAT_URL_RE.exec(text)) !== null) {
        const raw = match[0];
        // Drop trailing punctuation the greedy match swallowed; it is kept
        // as plain text via `lastIndex` below.
        const url = raw.replace(CHAT_URL_TRAILING_RE, '');
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        parts.push({ url });
        lastIndex = match.index + url.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
};

// Parse message text into block-level structure: bullet lists (`- `, `* ` or
// `• ` prefixes) and paragraphs. Every non-blank line becomes its own
// paragraph block so a single Enter break is never collapsed — blank lines
// simply separate blocks visually. Returns an array of { type: 'p', text } /
// { type: 'ul', items: [] } blocks. Kept as a pure module helper so
// rendering and the composer share the same rules.
const splitMessageBlocks = (text) => {
    const blocks = [];
    let list = null;   // accumulating bullet items

    const flushList = () => {
        if (list) { blocks.push({ type: 'ul', items: list }); list = null; }
    };

    text.split('\n').forEach((line) => {
        const trimmed = line.trim();
        const bullet = trimmed.match(/^[-*\u2022]\s+(.*)$/);
        if (bullet) {
            (list = list || []).push(bullet[1].trim());
        } else if (trimmed) {
            flushList();
            blocks.push({ type: 'p', text: trimmed });
        } else {
            // Blank line: end any open list so the next item starts fresh.
            flushList();
        }
    });
    flushList();
    return blocks;
};

// ─── Broadcast notifications & sound ────────────────────────────────────
// When an @everyone broadcast arrives while the chat is closed, notify the
// user with a browser Notification (if permission is granted) and a short
// two-tone chime. The chime is synthesized with Web Audio so no asset file is
// needed, and the context is created/resumed on the first user interaction to
// satisfy browser autoplay policies.

let broadcastAudioCtx = null;
let broadcastAudioUnlocked = false;

const ensureAudioUnlocked = () => {
    try {
        if (!broadcastAudioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            broadcastAudioCtx = new Ctx();
        }
        // resume() can reject when called outside a user gesture (autoplay
        // policy) — swallow that, and only report the context unlocked once it
        // is actually running so we never schedule sound on a silent context.
        if (broadcastAudioCtx.state === 'suspended') {
            const r = broadcastAudioCtx.resume();
            if (r && r.catch) r.catch(() => {});
        }
        if (broadcastAudioCtx.state === 'running') broadcastAudioUnlocked = true;
    } catch { /* audio unavailable — ignore */ }
};

// Two-tone chime (E6 → A6) so an unread broadcast is noticed even with the
// tab in the background.
const playBroadcastSound = () => {
    try {
        ensureAudioUnlocked();
        if (!broadcastAudioCtx || !broadcastAudioUnlocked) return;
        const ctx = broadcastAudioCtx;
        const now = ctx.currentTime;
        [880, 1174.66].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.18;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.3);
        });
    } catch { /* ignore */ }
};

// Ask for notification permission once, from a user gesture (chat open).
const requestBroadcastNotificationPermission = () => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    try {
        const p = Notification.requestPermission();
        if (p && p.catch) p.catch(() => {});
    } catch { /* older callback-style API — ignore */ }
};

// Browser Notification + chime for one unread @everyone broadcast.
const notifyBroadcast = (msg) => {
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            const body = msg.text
                ? (msg.text.length > 120 ? msg.text.slice(0, 120) + '…' : msg.text)
                : 'A new announcement has been posted';
            const n = new Notification('📢 Announcement — StreamFlix Chat', {
                body: `${msg.nickname || 'Admin'}: ${body}`,
                icon: msg.avatarUrl || '/logo/streamflix.png',
                tag: `sf-broadcast-${msg.id}`,
                silent: true // we play our own chime so the OS doesn't double up
            });
            n.onclick = () => { window.focus(); n.close(); };
        }
        playBroadcastSound();
    } catch { /* notifications unavailable — ignore */ }
};

function GlobalChat() {
    const isTVMode = useTVDetect();
    const navigate = useNavigate();
    // State
    const [showFab, setShowFab] = useState(false); // Delay FAB until loading screen finishes
    const [isOpen, setIsOpen] = useState(false);
    const [isSetup, setIsSetup] = useState(true);
    const [nickname, setNickname] = useState('');
    // Available variants of a taken nickname (e.g. "kil" → "kil_2"), shown as
    // tappable chips on the join screen so users can claim a similar name.
    const [nicknameSuggestions, setNicknameSuggestions] = useState([]);
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');

    // Movie recommendation list: selected snapshots for the message being
    // composed (max 10), plus the picker UI state.
    const [recMovies, setRecMovies] = useState([]);
    // Optional custom title + note the sender writes alongside a
    // recommendation; both are stored on the message when sent.
    const [recTitle, setRecTitle] = useState('');
    const [recText, setRecText] = useState('');
    const [showRecPicker, setShowRecPicker] = useState(false);
    const [showRecMenu, setShowRecMenu] = useState(false);
    const [recQuery, setRecQuery] = useState('');
    const [recResults, setRecResults] = useState([]);
    const [recSearching, setRecSearching] = useState(false);

    // Report Issue: plain-language form in the composer menu. What the user
    // was doing is captured automatically and attached to the report payload —
    // the form itself stays non-technical.
    const [showReport, setShowReport] = useState(false);
    const [reportCategory, setReportCategory] = useState('');
    const [reportDesc, setReportDesc] = useState('');
    const [reportSending, setReportSending] = useState(false);
    const [reportSent, setReportSent] = useState(false);
    const [reportBlocked, setReportBlocked] = useState(false);
    const [reportContext, setReportContext] = useState(null); // auto-attached context
    const lastPlaybackIssueRef = useRef(null); // most recent DirectPlayer fallback
    // Ids of unread @everyone broadcasts that sit outside the loaded
    // 30-message window (backfilled once at setup). The FAB badge number is
    // the sum of unread broadcasts in the window plus these stale ids.
    const [staleBroadcastIds, setStaleBroadcastIds] = useState(new Set());
    const [error, setError] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [showActionSheet, setShowActionSheet] = useState(false);
    const [actionSheetTarget, setActionSheetTarget] = useState(null);
    const [showReactionPopover, setShowReactionPopover] = useState(null);
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
    const [showReactionView, setShowReactionView] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [moreMenuMessageId, setMoreMenuMessageId] = useState(null);
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [dismissedComposeKey, setDismissedComposeKey] = useState(null); // which live link preview the user dismissed

    // Avatar customization states
    const [avatarStyle, setAvatarStyle] = useState('adventurer');
    const [avatarSeed, setAvatarSeed] = useState(() => Math.random().toString(36).substring(7));
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);

    // Available DiceBear avatar styles
    const AVATAR_STYLES = [
        { id: 'adventurer', name: 'Adventurer' },
        { id: 'avataaars', name: 'Avataaars' },
        { id: 'bottts', name: 'Robots' },
        { id: 'lorelei', name: 'Lorelei' },
        { id: 'pixel-art', name: 'Pixel Art' },
        { id: 'thumbs', name: 'Thumbs' },
        { id: 'fun-emoji', name: 'Fun Emoji' },
        { id: 'icons', name: 'Icons' }
    ];

    // Generate DiceBear avatar URL
    const getAvatarUrl = (style, seed) => {
        return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1f1f1f`;
    };

    // Admin settings states
    const [showAdminSettings, setShowAdminSettings] = useState(false);
    const [adminAvatarMode, setAdminAvatarMode] = useState('dicebear'); // 'dicebear' or 'upload'
    const [adminUploadedAvatar, setAdminUploadedAvatar] = useState(null);
    const [adminNickname, setAdminNickname] = useState('');
    const [adminBadge, setAdminBadge] = useState('crown');
    const [pinnedMessage, setPinnedMessage] = useState(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const adminFileInputRef = useRef(null);

    // Font Awesome admin badges (using class names)
    const ADMIN_BADGES = [
        { id: 'crown', icon: 'fa-crown', name: 'Crown' },
        { id: 'star', icon: 'fa-star', name: 'Star' },
        { id: 'shield', icon: 'fa-shield-halved', name: 'Shield' },
        { id: 'fire', icon: 'fa-fire', name: 'Fire' },
        { id: 'gem', icon: 'fa-gem', name: 'Diamond' },
        { id: 'bolt', icon: 'fa-bolt', name: 'Lightning' },
        { id: 'certificate', icon: 'fa-certificate', name: 'Badge' },
        { id: 'wand', icon: 'fa-wand-magic-sparkles', name: 'Magic' }
    ];
    // Edit Message Handler
    const handleEditMessage = (msg) => {
        const now = Date.now();
        const msgTime = msg.createdAt;
        if (now - msgTime > 3 * 60 * 1000) {
            alert('You can only edit messages within 3 minutes of sending.');
            return;
        }
        setEditingMessageId(msg.id);
        setMessageText(msg.text || '');
        setIsEditing(true);
        if (inputRef.current) inputRef.current.focus();
    };

    // Cancel Edit Handler
    const cancelEdit = () => {
        setEditingMessageId(null);
        setMessageText('');
        setIsEditing(false);
    };

    // Update Message Function
    const updateMessage = async () => {
        if (!editingMessageId || !messageText.trim()) return;

        try {
            await dbRef.current.ref(`messages/${editingMessageId}`).update({
                text: messageText,
                isEdited: true
            });
            cancelEdit();
        } catch (e) {
            console.error('Update error:', e);
            alert('Failed to update message');
        }
    };

    // Media states
    const [pendingFile, setPendingFile] = useState(null);
    const [pendingBlobUrl, setPendingBlobUrl] = useState(null);
    const [, setShowCamera] = useState(false);
    const [, setCapturedMedia] = useState(null);
    const [showLightbox, setShowLightbox] = useState(null);
    const [, setIsRecording] = useState(false);

    // Admin states
    const [showReports, setShowReports] = useState(false);
    const [reports, setReports] = useState([]);
    const [, setProfileImage] = useState(null);

    // Refs
    const messagesContainerRef = useRef(null);
    const inputRef = useRef(null);
    const currentUserRef = useRef(null);
    const userDataRef = useRef({ nickname: '', avatarUrl: '', isAdmin: false });
    const dbRef = useRef(null);
    const authRef = useRef(null);
    const storageRef = useRef(null);
    const listenersRef = useRef([]);
    const oldestKeyRef = useRef(null);
    const isLoadingHistoryRef = useRef(false);

    const profileInputRef = useRef(null);
    const streamRef = useRef(null);
    const longPressTimerRef = useRef(null);
    const longPressStartRef = useRef(null);
    const suppressClickRef = useRef(false);
    // Guards the profile value-listener against false-positive "deleted"
    // events caused by Firebase SDK optimistic write rollbacks during
    // admin login.  Cleared once the listener sees isAdmin: true.
    const adminLoginGuardRef = useRef(false);
    // Set the first time the chat is opened after setup — the broadcast
    // backfill uses it to avoid resurrecting the badge with broadcasts the
    // user has already read.
    const chatOpenedRef = useRef(false);
    // Ids of messages hard-deleted during this session, so reply previews that
    // reference a deleted message disappear too (no trace). Distinct from the
    // messages array: a reply target that simply hasn't been loaded yet must
    // keep its preview.
    const deletedMsgIdsRef = useRef(new Set());
    // Broadcasts already alerted (Notification + chime) this session, so a
    // duplicate child_added event can never double-fire the alert.
    const notifiedBroadcastIdsRef = useRef(new Set());

    // Delay FAB visibility until loading screen is gone (4s + 0.5s fade)
    useEffect(() => {
        if (isTVMode) return;
        const timer = setTimeout(() => {
            setShowFab(true);
        }, 4500);
        return () => clearTimeout(timer);
    }, [isTVMode]);

    // First user interaction unlocks the audio context (autoplay policy) so
    // the broadcast chime can play later. Chat-open also unlocks; this is a
    // fallback for users who interact elsewhere on the page first.
    useEffect(() => {
        const unlock = () => ensureAudioUnlocked();
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, []);

    // Initialize Firebase
    useEffect(() => {
        if (isTVMode) return;
        if (typeof window.firebase === 'undefined') {
            console.warn('Firebase SDK not loaded');
            return;
        }

        try {
            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(firebaseConfig);
            }
            authRef.current = window.firebase.auth();
            dbRef.current = window.firebase.database();
            storageRef.current = window.firebase.storage();
            console.log('🔥 Firebase Connected for StreamFlix Chat!');

            const unsubscribe = authRef.current.onAuthStateChanged(async (user) => {
                if (user) {
                    currentUserRef.current = user;
                    const snapshot = await dbRef.current.ref(`users/${user.uid}`).once('value');
                    if (snapshot.exists()) {
                        const userData = snapshot.val();
                        userDataRef.current = userData;
                        if (userData.nickname) {
                            setIsSetup(false);
                            loadMessages();
                        }
                    }

                    // Listen for profile deletion (Admin forcefully deletes user)
                    const userProfileRef = dbRef.current.ref(`users/${user.uid}`);
                    const profileListener = userProfileRef.on('value', (snap) => {
                        // Use userDataRef.nickname (ref is always current, unlike state)
                        if (!snap.exists() && userDataRef.current.nickname) {
                            // During admin login the proxy writes via REST while
                            // the WebSocket SDK hasn't received the push yet. A
                            // client .update() that races against it can cause
                            // an optimistic-rollback where the node briefly
                            // appears non-existent locally. Skip the reset
                            // while the guard is active.
                            if (adminLoginGuardRef.current) {
                                console.log('Profile listener: node absent but admin login in progress — skipping reset');
                                return;
                            }
                            console.log('User profile deleted, resetting to setup...');
                            // Profile deleted (admin force-delete): release the
                            // nickname claim so the name frees up for others.
                            const delKey = nicknameKey(userDataRef.current.nickname);
                            if (delKey) {
                                dbRef.current.ref(`nicknames/${delKey}`).remove().catch(() => {});
                            }
                            userDataRef.current = {};
                            setIsSetup(true);
                            setMessages([]);
                        } else if (snap.exists()) {
                            // Keep userDataRef in sync with the DB, but
                            // preserve the in-memory isAdmin flag when the DB
                            // node doesn't carry it (legacy dev path elevates
                            // only in memory — the rules block a client-side
                            // isAdmin:true write without the proxy).
                            const dbData = snap.val();
                            if (userDataRef.current.isAdmin && !dbData.isAdmin) {
                                dbData.isAdmin = true;
                            }
                            userDataRef.current = dbData;
                            // Clear the admin-login guard once the real node
                            // arrives from the server.
                            if (adminLoginGuardRef.current && dbData.isAdmin) {
                                adminLoginGuardRef.current = false;
                            }
                        }
                    });
                    listenersRef.current.push(() => userProfileRef.off('value', profileListener));
                } else {
                    authRef.current.signInAnonymously().catch(console.error);
                }
            });

            return () => {
                unsubscribe();
                listenersRef.current.forEach(unsub => unsub());
            };
        } catch (e) {
            console.error('Firebase init error:', e);
        }
    }, []);

    // Load users cache
    useEffect(() => {
        if (!dbRef.current || isSetup) return;

        const usersRef = dbRef.current.ref('users');
        const callback = (snapshot) => {
            const users = [];
            snapshot.forEach(child => {
                const val = child.val();
                if (val.nickname) users.push(val);
            });
            setAllUsers(users);
        };

        usersRef.on('value', callback);
        listenersRef.current.push(() => usersRef.off('value', callback));
    }, [isSetup]);

    // Load pinned message
    useEffect(() => {
        if (!dbRef.current || isSetup) return;

        const pinnedRef = dbRef.current.ref('pinnedMessage');
        const callback = (snapshot) => {
            if (snapshot.exists()) {
                setPinnedMessage(snapshot.val());
            } else {
                setPinnedMessage(null);
            }
        };

        pinnedRef.on('value', callback);

        // Cleanup function
        return () => {
            pinnedRef.off('value', callback);
        };
    }, [isSetup]);

    // Backfill unread @everyone broadcasts that are older than the loaded
    // 30-message window (so they never enter `messages`), so the FAB badge
    // still counts them. Requires a Firebase rule of
    // `"messages": { ".indexOn": ["broadcast"] }`; if the query is rejected
    // the badge falls back to the loaded window + live arrivals, which covers
    // every realistic case.
    useEffect(() => {
        if (!dbRef.current || isSetup || !currentUserRef.current) return;
        let cancelled = false;
        (async () => {
            try {
                const me = currentUserRef.current.uid;
                const snap = await dbRef.current.ref('messages')
                    .orderByChild('broadcast').equalTo(true).once('value');
                if (cancelled || !snap.exists()) return;
                const unread = [];
                snap.forEach(child => {
                    const v = child.val();
                    if (!v) return;
                    // Admins' own broadcasts count too — they have no seenBy
                    // until the chat is opened again.
                    if (!v.seenBy || !v.seenBy[me]) unread.push(child.key);
                });
                // If the chat was already opened, the user has caught up —
                // re-adding these ids would resurrect the badge.
                if (unread.length > 0 && !chatOpenedRef.current) {
                    setStaleBroadcastIds(prev => new Set([...prev, ...unread]));
                }
            } catch (err) {
                console.warn('Broadcast backfill query failed (add ".indexOn": ["broadcast"] to rules):', err);
            }
        })();
        return () => { cancelled = true; };
    }, [isSetup]);

    // Load messages function
    const loadMessages = useCallback(() => {
        if (!dbRef.current || !currentUserRef.current) return;

        const messagesRef = dbRef.current.ref('messages');
        const query = messagesRef.orderByKey().limitToLast(30);

        query.once('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                startLiveListener();
                return;
            }

            const keys = Object.keys(data).sort();
            oldestKeyRef.current = keys[0];

            const msgs = keys.map(key => ({ id: key, ...data[key] }));
            setMessages(msgs);
            scrollToBottom(true);
            startLiveListener();
            markMessagesAsSeen(msgs);
        });
    }, []);

    // Mark @everyone broadcasts as seen (seenBy). The FAB badge only counts
    // broadcasts, so only opening the chat — or a broadcast arriving while it
    // is open — clears it. Includes the admin's own broadcasts, so the badge
    // the admin sees after posting clears the moment the chat is opened again.
    // Declared above startLiveListener/loadOlderMessages because their
    // dependency arrays reference it during render.
    const markBroadcastsSeen = useCallback((msgs) => {
        if (!dbRef.current || !currentUserRef.current || !userDataRef.current.nickname) return;

        const updates = {};
        let hasUpdates = false;

        msgs.forEach(msg => {
            if (msg.broadcast) {
                if (!msg.seenBy || !msg.seenBy[currentUserRef.current.uid]) {
                    updates[`messages/${msg.id}/seenBy/${currentUserRef.current.uid}`] = userDataRef.current.nickname;
                    updates[`messages/${msg.id}/status`] = 'seen';
                    hasUpdates = true;
                }
            }
        });

        if (hasUpdates) {
            dbRef.current.ref().update(updates);
        }
    }, []);

    // Start live listener
    const startLiveListener = useCallback(() => {
        if (!dbRef.current) return;

        const messagesRef = dbRef.current.ref('messages');

        const addedCallback = (snapshot) => {
            const newMsg = { id: snapshot.key, ...snapshot.val() };

            setMessages(prev => {
                if (prev.find(m => m.id === snapshot.key)) return prev;
                return [...prev, newMsg];
            });

            if (!oldestKeyRef.current) oldestKeyRef.current = snapshot.key;

            // Browser Notification + chime for an @everyone broadcast that
            // arrives while the chat is closed.
            if (!isOpen && newMsg.broadcast && newMsg.uid !== currentUserRef.current?.uid &&
                !notifiedBroadcastIdsRef.current.has(snapshot.key)) {
                notifiedBroadcastIdsRef.current.add(snapshot.key);
                notifyBroadcast(newMsg);
            }

            if (isOpen) {
                scrollToBottom(false);
                if (newMsg.uid !== currentUserRef.current?.uid) {
                    // Mark straight away so an @everyone broadcast arriving
                    // while the chat is open never leaves the FAB badge up.
                    if (newMsg.broadcast) markBroadcastsSeen([newMsg]);
                    else updateMessageStatus(snapshot.key, 'seen');
                }
            }
        };

        const changedCallback = (snapshot) => {
            const updatedMsg = { id: snapshot.key, ...snapshot.val() };
            setMessages(prev => prev.map(m => m.id === snapshot.key ? updatedMsg : m));
        };

        // Handle message removal (hard delete). Also record the id so reply
        // previews referencing a deleted message disappear (no trace), while
        // replies to merely-unloaded older messages keep their preview.
        const removedCallback = (snapshot) => {
            console.log('Message removed from DB:', snapshot.key);
            deletedMsgIdsRef.current.add(snapshot.key);
            setMessages(prev => prev.filter(m => m.id !== snapshot.key));
            // A deleted broadcast must stop counting toward the FAB badge.
            setStaleBroadcastIds(prev => {
                if (!prev.has(snapshot.key)) return prev;
                const next = new Set(prev);
                next.delete(snapshot.key);
                return next;
            });
        };

        messagesRef.limitToLast(1).on('child_added', addedCallback);
        messagesRef.on('child_changed', changedCallback);
        messagesRef.on('child_removed', removedCallback);

        listenersRef.current.push(
            () => messagesRef.off('child_added', addedCallback),
            () => messagesRef.off('child_changed', changedCallback),
            () => messagesRef.off('child_removed', removedCallback)
        );
    }, [isOpen, markBroadcastsSeen]);

    // Load older messages on scroll
    const loadOlderMessages = useCallback(async () => {
        if (!oldestKeyRef.current || isLoadingHistoryRef.current || !dbRef.current) return;

        isLoadingHistoryRef.current = true;
        const container = messagesContainerRef.current;
        const oldHeight = container?.scrollHeight || 0;

        const query = dbRef.current.ref('messages')
            .orderByKey()
            .endAt(oldestKeyRef.current)
            .limitToLast(21);

        const snapshot = await query.once('value');
        const data = snapshot.val();

        if (!data) {
            isLoadingHistoryRef.current = false;
            return;
        }

        const keys = Object.keys(data).sort();
        if (keys[keys.length - 1] === oldestKeyRef.current) keys.pop();
        if (keys.length === 0) {
            isLoadingHistoryRef.current = false;
            return;
        }

        oldestKeyRef.current = keys[0];
        const olderMsgs = keys.map(key => ({ id: key, ...data[key] }));

        setMessages(prev => [...olderMsgs, ...prev]);

        // Broadcasts loaded via scroll-pagination were seen by the reader
        // (scrolling up only happens with the chat open), so mark them seen —
        // otherwise they'd count toward the badge after the chat closes.
        if (isOpen) {
            markBroadcastsSeen(olderMsgs);
        }

        requestAnimationFrame(() => {
            if (container) {
                container.scrollTop = container.scrollHeight - oldHeight;
            }
            isLoadingHistoryRef.current = false;
        });
    }, [isOpen, markBroadcastsSeen]);

    // Handle scroll for loading history
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            if (container.scrollTop === 0 && !isLoadingHistoryRef.current) {
                loadOlderMessages();
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [loadOlderMessages]);

    // Scroll to bottom helper
    const scrollToBottom = (force = false) => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;

        if (force || isNearBottom) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    };

    // Update message status
    const updateMessageStatus = async (msgId, status) => {
        if (!dbRef.current) return;
        try {
            await dbRef.current.ref(`messages/${msgId}`).update({ status });
        } catch (e) {
            console.error('Status update error:', e);
        }
    };

    // Mark messages as seen
    const markMessagesAsSeen = useCallback((msgs) => {
        if (!dbRef.current || !currentUserRef.current || !userDataRef.current.nickname) return;

        const updates = {};
        let hasUpdates = false;

        msgs.forEach(msg => {
            // @everyone broadcasts are exempt here: they must stay unread until
            // the chat is actually opened, because only they drive the FAB
            // badge. Regular messages are auto-seen on load as before.
            if (msg.uid !== currentUserRef.current.uid &&
                msg.status === 'sent' &&
                !msg.deletedForAll &&
                !msg.broadcast) {
                if (!msg.seenBy || !msg.seenBy[currentUserRef.current.uid]) {
                    updates[`messages/${msg.id}/seenBy/${currentUserRef.current.uid}`] = userDataRef.current.nickname;
                    updates[`messages/${msg.id}/status`] = 'seen';
                    hasUpdates = true;
                }
            }
        });

        if (hasUpdates) {
            dbRef.current.ref().update(updates);
        }
    }, []);

    // Convert file to base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
        });
    };

    // Upload file to Google Drive via Apps Script (free alternative to Firebase Storage)
    const uploadToDrive = async (file) => {
        if (!currentUserRef.current) return null;

        try {
            const base64String = await fileToBase64(file);
            const payload = {
                base64: base64String,
                mimeType: file.type,
                filename: `StreamFlix_${Date.now()}_${file.name}`,
                userName: currentUserRef.current.uid
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
    };

    // Format Google Drive URL for viewing (uses lh3.googleusercontent.com for reliability)
    const formatDriveUrl = (url, type = 'view') => {
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
    };

    // Get file type
    const getFileType = (file) => {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        if (file.type.startsWith('audio/')) return 'audio';
        return 'file';
    };

    // Remove pending file
    const removePendingFile = () => {
        if (pendingBlobUrl) URL.revokeObjectURL(pendingBlobUrl);
        setPendingFile(null);
        setPendingBlobUrl(null);
    };

    // Handle chat open
    const handleOpenChat = () => {
        setIsOpen(true);
        chatOpenedRef.current = true;
        // Opening the chat is a user gesture — unlock the broadcast chime and
        // ask once for notification permission so future broadcasts can alert.
        ensureAudioUnlocked();
        requestBroadcastNotificationPermission();
        scrollToBottom(true);
        if (messages.length > 0) {
            markMessagesAsSeen(messages);
            markBroadcastsSeen(messages);
        }
        // Mark any backfilled (older-than-window) broadcasts as seen too, so
        // the badge clears the moment the chat is actually opened.
        const myNickname = userDataRef.current.nickname;
        if (staleBroadcastIds.size > 0 && currentUserRef.current && myNickname) {
            const updates = {};
            staleBroadcastIds.forEach(id => {
                updates[`messages/${id}/seenBy/${currentUserRef.current.uid}`] = myNickname;
            });
            dbRef.current.ref().update(updates);
            setStaleBroadcastIds(new Set());
        }
    };

    // Handle chat close
    const handleCloseChat = () => {
        setIsOpen(false);
        setShowActionSheet(false);
        setShowReactionPopover(null);
        setShowCamera(false);
        setShowReports(false);
        stopCamera();
    };

    // Handle profile image selection
    const handleProfileImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setProfileImage(file);
        }
    };

    // Atomically claim a nickname in the global `nicknames` registry so two
    // users can never hold the same name (case-insensitive). The RTDB
    // transaction is the source of truth: if the name is already owned by a
    // different uid, the write aborts — so even a cache-cleared client with a
    // brand-new anonymous uid can never re-take an existing user's name.
    // Returns { ok: true } on success or { ok: false, reason } if taken.
    const claimNickname = async (name, uid) => {
        const display = name.trim();
        const key = nicknameKey(display);
        if (!key) return { ok: false, reason: 'This nickname is not allowed' };
        const result = await dbRef.current.ref(`nicknames/${key}`).transaction((current) => {
            if (current && typeof current === 'object' && current.uid && current.uid !== uid) {
                return; // abort — already owned by someone else
            }
            return {
                uid,
                nickname: display,
                claimedAt: window.firebase.database.ServerValue.TIMESTAMP
            };
        });
        return result.committed
            ? { ok: true, key }
            : { ok: false, reason: 'This nickname is already taken — try another' };
    };

    // Suggest available variants of a taken name (e.g. "kil" → "kil_2", "kil_3")
    // by checking the existing registry in a single read. Variants stay within
    // the 15-char join limit. Returns [] if the registry is unreachable.
    const suggestNicknameVariants = async (name, count = 3) => {
        const baseKey = nicknameKey(name).slice(0, 12);
        const baseDisplay = name.trim().slice(0, 12);
        if (!baseKey) return [];
        try {
            const snap = await dbRef.current.ref('nicknames').once('value');
            const taken = new Set(snap.exists() ? Object.keys(snap.val()) : []);
            const variants = [];
            // Hard cap on attempts: with a nearly-full registry a long run of
            // taken suffixes could otherwise scan a huge range for 3 free ones.
            const MAX_ATTEMPTS = 100;
            for (let i = 2; variants.length < count && i < MAX_ATTEMPTS; i++) {
                const key = `${baseKey}_${i}`;
                if (taken.has(key)) continue;
                variants.push({ key, display: `${baseDisplay}_${i}` });
            }
            return variants;
        } catch {
            return [];
        }
    };

    // Reject a join with a friendly "taken" error plus available variants.
    // The reason passed through (e.g. the transaction's abort message) is
    // shown verbatim when it carries more detail than the generic fallback.
    const rejectNickname = async (name, reason = 'This nickname is already taken') => {
        setError(reason);
        setNicknameSuggestions(await suggestNicknameVariants(name));
    };

    // Handle join chat
    const handleJoinChat = async () => {
        if (!nickname.trim() || nickname.length < 2) {
            setError('Nickname must be at least 2 characters');
            return;
        }

        if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) {
            setError('This nickname is reserved');
            return;
        }

        if (!currentUserRef.current || !dbRef.current) {
            setError('Connection failed. Please try again.');
            return;
        }

        setIsJoining(true);
        setError('');

        try {
            // Use DiceBear generated avatar URL
            const avatarUrl = getAvatarUrl(avatarStyle, avatarSeed);
            const displayName = nickname.trim();
            const uid = currentUserRef.current.uid;

            // Quick pre-check for a friendly error; the atomic claim below is
            // still the source of truth for the "already taken" verdict. A
            // missing registry (rules not deployed) degrades to the legacy
            // flow so the chat keeps working either way.
            const key = nicknameKey(displayName);
            if (!key) {
                setError('This nickname is not allowed');
                return;
            }
            const existing = await dbRef.current.ref(`nicknames/${key}`).once('value').catch(() => null);
            if (existing && existing.exists() && existing.val()?.uid && existing.val().uid !== uid) {
                await rejectNickname(displayName);
                return;
            }

            // Write the profile first (keyed by uid — uniqueness lives in the
            // nickname registry, not here).
            await dbRef.current.ref(`users/${uid}`).set({
                uid,
                nickname: displayName,
                avatarUrl,
                isAdmin: false,
                joinedAt: window.firebase.database.ServerValue.TIMESTAMP
            });

            // Claim the name atomically; if a racer grabbed it in between,
            // roll the profile back and let the user pick another name.
            let claim = null;
            try {
                claim = await claimNickname(displayName, uid);
            } catch (e) {
                // Registry unavailable (rules not deployed) — join without
                // uniqueness so the chat still works.
                console.warn('Nickname registry unavailable, joining without uniqueness:', e);
            }
            if (claim && !claim.ok) {
                await dbRef.current.ref(`users/${uid}`).remove().catch(() => {});
                await rejectNickname(displayName, claim.reason);
                return;
            }

            setNicknameSuggestions([]);
            userDataRef.current = {
                nickname: displayName,
                avatarUrl,
                isAdmin: false
            };

            setIsSetup(false);
            loadMessages();
        } catch (err) {
            console.error('Join error:', err);
            setError('Failed to join. Please try again.');
        } finally {
            setIsJoining(false);
        }
    };

    // Admin verification lives on the Cloudflare proxy (functions/api/admin-login.js)
    // so the password is never checked against a client-readable hash in
    // production. The proxy is tried FIRST (it also works under `wrangler pages
    // dev`); the legacy Firebase-hash comparison only runs when the proxy is
    // unreachable (plain `npm run dev` on localhost, no proxy serving).
    //
    // `profile` is an optional { nickname, avatarUrl, adminBadge } object.
    // When provided the proxy writes the full admin profile atomically so the
    // client never needs a follow-up `.update()` (which can race with the
    // proxy's REST write and be rejected by the self-elevation rule).
    const verifyAdminViaProxy = async (password, profile) => {
        try {
            const res = await fetch('/api/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password,
                    uid: currentUserRef.current?.uid,
                    profile: profile || undefined
                })
            });
            // 404/405 = no proxy in this environment → fall back to legacy.
            if (res.status === 404 || res.status === 405) return { ok: false, unreachable: true };
            const data = await res.json().catch(() => null);
            // If the response wasn't valid JSON (e.g. Vite's SPA fallback
            // served index.html for the /api/* route), treat as unreachable.
            if (!data) return { ok: false, unreachable: true };
            return { ok: !!data.ok, unreachable: false };
        } catch (e) {
            // Network error = proxy not running here → legacy fallback.
            console.warn('Admin proxy unreachable, using legacy verification:', e);
            return { ok: false, unreachable: true };
        }
    };

    // Handle admin login
    const handleAdminLogin = async () => {
        const password = prompt('Enter Admin Password:');
        if (!password) return;

        try {
            // ── Read admin profile FIRST ──────────────────────────────────
            // We need the profile fields before calling the proxy so the
            // proxy can write the full user node in one atomic REST PATCH.
            let savedNickname = null;
            let savedAvatar = null;
            let savedBadge = null;

            try {
                const profileSnapshot = await dbRef.current.ref('secrets/admin_profile').once('value');
                if (profileSnapshot.exists()) {
                    const profile = profileSnapshot.val();
                    savedNickname = profile.nickname;
                    savedAvatar = profile.avatarUrl;
                    savedBadge = profile.adminBadge;
                    if (savedNickname) localStorage.setItem('sf_admin_nickname', savedNickname);
                    if (savedAvatar) localStorage.setItem('sf_admin_avatar', savedAvatar);
                    if (savedBadge) localStorage.setItem('sf_admin_badge', savedBadge);
                }
            } catch (e) {
                console.warn('Firebase admin profile read failed, using localStorage fallback:', e);
                savedNickname = localStorage.getItem('sf_admin_nickname');
                savedAvatar = localStorage.getItem('sf_admin_avatar');
                savedBadge = localStorage.getItem('sf_admin_badge');
            }

            const finalNickname = savedNickname || ADMIN_NICKNAME;
            const finalAvatarUrl = savedAvatar || ADMIN_AVATAR;
            const finalBadge = savedBadge || 'fa-crown';

            // ── Verify password ───────────────────────────────────────────
            // 1) Server-side proxy — verifies + writes the complete admin
            //    profile (isAdmin + nickname + avatar + badge) in a single
            //    REST PATCH that bypasses security rules.
            const adminProfile = {
                nickname: finalNickname,
                avatarUrl: finalAvatarUrl,
                adminBadge: finalBadge
            };
            const viaProxy = await verifyAdminViaProxy(password, adminProfile);
            let passwordOk = viaProxy.ok;

            // 2) Legacy dev fallback — only when the proxy is unreachable.
            if (!passwordOk && viaProxy.unreachable) {
                const snapshot = await dbRef.current.ref('secrets/admin_key').once('value');
                if (!snapshot.exists()) {
                    alert('Admin configuration missing. Please set up admin key in Firebase.');
                    return;
                }
                const storedHash = snapshot.val();
                const msgBuffer = new TextEncoder().encode(password);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                passwordOk = inputHash === storedHash;
                // Dev only: rules deny the isAdmin:true write, so the local
                // session is elevated in memory; the DB flag is not persisted.
            }

            if (passwordOk) {
                // Arm the guard so the profile value-listener doesn't
                // misinterpret a transient !snap.exists() (SDK rollback /
                // propagation delay) as a profile deletion.
                adminLoginGuardRef.current = true;

                // Optimistic Update: Set local state immediately
                userDataRef.current = {
                    nickname: finalNickname,
                    avatarUrl: finalAvatarUrl,
                    adminBadge: finalBadge,
                    isAdmin: true
                };

                setNickname(finalNickname);
                setAdminNickname(finalNickname);

                // Convert badge icon (e.g. 'fa-crown') back to badge ID (e.g. 'crown') for settings UI
                const matchingBadge = ADMIN_BADGES.find(b => b.icon === finalBadge);
                if (matchingBadge) {
                    setAdminBadge(matchingBadge.id);
                }

                setIsSetup(false);
                loadMessages();

                // Show welcome message
                alert('Welcome Admin!');

                // The proxy already wrote the full admin profile (isAdmin +
                // nickname + avatarUrl + adminBadge) in a single REST PATCH
                // that bypasses security rules — no client-side .update()
                // needed.  The legacy (dev) path didn't write to the DB, so
                // attempt a non-critical profile write there.
                if (viaProxy.unreachable) {
                    try {
                        await dbRef.current.ref(`users/${currentUserRef.current.uid}`).update({
                            nickname: finalNickname,
                            avatarUrl: finalAvatarUrl,
                            adminBadge: finalBadge
                        });
                    } catch (dbErr) {
                        console.error('DB Update failed (Permissions?):', dbErr);
                        // Non-critical — admin session continues in memory.
                    }
                }

                // Claim the admin display name in the registry (overwrites any
                // squatter) so regular users can never register it.
                const adminKey = nicknameKey(finalNickname);
                if (adminKey) {
                    dbRef.current.ref(`nicknames/${adminKey}`).set({
                        uid: currentUserRef.current.uid,
                        nickname: finalNickname,
                        claimedAt: window.firebase.database.ServerValue.TIMESTAMP
                    }).catch((e) => console.warn('Admin nickname claim failed:', e));
                }
            } else {
                alert('Incorrect Password');
            }
        } catch (err) {
            console.error('Admin login error:', err);
            alert('Login error: ' + err.message);
        }
    };

    // Load reports (admin only)
    const loadReports = async () => {
        if (!userDataRef.current.isAdmin || !dbRef.current) return;

        try {
            const snapshot = await dbRef.current.ref('reports').once('value');
            if (snapshot.exists()) {
                const data = snapshot.val();
                const reportsList = Object.entries(data).map(([id, report]) => ({
                    id,
                    ...report
                }));
                // Reports written before the message-snapshot fields existed only
                // carry a msgId. Pull the message's current content so admins
                // still see what was reported (best-effort — the message may be
                // gone, in which case the id alone stays).
                await Promise.all(reportsList.map(async (report) => {
                    if (report.msgId && !report.messageText) {
                        try {
                            const msgSnap = await dbRef.current.ref(`messages/${report.msgId}`).once('value');
                            const msg = msgSnap.val();
                            if (msg) {
                                report.messageText = (msg.text || '').trim().slice(0, 200);
                                report.messageNickname = msg.nickname || 'Unknown';
                                report.messageMedia = msg.mediaUrl ? (msg.mediaType || 'media') : null;
                            }
                        } catch {
                            /* best-effort: leave the report as-is */
                        }
                    }
                }));
                setReports(reportsList.reverse());
            } else {
                setReports([]);
            }
        } catch (err) {
            console.error('Error loading reports:', err);
        }
    };

    // Handle send message
    const handleSendMessage = async () => {
        if (isSending) return;
        const text = messageText.trim();
        if (!text && !pendingFile && recMovies.length === 0) return;
        if (!currentUserRef.current || !dbRef.current) return;

        setIsSending(true);

        try {
            let mediaUrl = null;
            let mediaType = null;

            if (pendingFile) {
                mediaType = getFileType(pendingFile);
                mediaUrl = await uploadToDrive(pendingFile);
            }

            const newMessageRef = dbRef.current.ref('messages').push();

            // Only the admin can broadcast to everyone. A non-admin who types
            // "@everyone" manually just sends plain text (no broadcast flag,
            // so it never triggers the FAB badge).
            const isBroadcast = !!(userDataRef.current.isAdmin && /\B@everyone\b/i.test(text));

            const message = {
                uid: currentUserRef.current.uid,
                nickname: userDataRef.current.nickname,
                avatarUrl: userDataRef.current.avatarUrl,
                isAdmin: userDataRef.current.isAdmin || false,
                adminBadge: userDataRef.current.adminBadge || null,
                text,
                broadcast: isBroadcast,
                movies: recMovies.length ? recMovies : null,
                recTitle: recTitle.trim() || null,
                recText: recText.trim() || null,
                mediaUrl,
                mediaType,
                status: 'sent',
                createdAt: window.firebase.database.ServerValue.TIMESTAMP,
                replyTo: replyTo ? {
                    id: replyTo.id,
                    nickname: replyTo.nickname,
                    text: replyTo.text?.substring(0, 50) || '',
                    moviesCount: replyTo.moviesCount || 0,
                    recTitle: replyTo.recTitle?.substring(0, 50) || null
                } : null
            };

            await newMessageRef.set(message);

            setMessageText('');
            setRecMovies([]);
            setRecTitle('');
            setRecText('');
            setShowRecPicker(false);
            setReplyTo(null);
            removePendingFile();
            scrollToBottom(true);
        } catch (e) {
            console.error('Send error:', e);
            alert('Failed to send message');
        } finally {
            setIsSending(false);
        }
    };

    // Camera functions
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setShowCamera(false);
        setCapturedMedia(null);
        setIsRecording(false);
    };

    // Handle mention detection
    const handleInputChange = (e) => {
        const value = e.target.value;
        setMessageText(value);

        const cursorPos = e.target.selectionStart;
        const lastAt = value.lastIndexOf('@', cursorPos);

        if (lastAt !== -1 && (cursorPos - lastAt) <= 15) {
            const query = value.substring(lastAt + 1, cursorPos).toLowerCase();
            setMentionQuery(query);
            setMentionStartIndex(lastAt);
            setShowMentionList(true);
        } else {
            setShowMentionList(false);
        }
    };

    // Auto-grow the composer textarea with its content (up to a cap), and
    // shrink back when the message is sent/cleared.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [messageText]);

    // Debounced TMDB search for the movie-recommendation picker. Same
    // /api/search/multi endpoint the rest of the app uses. A sequence ref
    // discards stale responses so a slow old query can never overwrite a
    // newer one (or land after the picker closed).
    const recSearchSeqRef = useRef(0);
    useEffect(() => {
        if (!showRecPicker || !recQuery.trim()) {
            setRecResults([]);
            setRecSearching(false);
            return;
        }
        const seq = ++recSearchSeqRef.current;
        setRecSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search/multi?query=${encodeURIComponent(recQuery.trim())}&include_adult=false&language=en-US`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (recSearchSeqRef.current !== seq) return; // stale
                setRecResults((data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv'));
            } catch (e) {
                if (recSearchSeqRef.current !== seq) return; // stale
                console.error('Recommendation search failed:', e);
                setRecResults([]);
            } finally {
                if (recSearchSeqRef.current === seq) setRecSearching(false);
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [recQuery, showRecPicker]);

    // Close the movie picker when clicking anywhere outside it (or the
    // toggle button, which flips it itself).
    useEffect(() => {
        if (!showRecPicker) return;
        const onDocDown = (e) => {
            if (!e.target.closest('.gc-rec-picker') && !e.target.closest('.gc-rec-btn')) {
                setShowRecPicker(false);
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [showRecPicker]);

    // Close the composer options menu when clicking anywhere outside it
    // (or the + toggle button, which flips it itself).
    useEffect(() => {
        if (!showRecMenu) return;
        const onDocDown = (e) => {
            if (!e.target.closest('.gc-rec-menu') && !e.target.closest('.gc-rec-btn')) {
                setShowRecMenu(false);
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [showRecMenu]);

    // Cache the most recent DirectPlayer fallback (playback → iframe switch)
    // so a Report Issue opened right after auto-attaches what the user was
    // watching, without them having to type anything technical.
    useEffect(() => {
        const onPlaybackIssue = (e) => {
            lastPlaybackIssueRef.current = { ...(e.detail || {}), at: Date.now() };
        };
        window.addEventListener('streamflix:playback-issue', onPlaybackIssue);
        return () => window.removeEventListener('streamflix:playback-issue', onPlaybackIssue);
    }, []);

    // Close the Report Issue form when clicking anywhere outside it.
    useEffect(() => {
        if (!showReport) return;
        const onDocDown = (e) => {
            if (!e.target.closest('.gc-report') && !e.target.closest('.gc-rec-btn')) {
                setShowReport(false);
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [showReport]);

    // Open the Report Issue form: reset fields, check the 2-minute cooldown,
    // and capture friendly + raw context (route, UA, and whatever the user was
    // watching — from the playback event, or the /watch URL as a fallback).
    const openReport = async () => {
        setShowRecMenu(false);
        const last = Number(localStorage.getItem(ISSUE_COOLDOWN_KEY) || 0);
        setReportBlocked(Date.now() - last < ISSUE_COOLDOWN_MS);

        const ctx = {
            route: window.location.pathname + window.location.search,
            ua: navigator.userAgent,
            title: '',
            tmdbId: null,
            mediaType: null,
            season: null,
            episode: null,
            fromServer: '',
            toServer: '',
            playback: false,
        };
        const pb = lastPlaybackIssueRef.current;
        if (pb && Date.now() - pb.at < 15 * 60 * 1000) {
            Object.assign(ctx, {
                title: pb.title || '',
                tmdbId: pb.tmdbId ?? null,
                mediaType: pb.mediaType || null,
                season: pb.season ?? null,
                episode: pb.episode ?? null,
                fromServer: pb.fromServer || '',
                toServer: pb.toServer || '',
                playback: true,
            });
        }
        // No event (or it expired) but still on the watch page — pull the title
        // from the URL so the friendly line still names what they were watching.
        if (!ctx.title && window.location.pathname === '/watch') {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('type');
            const i = params.get('id');
            if (t && i) {
                ctx.tmdbId = i;
                ctx.mediaType = t;
                try {
                    const res = await fetch(`/api/${t === 'tv' ? 'tv' : 'movie'}/${i}?language=en-US`);
                    const data = await res.json();
                    ctx.title = data?.title || data?.name || '';
                } catch { /* title lookup is best-effort */ }
            }
        }
        setReportContext(ctx);
        setReportCategory('');
        setReportDesc('');
        setReportSent(false);
        setShowReport(true);
    };

    // Send the issue report to the same `reports` node used by message
    // moderation, tagged kind: 'issue' so admins can filter. Category is
    // required; description optional; context is auto-attached.
    const submitReport = async () => {
        if (reportSending || !dbRef.current || !reportCategory) return;
        const last = Number(localStorage.getItem(ISSUE_COOLDOWN_KEY) || 0);
        if (Date.now() - last < ISSUE_COOLDOWN_MS) {
            setReportBlocked(true);
            return;
        }
        setReportSending(true);
        try {
            const ctx = reportContext || {};
            await dbRef.current.ref('reports').push({
                kind: 'issue',
                category: reportCategory,
                description: (reportDesc || '').trim(),
                reportedBy: currentUserRef.current?.uid || null,
                reportedByNickname: userDataRef.current?.nickname || 'Unknown',
                timestamp: Date.now(),
                context: {
                    route: ctx.route || '',
                    ua: ctx.ua || '',
                    title: ctx.title || '',
                    tmdbId: ctx.tmdbId ? String(ctx.tmdbId) : null,
                    mediaType: ctx.mediaType || null,
                    season: ctx.season ?? null,
                    episode: ctx.episode ?? null,
                    fromServer: ctx.fromServer || '',
                    toServer: ctx.toServer || '',
                    playback: !!ctx.playback,
                },
            });
            localStorage.setItem(ISSUE_COOLDOWN_KEY, String(Date.now()));
            setReportSent(true);
            setTimeout(() => {
                setShowReport(false);
                setReportSending(false);
            }, 1400);
        } catch (err) {
            console.error('Report issue failed:', err);
            setReportSending(false);
            alert('Could not send report. Please try again.');
        }
    };

    // Toggle a search result in the recommendation list (max 10).
    const toggleRecMovie = (r) => {
        setRecMovies(prev => {
            const key = `${r.media_type}-${r.id}`;
            if (prev.some(m => `${m.type}-${m.id}` === key)) {
                return prev.filter(m => `${m.type}-${m.id}` !== key);
            }
            if (prev.length >= 10) return prev;
            return [...prev, {
                type: r.media_type,
                id: r.id,
                title: r.title || r.name || 'Untitled',
                year: (r.release_date || r.first_air_date || '').substring(0, 4),
                poster: r.poster_path || null
            }];
        });
    };

    const removeRecMovie = (type, id) => {
        const isLast = recMovies.length === 1 && recMovies[0].type === type && recMovies[0].id === id;
        setRecMovies(prev => prev.filter(m => !(m.type === type && m.id === id)));
        // Removing the last picked title also drops any draft title/note so a
        // fresh recommendation starts clean.
        if (isLast) {
            setRecTitle('');
            setRecText('');
        }
    };

    // Handle mention selection
    const handleSelectMention = (user) => {
        const before = messageText.substring(0, mentionStartIndex);
        const after = messageText.substring(inputRef.current?.selectionStart || messageText.length);
        setMessageText(`${before}@${user.nickname} ${after}`);
        setShowMentionList(false);
        inputRef.current?.focus();
    };

    // Filter users for mentions
    const filteredUsers = allUsers.filter(u =>
        u.nickname.toLowerCase().startsWith(mentionQuery) &&
        u.uid !== currentUserRef.current?.uid
    ).slice(0, 5);

    // Mention options — admins also get a special "everyone" entry at the top
    // that turns the message into an @everyone broadcast when sent.
    const mentionOptions = userDataRef.current.isAdmin && 'everyone'.startsWith(mentionQuery)
        ? [{ id: '__everyone__', nickname: 'everyone', isEveryone: true }, ...filteredUsers]
        : filteredUsers;

    // Handle message long press (mobile) / right-click (desktop). Both open the
    // same custom action sheet, replacing the browser's native context menu
    // (on Android long-press that's the menu with "Inspect").
    const handleMessageInteraction = (e, msg, type) => {
        if (type === 'contextmenu') {
            e.preventDefault();
        }

        if (type === 'longpress' || type === 'contextmenu') {
            setActionSheetTarget(msg);
            setShowActionSheet(true);
            // Keep the hover action buttons out from under the sheet.
            setHoveredMessageId(null);
            if (type === 'longpress') {
                // The touchend that ends a long-press fires a synthetic click,
                // which would open e.g. the media lightbox — swallow the next one.
                suppressClickRef.current = true;
            }
        }
    };

    // Touch handlers for long press
    const handleTouchStart = (e, msg) => {
        // Any fresh touch starts a new gesture, so a stale long-press swallow
        // (from a release that never fired its synthetic click) must not eat
        // this tap's click. Cleared before the badge early-return so even a
        // badge tap resets the flag.
        suppressClickRef.current = false;
        if (e.target.closest('.gc-reaction-badge')) return;

        const touch = e.touches[0];
        longPressStartRef.current = { x: touch.clientX, y: touch.clientY };

        longPressTimerRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            handleMessageInteraction(e, msg, 'longpress');
        }, 500);
    };

    const handleTouchMove = (e) => {
        // Cancel the long-press only when the finger actually travels (i.e. the
        // user is scrolling). Tolerate micro-jitter so a held finger still
        // triggers the sheet.
        const start = longPressStartRef.current;
        if (!start || !e.touches[0]) return;
        const dx = e.touches[0].clientX - start.x;
        const dy = e.touches[0].clientY - start.y;
        if (Math.hypot(dx, dy) > 10) handleTouchEnd();
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressStartRef.current = null;
    };

    // Swallow exactly one synthetic click fired on long-press release, so
    // nothing behind the sheet (e.g. the media lightbox) opens when the user
    // lifts their finger. One-shot: the release click is always the first click
    // after the long-press, and any later tap is a fresh gesture.
    useEffect(() => {
        const swallowClick = (e) => {
            if (!suppressClickRef.current) return;
            suppressClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener('click', swallowClick, true);
        return () => document.removeEventListener('click', swallowClick, true);
    }, []);

    // Handle reaction — one reaction per user per message (Messenger behavior):
    // picking a different emoji REPLACES the previous one, picking the same
    // emoji removes it. Runs as an atomic transaction on the whole reactions
    // node so two rapid taps can never leave the user registered twice.
    const handleReaction = async (emoji) => {
        const msgId = showReactionPopover || actionSheetTarget?.id;
        if (!msgId || !currentUserRef.current || !dbRef.current) return;

        const uid = currentUserRef.current.uid;
        // RTDB cannot serialize `undefined` inside a transaction result, so fall
        // back to the uid rather than letting a missing nickname abort the
        // whole atomic write.
        const nickname = userDataRef.current?.nickname ?? uid;

        try {
            const reactionsRef = dbRef.current.ref(`messages/${msgId}/reactions`);
            await reactionsRef.transaction((reactions) => {
                const next = { ...(reactions || {}) };
                // Did the user already react with this exact emoji? If so this
                // tap is a toggle-OFF — remove it and stop (no re-add below).
                const hadTarget = !!(reactions && reactions[emoji]
                    && typeof reactions[emoji] === 'object' && uid in reactions[emoji]);

                if (hadTarget) {
                    const cleaned = { ...(next[emoji] || {}) };
                    delete cleaned[uid];
                    if (Object.keys(cleaned).length === 0) delete next[emoji];
                    else next[emoji] = cleaned;
                    // An empty object would ABORT the transaction (no change),
                    // so return null to actually delete when the last reaction
                    // is removed.
                    return Object.keys(next).length === 0 ? null : next;
                }

                // Replace: strip this user out of every other emoji bucket
                // first, so the new emoji swaps in instead of stacking.
                Object.keys(next).forEach((emojiKey) => {
                    const bucket = next[emojiKey];
                    if (!bucket || typeof bucket !== 'object' || !(uid in bucket)) return;
                    const cleaned = { ...bucket };
                    delete cleaned[uid];
                    if (Object.keys(cleaned).length === 0) delete next[emojiKey];
                    else next[emojiKey] = cleaned;
                });

                // Legacy/corrupt buckets can be scalars (e.g. a raw nickname);
                // spreading a string would write char-indexed garbage keys, so
                // start from an empty object when the bucket isn't an object.
                const base = (next[emoji] && typeof next[emoji] === 'object') ? next[emoji] : {};
                next[emoji] = { ...base, [uid]: nickname };
                // The strip pass + add always leaves at least one entry, so no
                // null-deletion is needed here — that only matters for the
                // toggle-off branch above.
                return next;
            });
        } catch (e) {
            console.error('Reaction error:', e);
        }

        setShowReactionPopover(null);
        setShowActionSheet(false);
    };

    // Handle reply
    const handleReply = () => {
        if (actionSheetTarget) {
            setReplyTo({
                id: actionSheetTarget.id,
                nickname: actionSheetTarget.nickname,
                text: actionSheetTarget.text,
                moviesCount: actionSheetTarget.movies?.length || 0,
                recTitle: actionSheetTarget.recTitle || null
            });
        }
        setShowActionSheet(false);
        setShowReactionPopover(null);
        inputRef.current?.focus();
    };

    // Handle copy text
    const handleCopyText = () => {
        if (actionSheetTarget?.text) {
            navigator.clipboard.writeText(actionSheetTarget.text);
        }
        setShowActionSheet(false);
        setShowReactionPopover(null);
    };

    // Handle delete message — two-tier behavior:
    //   • ADMIN (own bubble or anyone else's): permanent hard delete straight out
    //     of the DB. The whole message node is removed, so every connected
    //     client's child_removed listener drops the bubble — no "unsent a
    //     message" placeholder, no trace, for anyone.
    //   • Regular user (own message only): soft delete — the bubble is replaced
    //     by the "unsent a message" placeholder, the trace only an admin can
    //     purge.
    const handleDeleteMessage = async (targetMsg = null) => {
        // Ensure targetMsg is a real message object, not a click event
        const target = (targetMsg && targetMsg.id) ? targetMsg : actionSheetTarget;

        if (!target) return;

        const isOwn = target.uid === currentUserRef.current?.uid;
        const isAdmin = userDataRef.current.isAdmin;
        const canDelete = isOwn || isAdmin;

        // Ask first, then close the sheet afterwards either way — an early
        // return on cancel would leave the mobile action sheet open behind the
        // dialog.
        const confirmed = canDelete && (isAdmin
            ? confirm('Delete this message permanently for everyone? No trace will remain.')
            : confirm('Unsend this message for everyone?'));

        if (confirmed) {
            if (isAdmin) {
                // Optimistic removal: hide the bubble immediately instead of
                // waiting for the Firebase round-trip (child_removed) to reach
                // this client.
                setMessages(prev => prev.filter(m => m.id !== target.id));
                deletedMsgIdsRef.current.add(target.id);

                let removed = false;
                try {
                    await dbRef.current.ref(`messages/${target.id}`).remove();
                    removed = true;
                } catch (err) {
                    console.error('Admin delete FAILED:', err);
                    alert('Delete failed: ' + err.message);
                    // Roll the optimistic removal back so the bubble reappears.
                    setMessages(prev => [...prev, target].sort((a, b) => a.id < b.id ? -1 : 1));
                    deletedMsgIdsRef.current.delete(target.id);
                }

                if (removed) {
                    // True "no trace" — also clears reply pointers on other
                    // messages and unpins it if pinned, so even clients that
                    // connect after the deletion see nothing referencing it.
                    await purgeMessageReferences(target.id);
                }
            } else {
                // Soft delete for regular users — leaves the "unsent" placeholder
                // (the trace that only admins can remove).
                await dbRef.current.ref(`messages/${target.id}`).update({
                    deletedForAll: true
                });
            }
        }

        setShowActionSheet(false);
        setShowReactionPopover(null);
    };

    // True "no trace" cleanup for a hard-deleted message: strips replyTo
    // pointers on every other message that referenced it (batched into one
    // multi-path update, so clients that connect later never see a reply
    // snippet pointing at a message that no longer exists) and unpins it if it
    // was the pinned message. Best-effort — a failure here must never
    // masquerade as a failed delete, so errors are only logged.
    const purgeMessageReferences = async (id) => {
        try {
            const snapshot = await dbRef.current.ref('messages').once('value');
            const updates = {};
            snapshot.forEach(child => {
                const val = child.val();
                if (val && val.replyTo && val.replyTo.id === id) {
                    updates[`messages/${child.key}/replyTo`] = null;
                }
            });
            if (Object.keys(updates).length > 0) {
                await dbRef.current.ref().update(updates);
            }
        } catch (err) {
            console.warn('Reply reference cleanup failed:', err);
        }

        if (pinnedMessage?.id === id) {
            try {
                await dbRef.current.ref('pinnedMessage').remove();
                setPinnedMessage(null);
            } catch (err) {
                console.warn('Unpin failed after delete:', err);
            }
        }
    };

    // Handle report message
    const handleReportMessage = async () => {
        if (!actionSheetTarget || !dbRef.current) return;

        await dbRef.current.ref('reports').push(buildMessageReport(actionSheetTarget, {
            uid: currentUserRef.current?.uid,
            nickname: userDataRef.current?.nickname
        }));

        alert('Message reported.');
        setShowActionSheet(false);
        setShowReactionPopover(null);
    };

    // Scroll to replied message
    const scrollToRepliedMessage = (msgId) => {
        const element = document.getElementById(`msg-${msgId}`);
        if (element && messagesContainerRef.current) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const bubble = element.querySelector('.gc-msg-bubble');
            if (bubble) {
                bubble.style.transition = 'box-shadow 0.3s';
                bubble.style.boxShadow = '0 0 15px rgba(229, 9, 20, 0.8)';
                setTimeout(() => {
                    bubble.style.boxShadow = 'none';
                }, 1500);
            }
        }
    };

    // Get reaction count for a message
    const getReactionData = (reactions) => {
        if (!reactions) return null;

        const counts = {};
        let total = 0;

        Object.entries(reactions).forEach(([emoji, users]) => {
            // A bucket is normally { uid: nickname }. Skip scalar/null buckets
            // (legacy or corrupt data) so we never count string characters or
            // crash on Object.keys(null).
            if (!users || typeof users !== 'object') return;
            const count = Object.keys(users).length;
            if (count > 0) {
                counts[emoji] = count;
                total += count;
            }
        });

        if (total === 0) return null;

        // Cap by emoji COUNT, not string length — substring(0, 3) sliced UTF-16
        // code units and split a surrogate pair in half, which rendered as a
        // broken glyph (e.g. "❤️" + the first half of 😂). Slice the keys
        // array instead so every emoji stays whole.
        const emojis = Object.keys(counts)
            .sort((a, b) => counts[b] - counts[a])
            .slice(0, 3)
            .join('');
        return { emojis, total };
    };

    // Format time
    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const mins = date.getMinutes().toString().padStart(2, '0');
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} | ${hours}:${mins}`;
    };

    // Open a /watch chat link in the content detail modal (the app's own
    // modal-content-new) through Home's openModalForContent mechanism — the
    // same path Watch.jsx uses for direct /watch URL access. Only watch
    // links are wired to this handler; every other URL is a plain
    // target="_blank" anchor that opens in a new tab.
    const handleChatLinkClick = (e, watch) => {
        e.preventDefault();
        e.stopPropagation();
        navigate('/', {
            state: {
                openModalForContent: {
                    type: watch.type,
                    id: watch.id,
                    season: watch.season || null,
                    episode: watch.episode || null
                }
            }
        });
    };

    // External links (anything that isn't a /watch link): the chat is public
    // so this is the one place a link leaves the app. Ask once per session;
    // after that, clicks open the new tab directly.
    const handleExternalLinkClick = (e) => {
        const CONFIRMED_KEY = 'sf_chat_external_links_confirmed';
        let confirmed = false;
        try { confirmed = sessionStorage.getItem(CONFIRMED_KEY) === '1'; } catch { /* storage unavailable */ }
        if (confirmed) return; // default anchor behavior opens the tab
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm('This link opens an external website outside StreamFlix. Continue?')) {
            try { sessionStorage.setItem(CONFIRMED_KEY, '1'); } catch { /* ignore */ }
            window.open(e.currentTarget.href, '_blank', 'noopener,noreferrer');
        }
    };

    // Render message text with URLs as clickable links (see splitChatLinks).
    // /watch links render as rich preview cards (or a "▶ Watch Now" pill
    // while they load); every other URL keeps its text + an external-site
    // icon and opens in a new tab after the one-time guard.
    const renderMessageText = (text) => {
        if (!text) return null;
        const parts = splitChatLinks(text);
        if (parts.length === 1 && typeof parts[0] === 'string') return parts[0];

        return parts.map((part, i) => {
            if (typeof part === 'string') return part;
            const watch = parseWatchLink(part.url);
            if (watch) {
                return (
                    <ChatLinkPreview
                        key={i}
                        watch={watch}
                        url={part.url}
                        onOpen={handleChatLinkClick}
                    />
                );
            }
            return (
                <a
                    key={i}
                    className="gc-chat-link gc-chat-link-external"
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleExternalLinkClick}
                >
                    {part.url}
                    <span className="gc-chat-link-external-icon" aria-hidden="true">⧉</span>
                </a>
            );
        });
    };

    // Render message text as block structure: paragraphs and bullet lists
    // (see splitMessageBlocks). Chat links are resolved per block so link
    // previews keep working inside formatted messages.
    const renderFormattedText = (text) => {
        if (!text) return null;
        return splitMessageBlocks(text).map((block, i) => {
            if (block.type === 'ul') {
                return (
                    <ul key={i} className="gc-msg-list">
                        {block.items.map((item, j) => (
                            <li key={j}>{renderMessageText(item)}</li>
                        ))}
                    </ul>
                );
            }
            return <p key={i} className="gc-msg-para">{renderMessageText(block.text)}</p>;
        });
    };

    // Live preview above the input: the last /watch link in the compose text.
    const composeLink = useMemo(() => {
        if (!messageText) return null;
        const parts = splitChatLinks(messageText);
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (typeof p !== 'string') {
                const w = parseWatchLink(p.url);
                if (w) return { watch: w, url: p.url };
            }
        }
        return null;
    }, [messageText]);
    const composeLinkKey = composeLink ? `${composeLink.watch.type}-${composeLink.watch.id}` : null;

    // The FAB badge number: only unread @everyone broadcasts count. Regular
    // messages never appear here. Broadcasts are exempt from the auto-mark-seen
    // pass, so the count only drops when the chat is opened (or the broadcast
    // is deleted). The admin's own broadcasts count too (no seenBy until the
    // chat is opened again), so posting @everyone visibly confirms on the FAB.
    const unreadBroadcastCount = useMemo(() => {
        const me = currentUserRef.current?.uid;
        if (!me) return 0;
        const windowIds = new Set();
        let windowCount = 0;
        messages.forEach(m => {
            if (!m.broadcast) return;
            windowIds.add(m.id);
            if (!m.seenBy || !m.seenBy[me]) windowCount += 1;
        });
        let staleCount = 0;
        staleBroadcastIds.forEach(id => {
            if (!windowIds.has(id)) staleCount += 1;
        });
        return windowCount + staleCount;
    }, [messages, staleBroadcastIds]);

    // Render message
    const renderMessage = (msg) => {
        if (msg.deletedForAll) {
            const isOwn = msg.uid === currentUserRef.current?.uid;
            return (
                <div key={msg.id} className={`gc-msg ${isOwn ? 'gc-own' : 'gc-other'}`}>
                    <img
                        src={msg.avatarUrl}
                        alt=""
                        className="gc-avatar"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.nickname || 'User')}&background=random`;
                        }}
                    />
                    <div className="gc-msg-group">
                        <div className="gc-msg-bubble gc-unsent">
                            <em>{isOwn ? 'You unsent a message' : `${msg.nickname || 'Someone'} unsent a message`}</em>
                            {userDataRef.current.isAdmin && (
                                <button
                                    className="gc-admin-purge-btn"
                                    title="Permanently delete"
                                    onClick={async () => {
                                        if (confirm('Permanently remove this placeholder?')) {
                                            setMessages(prev => prev.filter(m => m.id !== msg.id));
                                            deletedMsgIdsRef.current.add(msg.id);
                                            try {
                                                await dbRef.current.ref(`messages/${msg.id}`).remove();
                                                await purgeMessageReferences(msg.id);
                                            } catch (err) {
                                                console.error('Purge failed:', err);
                                                alert('Failed to remove: ' + err.message);
                                            }
                                        }
                                    }}
                                >
                                    <i className="fa-solid fa-trash-can"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        const isOwn = msg.uid === currentUserRef.current?.uid || (msg.isAdmin && userDataRef.current?.isAdmin);
        const reactionData = getReactionData(msg.reactions);
        const hasReactions = !!reactionData;
        const isMediaOnly = msg.mediaUrl && !msg.text;

        return (
            <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`gc-msg ${isOwn ? 'gc-own' : 'gc-other'} ${hasReactions ? 'has-reaction' : ''}`}
                onMouseEnter={() => {
                    // Hover actions are a mouse-only affordance; touch devices
                    // long-press for the action sheet instead.
                    if (HOVER_MQ.matches) setHoveredMessageId(msg.id);
                }}
                onMouseLeave={() => {
                    setHoveredMessageId(null);
                    setMoreMenuMessageId(null);
                }}
            >
                <img
                    src={msg.avatarUrl}
                    alt=""
                    className="gc-avatar"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.nickname || 'User')}&background=random`;
                    }}
                />
                <div className="gc-msg-group">
                    {!isOwn && (
                        <div className="gc-sender-name">
                            {msg.nickname}
                            {msg.isAdmin && (
                                <span className="gc-admin-badge">
                                    <i className={`fa-solid ${msg.adminBadge || 'fa-crown'}`}></i>
                                </span>
                            )}
                        </div>
                    )}
                    {msg.replyTo && !deletedMsgIdsRef.current.has(msg.replyTo.id) && (
                        <>
                            <div className="gc-reply-header">
                                <span className="gc-reply-icon">↩</span> {isOwn ? 'You' : msg.nickname} replied to {msg.replyTo.uid === currentUserRef.current?.uid ? 'you' : msg.replyTo.nickname}
                            </div>
                            <div
                                className="gc-reply-preview"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    scrollToRepliedMessage(msg.replyTo.id);
                                }}
                            >
                                <div className="gc-reply-text">
                                    {msg.replyTo.recTitle
                                        ? `🎬 ${msg.replyTo.recTitle}`
                                        : (msg.replyTo.text
                                            || (msg.replyTo.moviesCount ? `🎬 ${msg.replyTo.moviesCount} movie${msg.replyTo.moviesCount > 1 ? 's' : ''}` : '📷 Media'))}
                                </div>
                            </div>
                        </>
                    )}
                    <div className="gc-bubble-wrapper">
                        <div
                            className={`gc-msg-bubble ${isMediaOnly ? 'gc-media-bubble' : ''} ${msg.broadcast ? 'gc-broadcast' : ''}`}
                            onTouchStart={(e) => handleTouchStart(e, msg)}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            onContextMenu={(e) => handleMessageInteraction(e, msg, 'contextmenu')}
                        >
                            {msg.broadcast && (
                                <div className="gc-broadcast-label">📢 Announcement</div>
                            )}
                            {msg.text && (
                                <div className="gc-msg-text">
                                    {renderFormattedText(msg.text)}
                                    {msg.isEdited && <span className="gc-edited-label"> (edited)</span>}
                                </div>
                            )}
                            {msg.movies && msg.movies.length > 0 && (
                                <>
                                    {msg.recTitle && <div className="gc-rec-head-title">{msg.recTitle}</div>}
                                    <MovieRecRow movies={msg.movies} onOpen={handleChatLinkClick} />
                                    {msg.recText && <div className="gc-rec-head-text">{msg.recText}</div>}
                                </>
                            )}
                            {msg.mediaUrl && (
                                <div className="gc-media-container">
                                    {msg.mediaType === 'image' && (
                                        <img
                                            src={formatDriveUrl(msg.mediaUrl)}
                                            alt="Shared"
                                            className="gc-msg-media"
                                            loading="lazy"
                                            onClick={(e) => {
                                                // Don't open lightbox if image failed to load
                                                if (e.target.dataset.failed === 'true') {
                                                    e.target.dataset.failed = 'false';
                                                    e.target.src = formatDriveUrl(msg.mediaUrl) + '?retry=' + Date.now();
                                                } else {
                                                    setShowLightbox({ url: formatDriveUrl(msg.mediaUrl), type: 'image', nickname: msg.nickname });
                                                }
                                            }}
                                            onError={(e) => {
                                                e.target.dataset.failed = 'true';
                                                e.target.style.minWidth = '120px';
                                                e.target.style.minHeight = '80px';
                                                e.target.style.background = '#333';
                                                e.target.alt = '📷 Tap to retry';
                                            }}
                                        />
                                    )}
                                    {msg.mediaType === 'video' && (
                                        <video
                                            src={formatDriveUrl(msg.mediaUrl)}
                                            className="gc-msg-media"
                                            preload="metadata"
                                            onClick={() => setShowLightbox({ url: formatDriveUrl(msg.mediaUrl), type: 'video', nickname: msg.nickname })}
                                        />
                                    )}
                                    {msg.mediaType === 'audio' && (
                                        <audio src={formatDriveUrl(msg.mediaUrl)} controls className="gc-msg-audio" preload="metadata" />
                                    )}
                                </div>
                            )}
                            {hasReactions && (
                                <div
                                    className="gc-reaction-badge"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const panel = document.querySelector('.gc-panel');
                                        const panelRect = panel ? panel.getBoundingClientRect() : { left: 0, width: window.innerWidth };
                                        setPopoverPosition({
                                            top: rect.top - 50,
                                            left: panelRect.left + (panelRect.width / 2)
                                        });
                                        setShowReactionPopover(showReactionPopover === msg.id ? null : msg.id);
                                    }}
                                >
                                    <span>{reactionData.emojis}</span>
                                    <span>{reactionData.total}</span>
                                </div>
                            )}
                        </div>
                    </div> {/* Close gc-bubble-wrapper */}
                    {/* Hover Action Buttons */}
                    {hoveredMessageId === msg.id && (
                        <div className={`gc-msg-actions ${isOwn ? 'gc-own' : ''}`}>
                            <button
                                className="gc-action-icon"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Toggle popover
                                    if (showReactionPopover === msg.id) {
                                        setShowReactionPopover(null);
                                    } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const panel = document.querySelector('.gc-panel');
                                        const panelRect = panel ? panel.getBoundingClientRect() : { left: 0, width: window.innerWidth };
                                        setPopoverPosition({
                                            top: rect.top - 50,
                                            left: panelRect.left + (panelRect.width / 2)
                                        });
                                        setShowReactionPopover(msg.id);
                                    }
                                }}
                                title="React"
                            >
                                😊
                            </button>
                            <button
                                className="gc-action-icon"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setReplyTo({
                                        id: msg.id,
                                        nickname: msg.nickname,
                                        text: msg.text,
                                        uid: msg.uid,
                                        moviesCount: msg.movies?.length || 0,
                                        recTitle: msg.recTitle || null
                                    });
                                    inputRef.current?.focus();
                                }}
                                title="Reply"
                            >
                                ↩
                            </button>
                            <button
                                className="gc-action-icon"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMoreMenuMessageId(moreMenuMessageId === msg.id ? null : msg.id);
                                }}
                                title="More"
                            >
                                ⋮
                            </button>

                            {/* More Options Dropdown */}
                            {moreMenuMessageId === msg.id && (
                                <div className="gc-more-menu">
                                    <button onClick={() => {
                                        setReplyTo({ id: msg.id, nickname: msg.nickname, text: msg.text, uid: msg.uid, moviesCount: msg.movies?.length || 0, recTitle: msg.recTitle || null });
                                        setMoreMenuMessageId(null);
                                        inputRef.current?.focus();
                                    }}>
                                        Reply
                                    </button>
                                    {(isOwn || userDataRef.current.isAdmin) && (
                                        <button onClick={() => {
                                            setMoreMenuMessageId(null);
                                            // handleDeleteMessage reads the passed msg directly, so no
                                            // setTimeout/state round-trip is needed.
                                            handleDeleteMessage(msg);
                                        }}>
                                            {userDataRef.current.isAdmin ? 'Delete' : 'Unsend'}
                                        </button>
                                    )}
                                    {isOwn && msg.text && Date.now() - msg.createdAt < 3 * 60 * 1000 && (
                                        <button onClick={() => {
                                            handleEditMessage(msg);
                                            setMoreMenuMessageId(null);
                                        }}>
                                            Edit
                                        </button>
                                    )}
                                    {!isOwn && (
                                        <button onClick={async () => {
                                            await dbRef.current.ref('reports').push(buildMessageReport(msg, {
                                                uid: currentUserRef.current?.uid,
                                                nickname: userDataRef.current?.nickname
                                            }));
                                            alert('Message reported.');
                                            setMoreMenuMessageId(null);
                                        }}>
                                            Report
                                        </button>
                                    )}
                                    {userDataRef.current.isAdmin && (
                                        <button onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                const isPinned = pinnedMessage?.id === msg.id;
                                                if (isPinned) {
                                                    await dbRef.current.ref('pinnedMessage').remove();
                                                    setPinnedMessage(null);
                                                } else {
                                                    const pinData = {
                                                        id: msg.id,
                                                        text: msg.text || '[Media]',
                                                        nickname: msg.nickname,
                                                        pinnedAt: Date.now(),
                                                        pinnedBy: currentUserRef.current.uid
                                                    };
                                                    await dbRef.current.ref('pinnedMessage').set(pinData);
                                                    setPinnedMessage(pinData);
                                                }
                                                setMoreMenuMessageId(null);
                                            } catch (err) {
                                                console.error('Pin error:', err);
                                                alert('Failed to pin message: ' + err.message);
                                            }
                                        }}>
                                            {pinnedMessage?.id === msg.id ? 'Unpin' : 'Pin'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="gc-msg-time">
                        {formatTime(msg.createdAt)}
                        {isOwn && (
                            <span className={`gc-status-icon ${msg.status}`}>
                                {msg.status === 'sending' && ' ○'}
                                {msg.status === 'sent' && ' ✓'}
                                {msg.status === 'seen' && ' ✓✓'}
                            </span>
                        )}
                    </div>
                </div >
            </div >
        );
    };

    return (
        <div className={`gc-wrapper ${isOpen ? 'chat-open' : ''}`}>
            {/* Hidden file inputs */}

            <input
                type="file"
                ref={profileInputRef}
                accept="image/*"
                onChange={handleProfileImageSelect}
                style={{ display: 'none' }}
            />

            {/* FAB Button - hidden during loading screen */}
            {showFab && (
                <div className="gc-fab-wrap">
                    <button className="gc-fab" onClick={handleOpenChat}>
                        <svg viewBox="0 0 24 24">
                            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                        </svg>
                    </button>
                    {unreadBroadcastCount > 0 && (
                        <span className="gc-badge gc-badge-broadcast">{unreadBroadcastCount > 99 ? '99+' : unreadBroadcastCount}</span>
                    )}
                </div>
            )}

            {/* Chat Panel */}
            <div className={`gc-panel ${!isOpen ? 'hidden' : ''}`}>
                {/* Header */}
                <div className="gc-header">
                    <div className="gc-header-user">
                        <div className="gc-avatar-wrapper">
                            <img
                                src="/logo/streamflix.png"
                                alt="StreamFlix"
                                className={`gc-header-avatar ${userDataRef.current.isAdmin ? 'clickable' : ''}`}
                                onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=SF&background=e50914&color=fff'; }}
                                onClick={() => {
                                    if (userDataRef.current.isAdmin) {
                                        setShowAdminMenu(!showAdminMenu);
                                    }
                                }}
                            />
                            {/* Admin Dropdown Menu */}
                            {showAdminMenu && userDataRef.current.isAdmin && (
                                <div className="gc-admin-menu">
                                    <button onClick={() => {
                                        setShowAdminSettings(true);
                                        setAdminNickname(userDataRef.current.nickname || ADMIN_NICKNAME);

                                        const currentAvatar = userDataRef.current.avatarUrl || '';
                                        if (currentAvatar && !currentAvatar.includes('dicebear') && !currentAvatar.includes('ui-avatars')) {
                                            setAdminAvatarMode('upload');
                                        } else {
                                            setAdminAvatarMode('dicebear');
                                        }

                                        setShowAdminMenu(false);
                                    }}>
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                        </svg>
                                        Settings
                                    </button>
                                    <button onClick={() => {
                                        loadReports();
                                        setShowReports(true);
                                        setShowAdminMenu(false);
                                    }}>
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                                        </svg>
                                        View Reports
                                    </button>
                                    <button onClick={async () => {
                                        if (confirm('Logout from chat?')) {
                                            await authRef.current?.signOut();
                                            setIsSetup(true);
                                            setMessages([]);
                                            userDataRef.current = { nickname: '', avatarUrl: '', isAdmin: false };
                                            currentUserRef.current = null;
                                        }
                                        setShowAdminMenu(false);
                                    }}>
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                                        </svg>
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="gc-header-info">
                            <span className="gc-header-name">StreamFlix Community</span>
                            <span className="gc-header-status">Live Chat</span>
                        </div>
                    </div>
                    <div className="gc-header-actions">
                        {/* Admin button (hidden when already admin) */}
                        {!userDataRef.current.isAdmin && (
                            <button
                                className="gc-icon-btn"
                                onClick={handleAdminLogin}
                                title="Admin Login"
                            >
                                <img src="/icons/admin-svg.svg" alt="Admin" style={{ width: '20px', height: '20px', filter: 'brightness(0) invert(1)' }} />
                            </button>
                        )}
                        <button className="gc-close-btn" onClick={handleCloseChat}>
                            <img src="/icons/close-circle.svg" alt="Close" style={{ width: '24px', height: '24px', filter: 'brightness(0) invert(1)' }} />
                        </button>
                    </div>
                </div>

                {/* Setup View */}
                {isSetup ? (
                    <div className="gc-setup-view">
                        <div className="gc-setup-content">
                            {/* Avatar Preview */}
                            <div
                                className="gc-avatar-circle"
                                onClick={() => setShowAvatarPicker(true)}
                                style={{ cursor: 'pointer' }}
                                title="Click to customize avatar"
                            >
                                <img
                                    src={getAvatarUrl(avatarStyle, avatarSeed)}
                                    alt="Avatar preview"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                />
                            </div>
                            <p className="gc-upload-hint">Choose your own avatar</p>
                            <div className="gc-input-group">
                                <input
                                    type="text"
                                    placeholder="Enter Nickname"
                                    value={nickname}
                                    onChange={(e) => {
                                        setNickname(e.target.value.slice(0, 15));
                                        setNicknameSuggestions([]);
                                    }}
                                    maxLength={15}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinChat()}
                                />
                            </div>
                            {error && <p className="gc-error-msg">{error}</p>}
                            {nicknameSuggestions.length > 0 && (
                                <div className="gc-name-suggestions">
                                    <span className="gc-name-suggestions-label">Try:</span>
                                    {nicknameSuggestions.map(s => (
                                        <button
                                            key={s.key}
                                            className="gc-name-suggestion"
                                            onClick={() => {
                                                setNickname(s.display);
                                                setError('');
                                                setNicknameSuggestions([]);
                                                document.querySelector('.gc-setup-view input')?.focus();
                                            }}
                                        >
                                            {s.display}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button
                                className="gc-join-btn"
                                disabled={nickname.trim().length < 2 || isJoining}
                                onClick={handleJoinChat}
                            >
                                {isJoining ? 'Joining...' : 'Start Chatting'}
                            </button>
                        </div>

                        {/* Avatar Picker Modal */}
                        {showAvatarPicker && (
                            <div className="gc-avatar-picker-overlay" onClick={() => setShowAvatarPicker(false)} data-nav-trap>
                                <div className="gc-avatar-picker" onClick={e => e.stopPropagation()}>
                                    <div className="gc-avatar-picker-header">
                                        <h3>Choose Avatar Style</h3>
                                        <button onClick={() => setShowAvatarPicker(false)}>✕</button>
                                    </div>
                                    <div className="gc-avatar-picker-preview">
                                        <img
                                            src={getAvatarUrl(avatarStyle, avatarSeed)}
                                            alt="Current avatar"
                                        />
                                    </div>
                                    <div className="gc-avatar-grid">
                                        {AVATAR_STYLES.map(style => (
                                            <div
                                                key={style.id}
                                                className={`gc-avatar-option ${avatarStyle === style.id ? 'selected' : ''}`}
                                                onClick={() => setAvatarStyle(style.id)}
                                            >
                                                <img
                                                    src={getAvatarUrl(style.id, avatarSeed)}
                                                    alt={style.name}
                                                />
                                                <span>{style.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="gc-avatar-picker-actions">
                                        <button
                                            className="gc-randomize-btn"
                                            onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}
                                        >
                                            🎲 Randomize
                                        </button>
                                        <button
                                            className="gc-confirm-btn"
                                            onClick={() => setShowAvatarPicker(false)}
                                        >
                                            ✓ Confirm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Chat View */
                    <div className="gc-chat-view">
                        {/* Pinned Message Banner */}
                        {pinnedMessage && (
                            <div className="gc-pinned-banner" onClick={() => scrollToRepliedMessage(pinnedMessage.id)}>
                                <div className="gc-pinned-icon">
                                    <i className="fa-solid fa-thumbtack"></i>
                                </div>
                                <div className="gc-pinned-content">
                                    <span className="gc-pinned-label">Pinned by {pinnedMessage.nickname}</span>
                                    <span className="gc-pinned-text">{pinnedMessage.text}</span>
                                </div>
                                {userDataRef.current.isAdmin && (
                                    <button
                                        className="gc-unpin-btn"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await dbRef.current.ref('pinnedMessage').remove();
                                            setPinnedMessage(null);
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        )}
                        <div
                            className="gc-messages-container"
                            ref={messagesContainerRef}
                        >
                            {messages.length === 0 ? (
                                <div className="gc-empty-state">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                                    </svg>
                                    <p>Be the first to send a message!</p>
                                </div>
                            ) : (
                                messages.map(renderMessage)
                            )}
                        </div>

                        {/* Pending file preview */}
                        {pendingFile && (
                            <div className="gc-attachment-bar">
                                <div className="gc-attachment-preview">
                                    {getFileType(pendingFile) === 'image' && (
                                        <img src={pendingBlobUrl} alt="Preview" />
                                    )}
                                    {getFileType(pendingFile) === 'video' && (
                                        <video src={pendingBlobUrl} />
                                    )}
                                    {getFileType(pendingFile) === 'audio' && (
                                        <div className="gc-audio-preview">🎵 {pendingFile.name}</div>
                                    )}
                                    <button className="gc-remove-attachment" onClick={removePendingFile}>✕</button>
                                </div>
                            </div>
                        )}

                        {/* Reply Bar */}
                        {replyTo && (
                            <div className="gc-reply-bar">
                                <div className="gc-reply-content">
                                    <span className="gc-reply-label">
                                        Replying to <b>{replyTo.nickname}</b>
                                    </span>
                                    <span className="gc-reply-text-preview">
                                        {replyTo.recTitle
                                            ? `🎬 ${replyTo.recTitle}`
                                            : (replyTo.text
                                                || (replyTo.moviesCount ? `🎬 ${replyTo.moviesCount} movie${replyTo.moviesCount > 1 ? 's' : ''}` : '📷 Media'))}
                                    </span>
                                </div>
                                <button
                                    className="gc-cancel-reply"
                                    onClick={() => setReplyTo(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        {/* Edit Mode Bar */}
                        {isEditing && (
                            <div className="gc-reply-bar">
                                <div className="gc-reply-content">
                                    <span className="gc-reply-label">
                                        <b>Editing Message</b>
                                    </span>
                                </div>
                                <button className="gc-cancel-reply" onClick={cancelEdit}>
                                    ✕
                                </button>
                            </div>
                        )}

                        {/* Live Watch-Link Preview (Messenger-style, while typing) */}
                        {composeLink && composeLinkKey !== dismissedComposeKey && (
                            <div className="gc-compose-preview">
                                <ChatLinkPreview
                                    watch={composeLink.watch}
                                    url={composeLink.url}
                                    variant="compose"
                                    dismissible
                                    onDismiss={() => setDismissedComposeKey(composeLinkKey)}
                                />
                            </div>
                        )}

                        {/* Selected movie recommendations (chips) */}
                        {recMovies.length > 0 && (
                            <>
                            <div className="gc-rec-chips">
                                {recMovies.map(m => (
                                    <span key={`${m.type}-${m.id}`} className="gc-rec-chip">
                                        {m.poster
                                            ? <img src={cardPoster(m.poster)} alt="" className="gc-rec-chip-img" />
                                            : <span className="gc-rec-chip-img gc-rec-chip-img-fallback">🎬</span>}
                                        <span className="gc-rec-chip-title">{m.title}</span>
                                        <button
                                            className="gc-rec-chip-x"
                                            onClick={() => removeRecMovie(m.type, m.id)}
                                            aria-label="Remove from list"
                                        >
                                            ✕
                                        </button>
                                    </span>
                                ))}
                                <button className="gc-rec-chip-clear" onClick={() => { setRecMovies([]); setRecTitle(''); setRecText(''); }}>Clear</button>
                            </div>
                            {/* Optional custom title + note attached to the recommendation */}
                            <div className="gc-rec-details">
                                <input
                                    className="gc-rec-detail-input"
                                    placeholder="Add a title to your recommendation…"
                                    value={recTitle}
                                    onChange={(e) => setRecTitle(e.target.value)}
                                    maxLength={60}
                                />
                                <input
                                    className="gc-rec-detail-input"
                                    placeholder="Add a note — why should they watch it?…"
                                    value={recText}
                                    onChange={(e) => setRecText(e.target.value)}
                                    maxLength={200}
                                />
                            </div>
                            </>
                        )}

                        {/* Footer */}
                        <div className="gc-footer">
                            {/* Composer options menu — anchored to the footer's top,
                                like the movie picker below it. */}
                            {showRecMenu && (
                                <div className="gc-rec-menu">
                                    <button
                                        className="gc-rec-menu-item"
                                        onClick={() => {
                                            setShowRecMenu(false);
                                            setShowRecPicker(true);
                                        }}
                                    >
                                        Recommend Content
                                    </button>
                                    <button
                                        className="gc-rec-menu-item"
                                        onClick={openReport}
                                    >
                                        Report Issue
                                    </button>
                                </div>
                            )}

                            {/* Report Issue form — plain language only; technical
                                context rides along silently in the payload. */}
                            {showReport && (
                                <div className="gc-report">
                                    {reportSent ? (
                                        <div className="gc-report-sent">Report sent. Thanks! 🙏</div>
                                    ) : (
                                        <>
                                            <div className="gc-report-head">
                                                <b>Report an Issue</b>
                                                <button
                                                    className="gc-report-close"
                                                    onClick={() => setShowReport(false)}
                                                    aria-label="Close"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            {reportBlocked && (
                                                <div className="gc-report-blocked">
                                                    You can send one report every 2 minutes. Please wait a moment.
                                                </div>
                                            )}
                                            <div className="gc-report-cats">
                                                {REPORT_CATEGORIES.map((c) => (
                                                    <button
                                                        key={c}
                                                        className={`gc-report-cat${reportCategory === c ? ' selected' : ''}`}
                                                        onClick={() => setReportCategory(c)}
                                                    >
                                                        {c}
                                                    </button>
                                                ))}
                                            </div>
                                            <textarea
                                                className="gc-report-desc"
                                                placeholder="What went wrong? (optional)"
                                                value={reportDesc}
                                                onChange={(e) => setReportDesc(e.target.value)}
                                                maxLength={500}
                                                rows={3}
                                            />
                                            <div className="gc-report-ctx">
                                                {reportContext?.title
                                                    ? <>While watching: <b>{reportContext.title}</b></>
                                                    : 'While browsing the app'}
                                            </div>
                                            <div className="gc-report-micro">
                                                Details about what you were doing are attached automatically — no need to explain them.
                                            </div>
                                            <div className="gc-report-actions">
                                                <button
                                                    className="gc-report-cancel"
                                                    onClick={() => setShowReport(false)}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    className="gc-report-send"
                                                    disabled={!reportCategory || reportSending || reportBlocked}
                                                    onClick={submitReport}
                                                >
                                                    {reportSending ? 'Sending…' : 'Send Report'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Movie picker popover */}
                            {showRecPicker && (
                                <div className="gc-rec-picker">
                                    <input
                                        className="gc-rec-search"
                                        placeholder="Search movies & shows..."
                                        value={recQuery}
                                        onChange={(e) => setRecQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="gc-rec-results">
                                        {recSearching && <div className="gc-rec-empty">Searching…</div>}
                                        {!recSearching && !recQuery.trim() && (
                                            <div className="gc-rec-empty">Search to pick movies &amp; shows to recommend.</div>
                                        )}
                                        {!recSearching && recQuery.trim() && recResults.length === 0 && (
                                            <div className="gc-rec-empty">No results.</div>
                                        )}
                                        {!recSearching && recResults.map(r => {
                                            const selected = recMovies.some(m => `${m.type}-${m.id}` === `${r.media_type}-${r.id}`);
                                            return (
                                                <button
                                                    key={`${r.media_type}-${r.id}`}
                                                    className={`gc-rec-result${selected ? ' selected' : ''}`}
                                                    onClick={() => toggleRecMovie(r)}
                                                >
                                                    {r.poster_path
                                                        ? <img src={cardPoster(r.poster_path)} alt="" className="gc-rec-result-img" />
                                                        : <div className="gc-rec-result-img gc-rec-result-img-fallback">🎬</div>}
                                                    <span className="gc-rec-result-title">{r.title || r.name || 'Untitled'}</span>
                                                    <span className="gc-rec-result-year">
                                                        {(r.release_date || r.first_air_date || '').substring(0, 4)} · {r.media_type}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="gc-rec-picker-foot">
                                        <span>{recMovies.length}/10 selected</span>
                                        <button className="gc-rec-picker-done" onClick={() => setShowRecPicker(false)}>Done</button>
                                    </div>
                                </div>
                            )}

                            {/* Mention List */}
                            {showMentionList && mentionOptions.length > 0 && (
                                <div className="gc-mention-list show">
                                    {mentionOptions.map(user => (
                                        <div
                                            key={user.id || user.uid}
                                            className={`gc-mention-item ${user.isEveryone ? 'gc-mention-everyone' : ''}`}
                                            onClick={() => handleSelectMention(user)}
                                        >
                                            {user.isEveryone ? (
                                                <span className="gc-mention-everyone-icon">📢</span>
                                            ) : (
                                                <img src={user.avatarUrl} alt="" className="gc-mention-avatar" />
                                            )}
                                            <span>{user.nickname}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="gc-input-wrapper">
                                <textarea
                                    ref={inputRef}
                                    className="gc-msg-input"
                                    rows="1"
                                    placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                                    value={messageText}
                                    onChange={handleInputChange}
                                    onKeyDown={(e) => {
                                        // Enter inserts a new line (for paragraphs & bullets);
                                        // Shift+Enter or Ctrl/Cmd+Enter sends the message.
                                        if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            isEditing ? updateMessage() : handleSendMessage();
                                        }
                                    }}
                                />
                            </div>
                            <button
                                className={`gc-rec-btn${showRecMenu ? ' active' : ''}`}
                                title="More options"
                                aria-label="More options"
                                onClick={() => {
                                    setShowRecPicker(false);
                                    setShowRecMenu(v => !v);
                                }}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="18"
                                    height="18"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    aria-hidden="true"
                                >
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </button>
                            <button
                                className="gc-send-btn"
                                onClick={isEditing ? updateMessage : handleSendMessage}
                                disabled={(!messageText.trim() && !pendingFile && recMovies.length === 0) || isSending}
                            >
                                {isSending ? '...' : (
                                    <svg viewBox="0 0 24 24">
                                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                )}


            </div>

            {/* Reaction Popover (Desktop) */}
            {
                showReactionPopover && (
                    <>
                        {/* Invisible overlay to close popover on click outside */}
                        <div
                            className="gc-popover-overlay"
                            onClick={() => setShowReactionPopover(null)}
                        />
                        <div
                            className="gc-reaction-popover show"
                            style={{ top: popoverPosition.top, left: popoverPosition.left }}
                        >
                            {REACTIONS.map(emoji => (
                                <span
                                    key={emoji}
                                    className="gc-reaction-icon"
                                    onClick={() => handleReaction(emoji)}
                                >
                                    {emoji}
                                </span>
                            ))}
                        </div>
                    </>
                )
            }

            {/* Action Sheet (Mobile) */}
            {
                showActionSheet && (
                    <div
                        className="gc-action-sheet show"
                        onClick={() => { setShowActionSheet(false); setShowReactionPopover(null); }}
                    >
                        <div
                            className="gc-sheet-content"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="gc-reaction-row">
                                {REACTIONS.map(emoji => (
                                    <span
                                        key={emoji}
                                        className="gc-reaction-icon"
                                        onClick={() => handleReaction(emoji)}
                                    >
                                        {emoji}
                                    </span>
                                ))}
                            </div>
                            <button className="gc-sheet-btn" onClick={handleReply}>
                                ↩️ Reply
                            </button>
                            <button className="gc-sheet-btn" onClick={handleCopyText}>
                                📋 Copy Text
                            </button>
                            {actionSheetTarget?.uid === currentUserRef.current?.uid &&
                                actionSheetTarget.text &&
                                Date.now() - actionSheetTarget.createdAt < 3 * 60 * 1000 && (
                                    <button
                                        className="gc-sheet-btn"
                                        onClick={() => {
                                            handleEditMessage(actionSheetTarget);
                                            setShowActionSheet(false);
                                        }}
                                    >
                                        ✏️ Edit
                                    </button>
                                )}
                            {(actionSheetTarget?.uid === currentUserRef.current?.uid || userDataRef.current.isAdmin) && (
                                <button className="gc-sheet-btn danger" onClick={() => handleDeleteMessage()}>
                                    {userDataRef.current.isAdmin ? '🗑️ Delete for everyone' : '🗑️ Unsend'}
                                </button>
                            )}
                            {actionSheetTarget?.uid !== currentUserRef.current?.uid && (
                                <button className="gc-sheet-btn danger" onClick={handleReportMessage}>
                                    🚩 Report
                                </button>
                            )}
                            <button
                                className="gc-sheet-btn cancel"
                                onClick={() => { setShowActionSheet(false); setShowReactionPopover(null); }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Reaction View */}
            {
                showReactionView && (
                    <div
                        className="gc-reaction-view show"
                        onClick={() => setShowReactionView(null)}
                    >
                        <div
                            className="gc-reaction-view-content"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="gc-reaction-view-header">
                                <h3>Reactions</h3>
                                <button
                                    className="gc-reaction-view-close"
                                    onClick={() => setShowReactionView(null)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="gc-reaction-list">
                                {showReactionView.reactions && Object.entries(showReactionView.reactions).filter(([, users]) => users && typeof users === 'object').map(([emoji, users]) => (
                                    Object.entries(users).map(([uid, name]) => (
                                        <div key={`${emoji}-${uid}`} className="gc-reaction-item">
                                            <span className="gc-reaction-item-emoji">{emoji}</span>
                                            <span className="gc-reaction-item-name">{name}</span>
                                        </div>
                                    ))
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Admin Settings Modal */}
            {
                showAdminSettings && userDataRef.current.isAdmin && (
                    <div className="gc-admin-settings-overlay" onClick={() => setShowAdminSettings(false)} data-nav-trap>
                        <div className="gc-admin-settings" onClick={e => e.stopPropagation()}>
                            <div className="gc-admin-settings-header">
                                <h3>Admin Settings</h3>
                                <button onClick={() => setShowAdminSettings(false)}>✕</button>
                            </div>

                            {/* Avatar Section */}
                            <div className="gc-settings-section">
                                <h4>Avatar</h4>
                                <div className="gc-avatar-mode-tabs">
                                    <button
                                        className={adminAvatarMode === 'dicebear' ? 'active' : ''}
                                        onClick={() => setAdminAvatarMode('dicebear')}
                                    >
                                        Generate
                                    </button>
                                    <button
                                        className={adminAvatarMode === 'upload' ? 'active' : ''}
                                        onClick={() => setAdminAvatarMode('upload')}
                                    >
                                        Upload
                                    </button>
                                </div>

                                {adminAvatarMode === 'dicebear' ? (
                                    <div className="gc-dicebear-section">
                                        <div className="gc-settings-avatar-preview">
                                            <img src={getAvatarUrl(avatarStyle, avatarSeed)} alt="Avatar" />
                                        </div>
                                        <div className="gc-avatar-mini-grid">
                                            {AVATAR_STYLES.slice(0, 4).map(style => (
                                                <div
                                                    key={style.id}
                                                    className={`gc-mini-avatar ${avatarStyle === style.id ? 'selected' : ''}`}
                                                    onClick={() => setAvatarStyle(style.id)}
                                                >
                                                    <img src={getAvatarUrl(style.id, avatarSeed)} alt={style.name} />
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            className="gc-randomize-small"
                                            onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}
                                        >
                                            🎲 Randomize
                                        </button>
                                    </div>
                                ) : (
                                    <div className="gc-upload-section">
                                        <input
                                            type="file"
                                            ref={adminFileInputRef}
                                            accept="image/*,.gif"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    setAdminUploadedAvatar(e.target.files[0]);
                                                }
                                            }}
                                            style={{ display: 'none' }}
                                        />
                                        <div
                                            className="gc-upload-preview"
                                            onClick={() => adminFileInputRef.current?.click()}
                                        >
                                            {adminUploadedAvatar || (userDataRef.current.avatarUrl && !userDataRef.current.avatarUrl.includes('dicebear') && !userDataRef.current.avatarUrl.includes('ui-avatars')) ? (
                                                <img src={adminUploadedAvatar ? URL.createObjectURL(adminUploadedAvatar) : userDataRef.current.avatarUrl} alt="Preview" />
                                            ) : (
                                                <div className="gc-upload-placeholder">
                                                    <i className="fa-solid fa-cloud-arrow-up"></i>
                                                    <span>Click to upload</span>
                                                    <small>GIF supported</small>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Name Section */}
                            <div className="gc-settings-section">
                                <h4>Display Name</h4>
                                <input
                                    type="text"
                                    className="gc-admin-name-input"
                                    value={adminNickname}
                                    onChange={(e) => setAdminNickname(e.target.value.slice(0, 20))}
                                    placeholder="Enter display name"
                                    maxLength={20}
                                />
                            </div>

                            {/* Badge Section */}
                            <div className="gc-settings-section">
                                <h4>Admin Badge</h4>
                                <div className="gc-badge-grid">
                                    {ADMIN_BADGES.map(badge => (
                                        <div
                                            key={badge.id}
                                            className={`gc-badge-option ${adminBadge === badge.id ? 'selected' : ''}`}
                                            onClick={() => setAdminBadge(badge.id)}
                                            title={badge.name}
                                        >
                                            <i className={`fa-solid ${badge.icon}`}></i>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Save Button */}
                            <button
                                className="gc-save-settings-btn"
                                disabled={isSavingSettings}
                                style={{ opacity: isSavingSettings ? 0.7 : 1, cursor: isSavingSettings ? 'not-allowed' : 'pointer' }}
                                onClick={async () => {
                                    if (isSavingSettings) return;
                                    setIsSavingSettings(true);
                                    try {
                                        let newAvatarUrl = userDataRef.current.avatarUrl;

                                        if (adminAvatarMode === 'upload' && adminUploadedAvatar) {
                                            newAvatarUrl = await uploadToDrive(adminUploadedAvatar);
                                            if (!newAvatarUrl) {
                                                alert('Failed to upload avatar');
                                                setIsSavingSettings(false);
                                                return;
                                            }
                                        } else if (adminAvatarMode === 'dicebear') {
                                            newAvatarUrl = getAvatarUrl(avatarStyle, avatarSeed);
                                        }

                                        const selectedBadge = ADMIN_BADGES.find(b => b.id === adminBadge);

                                        // Optimistic DB Update (Attempt)
                                        try {
                                            await dbRef.current.ref(`users/${currentUserRef.current.uid}`).update({
                                                nickname: adminNickname.trim() || ADMIN_NICKNAME,
                                                avatarUrl: newAvatarUrl,
                                                adminBadge: selectedBadge?.icon || 'fa-crown'
                                            });
                                        } catch {
                                            console.warn('DB Update failed (likely permissions), proceeding with local save.');
                                        }

                                        // Persist to LocalStorage (offline cache)
                                        localStorage.setItem('sf_admin_nickname', adminNickname.trim() || ADMIN_NICKNAME);
                                        localStorage.setItem('sf_admin_avatar', newAvatarUrl);
                                        localStorage.setItem('sf_admin_badge', selectedBadge?.icon || 'fa-crown');

                                        // Persist to Firebase for cross-device sync
                                        try {
                                            await dbRef.current.ref('secrets/admin_profile').set({
                                                nickname: adminNickname.trim() || ADMIN_NICKNAME,
                                                avatarUrl: newAvatarUrl,
                                                adminBadge: selectedBadge?.icon || 'fa-crown'
                                            });
                                        } catch (e) {
                                            console.warn('Failed to save admin profile to Firebase:', e);
                                        }

                                        // Keep the nickname registry in sync with a rename:
                                        // free the old key, claim the new one.
                                        const oldAdminKey = nicknameKey(userDataRef.current.nickname);
                                        const newAdminNickname = adminNickname.trim() || ADMIN_NICKNAME;
                                        const newAdminKey = nicknameKey(newAdminNickname);
                                        if (oldAdminKey && oldAdminKey !== newAdminKey) {
                                            dbRef.current.ref(`nicknames/${oldAdminKey}`).remove().catch(() => {});
                                        }
                                        if (newAdminKey) {
                                            dbRef.current.ref(`nicknames/${newAdminKey}`).set({
                                                uid: currentUserRef.current.uid,
                                                nickname: newAdminNickname,
                                                claimedAt: window.firebase.database.ServerValue.TIMESTAMP
                                            }).catch(() => {});
                                        }

                                        userDataRef.current = {
                                            ...userDataRef.current,
                                            nickname: newAdminNickname,
                                            avatarUrl: newAvatarUrl,
                                            adminBadge: selectedBadge?.icon || 'fa-crown'
                                        };

                                        setAdminUploadedAvatar(null);
                                        setShowAdminSettings(false);
                                    } catch (err) {
                                        console.error('Save settings error:', err);
                                        alert('Failed to save settings');
                                    } finally {
                                        setIsSavingSettings(false);
                                    }
                                }}
                            >
                                {isSavingSettings ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                                        Saving...
                                    </>
                                ) : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Reports Panel (Admin Only) */}
            {
                showReports && userDataRef.current.isAdmin && (
                    <div
                        className="gc-reports-overlay"
                        onClick={() => setShowReports(false)}
                        data-nav-trap
                    >
                        <div
                            className="gc-reports-panel"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="gc-reports-header">
                                <h3>User Reports</h3>
                                <button onClick={() => setShowReports(false)}>✕</button>
                            </div>
                            <div className="gc-reports-list">
                                {reports.length === 0 ? (
                                    <p className="gc-no-reports">No reports found.</p>
                                ) : (
                                    reports.map(report => {
                                        const isIssue = report.kind === 'issue';
                                        const mediaLabel = report.messageMedia === 'image' ? '📷 Image'
                                            : report.messageMedia === 'video' ? '🎥 Video'
                                            : report.messageMedia === 'audio' ? '🎵 Audio'
                                            : report.messageMedia ? '📎 Media' : null;
                                        return (
                                            <div key={report.id} className="gc-report-item">
                                                <div className="gc-report-time">
                                                    {new Date(report.timestamp).toLocaleString()}
                                                </div>
                                                {isIssue ? (
                                                    <>
                                                        <div className="gc-report-kind gc-report-kind-issue">Issue report</div>
                                                        <div className="gc-report-category">{report.category}</div>
                                                        {report.description && (
                                                            <div className="gc-report-desc-text">“{report.description}”</div>
                                                        )}
                                                        <div className="gc-report-context">
                                                            {report.context?.title
                                                                ? <>While watching: <b>{report.context.title}</b></>
                                                                : (report.context?.route
                                                                    ? <>On page: {report.context.route}</>
                                                                    : 'While browsing the app')}
                                                        </div>
                                                        {report.context && (report.context.mediaType || report.context.route || report.context.fromServer || report.context.ua || report.context.playback) && (
                                                            <div className="gc-report-details">
                                                                {report.context.mediaType && (
                                                                    <div className="gc-report-detail">
                                                                        <span className="gc-report-detail-label">Content</span>
                                                                        {report.context.mediaType === 'movie' ? 'Movie' : 'TV'}
                                                                        {report.context.season != null && ` · S${report.context.season}E${report.context.episode ?? '?'}`}
                                                                        {report.context.tmdbId && ` · TMDB ${report.context.tmdbId}`}
                                                                    </div>
                                                                )}
                                                                {report.context.route && (
                                                                    <div className="gc-report-detail">
                                                                        <span className="gc-report-detail-label">Page</span>
                                                                        <span className="gc-report-detail-route">{report.context.route}</span>
                                                                    </div>
                                                                )}
                                                                {report.context.fromServer && (
                                                                    <div className="gc-report-detail">
                                                                        <span className="gc-report-detail-label">Server</span>
                                                                        {report.context.fromServer}{report.context.toServer ? ` → ${report.context.toServer}` : ''}
                                                                    </div>
                                                                )}
                                                                {report.context.ua && (
                                                                    <div className="gc-report-detail">
                                                                        <span className="gc-report-detail-label">Device</span>
                                                                        {summarizeUA(report.context.ua)}
                                                                    </div>
                                                                )}
                                                                {report.context.playback && (
                                                                    <div className="gc-report-detail">
                                                                        <span className="gc-report-detail-label">Playback</span>
                                                                        Issue while playing (auto server fallback)
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="gc-report-kind gc-report-kind-message">Message report</div>
                                                        <div className="gc-report-msg-text">
                                                            {report.messageText ? (
                                                                <span className="gc-report-quote">“{report.messageText}”</span>
                                                            ) : (
                                                                <span className="gc-report-media">{mediaLabel || 'Content no longer available'}</span>
                                                            )}
                                                            <span className="gc-report-from">— {report.messageNickname}</span>
                                                        </div>
                                                    </>
                                                )}
                                                {report.msgId && (
                                                    <div className="gc-report-msgid">
                                                        Message ID: <code>{report.msgId}</code>
                                                    </div>
                                                )}
                                                <div className="gc-report-reporter">
                                                    Reported by: {report.reportedByNickname || report.reportedBy || 'Unknown'}
                                                </div>
                                                <div className="gc-report-actions">
                                                    {report.msgId && (
                                                        <button
                                                            className="gc-report-locate"
                                                            onClick={() => {
                                                                scrollToRepliedMessage(report.msgId);
                                                                setShowReports(false);
                                                            }}
                                                        >
                                                            Locate
                                                        </button>
                                                    )}
                                                    <button
                                                        className="gc-report-resolve"
                                                        onClick={async () => {
                                                            await dbRef.current.ref(`reports/${report.id}`).remove();
                                                            setReports(prev => prev.filter(r => r.id !== report.id));
                                                        }}
                                                    >
                                                        Resolve
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Lightbox */}
            {
                showLightbox && (
                    <div
                        className="gc-lightbox"
                        onClick={() => setShowLightbox(null)}
                    >
                        <div className="gc-lightbox-header" onClick={e => e.stopPropagation()}>
                            <button
                                className="gc-lightbox-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowLightbox(null);
                                }}
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="gc-lightbox-content" onClick={e => e.stopPropagation()}>
                            {showLightbox.type === 'image' ? (
                                <img
                                    src={showLightbox.url}
                                    alt="Full size"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.parentNode.innerHTML = '<div style="color:#888;padding:40px;">Failed to load image</div>';
                                    }}
                                />
                            ) : (
                                <video src={showLightbox.url} controls autoPlay />
                            )}
                        </div>
                    </div>
                )
            }

            {/* Click outside to close popover */}
            {
                showReactionPopover && !showActionSheet && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 2147483646
                        }}
                        onClick={() => setShowReactionPopover(null)}
                    />
                )
            }
        </div >
    );
}

export default GlobalChat;
