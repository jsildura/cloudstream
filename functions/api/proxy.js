/**
 * General CORS Proxy for Cloudflare Functions
 * 
 * Fetches a remote URL and returns it with CORS headers.
 * Usage: /api/proxy?url=<encoded_url>
 */

function getCorsHeaders(contentType = 'application/octet-stream') {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=86400' // Cache images for 24 hours
  };
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const method = request.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders() });
  }

  // Only allow GET requests
  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: getCorsHeaders('application/json')
    });
  }

  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: getCorsHeaders('application/json')
    });
  }

  try {
    // Validate URL format
    const parsedUrl = new URL(targetUrl);
    
    // Optional: Restrict to specific domains for security
    // const allowedDomains = ['resources.tidal.com', 'i.scdn.co'];
    // if (!allowedDomains.includes(parsedUrl.hostname)) {
    //   return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
    //     status: 403,
    //     headers: getCorsHeaders('application/json')
    //   });
    // }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
        status: response.status,
        headers: getCorsHeaders('application/json')
      });
    }

    // Get content type from response
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: getCorsHeaders(contentType)
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed: ' + error.message }), {
      status: 500,
      headers: getCorsHeaders('application/json')
    });
  }
}
