import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdblockModal from './AdblockModal';
import { runAdblockBaitTest } from '../lib/adblockDetection';
import { isTVUserAgent } from '../utils/platform';

vi.mock('../lib/adblockDetection', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, runAdblockBaitTest: vi.fn(actual.runAdblockBaitTest) };
});

vi.mock('../utils/platform', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, isTVUserAgent: vi.fn(actual.isTVUserAgent) };
});

// happy-dom reports offsetWidth/offsetHeight as 0 (no layout engine); simulate
// real browser layout so a 1x1px block reads 1 unless actually hidden.
const patchRealLayout = () => {
    const proto = HTMLElement.prototype;
    const w = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
    const h = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
    Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 1 });
    Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 1 });
    return () => {
        Object.defineProperty(proto, 'offsetWidth', w ?? { configurable: true, value: 0 });
        Object.defineProperty(proto, 'offsetHeight', h ?? { configurable: true, value: 0 });
    };
};

// Detection runs after a 500ms mount delay plus a 500ms settle delay.
const RUN_DETECTION_MS = 1500;

const runDetection = async () => {
    await act(async () => {
        vi.advanceTimersByTime(RUN_DETECTION_MS);
    });
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-test-style]').forEach(s => s.remove());
});

describe('AdblockModal — no false positives', () => {
    it('renders nothing when no ad blocker is present', async () => {
        vi.useFakeTimers();
        const restore = patchRealLayout();
        try {
            render(<AdblockModal />);
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();

            await runDetection();

            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            // Baits are cleaned up after the check.
            expect(document.querySelector('.ad-unit')).toBeNull();
        } finally {
            restore();
        }
    });

    it('page fade-in (ancestor opacity:0) does not false-positive', async () => {
        vi.useFakeTimers();
        const restore = patchRealLayout();
        try {
            document.body.style.opacity = '0';
            render(<AdblockModal />);

            await runDetection();

            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
        } finally {
            restore();
        }
    });

    it('detection error is treated as "no adblock"', async () => {
        vi.useFakeTimers();
        vi.mocked(runAdblockBaitTest).mockRejectedValueOnce(new Error('boom'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            render(<AdblockModal />);

            await runDetection();

            expect(spy).toHaveBeenCalledWith('Adblock detection error:', expect.any(Error));
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
        } finally {
            spy.mockRestore();
        }
    });
});

describe('AdblockModal — true positives', () => {
    it('uBlock-style cosmetic filter shows the blocking overlay', async () => {
        vi.useFakeTimers();
        const restore = patchRealLayout();
        try {
            const style = document.createElement('style');
            style.dataset.testStyle = '1';
            style.textContent = '.ad-unit { display: none !important; }';
            document.head.appendChild(style);

            render(<AdblockModal />);
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();

            await runDetection();

            expect(document.querySelector('.adblock-overlay')).toBeInTheDocument();
            expect(screen.getByText(/Something's blocking the ads/i)).toBeInTheDocument();
        } finally {
            restore();
        }
    });
});

describe('AdblockModal — desktop/mobile dismiss escape hatch', () => {
    it('allows desktop/mobile users to dismiss the modal and persists to sessionStorage', async () => {
        vi.useFakeTimers();
        sessionStorage.clear();
        const restore = patchRealLayout();
        try {
            const style = document.createElement('style');
            style.dataset.testStyle = '1';
            style.textContent = '.ad-unit { display: none !important; }';
            document.head.appendChild(style);

            render(<AdblockModal />);
            await runDetection();

            expect(document.querySelector('.adblock-overlay')).toBeInTheDocument();
            const dismissBtn = screen.getByRole('button', { name: /continue anyway/i });
            expect(dismissBtn).toBeInTheDocument();

            act(() => fireEvent.click(dismissBtn));

            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
            expect(sessionStorage.getItem('streamflix_adblock_dismissed')).toBe('true');
        } finally {
            restore();
            sessionStorage.clear();
        }
    });

    it('does not display modal when session is already dismissed', async () => {
        vi.useFakeTimers();
        sessionStorage.setItem('streamflix_adblock_dismissed', 'true');
        const restore = patchRealLayout();
        try {
            const style = document.createElement('style');
            style.dataset.testStyle = '1';
            style.textContent = '.ad-unit { display: none !important; }';
            document.head.appendChild(style);

            render(<AdblockModal />);
            await runDetection();

            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        } finally {
            restore();
            sessionStorage.clear();
        }
    });
});

describe('AdblockModal — TV browsers get a dismissible banner, not a block', () => {
    it('shows the banner instead of the overlay and can be dismissed', async () => {
        vi.useFakeTimers();
        sessionStorage.clear();
        // Persistent mock: the component re-reads isTVUserAgent() on the
        // re-render after detection completes.
        vi.mocked(isTVUserAgent).mockReturnValue(true);
        const restore = patchRealLayout();
        try {
            const style = document.createElement('style');
            style.dataset.testStyle = '1';
            style.textContent = '.ad-unit { display: none !important; }';
            document.head.appendChild(style);

            render(<AdblockModal />);
            await runDetection();

            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();

            act(() => fireEvent.click(document.querySelector('.adblock-banner-dismiss')));
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(sessionStorage.getItem('streamflix_adblock_dismissed')).toBe('true');
        } finally {
            restore();
            sessionStorage.clear();
        }
    });
});
