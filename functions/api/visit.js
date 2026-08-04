/**
 * /api/visit - Live Viewer Counter Endpoint
 * 
 * Uses a SINGLE Cloudflare KV key to track all active visitors.
 * This minimizes KV writes (1 write per heartbeat instead of 1 write + 1 list).
 * 
 * Free tier KV limits: 1,000 writes/day, 100,000 reads/day.
 * With 60s heartbeat interval, a single user uses ~1,440 reads + ~1,440 writes/day.
 * With this single-key approach + 120s heartbeat, one user uses ~720 writes/day.
 */

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
