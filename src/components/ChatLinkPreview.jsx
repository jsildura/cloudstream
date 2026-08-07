import React, { useEffect, useState } from 'react';
import { episodeStill } from '../utils/images';
import './ChatLinkPreview.css';

// ── Shared per-id preview cache ────────────────────────────────────────
// Keyed by `${type}-${id}` so the same /watch link shared by several
// messages triggers exactly ONE /api fetch, and the compose-input preview
// plus all the bubble cards for the same id share that result.
const previewCache = new Map();

// Subscribe to the shared preview entry for one title. Starts the fetch on
// the first subscriber; notifies every listener (with a fresh entry object
// so React re-renders) when the fetch settles.
const subscribePreview = (type, id, listener) => {
    const key = `${type}-${id}`;
    let entry = previewCache.get(key);
    if (!entry) {
        const loading = { status: 'loading', data: null, listeners: new Set() };
        previewCache.set(key, loading);
        // Session cache is bounded: evict the oldest entry beyond 100.
        if (previewCache.size > 100) {
            previewCache.delete(previewCache.keys().next().value);
        }
        (async () => {
            try {
                const res = await fetch(`/api/${type}/${id}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                // The API proxies may return an error body with HTTP 200 —
                // treat payloads without an id as failures too.
                if (!data || typeof data.id === 'undefined') throw new Error('empty payload');
                const done = { status: 'done', data, listeners: loading.listeners };
                previewCache.set(key, done);
                done.listeners.forEach(fn => fn(done));
            } catch {
                const failed = { status: 'error', data: null, listeners: loading.listeners };
                previewCache.set(key, failed);
                failed.listeners.forEach(fn => fn(failed));
            }
        })();
        entry = loading;
    }
    entry.listeners.add(listener);
    listener(entry); // immediate snapshot of the current state
    return () => { entry.listeners.delete(listener); };
};

// Subscribe this component to the shared preview for one title. Seed the
// state from the cache so an already-fetched title renders its card on the
// very first paint instead of flashing the loading pill.
const useWatchPreview = (type, id) => {
    const [entry, setEntry] = useState(() => previewCache.get(`${type}-${id}`) || null);
    useEffect(() => {
        let active = true;
        const unsub = subscribePreview(type, id, (e) => {
            if (active) setEntry(e);
        });
        return () => { active = false; unsub(); };
    }, [type, id]);
    return entry;
};

// Compact title card (or pill fallback) for a /watch chat link.
//
// variant="bubble": used inside message bubbles. When the preview data is
// ready it renders a poster/backdrop card; while loading or on error it
// falls back to a compact "▶ Watch Now" pill that still opens the modal.
//
// variant="compose": the live preview above the input while typing. Shows a
// loading hint, an error hint, or the finished card (never clickable there).
const ChatLinkPreview = ({ watch, url, variant = 'bubble', onOpen, dismissible = false, onDismiss }) => {
    const entry = useWatchPreview(watch.type, watch.id);
    const status = entry?.status || 'loading';
    const data = entry?.data || null;

    if (status === 'done' && data) {
        const title = data.title || data.name || '';
        const year = (data.release_date || data.first_air_date || '').substring(0, 4);
        const overview = (data.overview || '').trim();
        const thumb = episodeStill(data.backdrop_path) || episodeStill(data.poster_path);
        const clickable = !!onOpen;

        return (
            <div
                className={`gc-link-card${variant === 'compose' ? ' compose' : ''}${clickable ? ' clickable' : ''}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                title={url}
                onClick={clickable ? (e) => onOpen(e, watch) : undefined}
                onKeyDown={clickable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(e, watch);
                    }
                } : undefined}
            >
                {thumb && (
                    <img src={thumb} alt="" className="gc-link-card-img" loading="lazy" draggable="false" />
                )}
                <div className="gc-link-card-body">
                    <div className="gc-link-card-title">{title || 'Untitled'}</div>
                    {year && <div className="gc-link-card-meta">{year}</div>}
                    {overview && <div className="gc-link-card-overview">{overview}</div>}
                </div>
                {dismissible && (
                    <button
                        className="gc-link-card-dismiss"
                        onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
                        aria-label="Dismiss link preview"
                    >
                        ✕
                    </button>
                )}
            </div>
        );
    }

    if (variant === 'compose') {
        return (
            <div className={`gc-link-compose-hint${status === 'error' ? ' error' : ''}`}>
                {status === 'error'
                    ? 'Preview unavailable — this title could not be found.'
                    : 'Loading preview…'}
            </div>
        );
    }

    // Bubble loading/error fallback: compact pill, still opens the modal.
    return (
        <a
            className="gc-chat-link gc-chat-link-watch gc-link-pill"
            href={url}
            title={url}
            onClick={onOpen ? (e) => onOpen(e, watch) : undefined}
        >
            <span className="gc-chat-link-play" aria-hidden="true">▶</span>
            Watch Now
        </a>
    );
};

export default ChatLinkPreview;
