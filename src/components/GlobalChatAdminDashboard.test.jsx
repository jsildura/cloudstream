import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GlobalChatAdminDashboard from './GlobalChatAdminDashboard';
import { ADMIN_BADGES, FALLBACK_AVATAR } from '../lib/globalChatAdminIdentity';

const LH3 = 'https://lh3.googleusercontent.com/d/1AbC_dEf-GhIj';

vi.mock('../lib/globalChatUpload', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, uploadToDrive: vi.fn() };
});

const { uploadToDrive } = await import('../lib/globalChatUpload');

/** Minimal firebase-compat db double: db.ref(path).update/remove. */
function makeDb() {
    const update = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const ref = vi.fn(() => ({ update, remove }));
    return { db: { ref }, ref, update, remove };
}

const makeFile = (name, type, size = 1024) => {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
};

function setup(props = {}) {
    const harness = makeDb();
    const onTabChange = vi.fn();
    const onClose = vi.fn();
    const onLocateMessage = vi.fn();
    const onResolveTicketMessage = vi.fn().mockResolvedValue(undefined);

    const view = render(
        <GlobalChatAdminDashboard
            db={harness.db}
            uid="admin-1"
            isAdmin
            activeTab="identity"
            overrides={{ adminName: null, adminPhotoURL: null, adminBadge: null }}
            reports={[]}
            onTabChange={onTabChange}
            onClose={onClose}
            onLocateMessage={onLocateMessage}
            onResolveTicketMessage={onResolveTicketMessage}
            {...props}
        />
    );

    return { ...harness, ...view, onTabChange, onClose, onLocateMessage, onResolveTicketMessage };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GlobalChatAdminDashboard gating', () => {
    // The rules are the real boundary; this guard just keeps the UI honest.
    it('renders nothing without the admin claim', () => {
        const { container } = setup({ isAdmin: false });
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when no tab is active', () => {
        const { container } = setup({ activeTab: null });
        expect(container.firstChild).toBeNull();
    });

    it('renders the dialog with the three sections for an admin', () => {
        setup();
        expect(screen.getByRole('dialog', { name: /admin dashboard/i })).toBeDefined();
        ['Profile', 'Commands', 'Reports'].forEach(label => {
            expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeDefined();
        });
        // Name, avatar, and badge are facets of one identity, so they no longer
        // get a tab each.
        expect(screen.queryByRole('tab', { name: /Identity|Avatar|Badge/ })).toBeNull();
    });

    it('folds the legacy identity tab onto Profile and reports section changes', () => {
        const { onTabChange } = setup();
        expect(screen.getByRole('tab', { name: /Profile/ }).getAttribute('aria-selected')).toBe('true');
        fireEvent.click(screen.getByRole('tab', { name: /Commands/ }));
        expect(onTabChange).toHaveBeenCalledWith('commands');
    });

    // Deep links and older callers still send the pre-merge tab ids.
    it.each(['identity', 'avatar', 'badge', 'profile'])('opens Profile for the %s tab id', (tab) => {
        setup({ activeTab: tab });
        expect(screen.getByRole('tab', { name: /Profile/ }).getAttribute('aria-selected')).toBe('true');
    });

    it('puts the name, avatar, and badge controls in one Profile section', () => {
        setup({ activeTab: 'profile' });
        expect(screen.getByLabelText(/chat display name/i)).toBeDefined();
        expect(screen.getByLabelText(/choose a profile image/i)).toBeDefined();
        expect(screen.getByRole('button', { name: 'Shield' })).toBeDefined();
    });

    // Roving tabIndex plus left/right, the way a native tablist behaves.
    it('walks the section rail with the arrow keys, wrapping at both ends', () => {
        const { onTabChange } = setup({ activeTab: 'profile' });
        const nav = screen.getByRole('tablist');

        expect(screen.getByRole('tab', { name: /Profile/ }).tabIndex).toBe(0);
        expect(screen.getByRole('tab', { name: /Commands/ }).tabIndex).toBe(-1);

        fireEvent.keyDown(nav, { key: 'ArrowRight' });
        expect(onTabChange).toHaveBeenLastCalledWith('commands');

        // Left from the first section wraps round to the last.
        fireEvent.keyDown(nav, { key: 'ArrowLeft' });
        expect(onTabChange).toHaveBeenLastCalledWith('reports');

        onTabChange.mockClear();
        fireEvent.keyDown(nav, { key: 'ArrowUp' });
        expect(onTabChange).not.toHaveBeenCalled();
    });

    it('closes on backdrop click and on Escape', () => {
        const { onClose, container } = setup();
        fireEvent.click(container.querySelector('.gc-admin-overlay'));
        expect(onClose).toHaveBeenCalled();

        onClose.mockClear();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('does not close when the panel itself is clicked', () => {
        const { onClose, container } = setup();
        fireEvent.click(container.querySelector('.gc-admin-panel'));
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('GlobalChatAdminDashboard profile section: display name', () => {
    it('seeds the input from the live override', () => {
        setup({ overrides: { adminName: 'Nightwatch', adminPhotoURL: null, adminBadge: 'shield' } });
        expect(screen.getByLabelText(/chat display name/i).value).toBe('Nightwatch');
    });

    it('surfaces a validation error and blocks save', () => {
        setup();
        const input = screen.getByLabelText(/chat display name/i);
        fireEvent.change(input, { target: { value: 'a@b' } });
        expect(screen.getByText(/@ character is not allowed/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /^Save$/ }).disabled).toBe(true);
    });

    it('rejects a one-character name', () => {
        setup();
        fireEvent.change(screen.getByLabelText(/chat display name/i), { target: { value: 'A' } });
        expect(screen.getByText(/at least 2 characters/i)).toBeDefined();
    });

    it('rejects the reserved fallback identity', () => {
        setup();
        fireEvent.change(screen.getByLabelText(/chat display name/i), { target: { value: 'Google User' } });
        expect(screen.getByText(/reserved/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /^Save$/ }).disabled).toBe(true);
    });

    it('writes exactly the override fields on save', async () => {
        const { ref, update } = setup();
        fireEvent.change(screen.getByLabelText(/chat display name/i), { target: { value: 'Nightwatch' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        });

        expect(ref).toHaveBeenCalledWith('globalChat/v2/profiles/admin-1');
        const patch = update.mock.calls[0][0];
        expect(Object.keys(patch).sort()).toEqual(['adminBadge', 'adminName', 'adminUpdatedAt']);
        expect(patch.adminName).toBe('Nightwatch');
        expect(patch.adminBadge).toBe('crown');
        expect(typeof patch.adminUpdatedAt).toBe('number');
        expect(await screen.findByText(/chat identity saved/i)).toBeDefined();
    });

    // Deleting a field skips .validate, which is what makes Reset always work.
    it('clears the name with an explicit null on reset', async () => {
        const { update } = setup({ overrides: { adminName: 'Nightwatch', adminPhotoURL: null, adminBadge: null } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /reset to google name/i }));
        });
        expect(update.mock.calls[0][0].adminName).toBeNull();
    });

    it('disables reset when there is nothing to reset', () => {
        setup();
        expect(screen.getByRole('button', { name: /reset to google name/i }).disabled).toBe(true);
    });

    // A generic "save failed" would send the admin hunting in the wrong place.
    it('explains a PERMISSION_DENIED as undeployed rules or a missing claim', async () => {
        const harness = makeDb();
        harness.update.mockRejectedValue(Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' }));
        render(
            <GlobalChatAdminDashboard
                db={harness.db}
                uid="admin-1"
                isAdmin
                activeTab="identity"
                overrides={{}}
                reports={[]}
                onClose={() => {}}
            />
        );
        fireEvent.change(screen.getByLabelText(/chat display name/i), { target: { value: 'Nightwatch' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
        });
        expect(await screen.findByText(/rules have not been deployed|no longer holds the chat-admin claim/i)).toBeDefined();
    });
});

describe('GlobalChatAdminDashboard profile section: avatar', () => {
    // The legacy tab id still resolves to the merged Profile section.
    const avatarProps = { activeTab: 'avatar' };

    it('accepts only the three allowed formats on the input', () => {
        setup(avatarProps);
        const accept = screen.getByLabelText(/choose a profile image/i).getAttribute('accept');
        expect(accept).toContain('image/jpeg');
        expect(accept).toContain('image/webp');
        expect(accept).toContain('image/gif');
        expect(accept).not.toContain('image/png');
    });

    it('shows the Streamflix logo when there is no custom avatar', () => {
        const { container } = setup(avatarProps);
        expect(container.querySelector('.gc-admin-preview-avatar').getAttribute('src')).toBe(FALLBACK_AVATAR);
    });

    it('uploads a webp and writes the normalized URL', async () => {
        uploadToDrive.mockResolvedValue('https://drive.google.com/file/d/1AbC_dEf-GhIj/view');
        const { update } = setup(avatarProps);

        await act(async () => {
            fireEvent.change(screen.getByLabelText(/choose a profile image/i), {
                target: { files: [makeFile('a.webp', 'image/webp')] }
            });
        });

        await waitFor(() => expect(update).toHaveBeenCalled());
        const patch = update.mock.calls[0][0];
        expect(patch.adminPhotoURL).toBe(LH3);
        // The uid identifies the uploader; an email must never be sent.
        expect(uploadToDrive).toHaveBeenCalledWith({ file: expect.anything(), uid: 'admin-1' });
    });

    // Nothing should leave the browser for a file the rules would reject.
    it('rejects a png without uploading', async () => {
        const { update } = setup(avatarProps);
        await act(async () => {
            fireEvent.change(screen.getByLabelText(/choose a profile image/i), {
                target: { files: [makeFile('a.png', 'image/png')] }
            });
        });
        expect(uploadToDrive).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toMatch(/\.jpg/);
    });

    it('rejects an oversized file without uploading', async () => {
        setup(avatarProps);
        await act(async () => {
            fireEvent.change(screen.getByLabelText(/choose a profile image/i), {
                target: { files: [makeFile('big.jpg', 'image/jpeg', 11 * 1024 * 1024)] }
            });
        });
        expect(uploadToDrive).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toMatch(/10MB/);
    });

    it('rejects an extension that disagrees with the MIME type', async () => {
        setup(avatarProps);
        await act(async () => {
            fireEvent.change(screen.getByLabelText(/choose a profile image/i), {
                target: { files: [makeFile('a.jpg', 'image/svg+xml')] }
            });
        });
        expect(uploadToDrive).not.toHaveBeenCalled();
    });

    // Defence in depth against a surprising upload response.
    it('refuses to store a URL that is not the pinned lh3 shape', async () => {
        uploadToDrive.mockResolvedValue('https://evil.example.com/pic.png');
        const { update } = setup(avatarProps);
        await act(async () => {
            fireEvent.change(screen.getByLabelText(/choose a profile image/i), {
                target: { files: [makeFile('a.gif', 'image/gif')] }
            });
        });
        expect(update).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toMatch(/usable image URL/i);
    });

    it('surfaces an upload failure', async () => {
        uploadToDrive.mockRejectedValue(new Error('Quota exceeded'));
        setup(avatarProps);
        await act(async () => {
            fireEvent.change(screen.getByLabelText(/choose a profile image/i), {
                target: { files: [makeFile('a.jpg', 'image/jpeg')] }
            });
        });
        expect(await screen.findByText(/quota exceeded/i)).toBeDefined();
    });

    it('clears the avatar with an explicit null on reset', async () => {
        const { update } = setup({ ...avatarProps, overrides: { adminPhotoURL: LH3 } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /reset to google photo/i }));
        });
        expect(update.mock.calls[0][0].adminPhotoURL).toBeNull();
    });
});

describe('GlobalChatAdminDashboard profile section: badge', () => {
    it('offers every allowlisted badge as an SVG swatch, no emoji or glyph', () => {
        const { container } = setup({ activeTab: 'badge' });
        ADMIN_BADGES.forEach(badge => {
            expect(screen.getByRole('button', { name: badge.label })).toBeDefined();
        });
        expect(container.querySelectorAll('.gc-admin-badge-swatch svg').length).toBe(ADMIN_BADGES.length);
        expect(container.querySelector('.gc-admin-badge-grid i')).toBeNull();
        expect(container.querySelector('.gc-admin-badge-grid').textContent)
            .not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    it('marks the current selection with aria-pressed', () => {
        setup({ activeTab: 'badge', overrides: { adminBadge: 'shield' } });
        expect(screen.getByRole('button', { name: 'Shield' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Star' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('saves the picked badge id', async () => {
        const { update } = setup({ activeTab: 'badge' });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Bolt' }));
        });
        expect(update.mock.calls[0][0].adminBadge).toBe('bolt');
        expect(await screen.findByText(/badge saved/i)).toBeDefined();
    });
});

describe('GlobalChatAdminDashboard reports section', () => {
    const pending = { id: 'r1', kind: 'message', msgId: 'm1', messageText: 'bad words', reportedByName: 'Bob', timestamp: 3000 };
    const resolved = { id: 'r2', kind: 'message', msgId: 'm2', messageText: 'old one', reportedByName: 'Carol', timestamp: 2000, status: 'resolved', resolvedAt: 2500, resolvedBy: 'admin-1' };
    const dismissed = { id: 'r3', kind: 'issue', category: 'Playback', reportedByName: 'Dave', timestamp: 1000, status: 'dismissed', resolvedAt: 1500, resolvedBy: 'admin-1' };
    const reportsProps = { activeTab: 'reports', reports: [pending, resolved, dismissed] };

    it('defaults to the pending filter', () => {
        setup(reportsProps);
        expect(screen.getByRole('button', { name: 'Pending' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText(/bad words/)).toBeDefined();
        expect(screen.queryByText(/old one/)).toBeNull();
    });

    it('switches to resolved and shows the audit trail', () => {
        setup(reportsProps);
        fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
        expect(screen.getByText(/old one/)).toBeDefined();
        expect(screen.getByText(/^Resolved /)).toBeDefined();
        expect(screen.getByText('admin-1')).toBeDefined();
    });

    it('shows everything under the All filter, newest first', () => {
        const { container } = setup(reportsProps);
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        const statuses = [...container.querySelectorAll('.gc-report-status')].map(n => n.textContent);
        expect(statuses).toEqual(['pending', 'resolved', 'dismissed']);
    });

    // A report written before the status field existed is still awaiting triage.
    it('treats a report with no status as pending', () => {
        setup({ activeTab: 'reports', reports: [{ id: 'legacy', kind: 'message', messageText: 'no status', timestamp: 1 }] });
        expect(screen.getByText('pending')).toBeDefined();
    });

    it('resolves non-destructively with the audit fields', async () => {
        const { ref, update, remove, onResolveTicketMessage } = setup(reportsProps);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
        });

        expect(remove).not.toHaveBeenCalled();
        expect(ref).toHaveBeenCalledWith('globalChat/v2/reports/r1');
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'resolved',
            resolvedBy: 'admin-1'
        }));
        expect(typeof update.mock.calls[0][0].resolvedAt).toBe('number');
        expect(onResolveTicketMessage).toHaveBeenCalledWith(pending);
    });

    it('dismisses with the audit fields and no delete', async () => {
        const { update, remove } = setup(reportsProps);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        });
        expect(remove).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'dismissed', resolvedBy: 'admin-1' }));
    });

    it('deletes only behind a confirm', async () => {
        const confirmSpy = vi.fn().mockReturnValue(false);
        vi.stubGlobal('confirm', confirmSpy);
        const { remove } = setup(reportsProps);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });
        expect(remove).not.toHaveBeenCalled();

        confirmSpy.mockReturnValue(true);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        });
        expect(remove).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('guards against a double-click posting twice', async () => {
        const resolvingRef = { current: new Set(['r1']) };
        const { update } = setup({ ...reportsProps, resolvingRef });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
        });
        expect(update).not.toHaveBeenCalled();
    });

    it('hands Locate back to the chat', () => {
        const { onLocateMessage } = setup(reportsProps);
        fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
        expect(onLocateMessage).toHaveBeenCalledWith('m1');
    });

    it('says so when a filter is empty', () => {
        setup({ activeTab: 'reports', reports: [] });
        expect(screen.getByText(/no pending reports found/i)).toBeDefined();
    });

    // The count is a call to action, so it counts only what still needs triage.
    it('counts only pending reports on the Reports nav item', () => {
        const { container } = setup(reportsProps);
        expect(container.querySelector('.gc-admin-tab-count').textContent).toBe('1');
    });

    it('drops the count entirely once nothing is pending', () => {
        const { container } = setup({ activeTab: 'reports', reports: [resolved, dismissed] });
        expect(container.querySelector('.gc-admin-tab-count')).toBeNull();
    });

    it('resets the body scroll when the section changes', () => {
        const { container, rerender } = setup(reportsProps);
        const body = container.querySelector('.gc-admin-body');
        body.scrollTop = 120;
        rerender(
            <GlobalChatAdminDashboard
                db={makeDb().db}
                uid="admin-1"
                isAdmin
                activeTab="profile"
                overrides={{}}
                reports={reportsProps.reports}
                onClose={() => {}}
            />
        );
        expect(container.querySelector('.gc-admin-body').scrollTop).toBe(0);
    });
});
