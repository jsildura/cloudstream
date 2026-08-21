import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GlobalChatAdminBadge from './GlobalChatAdminBadge';
import { ADMIN_BADGES, ADMIN_BADGE_IDS, DEFAULT_ADMIN_BADGE_ID, getAdminBadge } from '../lib/globalChatAdminIdentity';

const svgOf = container => container.querySelector('svg');

describe('GlobalChatAdminBadge', () => {
    it('renders an inline svg for every allowlisted id', () => {
        for (const id of ADMIN_BADGE_IDS) {
            const { container, unmount } = render(<GlobalChatAdminBadge badgeId={id} />);
            const svg = svgOf(container);
            expect(svg).toBeTruthy();
            expect(svg.getAttribute('viewBox')).toBe(getAdminBadge(id).viewBox);
            expect(container.querySelectorAll('path').length).toBe(getAdminBadge(id).paths.length);
            unmount();
        }
    });

    // The whole point of the allowlist: markup never comes from the database,
    // only an id does, so a hostile value degrades to the default badge.
    it('falls back to the default badge for an unknown, empty, or hostile id', () => {
        const expected = getAdminBadge(DEFAULT_ADMIN_BADGE_ID);
        for (const id of ['emperor', 'CROWN', '', undefined, null, '<svg onload=alert(1)>', '👑']) {
            const { container, unmount } = render(<GlobalChatAdminBadge badgeId={id} />);
            const paths = [...container.querySelectorAll('path')].map(p => p.getAttribute('d'));
            expect(paths).toEqual(expected.paths);
            unmount();
        }
    });

    it('renders no icon-font glyph and no emoji', () => {
        const { container } = render(<GlobalChatAdminBadge badgeId="crown" />);
        expect(container.querySelector('i')).toBeNull();
        expect(container.querySelector('.fa-solid')).toBeNull();
        expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    it('labels itself for assistive tech', () => {
        const { container } = render(<GlobalChatAdminBadge badgeId="shield" />);
        const svg = svgOf(container);
        expect(svg.getAttribute('role')).toBe('img');
        expect(svg.getAttribute('aria-label')).toBe('Shield badge');
        expect(container.querySelector('title').textContent).toBe('Shield badge');
    });

    it('accepts a custom title and extra class', () => {
        const { container } = render(<GlobalChatAdminBadge badgeId="star" title="Moderator" className="gc-swatch" />);
        const svg = svgOf(container);
        expect(svg.getAttribute('aria-label')).toBe('Moderator');
        expect(svg.getAttribute('class')).toBe('gc-admin-badge-icon gc-swatch');
    });

    it('carries the base class with no extra class given', () => {
        const { container } = render(<GlobalChatAdminBadge badgeId="bolt" />);
        expect(svgOf(container).getAttribute('class')).toBe('gc-admin-badge-icon');
    });

    it('covers every badge in the shared module', () => {
        expect(ADMIN_BADGES.length).toBe(ADMIN_BADGE_IDS.length);
    });
});
