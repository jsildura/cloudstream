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

  it('injects popunder script once the gate resolves to ads', () => {
    mockGate(AD_STATE_ADS);

    render(<PopunderLoader />);

    const script = document.head.querySelector(SELECTOR);
    expect(script).not.toBeNull();
    expect(script.src).toContain('consumptionbackwardsentiments.com');
  });

  it('does NOT inject popunder script while the gate is pending', () => {
    mockGate(AD_STATE_PENDING);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject popunder script when user is confirmed ad-free', () => {
    mockGate(AD_STATE_ADFREE);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('removes popunder script if user transitions to ad-free', () => {
    insertExistingScript();
    mockGate(AD_STATE_ADFREE);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('removes popunder script if the gate falls back to pending', () => {
    insertExistingScript();
    mockGate(AD_STATE_PENDING);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });

  it('injects only one script across re-renders', () => {
    mockGate(AD_STATE_ADS);

    const { rerender } = render(<PopunderLoader />);
    rerender(<PopunderLoader />);

    expect(document.head.querySelectorAll(SELECTOR)).toHaveLength(1);
  });

  it('does NOT inject popunder script on TV devices', () => {
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(true);
    mockGate(AD_STATE_ADS);

    render(<PopunderLoader />);

    expect(document.head.querySelector(SELECTOR)).toBeNull();
  });
});
