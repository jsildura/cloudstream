import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdateModal from './UpdateModal.jsx';
import { RECENT_UPDATE } from '../constants/updateHighlights';

describe('UpdateModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders nothing when no update flag is in localStorage', () => {
    render(<UpdateModal />);
    expect(screen.queryByText('StreamFlix Ongoing Development')).not.toBeInTheDocument();
  });

  it('renders modal when streamflix_just_updated is true in localStorage', () => {
    localStorage.setItem('streamflix_just_updated', 'true');
    render(<UpdateModal />);

    expect(screen.getByText('StreamFlix Ongoing Development')).toBeInTheDocument();
    expect(screen.getByText('A quick update from the developer')).toBeInTheDocument();
    expect(screen.getByText(/Recent update:/)).toBeInTheDocument();
    expect(screen.getByText(RECENT_UPDATE.highlight)).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Got it/ })).toBeInTheDocument();
  });

  it('displays custom update highlight when provided', () => {
    localStorage.setItem('streamflix_just_updated', 'true');
    render(<UpdateModal highlight="New video player with 4K stream." />);

    expect(screen.getByText(/New video player with 4K stream\./)).toBeInTheDocument();
  });

  it('clears localStorage and closes modal when Got it button is clicked', () => {
    localStorage.setItem('streamflix_just_updated', 'true');
    render(<UpdateModal />);

    const button = screen.getByRole('button', { name: /Got it/ });
    fireEvent.click(button);

    expect(localStorage.getItem('streamflix_just_updated')).toBeNull();
    expect(screen.queryByText('StreamFlix Ongoing Development')).not.toBeInTheDocument();
  });

  it('opens modal on custom streamflix:show-update-modal event', () => {
    render(<UpdateModal />);
    expect(screen.queryByText('StreamFlix Ongoing Development')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('streamflix:show-update-modal'));
    });

    expect(screen.getByText('StreamFlix Ongoing Development')).toBeInTheDocument();
  });
});
