import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import PopunderLoader from './PopunderLoader';
import * as AdFreeContextModule from '../contexts/AdFreeContext';
import * as platformUtils from '../utils/platform';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE } from '../utils/adGating';

const SELECTOR = 'script[data-streamflix-popunder="true"]';

describe('PopunderLoader Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    document.head.querySelectorAll(SELECTOR).forEach((s) => s.remove());
    // Also clean up PopAds child scripts
    document.querySelectorAll(
      'script[src*="premiumvertising.com"], script[src*="cloudfront.net/M/"], script[src*="cloudfront.net/FnJxEu"], script[src*="cloudfront.net/GjCt"]'
    ).forEach((s) => s.remove());
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockGate = (adGateState) => {
    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({ adGateState });
  };

  const insertExistingScript = () => {
    const existing = document.createElement('script');
    existing.src = 'https://consumptionbackwardsentiments.com/test.js';
    existing.setAttribute('data-streamflix-popunder', 'true');
    document.head.appendChild(existing);
    return existing;
  };

  it('injects Adsterra immediately and PopAds after a 3s delay when gate resolves to ads', () => {
    mockGate(AD_STATE_ADS);

    render(<PopunderLoader />);

    // Adsterra should be injected immediately
    const adsterra = document.head.querySelector('script[data-network="adsterra"]');
    expect(adsterra).not.toBeNull();
    expect(adsterra.src).toContain('consumptionbackwardsentiments.com');
    expect(adsterra.getAttribute('data-streamflix-popunder')).toBe('true');

    // PopAds should NOT be injected yet (staggered by 3s)
    expect(document.head.querySelector('script[data-network="popads"]')).toBeNull();

    // Advance timers to trigger PopAds injection
    vi.advanceTimersByTime(3000);

    const popads = document.head.querySelector('script[data-network="popads"]');
    expect(popads).not.toBeNull();
    expect(popads.text).toContain('/*<![CDATA[/* */');
    expect(popads.text).toContain('a34232821fefdf3f931e52a459524310');
    expect(popads.getAttribute('data-cfasync')).toBe('false');
    expect(popads.getAttribute('data-streamflix-popunder')).toBe('true');
  });

  it('does NOT inject popunder scripts while the gate is pending', () => {
    mockGate(AD_STATE_PENDING);

    render(<PopunderLoader />);

    vi.advanceTimersByTime(3000);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject popunder scripts when user is confirmed ad-free', () => {
    mockGate(AD_STATE_ADFREE);

    render(<PopunderLoader />);

    vi.advanceTimersByTime(3000);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('removes popunder scripts if user transitions to ad-free', () => {
    insertExistingScript();
    mockGate(AD_STATE_ADFREE);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('removes popunder scripts if the gate falls back to pending', () => {
    insertExistingScript();
    mockGate(AD_STATE_PENDING);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('does not duplicate scripts across re-renders', () => {
    mockGate(AD_STATE_ADS);

    const { rerender } = render(<PopunderLoader />);

    // Advance timers so PopAds fires
    vi.advanceTimersByTime(3000);

    rerender(<PopunderLoader />);

    // Adsterra + PopAds = 2 scripts with the popunder attr
    expect(document.head.querySelectorAll(SELECTOR)).toHaveLength(2);
  });

  it('does NOT inject popunder scripts on TV devices', () => {
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(true);
    mockGate(AD_STATE_ADS);

    render(<PopunderLoader />);

    vi.advanceTimersByTime(3000);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('cancels PopAds timer if user transitions to ad-free before delay expires', () => {
    mockGate(AD_STATE_ADS);

    const { rerender } = render(<PopunderLoader />);

    // Adsterra injected, PopAds timer started
    expect(document.head.querySelector('script[data-network="adsterra"]')).not.toBeNull();
    expect(document.head.querySelector('script[data-network="popads"]')).toBeNull();

    // User goes ad-free before the 3s delay
    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({ adGateState: AD_STATE_ADFREE });
    rerender(<PopunderLoader />);

    // Adsterra should be removed, PopAds timer should be cancelled
    vi.advanceTimersByTime(3000);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });
});
