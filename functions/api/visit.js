/**
 * /api/visit - Live Viewer Counter Endpoint
 * 
 * Uses Cloudflare KV to track active visitors with a heartbeat pattern.
 * Each visitor sends a periodic ping (every 20s from client).
 * Keys expire after 60 seconds, so only active users are counted.
 */

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
            // Return 0 count when KV is not configured (dev mode fallback)
            return new Response(JSON.stringify({ count: 0 }), {
                status: 200,
                headers: getCorsHeaders()
            });
        }

        const visitorKey = `visitor:${uid}`;
        const now = Date.now().toString();

        // Write/update this visitor's key with 60-second TTL
        await KV.put(visitorKey, now, { expirationTtl: 60 });

        // Count all active visitors by listing keys with the prefix
        const listResult = await KV.list({ prefix: 'visitor:' });
        const count = listResult.keys.length;

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
