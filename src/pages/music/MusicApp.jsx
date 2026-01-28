import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import AudioPlayer from '../../components/music/AudioPlayer';
import DynamicBackgroundWebGL from '../../components/music/DynamicBackgroundWebGL';
import LyricsPopup from '../../components/music/LyricsPopup';
import { MusicPreferencesProvider, useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import { MusicPlayerProvider, useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { MusicSearchProvider } from '../../contexts/MusicSearchContext';
import '../../styles/music.css';
import './MusicApp.css';

/**
 * MusicAppContent - Inner component that uses preferences context
 */
const MusicAppContent = () => {
    const location = useLocation();
    const [isLyricsOpen, setIsLyricsOpen] = useState(false);
    const { currentTrack, isPlaying } = useMusicPlayer();

    // Derive cover URL for dynamic background
    const coverUrl = currentTrack?.album?.cover
        ? `https://resources.tidal.com/images/${currentTrack.album.cover.replace(/-/g, '/')}/640x640.jpg`
        : currentTrack?.cover
            ? `https://resources.tidal.com/images/${currentTrack.cover.replace(/-/g, '/')}/640x640.jpg`
            : null;

    const {
        playbackQuality,
        setPlaybackQuality,
        convertAacToMp3,
        toggleConvertAacToMp3,
        downloadCoversSeperately,
        toggleDownloadCoversSeperately,
        downloadMode,
        setDownloadMode,
        performanceMode,
        setPerformanceMode
    } = useMusicPreferences();

    // Update document title based on current track or route
    useEffect(() => {
        // If there's a current track, show track info in title
        if (currentTrack) {
            const artistName = currentTrack.artist?.name ?? currentTrack.artists?.[0]?.name ?? '';
            const trackTitle = currentTrack.title ?? 'Unknown';
            const prefix = isPlaying ? '▶ ' : '';
            document.title = `${prefix}${trackTitle} • ${artistName} | Streamflix Music`;
            return;
        }

        // Otherwise use route-based titles
        const titles = {
            '/music': 'Music | Streamflix',
            '/music/album': 'Album | Streamflix Music',
            '/music/artist': 'Artist | Streamflix Music',
            '/music/track': 'Track | Streamflix Music',
            '/music/playlist': 'Playlist | Streamflix Music'
        };

        // Find matching title
        const matchedPath = Object.keys(titles).find(path =>
            location.pathname === path || location.pathname.startsWith(path + '/')
        );

        document.title = matchedPath ? titles[matchedPath] : 'Music | Streamflix';

        return () => {
            document.title = 'Streamflix';
        };
    }, [location.pathname, currentTrack, isPlaying]);

    // Set performance attribute on document
    useEffect(() => {
        document.documentElement.setAttribute('data-music-performance', performanceMode);
        return () => {
            document.documentElement.removeAttribute('data-music-performance');
        };
    }, [performanceMode]);

    // Queue download handlers
    const handleQueueDownload = () => {
        console.log('Queue download triggered');
        alert('Queue download - will be implemented with full download system.');
    };

    const handleExportCsv = () => {
        console.log('CSV export triggered');
        alert('CSV export - will be implemented with full download system.');
    };

    return (
        <div className="music-app">
            {/* Dynamic Background */}
            <DynamicBackgroundWebGL
                coverUrl={coverUrl}
                className={`music-app-background ${isPlaying ? 'is-active' : ''}`}
            />

            {/* Main Content Area */}
            <div className="music-app__content">


                {/* Page Content - renders nested routes */}
                <main className="music-app__main">
                    <Outlet />
                </main>
            </div>

            {/* Audio Player */}
            <AudioPlayer onLyricsOpen={() => setIsLyricsOpen(true)} />

            {/* Lyrics Popup */}
            <LyricsPopup
                isOpen={isLyricsOpen}
                onClose={() => setIsLyricsOpen(false)}
            />
        </div>
    );
};

/**
 * MusicApp - Layout wrapper for the /music/* routes
 * 
 * This is the app shell that contains:
 * - MusicPreferencesProvider for settings state
 * - MusicPlayerProvider for playback state
 * - Header toolbar with settings menu
 * - Dynamic background
 * - Audio player fixed at bottom
 * - Nested route content via <Outlet />
 * 
 * Player is scoped to /music/* routes only (not global).
 */
const MusicApp = () => {
    return (
        <MusicPreferencesProvider>
            <MusicPlayerProvider>
                <MusicSearchProvider>
                    <MusicAppContent />
                </MusicSearchProvider>
            </MusicPlayerProvider>
        </MusicPreferencesProvider>
    );
};

export default MusicApp;
