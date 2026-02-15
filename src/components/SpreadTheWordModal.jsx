import React, { useState, useEffect, useCallback } from 'react';
import './SpreadTheWordModal.css';

const STORAGE_KEY = 'streamflix_stw_last_shown';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 259200000ms

const SpreadTheWordModal = () => {
    const [show, setShow] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        try {
            const lastShown = localStorage.getItem(STORAGE_KEY);
            if (!lastShown || Date.now() - Number(lastShown) >= THREE_DAYS_MS) {
                // Small delay so it doesn't flash immediately on page load
                const timer = setTimeout(() => setShow(true), 2500);
                return () => clearTimeout(timer);
            }
        } catch {
            // localStorage unavailable – silently skip
        }
    }, []);

    const handleClose = useCallback(() => {
        setShow(false);
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch {
            // ignore
        }
    }, []);

    const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://andoks.cc';

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = shareUrl;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [shareUrl]);

    if (!show) return null;

    const shareText = encodeURIComponent('Found a hidden gem for free streaming, check it out:');
    const encodedUrl = encodeURIComponent(shareUrl);

    return (
        <div className="stw-overlay" onClick={handleClose}>
            <div className="stw-modal" onClick={(e) => e.stopPropagation()}>
                {/* Close Button */}
                <button className="stw-close-btn" onClick={handleClose} aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                {/* Header */}
                <div className="stw-header">
                    {/* Share Icon */}
                    <div className="stw-icon-wrapper">
                        <div className="stw-share-icon" aria-label="Share" role="img" />
                    </div>
                    <h2 className="stw-title">Don't Keep Us a Secret!</h2>
                    <p className="stw-subtitle">
                        The best things in life are free and even better when shared. Send StreamFlix to a friend, with just one tap. Plus, it helps us grow!
                    </p>
                </div>

                {/* Copy Link */}
                <div className="stw-copy-section">
                    <input
                        className="stw-link-input"
                        type="text"
                        value={shareUrl}
                        readOnly
                        onClick={(e) => e.target.select()}
                    />
                    <button className={`stw-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy} aria-label="Copy link">
                        {copied ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Social Share Buttons */}
                <div className="stw-socials">
                    {/* X (Twitter) */}
                    <a
                        className="stw-social-btn"
                        href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on X"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        <span className="stw-social-label">Twitter</span>
                    </a>

                    {/* WhatsApp */}
                    <a
                        className="stw-social-btn"
                        href={`https://wa.me/?text=${shareText}%20${encodedUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on WhatsApp"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        <span className="stw-social-label">WhatsApp</span>
                    </a>

                    {/* Facebook */}
                    <a
                        className="stw-social-btn"
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on Facebook"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        <span className="stw-social-label">Facebook</span>
                    </a>

                    {/* Messenger */}
                    <a
                        className="stw-social-btn"
                        href={`https://www.facebook.com/dialog/send?link=${encodedUrl}&app_id=291494419107518&redirect_uri=${encodedUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on Messenger"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.26L19.752 8.2l-6.561 6.763z" />
                        </svg>
                        <span className="stw-social-label">Messenger</span>
                    </a>

                    {/* Telegram */}
                    <a
                        className="stw-social-btn"
                        href={`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on Telegram"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0 12 12 0 0011.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                        </svg>
                        <span className="stw-social-label">Telegram</span>
                    </a>
                </div>
            </div>
        </div>
    );
};

export default SpreadTheWordModal;
