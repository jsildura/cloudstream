import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import SocialBarLoader from './SocialBarLoader';
import * as AdFreeContextModule from '../contexts/AdFreeContext';
import * as platformUtils from '../utils/platform';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE } from '../utils/adGating';

const SELECTOR = 'script[data-streamflix-socialbar="true"]';

describe('SocialBarLoader Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    document.querySelectorAll(SELECTOR).forEach((s) => s.remove());
    document.querySelectorAll('iframe[src*="consumptionbackwardsentiments.com"]').forEach((s) => s.remove());
    document.querySelectorAll('div[class*="adsterra"]').forEach((s) => s.remove());
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockGate = (adGateState, isAdFree = false, loading = false) => {
    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({ adGateState, isAdFree, loading });
  };

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

    render(<SocialBarLoader />);

    const script = document.body.querySelector('script[data-network="adsterra-socialbar"]');
    expect(script).not.toBeNull();
    expect(script.src).toBe(
      'https://consumptionbackwardsentiments.com/13/4a/83/134a83b9c91d4f925e47c4aa8ab2176a.js'
    );
    expect(script.getAttribute('data-streamflix-socialbar')).toBe('true');
  });

  it('strictly does NOT inject when isAdFree is true even if adGateState is ads', () => {
    mockGate(AD_STATE_ADS, true, false);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject social bar script while loading is true', () => {
    mockGate(AD_STATE_ADS, false, true);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject social bar script while the gate is pending', () => {
    mockGate(AD_STATE_PENDING, false, false);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does NOT inject social bar script when user is confirmed ad-free', () => {
    mockGate(AD_STATE_ADFREE, true, false);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('removes social bar scripts and ad widgets if user transitions to ad-free', () => {
    insertExistingScriptAndWidget();
    mockGate(AD_STATE_ADFREE, true, false);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
    expect(document.querySelector('iframe[src*="consumptionbackwardsentiments.com"]')).toBeNull();
  });

  it('removes social bar scripts if gate falls back to pending', () => {
    insertExistingScriptAndWidget();
    mockGate(AD_STATE_PENDING, false, false);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('does not duplicate scripts across re-renders', () => {
    mockGate(AD_STATE_ADS, false, false);

    const { rerender } = render(<SocialBarLoader />);
    rerender(<SocialBarLoader />);

    expect(document.querySelectorAll(SELECTOR)).toHaveLength(1);
  });

  it('does NOT inject social bar scripts on TV devices', () => {
    vi.spyOn(platformUtils, 'isTVDevice').mockReturnValue(true);
    mockGate(AD_STATE_ADS, false, false);

    render(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('removes social bar script and widgets if user transitions to ad-free dynamically', () => {
    mockGate(AD_STATE_ADS, false, false);

    const { rerender } = render(<SocialBarLoader />);

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
    rerender(<SocialBarLoader />);

    expect(document.querySelector(SELECTOR)).toBeNull();
    expect(document.querySelector('iframe[src*="consumptionbackwardsentiments.com"]')).toBeNull();
  });
});
