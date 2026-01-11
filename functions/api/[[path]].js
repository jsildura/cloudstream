function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: getCorsHeaders()
  });
}

function getCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const method = context.request.method;
  const path = url.pathname.replace('/api/', '');

  if (method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders() });
  }

  // Skip routes that have their own dedicated handlers
  // visit.js handles /api/visit for viewer counting
  if (path === 'visit' || path.startsWith('visit/')) {
    return context.next();
  }

  try {
    const queryString = url.search;
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const TMDB_ACCESS_TOKEN = context.env.VITE_TMDB_READ_ACCESS_TOKEN;

    if (!TMDB_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({
          success: false,
          status_code: 401,
          status_message: "TMDB Access Token not configured in environment variables"
        }),
        {
          status: 401,
          headers: getCorsHeaders()
        }
      );
    }

    const fullURL = `${TMDB_BASE_URL}/${path}${queryString}`;

    console.log('Proxying request to TMDB:', fullURL);

    const response = await fetch(fullURL, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(
        JSON.stringify(errorData),
        {
          status: response.status,
          headers: getCorsHeaders()
        }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        ...getCorsHeaders(),
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('API Proxy Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        status_code: 500,
        status_message: "Internal server error: " + error.message
      }),
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}