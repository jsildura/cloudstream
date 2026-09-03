import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { RECENT_UPDATE } from '../constants/updateHighlights';
import './UpdateModal.css';

export default function UpdateModal({ highlight = RECENT_UPDATE.highlight, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    // Check if site just reloaded from a successful update prompt
    if (localStorage.getItem('streamflix_just_updated') === 'true') {
      setIsOpen(true);
    }

    // Allow opening via custom event for testing / manual trigger
    const handleTrigger = () => {
      setIsOpen(true);
    };
    window.addEventListener('streamflix:show-update-modal', handleTrigger);
    return () => {
      window.removeEventListener('streamflix:show-update-modal', handleTrigger);
    };
  }, []);

  const handleClose = () => {
    localStorage.removeItem('streamflix_just_updated');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="update-modal-backdrop" onClick={handleClose}>
      <div
        className="update-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
      >
        <h2 id="update-modal-title" className="update-modal-title">
          StreamFlix Ongoing Development
        </h2>
        <p className="update-modal-subtitle">A quick update from the developer</p>

        <div className="update-modal-content">
          <p>Hi everyone,😻</p>
          <p>
            <strong>StreamFlix</strong> is actively under development. I'll be releasing regular updates, including bug fixes, stability improvements, UI enhancements, and new features.
          </p>
          <p className="update-modal-highlight-row">
            <strong>Recent update:</strong> {highlight}
          </p>
          <p>
            Thanks for your patience and continued support. Expect the site to become more stable with each update.
          </p>
          <p>
            Have a suggestion or found a bug? Head over to our Global Chat and let us know!
          </p>
        </div>

        <div className="update-modal-signoff">
          — <strong>StreamFlix Developer</strong>
        </div>

        <div className="update-modal-footer">
          <button type="button" className="update-modal-btn" onClick={handleClose}>
            <Check size={15} strokeWidth={3} aria-hidden="true" />
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
