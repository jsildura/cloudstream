import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { chatPath, MAX_FAQ_QUESTION_LENGTH, MAX_FAQ_ANSWER_LENGTH, MAX_FAQ_ITEMS } from '../lib/globalChatModel';
import {
    ADMIN_BADGES,
    DEFAULT_ADMIN_BADGE_ID,
    FALLBACK_AVATAR,
    ADMIN_NAME_MAX_LENGTH,
    isValidAdminPhotoURL,
    validateAdminName
} from '../lib/globalChatAdminIdentity';
import { AVATAR_ACCEPT, AVATAR_EXTENSIONS, formatDriveUrl, uploadToDrive, validateAvatarFile } from '../lib/globalChatUpload';
import { REPORT_FILTERS, REPORT_FILTER_LABELS, filterReports, reportStatus, summarizeUA } from '../lib/globalChatReports';
import { CHAT_COMMANDS } from '../lib/chatCommands';
import GlobalChatAdminBadge from './GlobalChatAdminBadge';
import './GlobalChatAdminDashboard.css';

/* Line icons, drawn with currentColor so a section inherits the nav state. */
const SECTION_ICONS = {
    profile: (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="8.2" r="3.6" />
            <path d="M5 20c.7-3.6 3.5-5.6 7-5.6s6.3 2 7 5.6" />
        </svg>
    ),
    commands: (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="3.4" />
            <path d="M7.6 10.2l2.3 2.3-2.3 2.3M12.8 14.8h3.7" />
        </svg>
    ),
    reports: (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.2 21V4" />
            <path d="M6.2 4.9c3.4-1.7 5.7.9 9.1-.8v7.8c-3.4 1.7-5.7-.9-9.1.8" />
        </svg>
    )
};

/**
 * Three sections, not five tabs: name, avatar, and badge are all facets of the
 * same thing — how an admin appears in chat — so they live together under
 * Profile.
 */
const SECTIONS = [
    { id: 'profile', label: 'Profile', blurb: 'How you appear in chat' },
    { id: 'commands', label: 'Commands', blurb: 'Slash commands and FAQ' },
    { id: 'reports', label: 'Reports', blurb: 'Triage what members flag' }
];

const SECTION_IDS = new Set(SECTIONS.map(s => s.id));

/** The pre-merge tabs still arrive from deep links and older callers. */
const LEGACY_SECTIONS = { identity: 'profile', avatar: 'profile', badge: 'profile' };

/**
 * Resolve an incoming tab id to one of the three sections. Anything
 * unrecognised opens Profile rather than rendering an empty body.
 */
function normalizeSection(tab) {
    if (!tab) return null;
    const id = LEGACY_SECTIONS[tab] || tab;
    return SECTION_IDS.has(id) ? id : 'profile';
}

/**
 * A PERMISSION_DENIED here almost always means the rules have not been deployed
 * yet, or the signed-in account lost the globalChatAdmin claim. Both are worth
 * saying out loud — a generic "save failed" sends the admin hunting in the
 * wrong place.
 */
function describeWriteError(err) {
    const message = err?.message || '';
    if (err?.code === 'PERMISSION_DENIED' || message.includes('PERMISSION_DENIED')) {
        return 'The database rejected this write. Either the chat rules have not been deployed yet, or this account no longer holds the chat-admin claim.';
    }
    return message || 'Save failed.';
}

/**
 * Admin Management Dashboard for GlobalChat.
 *
 * Lets a claim-verified admin set the chat name, avatar, and badge that overlay
 * their messages, curate the slash-command FAQ, and triage user reports. The
 * `isAdmin` guard here is defence in depth and a UI concern only —
 * `database.rules.json` is the real boundary: every override field validates
 * `auth.token.globalChatAdmin === true`, and reads under `reports/` require the
 * same claim.
 */
export default function GlobalChatAdminDashboard({
    db,
    uid,
    isAdmin,
    activeTab,
    overrides,
    reports = [],
    onTabChange,
    onClose,
    onLocateMessage,
    onResolveTicketMessage,
    resolvingRef
}) {
    const isOpen = Boolean(activeTab) && isAdmin === true;
    const section = normalizeSection(activeTab);

    const [nameDraft, setNameDraft] = useState('');
    const [badgeDraft, setBadgeDraft] = useState(DEFAULT_ADMIN_BADGE_ID);
    const [photoDraft, setPhotoDraft] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [reportFilter, setReportFilter] = useState('pending');

    // FAQ management state
    const [faqItems, setFaqItems] = useState([]);
    const [faqEditId, setFaqEditId] = useState(null);
    const [faqDraftQ, setFaqDraftQ] = useState('');
    const [faqDraftA, setFaqDraftA] = useState('');
    const [faqAdding, setFaqAdding] = useState(false);
    const [faqBusy, setFaqBusy] = useState(false);

    const panelRef = useRef(null);
    const bodyRef = useRef(null);
    const fileInputRef = useRef(null);
    const fallbackResolvingRef = useRef(new Set());
    const resolving = resolvingRef || fallbackResolvingRef;

    const adminName = overrides?.adminName || null;
    const adminPhotoURL = overrides?.adminPhotoURL || null;
    const adminBadge = overrides?.adminBadge || null;

    // Re-seed the drafts from the live profile each time the dashboard opens, so
    // a discarded edit never resurfaces on reopen.
    useEffect(() => {
        if (!isOpen) return;
        setNameDraft(adminName || '');
        setBadgeDraft(adminBadge || DEFAULT_ADMIN_BADGE_ID);
        setPhotoDraft(null);
        setStatus(null);
        setError(null);
        // Intentionally keyed on isOpen alone: a live profile update while the
        // dashboard is open must not clobber what the admin is typing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose?.();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    // Load FAQ items only while the Commands section is on screen.
    useEffect(() => {
        if (!isOpen || section !== 'commands' || !db) return;
        let active = true;
        const faqRef = db.ref(chatPath('commands', 'faq'));
        const callback = (snapshot) => {
            if (!active) return;
            if (!snapshot.exists()) {
                setFaqItems([]);
                return;
            }
            const items = [];
            snapshot.forEach(child => {
                const val = child.val();
                if (val && val.question && val.answer) {
                    items.push({ id: child.key, ...val });
                }
            });
            items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            setFaqItems(items);
        };
        faqRef.on('value', callback, (err) => {
            console.error('Error loading FAQ items:', err);
            if (active) setFaqItems([]);
        });
        return () => {
            active = false;
            faqRef.off('value', callback);
        };
    }, [isOpen, section, db]);

    useEffect(() => {
        if (isOpen) panelRef.current?.focus();
    }, [isOpen]);

    // One scrolling body serves all three sections, so it would otherwise open
    // a new section already scrolled to wherever the last one was left.
    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
    }, [section]);

    const nameCheck = useMemo(
        () => (nameDraft === '' ? { ok: true, error: null } : validateAdminName(nameDraft)),
        [nameDraft]
    );

    const previewName = nameDraft || 'Your Google name';
    const previewPhoto = photoDraft || adminPhotoURL || FALLBACK_AVATAR;

    const writeOverrides = useCallback(async (patch) => {
        if (!db || !uid) {
            setError('Chat is not connected yet.');
            return false;
        }
        setBusy(true);
        setError(null);
        setStatus(null);
        try {
            await db.ref(chatPath('profiles', uid)).update({ ...patch, adminUpdatedAt: Date.now() });
            return true;
        } catch (err) {
            console.error('Admin override write failed:', err);
            setError(describeWriteError(err));
            return false;
        } finally {
            setBusy(false);
        }
    }, [db, uid]);

    const handleSaveIdentity = async () => {
        const check = validateAdminName(nameDraft);
        if (!check.ok) {
            setError(check.error);
            return;
        }
        if (await writeOverrides({ adminName: nameDraft, adminBadge: badgeDraft })) {
            setStatus('Chat identity saved.');
        }
    };

    const handleResetName = async () => {
        // Deleting a field skips .validate entirely, so clearing an override
        // works even for an account that just lost the claim.
        if (await writeOverrides({ adminName: null })) {
            setNameDraft('');
            setStatus('Reverted to your Google name.');
        }
    };

    const handleSaveBadge = async (badgeId) => {
        setBadgeDraft(badgeId);
        if (await writeOverrides({ adminBadge: badgeId })) {
            setStatus('Badge saved.');
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0] || null;
        // Clear the input so re-picking the same file still fires a change.
        e.target.value = '';
        setStatus(null);
        setError(null);
        if (!file) return;

        // Reject before anything leaves the browser.
        const check = validateAvatarFile(file);
        if (!check.ok) {
            setError(check.error);
            return;
        }

        setBusy(true);
        try {
            const rawUrl = await uploadToDrive({ file, uid });
            const url = formatDriveUrl(rawUrl);
            // Re-check against the same shape the rules pin, so a surprising
            // response from the upload endpoint fails here with a clear message
            // instead of as an opaque PERMISSION_DENIED.
            if (!isValidAdminPhotoURL(url)) {
                setError('The upload did not return a usable image URL. Try again.');
                return;
            }
            setBusy(false);
            if (await writeOverrides({ adminPhotoURL: url })) {
                setPhotoDraft(url);
                setStatus('Avatar updated.');
            }
        } catch (err) {
            console.error('Avatar upload failed:', err);
            setError(err?.message || 'Upload failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleResetAvatar = async () => {
        if (await writeOverrides({ adminPhotoURL: null })) {
            setPhotoDraft(null);
            setStatus('Reverted to your Google photo.');
        }
    };

    const updateReport = useCallback(async (report, patch) => {
        if (!db || resolving.current.has(report.id)) return;
        resolving.current.add(report.id);
        setError(null);
        try {
            await db.ref(chatPath('reports', report.id)).update({
                ...patch,
                resolvedAt: Date.now(),
                resolvedBy: uid
            });
        } catch (err) {
            console.error('Report update failed:', err);
            setError(describeWriteError(err));
        } finally {
            resolving.current.delete(report.id);
        }
    }, [db, uid, resolving]);

    const handleResolve = async (report) => {
        await updateReport(report, { status: 'resolved' });
        // Flip the ticket's "created" bubble to "resolved" in the feed — the same
        // bubble changes state, no second message.
        try {
            await onResolveTicketMessage?.(report);
        } catch (err) {
            console.error('Ticket bubble update failed:', err);
        }
    };

    const handleDismiss = (report) => updateReport(report, { status: 'dismissed' });

    const handleDelete = async (report) => {
        if (!db) return;
        if (!window.confirm('Permanently delete this report? The audit trail is lost.')) return;
        setError(null);
        try {
            await db.ref(chatPath('reports', report.id)).remove();
        } catch (err) {
            console.error('Report delete failed:', err);
            setError(describeWriteError(err));
        }
    };

    const visibleReports = useMemo(() => filterReports(reports, reportFilter), [reports, reportFilter]);
    const pendingCount = useMemo(() => reports.filter(r => reportStatus(r) === 'pending').length, [reports]);

    // ── FAQ CRUD handlers ───────────────────────────────────────────────
    const startFaqEdit = (item) => {
        setFaqEditId(item.id);
        setFaqDraftQ(item.question);
        setFaqDraftA(item.answer);
        setFaqAdding(false);
    };

    const startFaqAdd = () => {
        setFaqEditId(null);
        setFaqDraftQ('');
        setFaqDraftA('');
        setFaqAdding(true);
    };

    const cancelFaqEdit = () => {
        setFaqEditId(null);
        setFaqDraftQ('');
        setFaqDraftA('');
        setFaqAdding(false);
    };

    const handleFaqSave = async () => {
        if (!db || faqBusy) return;
        const q = faqDraftQ.trim();
        const a = faqDraftA.trim();
        if (!q || !a) { setError('Both question and answer are required.'); return; }
        if (q.length > MAX_FAQ_QUESTION_LENGTH) { setError(`Question must be ${MAX_FAQ_QUESTION_LENGTH} characters or fewer.`); return; }
        if (a.length > MAX_FAQ_ANSWER_LENGTH) { setError(`Answer must be ${MAX_FAQ_ANSWER_LENGTH} characters or fewer.`); return; }

        setFaqBusy(true);
        setError(null);
        setStatus(null);
        try {
            if (faqAdding) {
                if (faqItems.length >= MAX_FAQ_ITEMS) {
                    setError(`Maximum of ${MAX_FAQ_ITEMS} FAQ entries reached.`);
                    setFaqBusy(false);
                    return;
                }
                const maxOrder = faqItems.reduce((m, i) => Math.max(m, i.order ?? 0), -1);
                await db.ref(chatPath('commands', 'faq')).push({ question: q, answer: a, order: maxOrder + 1 });
                setStatus('FAQ entry added.');
            } else if (faqEditId) {
                const existing = faqItems.find(i => i.id === faqEditId);
                await db.ref(chatPath('commands', 'faq', faqEditId)).update({
                    question: q,
                    answer: a,
                    order: existing?.order ?? 0
                });
                setStatus('FAQ entry updated.');
            }
            cancelFaqEdit();
        } catch (err) {
            console.error('FAQ save failed:', err);
            setError(describeWriteError(err));
        } finally {
            setFaqBusy(false);
        }
    };

    const handleFaqDelete = async (itemId) => {
        if (!db || faqBusy) return;
        if (!window.confirm('Delete this FAQ entry?')) return;
        setFaqBusy(true);
        setError(null);
        try {
            await db.ref(chatPath('commands', 'faq', itemId)).remove();
            setStatus('FAQ entry deleted.');
        } catch (err) {
            console.error('FAQ delete failed:', err);
            setError(describeWriteError(err));
        } finally {
            setFaqBusy(false);
        }
    };

    const handleFaqReorder = async (itemId, direction) => {
        if (!db || faqBusy) return;
        const idx = faqItems.findIndex(i => i.id === itemId);
        if (idx === -1) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= faqItems.length) return;

        setFaqBusy(true);
        setError(null);
        try {
            const a = faqItems[idx];
            const b = faqItems[swapIdx];
            const updates = {};
            updates[chatPath('commands', 'faq', a.id, 'order')] = b.order ?? swapIdx;
            updates[chatPath('commands', 'faq', b.id, 'order')] = a.order ?? idx;
            await db.ref().update(updates);
        } catch (err) {
            console.error('FAQ reorder failed:', err);
            setError(describeWriteError(err));
        } finally {
            setFaqBusy(false);
        }
    };

    // Left/right walks the section rail, the way a native tablist behaves.
    const handleNavKeyDown = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const idx = SECTIONS.findIndex(s => s.id === section);
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = SECTIONS[(idx + step + SECTIONS.length) % SECTIONS.length];
        onTabChange?.(next.id);
    };

    if (!isOpen) return null;

    const current = SECTIONS.find(s => s.id === section) || SECTIONS[0];
    const headerBlurb = section === 'reports'
        ? (pendingCount > 0
            ? `${pendingCount} awaiting triage`
            : 'Nothing awaiting triage')
        : current.blurb;

    /** Shared question/answer editor — same fields whether adding or editing. */
    const renderFaqForm = (isAdd) => (
        <div className={`gc-admin-faq-form${isAdd ? ' gc-admin-faq-form--add' : ''}`}>
            <label className="gc-admin-faq-form-label">{isAdd ? 'New question' : 'Question'}</label>
            <input
                className="gc-admin-input"
                type="text"
                value={faqDraftQ}
                onChange={e => setFaqDraftQ(e.target.value)}
                maxLength={MAX_FAQ_QUESTION_LENGTH}
                placeholder="What do members keep asking?"
                disabled={faqBusy}
                autoFocus={isAdd}
            />
            <label className="gc-admin-faq-form-label">Answer</label>
            <textarea
                className="gc-admin-input gc-admin-faq-textarea"
                value={faqDraftA}
                onChange={e => setFaqDraftA(e.target.value)}
                maxLength={MAX_FAQ_ANSWER_LENGTH}
                placeholder="Keep it short — this renders inside a chat card."
                rows={3}
                disabled={faqBusy}
            />
            <div className="gc-admin-faq-form-hint">
                Q {faqDraftQ.length}/{MAX_FAQ_QUESTION_LENGTH} · A {faqDraftA.length}/{MAX_FAQ_ANSWER_LENGTH}
            </div>
            <div className="gc-admin-actions">
                <button
                    className="gc-admin-btn primary"
                    onClick={handleFaqSave}
                    disabled={faqBusy || !faqDraftQ.trim() || !faqDraftA.trim()}
                >
                    {faqBusy ? (isAdd ? 'Adding…' : 'Saving…') : (isAdd ? 'Add' : 'Save')}
                </button>
                <button className="gc-admin-btn" onClick={cancelFaqEdit} disabled={faqBusy}>Cancel</button>
            </div>
        </div>
    );

    return (
        <div className="gc-admin-overlay" onClick={onClose} data-nav-trap>
            <div
                className="gc-admin-panel"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Admin dashboard"
                tabIndex={-1}
                ref={panelRef}
            >
                <header className="gc-admin-header">
                    <span className="gc-admin-header-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                            <path d="M12 3.2l6.4 2.3v5.6c0 4-2.6 7.3-6.4 8.7-3.8-1.4-6.4-4.7-6.4-8.7V5.5L12 3.2Z" />
                            <path d="M9.3 12.1l1.9 1.9 3.6-3.9" />
                        </svg>
                    </span>
                    <span className="gc-admin-header-text">
                        <h3>Admin Console</h3>
                        <span className="gc-admin-header-blurb">{headerBlurb}</span>
                    </span>
                    <button className="gc-admin-close" onClick={onClose} aria-label="Close admin dashboard">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M7 7l10 10M17 7L7 17" />
                        </svg>
                    </button>
                </header>

                <div
                    className="gc-admin-nav"
                    role="tablist"
                    aria-label="Admin dashboard sections"
                    onKeyDown={handleNavKeyDown}
                >
                    {SECTIONS.map(s => {
                        const isActive = section === s.id;
                        return (
                            <button
                                key={s.id}
                                id={`gc-admin-nav-${s.id}`}
                                role="tab"
                                aria-selected={isActive}
                                aria-controls="gc-admin-body"
                                tabIndex={isActive ? 0 : -1}
                                className={`gc-admin-nav-item ${isActive ? 'active' : ''}`}
                                onClick={() => onTabChange?.(s.id)}
                            >
                                <span className="gc-admin-nav-icon" aria-hidden="true">{SECTION_ICONS[s.id]}</span>
                                <span className="gc-admin-nav-label">{s.label}</span>
                                {/* Pending only: a red count that includes
                                    already-triaged reports reads as unfinished
                                    work that isn't there. */}
                                {s.id === 'reports' && pendingCount > 0 && (
                                    <span className="gc-admin-tab-count">{pendingCount}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {(status || error) && (
                    <div className={`gc-admin-notice ${error ? 'error' : 'ok'}`} role="status">
                        <span className="gc-admin-notice-dot" aria-hidden="true" />
                        <span>{error || status}</span>
                    </div>
                )}

                <div
                    className="gc-admin-body"
                    id="gc-admin-body"
                    role="tabpanel"
                    aria-labelledby={`gc-admin-nav-${section}`}
                    tabIndex={0}
                    ref={bodyRef}
                >
                    {section === 'profile' && (
                        <section className="gc-admin-section" aria-label="Profile settings">
                            {/* The hero doubles as the live preview: this is exactly
                                what members see next to an admin message. */}
                            <div className="gc-admin-identity">
                                <div className="gc-admin-identity-avatar">
                                    <img className="gc-admin-preview-avatar" src={previewPhoto} alt="Current chat avatar" />
                                    <button
                                        className="gc-admin-avatar-edit"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={busy}
                                        title="Change profile image"
                                        aria-label="Change profile image"
                                    >
                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            <path d="M4.5 8.5h2.6l1.3-2h7.2l1.3 2h2.6v9.5h-15V8.5Z" />
                                            <circle cx="12" cy="13.2" r="2.9" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="gc-admin-identity-meta">
                                    <span className="gc-admin-identity-name">
                                        <span className="gc-admin-identity-name-text">{previewName}</span>
                                        <span className="gc-admin-badge" title="StreamFlix Admin">
                                            <GlobalChatAdminBadge badgeId={badgeDraft} title="StreamFlix Admin" />
                                        </span>
                                    </span>
                                    <span className="gc-admin-identity-sub">Live preview of your chat identity</span>
                                </div>
                            </div>

                            <div className="gc-admin-group">
                                <div className="gc-admin-group-head">
                                    <label className="gc-admin-label" htmlFor="gc-admin-name">Chat display name</label>
                                    <span className="gc-admin-group-meta">{nameDraft.length}/{ADMIN_NAME_MAX_LENGTH}</span>
                                </div>
                                <input
                                    id="gc-admin-name"
                                    className="gc-admin-input"
                                    type="text"
                                    value={nameDraft}
                                    maxLength={ADMIN_NAME_MAX_LENGTH}
                                    placeholder="Leave blank to use your Google name"
                                    onChange={e => setNameDraft(e.target.value)}
                                    disabled={busy}
                                />
                                {nameCheck.ok
                                    ? <div className="gc-admin-hint">No “@”, no leading or trailing space.</div>
                                    : <div className="gc-admin-field-error">{nameCheck.error}</div>}
                                <div className="gc-admin-actions">
                                    <button
                                        className="gc-admin-btn primary"
                                        onClick={handleSaveIdentity}
                                        disabled={busy || !nameCheck.ok || nameDraft === ''}
                                    >
                                        {busy ? 'Saving…' : 'Save'}
                                    </button>
                                    <button className="gc-admin-btn subtle" onClick={handleResetName} disabled={busy || !adminName}>
                                        Reset to Google name
                                    </button>
                                </div>
                            </div>

                            <div className="gc-admin-group">
                                <div className="gc-admin-group-head">
                                    <span className="gc-admin-label">Profile image</span>
                                </div>
                                <div className="gc-admin-hint">
                                    {AVATAR_EXTENSIONS.join(' · ')} up to 10MB. Checked before it leaves your browser.
                                </div>
                                {/* Kept in the tree so the file dialog is reachable
                                    from the avatar's camera button and by name. */}
                                <input
                                    ref={fileInputRef}
                                    className="gc-admin-file"
                                    type="file"
                                    accept={AVATAR_ACCEPT}
                                    aria-label="Choose a profile image"
                                    onChange={handleAvatarChange}
                                    disabled={busy}
                                />
                                <div className="gc-admin-actions">
                                    <button
                                        className="gc-admin-btn"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={busy}
                                    >
                                        {busy ? 'Uploading…' : 'Upload image'}
                                    </button>
                                    <button className="gc-admin-btn subtle" onClick={handleResetAvatar} disabled={busy || !adminPhotoURL}>
                                        Reset to Google photo
                                    </button>
                                </div>
                            </div>

                            <div className="gc-admin-group">
                                <div className="gc-admin-group-head">
                                    <span className="gc-admin-label">Admin badge</span>
                                    <span className="gc-admin-group-meta">Saves instantly</span>
                                </div>
                                <div className="gc-admin-badge-grid">
                                    {ADMIN_BADGES.map(badge => (
                                        <button
                                            key={badge.id}
                                            className={`gc-admin-badge-swatch ${badgeDraft === badge.id ? 'active' : ''}`}
                                            aria-pressed={badgeDraft === badge.id}
                                            aria-label={badge.label}
                                            title={badge.label}
                                            onClick={() => handleSaveBadge(badge.id)}
                                            disabled={busy}
                                        >
                                            <GlobalChatAdminBadge badgeId={badge.id} className="gc-admin-badge-swatch-icon" />
                                            <span className="gc-admin-badge-swatch-label">{badge.label}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="gc-admin-hint">
                                    Vector icons only — the database stores just the badge name, never any markup.
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'commands' && (
                        <section className="gc-admin-section" aria-label="Command settings">
                            <div className="gc-admin-group">
                                <div className="gc-admin-group-head">
                                    <span className="gc-admin-label">Slash commands</span>
                                </div>
                                <ul className="gc-admin-cmd-list">
                                    {CHAT_COMMANDS.map(cmd => (
                                        <li key={cmd.command} className="gc-admin-cmd">
                                            <code className="gc-admin-cmd-name">{cmd.command}</code>
                                            <span className="gc-admin-cmd-desc">{cmd.description}</span>
                                            <span className={`gc-admin-cmd-tag ${cmd.type === 'dynamic' ? 'editable' : ''}`}>
                                                {cmd.type === 'dynamic' ? 'Editable' : 'Built-in'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="gc-admin-group">
                                <div className="gc-admin-group-head">
                                    <span className="gc-admin-label">FAQ entries</span>
                                    <span className="gc-admin-group-meta">{faqItems.length}/{MAX_FAQ_ITEMS}</span>
                                </div>
                                <div className="gc-admin-hint">
                                    Shown as a card when a member types <code>/faq</code>. Order here is the order in chat.
                                </div>

                                <div className="gc-admin-faq-list">
                                    {faqItems.length === 0 && !faqAdding && (
                                        <div className="gc-admin-faq-empty">
                                            Nothing here yet — add the first entry and <code>/faq</code> starts answering for you.
                                        </div>
                                    )}
                                    {faqItems.map((item, idx) => (
                                        faqEditId === item.id ? (
                                            <div key={item.id}>{renderFaqForm(false)}</div>
                                        ) : (
                                            <div key={item.id} className="gc-admin-faq-item">
                                                <div className="gc-admin-faq-item-num">{idx + 1}</div>
                                                <div className="gc-admin-faq-item-content">
                                                    <div className="gc-admin-faq-item-q">{item.question}</div>
                                                    <div className="gc-admin-faq-item-a">{item.answer}</div>
                                                </div>
                                                <div className="gc-admin-faq-item-actions">
                                                    <button
                                                        className="gc-admin-faq-btn"
                                                        onClick={() => handleFaqReorder(item.id, 'up')}
                                                        disabled={idx === 0 || faqBusy}
                                                        title="Move up"
                                                        aria-label={`Move “${item.question}” up`}
                                                    >
                                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                            <path d="M7 14l5-5 5 5" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        className="gc-admin-faq-btn"
                                                        onClick={() => handleFaqReorder(item.id, 'down')}
                                                        disabled={idx === faqItems.length - 1 || faqBusy}
                                                        title="Move down"
                                                        aria-label={`Move “${item.question}” down`}
                                                    >
                                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                            <path d="M7 10l5 5 5-5" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        className="gc-admin-faq-btn gc-admin-faq-btn--edit"
                                                        onClick={() => startFaqEdit(item)}
                                                        disabled={faqBusy}
                                                        title="Edit"
                                                        aria-label={`Edit “${item.question}”`}
                                                    >
                                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                            <path d="M15.2 5.4l3.4 3.4-9 9H6.2v-3.4l9-9Z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        className="gc-admin-faq-btn gc-admin-faq-btn--delete"
                                                        onClick={() => handleFaqDelete(item.id)}
                                                        disabled={faqBusy}
                                                        title="Delete"
                                                        aria-label={`Delete “${item.question}”`}
                                                    >
                                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                            <path d="M6.6 8.4h10.8M9.4 8.4V6.6h5.2v1.8M8 8.4l.7 9.2h6.6l.7-9.2" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    ))}

                                    {faqAdding && renderFaqForm(true)}
                                </div>

                                {!faqAdding && !faqEditId && (
                                    <div className="gc-admin-actions">
                                        <button
                                            className="gc-admin-btn primary"
                                            onClick={startFaqAdd}
                                            disabled={faqBusy || faqItems.length >= MAX_FAQ_ITEMS}
                                        >
                                            Add entry
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {section === 'reports' && (
                        <section className="gc-admin-section" aria-label="User reports">
                            <div className="gc-admin-filters" role="group" aria-label="Filter reports by status">
                                {REPORT_FILTERS.map(f => (
                                    <button
                                        key={f}
                                        className={`gc-admin-filter ${reportFilter === f ? 'active' : ''}`}
                                        aria-pressed={reportFilter === f}
                                        onClick={() => setReportFilter(f)}
                                    >
                                        {REPORT_FILTER_LABELS[f]}
                                    </button>
                                ))}
                            </div>
                            <div className="gc-reports-list">
                                {visibleReports.length === 0 ? (
                                    <div className="gc-admin-empty">
                                        <span className="gc-admin-empty-icon" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" focusable="false">
                                                <circle cx="12" cy="12" r="8.2" />
                                                <path d="M8.6 12.4l2.3 2.3 4.5-4.9" />
                                            </svg>
                                        </span>
                                        <p className="gc-no-reports">No {reportFilter === 'all' ? '' : `${REPORT_FILTER_LABELS[reportFilter].toLowerCase()} `}reports found.</p>
                                    </div>
                                ) : (
                                    visibleReports.map(report => {
                                        const isIssue = report.kind === 'issue';
                                        const state = reportStatus(report);
                                        const mediaLabel = report.messageMedia === 'image' ? 'Image'
                                            : report.messageMedia === 'video' ? 'Video'
                                            : report.messageMedia === 'audio' ? 'Audio'
                                            : report.messageMedia ? 'Media' : null;
                                        return (
                                            <div key={report.id} className={`gc-report-item gc-report-${state}`}>
                                                <div className="gc-report-topline">
                                                    <span className={`gc-report-status gc-report-status-${state}`}>{state}</span>
                                                    <span className="gc-report-time">
                                                        {report.timestamp ? new Date(report.timestamp).toLocaleString() : ''}
                                                    </span>
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
                                                {state !== 'pending' && report.resolvedAt && (
                                                    <div className="gc-report-audit">
                                                        {state === 'resolved' ? 'Resolved' : 'Dismissed'} {new Date(report.resolvedAt).toLocaleString()}
                                                        {report.resolvedBy && <> by <code>{report.resolvedBy}</code></>}
                                                    </div>
                                                )}
                                                <div className="gc-report-actions">
                                                    {report.msgId && (
                                                        <button
                                                            className="gc-report-locate"
                                                            onClick={() => onLocateMessage?.(report.msgId)}
                                                        >
                                                            Locate
                                                        </button>
                                                    )}
                                                    {state !== 'resolved' && (
                                                        <button className="gc-report-resolve" onClick={() => handleResolve(report)}>
                                                            Resolve
                                                        </button>
                                                    )}
                                                    {state !== 'dismissed' && (
                                                        <button className="gc-report-dismiss" onClick={() => handleDismiss(report)}>
                                                            Dismiss
                                                        </button>
                                                    )}
                                                    <button className="gc-report-delete" onClick={() => handleDelete(report)}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
