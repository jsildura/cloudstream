import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useTVDetect from '../hooks/useTVDetect';
import ChatLinkPreview from './ChatLinkPreview';
import MovieRecRow from './MovieRecRow';
import { cardPoster } from '../utils/images';
import { initFirebase } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import GlobalChatSignInWall from './GlobalChatSignInWall';
import { chatPath, buildChatProfile, buildChatMessage, buildTicketMessage, MAX_TEXT_LENGTH, MAX_REPLY_PREVIEW_LENGTH } from '../lib/globalChatModel';
import './GlobalChat.css';

// Constants
export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

// Reaction data helper — groups counts by emoji, sorts top 3, and resolves caller reaction
// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export const getReactionData = (reactions, currentUid) => {
    if (!reactions || typeof reactions !== 'object') return null;

    const counts = {};
    let total = 0;
    let userReacted = false;
    let userReaction = null;

    Object.entries(reactions).forEach(([uid, emoji]) => {
        if (!emoji || typeof emoji !== 'string' || !REACTIONS.includes(emoji)) return;
        counts[emoji] = (counts[emoji] || 0) + 1;
        total += 1;
        if (currentUid && uid === currentUid) {
            userReacted = true;
            userReaction = emoji;
        }
    });

    if (total === 0) return null;

    const emojis = Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, 3)
        .join('');

    return { emojis, total, counts, userReacted, userReaction };
};

// Seen receipt helper — returns true when seenBy contains any UID other than author
// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export const isMessageSeen = (msg) => {
    if (!msg?.seenBy || typeof msg.seenBy !== 'object' || !msg?.uid) return false;
    return Object.keys(msg.seenBy).some(uid => uid !== msg.uid);
};

// Report Issue categories — plain language for non-technical users. Short and
// distinct so reports stay sortable without a taxonomy.
export const REPORT_CATEGORIES = [
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

// Short human-readable ticket number for a report — unique enough for a
// moderation queue without a counter (derived from the push timestamp).
const makeTicketNo = () => String(Date.now()).slice(-6);

// Snapshot a reported message's visible content into the report payload. The
// admin moderation panel renders this snippet directly, so a report stays
// useful even if the message is later edited, deleted, or purged — the report
// carries its own copy of what was said.
// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export const buildMessageReport = (msg, reporter) => {
    const rawText = (msg?.text || '').trim();
    const messageText = rawText.length > 200 ? rawText.slice(0, 200) : rawText;

    const rawSenderName = typeof (msg?.senderName || msg?.displayName || msg?.nickname) === 'string'
        ? (msg.senderName || msg.displayName || msg.nickname).trim()
        : '';
    const messageSenderName = rawSenderName.length > 0
        ? rawSenderName.slice(0, 80)
        : 'Google User';

    const rawReporterName = typeof (reporter?.displayName || reporter?.name || reporter?.nickname) === 'string'
        ? (reporter.displayName || reporter.name || reporter.nickname).trim()
        : '';
    const reportedByName = rawReporterName.length > 0
        ? rawReporterName.slice(0, 80)
        : 'Google User';

    const report = {
        kind: 'message',
        msgId: String(msg?.id || '').slice(0, 100) || 'unknown',
        messageSenderName,
        messageText,
        reportedBy: reporter?.uid || 'anonymous',
        reportedByName,
        ticketNo: makeTicketNo(),
        timestamp: Date.now()
    };

    if (msg?.mediaUrl && ['image', 'video', 'file', 'audio'].includes(msg?.mediaType)) {
        report.messageMedia = msg.mediaType;
    }

    return report;
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
const ADMIN_AVATAR = "/logo/streamflix.png";

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
            const sender = msg.senderName || msg.displayName || msg.nickname || 'Admin';
            const icon = msg.senderPhotoURL || msg.photoURL || msg.avatarUrl || '/logo/streamflix.png';
            const n = new Notification('📢 Announcement — StreamFlix Chat', {
                body: `${sender}: ${body}`,
                icon,
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
    const { chatIdentity, isSignedIn, isAuthLoading, isGlobalChatAdmin } = useAuth();
    // State
    const [sessionState, setSessionState] = useState('signed-out'); // 'signed-out' | 'bootstrapping' | 'ready' | 'error'
    const [showFab, setShowFab] = useState(false); // Delay FAB until loading screen finishes
    const [isOpen, setIsOpen] = useState(false);
    const openChatRef = useRef(null);
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

    const [pinnedMessage, setPinnedMessage] = useState(null);
    // Edit Message Handler
    const handleEditMessage = (msg) => {
        const now = Date.now();
        const msgTime = msg.createdAt || msg.timestamp || 0;
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
        if (!editingMessageId || !messageText.trim() || !dbRef.current || !currentUserRef.current) return;

        const now = Date.now();
        const trimmed = messageText.trim().slice(0, MAX_TEXT_LENGTH);
        try {
            await dbRef.current.ref(chatPath('messages', editingMessageId)).update({
                text: trimmed,
                isEdited: true,
                editedAt: now
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
    const loadMessagesRef = useRef(null);

    const profileInputRef = useRef(null);
    const streamRef = useRef(null);
    const longPressTimerRef = useRef(null);
    const longPressStartRef = useRef(null);
    const suppressClickRef = useRef(false);
    // Close admin views if admin claim is revoked
    useEffect(() => {
        if (!isGlobalChatAdmin) {
            setShowReports(false);
        }
    }, [isGlobalChatAdmin]);
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
    // Report ids currently being resolved — guards against a double-click on
    // the Resolve button posting two notifications.
    const resolvingReportsRef = useRef(new Set());

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

    // Initialize or get Firebase services
    const getDb = useCallback(() => {
        if (dbRef.current) return dbRef.current;
        try {
            const fb = initFirebase();
            authRef.current = fb.auth;
            dbRef.current = fb.db;
            storageRef.current = fb.storage;
            return dbRef.current;
        } catch (e) {
            console.warn('Firebase init error in GlobalChat:', e);
            return null;
        }
    }, []);

    useEffect(() => {
        if (isTVMode) return;
        getDb();
    }, [isTVMode, getDb]);

    // Helper to cleanup all active DB listeners
    const cleanupListeners = useCallback(() => {
        if (listenersRef.current && listenersRef.current.length > 0) {
            listenersRef.current.forEach(cleanup => {
                try { cleanup(); } catch (e) { console.warn('Listener cleanup error:', e); }
            });
            listenersRef.current = [];
        }
    }, []);

    // Session lifecycle effect: reacts to chatIdentity and dbRef changes
    useEffect(() => {
        if (isTVMode) return;

        // If not signed in or no Google chat identity, reset to signed-out
        if (!isSignedIn || !chatIdentity || !chatIdentity.uid) {
            cleanupListeners();
            currentUserRef.current = null;
            userDataRef.current = { uid: '', displayName: '', photoURL: null, isAdmin: false };
            setSessionState('signed-out');
            setMessages([]);
            setAllUsers([]);
            setPinnedMessage(null);
            setStaleBroadcastIds(new Set());
            setReplyTo(null);
            setRecMovies([]);
            setRecTitle('');
            setRecText('');
            deletedMsgIdsRef.current = new Set();
            notifiedBroadcastIdsRef.current = new Set();
            return;
        }

        const db = getDb();
        if (!db) return;

        let active = true;
        setSessionState('bootstrapping');
        cleanupListeners();

        // Reset state for new principal
        setMessages([]);
        setAllUsers([]);
        setPinnedMessage(null);
        setStaleBroadcastIds(new Set());
        setReplyTo(null);
        setRecMovies([]);
        setRecTitle('');
        setRecText('');
        deletedMsgIdsRef.current = new Set();
        notifiedBroadcastIdsRef.current = new Set();

        (async () => {
            try {
                const profilePath = chatPath('profiles', chatIdentity.uid);
                const snapshot = await db.ref(profilePath).once('value');
                if (!active) return;

                const existingProfile = snapshot.val();
                const existingJoinedAt = existingProfile?.joinedAt;
                const now = Date.now();
                const profileData = buildChatProfile(chatIdentity, now, existingJoinedAt);

                await db.ref(profilePath).set(profileData);
                if (!active) return;

                currentUserRef.current = chatIdentity;
                userDataRef.current = {
                    uid: chatIdentity.uid,
                    displayName: profileData.displayName,
                    photoURL: profileData.photoURL || null,
                    isAdmin: isGlobalChatAdmin === true
                };

                setSessionState('ready');
                loadMessagesRef.current?.();
            } catch (err) {
                console.error('Failed to bootstrap GlobalChat v2 profile:', err);
                if (active) {
                    setSessionState('error');
                    setError('Failed to initialize chat profile.');
                }
            }
        })();

        return () => {
            active = false;
            cleanupListeners();
        };
    }, [chatIdentity, isSignedIn, isGlobalChatAdmin, isTVMode, cleanupListeners, getDb]);

    // Load users cache (profiles)
    useEffect(() => {
        if (!dbRef.current || sessionState !== 'ready') return;

        const profilesRef = dbRef.current.ref(chatPath('profiles'));
        const callback = (snapshot) => {
            const users = [];
            snapshot.forEach(child => {
                const val = child.val();
                if (val && val.displayName) {
                    users.push({
                        uid: child.key,
                        displayName: val.displayName,
                        photoURL: val.photoURL || null
                    });
                }
            });
            setAllUsers(users);
        };

        profilesRef.on('value', callback);
        listenersRef.current.push(() => profilesRef.off('value', callback));
    }, [sessionState]);

    // Load pinned message
    useEffect(() => {
        if (!dbRef.current || sessionState !== 'ready') return;

        const pinnedRef = dbRef.current.ref(chatPath('pinnedMessage'));
        const callback = (snapshot) => {
            if (snapshot.exists()) {
                setPinnedMessage(snapshot.val());
            } else {
                setPinnedMessage(null);
            }
        };

        pinnedRef.on('value', callback);
        listenersRef.current.push(() => pinnedRef.off('value', callback));
    }, [sessionState]);

    // Backfill unread @everyone broadcasts
    useEffect(() => {
        if (!dbRef.current || sessionState !== 'ready' || !currentUserRef.current) return;
        let cancelled = false;
        (async () => {
            try {
                const me = currentUserRef.current.uid;
                const snap = await dbRef.current.ref(chatPath('messages'))
                    .orderByChild('broadcast').equalTo(true).once('value');
                if (cancelled || !snap.exists()) return;
                const unread = [];
                snap.forEach(child => {
                    const v = child.val();
                    if (!v) return;
                    if (!v.seenBy || !v.seenBy[me]) unread.push(child.key);
                });
                if (unread.length > 0 && !chatOpenedRef.current) {
                    setStaleBroadcastIds(prev => new Set([...prev, ...unread]));
                }
            } catch (err) {
                console.warn('Broadcast backfill query failed:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [sessionState]);

    // Mark @everyone broadcasts as seen (seenBy).
    const markBroadcastsSeen = useCallback((msgs) => {
        if (!dbRef.current || !currentUserRef.current) return;

        const uid = currentUserRef.current.uid;
        const updates = {};
        let hasUpdates = false;

        msgs.forEach(msg => {
            if (msg.broadcast && !msg.deletedForAll) {
                if (!msg.seenBy || !msg.seenBy[uid]) {
                    updates[`${chatPath('messages', msg.id, 'seenBy', uid)}`] = true;
                    hasUpdates = true;
                }
            }
        });

        if (hasUpdates) {
            dbRef.current.ref().update(updates);
        }
    }, []);

    // Mark messages as seen (seenBy).
    const markMessagesAsSeen = useCallback((msgs) => {
        if (!dbRef.current || !currentUserRef.current) return;

        const uid = currentUserRef.current.uid;
        const updates = {};
        let hasUpdates = false;

        msgs.forEach(msg => {
            if (msg.uid !== uid &&
                !msg.deletedForAll &&
                !msg.broadcast) {
                if (!msg.seenBy || !msg.seenBy[uid]) {
                    updates[`${chatPath('messages', msg.id, 'seenBy', uid)}`] = true;
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

        const messagesRef = dbRef.current.ref(chatPath('messages'));

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
                    else markMessagesAsSeen([newMsg]);
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
    }, [isOpen, markBroadcastsSeen, markMessagesAsSeen]);

    // Load messages function
    const loadMessages = useCallback(() => {
        if (!dbRef.current || !currentUserRef.current) return;

        const messagesRef = dbRef.current.ref(chatPath('messages'));
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
            markBroadcastsSeen(msgs);
        });
    }, [startLiveListener, markMessagesAsSeen, markBroadcastsSeen]);
    loadMessagesRef.current = loadMessages;

    // Load older messages on scroll
    const loadOlderMessages = useCallback(async () => {
        if (!oldestKeyRef.current || isLoadingHistoryRef.current || !dbRef.current) return;

        isLoadingHistoryRef.current = true;
        const container = messagesContainerRef.current;
        const oldHeight = container?.scrollHeight || 0;

        const query = dbRef.current.ref(chatPath('messages'))
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

        // Broadcasts & messages loaded via scroll-pagination were seen by the reader
        if (isOpen) {
            markBroadcastsSeen(olderMsgs);
            markMessagesAsSeen(olderMsgs);
        }

        requestAnimationFrame(() => {
            if (container) {
                container.scrollTop = container.scrollHeight - oldHeight;
            }
            isLoadingHistoryRef.current = false;
        });
    }, [isOpen, markBroadcastsSeen, markMessagesAsSeen]);

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
        if (staleBroadcastIds.size > 0 && currentUserRef.current) {
            const updates = {};
            staleBroadcastIds.forEach(id => {
                updates[`${chatPath('messages', id)}/seenBy/${currentUserRef.current.uid}`] = true;
            });
            dbRef.current.ref().update(updates);
            setStaleBroadcastIds(new Set());
        }
    };

    useEffect(() => {
        const openChat = () => openChatRef.current?.();
        window.addEventListener('streamflix:open-global-chat', openChat);
        return () => window.removeEventListener('streamflix:open-global-chat', openChat);
    }, []);

    // Handle chat close
    const handleCloseChat = () => {
        setIsOpen(false);
        setShowActionSheet(false);
        setShowReactionPopover(null);
        setShowCamera(false);
        setShowReports(false);
        stopCamera();
    };

    // Admin verification lives on the Cloudflare proxy (functions/api/admin-login.js)
    // so the password is never checked against a client-readable hash in
    // production. The proxy is tried FIRST (it also works under `wrangler pages
    // dev`); the legacy Firebase-hash comparison only runs when the proxy is
    // unreachable (plain `npm run dev` on localhost, no proxy serving).
    //
    // Load reports (claims admin only)
    const loadReports = async () => {
        if (!isGlobalChatAdmin || !dbRef.current) return;

        try {
            const snapshot = await dbRef.current.ref(chatPath('reports')).once('value');
            if (snapshot.exists()) {
                const data = snapshot.val();
                const reportsList = Object.entries(data).map(([id, report]) => ({
                    id,
                    ...report
                }));
                await Promise.all(reportsList.map(async (report) => {
                    if (report.msgId && !report.messageText) {
                        try {
                            const msgSnap = await dbRef.current.ref(chatPath('messages', report.msgId)).once('value');
                            const msg = msgSnap.val();
                            if (msg) {
                                report.messageText = (msg.text || '').trim().slice(0, 200);
                                report.messageSenderName = msg.senderName || msg.displayName || 'Google User';
                                report.messageMedia = msg.mediaUrl ? (['image', 'video', 'file', 'audio'].includes(msg.mediaType) ? msg.mediaType : 'file') : null;
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
            if (err.message?.includes('PERMISSION_DENIED') || err.code === 'PERMISSION_DENIED') {
                setShowReports(false);
            }
        }
    };

    // Handle send message
    const handleSendMessage = async () => {
        if (isSending) return;
        const text = messageText.trim();
        if (!text && !pendingFile && recMovies.length === 0 && !recTitle.trim() && !recText.trim()) return;
        if (!currentUserRef.current || !dbRef.current) return;

        setIsSending(true);

        try {
            let mediaUrl = null;
            let mediaType = null;

            if (pendingFile) {
                mediaType = getFileType(pendingFile);
                mediaUrl = await uploadToDrive(pendingFile);
            }

            const now = Date.now();
            const message = buildChatMessage({
                identity: currentUserRef.current,
                isAdmin: isGlobalChatAdmin === true,
                text,
                timestamp: now,
                movies: recMovies.length ? recMovies : undefined,
                recTitle: recTitle.trim() || undefined,
                recText: recText.trim() || undefined,
                mediaUrl: mediaUrl || undefined,
                mediaType: mediaType || undefined,
                replyTo: replyTo ? {
                    messageId: replyTo.messageId || replyTo.id,
                    senderName: replyTo.senderName || replyTo.nickname || replyTo.displayName || 'Google User',
                    text: (replyTo.text || (replyTo.recTitle ? `🎬 ${replyTo.recTitle}` : (replyTo.moviesCount ? `🎬 ${replyTo.moviesCount} movies` : (replyTo.mediaUrl ? '📷 Media' : '')))).slice(0, MAX_REPLY_PREVIEW_LENGTH)
                } : undefined
            });

            const newMessageRef = dbRef.current.ref(chatPath('messages')).push();
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
        if (reportSending || !dbRef.current || !reportCategory || !currentUserRef.current) return;
        const last = Number(localStorage.getItem(ISSUE_COOLDOWN_KEY) || 0);
        if (Date.now() - last < ISSUE_COOLDOWN_MS) {
            setReportBlocked(true);
            return;
        }
        setReportSending(true);
        try {
            const ctx = reportContext || {};
            const ticketNo = makeTicketNo();
            const timestamp = Date.now();

            // 1. Allocate the feed bubble's key up-front so the report can carry it
            // (ticketMsgId): resolving later flips the SAME bubble in place
            // instead of posting a second message.
            const ticketMsgRef = dbRef.current.ref(chatPath('messages')).push();

            const rawReporterName = typeof (currentUserRef.current.displayName || currentUserRef.current.name) === 'string'
                ? (currentUserRef.current.displayName || currentUserRef.current.name).trim()
                : '';
            const reportedByName = rawReporterName.length > 0
                ? rawReporterName.slice(0, 80)
                : 'Google User';

            const reportPayload = {
                kind: 'issue',
                category: reportCategory,
                description: (reportDesc || '').trim().slice(0, 1000),
                reportedBy: currentUserRef.current.uid,
                reportedByName,
                ticketNo,
                ticketMsgId: ticketMsgRef.key,
                timestamp
            };

            if (typeof window !== 'undefined' && window.location?.href) {
                reportPayload.pageUrl = window.location.href.slice(0, 500);
            }
            if (typeof navigator !== 'undefined' && navigator.userAgent) {
                reportPayload.userAgent = navigator.userAgent.slice(0, 500);
                const summary = summarizeUA(navigator.userAgent);
                if (summary) reportPayload.deviceSummary = summary.slice(0, 100);
            }
            if (ctx.title || ctx.route) {
                reportPayload.mediaContext = String(ctx.title || ctx.route).slice(0, 500);
            }

            await dbRef.current.ref(chatPath('reports')).push(reportPayload);

            // 2. Announce the new ticket in the global chat via valid ticket message
            const ticketMsg = buildTicketMessage({
                identity: currentUserRef.current,
                timestamp,
                ticketNo,
                category: reportCategory
            });
            await ticketMsgRef.set(ticketMsg);

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
        const nameToInsert = user.isEveryone ? 'everyone' : (user.displayName || 'Google User');
        setMessageText(`${before}@${nameToInsert} ${after}`);
        setShowMentionList(false);
        inputRef.current?.focus();
    };

    // Filter users for mentions
    const filteredUsers = allUsers.filter(u =>
        (u.displayName || '').toLowerCase().includes(mentionQuery.toLowerCase()) &&
        u.uid !== currentUserRef.current?.uid
    ).slice(0, 5);

    // Mention options — admins also get a special "everyone" entry at the top
    // that turns the message into an @everyone broadcast when sent.
    const mentionOptions = isGlobalChatAdmin && 'everyone'.includes(mentionQuery.toLowerCase())
        ? [{ uid: '__everyone__', displayName: 'everyone', isEveryone: true }, ...filteredUsers]
        : filteredUsers;

    // Handle message long press (mobile) / right-click (desktop).
    //   • Long-press (touch): reveals the message's OWN inline action buttons
    //     (the same React/Reply/⋮ gc-msg-actions desktop hover shows) instead
    //     of a separate bottom sheet — tap elsewhere to dismiss.
    //   • Right-click (real pointer only): opens the full action sheet,
    //     replacing the browser's native context menu. On Android the native
    //     long-press fires a contextmenu too, so the sheet is skipped there
    //     (the inline actions are already up) to avoid double UI.
    const handleMessageInteraction = (e, msg, type) => {
        if (type === 'contextmenu') {
            e.preventDefault();
        }

        if (type === 'longpress') {
            setHoveredMessageId(msg.id);
            setMoreMenuMessageId(null);
            // The touchend that ends a long-press fires a synthetic click,
            // which would open e.g. the media lightbox — swallow the next one.
            suppressClickRef.current = true;
        } else if (type === 'contextmenu' && HOVER_MQ.matches) {
            setActionSheetTarget(msg);
            setShowActionSheet(true);
            // Keep the hover action buttons out from under the sheet.
            setHoveredMessageId(null);
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

    // Touch long-press reveals a message's inline actions; there is no hover to
    // clear them, so any tap that starts OUTSIDE a message row dismisses them.
    useEffect(() => {
        const dismissActiveActions = (e) => {
            if (!hoveredMessageId) return;
            if (!e.target.closest('.gc-msg')) {
                setHoveredMessageId(null);
                setMoreMenuMessageId(null);
            }
        };
        document.addEventListener('touchstart', dismissActiveActions, true);
        return () => document.removeEventListener('touchstart', dismissActiveActions, true);
    }, [hoveredMessageId]);

    // Handle reaction — one reaction per user per message:
    // picking a different emoji REPLACES the previous one, picking the same
    // emoji removes it (toggle-off). Writes directly to caller's child path.
    const handleReaction = async (emoji) => {
        if (!REACTIONS.includes(emoji)) return;
        const msgId = showReactionPopover || actionSheetTarget?.id;
        if (!msgId || !currentUserRef.current || !dbRef.current) return;

        const uid = currentUserRef.current.uid;
        const targetMsg = messages.find(m => m.id === msgId) || (actionSheetTarget?.id === msgId ? actionSheetTarget : null);
        const currentReaction = targetMsg?.reactions?.[uid];

        try {
            const reactionRef = dbRef.current.ref(chatPath('messages', msgId, 'reactions', uid));
            if (currentReaction === emoji) {
                await reactionRef.remove();
            } else {
                await reactionRef.set(emoji);
            }
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
                messageId: actionSheetTarget.id,
                senderName: actionSheetTarget.senderName || actionSheetTarget.displayName || actionSheetTarget.nickname || 'Google User',
                nickname: actionSheetTarget.senderName || actionSheetTarget.displayName || actionSheetTarget.nickname || 'Google User',
                uid: actionSheetTarget.uid,
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

        const isOwn = currentUserRef.current?.uid && target.uid === currentUserRef.current.uid;
        const isAdmin = isGlobalChatAdmin === true;
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
                    await dbRef.current.ref(chatPath('messages', target.id)).remove();
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
                await dbRef.current.ref(chatPath('messages', target.id)).update({
                    deletedForAll: true,
                    deletedAt: Date.now()
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
            const snapshot = await dbRef.current.ref(chatPath('messages')).once('value');
            const updates = {};
            snapshot.forEach(child => {
                const val = child.val();
                if (val && val.replyTo && (val.replyTo.messageId === id || val.replyTo.id === id)) {
                    updates[`${chatPath('messages', child.key)}/replyTo`] = null;
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
                await dbRef.current.ref(chatPath('pinnedMessage')).remove();
                setPinnedMessage(null);
            } catch (err) {
                console.warn('Unpin failed after delete:', err);
            }
        }
    };

    // Flip a ticket's "open" bubble to "resolved" IN PLACE.
    const resolveTicketMessage = async (report) => {
        if (!dbRef.current || !report?.ticketMsgId || !currentUserRef.current) return;
        try {
            const ticketRef = dbRef.current.ref(chatPath('messages', report.ticketMsgId));
            const existing = await ticketRef.once('value');
            if (existing.exists()) {
                const data = existing.val();
                if (data?.type === 'ticket' && data?.ticketStatus === 'open') {
                    await ticketRef.update({
                        ticketStatus: 'resolved',
                        resolvedAt: Date.now(),
                        resolvedBy: currentUserRef.current.uid
                    });
                }
            }
        } catch (err) {
            console.warn('Failed to resolve ticket message:', err);
        }
    };

    // Handle report message
    const handleReportMessage = async () => {
        if (!actionSheetTarget || !dbRef.current || !currentUserRef.current) return;

        try {
            const ticketNo = makeTicketNo();
            const timestamp = Date.now();
            const ticketMsgRef = dbRef.current.ref(chatPath('messages')).push();

            const report = buildMessageReport(actionSheetTarget, currentUserRef.current);
            report.ticketNo = ticketNo;
            report.timestamp = timestamp;
            report.ticketMsgId = ticketMsgRef.key;

            await dbRef.current.ref(chatPath('reports')).push(report);

            const ticketMsg = buildTicketMessage({
                identity: currentUserRef.current,
                timestamp,
                ticketNo,
                category: 'Report'
            });
            await ticketMsgRef.set(ticketMsg);

            alert('Message reported.');
        } catch (err) {
            console.error('Report message failed:', err);
            alert('Could not report message. Please try again.');
        }

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

    openChatRef.current = handleOpenChat;

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('streamflix:global-chat-state', {
            detail: { isOpen, unreadCount: unreadBroadcastCount }
        }));
    }, [isOpen, unreadBroadcastCount]);

    // Render message
    const renderMessage = (msg) => {
        // Targeted system notices (legacy report confirmations / resolutions)
        // are only visible to their recipient and to admins.
        if (msg.toUid && msg.toUid !== currentUserRef.current?.uid && !isGlobalChatAdmin) {
            return null;
        }

        // Ticket events render as a centered, ticket-stub-shaped notice when
        // created (system card, never a user bubble), but once an admin resolves
        // the ticket the SAME message flips into a regular chat bubble with the
        // admin avatar — so it reads as the admin replying to the ticket.
        if (msg.ticket || msg.type === 'ticket') {
            const isResolved = msg.ticketStatus === 'resolved' || msg.ticketAction === 'resolved';
            return (
                <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`gc-msg ${isResolved ? 'gc-other' : 'gc-msg-ticket'}`}
                    onMouseEnter={() => {
                        if (HOVER_MQ.matches) setHoveredMessageId(msg.id);
                    }}
                    onMouseLeave={() => {
                        setHoveredMessageId(null);
                        setMoreMenuMessageId(null);
                    }}
                >
                    {isResolved && (
                        <img
                            src={msg.senderPhotoURL || msg.photoURL || msg.avatarUrl || ADMIN_AVATAR}
                            alt={msg.senderName || msg.displayName || 'Google User'}
                            className="gc-avatar"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = ADMIN_AVATAR;
                            }}
                        />
                    )}
                    <div className="gc-msg-group">
                        {isResolved ? (
                            <>
                                <div className="gc-sender-name">
                                    {msg.senderName || msg.displayName || 'Google User'}
                                    <span className="gc-admin-badge" title="StreamFlix Admin">
                                        <i className="fa-solid fa-crown"></i>
                                    </span>
                                </div>
                                <div className="gc-bubble-wrapper">
                                    <div className="gc-msg-bubble"
                                        onTouchStart={(e) => handleTouchStart(e, msg)}
                                        onTouchEnd={handleTouchEnd}
                                        onTouchMove={handleTouchMove}
                                        onContextMenu={(e) => handleMessageInteraction(e, msg, 'contextmenu')}
                                    >
                                        <div className="gc-msg-text">
                                            ✅ Ticket {msg.ticketNo ? `#${msg.ticketNo} ` : ''}resolved
                                        </div>
                                    </div>
                                </div>
                                <div className="gc-msg-time">{formatTime(msg.createdAt)}</div>
                            </>
                        ) : (
                            <div className="gc-ticket-stub">
                                <div className="gc-ticket-line">
                                    <span className="gc-ticket-icon">🎫</span>
                                    <span className="gc-ticket-label">Ticket created</span>
                                    {msg.ticketNo && <span className="gc-ticket-no">#{msg.ticketNo}</span>}
                                </div>
                                <div className="gc-ticket-text">
                                    {msg.senderName || msg.reporterName || 'Google User'} created a report{msg.category ? ` — ${msg.category}` : ''}
                                </div>
                                <div className="gc-ticket-time">{formatTime(msg.createdAt)}</div>
                            </div>
                        )}
                    </div>
                    {isGlobalChatAdmin && hoveredMessageId === msg.id && (
                        <div className="gc-msg-actions">
                            <button
                                className="gc-action-icon"
                                title="More"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMoreMenuMessageId(moreMenuMessageId === msg.id ? null : msg.id);
                                }}
                            >
                                ⋮
                            </button>
                            {moreMenuMessageId === msg.id && (
                                <div className="gc-more-menu">
                                    <button
                                        onClick={() => {
                                            setMoreMenuMessageId(null);
                                            handleDeleteMessage(msg);
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (msg.system) {
            return (
                <div key={msg.id} className="gc-msg-system">
                    <span className="gc-msg-system-text">{msg.text}</span>
                    <span className="gc-msg-system-time">{formatTime(msg.createdAt)}</span>
                </div>
            );
        }

        if (msg.deletedForAll) {
            const isOwn = msg.uid === currentUserRef.current?.uid;
            return (
                <div key={msg.id} className={`gc-msg ${isOwn ? 'gc-own' : 'gc-other'}`}>
                    <img
                        src={msg.senderPhotoURL || msg.photoURL || msg.avatarUrl || '/logo/streamflix.png'}
                        alt={msg.senderName || msg.displayName || 'Google User'}
                        className="gc-avatar"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || msg.displayName || 'Google User')}&background=random`;
                        }}
                    />
                    <div className="gc-msg-group">
                        <div className="gc-msg-bubble gc-unsent">
                            <em>{isOwn ? 'You unsent a message' : `${msg.senderName || msg.displayName || 'Someone'} unsent a message`}</em>
                            {isGlobalChatAdmin && (
                                <button
                                    className="gc-admin-purge-btn"
                                    title="Permanently delete"
                                    onClick={async () => {
                                        if (confirm('Permanently remove this placeholder?')) {
                                            setMessages(prev => prev.filter(m => m.id !== msg.id));
                                            deletedMsgIdsRef.current.add(msg.id);
                                            try {
                                                await dbRef.current.ref(chatPath('messages', msg.id)).remove();
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

        const isOwn = currentUserRef.current?.uid && msg.uid === currentUserRef.current.uid;
        const reactionData = getReactionData(msg.reactions, currentUserRef.current?.uid);
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
                    src={msg.senderPhotoURL || msg.photoURL || msg.avatarUrl || '/logo/streamflix.png'}
                    alt={msg.senderName || msg.displayName || 'Google User'}
                    className="gc-avatar"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || msg.displayName || 'Google User')}&background=random`;
                    }}
                />
                <div className="gc-msg-group">
                    {!isOwn && (
                        <div className="gc-sender-name">
                            {msg.senderName || msg.displayName || 'Google User'}
                            {msg.senderIsAdmin && (
                                <span className="gc-admin-badge" title="StreamFlix Admin">
                                    <i className="fa-solid fa-crown"></i>
                                </span>
                            )}
                        </div>
                    )}
                    {msg.replyTo && !deletedMsgIdsRef.current.has(msg.replyTo.messageId || msg.replyTo.id) && (
                        <>
                            <div className="gc-reply-header">
                                <span className="gc-reply-icon">↩</span> {isOwn ? 'You' : (msg.senderName || msg.displayName || msg.nickname || 'Google User')} replied to {msg.replyTo.uid === currentUserRef.current?.uid ? 'you' : (msg.replyTo.senderName || msg.replyTo.nickname || 'Google User')}
                            </div>
                            <div
                                className="gc-reply-preview"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    scrollToRepliedMessage(msg.replyTo.messageId || msg.replyTo.id);
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
                                    className={`gc-reaction-badge ${reactionData.userReacted ? 'user-reacted' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowReactionView(msg);
                                    }}
                                    title="View reactions"
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
                                        messageId: msg.id,
                                        senderName: msg.senderName || msg.displayName || msg.nickname || 'Google User',
                                        nickname: msg.senderName || msg.displayName || msg.nickname || 'Google User',
                                        text: msg.text || '',
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
                                        setReplyTo({
                                            id: msg.id,
                                            messageId: msg.id,
                                            senderName: msg.senderName || msg.displayName || msg.nickname || 'Google User',
                                            nickname: msg.senderName || msg.displayName || msg.nickname || 'Google User',
                                            text: msg.text || '',
                                            uid: msg.uid,
                                            moviesCount: msg.movies?.length || 0,
                                            recTitle: msg.recTitle || null
                                        });
                                        setMoreMenuMessageId(null);
                                        inputRef.current?.focus();
                                    }}>
                                        Reply
                                    </button>
                                    {msg.text && (
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(msg.text);
                                            setMoreMenuMessageId(null);
                                        }}>
                                            Copy Text
                                        </button>
                                    )}
                                    {(isOwn || isGlobalChatAdmin) && (
                                        <button onClick={() => {
                                            setMoreMenuMessageId(null);
                                            // handleDeleteMessage reads the passed msg directly, so no
                                            // setTimeout/state round-trip is needed.
                                            handleDeleteMessage(msg);
                                        }}>
                                            {isGlobalChatAdmin ? 'Delete' : 'Unsend'}
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
                                            if (!currentUserRef.current || !dbRef.current) return;
                                            try {
                                                const ticketNo = makeTicketNo();
                                                const timestamp = Date.now();
                                                const ticketMsgRef = dbRef.current.ref(chatPath('messages')).push();

                                                const report = buildMessageReport(msg, currentUserRef.current);
                                                report.ticketNo = ticketNo;
                                                report.timestamp = timestamp;
                                                report.ticketMsgId = ticketMsgRef.key;

                                                await dbRef.current.ref(chatPath('reports')).push(report);

                                                const ticketMsg = buildTicketMessage({
                                                    identity: currentUserRef.current,
                                                    timestamp,
                                                    ticketNo,
                                                    category: 'Report'
                                                });
                                                await ticketMsgRef.set(ticketMsg);

                                                alert('Message reported.');
                                            } catch (err) {
                                                console.error('Report message failed:', err);
                                                alert('Could not report message. Please try again.');
                                            }
                                            setMoreMenuMessageId(null);
                                        }}>
                                            Report
                                        </button>
                                    )}
                                    {isGlobalChatAdmin && (
                                        <button onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                const isPinned = pinnedMessage?.id === msg.id;
                                                if (isPinned) {
                                                    await dbRef.current.ref(chatPath('pinnedMessage')).remove();
                                                    setPinnedMessage(null);
                                                } else {
                                                    const pinData = {
                                                        id: msg.id,
                                                        text: msg.text || '[Media]',
                                                        senderName: msg.senderName || msg.displayName || 'Admin',
                                                        senderPhotoURL: msg.senderPhotoURL || msg.photoURL || null,
                                                        pinnedAt: Date.now(),
                                                        pinnedBy: currentUserRef.current.uid
                                                    };
                                                    await dbRef.current.ref(chatPath('pinnedMessage')).set(pinData);
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
                        {isOwn && (() => {
                            const delivery = (msg?.status === 'sending' || msg?._sending)
                                ? 'sending'
                                : (isMessageSeen(msg) ? 'seen' : 'sent');
                            return (
                                <span className={`gc-status-icon ${delivery}`}>
                                    {delivery === 'sending' && ' ○'}
                                    {delivery === 'sent' && ' ✓'}
                                    {delivery === 'seen' && ' ✓✓'}
                                </span>
                            );
                        })()}
                    </div>
                </div >
            </div >
        );
    };

    return (
        <div className={`gc-wrapper ${isOpen ? 'chat-open' : ''}`}>
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
                                src={userDataRef.current.photoURL || '/logo/streamflix.png'}
                                alt="StreamFlix"
                                className="gc-header-avatar"
                                onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=SF&background=e50914&color=fff'; }}
                            />
                        </div>
                        <div className="gc-header-info">
                            <span className="gc-header-name">StreamFlix Community</span>
                            <span className="gc-header-status">{sessionState === 'ready' ? 'Live Chat' : 'Sign In'}</span>
                        </div>
                    </div>
                    <div className="gc-header-actions">
                        {/* Reports button (admin only) */}
                        {isGlobalChatAdmin && (
                            <button
                                className="gc-icon-btn"
                                onClick={() => {
                                    loadReports();
                                    setShowReports(true);
                                }}
                                title="Reports"
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                                </svg>
                            </button>
                        )}
                        <button className="gc-close-btn" onClick={handleCloseChat}>
                            <img src="/icons/close-circle.svg" alt="Close" style={{ width: '24px', height: '24px', filter: 'brightness(0) invert(1)' }} />
                        </button>
                    </div>
                </div>

                {/* Panel Body: Sign-In Wall or Chat View */}
                {sessionState !== 'ready' ? (
                    <GlobalChatSignInWall />
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
                                    <span className="gc-pinned-label">Pinned by {pinnedMessage.senderName || pinnedMessage.displayName || 'Admin'}</span>
                                    <span className="gc-pinned-text">{pinnedMessage.text}</span>
                                </div>
                                {isGlobalChatAdmin && (
                                    <button
                                        className="gc-unpin-btn"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await dbRef.current.ref(chatPath('pinnedMessage')).remove();
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
                                        Replying to <b>{replyTo.senderName || replyTo.nickname || replyTo.displayName || 'Google User'}</b>
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
                                            key={user.uid}
                                            className={`gc-mention-item ${user.isEveryone ? 'gc-mention-everyone' : ''}`}
                                            onClick={() => handleSelectMention(user)}
                                        >
                                            {user.isEveryone ? (
                                                <span className="gc-mention-everyone-icon">📢</span>
                                            ) : (
                                                <img
                                                    src={user.photoURL || '/logo/streamflix.png'}
                                                    alt={user.displayName || 'Google User'}
                                                    className="gc-mention-avatar"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`;
                                                    }}
                                                />
                                            )}
                                            <span>{user.displayName}</span>
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
                showReactionPopover && (() => {
                    const targetMsg = messages.find(m => m.id === showReactionPopover) ||
                        (actionSheetTarget?.id === showReactionPopover ? actionSheetTarget : null);
                    const currentReaction = targetMsg?.reactions?.[currentUserRef.current?.uid];
                    return (
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
                                        className={`gc-reaction-icon ${currentReaction === emoji ? 'selected' : ''}`}
                                        onClick={() => handleReaction(emoji)}
                                    >
                                        {emoji}
                                    </span>
                                ))}
                            </div>
                        </>
                    );
                })()
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
                                {(() => {
                                    const currentReaction = actionSheetTarget?.reactions?.[currentUserRef.current?.uid];
                                    return REACTIONS.map(emoji => (
                                        <span
                                            key={emoji}
                                            className={`gc-reaction-icon ${currentReaction === emoji ? 'selected' : ''}`}
                                            onClick={() => handleReaction(emoji)}
                                        >
                                            {emoji}
                                        </span>
                                    ));
                                })()}
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
                            {(actionSheetTarget?.uid === currentUserRef.current?.uid || isGlobalChatAdmin) && (
                                <button className="gc-sheet-btn danger" onClick={() => handleDeleteMessage()}>
                                    {isGlobalChatAdmin ? '🗑️ Delete for everyone' : '🗑️ Unsend'}
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
                                {showReactionView.reactions && typeof showReactionView.reactions === 'object' &&
                                    Object.entries(showReactionView.reactions)
                                        .filter(([uid, emoji]) => uid && emoji && REACTIONS.includes(emoji))
                                        .map(([uid, emoji]) => {
                                            const profile = allUsers.find(u => u.uid === uid);
                                            const name = profile?.displayName || 'Google User';
                                            const avatarUrl = profile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
                                            return (
                                                <div key={`${uid}-${emoji}`} className="gc-reaction-item">
                                                    <img
                                                        src={avatarUrl}
                                                        alt={name}
                                                        className="gc-reaction-item-avatar"
                                                        onError={(e) => {
                                                            e.currentTarget.onerror = null;
                                                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
                                                        }}
                                                    />
                                                    <span className="gc-reaction-item-name">{name}</span>
                                                    <span className="gc-reaction-item-emoji">{emoji}</span>
                                                </div>
                                            );
                                        })
                                }
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Reports Panel (Admin Only) */}
            {
                showReports && isGlobalChatAdmin && (
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
                                                                {report.context.route && report.context.route !== '/' && (
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
                                                            <span className="gc-report-from">— {report.messageSenderName || 'Google User'}</span>
                                                        </div>
                                                    </>
                                                )}
                                                {report.msgId && (
                                                    <div className="gc-report-msgid">
                                                        Message ID: <code>{report.msgId}</code>
                                                    </div>
                                                )}
                                                <div className="gc-report-reporter">
                                                    Reported by: {report.reportedByName || 'Unknown'}
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
                                                            if (resolvingReportsRef.current.has(report.id)) return;
                                                            resolvingReportsRef.current.add(report.id);
                                                            try {
                                                                await dbRef.current.ref(chatPath('reports', report.id)).remove();
                                                                setReports(prev => prev.filter(r => r.id !== report.id));
                                                                // Flip the ticket's "created" bubble to "resolved" in the feed —
                                                                // the same bubble changes state, no second message.
                                                                await resolveTicketMessage(report);
                                                            } finally {
                                                                resolvingReportsRef.current.delete(report.id);
                                                            }
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
