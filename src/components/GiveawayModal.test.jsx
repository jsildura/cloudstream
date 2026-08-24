import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GiveawayModal from './GiveawayModal';

const STORAGE_KEY = 'streamflix_giveaway_last_shown';
const STW_STORAGE_KEY = 'streamflix_stw_last_shown';
const OPEN_DELAY_MS = 3200;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Advances past the open timer inside act, so React flushes the state update. */
const advancePastDelay = async () => {
    await act(async () => {
        vi.advanceTimersByTime(OPEN_DELAY_MS);
    });
};

describe('GiveawayModal', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        // Spread the Word shown just now, so it is not competing for the screen.
        // Without this the modal correctly stands down and nothing renders.
        localStorage.setItem(STW_STORAGE_KEY, String(Date.now()));
    });

    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
    });

    it('stays hidden until the open delay has elapsed', () => {
        render(<GiveawayModal />);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens on a first visit and shows the giveaway copy', async () => {
        render(<GiveawayModal />);
        await advancePastDelay();

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Go Ad-Free Key Giveaway' })).toBeInTheDocument();
        expect(screen.getByText('Streamflix Perk')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    });

    it('states every giveaway term the user has to know', async () => {
        render(<GiveawayModal />);
        await advancePastDelay();

        // What is being given away, and that it does not expire.
        expect(screen.getByText('Lifetime ad-free key')).toBeInTheDocument();

        // The cadence and the timing must both stay deliberately vague — a stated
        // date turns the giveaway into a schedule the operator is publicly
        // committed to, which is the thing this copy is written to avoid.
        expect(screen.getByText('Roughly once a month')).toBeInTheDocument();
        expect(screen.getByText(/not a fixed schedule/i)).toBeInTheDocument();
        expect(screen.getByText('Timing is never announced')).toBeInTheDocument();

        // How a winner is picked, and where.
        expect(screen.getByText('First to redeem keeps it')).toBeInTheDocument();
        expect(screen.getByText('Dropped in Global Chat')).toBeInTheDocument();
    });

    it('uses no emoji anywhere, only icons', async () => {
        render(<GiveawayModal />);
        await advancePastDelay();

        // Emoji read as a developer notice rather than a product surface, so the
        // icons are SVG. Covers pictographs, dingbats and arrows; the em dash and
        // typographic punctuation used in the copy fall outside.
        //
        // The variation selector is an alternation rather than a class member: it
        // combines with whatever precedes it, so inside a class it would read as
        // one grapheme (no-misleading-character-class).
        const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u;

        expect(screen.getByRole('dialog').textContent).not.toMatch(emoji);
    });

    it('stands down when Spread the Word is due, without stamping itself', async () => {
        // Both modals mount on Home and both open on a timer, so a visit where
        // each is due would otherwise stack two overlays.
        localStorage.setItem(STW_STORAGE_KEY, String(Date.now() - THREE_DAYS_MS - 1));

        render(<GiveawayModal />);
        await advancePastDelay();

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // Not stamping is what makes it open on the next page load instead of
        // waiting out another full week.
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('stays closed within a week of the last time it was shown', async () => {
        localStorage.setItem(STORAGE_KEY, String(Date.now() - ONE_WEEK_MS + 60_000));

        render(<GiveawayModal />);
        await advancePastDelay();

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens again once a week has passed', async () => {
        localStorage.setItem(STORAGE_KEY, String(Date.now() - ONE_WEEK_MS));

        render(<GiveawayModal />);
        await advancePastDelay();

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('records the dismissal so it does not reopen next visit', async () => {
        render(<GiveawayModal />);
        await advancePastDelay();

        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(Number(localStorage.getItem(STORAGE_KEY))).toBe(Date.now());
    });

    it('closes on a backdrop click but not on a click inside the card', async () => {
        render(<GiveawayModal />);
        await advancePastDelay();

        fireEvent.click(screen.getByRole('dialog'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.click(document.querySelector('.gwm-overlay'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on Escape, the only keyboard exit in a design with no close X', async () => {
        render(<GiveawayModal />);
        await advancePastDelay();

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('opens Global Chat from the inline link and dismisses itself', async () => {
        // GlobalChat is a floating widget, not a route, so the only way to reach
        // it from here is the event it listens for.
        const onOpenChat = vi.fn();
        window.addEventListener('streamflix:open-global-chat', onOpenChat);

        render(<GiveawayModal />);
        await advancePastDelay();

        fireEvent.click(screen.getByRole('button', { name: 'Open Global Chat' }));

        expect(onOpenChat).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        window.removeEventListener('streamflix:open-global-chat', onOpenChat);
    });

    it('renders nothing when localStorage throws instead of crashing the page', async () => {
        const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });

        render(<GiveawayModal />);
        await advancePastDelay();

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        getItem.mockRestore();
    });
});
