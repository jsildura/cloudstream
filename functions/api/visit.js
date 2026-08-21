/**
 * /api/visit - Live Viewer Counter Endpoint (DISABLED)
 *
 * Disabled to stop spending the Cloudflare KV free tier (1,000 writes/day),
 * which the counter burned faster as daily traffic grew: every heartbeat cost
 * one read plus one write, so the cost scaled with users while the feature was
 * only decorative.
 *
 * The endpoint is kept and still answers 200 {count: 0} rather than being
 * deleted, because it stays publicly reachable and PWA clients running a
 * previously cached bundle keep calling it until their service worker updates.
 * Returning early here is what guarantees those clients — and any bot hitting
 * the URL directly — cannot touch KV.
 *
 * To re-enable: set VIEWER_COUNT_DISABLED to false here AND flip
 * VIEWER_COUNT_ENABLED to true in src/contexts/ViewerCountContext.jsx.
 *
 * Original design (still below): a SINGLE Cloudflare KV key tracks all active
 * visitors, so a heartbeat costs 1 write instead of 1 write + 1 list.
 */

const VIEWER_COUNT_DISABLED = true;

const VISITORS_KEY = 'active_visitors';
const VISITOR_TTL_MS = 300000; // 5 minutes — must exceed HEARTBEAT_INTERVAL (180s)

function getCorsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

export async function onRequest(context) {
    const { request, env } = context;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: getCorsHeaders() });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: getCorsHeaders()
        });
    }

    // Disabled: answer with a constant count and never touch KV. Placed before
    // the uid validation so old cached clients get a clean 200 instead of a 400.
    // The response is constant, so it is cacheable — that keeps repeat hits from
    // stale PWA clients off the Functions invocation count too. The 5-minute
    // max-age bounds how long a client could still see 0 after a re-enable.
    if (VIEWER_COUNT_DISABLED) {
        return new Response(JSON.stringify({ count: 0, disabled: true }), {
            status: 200,
            headers: {
                ...getCorsHeaders(),
                'Cache-Control': 'public, max-age=300'
            }
        });
    }

    try {
        const url = new URL(request.url);
        const uid = url.searchParams.get('uid');

        // Validate UID
        if (!uid || uid.length < 4 || uid.length > 50) {
            return new Response(JSON.stringify({ error: 'Invalid uid parameter' }), {
                status: 400,
                headers: getCorsHeaders()
            });
        }

        const KV = env.VISITOR_STATS;

        // Check if KV binding exists
        if (!KV) {
            console.error('VISITOR_STATS KV namespace not bound');
            return new Response(JSON.stringify({ count: 0 }), {
                status: 200,
                headers: getCorsHeaders()
            });
        }

        const now = Date.now();

        // Read the single visitors blob (1 KV read)
        const rawData = await KV.get(VISITORS_KEY);
        let visitors = {};
        try {
            visitors = rawData ? JSON.parse(rawData) : {};
        } catch {
            visitors = {};
        }

        // Update this visitor's last-seen timestamp
        visitors[uid] = now;

        // Prune expired visitors (older than VISITOR_TTL_MS)
        const activeVisitors = {};
        for (const [id, lastSeen] of Object.entries(visitors)) {
            if (now - lastSeen < VISITOR_TTL_MS) {
                activeVisitors[id] = lastSeen;
            }
        }

        // Write back the pruned blob (1 KV write)
        await KV.put(VISITORS_KEY, JSON.stringify(activeVisitors));

        const count = Object.keys(activeVisitors).length;

        return new Response(JSON.stringify({ count }), {
            status: 200,
            headers: {
                ...getCorsHeaders(),
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        });

    } catch (error) {
        console.error('Visitor count error:', error);
        return new Response(JSON.stringify({ count: 0, error: error.message }), {
            status: 200,
            headers: getCorsHeaders()
        });
    }
}
