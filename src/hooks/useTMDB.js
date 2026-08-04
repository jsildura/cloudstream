import { useState, useEffect, useCallback, useMemo } from 'react';

const POSTER_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/w1280';
const LOGO_URL = 'https://image.tmdb.org/t/p/w500';

// ===== API CACHING =====
// In-memory cache with TTL to reduce redundant API calls
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Requests that have been sent but not yet resolved, keyed the same way as
// apiCache. Every /api/ call is a billable Cloudflare Pages Function request,
// and the content rows all enrich inside concurrent Promise.all bursts — so
// without this, three rows containing the same movie each miss the (still
// empty) cache and fire three identical requests. Sharing the in-flight
// promise collapses them into one.
const inFlight = new Map();

/**
 * Fetch data with caching support
 * @param {string} cacheKey - Unique key for this request
 * @param {Function} fetcher - Async function that returns the data
 * @returns {Promise<any>} - Cached, in-flight, or fresh data
 */
const fetchWithCache = async (cacheKey, fetcher) => {
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  // Store the promise before awaiting so concurrent callers find it. Failures
  // are removed rather than cached, so a transient error doesn't stick.
  const request = (async () => {
    try {
      const data = await fetcher();
      apiCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
};

// Clear stale cache entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of apiCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      apiCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ===== SHARED GENRE MAPS =====
// Module-level so ALL useTMDB instances share the same Maps.
// Once any component fetches genres (e.g. Home on mount), every
// subsequent caller — including HoverPreviewCard — gets them instantly.
const sharedMovieGenres = new Map();
const sharedTvGenres = new Map();
let genresFetchPromise = null; // de-duplicates concurrent fetches

export const useTMDB = () => {
  // Local state is seeded from the shared maps; we only trigger a re-render
  // when the shared maps are populated for the first time.
  const [movieGenres, setMovieGenres] = useState(sharedMovieGenres);
  const [tvGenres, setTvGenres] = useState(sharedTvGenres);

  const getApiBaseUrl = useCallback(() => {
    return '/api';
  }, []);

  const buildUrl = useCallback((endpoint, params = {}) => {
    const baseUrl = getApiBaseUrl();
    const url = new URL(`${baseUrl}${endpoint}`, window.location.origin);

    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    return url.toString();
  }, [getApiBaseUrl]);

  const fetchGenres = useCallback(async () => {
    // Already populated — nothing to do; components will read sharedMovieGenres directly.
    if (sharedMovieGenres.size > 0) return;

    // If another component is already fetching, piggyback on that promise.
    if (!genresFetchPromise) {
      genresFetchPromise = (async () => {
        try {
          const [movieRes, tvRes] = await Promise.all([
            fetch(buildUrl('/genre/movie/list')),
            fetch(buildUrl('/genre/tv/list'))
          ]);

          if (!movieRes.ok) throw new Error(`Movie genres failed: ${movieRes.status}`);
          if (!tvRes.ok) throw new Error(`TV genres failed: ${tvRes.status}`);

          const movieData = await movieRes.json();
          const tvData = await tvRes.json();

          // Populate shared Maps in-place so all existing references update.
          movieData.genres?.forEach(g => sharedMovieGenres.set(g.id, g.name));
          tvData.genres?.forEach(g => sharedTvGenres.set(g.id, g.name));
        } catch (error) {
          console.error('Failed to fetch genres:', error);
        } finally {
          genresFetchPromise = null;
        }
      })();
    }

    await genresFetchPromise;

    // Trigger a re-render in this component instance so it picks up the maps.
    setMovieGenres(new Map(sharedMovieGenres));
    setTvGenres(new Map(sharedTvGenres));
  }, [buildUrl]);

  // Memoize all fetch functions
  const fetchNowPlaying = useCallback(async () => {
    const cacheKey = 'nowPlaying';
    return fetchWithCache(cacheKey, async () => {
      const url = buildUrl('/movie/now_playing', {
        language: 'en-US',
        page: 1
      });

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();
      return data.results || [];
    });
  }, [buildUrl]);

  const fetchTrending = useCallback(async (type, timeWindow = 'week') => {
    const cacheKey = `trending_${type}_${timeWindow}`;
    return fetchWithCache(cacheKey, async () => {
      const url = buildUrl(`/trending/${type}/${timeWindow}`);

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();
      return data.results || [];
    });
  }, [buildUrl]);

  const fetchTrendingAnime = useCallback(async () => {
    const cacheKey = 'trendingAnime';
    return fetchWithCache(cacheKey, async () => {
      const url = buildUrl('/discover/tv', {
        with_genres: 16,
        with_keywords: 210024,
        sort_by: 'popularity.desc'
      });

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();
      return data.results || [];
    });
  }, [buildUrl]);

  // Add useCallback to all other fetch functions similarly
  const searchTMDB = useCallback(async (query) => {
    if (!query.trim()) return [];

    try {
      const url = buildUrl('/search/multi', {
        query: query.trim(),
        include_adult: false,
        language: 'en-US'
      });

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();

      return data.results?.filter(item => {
        if (item.media_type === 'person') return false;
        return (item.media_type === 'movie' || item.media_type === 'tv');
      }) || [];
    } catch (error) {
      console.error("Search failed:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchCredits = useCallback(async (type, id) => {
    try {
      const url = buildUrl(`/${type}/${id}/credits`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      return data.cast?.slice(0, 4).map(actor => actor.name) || [];
    } catch (error) {
      console.error("Failed to fetch credits:", error);
      return [];
    }
  }, [buildUrl]);

  const fetchSeasonEpisodes = useCallback(async (tvId, seasonNumber) => {
    try {
      const url = buildUrl(`/tv/${tvId}/season/${seasonNumber}`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      return data.episodes || [];
    } catch (error) {
      console.error("Failed to fetch episodes:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchTVDetails = useCallback(async (tvId) => {
    try {
      const url = buildUrl(`/tv/${tvId}`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      console.error("Failed to fetch TV details:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchMovieDetails = useCallback(async (movieId) => {
    try {
      const url = buildUrl(`/movie/${movieId}`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      console.error("Failed to fetch movie details:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchDiscoverMovies = useCallback(async (params = {}) => {
    try {
      const url = buildUrl('/discover/movie', {
        sort_by: 'popularity.desc',
        include_adult: false,
        include_video: false,
        language: 'en-US',
        page: 1,
        ...params
      });

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();
      return data.results || [];
    } catch (error) {
      console.error("Failed to fetch discover movies:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchDiscoverTV = useCallback(async (params = {}) => {
    try {
      const url = buildUrl('/discover/tv', {
        sort_by: 'popularity.desc',
        include_adult: false,
        include_null_first_air_dates: false,
        language: 'en-US',
        page: 1,
        ...params
      });

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();
      return data.results || [];
    } catch (error) {
      console.error("Failed to fetch discover TV:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchMovieRecommendations = useCallback(async (movieId) => {
    try {
      const url = buildUrl(`/movie/${movieId}/recommendations`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      return data.results || [];
    } catch (error) {
      console.error("Failed to fetch movie recommendations:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchTVRecommendations = useCallback(async (tvId) => {
    try {
      const url = buildUrl(`/tv/${tvId}/recommendations`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      return data.results || [];
    } catch (error) {
      console.error("Failed to fetch TV recommendations:", error);
      throw error;
    }
  }, [buildUrl]);

  const fetchVideos = useCallback(async (type, id) => {
    try {
      const url = buildUrl(`/${type}/${id}/videos`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      // Find YouTube trailer, preferring official trailers
      const videos = data.results || [];
      const trailer = videos.find(v =>
        v.site === 'YouTube' && v.type === 'Trailer' && v.official
      ) || videos.find(v =>
        v.site === 'YouTube' && v.type === 'Trailer'
      ) || videos.find(v =>
        v.site === 'YouTube'
      );
      return trailer?.key || null;
    } catch (error) {
      console.error("Failed to fetch videos:", error);
      return null;
    }
  }, [buildUrl]);

  const fetchLogo = useCallback(async (type, id) => {
    try {
      const url = buildUrl(`/${type}/${id}/images`);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      // Find English logo first, then any logo
      const logos = data.logos || [];
      const englishLogo = logos.find(l => l.iso_639_1 === 'en');
      const anyLogo = logos[0];
      return (englishLogo || anyLogo)?.file_path || null;
    } catch (error) {
      console.error("Failed to fetch logo:", error);
      return null;
    }
  }, [buildUrl]);

  const fetchContentRating = useCallback(async (type, id) => {
    try {
      const endpoint = type === 'tv'
        ? `/${type}/${id}/content_ratings`
        : `/movie/${id}/release_dates`;
      const url = buildUrl(endpoint);
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      if (type === 'tv') {
        // For TV shows, look for US rating first, then any available
        const usRating = data.results?.find(r => r.iso_3166_1 === 'US');
        const anyRating = data.results?.[0];
        return usRating?.rating || anyRating?.rating || null;
      } else {
        // For movies, look for US certification first
        const usRelease = data.results?.find(r => r.iso_3166_1 === 'US');
        const usCert = usRelease?.release_dates?.find(rd => rd.certification)?.certification;
        // Fallback to any certification
        const anyRelease = data.results?.find(r => r.release_dates?.some(rd => rd.certification));
        const anyCert = anyRelease?.release_dates?.find(rd => rd.certification)?.certification;
        return usCert || anyCert || null;
      }
    } catch (error) {
      console.error("Failed to fetch content rating:", error);
      return null;
    }
  }, [buildUrl]);

  /**
   * Fetch a movie/TV record with its sub-resources folded into ONE request.
   *
   * Every /api/ call is a billable Cloudflare Pages Function request, so
   * `append_to_response` replaces the old pattern of hitting /images, /videos
   * and the detail endpoint separately for the same item.
   *
   * Two things to know when reading the result:
   *  - Appended data is NESTED under its own key (`data.images.logos`,
   *    `data.videos.results`), never merged into the top level.
   *  - Appended sub-requests inherit the parent's `language`, which filters the
   *    image arrays down to nothing. `include_image_language=en,null` restores
   *    English plus textless logos, so the English-first lookup still works.
   */
  const fetchItemBundle = useCallback(async (type, id, appends = []) => {
    // Sorted so ['images','videos'] and ['videos','images'] share a cache entry.
    const list = [...appends].sort();
    const cacheKey = `bundle_${type}_${id}_${list.join(',')}`;

    return fetchWithCache(cacheKey, async () => {
      const params = { language: 'en-US' };
      if (list.length) {
        params.append_to_response = list.join(',');
        if (list.includes('images')) params.include_image_language = 'en,null';
      }

      const res = await fetch(buildUrl(`/${type}/${id}`, params));

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      return await res.json();
    });
  }, [buildUrl]);

  const fetchPopularByRegion = useCallback(async (type = 'movie', region = 'US') => {
    const cacheKey = `popular_${type}_${region}`;
    return fetchWithCache(cacheKey, async () => {
      const url = buildUrl(`/${type}/popular`, {
        language: 'en-US',
        page: 1,
        region: region
      });

      const res = await fetch(url);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, response: ${errorText}`);
      }

      const data = await res.json();
      return data.results?.slice(0, 10) || [];
    });
  }, [buildUrl]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (isMounted) {
        await fetchGenres();
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [fetchGenres]);

  // Memoize constants to prevent recreation
  const constants = useMemo(() => ({
    POSTER_URL,
    BACKDROP_URL,
    LOGO_URL
  }), []);

  return {
    movieGenres,
    tvGenres,
    fetchNowPlaying,
    fetchTrending,
    fetchTrendingAnime,
    searchTMDB,
    fetchCredits,
    fetchContentRating,
    fetchSeasonEpisodes,
    fetchTVDetails,
    fetchMovieDetails,
    fetchDiscoverMovies,
    fetchDiscoverTV,
    fetchMovieRecommendations,
    fetchTVRecommendations,
    fetchVideos,
    fetchLogo,
    fetchItemBundle,
    fetchPopularByRegion,
    ...constants
  };
};