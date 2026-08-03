import React, { useEffect, useRef, useState } from 'react';

// Global promise to load the YT API only once
let apiPromise = null;
const loadYouTubeAPI = () => {
    if (window.YT && window.YT.Player) {
        return Promise.resolve(window.YT);
    }
    if (!apiPromise) {
        apiPromise = new Promise((resolve) => {
            window.onYouTubeIframeAPIReady = () => {
                resolve(window.YT);
            };
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        });
    }
    return apiPromise;
};

const YouTubePlayer = ({ videoId, isMuted, onMuteChange }) => {
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let isMounted = true;

        loadYouTubeAPI().then((YT) => {
            if (!isMounted || !containerRef.current) return;

            playerRef.current = new YT.Player(containerRef.current, {
                videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    showinfo: 0,
                    modestbranding: 1,
                    rel: 0,
                    iv_load_policy: 3,
                    disablekb: 1,
                    playsinline: 1,
                    loop: 1,
                    playlist: videoId,
                },
                events: {
                    onReady: (event) => {
                        if (!isMounted) return;
                        setIsReady(true);
                        const player = event.target;
                        
                        // Try playing unmuted first
                        if (!isMuted) {
                            player.unMute();
                        } else {
                            player.mute();
                        }
                        
                        player.playVideo();

                        // Fallback: If the browser blocked unmuted autoplay, the video will stay paused or unstarted.
                        // Check after a short delay and fallback to muted if necessary.
                        setTimeout(() => {
                            if (!isMounted || !player.getPlayerState) return;
                            const state = player.getPlayerState();
                            // If it's not playing (1) or buffering (3), autoplay was likely blocked.
                            if (state !== 1 && state !== 3) {
                                console.log('Autoplay blocked. Falling back to muted.');
                                player.mute();
                                player.playVideo();
                                onMuteChange?.(true); // Sync UI to muted state
                            }
                        }, 500);
                    },
                },
            });
        });

        return () => {
            isMounted = false;
            if (playerRef.current && typeof playerRef.current.destroy === 'function') {
                playerRef.current.destroy();
            }
        };
    }, [videoId]); // Re-init if videoId changes

    // Sync external mute state to player
    useEffect(() => {
        if (isReady && playerRef.current && typeof playerRef.current.mute === 'function') {
            if (isMuted) {
                playerRef.current.mute();
            } else {
                playerRef.current.unMute();
            }
        }
    }, [isMuted, isReady]);

    return (
        <div ref={containerRef} className="hover-preview-video" />
    );
};

export default YouTubePlayer;
