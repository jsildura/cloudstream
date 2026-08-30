import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import PopunderLoader from './PopunderLoader';
import * as AdFreeContextModule from '../contexts/AdFreeContext';
import * as platformUtils from '../utils/platform';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE } from '../utils/adGating';

const SELECTOR = 'script[data-streamflix-popunder="true"]';

describe('PopunderLoader Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.querySelectorAll(SELECTOR).forEach((s) => s.remove());
    // Also clean up PopAds child scripts
    document.querySelectorAll(
      'script[src*="premiumvertising.com"], script[src*="cloudfront.net/FnJxEu"], script[src*="cloudfront.net/GjCt"]'
    ).forEach((s) => s.remove());
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(false);
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

  it('injects both Adsterra and PopAds scripts when gate resolves to ads', () => {
    mockGate(AD_STATE_ADS);

    render(<PopunderLoader />);

    const adsterra = document.head.querySelector('script[data-network="adsterra"]');
    expect(adsterra).not.toBeNull();
    expect(adsterra.src).toContain('consumptionbackwardsentiments.com');
    expect(adsterra.getAttribute('data-streamflix-popunder')).toBe('true');

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

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject popunder scripts when user is confirmed ad-free', () => {
    mockGate(AD_STATE_ADFREE);

    render(<PopunderLoader />);

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
    rerender(<PopunderLoader />);

    // Adsterra + PopAds = 2 scripts with the popunder attr
    expect(document.head.querySelectorAll(SELECTOR)).toHaveLength(2);
  });

  it('does NOT inject popunder scripts on TV devices', () => {
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(true);
    mockGate(AD_STATE_ADS);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });
});
