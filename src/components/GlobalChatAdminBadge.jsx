import { getAdminBadge } from '../lib/globalChatAdminIdentity';

/**
 * The admin badge shown next to a chat sender's name.
 *
 * Renders one inline SVG chosen from a hardcoded allowlist. Only an *id* ever
 * comes from the database, never markup, and an unknown id resolves to the
 * default badge — so a hostile profile value cannot inject into the DOM or
 * blank the badge out. No emoji and no icon-font glyph.
 *
 * @param {{badgeId?: string, className?: string, title?: string}} props
 */
export default function GlobalChatAdminBadge({ badgeId, className = '', title }) {
    const badge = getAdminBadge(badgeId);
    const label = title || `${badge.label} badge`;

    return (
        <svg
            className={`gc-admin-badge-icon ${className}`.trim()}
            viewBox={badge.viewBox}
            role="img"
            aria-label={label}
            focusable="false"
        >
            <title>{label}</title>
            {badge.paths.map(d => <path key={d} d={d} />)}
        </svg>
    );
}
