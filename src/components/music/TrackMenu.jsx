import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ListVideo,
    ListPlus,
    Link2,
    Code,
    Share2,
    Copy,
    Check,
    Disc3,
    User
} from 'lucide-react';
import './TrackMenu.css';

/**
 * TrackMenu - Popup menu for track actions
 * Renders via Portal to avoid overflow/z-index issues
 */
const TrackMenu = ({
    position,
    onClose,
    track,
    onPlayNext,
    onAddToQueue,
    onViewAlbum,
    onViewArtist
}) => {
    const menuRef = useRef(null);
    const [toastMessage, setToastMessage] = useState(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };

        const handleScroll = () => onClose();
        const handleResize = () => onClose();

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
        };
    }, [onClose]);

    // Position adjustment to keep in viewport
    const getStyle = () => {
        if (!position) return {};

        const { x, y } = position;
        const style = { top: y, left: x };

        // Simple viewport check (can be expanded)
        if (window.innerHeight - y < 300) {
            style.top = 'auto';
            style.bottom = window.innerHeight - y;
        }

        if (window.innerWidth - x < 250) {
            style.left = 'auto';
            style.right = window.innerWidth - x;
        }

        return style;
    };

    const handleCopyLink = async () => {
        // e.g., http://localhost:5173/music/track/12345
        const url = `${window.location.origin}/music/track/${track.id}`;
        try {
            await navigator.clipboard.writeText(url);
            showToast('Link copied to clipboard');
            setTimeout(onClose, 1000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleCopyEmbed = async () => {
        const embedCode = `<iframe src="https://embed.tidal.com/tracks/${track.id}" width="100%" height="96" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
        try {
            await navigator.clipboard.writeText(embedCode);
            showToast('Embed code copied');
            setTimeout(onClose, 1000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2000);
    };

    return createPortal(
        <>
            <div className="track-menu-overlay" />
            <div
                ref={menuRef}
                className="track-menu"
                style={getStyle()}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="track-menu__group">
                    {onPlayNext && (
                        <button
                            className="track-menu__item"
                            onClick={() => {
                                onPlayNext(track);
                                onClose();
                            }}
                        >
                            <ListPlus size={18} />
                            <span>Play Next</span>
                        </button>
                    )}
                    {onViewAlbum && track.album && (
                        <button
                            className="track-menu__item"
                            onClick={() => {
                                onViewAlbum(track.album);
                                onClose();
                            }}
                        >
                            <Disc3 size={18} />
                            <span>Go to Album</span>
                        </button>
                    )}
                    {onViewArtist && (
                        <button
                            className="track-menu__item"
                            onClick={() => {
                                onViewArtist(track.artist || track.artists?.[0]);
                                onClose();
                            }}
                        >
                            <User size={18} />
                            <span>Go to Artist</span>
                        </button>
                    )}
                    <button
                        className="track-menu__item"
                        onClick={() => {
                            onAddToQueue?.(track);
                            onClose();
                        }}
                    >
                        <ListVideo size={18} />
                        <span>Add to Queue</span>
                    </button>
                </div>

                <div className="track-menu__group">
                    <button
                        className="track-menu__item"
                        onClick={handleCopyLink}
                    >
                        <Link2 size={18} />
                        <span>Share Link</span>
                    </button>
                    <button
                        className="track-menu__item"
                        onClick={handleCopyLink} // Same for now
                    >
                        <Copy size={18} />
                        <span>Share Short Link</span>
                    </button>
                    <button
                        className="track-menu__item"
                        onClick={handleCopyEmbed}
                    >
                        <Code size={18} />
                        <span>Copy Embed Code</span>
                    </button>
                </div>
            </div>
            {toastMessage && (
                <div className="track-menu-toast">
                    {toastMessage}
                </div>
            )}
        </>,
        document.body
    );
};

export default TrackMenu;
