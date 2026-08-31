import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import SocialBarLoader from './SocialBarLoader';
import * as AdFreeContextModule from '../contexts/AdFreeContext';
import * as platformUtils from '../utils/platform';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE } from '../utils/adGating';

const SELECTOR = 'script[data-streamflix-socialbar="true"]';
const WIDGET_SELECTOR = 'iframe[src*="consumptionbackwardsentiments.com"]';
const WATCH_ROUTES = ['/watch', '/watch?type=tv&id=1', '/iptv/watch/123', '/sports/watch/abc'];

describe('SocialBarLoader Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    document.querySelectorAll(SELECTOR).forEach((s) => s.remove());
    document.querySelectorAll(WIDGET_SELECTOR).forEach((s) => s.remove());
    document.querySelectorAll('div[class*="adsterra"]').forEach((s) => s.remove());
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockGate = (adGateState, isAdFree = false, loading = false) => {
    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({ adGateState, isAdFree, loading });
  };

  /** Renders at `route` so the watch-page bypass can be exercised. */
  const renderAt = (route = '/') =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <SocialBarLoader />
      </MemoryRouter>
    );

  const insertExistingScriptAndWidget = () => {
    const existing = document.createElement('script');
    existing.src = 'https://consumptionbackwardsentiments.com/test-socialbar.js';
    existing.setAttribute('data-streamflix-socialbar', 'true');
    document.body.appendChild(existing);

    const widget = document.createElement('iframe');
    widget.src = 'https://consumptionbackwardsentiments.com/widget';
    document.body.appendChild(widget);

    return { existing, widget };
  };

  it('injects Adsterra social bar script into document.body when gate resolves to ads and not ad-free', () => {
    mockGate(AD_STATE_ADS, false, false);

    renderAt();

    const script = document.body.querySelector('script[data-network="adsterra-socialbar"]');
    expect(script).not.toBeNull();
    expect(script.src).toBe(
      'https://consumptionbackwardsentiments.com/13/4a/83/134a83b9c91d4f925e47c4aa8ab2176a.js'
    );
    expect(script.getAttribute('data-streamflix-socialbar')).toBe('true');
  });

  it('strictly does NOT inject when isAdFree is true even if adGateState is ads', () => {
    mockGate(AD_STATE_ADS, true, false);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject social bar script while loading is true', () => {
    mockGate(AD_STATE_ADS, false, true);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject social bar script while the gate is pending', () => {
    mockGate(AD_STATE_PENDING, false, false);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject social bar script when user is confirmed ad-free', () => {
    mockGate(AD_STATE_ADFREE, true, false);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('removes social bar scripts and ad widgets if user transitions to ad-free', () => {
    insertExistingScriptAndWidget();
    mockGate(AD_STATE_ADFREE, true, false);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
    expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
  });

  it('removes social bar scripts if gate falls back to pending', () => {
    insertExistingScriptAndWidget();
    mockGate(AD_STATE_PENDING, false, false);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does not duplicate scripts across re-renders', () => {
    mockGate(AD_STATE_ADS, false, false);

    const { rerender } = renderAt();
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <SocialBarLoader />
      </MemoryRouter>
    );

    expect(document.querySelectorAll(SELECTOR)).toHaveLength(1);
  });

  it('does NOT inject social bar scripts on TV devices', () => {
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(true);
    mockGate(AD_STATE_ADS, false, false);

    renderAt();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('removes social bar script and widgets if user transitions to ad-free dynamically', () => {
    mockGate(AD_STATE_ADS, false, false);

    const { rerender } = renderAt();

    expect(document.body.querySelector('script[data-network="adsterra-socialbar"]')).not.toBeNull();

    // Adsterra injects a widget into the body
    const widget = document.createElement('iframe');
    widget.src = 'https://consumptionbackwardsentiments.com/widget-dynamic';
    document.body.appendChild(widget);

    // User goes ad-free
    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
      adGateState: AD_STATE_ADFREE,
      isAdFree: true,
      loading: false
    });
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <SocialBarLoader />
      </MemoryRouter>
    );

    expect(document.querySelector(SELECTOR)).toBeNull();
    expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
  });

  describe('watch page suppression', () => {
    // The three account states the social bar has to stay off the player for.
    const USER_STATES = [
      { label: 'not signed in (anonymous)', gate: [AD_STATE_ADS, false, false] },
      { label: 'signed in, not ad-free', gate: [AD_STATE_ADS, false, false] },
      { label: 'signed in, ad-free', gate: [AD_STATE_ADFREE, true, false] }
    ];

    for (const { label, gate } of USER_STATES) {
      for (const route of WATCH_ROUTES) {
        it(`does NOT inject on ${route} for a user who is ${label}`, () => {
          mockGate(...gate);

          renderAt(route);

          expect(document.querySelector(SELECTOR)).toBeNull();
          expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
        });
      }
    }

    it('purges a pre-existing script and widget when landing on a watch page as an ads user', () => {
      insertExistingScriptAndWidget();
      mockGate(AD_STATE_ADS, false, false);

      renderAt('/watch');

      expect(document.querySelector(SELECTOR)).toBeNull();
      expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
    });

    it('injects again after navigating from a watch page back to a normal page', () => {
      mockGate(AD_STATE_ADS, false, false);

      // A real navigation, not a rerender: MemoryRouter only reads
      // initialEntries on mount, so the effect's pathname dep would not change.
      const GoHome = () => {
        const navigate = useNavigate();
        return <button onClick={() => navigate('/')}>home</button>;
      };

      render(
        <MemoryRouter initialEntries={['/watch']}>
          <SocialBarLoader />
          <GoHome />
        </MemoryRouter>
      );
      expect(document.querySelector(SELECTOR)).toBeNull();

      act(() => {
        screen.getByText('home').click();
      });

      expect(document.querySelector(SELECTOR)).not.toBeNull();
    });
  });

  describe('observer purges widgets the loaded script re-creates', () => {
    /** MutationObserver callbacks are microtask-scheduled, not synchronous. */
    const flushObserver = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    it('removes an iframe injected after mount on a watch page', async () => {
      mockGate(AD_STATE_ADS, false, false);

      renderAt('/watch');

      const widget = document.createElement('iframe');
      widget.src = 'https://consumptionbackwardsentiments.com/late-widget';
      document.body.appendChild(widget);

      await flushObserver();

      expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
    });

    it('removes an iframe injected after mount for an ad-free user on a NON-watch page', async () => {
      mockGate(AD_STATE_ADFREE, true, false);

      renderAt('/');

      const widget = document.createElement('iframe');
      widget.src = 'https://consumptionbackwardsentiments.com/late-widget';
      document.body.appendChild(widget);

      await flushObserver();

      expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
    });

    it('removes an iframe injected after mount while the gate is pending', async () => {
      mockGate(AD_STATE_PENDING, false, false);

      renderAt('/');

      const widget = document.createElement('iframe');
      widget.src = 'https://consumptionbackwardsentiments.com/late-widget';
      document.body.appendChild(widget);

      await flushObserver();

      expect(document.querySelector(WIDGET_SELECTOR)).toBeNull();
    });

    it('removes a fixed-position wrapper that is only filled with its iframe after insertion', async () => {
      mockGate(AD_STATE_ADFREE, true, false);

      renderAt('/watch');

      // Adsterra appends a bare randomized wrapper first...
      const wrapper = document.createElement('div');
      wrapper.id = 'sb-9f2a71';
      wrapper.style.position = 'fixed';
      document.body.appendChild(wrapper);

      await flushObserver();

      // ...and only later drops the iframe inside it.
      const inner = document.createElement('iframe');
      inner.src = 'https://adserver.example/social-bar';
      wrapper.appendChild(inner);

      await flushObserver();

      expect(document.getElementById('sb-9f2a71')).toBeNull();
    });

    it('stops purging once the observer is disconnected on unmount', async () => {
      mockGate(AD_STATE_ADFREE, true, false);

      const { unmount } = renderAt('/watch');
      unmount();

      const widget = document.createElement('iframe');
      widget.src = 'https://consumptionbackwardsentiments.com/after-unmount';
      document.body.appendChild(widget);

      await flushObserver();

      expect(document.querySelector(WIDGET_SELECTOR)).not.toBeNull();
      widget.remove();
    });
  });

  describe('the widget shape the network actually creates', () => {
    /**
     * Verified in a real browser: the live social bar is a srcless <iframe>
     * whose id/class carry the zone id, attached as a child of <html> rather
     * than <body>. Selectors qualified to `div`, matching on `src`, or scoped to
     * `body.children` all miss it.
     */
    const createLiveWidget = (suffix = '18997') => {
      const frame = document.createElement('iframe');
      frame.id = `container-134a83b9c91d4f925e47c4aa8ab2176a${suffix}`;
      frame.className = `container-134a83b9c91d4f925e47c4aa8ab2176a${suffix}`;
      frame.setAttribute('width', '150px');
      frame.setAttribute('height', '170px');
      frame.style.cssText = 'display: block; position: fixed; z-index: 2147483647;';
      // Note: no src attribute, matching the live element.
      document.documentElement.appendChild(frame);
      return frame;
    };

    const liveWidget = () =>
      document.querySelector('[id^="container-134a83b9c91d4f925e47c4aa8ab2176a"]');

    afterEach(() => {
      liveWidget()?.remove();
    });

    it('purges the srcless <html>-level widget on a watch page', () => {
      createLiveWidget();
      mockGate(AD_STATE_ADS, false, false);

      renderAt('/watch');

      expect(liveWidget()).toBeNull();
    });

    it('purges the srcless <html>-level widget for an ad-free user', () => {
      createLiveWidget();
      mockGate(AD_STATE_ADFREE, true, false);

      renderAt('/');

      expect(liveWidget()).toBeNull();
    });

    it('purges the srcless <html>-level widget while the gate is pending', () => {
      createLiveWidget();
      mockGate(AD_STATE_PENDING, false, false);

      renderAt('/');

      expect(liveWidget()).toBeNull();
    });

    it('purges an <html>-level widget injected after mount', async () => {
      mockGate(AD_STATE_ADS, false, false);

      renderAt('/watch');

      createLiveWidget('42');
      await Promise.resolve();
      await Promise.resolve();

      expect(liveWidget()).toBeNull();
    });

    it('purges a re-created widget with a different random suffix', async () => {
      mockGate(AD_STATE_ADFREE, true, false);

      renderAt('/');

      createLiveWidget('77001');
      await Promise.resolve();
      await Promise.resolve();
      expect(liveWidget()).toBeNull();

      // The loaded script keeps trying with a fresh suffix.
      createLiveWidget('90210');
      await Promise.resolve();
      await Promise.resolve();
      expect(liveWidget()).toBeNull();
    });

    it('leaves the widget in place for an ads user on a non-watch page', () => {
      const frame = createLiveWidget();
      mockGate(AD_STATE_ADS, false, false);

      renderAt('/');

      expect(liveWidget()).toBe(frame);
    });

    it('never removes <head> or <body>', () => {
      mockGate(AD_STATE_ADFREE, true, false);

      renderAt('/watch');

      expect(document.head).not.toBeNull();
      expect(document.body).not.toBeNull();
      expect(document.documentElement.contains(document.body)).toBe(true);
    });
  });

  describe('does not touch legitimate app DOM', () => {
    it('leaves a portaled modal overlay and its trailer iframe alone', () => {
      // Modal/HoverPreviewCard portal to document.body and hold YouTube
      // iframes, but take their position from a stylesheet, not inline styles.
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const trailer = document.createElement('iframe');
      trailer.src = 'https://www.youtube-nocookie.com/embed/abc123';
      overlay.appendChild(trailer);
      document.body.appendChild(overlay);

      mockGate(AD_STATE_ADFREE, true, false);
      renderAt('/');

      expect(document.querySelector('.modal-overlay')).not.toBeNull();
      expect(document.querySelector('iframe[src*="youtube-nocookie.com"]')).not.toBeNull();

      overlay.remove();
    });

    it('leaves the position:absolute adblock bait container alone', () => {
      // Deleting these would make runAdblockBaitTest report a false positive.
      const bait = document.createElement('div');
      bait.style.cssText = 'position: absolute; top: -9999px; left: -9999px;';
      const baitFrame = document.createElement('iframe');
      baitFrame.src = 'about:blank';
      baitFrame.className = 'ad-frame';
      bait.appendChild(baitFrame);
      document.body.appendChild(bait);

      mockGate(AD_STATE_ADFREE, true, false);
      renderAt('/');

      expect(document.querySelector('iframe.ad-frame')).not.toBeNull();

      bait.remove();
    });

    it('leaves the native banner container alone (same ad host, different zone)', () => {
      // NativeAd is gated independently; the social bar cleanup must not
      // collaterally remove it via the host-wide iframe match.
      const nativeContainer = document.createElement('div');
      nativeContainer.className = 'native-ad-container';
      nativeContainer.id = 'container-2169057a99b05d1f0c42cb91d4e1e11e';
      const nativeFrame = document.createElement('iframe');
      nativeFrame.src = 'https://consumptionbackwardsentiments.com/native/frame';
      nativeContainer.appendChild(nativeFrame);
      document.body.appendChild(nativeContainer);

      mockGate(AD_STATE_ADS, false, false);
      renderAt('/watch');

      expect(document.querySelector('.native-ad-container iframe')).not.toBeNull();

      nativeContainer.remove();
    });

    it('leaves the app root and splash screen alone', () => {
      const root = document.createElement('div');
      root.id = 'root';
      root.style.position = 'fixed';
      root.appendChild(document.createElement('iframe'));
      document.body.appendChild(root);

      mockGate(AD_STATE_ADFREE, true, false);
      renderAt('/watch');

      expect(document.getElementById('root')).not.toBeNull();

      root.remove();
    });
  });
});
