/**
 * POST /api/admin-login — Server-side admin verification.
 *
 * Closes the isAdmin spoofing hole: previously the client read the admin key
 * hash from the RTDB `secrets/admin_key` node and compared the password
 * client-side, then wrote `isAdmin: true` to its own `users/{uid}` record.
 * Because the `users` write rule allowed a user to write their own node,
 * anyone could self-elevate by writing `isAdmin: true` directly.
 *
 * Now the password is verified HERE (hash lives in an env var, never shipped
 * to the browser), and the elevation write goes through the RTDB REST API
 * authenticated with the database secret — a write that bypasses security
 * rules, so the client's own write attempt (which the rules now deny) is no
 * longer the mechanism.
 *
 * Env vars (set in Cloudflare Pages dashboard or wrangler.jsonc `vars`):
 *   ADMIN_KEY_HASH          — hex SHA-256 of the admin password
 *   FIREBASE_DATABASE_URL   — e.g. https://streamflix-chat-default-rtdb.firebaseio.com
 *   FIREBASE_DATABASE_SECRET— RTDB database secret (Project Settings → Service accounts)
 *
 * Body: { "password": "...", "uid": "<anonymous auth uid>" }
 * Response: { ok: true } | { ok: false, error: "..." }
 */

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

// hex SHA-256 of a string (Web Crypto — available in Workers)
async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: getCorsHeaders() });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
            status: 405,
            headers: getCorsHeaders()
        });
    }

    // Guard against misconfiguration — fail loudly instead of silently
    // accepting every password when the hash env var is missing.
    if (!env.ADMIN_KEY_HASH) {
        console.error('admin-login: ADMIN_KEY_HASH not configured');
        return new Response(JSON.stringify({ ok: false, error: 'Admin verification not configured' }), {
            status: 500,
            headers: getCorsHeaders()
        });
    }

    try {
        const body = await request.json();
        const password = typeof body.password === 'string' ? body.password : '';
        const uid = typeof body.uid === 'string' ? body.uid : '';
        // Optional admin profile fields — when provided the proxy writes
        // the full user node in a single PATCH so the client never needs a
        // follow-up .update() (which can race and be rejected by the
        // self-elevation rule).
        const profile = typeof body.profile === 'object' && body.profile ? body.profile : {};

        if (!password || !uid) {
            return new Response(JSON.stringify({ ok: false, error: 'Missing password or uid' }), {
                status: 400,
                headers: getCorsHeaders()
            });
        }

        // Constant-time-ish compare (crypto.subtle.timingSafeEqual needs equal
        // length buffers — both are hex SHA-256 so they always are).
        const inputHash = await sha256Hex(password);
        const storedHash = env.ADMIN_KEY_HASH.toLowerCase();
        const a = new TextEncoder().encode(inputHash);
        const b = new TextEncoder().encode(storedHash);
        let diff = a.length ^ b.length;
        // Walk the LONGER buffer so a length mismatch can't short-circuit the
        // loop — hex SHA-256 inputs are equal-length, but stay constant-time.
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            diff |= (a[i] || 0) ^ (b[i] || 0);
        }

        if (diff !== 0) {
            return new Response(JSON.stringify({ ok: false, error: 'Incorrect password' }), {
                status: 401,
                headers: getCorsHeaders()
            });
        }

        // Elevate via the database secret — this write bypasses security rules
        // (the client's own attempt is denied by rules, see database.rules).
        // Merge profile fields so the node is complete in one atomic write.
        if (env.FIREBASE_DATABASE_URL && env.FIREBASE_DATABASE_SECRET) {
            const writeData = { isAdmin: true };
            if (uid) writeData.uid = uid;
            if (profile.nickname)   writeData.nickname   = String(profile.nickname);
            if (profile.avatarUrl)  writeData.avatarUrl  = String(profile.avatarUrl);
            if (profile.adminBadge) writeData.adminBadge = String(profile.adminBadge);

            const url = `${env.FIREBASE_DATABASE_URL.replace(/\/+$/, '')}/users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(env.FIREBASE_DATABASE_SECRET)}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(writeData)
            });

            if (!res.ok) {
                const text = await res.text();
                console.error('admin-login: elevation write failed:', res.status, text.slice(0, 200));
                return new Response(JSON.stringify({ ok: false, error: 'Failed to elevate admin status' }), {
                    status: 502,
                    headers: getCorsHeaders()
                });
            }
        } else {
            // Env vars missing — the client's own write is denied by the rules,
            // so without the secret the admin session cannot be persisted.
            console.error('admin-login: FIREBASE_DATABASE_URL / FIREBASE_DATABASE_SECRET not configured');
            return new Response(JSON.stringify({ ok: false, error: 'Database elevation not configured' }), {
                status: 500,
                headers: getCorsHeaders()
            });
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: getCorsHeaders()
        });
    } catch (err) {
        console.error('admin-login error:', err);
        return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
            status: 500,
            headers: getCorsHeaders()
        });
    }
}
