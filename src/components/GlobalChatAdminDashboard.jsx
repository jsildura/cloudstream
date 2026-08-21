import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { chatPath } from '../lib/globalChatModel';
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
import GlobalChatAdminBadge from './GlobalChatAdminBadge';
import './GlobalChatAdminDashboard.css';

const TABS = [
    { id: 'identity', label: 'Identity' },
    { id: 'avatar', label: 'Avatar' },
    { id: 'badge', label: 'Badge' },
    { id: 'reports', label: 'Reports' }
];

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
 * their messages, and triage user reports. The `isAdmin` guard here is defence
 * in depth and a UI concern only — `database.rules.json` is the real boundary:
 * every override field validates `auth.token.globalChatAdmin === true`, and
 * reads under `reports/` require the same claim.
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

    const [nameDraft, setNameDraft] = useState('');
    const [badgeDraft, setBadgeDraft] = useState(DEFAULT_ADMIN_BADGE_ID);
    const [photoDraft, setPhotoDraft] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [reportFilter, setReportFilter] = useState('pending');

    const panelRef = useRef(null);
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

    useEffect(() => {
        if (isOpen) panelRef.current?.focus();
    }, [isOpen]);

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

    if (!isOpen) return null;

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
                <div className="gc-admin-header">
                    <h3>Admin Dashboard</h3>
                    <button className="gc-admin-close" onClick={onClose} aria-label="Close admin dashboard">✕</button>
                </div>

                <div className="gc-admin-tabs" role="tablist" aria-label="Admin dashboard sections">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            className={`gc-admin-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => onTabChange?.(tab.id)}
                        >
                            {tab.label}
                            {tab.id === 'reports' && reports.length > 0 && (
                                <span className="gc-admin-tab-count">{reports.length}</span>
                            )}
                        </button>
                    ))}
                </div>

                {(status || error) && (
                    <div className={`gc-admin-notice ${error ? 'error' : 'ok'}`} role="status">
                        {error || status}
                    </div>
                )}

                <div className="gc-admin-body">
                    {activeTab === 'identity' && (
                        <section className="gc-admin-section" aria-label="Identity settings">
                            <label className="gc-admin-label" htmlFor="gc-admin-name">Chat display name</label>
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
                            <div className="gc-admin-hint">
                                {nameDraft.length}/{ADMIN_NAME_MAX_LENGTH} · no “@”, no leading or trailing space
                            </div>
                            {!nameCheck.ok && <div className="gc-admin-field-error">{nameCheck.error}</div>}

                            <div className="gc-admin-preview" aria-label="Preview">
                                <img className="gc-admin-preview-avatar" src={previewPhoto} alt="" />
                                <span className="gc-sender-name">
                                    {previewName}
                                    <span className="gc-admin-badge" title="StreamFlix Admin">
                                        <GlobalChatAdminBadge badgeId={badgeDraft} title="StreamFlix Admin" />
                                    </span>
                                </span>
                            </div>

                            <div className="gc-admin-actions">
                                <button
                                    className="gc-admin-btn primary"
                                    onClick={handleSaveIdentity}
                                    disabled={busy || !nameCheck.ok || nameDraft === ''}
                                >
                                    {busy ? 'Saving…' : 'Save'}
                                </button>
                                <button className="gc-admin-btn" onClick={handleResetName} disabled={busy || !adminName}>
                                    Reset to Google name
                                </button>
                            </div>
                        </section>
                    )}

                    {activeTab === 'avatar' && (
                        <section className="gc-admin-section" aria-label="Avatar settings">
                            <div className="gc-admin-label">Chat profile image</div>
                            <div className="gc-admin-preview">
                                <img className="gc-admin-preview-avatar large" src={previewPhoto} alt="Current chat avatar" />
                            </div>
                            <div className="gc-admin-hint">
                                {AVATAR_EXTENSIONS.join(', ')} · up to 10MB. The file is checked before it leaves your browser.
                            </div>
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
                                <button className="gc-admin-btn" onClick={handleResetAvatar} disabled={busy || !adminPhotoURL}>
                                    Reset to Google photo
                                </button>
                            </div>
                            {busy && <div className="gc-admin-hint">Uploading…</div>}
                        </section>
                    )}

                    {activeTab === 'badge' && (
                        <section className="gc-admin-section" aria-label="Badge settings">
                            <div className="gc-admin-label">Admin badge</div>
                            <div className="gc-admin-hint">
                                Vector icons only — the database stores just the badge name, never any markup.
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
                        </section>
                    )}

                    {activeTab === 'reports' && (
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
                                    <p className="gc-no-reports">No {reportFilter === 'all' ? '' : `${REPORT_FILTER_LABELS[reportFilter].toLowerCase()} `}reports found.</p>
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
