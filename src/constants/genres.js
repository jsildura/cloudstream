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

