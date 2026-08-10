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

// How often to report playback position. Callers drive UI off this, so it's a
// balance between a smooth readout and needless work; 250ms reads as continuous
// once the consumer eases over the same window.
const PROGRESS_POLL_MS = 250;

// The YT API *replaces* the element it's handed with its own iframe, copying the
// id and class across — so `className` is what ends up styling the player, and
// the element passed in must not be one React owns (see the mount node below).
// Callers that aren't the hover preview must pass their own class.
const YouTubePlayer = ({
    videoId,
    isMuted,
    onMuteChange,
    className = 'hover-preview-video',
    host,
    loop = true,
    onEnded,
    onProgress,
    paused = false,
}) => {
    const hostRef = useRef(null);
    const playerRef = useRef(null);
    const pollRef = useRef(null);
    const [isReady, setIsReady] = useState(false);

    // Read inside onReady, which fires long after mount — by then the prop may
    // already have flipped, and the event handler would otherwise close over
    // whatever `paused` was when the effect ran.
    const pausedRef = useRef(paused);
    pausedRef.current = paused;

    // Callbacks live in refs and are refreshed on every render, so a caller
    // passing an inline function doesn't tear down and re-create the player.
    const onMuteChangeRef = useRef(onMuteChange);
    const onEndedRef = useRef(onEnded);
    const onProgressRef = useRef(onProgress);
    useEffect(() => {
        onMuteChangeRef.current = onMuteChange;
        onEndedRef.current = onEnded;
        onProgressRef.current = onProgress;
    });

    useEffect(() => {
        let isMounted = true;
        if (!hostRef.current) return undefined;

        // A previous run may have left this true. The sync effects below gate on it
        // to decide the player is callable, so it has to fall back to false until
        // the replacement player is actually ready.
        setIsReady(false);

        // Built imperatively rather than rendered, because the API swaps this node
        // out for its iframe. Were it React's, unmounting would have React call
        // removeChild on a node that is no longer in the tree — NotFoundError. The
        // wrapper is the only node React owns here, and nothing replaces it.
        const mount = document.createElement('div');
        mount.className = className;
        hostRef.current.appendChild(mount);

        loadYouTubeAPI().then((YT) => {
            if (!isMounted) return;

            playerRef.current = new YT.Player(mount, {
                videoId,
                ...(host ? { host } : {}),
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    showinfo: 0,
                    modestbranding: 1,
                    rel: 0,
                    iv_load_policy: 3,
                    disablekb: 1,
                    playsinline: 1,
                    // A looping player never reaches ENDED, so onEnded callers
                    // have to opt out of the loop to hear about it.
                    ...(loop ? { loop: 1, playlist: videoId } : { loop: 0 }),
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

                        // The player can become ready after the caller has already
                        // asked for a pause — scrolling away during init. Honour
                        // that instead of autoplaying off-screen; the sync effect
                        // starts playback if it comes back into view.
                        if (pausedRef.current) {
                            player.pauseVideo();
                            return;
                        }

                        player.playVideo();

                        // Fallback: If the browser blocked unmuted autoplay, the video will stay paused or unstarted.
                        // Check after a short delay and fallback to muted if necessary.
                        setTimeout(() => {
                            if (!isMounted || pausedRef.current || !player.getPlayerState) return;
                            const state = player.getPlayerState();
                            // If it's not playing (1) or buffering (3), autoplay was likely blocked.
                            if (state !== 1 && state !== 3) {
                                console.log('Autoplay blocked. Falling back to muted.');
                                player.mute();
                                player.playVideo();
                                onMuteChangeRef.current?.(true); // Sync UI to muted state
                            }
                        }, 500);

                        // Report position so callers can drive their own progress
                        // UI off real playback rather than a guessed duration.
                        if (onProgressRef.current) {
                            pollRef.current = setInterval(() => {
                                if (!isMounted || !player.getDuration) return;
                                const total = player.getDuration();
                                // 0 until metadata lands, and live streams report 0
                                // forever — either way there's no fraction to give.
                                if (!total) return;
                                onProgressRef.current?.(player.getCurrentTime() / total, total);
                            }, PROGRESS_POLL_MS);
                        }
                    },
                    onStateChange: (event) => {
                        if (!isMounted) return;
                        if (event.data === YT.PlayerState.ENDED) {
                            onEndedRef.current?.();
                        }
                    },
                    // A video that's private, removed, or blocked from embedding
                    // will never play or end. Treat it as finished so a caller
                    // waiting on onEnded isn't stranded on a dead player.
                    onError: () => {
                        if (!isMounted) return;
                        onEndedRef.current?.();
                    },
                },
            });
        });

        return () => {
            isMounted = false;
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            if (playerRef.current && typeof playerRef.current.destroy === 'function') {
                playerRef.current.destroy();
                playerRef.current = null;
            }
            // The API replaced mount with its iframe, which destroy() removed, so
            // mount is already gone — no removeChild needed.
        };
    }, [videoId, className, host, loop]); // Rebuild if any constructor input changes

    // Sync external pause state to player
    useEffect(() => {
        if (isReady && playerRef.current) {
            if (paused) {
                playerRef.current.pauseVideo?.();
            } else {
                playerRef.current.playVideo?.();
            }
        }
    }, [paused, isReady]);

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
        // `display: contents` keeps this wrapper out of layout, so the iframe still
        // positions against the caller's container — and resolves its container
        // query units against it — exactly as when the class sat on this node.
        <div ref={hostRef} style={{ display: 'contents' }} />
    );
};

export default YouTubePlayer;
