import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NativeAd from './NativeAd';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE } from '../utils/adGating';

vi.mock('../contexts/AdFreeContext', () => ({
  useAdFree: vi.fn(() => ({ adGateState: 'pending' }))
}));

vi.mock('./NativeAd.css', () => ({}));

const CONTAINER_ID = 'container-2169057a99b05d1f0c42cb91d4e1e11e';

describe('NativeAd Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockGate = (adGateState) => {
    vi.mocked(useAdFree).mockReturnValue({ adGateState });
  };

  it('renders nothing and injects no script while the gate is pending', () => {
    mockGate(AD_STATE_PENDING);

    const { container } = render(<NativeAd />);

    expect(container.firstChild).toBeNull();
    expect(document.getElementById(CONTAINER_ID)).toBeNull();
  });

  it('renders nothing for a confirmed ad-free account', () => {
    mockGate(AD_STATE_ADFREE);

    const { container } = render(<NativeAd />);

    expect(container.firstChild).toBeNull();
  });

  it('renders the ad section and injects the Adsterra script once the gate resolves to ads', () => {
    mockGate(AD_STATE_ADS);

    render(<NativeAd />);

    expect(screen.getByText("Don't Miss Out")).toBeInTheDocument();
    expect(screen.getByText('Ad')).toBeInTheDocument();

    const adContainer = document.getElementById(CONTAINER_ID);
    expect(adContainer).not.toBeNull();

    const script = adContainer.querySelector('script');
    expect(script).not.toBeNull();
    expect(script.src).toContain('2169057a99b05d1f0c42cb91d4e1e11e/invoke.js');
    expect(script.getAttribute('data-cfasync')).toBe('false');
  });

  it('removes the injected script when the gate leaves ads', () => {
    mockGate(AD_STATE_ADS);
    const { rerender } = render(<NativeAd />);
    expect(document.getElementById(CONTAINER_ID).querySelector('script')).not.toBeNull();

    mockGate(AD_STATE_ADFREE);
    rerender(<NativeAd />);

    expect(document.getElementById(CONTAINER_ID)).toBeNull();
  });
});
