/**
 * Channel Scanner WebWorker
 * 
 * Tests channel stream URLs for availability using fetch with a 10s timeout.
 * Processes channels in batches of 5 to avoid overwhelming the network.
 * 
 * Messages IN:
 *   { type: 'SCAN', channels: [...], scanType: 'offline'|'online'|'all' }
 * 
 * Messages OUT:
 *   { type: 'SCAN_PROGRESS', scanned: number, total: number }
 *   { type: 'SCAN_COMPLETE', online: [id, ...], offline: [id, ...], scanType: string }
 */

const BATCH_SIZE = 5;
const TIMEOUT_MS = 10000; // 10 seconds

/**
 * Check if a single channel's stream URL is reachable.
 * Returns { id, status: 'online'|'offline' }
 */
async function checkChannel(channel) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(channel.url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // In no-cors mode, response.type is 'opaque' and status is 0,
    // but a successful fetch (no throw) means the server responded.
    return { id: channel.id, status: 'online' };
  } catch (err) {
    clearTimeout(timeoutId);
    return { id: channel.id, status: 'offline' };
  }
}

/**
 * Process all channels in batches, posting progress updates.
 */
async function scanChannels(channels, scanType) {
  const online = [];
  const offline = [];
  let scanned = 0;
  const total = channels.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(checkChannel));

    results.forEach((result) => {
      if (result.status === 'online') {
        online.push(result.id);
      } else {
        offline.push(result.id);
      }
    });

    scanned += batch.length;
    self.postMessage({ type: 'SCAN_PROGRESS', scanned, total });
  }

  self.postMessage({ type: 'SCAN_COMPLETE', online, offline, scanType });
}

self.onmessage = (event) => {
  const { type, channels, scanType } = event.data;
  if (type === 'SCAN') {
    scanChannels(channels, scanType);
  }
};
