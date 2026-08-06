/**
 * Recent-search history.
 *
 * NOTE: Netflix does not actually expose search history to users. This is our
 * own feature, not Netflix parity. It lives here so exactly one module touches
 * the localStorage key — previously Navbar.jsx read it and nothing wrote it.
 */

const KEY = 'streamflix_recent_searches';
const MAX = 8;

/** Always returns an array, even if storage holds junk or is unavailable. */
const read = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string') : [];
  } catch {
    return [];
  }
};

/** Writes and echoes the list back, so callers can setState(write(...)). */
const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode / quota exceeded. History is a nicety — never break search.
  }
  return list;
};

export const loadRecent = () => read();

export const saveRecent = (query) => {
  const trimmed = (query || '').trim();
  if (!trimmed) return read();
  // Case-insensitive dedupe, newest first, so "Dune" doesn't sit next to "dune".
  const rest = read().filter(s => s.toLowerCase() !== trimmed.toLowerCase());
  return write([trimmed, ...rest].slice(0, MAX));
};

export const removeRecent = (query) => write(read().filter(s => s !== query));

export const clearRecent = () => write([]);
