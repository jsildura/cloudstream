// TMDB genre lists, kept out of FilterPanel.jsx so both the panel and the
// TV discover filter bar can import them. The two share the `with_genres`
// param, so a mismatch would let the bar show a genre the panel can't deselect.
//
// Order is popularity-first, not TMDB's alphabetical order: the discover filter
// bar truncates to whatever fits the viewport, so position decides what a user
// sees without opening "More". Ranking was measured off the top 200
// popularity.desc titles per media type (see TV_BAR_CATEGORIES below).

export const MOVIE_GENRES = [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 18, name: 'Drama' },
    { id: 878, name: 'Sci-Fi' },
    { id: 53, name: 'Thriller' },
    { id: 35, name: 'Comedy' },
    { id: 14, name: 'Fantasy' },
    { id: 27, name: 'Horror' },
    { id: 16, name: 'Animation' },
    { id: 10751, name: 'Family' },
    { id: 80, name: 'Crime' },
    { id: 10749, name: 'Romance' },
    { id: 9648, name: 'Mystery' },
    { id: 99, name: 'Documentary' },
    { id: 36, name: 'History' },
    { id: 10402, name: 'Music' },
    { id: 10752, name: 'War' },
    { id: 37, name: 'Western' },
    { id: 10770, name: 'TV Movie' }
];

// These 16 are the whole of TMDB's /genre/tv/list. Movie-only IDs are not
// included: /discover/tv accepts them but returns 0 results for almost all
// (878, 27, 53, 14, 28, 12 and 10402 were each verified empty), so they would
// render as chips that always produce "no results".
export const TV_GENRES = [
    { id: 18, name: 'Drama' },
    { id: 35, name: 'Comedy' },
    { id: 10759, name: 'Action & Adventure' },
    { id: 80, name: 'Crime' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 16, name: 'Animation' },
    { id: 9648, name: 'Mystery' },
    { id: 10751, name: 'Family' },
    { id: 10764, name: 'Reality' },
    { id: 99, name: 'Documentary' },
    { id: 10762, name: 'Kids' },
    { id: 10766, name: 'Soap' },
    { id: 10767, name: 'Talk' },
    { id: 10768, name: 'War & Politics' },
    { id: 10763, name: 'News' },
    { id: 37, name: 'Western' }
];

// TMDB has no more TV genres to give, so the extra browse categories are
// keyword-backed (`with_keywords`). Counts below are total_results on
// /discover/tv at the time of writing — each one is a populated catalogue,
// not a dead chip.
export const TV_KEYWORD_CATEGORIES = [
    { id: 210024, name: 'Anime' },        // 4381
    { id: 193171, name: 'Sitcom' },       // 1964
    { id: 6270, name: 'High School' },    // 1013
    { id: 6152, name: 'Supernatural' },   // 983
    { id: 6149, name: 'Police' },         // 873
    { id: 15126, name: 'Historical' },    // 814
    { id: 2343, name: 'Magic' },          // 761
    { id: 9715, name: 'Superhero' },      // 657
    { id: 4379, name: 'Time Travel' },    // 566
    { id: 779, name: 'Martial Arts' }     // 528
];

// Explicit interleave of the two lists above, most-browsed first. Prefixes keep
// keys unique across the two id spaces (16 is both the Animation genre and an
// unrelated keyword id).
const TV_BAR_ORDER = [
    'g18', 'g35', 'g10759', 'g80', 'g10765', 'g16', 'g9648', 'g10751',
    'g10764', 'g99', 'k210024', 'k193171', 'g10762', 'k9715', 'k6152',
    'g10766', 'g10767', 'k6270', 'k6149', 'k15126', 'k2343', 'k4379',
    'g10768', 'g10763', 'k779', 'g37'
];

// The discover bar's single ordered list. `param` tells the bar which TMDB query
// key an entry toggles, so genres and keyword categories sit side by side.
//
// `sep` is the separator used to join multiple selections of the same param, and
// the two differ on purpose. TMDB reads "," as AND and "|" as OR. For genres AND
// narrows usefully (Drama,Comedy = 8457 shows). For keywords it is a dead end —
// keywords are sparse, so Anime,Sitcom returns literally 0 results while
// Anime|Sitcom returns 6345. Genres therefore stay on "," (which also matches
// how FilterPanel joins them) and keywords use "|".
//
// Built by walking TV_BAR_ORDER so a typo drops an entry loudly at build time
// rather than silently reshuffling the bar.
const TV_BAR_BY_KEY = new Map([
    ...TV_GENRES.map(g => [`g${g.id}`, { ...g, key: `g${g.id}`, param: 'with_genres', sep: ',' }]),
    ...TV_KEYWORD_CATEGORIES.map(k => [`k${k.id}`, { ...k, key: `k${k.id}`, param: 'with_keywords', sep: '|' }])
]);

export const TV_BAR_CATEGORIES = TV_BAR_ORDER.map(key => {
    const entry = TV_BAR_BY_KEY.get(key);
    if (!entry) throw new Error(`TV_BAR_ORDER references unknown category "${key}"`);
    return entry;
});

// Keyword-backed browse categories for movies.
// IDs verified against /discover/movie; counts are total_results at the time of
// writing, so each one is a populated catalogue rather than a dead chip.
// Genres use "," (AND); keywords use "|" (OR) — same rule as TV.
export const MOVIE_KEYWORD_CATEGORIES = [
  { id: 9748,   name: 'Slasher' },      // 2792
  { id: 210024, name: 'Anime' },        // 2427 — Japanese animated films
  { id: 779,    name: 'Martial Arts' }, // 2059
  { id: 9715,   name: 'Superhero' },    // 1226 — Marvel, DC, etc.
  { id: 4379,   name: 'Time Travel' },  // 1115
  { id: 2343,   name: 'Magic' },        // 1020
  { id: 470,    name: 'Spy' },          // 841
  { id: 10051,  name: 'Heist' },        // 554
];

// Explicit interleave of MOVIE_GENRES and MOVIE_KEYWORD_CATEGORIES.
// Most-browsed first. Prefix "mg" = genre, "mk" = keyword — keeps keys unique
// across the two ID spaces (same reason TV_BAR_ORDER uses "g"/"k" prefixes).
const MOVIE_BAR_ORDER = [
  'mg28', 'mg18', 'mg53', 'mg878', 'mk9715', 'mg35', 'mg14', 'mg27',
  'mg80', 'mg10749', 'mg16', 'mk210024', 'mg9648', 'mg99', 'mk779',
  'mk9748', 'mk10051', 'mk470', 'mk2343', 'mk4379', 'mg36', 'mg10402',
  'mg10752', 'mg37', 'mg10770', 'mg10751', 'mg12',
];

const MOVIE_BAR_BY_KEY = new Map([
  ...MOVIE_GENRES.map(g => [`mg${g.id}`, { ...g, key: `mg${g.id}`, param: 'with_genres',   sep: ',' }]),
  ...MOVIE_KEYWORD_CATEGORIES.map(k => [`mk${k.id}`, { ...k, key: `mk${k.id}`, param: 'with_keywords', sep: '|' }]),
]);

export const MOVIE_BAR_CATEGORIES = MOVIE_BAR_ORDER.map(key => {
  const entry = MOVIE_BAR_BY_KEY.get(key);
  if (!entry) throw new Error(`MOVIE_BAR_ORDER references unknown category "${key}"`);
  return entry;
});

// ─── Genre resolver for Search ───────────────────────────────────────────────
// Turns a user's query ("Action", "Sci-Fi", "Anime") into genre/keyword IDs
// so the search page can show a curated catalogue instead of a text search.

/**
 * Normalize a genre name for comparison:
 *   - lowercase
 *   - "&" → "and" (so "Sci-Fi & Fantasy" matches "sci-fi and fantasy")
 *   - collapse whitespace
 */
const normalizeGenreName = (name) =>
  name.toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();

/**
 * Build a lookup map: normalized-name → { id, name, media, param }
 * Called once (lazily) and cached forever.
 *
 * "media" is 'movie' or 'tv' — it tells the search hook which
 * /discover endpoint to call.
 *
 * "param" is the TMDB query key: 'with_genres' for real genres,
 * 'with_keywords' for keyword-backed categories like "Anime".
 */
let genreLookupCache = null;

function buildGenreLookup() {
  if (genreLookupCache) return genreLookupCache;

  const map = new Map();

  // Helper: add an entry, but DON'T overwrite if the name already exists.
  // This means Movie genres take priority over TV genres when names collide
  // (e.g. "Comedy" → movie 35 wins over tv 35, which is fine because both
  // discover endpoints return the same catalogue).
  const add = (id, name, media, param = 'with_genres') => {
    const key = normalizeGenreName(name);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push({ id, name, media, param });
  };

  // Movie genres
  MOVIE_GENRES.forEach(g => add(g.id, g.name, 'movie'));
  // TV genres
  TV_GENRES.forEach(g => add(g.id, g.name, 'tv'));
  // Movie keyword categories (Anime, Superhero, etc.)
  MOVIE_KEYWORD_CATEGORIES.forEach(k => add(k.id, k.name, 'movie', 'with_keywords'));
  // TV keyword categories
  TV_KEYWORD_CATEGORIES.forEach(k => add(k.id, k.name, 'tv', 'with_keywords'));

  genreLookupCache = map;
  return map;
}

/**
 * Try to resolve a search query as a genre/keyword name.
 *
 * @param {string} query  The raw search input (e.g. "Action", "Sci-Fi & Fantasy")
 * @returns {object|null}  null if not a genre, otherwise:
 *   {
 *     displayName: "Action",          // the canonical name for the UI
 *     entries: [                       // one per discover endpoint to call
 *       { id: 28, media: 'movie', param: 'with_genres' }
 *     ]
 *   }
 */
export function resolveGenreQuery(query) {
  if (!query || !query.trim()) return null;

  const lookup = buildGenreLookup();
  const normalized = normalizeGenreName(query);
  const entries = lookup.get(normalized);

  if (!entries || entries.length === 0) return null;

  return {
    displayName: entries[0].name,   // use the first match's canonical name
    entries
  };
}

/**
 * Curated dominant color palette per genre/category matching modern streaming
 * aesthetics (e.g. Horror = purple, Romance = crimson red, Adventure = golden bronze).
 */
export const GENRE_COLORS = {
  Horror: { hex: '#4a1259', rgb: '74, 18, 89' },
  Romance: { hex: '#991b1b', rgb: '153, 27, 27' },
  Adventure: { hex: '#854d0e', rgb: '133, 77, 14' },
  Action: { hex: '#b91c1c', rgb: '185, 28, 28' },
  'Action & Adventure': { hex: '#b91c1c', rgb: '185, 28, 28' },
  Drama: { hex: '#1e3a8a', rgb: '30, 58, 138' },
  Comedy: { hex: '#d97706', rgb: '217, 119, 6' },
  'Sci-Fi & Fantasy': { hex: '#4338ca', rgb: '67, 56, 202' },
  'Sci-Fi': { hex: '#4338ca', rgb: '67, 56, 202' },
  Animation: { hex: '#7c3aed', rgb: '124, 58, 237' },
  Mystery: { hex: '#3b0764', rgb: '59, 7, 100' },
  Crime: { hex: '#701a2b', rgb: '112, 26, 43' },
  Thriller: { hex: '#374151', rgb: '55, 65, 81' },
  Fantasy: { hex: '#6b21a8', rgb: '107, 33, 168' },
  Family: { hex: '#059669', rgb: '5, 150, 105' },
  Documentary: { hex: '#3f6212', rgb: '63, 98, 18' },
  Reality: { hex: '#be185d', rgb: '190, 24, 93' },
  Kids: { hex: '#0284c7', rgb: '2, 132, 199' },
  Soap: { hex: '#e11d48', rgb: '225, 29, 72' },
  Talk: { hex: '#4f46e5', rgb: '79, 70, 229' },
  'War & Politics': { hex: '#52525b', rgb: '82, 82, 91' },
  War: { hex: '#52525b', rgb: '82, 82, 91' },
  News: { hex: '#1d4ed8', rgb: '29, 78, 216' },
  Western: { hex: '#713f12', rgb: '113, 63, 18' },
  History: { hex: '#78350f', rgb: '120, 53, 15' },
  Music: { hex: '#4f46e5', rgb: '79, 70, 229' },
  'TV Movie': { hex: '#1e293b', rgb: '30, 41, 59' },
  Anime: { hex: '#a21caf', rgb: '162, 28, 175' },
  Sitcom: { hex: '#ea580c', rgb: '234, 88, 12' },
  'High School': { hex: '#db2777', rgb: '219, 39, 119' },
  Supernatural: { hex: '#134e4a', rgb: '19, 78, 74' },
  Police: { hex: '#1e3a8a', rgb: '30, 58, 138' },
  Historical: { hex: '#78350f', rgb: '120, 53, 15' },
  Magic: { hex: '#7e22ce', rgb: '126, 34, 206' },
  Superhero: { hex: '#e11d48', rgb: '225, 29, 72' },
  'Time Travel': { hex: '#0f766e', rgb: '15, 118, 110' },
  'Martial Arts': { hex: '#b91c1c', rgb: '185, 28, 28' },
  Slasher: { hex: '#7f1d1d', rgb: '127, 29, 29' },
  Spy: { hex: '#0f172a', rgb: '15, 23, 42' },
  Heist: { hex: '#047857', rgb: '4, 120, 87' }
};

export const getCategoryColor = (category) => {
  if (!category) return { hex: '#1e293b', rgb: '30, 41, 59' };
  if (category.name && GENRE_COLORS[category.name]) {
    return GENRE_COLORS[category.name];
  }
  return { hex: '#1e293b', rgb: '30, 41, 59' };
};

