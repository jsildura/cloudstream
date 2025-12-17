const VISITOR_TIMEOUT_MS = 60000; // 60 seconds - consider visitor offline after this

async function handleVisitorHeartbeat(context) {
  const KV = context.env.VISITOR_STATS;
  if (!KV) {
    return jsonResponse({ error: 'KV namespace not configured', online: 1 }, 200);
  }

  try {
    const body = await context.request.json().catch(() => ({}));
    const visitorId = body.visitorId;

    const cf = context.request.cf || {};
    const country = cf.country || 'Unknown';
    const region = cf.region || cf.city || 'Unknown';

    if (!visitorId) {
      return jsonResponse({ error: 'visitorId required', online: 1 }, 200);
    }

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    let stats = await KV.get('stats', { type: 'json' }) || {
      totalVisits: 0,
      uniqueVisitors: 0,
      peak: 0,
      visitors: {},
      dailyVisitors: {},
      knownVisitorIds: []
    };

    const isNewVisitor = !stats.knownVisitorIds.includes(visitorId);
    if (isNewVisitor) {
      stats.knownVisitorIds.push(visitorId);
      stats.uniqueVisitors++;
      stats.totalVisits++;
    }

    stats.visitors[visitorId] = {
      lastSeen: now,
      region: region,
      country: country
    };

    if (!stats.dailyVisitors[today]) {
      stats.dailyVisitors[today] = [];
    }
    if (!stats.dailyVisitors[today].includes(visitorId)) {
      stats.dailyVisitors[today].push(visitorId);
    }

    const activeVisitors = {};
    for (const [id, data] of Object.entries(stats.visitors)) {
      if (now - data.lastSeen < VISITOR_TIMEOUT_MS) {
        activeVisitors[id] = data;
      }
    }
    stats.visitors = activeVisitors;

    const onlineCount = Object.keys(stats.visitors).length;
    if (onlineCount > stats.peak) {
      stats.peak = onlineCount;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];
    for (const date of Object.keys(stats.dailyVisitors)) {
      if (date < cutoffDate) {
        delete stats.dailyVisitors[date];
      }
    }

    await KV.put('stats', JSON.stringify(stats));

    return jsonResponse({
      success: true,
      online: onlineCount,
      isNewVisitor
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return jsonResponse({ error: error.message, online: 1 }, 200);
  }
}

async function handleVisitorStats(context) {
  const KV = context.env.VISITOR_STATS;
  if (!KV) {
    return jsonResponse({
      online: 1,
      totalVisits: 0,
      uniqueVisitors: 0,
      todayVisitors: 0,
      peak: 0,
      regions: []
    });
  }

  try {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    let stats = await KV.get('stats', { type: 'json' }) || {
      totalVisits: 0,
      uniqueVisitors: 0,
      peak: 0,
      visitors: {},
      dailyVisitors: {},
      knownVisitorIds: []
    };

    const activeVisitors = {};
    for (const [id, data] of Object.entries(stats.visitors)) {
      if (now - data.lastSeen < VISITOR_TIMEOUT_MS) {
        activeVisitors[id] = data;
      }
    }

    const regionCounts = {};
    for (const data of Object.values(activeVisitors)) {
      const key = `${data.region}, ${data.country}`;
      regionCounts[key] = (regionCounts[key] || 0) + 1;
    }

    const regions = Object.entries(regionCounts)
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count);

    return jsonResponse({
      online: Object.keys(activeVisitors).length || 1,
      totalVisits: stats.totalVisits,
      uniqueVisitors: stats.uniqueVisitors,
      todayVisitors: stats.dailyVisitors[today]?.length || 0,
      peak: stats.peak,
      regions: regions
    });
  } catch (error) {
    console.error('Stats error:', error);
    return jsonResponse({
      online: 1,
      totalVisits: 0,
      uniqueVisitors: 0,
      todayVisitors: 0,
      peak: 0,
      regions: []
    });
  }
}

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
  if (path === 'visitors') {
    if (method === 'POST') {
      return await handleVisitorHeartbeat(context);
    } else if (method === 'GET') {
      return await handleVisitorStats(context);
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
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