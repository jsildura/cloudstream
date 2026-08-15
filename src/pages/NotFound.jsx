import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * 404 page for unknown SPA paths (catch-all route).
 *
 * The SPA can't set a real HTTP status, so it marks the page noindex — that
 * way crawlers that render JavaScript see a soft-404 instead of a page that
 * could be mistaken for real content.
 */
const NotFound = () => {
    useEffect(() => {
        const existing = document.querySelector('meta[name="robots"]');
        const prevContent = existing?.getAttribute('content');
        const meta = existing || document.createElement('meta');
        if (!existing) meta.setAttribute('name', 'robots');
        meta.setAttribute('content', 'noindex');
        if (!existing) document.head.appendChild(meta);
        return () => {
            if (!existing) {
                meta.remove();
            } else if (prevContent) {
                meta.setAttribute('content', prevContent);
            }
        };
    }, []);

    return (
        <div
            style={{
                minHeight: '70vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '48px 24px',
                gap: '16px',
            }}
        >
            <p style={{ fontSize: '6rem', fontWeight: 700, color: '#e50914', margin: 0, lineHeight: 1 }}>
                404
            </p>
            <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Page Not Found</h1>
            <p style={{ color: '#aaa', margin: 0, maxWidth: 420 }}>
                The page you're looking for doesn't exist or has been moved.
            </p>
            <Link
                to="/"
                style={{
                    display: 'inline-block',
                    background: '#e50914',
                    color: '#fff',
                    textDecoration: 'none',
                    padding: '10px 24px',
                    borderRadius: '6px',
                    fontWeight: 600,
                }}
            >
                ← Back to Home
            </Link>
        </div>
    );
};

export default NotFound;
