import { DIRECT_PLAYABLE_HOSTS, signMediaToken } from './hosts.js';

export async function routeSources(result, secret = '') {
  if (!result || !result.success) return { success: false, reason: result?.reason || 'no_sources' };

  const sources = await Promise.all(
    (result.sources || []).map(async (s) => {
      // mp4 needs no CORS. DIRECT_PLAYABLE_HOSTS is ground truth from the trial.
      // corsOk (now only true for a wildcard ACAO) is an additional, measured
      // direct signal. Everything else is proxied.
      const direct = s.kind === 'mp4' || DIRECT_PLAYABLE_HOSTS.has(s.host) || s.corsOk === true;
      let url = s.url;
      if (!direct) {
        let proxyUrl = `/api/stream/media?u=${encodeURIComponent(s.url)}`;
        if (secret) {
          try {
            const { exp, sig } = await signMediaToken(s.url, secret);
            proxyUrl += `&exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`;
          } catch {
            // best-effort token signing fallback
          }
        }
        url = proxyUrl;
      }
      return {
        server: s.server,
        kind: s.kind,
        resolution: s.resolution,
        url,
        host: s.host,
        direct,
      };
    })
  );

  return {
    success: true,
    sources,
  };
}

