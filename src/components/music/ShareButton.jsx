import React, { useState, useRef, useEffect } from 'react';
import { Share2, Link2, Code, Twitter, Copy, Check } from 'lucide-react';
import './ShareButton.css';

/**
 * ShareButton - Share content via various methods
 * 
 * Ported from tidal-ui ShareButton.svelte
 * Features:
 * - Copy link
 * - Copy embed code
 * - Share to Twitter
 * - Dropdown menu
 */
const ShareButton = ({
    type = 'track', // 'track' | 'album' | 'artist' | 'playlist'
    id,
    title,
    artist,
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(null);
    const menuRef = useRef(null);
    const buttonRef = useRef(null);

    const baseUrl = 'https://music.binimum.org';
    const shareUrl = `${baseUrl}/${type}/${id}`;
    const embedCode = `<iframe src="${baseUrl}/embed/${type}/${id}" width="100%" height="450" style="border:none; overflow:hidden; border-radius: 0.5em;" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;

    const displayTitle = title && artist
        ? `${title} by ${artist}`
        : title ?? 'Music from Streamflix';

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Copy to clipboard
    const copyToClipboard = async (text, type) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopied(type);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Share to Twitter
    const shareToTwitter = () => {
        const text = encodeURIComponent(`Check out "${displayTitle}" on Streamflix Music!`);
        const url = encodeURIComponent(shareUrl);
        window.open(
            `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
            '_blank',
            'noopener,noreferrer'
        );
        setIsOpen(false);
    };

    return (
        <div className={`share-button ${className}`}>
            <button
                ref={buttonRef}
                className="share-button__trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Share"
                aria-expanded={isOpen}
            >
                <Share2 size={18} />
            </button>

            {isOpen && (
                <div ref={menuRef} className="share-button__menu">
                    <button
                        className="share-button__item"
                        onClick={() => copyToClipboard(shareUrl, 'link')}
                    >
                        {copied === 'link' ? <Check size={16} /> : <Link2 size={16} />}
                        <span>{copied === 'link' ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                        className="share-button__item"
                        onClick={() => copyToClipboard(embedCode, 'embed')}
                    >
                        {copied === 'embed' ? <Check size={16} /> : <Code size={16} />}
                        <span>{copied === 'embed' ? 'Copied!' : 'Copy Embed'}</span>
                    </button>

                    <div className="share-button__divider" />

                    <button
                        className="share-button__item"
                        onClick={shareToTwitter}
                    >
                        <Twitter size={16} />
                        <span>Share to Twitter</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ShareButton;
