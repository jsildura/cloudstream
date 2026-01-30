import { useState, useEffect, useRef, useCallback } from 'react';
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
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ADMIN_NICKNAME = "StreamFlix";
const ADMIN_AVATAR = "/logo/streamflix.png";
// Google Apps Script URL for file uploads (same as Shakzz-TV)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzTmKrwPjOOhL-H7rXVLvs_p9ZPb5aulvhzNhxRlA3x3byy81tUnyFl66MQ5DvEvNo/exec";

function GlobalChat() {
    // State
    const [showFab, setShowFab] = useState(false); // Delay FAB until loading screen finishes
    const [isOpen, setIsOpen] = useState(false);
    const [isSetup, setIsSetup] = useState(true);
    const [nickname, setNickname] = useState('');
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
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
    const [showCamera, setShowCamera] = useState(false);
    const [cameraMode, setCameraMode] = useState('photo');
    const [capturedMedia, setCapturedMedia] = useState(null);
    const [showLightbox, setShowLightbox] = useState(null);
    const [isRecording, setIsRecording] = useState(false);

    // Admin states
    const [showReports, setShowReports] = useState(false);
    const [reports, setReports] = useState([]);
    const [profileImage, setProfileImage] = useState(null);

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
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const longPressTimerRef = useRef(null);

    // Delay FAB visibility until loading screen is gone (4s + 0.5s fade)
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowFab(true);
        }, 4500);
        return () => clearTimeout(timer);
    }, []);

    // Initialize Firebase
    useEffect(() => {
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
                            console.log('User profile deleted, resetting to setup...');
                            userDataRef.current = {};
                            setIsSetup(true);
                            setMessages([]);
                        } else if (snap.exists()) {
                            // Keep userDataRef in sync
                            userDataRef.current = snap.val();
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

    // Start live listener
    const startLiveListener = useCallback(() => {
        if (!dbRef.current) return;

        const messagesRef = dbRef.current.ref('messages');

        const addedCallback = (snapshot) => {
            const newMsg = { id: snapshot.key, ...snapshot.val() };

            setMessages(prev => {
                if (prev.find(m => m.id === snapshot.key)) return prev;

                if (!isOpen && newMsg.uid !== currentUserRef.current?.uid) {
                    setUnreadCount(c => c + 1);
                }

                return [...prev, newMsg];
            });

            if (!oldestKeyRef.current) oldestKeyRef.current = snapshot.key;

            if (isOpen) {
                scrollToBottom(false);
                if (snapshot.val().uid !== currentUserRef.current?.uid) {
                    updateMessageStatus(snapshot.key, 'seen');
                }
            }
        };

        const changedCallback = (snapshot) => {
            const updatedMsg = { id: snapshot.key, ...snapshot.val() };
            setMessages(prev => prev.map(m => m.id === snapshot.key ? updatedMsg : m));
        };

        // Handle message removal (hard delete)
        const removedCallback = (snapshot) => {
            console.log('Message removed from DB:', snapshot.key);
            setMessages(prev => prev.filter(m => m.id !== snapshot.key));
        };

        messagesRef.limitToLast(1).on('child_added', addedCallback);
        messagesRef.on('child_changed', changedCallback);
        messagesRef.on('child_removed', removedCallback);

        listenersRef.current.push(
            () => messagesRef.off('child_added', addedCallback),
            () => messagesRef.off('child_changed', changedCallback),
            () => messagesRef.off('child_removed', removedCallback)
        );
    }, [isOpen]);

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

        requestAnimationFrame(() => {
            if (container) {
                container.scrollTop = container.scrollHeight - oldHeight;
            }
            isLoadingHistoryRef.current = false;
        });
    }, []);

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
            if (msg.uid !== currentUserRef.current.uid &&
                msg.status === 'sent' &&
                !msg.deletedForAll) {
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
            } catch (e) {
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

    // Handle file selection
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            alert('File too large! Maximum size is 10MB.');
            return;
        }

        if (pendingBlobUrl) URL.revokeObjectURL(pendingBlobUrl);

        setPendingFile(file);
        setPendingBlobUrl(URL.createObjectURL(file));
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
        setUnreadCount(0);
        scrollToBottom(true);
        if (messages.length > 0) {
            markMessagesAsSeen(messages);
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

            await dbRef.current.ref(`users/${currentUserRef.current.uid}`).set({
                uid: currentUserRef.current.uid,
                nickname: nickname.trim(),
                avatarUrl,
                isAdmin: false,
                joinedAt: window.firebase.database.ServerValue.TIMESTAMP
            });

            userDataRef.current = {
                nickname: nickname.trim(),
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

    // Handle admin login
    const handleAdminLogin = async () => {
        const password = prompt('Enter Admin Password:');
        if (!password) return;

        try {
            const snapshot = await dbRef.current.ref('secrets/admin_key').once('value');
            if (!snapshot.exists()) {
                alert('Admin configuration missing. Please set up admin key in Firebase.');
                return;
            }

            const storedHash = snapshot.val();

            // Hash the input password
            const msgBuffer = new TextEncoder().encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (inputHash === storedHash) {
                // Fetch persistent admin profile from Firebase (cross-device sync)
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
                        // Cache to localStorage for offline access
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

                // Optimistic Update: Set local state immediately
                userDataRef.current = {
                    nickname: finalNickname,
                    avatarUrl: finalAvatarUrl,
                    adminBadge: finalBadge,
                    isAdmin: true
                };

                setNickname(finalNickname);
                setIsSetup(false);
                loadMessages();

                // Show welcome message
                alert('Welcome Admin!');

                // Then attempt DB update (non-blocking for UI)
                try {
                    await dbRef.current.ref(`users/${currentUserRef.current.uid}`).update({
                        nickname: finalNickname,
                        avatarUrl: finalAvatarUrl,
                        adminBadge: finalBadge,
                        isAdmin: true
                    });
                } catch (dbErr) {
                    console.error('DB Update failed (Permissions?):', dbErr);
                    // Do not revert UI, allow local admin session to continue
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
        if (!text && !pendingFile) return;
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

            const message = {
                uid: currentUserRef.current.uid,
                nickname: userDataRef.current.nickname,
                avatarUrl: userDataRef.current.avatarUrl,
                isAdmin: userDataRef.current.isAdmin || false,
                adminBadge: userDataRef.current.adminBadge || null,
                text,
                mediaUrl,
                mediaType,
                status: 'sent',
                createdAt: window.firebase.database.ServerValue.TIMESTAMP,
                replyTo: replyTo ? {
                    id: replyTo.id,
                    nickname: replyTo.nickname,
                    text: replyTo.text?.substring(0, 50) || ''
                } : null
            };

            await newMessageRef.set(message);

            setMessageText('');
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
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: true
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setShowCamera(true);
        } catch (err) {
            console.error('Camera error:', err);
            alert('Camera access denied or not available.');
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setShowCamera(false);
        setCapturedMedia(null);
        setIsRecording(false);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            setCapturedMedia({
                blob,
                type: 'image',
                url: URL.createObjectURL(blob)
            });
        }, 'image/jpeg', 0.85);
    };

    const startRecording = () => {
        if (!streamRef.current) return;

        chunksRef.current = [];
        const recorder = new MediaRecorder(streamRef.current);

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
            setCapturedMedia({
                blob,
                type: 'video',
                url: URL.createObjectURL(blob)
            });
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const sendCapturedMedia = async () => {
        if (!capturedMedia) return;

        const fileName = capturedMedia.type === 'image' ? 'photo.jpg' : 'video.mp4';
        const file = new File([capturedMedia.blob], fileName, { type: capturedMedia.blob.type });

        setPendingFile(file);
        setPendingBlobUrl(capturedMedia.url);
        stopCamera();

        // Auto-send
        setIsSending(true);
        try {
            const mediaUrl = await uploadToDrive(file);
            const newMessageRef = dbRef.current.ref('messages').push();

            await newMessageRef.set({
                uid: currentUserRef.current.uid,
                nickname: userDataRef.current.nickname,
                avatarUrl: userDataRef.current.avatarUrl,
                isAdmin: userDataRef.current.isAdmin || false,
                text: '',
                mediaUrl,
                mediaType: capturedMedia.type,
                status: 'sent',
                createdAt: window.firebase.database.ServerValue.TIMESTAMP,
                replyTo: null
            });

            removePendingFile();
            scrollToBottom(true);
        } catch (e) {
            console.error('Send error:', e);
            alert('Failed to send media');
        } finally {
            setIsSending(false);
        }
    };

    // Handle key press
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
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

    // Handle message long press (mobile) / right-click (desktop)
    const handleMessageInteraction = (e, msg, type) => {
        if (type === 'longpress') {
            e.preventDefault();
            setActionSheetTarget(msg);
            setShowActionSheet(true);

            // Show reaction popover position
            const rect = e.currentTarget.getBoundingClientRect();
            setPopoverPosition({
                top: rect.top - 50,
                left: rect.left + rect.width / 2 - 100
            });
            setShowReactionPopover(msg.id);
        }
    };

    // Touch handlers for long press
    const handleTouchStart = (e, msg) => {
        if (e.target.closest('.gc-reaction-badge')) return;

        longPressTimerRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            handleMessageInteraction(e, msg, 'longpress');
        }, 500);
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimerRef.current);
    };

    // Handle reaction
    const handleReaction = async (emoji) => {
        const msgId = showReactionPopover || actionSheetTarget?.id;
        if (!msgId || !currentUserRef.current || !dbRef.current) return;

        try {
            const reactionRef = dbRef.current.ref(`messages/${msgId}/reactions/${emoji}/${currentUserRef.current.uid}`);
            const snapshot = await reactionRef.once('value');

            if (snapshot.exists()) {
                await reactionRef.remove();
            } else {
                await reactionRef.set(userDataRef.current.nickname);
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
                nickname: actionSheetTarget.nickname,
                text: actionSheetTarget.text
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

    // Handle delete message
    const handleDeleteMessage = async (targetMsg = null) => {
        // Ensure targetMsg is a real message object, not a click event
        const realTarget = (targetMsg && targetMsg.id) ? targetMsg : actionSheetTarget;
        const target = realTarget;

        if (!target) return;

        // DEBUG: Verify Logic
        console.log('Unsend Clicked. Admin:', userDataRef.current.isAdmin, 'Target:', target.id);

        const isOwn = target.uid === currentUserRef.current?.uid;
        const canDelete = isOwn || userDataRef.current.isAdmin;

        if (canDelete) {
            if (userDataRef.current.isAdmin) {
                // Hard delete for admins
                if (confirm('Permanently delete this message? This cannot be undone.')) {
                    try {
                        console.log('Attempting remove for:', target.id);
                        await dbRef.current.ref(`messages/${target.id}`).remove();
                        console.log('Remove SUCCEEDED for:', target.id);
                    } catch (err) {
                        console.error('Remove FAILED:', err);
                        alert('Delete failed: ' + err.message);
                    }
                }
            } else {
                // Soft delete for users
                if (confirm('Unsend this message for everyone?')) {
                    await dbRef.current.ref(`messages/${target.id}`).update({
                        deletedForAll: true
                    });
                }
            }
        }

        setShowActionSheet(false);
        setShowReactionPopover(null);
    };

    // Handle report message
    const handleReportMessage = async () => {
        if (!actionSheetTarget || !dbRef.current) return;

        await dbRef.current.ref('reports').push({
            msgId: actionSheetTarget.id,
            reportedBy: currentUserRef.current.uid,
            timestamp: Date.now()
        });

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
            const count = Object.keys(users).length;
            if (count > 0) {
                counts[emoji] = count;
                total += count;
            }
        });

        if (total === 0) return null;

        const emojis = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).join('');
        return { emojis: emojis.substring(0, 3), total };
    };

    // Format time
    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const mins = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${mins}`;
    };

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
                                            try {
                                                await dbRef.current.ref(`messages/${msg.id}`).remove();
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
                onMouseEnter={() => setHoveredMessageId(msg.id)}
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
                    {msg.replyTo && (
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
                                <div className="gc-reply-text">{msg.replyTo.text || '📷 Media'}</div>
                            </div>
                        </>
                    )}
                    <div className="gc-bubble-wrapper">
                        <div
                            className={`gc-msg-bubble ${isMediaOnly ? 'gc-media-bubble' : ''}`}
                            onTouchStart={(e) => handleTouchStart(e, msg)}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchEnd}
                            onContextMenu={(e) => handleMessageInteraction(e, msg, 'contextmenu')}
                        >
                            {msg.text && (
                                <div>
                                    {msg.text}
                                    {msg.isEdited && <span className="gc-edited-label"> (edited)</span>}
                                </div>
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
                                        uid: msg.uid
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
                                        setReplyTo({ id: msg.id, nickname: msg.nickname, text: msg.text, uid: msg.uid });
                                        setMoreMenuMessageId(null);
                                        inputRef.current?.focus();
                                    }}>
                                        Reply
                                    </button>
                                    {(isOwn || userDataRef.current.isAdmin) && (
                                        <button onClick={() => {
                                            setActionSheetTarget(msg);
                                            // Small timeout to allow state update before function runs (though handle functions usually read state, actionSheetTarget is ref or state? It is state).
                                            // Actually, handleDeleteMessage reads actionSheetTarget.
                                            // If I set state, it won't be available immediately in the same tick if I call the function.
                                            // Better approach: Pass msg to handleDeleteMessage.
                                            setTimeout(() => handleDeleteMessage(msg), 0);
                                            setMoreMenuMessageId(null);
                                        }}>
                                            Unsend
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
                                            await dbRef.current.ref('reports').push({
                                                msgId: msg.id,
                                                reportedBy: currentUserRef.current.uid,
                                                timestamp: Date.now()
                                            });
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
                <button className="gc-fab" onClick={handleOpenChat}>
                    <svg viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                    </svg>
                    {unreadCount > 0 && (
                        <span className="gc-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                </button>
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
                                    onChange={(e) => setNickname(e.target.value.slice(0, 15))}
                                    maxLength={15}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinChat()}
                                />
                            </div>
                            {error && <p className="gc-error-msg">{error}</p>}
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
                            <div className="gc-avatar-picker-overlay" onClick={() => setShowAvatarPicker(false)}>
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
                                        {replyTo.text || '📷 Media'}
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

                        {/* Footer */}
                        <div className="gc-footer">
                            {/* Mention List */}
                            {showMentionList && filteredUsers.length > 0 && (
                                <div className="gc-mention-list show">
                                    {filteredUsers.map(user => (
                                        <div
                                            key={user.uid}
                                            className="gc-mention-item"
                                            onClick={() => handleSelectMention(user)}
                                        >
                                            <img src={user.avatarUrl} alt="" className="gc-mention-avatar" />
                                            <span>{user.nickname}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="gc-input-wrapper">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className="gc-msg-input"
                                    placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                                    value={messageText}
                                    onChange={handleInputChange}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            isEditing ? updateMessage() : handleSendMessage();
                                        }
                                    }}
                                />
                            </div>
                            <button
                                className="gc-send-btn"
                                onClick={isEditing ? updateMessage : handleSendMessage}
                                disabled={(!messageText.trim() && !pendingFile) || isSending}
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
                                    🗑️ Unsend
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
                                {showReactionView.reactions && Object.entries(showReactionView.reactions).map(([emoji, users]) => (
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
                    <div className="gc-admin-settings-overlay" onClick={() => setShowAdminSettings(false)}>
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
                                        } catch (e) {
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

                                        userDataRef.current = {
                                            ...userDataRef.current,
                                            nickname: adminNickname.trim() || ADMIN_NICKNAME,
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
                                    reports.map(report => (
                                        <div key={report.id} className="gc-report-item">
                                            <div className="gc-report-time">
                                                {new Date(report.timestamp).toLocaleString()}
                                            </div>
                                            <div className="gc-report-msgid">
                                                Message ID: <code>{report.msgId}</code>
                                            </div>
                                            <div className="gc-report-actions">
                                                <button
                                                    className="gc-report-locate"
                                                    onClick={() => {
                                                        scrollToRepliedMessage(report.msgId);
                                                        setShowReports(false);
                                                    }}
                                                >
                                                    Locate
                                                </button>
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
                                    ))
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
