import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PinSettings from './PinSettings';

let mockProfiles = {
  submitKidsPin: vi.fn(),
  cancelKidsExit: vi.fn(),
  remainingAttempts: 3,
  cooldownUntil: null,
  pinAction: { type: 'switch_profile' }
};

vi.mock('../../contexts/ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

describe('PinSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfiles = {
      submitKidsPin: vi.fn().mockResolvedValue({ ok: true }),
      cancelKidsExit: vi.fn(),
      remainingAttempts: 3,
      cooldownUntil: null,
      pinAction: { type: 'switch_profile' }
    };
  });

  it('renders masked PIN dots and keypad', () => {
    render(<PinSettings onCancel={() => {}} onSuccess={() => {}} />);

    expect(screen.getByText('Exit Kids Profile')).toBeDefined();
    expect(screen.getByLabelText(/PIN entered: 0 of 4 digits/i)).toBeDefined();
    expect(screen.getByRole('button', { name: '1' })).toBeDefined();
    expect(screen.getByRole('button', { name: '9' })).toBeDefined();
    expect(screen.getByRole('button', { name: /clear all digits/i })).toBeDefined();
  });

  it('enters digits via keypad and auto-submits on 4th digit', async () => {
    const onSuccess = vi.fn();
    render(<PinSettings onCancel={() => {}} onSuccess={onSuccess} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '1' }));
      fireEvent.click(screen.getByRole('button', { name: '2' }));
      fireEvent.click(screen.getByRole('button', { name: '3' }));
      fireEvent.click(screen.getByRole('button', { name: '4' }));
    });

    await vi.waitFor(() => {
      expect(mockProfiles.submitKidsPin).toHaveBeenCalledWith('1234');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message on invalid PIN submission', async () => {
    mockProfiles.submitKidsPin.mockResolvedValue({
      ok: false,
      reason: 'invalid-pin',
      remainingAttempts: 2
    });

    render(<PinSettings onCancel={() => {}} onSuccess={() => {}} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
    });

    await vi.waitFor(() => {
      expect(screen.getByText(/Incorrect PIN. 2 attempts remaining./i)).toBeDefined();
    });
  });

  it('disables keypad and shows cooldown timer when cooldown is active', () => {
    mockProfiles.cooldownUntil = Date.now() + 15000;

    render(<PinSettings onCancel={() => {}} onSuccess={() => {}} />);

    expect(screen.getByText(/Too many attempts. Try again in/i)).toBeDefined();
    const key1 = screen.getByRole('button', { name: '1' });
    expect(key1.hasAttribute('disabled')).toBe(true);
  });

  it('calls cancelKidsExit and onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<PinSettings onCancel={onCancel} onSuccess={() => {}} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(mockProfiles.cancelKidsExit).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});
