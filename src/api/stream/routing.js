import { DIRECT_PLAYABLE_HOSTS } from './hosts.js';

export function routeSources(result) {
  if (!result.success) return { success: false, reason: result.reason };
  return {
    success: true,
    sources: result.sources.map((s) => {
      // mp4 needs no CORS. DIRECT_PLAYABLE_HOSTS is ground truth from the trial.
      // corsOk (now only true for a wildcard ACAO) is an additional, measured
      // direct signal. Everything else is proxied.
      const direct = s.kind === 'mp4' || DIRECT_PLAYABLE_HOSTS.has(s.host) || s.corsOk === true;
      return {
        server: s.server, kind: s.kind, resolution: s.resolution,
        url: direct ? s.url : `/api/stream/media?u=${encodeURIComponent(s.url)}`,
        host: s.host, direct
      };
    }),
  };
}
