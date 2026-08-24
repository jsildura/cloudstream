import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdblockModal from './AdblockModal';
import { runAdblockBaitTest } from '../lib/adblockDetection';
import { isTVUserAgent } from '../utils/platform';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE, ADFREE_PRICE_LABEL } from '../utils/adGating';

vi.mock('../lib/adblockDetection', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, runAdblockBaitTest: vi.fn(actual.runAdblockBaitTest) };
});

vi.mock('../utils/platform', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, isTVUserAgent: vi.fn(actual.isTVUserAgent) };
});

// The modal is an ad surface, so it reads the tri-state gate. Default the mock
// to `ads`; the gating tests below override it.
vi.mock('../contexts/AdFreeContext', () => ({
    useAdFree: vi.fn(() => ({ adGateState: 'ads' }))
}));

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

const mockGate = (adGateState) => {
    vi.mocked(useAdFree).mockReturnValue({ adGateState });
};

beforeEach(() => {
    vi.mocked(runAdblockBaitTest).mockClear();
    mockGate(AD_STATE_ADS);
});

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

describe('AdblockModal — ad-free upsell', () => {
    const blockAds = () => {
        const style = document.createElement('style');
        style.dataset.testStyle = '1';
        style.textContent = '.ad-unit { display: none !important; }';
        document.head.appendChild(style);
    };

    it('hides the overlay and asks the navbar to open Disable Ads', async () => {
        vi.useFakeTimers();
        sessionStorage.clear();
        const restore = patchRealLayout();
        const onOpen = vi.fn();
        window.addEventListener('streamflix:open-adfree-settings', onOpen);
        try {
            blockAds();
            render(<AdblockModal />);
            await runDetection();

            expect(document.querySelector('.adblock-overlay')).toBeInTheDocument();
            const adFreeBtn = screen.getByRole('button', { name: /go ad-free/i });

            act(() => fireEvent.click(adFreeBtn));

            // The overlay is z-index 99999 over the navbar dropdown the event opens,
            // so it has to be gone or the panel is unreachable.
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
            expect(onOpen).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener('streamflix:open-adfree-settings', onOpen);
            restore();
            sessionStorage.clear();
        }
    });

    it('does not persist the dismissal, so a non-buyer is asked again next load', async () => {
        vi.useFakeTimers();
        sessionStorage.clear();
        const restore = patchRealLayout();
        try {
            blockAds();
            render(<AdblockModal />);
            await runDetection();

            act(() => fireEvent.click(screen.getByRole('button', { name: /go ad-free/i })));

            expect(sessionStorage.getItem('streamflix_adblock_dismissed')).toBeNull();
        } finally {
            restore();
            sessionStorage.clear();
        }
    });

    it('quotes the shared price label rather than its own literal', async () => {
        vi.useFakeTimers();
        const restore = patchRealLayout();
        try {
            blockAds();
            render(<AdblockModal />);
            await runDetection();

            expect(document.querySelector('.adblock-adfree-btn').textContent)
                .toContain(ADFREE_PRICE_LABEL);
        } finally {
            restore();
        }
    });

    it('leaves "Continue Anyway" in place as the free way out', async () => {
        vi.useFakeTimers();
        const restore = patchRealLayout();
        try {
            blockAds();
            render(<AdblockModal />);
            await runDetection();

            expect(screen.getByRole('button', { name: /continue anyway/i })).toBeInTheDocument();
        } finally {
            restore();
        }
    });
});

describe('AdblockModal — ad gate', () => {
    const blockAds = () => {
        const style = document.createElement('style');
        style.dataset.testStyle = '1';
        style.textContent = '.ad-unit { display: none !important; }';
        document.head.appendChild(style);
    };

    it('runs no detection and renders nothing while the gate is pending', async () => {
        vi.useFakeTimers();
        mockGate(AD_STATE_PENDING);
        const restore = patchRealLayout();
        try {
            blockAds();
            render(<AdblockModal />);

            await runDetection();

            expect(vi.mocked(runAdblockBaitTest)).not.toHaveBeenCalled();
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
        } finally {
            restore();
        }
    });

    it('runs no detection and renders nothing for an ad-free account', async () => {
        vi.useFakeTimers();
        mockGate(AD_STATE_ADFREE);
        const restore = patchRealLayout();
        try {
            blockAds();
            render(<AdblockModal />);

            await runDetection();

            expect(vi.mocked(runAdblockBaitTest)).not.toHaveBeenCalled();
            expect(document.querySelector('.adblock-overlay')).not.toBeInTheDocument();
        } finally {
            restore();
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
