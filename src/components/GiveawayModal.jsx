import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowUpRight,
    CalendarClock,
    Check,
    Dices,
    Gift,
    KeyRound,
    MessagesSquare,
    Trophy
} from 'lucide-react';
import './GiveawayModal.css';

const STORAGE_KEY = 'streamflix_giveaway_last_shown';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 604800000ms

/**
 * Spread the Word's gate, read from here on purpose.
 *
 * Both modals mount on Home and both open on a post-load timer, so on a visit
 * where each is independently due they would stack two overlays at the same
 * z-index. Reading the other gate lets this one stand down instead.
 *
 * Standing down deliberately does NOT stamp STORAGE_KEY, so this modal opens on
 * the very next page load — by which point Spread the Word has just stamped
 * itself and is three days from due again. Neither one starves.
 */
const STW_STORAGE_KEY = 'streamflix_stw_last_shown';
const STW_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The giveaway terms, as scannable rows rather than prose.
 *
 * The cadence deliberately reads as approximate and the timing as unknowable:
 * naming a date would turn the giveaway into a schedule the operator is
 * publicly committed to, and the anticipation is the point.
 */
const GIVEAWAY_DETAILS = [
    {
        Icon: KeyRound,
        label: 'Lifetime ad-free key',
        note: 'Permanent once redeemed. Nothing to renew.'
    },
    {
        Icon: CalendarClock,
        label: 'Roughly once a month',
        note: 'A loose cadence, not a fixed schedule.'
    },
    {
        Icon: Dices,
        label: 'Timing is never announced',
        note: 'Never the same day or time twice.'
    },
    {
        Icon: Trophy,
        label: 'First to redeem keeps it',
        note: 'One key per drop, one winner.'
    },
    {
        Icon: MessagesSquare,
        label: 'Dropped in Global Chat',
        note: 'The only place it gets posted.'
    }
];

const GiveawayModal = () => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        let due = false;

        try {
            const lastShown = localStorage.getItem(STORAGE_KEY);
            const selfDue = !lastShown || Date.now() - Number(lastShown) >= ONE_WEEK_MS;

            const stwLastShown = localStorage.getItem(STW_STORAGE_KEY);
            const stwDue = !stwLastShown || Date.now() - Number(stwLastShown) >= STW_INTERVAL_MS;

            due = selfDue && !stwDue;
        } catch {
            // localStorage unavailable – silently skip
        }

        if (!due) return;

        // Later than Spread the Word's 2.5s, so even if the gate above is ever
        // bypassed the two cannot animate in on top of each other.
        const timer = setTimeout(() => setShow(true), 3200);
        return () => clearTimeout(timer);
    }, []);

    const handleClose = useCallback(() => {
        setShow(false);
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch {
            // ignore
        }
    }, []);

    // The design has no close X, so Escape is the only keyboard way out.
    useEffect(() => {
        if (!show) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [show, handleClose]);

    const handleOpenChat = useCallback(() => {
        handleClose();
        // GlobalChat is a floating widget rather than a route, and it listens for
        // this event to open itself.
        window.dispatchEvent(new CustomEvent('streamflix:open-global-chat'));
    }, [handleClose]);

    if (!show) return null;

    return (
        <div className="gwm-overlay" onClick={handleClose} data-nav-trap>
            <div
                className="gwm-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="gwm-title"
            >
                <div className="gwm-icon" aria-hidden="true">
                    <Gift size={20} strokeWidth={2} />
                </div>

                <p className="gwm-eyebrow">Streamflix Perk</p>
                <h2 className="gwm-title" id="gwm-title">Go Ad-Free Key Giveaway</h2>

                <p className="gwm-intro">
                    Every so often we give away a <strong>free lifetime ad-free key</strong> to the
                    Streamflix community. No purchase, no strings.
                </p>

                <div className="gwm-divider" aria-hidden="true" />

                <ul className="gwm-details">
                    {GIVEAWAY_DETAILS.map((detail) => (
                        <li key={detail.label}>
                            <span className="gwm-detail-icon" aria-hidden="true">
                                {/* Member expression so the icon stays data-driven. */}
                                <detail.Icon size={14} strokeWidth={2} />
                            </span>
                            <span className="gwm-detail-text">
                                <span className="gwm-detail-label">{detail.label}</span>
                                <span className="gwm-detail-note">{detail.note}</span>
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="gwm-footer">
                    <p className="gwm-footer-text">
                        {/* Dropped on narrow screens, where the link alone carries it. */}
                        <span className="gwm-footer-prompt">Want to be there when it drops? </span>
                        <button type="button" className="gwm-link" onClick={handleOpenChat}>
                            Open Global Chat
                            <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                    </p>

                    <button type="button" className="gwm-dismiss-btn" onClick={handleClose}>
                        <Check size={15} strokeWidth={3} aria-hidden="true" />
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GiveawayModal;
