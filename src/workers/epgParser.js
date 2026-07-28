/**
 * EPG Parser WebWorker
 * 
 * Fetches, decompresses (.gz), and parses XMLTV EPG data in the background.
 * Supports multiple EPG sources — fetches all in parallel and merges results.
 * Uses DecompressionStream for .gz and Regex for lightweight XML extraction.
 * Posts back currently-airing programmes and a name-to-ID map for flexible matching.
 * 
 * Message protocol:
 *   IN:  { type: 'PARSE_EPG', urls: string[] }          (multi-URL)
 *   IN:  { type: 'PARSE_EPG', url: string }              (legacy single-URL)
 *   OUT: { type: 'EPG_READY', data: { [channelId]: { title, start, stop } }, nameMap: { [normalizedName]: channelId } }
 *   OUT: { type: 'EPG_ERROR', error: string }
 */

/**
 * Parse XMLTV datetime string (e.g., "20260727120000 +0800") to a Date object.
 */
const parseXmltvDate = (str) => {
  if (!str || str.length < 14) return null;
  const year = str.substring(0, 4);
  const month = str.substring(4, 6);
  const day = str.substring(6, 8);
  const hour = str.substring(8, 10);
  const min = str.substring(10, 12);
  const sec = str.substring(12, 14);

  const tzMatch = str.match(/([+-])(\d{2})(\d{2})$/);
  let tzString = 'Z';
  if (tzMatch) {
    tzString = `${tzMatch[1]}${tzMatch[2]}:${tzMatch[3]}`;
  }

  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}${tzString}`);
};

/**
 * Fetch and decompress .gz EPG data using DecompressionStream.
 * Falls back to fetching raw text if the URL is not .gz.
 */
const fetchAndDecompress = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch EPG: HTTP ${response.status}`);
  }

  if (url.endsWith('.gz')) {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = response.body.pipeThrough(ds);
    const reader = decompressedStream.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  }

  return await response.text();
};

/**
 * Normalize a channel name for fuzzy matching.
 * Strips common suffixes like HD, SD, FHD, and normalizes whitespace/case.
 */
const normalizeName = (name) => {
  return name
    .toLowerCase()
    .replace(/\s*(hd|sd|fhd|uhd|\(hd\)|\(sd\))\s*/gi, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Parse XMLTV XML string to extract:
 * 1. Currently-airing programmes keyed by channel ID
 * 2. A name-to-ID map from <channel> elements for name-based matching
 */
const parseEpgXml = (xmlString) => {
  const now = new Date();
  const currentlyAiring = {};
  const nameMap = {};

  // --- Extract <channel> elements to build name map ---
  // Format: <channel id="CinemaOne.ph"><display-name>Cinema One</display-name></channel>
  const channelRegex = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/gi;
  let chMatch;
  while ((chMatch = channelRegex.exec(xmlString)) !== null) {
    const channelId = chMatch[1];
    const innerXml = chMatch[2];

    // Extract all <display-name> variants
    const displayNameRegex = /<display-name[^>]*>([\s\S]*?)<\/display-name>/gi;
    let dnMatch;
    while ((dnMatch = displayNameRegex.exec(innerXml)) !== null) {
      const displayName = dnMatch[1].trim();
      if (displayName) {
        const normalized = normalizeName(displayName);
        if (normalized && !nameMap[normalized]) {
          nameMap[normalized] = channelId;
        }
      }
    }
  }

  // --- Extract currently-airing <programme> elements ---
  const programmeRegex = /<programme\s+[^>]*start="([^"]*)"[^>]*stop="([^"]*)"[^>]*channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/gi;

  let match;
  while ((match = programmeRegex.exec(xmlString)) !== null) {
    const startStr = match[1];
    const stopStr = match[2];
    const channelId = match[3];
    const innerXml = match[4];

    if (currentlyAiring[channelId]) continue;

    const start = parseXmltvDate(startStr);
    const stop = parseXmltvDate(stopStr);

    if (!start || !stop) continue;

    if (now >= start && now < stop) {
      const titleMatch = innerXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : 'Unknown Programme';

      currentlyAiring[channelId] = {
        title,
        start: start.toISOString(),
        stop: stop.toISOString()
      };
    }
  }

  return { currentlyAiring, nameMap };
};

// Handle messages from the main thread
self.onmessage = async (event) => {
  const { type, url, urls } = event.data;

  if (type === 'PARSE_EPG') {
    const epgUrls = urls || (url ? [url] : []);

    if (epgUrls.length === 0) {
      self.postMessage({ type: 'EPG_ERROR', error: 'No EPG URLs provided' });
      return;
    }

    try {
      const results = await Promise.allSettled(
        epgUrls.map(async (epgUrl) => {
          const xmlString = await fetchAndDecompress(epgUrl);
          return parseEpgXml(xmlString);
        })
      );

      const mergedData = {};
      const mergedNameMap = {};
      const errors = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { currentlyAiring, nameMap } = result.value;
          // Merge programmes — first source wins per channel ID
          for (const [channelId, programme] of Object.entries(currentlyAiring)) {
            if (!mergedData[channelId]) {
              mergedData[channelId] = programme;
            }
          }
          // Merge name maps — first source wins per normalized name
          for (const [name, channelId] of Object.entries(nameMap)) {
            if (!mergedNameMap[name]) {
              mergedNameMap[name] = channelId;
            }
          }
          console.log(`[EPG Worker] Source ${index + 1}/${epgUrls.length} loaded: ${Object.keys(currentlyAiring).length} programmes, ${Object.keys(nameMap).length} channel names`);
        } else {
          errors.push(`Source ${index + 1}: ${result.reason?.message || result.reason}`);
          console.warn(`[EPG Worker] Source ${index + 1}/${epgUrls.length} failed:`, result.reason?.message);
        }
      });

      if (Object.keys(mergedData).length > 0) {
        self.postMessage({ type: 'EPG_READY', data: mergedData, nameMap: mergedNameMap });
      } else {
        self.postMessage({ type: 'EPG_ERROR', error: `All EPG sources failed: ${errors.join('; ')}` });
      }
    } catch (err) {
      console.error('[EPG Worker] Error:', err);
      self.postMessage({ type: 'EPG_ERROR', error: err.message });
    }
  }
};
