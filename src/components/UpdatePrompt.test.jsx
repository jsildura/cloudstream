import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdatePrompt from './UpdatePrompt.jsx';
// Resolves to the test stub (see vitest.config.js resolve.alias).
import { swState, updateServiceWorker } from 'virtual:pwa-register/react';

// window.location.reload is what the fallback timer calls; stubbed so tests
// can assert on it instead of actually navigating.
const reloadSpy = vi.fn();

const renderPrompt = () => render(<UpdatePrompt />);

beforeEach(() => {
  vi.useFakeTimers();
  swState.needRefresh = false;
  updateServiceWorker.mockClear();
  reloadSpy.mockClear();
  Object.defineProperty(window.location, 'reload', {
    configurable: true,
    writable: true,
    value: reloadSpy,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('UpdatePrompt rendering', () => {
  it('renders nothing when no service-worker update is available', () => {
    renderPrompt();
    expect(screen.queryByText(/A new version of STREAMFLIX is out/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
  });

  it('shows the toast with the message and buttons when an update is available', () => {
    swState.needRefresh = true;
    renderPrompt();
    expect(screen.getByText(/A new version of STREAMFLIX is out/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('hides the toast when dismissed', () => {
    swState.needRefresh = true;
    const { rerender } = renderPrompt();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    // The stub setter flipped swState; rerender lets the component re-read it.
    rerender(<UpdatePrompt />);
    expect(screen.queryByText(/A new version of STREAMFLIX is out/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Update click + fallback reload timer
// ---------------------------------------------------------------------------

describe('UpdatePrompt update flow', () => {
  it('posts SKIP_WAITING via updateServiceWorker(true) on click', () => {
    swState.needRefresh = true;
    renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('falls back to a hard reload when controllerchange never fires', () => {
    swState.needRefresh = true;
    renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    // No reload immediately — the 4 s fallback waits for the service
    // worker to take control first.
    expect(reloadSpy).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(3999));
    expect(reloadSpy).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads immediately when controllerchange fires', () => {
    // Stub navigator.serviceWorker so the event listener can be registered.
    const listeners = {};
    const swStub = {
      addEventListener: (event, cb) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swStub,
    });

    swState.needRefresh = true;
    renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(reloadSpy).not.toHaveBeenCalled();

    // Simulate the new SW taking control.
    listeners.controllerchange?.forEach((cb) => cb());
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // The 4 s fallback should not cause a second reload.
    act(() => vi.advanceTimersByTime(4000));
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Clean up the stub.
    delete navigator.serviceWorker;
  });

  it('does not stack reload timers on repeated clicks', () => {
    swState.needRefresh = true;
    renderPrompt();
    const updateBtn = screen.getByRole('button', { name: 'Update' });

    fireEvent.click(updateBtn);
    fireEvent.click(updateBtn);
    fireEvent.click(updateBtn);
    // Each click still posts SKIP_WAITING, but only one reload is scheduled.
    expect(updateServiceWorker).toHaveBeenCalledTimes(3);

    act(() => vi.advanceTimersByTime(4000));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

