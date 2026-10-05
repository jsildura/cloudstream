# Codebase Audit — Low-End Performance, Security, Reliability

**Date:** 2026-10-05 (revised same day after re-verification — see [Revision log](#revision-log))
**Commit at time of audit:** `222959d` (branch `main`, clean tree)
**Scope:** full tree — source files under `src/`, Cloudflare Pages Functions under `functions/`, `database.rules.json`, `vite.config.js`, `index.html`, and the built output in `dist/`.

This document covers **three sections**:

- **[Round 1](#round-1--build-and-delivery-layer)**: the build and delivery layer. What ships, how it loads, and what happens when loading fails.
- **[Round 2](#round-2--runtime-and-data-layer)**: the runtime and data layer. What happens once the app is running. Limited to active code paths; the music feature is excluded because its routes are commented out at [`App.jsx:183-191`](src/App.jsx:183).
- **[Re-verification additions](#re-verification-additions)**: two security findings the first pass missed.

Every claim below has been re-checked against the code: by reading the file, running a tree-wide grep, walking a parsed file, or taking a live measurement. Where the first draft was wrong, the text has been corrected in place, and the [Revision log](#revision-log) lists what changed.

> **A cross-cutting fact that changes several findings:** every visitor is authenticated. `AuthProvider` sits at the app root ([`main.jsx:16`](src/main.jsx:16)). Its mount effect calls `initFirebase()` ([`AuthContext.jsx:172`](src/contexts/AuthContext.jsx:172)), and when there is no user it calls `auth.signInAnonymously()` ([`AuthContext.jsx:149`](src/contexts/AuthContext.jsx:149), invoked at [line 251](src/contexts/AuthContext.jsx:251)). The app has no "signed-out visitor" and no request path without a Firebase session. As a result, any `auth != null` rule only stops someone who hasn't called `signInAnonymously()` with the public API key.

---

# Round 1 — build and delivery layer

---

## 1. Performance on low-end devices: the Firebase 8.10.1 compat SDK runs before React boots

### What is happening

[`index.html:133-136`](index.html:133) loads four legacy Firebase CDN scripts on every route, for every visitor (also present in the built `dist/index.html:128-131`):

```html
<script defer src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/8.10.1/firebase-storage.js"></script>
```

### Measured cost

Sizes measured live from gstatic:

| Script | Raw | Gzip (transfer) |
|---|---:|---:|
| `firebase-app.js` | 21.6 KiB | 6.8 KiB |
| `firebase-auth.js` | 173.1 KiB | 55.6 KiB |
| `firebase-database.js` | 183.3 KiB | 51.1 KiB |
| `firebase-storage.js` | 43.9 KiB | 13.2 KiB |
| **Total** | **421.9 KiB (≈432 KB)** | **126.7 KiB** |

For comparison, the app's own critical JS from `dist/`:

| Asset | Raw | Gzip |
|---|---:|---:|
| `index-*.js` (main entry) | 358 KiB | ~108 KiB |
| `vendor-react-*.js` | 44.7 KiB | ~16 KiB |

Firebase is roughly the same size as all of the app's critical JavaScript, slightly larger on the wire (≈127 vs ≈124 KiB gzip).

The app does client-side rendering (`createRoot`), not hydration. Deferred scripts run in document order, and the four Firebase tags come before `<script type="module" src="/src/main.jsx">` ([`index.html:423`](index.html:423)). Because of that, the ≈422 KiB parse-and-execute runs **before React starts at all**, which delays first render rather than competing with it. On a two-core Android device this sits squarely on the critical path.

### Why deferral helps, and why the payoff is smaller than "removing" it

[`App.jsx:20-21`](src/App.jsx:20) shows the code-splitting intent:

```js
// Deferred — pulls in Firebase, only needed after first paint
const GlobalChat = lazy(() => import('./components/GlobalChat'));
```

But [`src/lib/firebase.js:98-101`](src/lib/firebase.js:98) reads the SDK from the global object, so the lazy boundary doesn't defer it:

```js
export function initFirebase() {
    if (typeof window === 'undefined' || typeof window.firebase === 'undefined') {
        throw new FirebaseInitializationError('sdk-unavailable', 'Firebase SDK not loaded on window');
    }
```

A grep for static `from 'firebase…'` imports across `src/` finds **zero** hits. The SDK reaches the app only through the four script tags.

**But the SDK is not wasted for any visitor.** Every page load needs it shortly after mount:

- `AuthProvider` (root) → `initFirebase()` → anonymous sign-in. See the cross-cutting note above.
- `ProfileContext`, `ProfileDataContext`, and `AdFreeContext` call `initFirebase().db`. About 17 call sites in total, excluding tests.
- The homepage's `PopularOnStreamflix` row reads RTDB through [`usePopularTracking.js:75`](src/hooks/usePopularTracking.js:75).

So the correct framing is: **move ≈422 KiB of parse/execute off the pre-React critical path so the first render isn't blocked**. It is not "skip the download". Transfer savings for a typical session are close to zero. The gain is time to first render.

### Suggested fix

1. Delete the four `<script defer>` tags from `index.html`.
2. Replace `initFirebase()`'s `window.firebase` lookup with an idempotent `loadFirebase()` promise that loads the SDK on first demand. Two options:
   - **Minimal change:** inject the same CDN scripts on demand and resolve once `window.firebase` exists. All call sites keep the compat API.
   - **Preferred:** migrate to `await import('firebase/app')` with the modular v10 SDK already in `devDependencies` (`firebase: ^10.14.1`). It tree-shakes and is not end-of-life (see the note in finding 2).
3. **Caution:** `initFirebase()` is currently **synchronous** and called from about 17 places. Making it async changes every caller. The `window.firebase` reads at [`firebase.js:84-87`](src/lib/firebase.js:84) (`createGoogleProvider`) and [`AuthContext.jsx:176-177`](src/contexts/AuthContext.jsx:176) (`setPersistence`) also need to go through the loader.
4. To defer `firebase-storage` separately (it's only needed for chat uploads in [`src/lib/globalChatUpload.js`](src/lib/globalChatUpload.js)), first remove the unconditional `window.firebase.storage()` call at [`firebase.js:113`](src/lib/firebase.js:113).
5. Kick off the load right after first paint (for example `requestIdleCallback` from `AuthProvider`'s mount effect). Don't wait for user interaction: auth and profile data are needed on every page.

**Expected effect:** React's first render is no longer blocked behind ≈422 KiB of third-party parse work. Auth, profiles, and the Popular row arrive slightly later, after first paint.

### Status: Resolved (Fixed)

- **Removed Pre-React Blocking Scripts**: Deleted all four `<script defer>` tags (`firebase-app.js`, `firebase-auth.js`, `firebase-database.js`, `firebase-storage.js`) from [`index.html`](index.html), removing ≈422 KiB raw (≈127 KiB gzip) of third-party JavaScript parse-and-execute off the pre-React critical boot path. Replaced with `<link rel="dns-prefetch" href="https://www.gstatic.com">`.
- **Dynamic On-Demand Loader (`loadFirebase`)**: Created an idempotent `loadFirebase()` loader in [`src/lib/firebase.js`](src/lib/firebase.js) that injects `firebase-app.js` first, followed by `firebase-auth.js` and `firebase-database.js` in parallel, caching the singleton promise so all callers share the load. Retained backward-compatible synchronous `initFirebase()` once loaded so caller call signatures and test mocks remain intact.
- **Post-First-Paint Scheduling**: In [`src/contexts/AuthContext.jsx`](src/contexts/AuthContext.jsx), scheduled Firebase initialization after first paint via `requestIdleCallback` (with a timeout fallback) instead of blocking synchronously during mount. Added on-demand resolution in `signInWithGoogle`.
- **Deferred Firebase Storage**: Made storage optional in `initFirebase()` by removing unconditional `window.firebase.storage()` calls; provided `loadFirebaseStorage()` for on-demand loading, completely skipping `firebase-storage.js` on regular page visits.
- **Popular Tracking Integration**: Updated [`src/hooks/usePopularTracking.js`](src/hooks/usePopularTracking.js) to await `loadFirebase()` seamlessly before connecting to RTDB.
- **Comprehensive Unit Testing**: Added tests in [`src/lib/firebase.test.js`](src/lib/firebase.test.js) verifying idempotent loading, fast-path resolution, error handling, and optional storage. All 82 test suites (895 tests) pass.

### Secondary: the 284 KiB global stylesheet and the splash gate

[`src/main.jsx:9-11`](src/main.jsx:9) eagerly imports all three global sheets:

```js
import './styles/globals.css'
import './styles/pages.css'
import './styles/components.css'
```

Measured source sizes and rule counts:

| File | Size | Rules (`{`) | `@media` blocks |
|---|---:|---:|---:|
| `src/styles/globals.css` | 19.0 KiB | 131 | 7 |
| `src/styles/pages.css` | 179.9 KiB | 1,343 | 61 |
| `src/styles/components.css` | 212.2 KiB | 1,621 | 88 |
| **Total** | **411 KiB** | **3,095** | **156** |

These bundle into a single `dist/assets/index-*.css` of **291,269 B (284 KiB) raw, ≈49 KiB gzip**.

The loading strategy is already correct and should stay. The Beasties plugin ([`vite.config.js:192-248`](vite.config.js:192)) inlines ≈6.6 KB of critical CSS (two `<style>` blocks, 3,626 + 2,986 B) and async-swaps the rest with `<link rel="preload" as="style" onload="this.rel='stylesheet'">`. The plain `<link rel="stylesheet">` appears only inside `<noscript>`. All of this was verified in the built `dist/index.html`.

[`index.html:373-408`](index.html:373) holds splash dismissal until **both** `app-ready` and the deferred stylesheet's `load` event have fired. This prevents a flash of unstyled content. The wait is **bounded**: an independent 3-second ceiling releases the CSS gate ([`index.html:408`](index.html:408)), and a 6-second fallback hides the splash no matter what ([`index.html:420`](index.html:420)). On slow connections, time-to-content therefore waits on the stylesheet for **up to 3 s**, not indefinitely.

The remaining opportunity is to shrink what's in the one sheet. Route-specific rules currently go to every visitor. In `components.css`, the string `settings` appears 188 times, `ad-free`/`adfree` 99 times, and `profile` 38 times (case-sensitive matches). Splitting `pages.css` and `components.css` so each lazy route imports its own CSS would shorten the splash wait. It would also cut ongoing style-recalculation cost, since every class toggle is matched against all 3,095 rules.

> **Note:** `dist/` was built at 2026-09-28 13:56. Three commits came after it, including `c8518c7` ("smoother performance on low-RAM devices"). Bundle figures may be slightly stale. Rebuild before acting on exact numbers.

---

## 2. Security: `/api/proxy` is an unauthenticated open relay

### What is happening

[`functions/api/proxy.js`](functions/api/proxy.js) fetches any URL passed in a query parameter and returns the body with `Access-Control-Allow-Origin: *`.

It is publicly reachable in production. [`public/_routes.json`](public/_routes.json) includes `/api/*`, and `functions/` contains no `_middleware*` file, so nothing guards it.

### The problems

**a. Server-side fetch of arbitrary public URLs.** The domain allowlist exists only as commented-out code at [`functions/api/proxy.js:50-57`](functions/api/proxy.js:50):

```js
// Optional: Restrict to specific domains for security
// const allowedDomains = ['resources.tidal.com', 'i.scdn.co'];
// if (!allowedDomains.includes(parsedUrl.hostname)) {
```

The only validation is `new URL(targetUrl)` at line 48, which checks syntax, not destination. The `fetch` at line 59 uses the default `redirect: 'follow'`.

*Scope correction:* this is **not** a classic internal-network SSRF. Cloudflare Workers `fetch()` does not route to the account's private network, and Workers have no cloud-metadata endpoint like `169.254.169.254`. The realistic impact is (b)–(d) below: an anonymous fetcher on your domain, for any public host.

**b. Open relay and quota abuse.** Any third party can route arbitrary traffic through your Cloudflare Pages Functions allocation. [`Cut Cloudflare Pages Function requests to restore TMDB data.md`](Cut%20Cloudflare%20Pages%20Function%20requests%20to%20restore%20TMDB%20data.md) already documents an effort to reduce Functions request volume, and this endpoint is an unmetered hole in that budget.

**c. Memory exhaustion.** [`functions/api/proxy.js:75`](functions/api/proxy.js:75) buffers the entire upstream response:

```js
const body = await response.arrayBuffer();
```

There is no `Content-Length` check and no size ceiling. A single request pointed at a large file can exhaust the isolate's 128 MB limit.

**d. Origin laundering.** Attacker-chosen bytes are served from your domain with `ACAO: *` and a 24 h `Cache-Control`, inheriting your origin's reputation.

### Suggested fix

**The cheapest correct fix is deletion.** The endpoint has exactly two callers (tree-wide grep for `/api/proxy`):

- [`src/lib/music/colorExtraction.js:15`](src/lib/music/colorExtraction.js:15)
- [`src/lib/music/musicConfig.js:106`](src/lib/music/musicConfig.js:106)

Both belong to the music feature, whose routes are commented out at [`App.jsx:183-191`](src/App.jsx:183). The app is exposing an open proxy to serve a disabled feature. (The dev-only middleware at `vite.config.js:47` can go with it.)

If music is coming back, harden it instead of deleting it:

- Enforce the hostname allowlist that's already written in the comment, using **exact** host matches.
- Set `redirect: 'manual'` so an allowed host can't redirect elsewhere.
- Stream the response through instead of calling `arrayBuffer()`, and reject when `Content-Length` exceeds a ceiling.
- Scope `Access-Control-Allow-Origin` to your own origin instead of `*`.

See also [finding 7](#7-security--the-media-proxy-allowlist-admits-any-workersdev-host). The active media proxy has a related, live problem.

### Related: Firebase 8.10.1 is end-of-life

The SDK pinned in [`index.html:133-136`](index.html:133) is the v8 line from 2021, which no longer gets feature or security updates. `firebase: ^10.14.1` is already in `devDependencies`. That's a second, independent reason to do the migration in finding 1.

### Confirmed not a problem

- **No secrets are tracked by git, and none ever were.** `.env`, `.env.*`, `.dev.vars`, and `*adminsdk*.json` are all ignored ([`.gitignore:22-27`](.gitignore:22), [`.gitignore:243`](.gitignore:243)). `git log --all --diff-filter=A` shows only `.env.example` and `.dev.vars.example` were ever added. The service-account JSON in the working directory (`streamflix-chat-firebase-adminsdk-*.json`) is untracked and ignored.
- [`vite.config.js:483-490`](vite.config.js:483) unconditionally overwrites the `Authorization` header before proxying to TMDB **in dev**, so a Firebase ID token can't leak to a third party. (The production equivalent is covered in [finding 8](#8-security--the-tmdb-catch-all-function-is-an-open-token-bearing-relay).)

---

## 3. Reliability: the application mounts no error boundaries

### What is happening

[`src/components/ErrorBoundary.jsx`](src/components/ErrorBoundary.jsx) is a complete error boundary, with `getDerivedStateFromError`, `componentDidCatch`, a fallback UI, a `fallback`/`message` prop, and a "Try Again" button. It has a stylesheet (`ErrorBoundary.css`) but **no test file**.

**Nothing imports it.** Verified two ways:

- A grep for `ErrorBoundary` across `src/` finds hits only inside `ErrorBoundary.jsx` itself.
- A grep for `componentDidCatch|getDerivedStateFromError` across `src/` finds only `src/components/ErrorBoundary.jsx`.

There is also no `window.onerror` or `unhandledrejection` handler in [`index.html`](index.html) or anywhere in `src/`.

### Why this matters most on poor networks

In React 19, an uncaught render error unmounts the entire root. With no boundary anywhere in the tree, the result is a permanently blank page with no way to recover in-app.

Every route in [`App.jsx:71-120`](src/App.jsx:71) is `lazy()`. A failed dynamic import **throws** and is never retried, so on a flaky mobile connection one dropped chunk request means a white screen. `dist/assets` holds 30 CSS and 60 JS files, so there are many independent requests that can each fail.

*Correction on the service-worker angle:* `registerType: 'prompt'` ([`vite.config.js:292`](vite.config.js:292)) does **not** cause stale-chunk 404s for users on an old service worker. Workbox precaches `**/*.{js,css,html,…}` ([`vite.config.js:335`](vite.config.js:335)), so the old worker serves the old HTML *and* its old chunks consistently from cache. Chunk-load failures actually come from:

- first visits, or the first load after clearing storage, before the SW is installed;
- browsers or contexts without SW support (some in-app WebViews, private modes);
- long-lived tabs that keep running old JS after a new SW activates and the old precache is purged;
- plain network failure on any request the SW doesn't control.

### Suggested fix, most valuable first

1. **Wrap the route `<Suspense>`.** At [`App.jsx:163`](src/App.jsx:163), wrap `<Suspense fallback={<PageLoader />}>` in `<ErrorBoundary key={location.pathname}>`. Keying on the pathname means navigating away clears the error state, so both the retry button and normal navigation recover.

2. **Give lazy imports a retry.** Add a helper and use it for every route:

   ```js
   const lazyRetry = (fn) => lazy(() =>
     fn().catch(() => new Promise(r => setTimeout(r, 500)).then(fn))
         .catch(() => { window.location.reload(); return new Promise(() => {}); })
   );
   ```

   The single retry covers transient network failure. The reload covers the purged-precache, long-lived-tab case. Guard the reload with a `sessionStorage` flag so a permanently missing chunk can't cause an endless reload loop.

3. **Isolate GlobalChat.** Wrap `<GlobalChat />` at [`App.jsx:214`](src/App.jsx:214) in its own boundary, so a Firebase or RTDB failure only breaks chat and not the page underneath it.

4. **Add a last-resort logger.** `window.addEventListener('unhandledrejection', ...)` in `main.jsx`, so async failures outside React's boundaries are at least visible.

### Related: `fetch()` calls with no timeout or abort

Across `src/` (tests excluded) there are 94 `fetch(` call lines. Only 30 lines anywhere in `src/` mention `AbortController` or `AbortSignal`. These 29 files call `fetch()` without `AbortController`, `AbortSignal`, or `signal` appearing anywhere in the file:

```
src/api/stream/media-core.js  ¹     src/lib/music/losslessApi.js  ²
src/components/ChatLinkPreview.jsx  src/lib/music/musicConfig.js  ²
src/components/ContinueWatching.jsx src/lib/music/songlink.js  ²
src/components/GlobalChat.jsx       src/pages/CollectionDetails.jsx
src/components/Modal.jsx            src/pages/Contact.jsx
src/components/RecommendedForYou.jsx src/pages/IPTV.jsx
src/contexts/AdFreeContext.jsx      src/pages/IPTVWatch.jsx
src/contexts/ViewerCountContext.jsx src/pages/music/MusicArtist.jsx  ²
src/hooks/useTMDB.js                src/pages/music/MusicTrack.jsx  ²
src/hooks/useTMDBReviews.js         src/pages/PersonPage.jsx
src/lib/globalChatUpload.js         src/pages/Search.jsx
src/lib/music/colorExtraction.js  ² src/pages/Sports.jsx  ³
                                    src/pages/SportsWatch.jsx
                                    src/pages/StreamingProviderPage.jsx
                                    src/pages/StudioPage.jsx
                                    src/pages/Watch.jsx
                                    src/workers/epgParser.js
```

¹ Server-side only (Pages Function and dev middleware). Workers enforce their own limits, so it doesn't belong in a client-timeout list. ² Music tree, disabled. ³ Route commented out at [`App.jsx:181`](src/App.jsx:181).

That leaves **about 21 active client files**. On a stalled mobile connection these requests hang until the browser gives up, and their loading spinners never resolve. The highest-traffic ones are [`useTMDB.js`](src/hooks/useTMDB.js) (19 bare `fetch` calls), [`Watch.jsx`](src/pages/Watch.jsx) (6, lines 644-733), and [`Modal.jsx`](src/components/Modal.jsx). A shared `fetchWithTimeout` (`AbortSignal.timeout(n)`) would fix them consistently.

---

## Round 1: order of work

| # | Finding | Why this position |
|---|---|---|
| 1 | **Reliability: mount `ErrorBoundary` + `lazyRetry`** | Smallest diff. The component already exists, and it prevents the worst user-facing failure (a permanent white screen). |
| 2 | **Security: delete `/api/proxy`** | A file deletion plus two dead call sites. Closes an open relay that only serves a disabled feature. |
| 3 | **Performance: defer the Firebase SDK** | Unblocks React's first render, but touches about 17 synchronous `initFirebase()` call sites and auth-state timing. The transfer savings per session are close to zero. |

The CSS route-splitting in finding 1's secondary section is worth doing, but it's the biggest refactor here and its payoff is capped by the existing 3 s gate ceiling.

---
---

# Round 2 — runtime and data layer

**Scope note:** this round excludes the music feature, whose routes are commented out at [`App.jsx:183-191`](src/App.jsx:183). `src/pages/music/`, `src/components/music/`, `src/lib/music/`, `src/hooks/music/`, and `src/contexts/Music*` were treated as dead code.

Round 1 asked *what ships and how it loads*. This round asks *what happens once the app is running*: render cost per interaction, data-layer trust boundaries, and failure detection in the core playback flow.

---

## 4. Performance on mouse-driven devices: one card hover re-renders every mounted card row

### What is happening

[`src/contexts/HoverPreviewContext.jsx:144-150`](src/contexts/HoverPreviewContext.jsx:144) builds the provider value as a plain object literal:

```js
const value = {
    openPreview,
    closePreview,
    keepPreview,
    closeNow,
    getPreviewProps,
};
```

All five members are wrapped in `useCallback` (the file has 7 `useCallback`s), but **the object holding them is recreated on every provider render**. The context value's identity changes even though nothing inside it did.

The provider owns `preview` and `isClosing` state ([lines 24-25](src/contexts/HoverPreviewContext.jsx:24)). Each hover produces about 3 provider renders:

1. Open: `setPreview` after the 100 ms delay.
2. Leave: `setIsClosing(true)`.
3. Exit animation ends: `setIsClosing(false)` and `setPreview(null)`, batched into one render.

### Who is affected: desktop / mouse users only

The provider has a pointer-capability gate. [Lines 63-73](src/contexts/HoverPreviewContext.jsx:63) record `matchMedia('(hover: hover) and (pointer: fine)')`, and `openPreview` returns immediately when it doesn't match ([line 97](src/contexts/HoverPreviewContext.jsx:97)). **On touch phones, tablets, and TV remotes, no preview state ever changes, so this re-render cascade never happens.** This is a desktop or laptop problem, most noticeable on low-end Windows and Chromebook hardware, and is **not** a low-end-Android problem.

### Blast radius

Memoization doesn't contain this. When a context value changes, every consumer re-renders, whether or not it is wrapped in `React.memo`.

On the homepage, the consumers are the **row components themselves**, and they render their cards inline. For example, `TrendingSection` is `memo`-wrapped ([`TrendingSection.jsx:38`](src/components/TrendingSection.jsx:38)), calls `useHoverPreview()` at line 40, and maps over its items at line 323. Each row therefore re-renders along with every card it contains.

| Factor | Value | Source |
|---|---|---|
| Provider scope | entire app | [`App.jsx:141`](src/App.jsx:141) |
| Files calling `useHoverPreview()` | 15 (10 components incl. `HoverPreviewCard`, 5 pages) | tree-wide grep, tests excluded |
| Hover-consuming rows on the (non-kids) homepage | 8: `RecommendedForYou`, `PopularOnStreamflix`, `TrendingSection` ×2, `TrendingAnimeSection`, `TopTenRow`, `MovieStudios`, `StreamingProviders` | [`Home.jsx:297-417`](src/pages/Home.jsx:297) |
| Rows actually mounted | only those scrolled near the viewport, because most sit inside `LazyLoadSection` | `Home.jsx` |
| Provider renders per hover | ~3 | see above |

(`MovieCard`, which is `memo`-wrapped and also a consumer, is used only by `MovieRow.jsx` and `CollectionDetails.jsx`, not on the homepage.)

Net effect: moving the mouse across a row re-renders every mounted hover row and all their cards about 3 times per card passed over.

### Suggested fix

One change. The callbacks are already stable, so memoizing the wrapper makes the value's identity stable:

```js
const value = useMemo(() => ({
    openPreview,
    closePreview,
    keepPreview,
    closeNow,
    getPreviewProps,
}), [openPreview, closePreview, keepPreview, closeNow, getPreviewProps]);
```

The existing `memo` wrappers on `TrendingSection`, `MovieCard`, and others then start doing real work.

This does **not** break the preview. `{preview && <HoverPreviewCard ... />}` at [lines 155-165](src/contexts/HoverPreviewContext.jsx:155) is rendered by the provider itself, next to `{children}`, so it still re-renders on every state change as intended.

### Status: Resolved (Fixed)

- **Memoized Context Value**: Wrapped the provider value in `useMemo` with its stable callback dependencies in [`src/contexts/HoverPreviewContext.jsx`](src/contexts/HoverPreviewContext.jsx).
- **Prevented Re-render Cascade**: On desktop/mouse devices, mouseenter/mouseleave hover interactions no longer recreate the context value's object identity, preventing all mounted card rows from re-rendering during hovers.
- **Unit Tested**: Covered by unit tests in [`src/contexts/HoverPreviewContext.test.jsx`](src/contexts/HoverPreviewContext.test.jsx).


### Secondary: images are sized for desktop on every device

[`src/utils/images.js`](src/utils/images.js) routes TMDB art through the wsrv.nl proxy for on-the-fly WebP. That's a genuine win and should stay. The gap is that each helper requests one fixed width regardless of viewport:

| Helper | Width | Line |
|---|---:|---|
| `cardBackdrop` | 780 | [images.js:45](src/utils/images.js:45) |
| `previewBackdrop` | 1280 | [images.js:48](src/utils/images.js:48) |
| `posterAsBackdrop` | 500 by default (780 at [`PopularOnStreamflix.jsx:310`](src/components/PopularOnStreamflix.jsx:310)) | [images.js:60](src/utils/images.js:60) |
| `cardPoster` | 500 | [images.js:63](src/utils/images.js:63) |
| `cardLogo` | 500 | [images.js:69](src/utils/images.js:69) |

A regex scan of the `<img>` tags in `src/` (tests excluded; counts may vary by ±1 depending on how multi-line JSX is matched) finds about 98-99 tags:

- **1** uses `srcSet`
- **0-1** has explicit `width` and `height`
- **4** set `decoding="async"`
- about 46-47 set `loading="lazy"`

A 780 px backdrop shown in a ~160 px slot on a phone is roughly 24× the pixel area needed. That cost is paid three times: bandwidth, decode time, and decoded-bitmap memory. Decode cost and memory pressure are where low-end Android actually struggles, and WebP alone doesn't help with either. **This one does affect touch devices.**

This gap is already known and planned. The file header says: *"PHASE 1 RULE: every helper below requests the SAME pixel width the code already used... Width tuning is Phase 2 — see the plan's section 8."*

The fix is cheap because wsrv.nl accepts any `w`. Emit a `srcSet` with two or three widths plus a `sizes` attribute per helper, add `width`/`height` to prevent layout shift, and add `decoding="async"` so decoding yields to the main thread.

---

## 5. Security: `/popular_this_week` is world-writable with no validation

### What is happening

[`database.rules.json:499-503`](database.rules.json:499) grants unconditional read **and write** on a node that feeds the homepage:

```json
"popular_this_week": {
  ".read": true,
  ".write": true,
  "$week": { ".indexOn": ["count"] }
}
```

The subtree has no `.validate`, no shape constraint, no size limit, and no auth condition. In Firebase RTDB, a `.write: true` granted on a parent **can't be revoked by rules on its children**. (`.validate` rules on children *do* still apply, which is why the minimum-viable fix below works.)

Walking the parsed rules file for literal-`true` permissions finds exactly four:

```
READ  /popular_this_week
WRITE /popular_this_week
READ  /reviews
READ  /ratings
```

`/popular_this_week` is the only node in the ruleset with an unconditional write.

### Why the neighbouring nodes aren't the model to copy

| Node | `.read` | `.write` |
|---|---|---|
| `/reviews` | `true` | `"auth != null"` |
| `/ratings` | `true` | `"auth != null"` |
| `/popular_this_week` | `true` | **`true`** |

It looks like `auth != null` was simply forgotten here. **But because every visitor is signed in anonymously (see the cross-cutting note at the top), `auth != null` gives almost no protection anywhere in this ruleset.** An attacker runs `firebase.auth().signInAnonymously()` with the public config from [`firebase.js:7-15`](src/lib/firebase.js:7) and is "authenticated". The same weakness affects `/reviews` and `/ratings`.

### Exploitability

The `databaseURL` has to be public in the client bundle ([`src/lib/firebase.js:10`](src/lib/firebase.js:10): `https://streamflix-chat-default-rtdb.firebaseio.com`). Today the node is reachable with a single unauthenticated REST request, with no account, token, or origin check.

**a. Homepage manipulation.** [`PopularOnStreamflix`](src/components/PopularOnStreamflix.jsx), a homepage row, reads this node through [`usePopularTracking.js:192-195`](src/hooks/usePopularTracking.js:192) with `orderByChild('count').limitToLast(10)`. Writing an entry with `count: 999999` pins arbitrary content to the top slot for every visitor.

The attacker-controlled `title` reaches the DOM in several places: the card's `aria-label` ([line 329](src/components/PopularOnStreamflix.jsx:329)), the image `alt` ([line 335](src/components/PopularOnStreamflix.jsx:335)), and the visible text when there's no backdrop ([line 341](src/components/PopularOnStreamflix.jsx:341)). `poster_path` flows into an image URL at [line 310](src/components/PopularOnStreamflix.jsx:310). React escapes all of these, so this is defacement and content manipulation, not XSS.

**b. Data destruction.** A single `DELETE` on the node wipes all tracking history and empties the row.

**c. Billing amplification.** [`usePopularTracking.js:108`](src/hooks/usePopularTracking.js:108) makes the client download the *entire* node during its cleanup pass:

```js
const snapshot = await dbRef.ref('popular_this_week').once('value');
```

This pulls every retained week, with every tracked title's `title`, `poster_path`, `count`, and `lastUpdated`, just to list the top-level week keys. An attacker inflates the node once, and every later client that passes the cleanup gate downloads the inflated payload. Write once, and everyone pays, in both RTDB storage and egress.

The hook is mounted in two places: `PopularOnStreamflix` (homepage) and **`Watch.jsx:161`**. On every Watch visit it runs the cleanup check *and* a top-10 query whose result `Watch` never uses, since `Watch` only uses `trackWatch`.

### Suggested fix

**Preferred: move the write server-side.** The infrastructure already exists and is well built. [`functions/lib/firebaseAuth.js`](functions/lib/firebaseAuth.js) implements a careful hand-rolled RS256 verifier that checks `alg`, `kid`, `aud`, `iss`, and `exp` against Google's published certs. `firebaseRestGet` and `firebaseRestPut` in [`functions/lib/firebaseAdminRest.js`](functions/lib/firebaseAdminRest.js) are already used by the ad-free endpoints. Route the increment through a Pages Function, rate-limit it per IP and per uid, and set the rule to `".write": false`.

**Minimum viable: constrain the rule.** If client writes must stay:

- `.validate` the child shape to exactly `{id, type, title, poster_path, count, lastUpdated}`, with `$other` → `false`.
- Cap the length of `title` and `poster_path`.
- Require `$week` to match the week-key format (`/^\d{4}-W\d{2}$/`) instead of accepting any key.
- Require single-step increments, while still allowing the first create: `(!data.exists() && newData.child('count').val() === 1) || newData.child('count').val() === data.child('count').val() + 1`. **Limitation:** this doesn't stop a script from incrementing repeatedly. Only server-side rate limiting does.
- Optionally require a non-anonymous provider for deletes: `auth.token.firebase.sign_in_provider != 'anonymous'`.

**Do not** rely on a `".write": "auth != null"` stopgap. With anonymous auth enabled it is close to useless.

### Confirmed not a problem (Round 2)

- **The payment and entitlement endpoints are authenticated.** `purchase-adfree.js`, `redeem-key.js`, and `create-adfree-order.js` get `auth.uid` from a verified ID token and scope their RTDB paths to it. [`redeem-key.js:104`](functions/api/redeem-key.js:104) does an ETag-conditional read of `accounts/${auth.uid}/adFree`. [`purchase-adfree.js:255`](functions/api/purchase-adfree.js:255) rejects a **PayPal order** that's already bound to a different uid. `generate-adfree-keys.js` is **admin-gated**: it requires the `google.com` provider and the `globalChatAdmin` claim ([line 25](functions/api/generate-adfree-keys.js:25)).
- **XSS sinks are minimal.** The only `dangerouslySetInnerHTML` is in [`SchemaMarkup.jsx:15`](src/components/SchemaMarkup.jsx:15), which emits JSON-LD built from TMDB data. On the client this is inert, because scripts inserted through innerHTML don't execute. The server-side prerender escapes `<` before embedding JSON-LD ([`functions/_watch-prerender.js:269`](functions/_watch-prerender.js:269)). Other `innerHTML` writes (`AdInterstitial.jsx`, `GlobalChat.jsx:3478`, `adblockDetection.js`) assign constant strings.
- **Listener cleanup is broadly balanced.** Add/remove counts: `Navbar.jsx` 7/7, `GlobalChat.jsx` 11/11, `IPTV.jsx` 1/1. `Watch.jsx` (21/20) and `IPTVWatch.jsx` (9/7) are slightly uneven, but several of those listeners use `{once: true}`, so this alone isn't evidence of a leak.

> The first draft listed the media proxy here as "a real host allowlist". **That was wrong.** See [finding 7](#7-security--the-media-proxy-allowlist-admits-any-workersdev-host).

---

## 6. Reliability: the playback iframe has no failure detection

### What is happening

[`src/pages/Watch.jsx:1231-1242`](src/pages/Watch.jsx:1231) renders the playback surface for every iframe server:

```jsx
<iframe
  key={`${currentServer}-${currentSeason}-${currentEpisode}-${sandboxEnabled}`}
  src={getVideoUrl()}
  className="watch-video-player"
  allowFullScreen
  title="Video Player"
  referrerPolicy="no-referrer"
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  {...(sandboxEnabled && {
    sandbox: "allow-scripts allow-same-origin allow-forms allow-presentation"
  })}
/>
```

It has no `onLoad`, no `onError`, and no timer. The only `onError` handlers on the Watch page are at [line 1136](src/pages/Watch.jsx:1136) and [line 1501](src/pages/Watch.jsx:1501), and both are for the title **logo image**.

**This is the only player path in use today.** The other branch, `<DirectPlayer>` at [lines 1186-1229](src/pages/Watch.jsx:1186), *does* have automatic failover. Its `onFallback` moves to the next non-disabled server and dispatches a `streamflix:playback-issue` event. But the only `directPlayer` server ("Direct Play") is `disabled: true` at [`src/config/servers.js:43`](src/config/servers.js:43), so every server a user can reach is an iframe.

### Impact

When a stream host is down, geo-blocked, rate-limiting, or serving an error page, the app gets no signal that anything is wrong, and the user sees a blank rectangle. There is:

- no error state,
- no automatic failover for iframe servers,
- no prompt suggesting another server.

Users *can* recover manually through the server drawer (`serverDrawerOpen` at [line 75](src/pages/Watch.jsx:75), `handleServerSelect` at [line 945](src/pages/Watch.jsx:945)). Nothing points them to it when playback fails.

For a streaming site, this is the highest-impact reliability gap: the one thing users came to do fails silently, and the way to recover exists but is never shown.

### Suggested fix: a timed, user-driven prompt (not `onError`, and not a signal-cleared watchdog)

**Why `onLoad`/`onError` won't work:** a cross-origin iframe fires `load` even when the embed shows an error page, and `onError` doesn't fire for HTTP errors inside the frame.

**Why a "clear on playback signal" watchdog won't work either:** `Watch.jsx` has **no `message` listener**. A tree-wide grep finds the only `window.addEventListener('message', …)` in `src/` at [`IPTVWatch.jsx:1334`](src/pages/IPTVWatch.jsx:1334). The `onProgress`/`onEnded`/`onPlayStateChange` callbacks at [lines 1225-1228](src/pages/Watch.jsx:1225) are wired only to the disabled `DirectPlayer`. With no playback signal from the iframe, a watchdog that waits for one would fire on every load.

A pattern that works with what exists today:

1. On every `src` change (the existing `key` already remounts per server/season/episode), start a timer of about 10-12 s.
2. When it expires, show a dismissible, non-blocking banner: *"Not playing? Try another server"*. It should have a one-tap "Next server" button and a link that opens the existing server drawer.
3. For "next server", copy the `DirectPlayer` logic but respect the ad-free lock: `servers.findIndex((s, i) => i > currentServer && isServerEnabled(i, isAdFree))`. Don't use `getFirstEnabledServerIndex`, which returns the *first* enabled server, not the next one.
4. Fire the existing `streamflix:playback-issue` event when the user switches, so GlobalChat's Report Issue flow captures it.
5. Optional, per host: if a particular embed host is known to `postMessage` playback events, add a `message` listener that checks `event.origin` and hides the banner early for that host. This is new work, not existing infrastructure.

Don't auto-advance without a signal. You can't tell "slow to start" from "broken", and auto-advancing would interrupt working streams.

### Secondary: console calls ship to production

A tree-wide grep finds **69** `console.log`/`console.debug`/`console.info` calls in `src/` (tests excluded). **43 of them are in the disabled music tree**. Those chunks still get built because the `lazy()` declarations remain in `App.jsx`, but they're never loaded. **26 are on live code paths.** `vite.config.js` sets no `minify`, `terserOptions`, `esbuild.drop`, or `esbuild.pure`, and Vite 7's default esbuild minifier keeps console calls.

Some of them run in data-layer paths for ordinary users. [`usePopularTracking.js:175`](src/hooks/usePopularTracking.js:175) logs on every tracked watch, and lines 103, 128, and 130 log during the cleanup pass. Console arguments also keep objects alive that would otherwise be garbage-collected, and they expose internal state to anyone with devtools open.

Adding `esbuild: { drop: ['console', 'debugger'] }` to the production config removes all of them. To keep `console.error` and `console.warn` visible, use `esbuild: { pure: ['console.log', 'console.debug', 'console.info'] }` instead.

### Related: client-side database maintenance

[`usePopularTracking.js:89-135`](src/hooks/usePopularTracking.js:89) runs retention cleanup **from the browser**. Two problems besides the full-node download covered in finding 5:

- **Check-then-act race.** The `_last_cleanup` timestamp is read at [line 97](src/hooks/usePopularTracking.js:97) and written at [line 117](src/hooks/usePopularTracking.js:117) in a separate operation. Any number of clients can pass the 3-day gate at the same time, and each runs the full download-and-delete. The `cleanupAttemptedRef` guard at [line 90](src/hooks/usePopularTracking.js:90) is per hook instance and does nothing across clients.
- **Wrong tier.** Retention is a scheduled maintenance job, not a client responsibility. Running it from the browser is why the node had to be world-writable (including deletes) in the first place.

**Findings 5 and 6 share this root cause.** Moving popular-tracking writes to a Pages Function, and retention to a Cloudflare Cron Trigger, closes the security hole, removes the full-node download, and eliminates the race. One change fixes three problems.

---
---

# Re-verification additions

The first pass missed these. Both are in **active** code paths.

---

## 7. Security: the media proxy allowlist admits any `*.workers.dev` host

### What is happening

[`functions/api/stream/media.js`](functions/api/stream/media.js) passes the `u` query parameter to [`handleMediaRequest`](src/api/stream/media-core.js:32). That function checks the host against [`ALLOWED_MEDIA_HOSTS`](src/api/stream/hosts.js:5) before fetching:

```js
export function ALLOWED_MEDIA_HOSTS(hostname) {
  return hostname === 'proxy.zxcstream.xyz' ||
    hostname.endsWith('.zxcstream.xyz') ||
    hostname.endsWith('.workers.dev') ||   // ← anyone can register one, free
    hostname.endsWith('.devcorp.me');
}
```

[`hosts.js:8`](src/api/stream/hosts.js:8) accepts **any** `*.workers.dev` subdomain. Anyone can deploy a Worker there in minutes on a free account, so in practice the allowlist doesn't restrict anything. Also:

- `fetch(target, …)` at [`media-core.js:40`](src/api/stream/media-core.js:40) uses the default `redirect: 'follow'`, so even an allowed host can redirect anywhere.
- Responses go out with `Access-Control-Allow-Origin: *` ([line 51](src/api/stream/media-core.js:51)). Binary bodies are streamed through without a size limit ([line 70](src/api/stream/media-core.js:70)). Playlists are read fully into memory with `upstream.text()` ([line 58](src/api/stream/media-core.js:58)).
- The proxy sends spoofed `Origin` and `Referer` headers for `player.zxcstream.xyz` ([lines 7-12](src/api/stream/media-core.js:7)).

### Impact

The same open-relay, quota-abuse, and origin-laundering problems as `/api/proxy` (finding 2). This endpoint matters more, though, because it **serves an active feature and can't simply be deleted**, and because it streams, which makes it attractive for relaying video bandwidth through your Cloudflare account. The first draft called it "the pattern `/api/proxy` should have followed". That was wrong.

### Suggested fix

- Replace the suffix matches with an **exact-host set**: list the specific `*.workers.dev` and `*.devcorp.me` hostnames the resolver actually returns. If those hostnames rotate, have the resolver return a signed token that the proxy verifies (HMAC over URL plus expiry), instead of trusting the hostname.
- Set `redirect: 'manual'` and re-check each `Location` against the allowlist before following it.
- Cap playlist size before calling `upstream.text()`.
- Scope `Access-Control-Allow-Origin` to your own origin.

### Status: Resolved (Fixed)

- **Exact-host set**: Replaced suffix wildcards (`*.workers.dev` and `*.devcorp.me`) with `ALLOWED_MEDIA_HOST_SET` containing exact legitimate hostnames (`proxy.zxcstream.xyz`, `player.zxcstream.xyz`, `aapanel.devcorp.me`, `s1.devcorp.me`) in [`src/api/stream/hosts.js`](src/api/stream/hosts.js). Arbitrary `.workers.dev` and `.devcorp.me` subdomains are strictly rejected with 403.
- **Signed HMAC Tokens**: Added `signMediaToken` and `verifyMediaToken` (HMAC-SHA256 over `${url}:${exp}`) using WebCrypto. When the resolver returns stream URLs, [`src/api/stream/routing.js`](src/api/stream/routing.js) signs proxied URLs using `ZXC_STREAM_SECRET`, and [`handleMediaRequest`](src/api/stream/media-core.js) verifies the token and expiry.
- **Manual Redirect Validation**: Switched `fetch` in [`src/api/stream/media-core.js`](src/api/stream/media-core.js) to `redirect: 'manual'` with a re-check loop (up to 3 hops). Each redirect `Location` must be HTTPS and re-checked against `ALLOWED_MEDIA_HOSTS` or verified with HMAC token. Unauthorized redirects abort with HTTP 403.
- **Playlist Size Ceiling**: Added `MAX_PLAYLIST_BYTES = 2 * 1024 * 1024` (2 MB) check on `Content-Length` and chunk-reading loop in `readBoundedText`, cancelling the stream and returning HTTP 413 if exceeded.
- **Origin-Scoped CORS**: Added `getMediaCors` to restrict `Access-Control-Allow-Origin` to own origin, returning HTTP 403 on untrusted cross-origin requests and handling OPTIONS preflights in both Cloudflare Functions and Vite dev middleware.
- **Unit Tested**: Created 29 passing unit tests in [`src/api/stream/hosts.test.js`](src/api/stream/hosts.test.js) and [`src/api/stream/media-core.test.js`](src/api/stream/media-core.test.js).


---

## 8. Security: the TMDB catch-all Function is an open, token-bearing relay

### What is happening

[`functions/api/[[path]].js`](functions/api/[[path]].js) handles every `/api/*` path that has no dedicated handler. It forwards the request to `https://api.themoviedb.org/3/${path}${queryString}` ([line 44](functions/api/[[path]].js:44)) with your server-side `Bearer ${VITE_TMDB_READ_ACCESS_TOKEN}` attached ([line 49](functions/api/[[path]].js:49)). The response carries `Access-Control-Allow-Origin: *` ([line 4](functions/api/[[path]].js:4)).

The host is fixed, so this isn't SSRF. But **any website can call `https://<your-domain>/api/...` from the browser and use your TMDB token and your Pages Functions request quota.** That's exactly the budget [`Cut Cloudflare Pages Function requests to restore TMDB data.md`](Cut%20Cloudflare%20Pages%20Function%20requests%20to%20restore%20TMDB%20data.md) is trying to protect.

### Suggested fix

- Scope `Access-Control-Allow-Origin` to your own origin(s). This stops other sites from calling it from the browser, though not server-side scripts.
- Restrict `path` to an allowlist of the TMDB endpoint prefixes the app actually uses, and only allow `GET`. The handler currently also advertises `POST`.
- Add caching (`caches.default` or `Cache-Control` with `s-maxage`) so repeated identical requests don't each cost a Functions invocation and a TMDB call.

### Status: Resolved (Fixed)

- **Origin-Scoped CORS**: Replaced open `Access-Control-Allow-Origin: *` with `getTmdbCors` in [`functions/api/[[path]].js`](functions/api/[[path]].js). Restricts access to own origins (`APP_URL`, `ALLOWED_ORIGIN`, dev origins). Untrusted cross-origin requests are rejected with HTTP 403 Forbidden (`Forbidden origin`), preventing third-party websites from draining TMDB API tokens and Cloudflare Functions invocations.
- **Method Restriction**: Restricted incoming methods to `GET` and `HEAD` (plus `OPTIONS` preflight). Non-GET requests (e.g. `POST`, `PUT`, `DELETE`) are rejected with HTTP 405 Method Not Allowed (`Allow: GET, HEAD, OPTIONS`).
- **Endpoint Prefix Allowlist**: Restricted allowed paths via `isAllowedTmdbPath` to known prefixes used by Streamflix (`movie/`, `tv/`, `trending/`, `discover/`, `search/`, `genre/`, `person/`, `collection/`, `configuration`). Arbitrary TMDB endpoints (e.g. `account`, `authentication`, `credit`) and directory traversal sequences are rejected with HTTP 403 Forbidden.
- **Edge & Browser Caching**: Added Cloudflare Edge Cache integration via `caches.default` with `X-Cache: HIT / MISS` indicators, and response header `Cache-Control: public, max-age=3600, s-maxage=14400, stale-while-revalidate=86400`. Cloudflare CDN serves identical requests at the edge for 4 hours without invoking Pages Functions or upstream TMDB.
- **Unit Tested**: Covered by 13 unit tests in [`functions/api/tmdb-gateway.test.js`](functions/api/tmdb-gateway.test.js).


---

## Consolidated priority (all findings)

| # | Finding | Category | Effort | Why this position |
|---|---|---|---|---|
| 1 | Mount `ErrorBoundary` + `lazyRetry` (finding 3) | Reliability | Small | The component already exists. Prevents a permanent white screen on any render throw or chunk-load failure, on every device. |
| 2 | Lock down `/popular_this_week` with `.validate` rules, then move writes server-side (finding 5) | Security | Small (rules) / Medium (server) | The only unconditional write in the ruleset. Skip the `auth != null` stopgap: anonymous auth makes it ineffective. |
| 3 | Tighten `ALLOWED_MEDIA_HOSTS` and stop following redirects (finding 7) | Security | Small | An active open relay. Removing `.workers.dev` closes most of it. |
| 4 | Delete `/api/proxy` (finding 2); restrict CORS and paths on `[[path]].js` (finding 8) | Security | Small | Deletion plus two dead music call sites. A CORS/path allowlist protects the TMDB token and the Functions budget. |
| 5 | "Not playing? Try another server" prompt (finding 6) | Reliability | Medium | Biggest user-visible reliability win, contained to `Watch.jsx`. A timer plus a prompt, because there's no playback signal to clear a watchdog. |
| 6 | Memoize the `HoverPreviewContext` value (finding 4) | Speed | One line | No behaviour change, but **desktop/mouse only**. It doesn't help touch devices. |
| 7 | Defer the Firebase SDK (finding 1) | Speed | Medium–Large | Unblocks React's first render. Touches about 17 synchronous call sites and auth timing, and saves almost nothing on transfer since every visitor needs Firebase after mount. |

**Quick wins that can ship independently:**

- Console stripping in the production build (finding 6 secondary): 26 live calls.
- `srcSet` / `width` / `height` / `decoding="async"` on card images (finding 4 secondary). This one *does* help low-end touch devices.
- A shared `fetchWithTimeout` for the ~21 active client files (finding 3 related).
- Stop running the top-10 query and cleanup from the `Watch.jsx` instance of `usePopularTracking` (finding 5).

**Deferred:** CSS route-splitting (finding 1 secondary). It's the biggest refactor, and its payoff is capped by the existing 3 s CSS-gate ceiling.

---

## Method

- Static analysis over the whole tree. No application code was modified.
- Bundle figures come from the existing `dist/` build (built 2026-09-28 13:56, three commits before `222959d`), not estimates.
- Firebase CDN sizes were measured live with `curl` against gstatic: raw body size and gzip transfer size.
- Rule permissiveness was found by walking the parsed `database.rules.json` for boolean `.read`/`.write` values, not by reading excerpts.
- Each claim that something is absent ("never imported", "no middleware", "no secrets committed", "no `onError` on the player", "no `message` listener in Watch", "no failover affordance") was checked with an explicit tree-wide grep or git history query, as noted inline.
- Round 2 excluded `src/pages/music/`, `src/components/music/`, `src/lib/music/`, `src/hooks/music/`, and `src/contexts/Music*` as dead code, because their routes are commented out in `App.jsx`. Counts that include music code say so explicitly.

### Caveats

- Re-render counts in finding 4 are derived from consumer counts and state transitions, not a React Profiler trace. The mechanism is certain, and it applies only when `(hover: hover) and (pointer: fine)` matches. The exact cost per hover on a given device was not measured.
- The image over-fetch ratios in finding 4's secondary assume typical phone card-slot widths. Direction and rough size are reliable; exact savings depend on the breakpoints chosen.
- Finding 6 relies on standard browser behaviour (cross-origin iframes fire `load` on error pages). It was not tested against these specific stream hosts.
- Finding 2(a)'s "no internal SSRF" assessment relies on Cloudflare Workers' documented network model, not on a live probe.
- `<img>` attribute counts come from a regex over JSX and may be off by ±1 for multi-line tags.

---

## Revision log

Corrections made after re-verifying the first draft against the code:

| Area | First draft said | Verified reality |
|---|---|---|
| F1 | Signed-out visitors download 432 KB "for nothing" | Every visitor is signed in anonymously at mount, and RTDB is read on the homepage. The benefit is unblocking first render, not avoiding the download. |
| F1 | Firebase "competes with hydration" | There's no hydration. The deferred Firebase scripts run *before* `main.jsx`, so they delay React's start. |
| F1 | Fix touches `AuthProvider` + `GlobalChat` | About 17 synchronous `initFirebase()` call sites, plus `window.firebase` reads in `firebase.js:84-87` and `AuthContext.jsx:176-177`. `storage()` is called unconditionally. |
| F1 secondary | Time-to-content serialized behind all 284 KB | A 3 s CSS-gate ceiling (`index.html:408`) and a 6 s fallback cap the wait. |
| F1 secondary | 184 KB / 217 KB / 420 KB; 185 / 42 keyword matches | 179.9 / 212.2 / 411 KiB (the first draft mixed decimal and binary units); 188 / 38 matches. |
| F2 | Internal SSRF to `127.0.0.1`, `169.254.169.254` | Workers can't reach private networks or a metadata endpoint. The impact is open relay, memory, and origin laundering. |
| F2 | `.gitignore:242` | `.gitignore:243` (plus lines 22-27). |
| F3 | ErrorBoundary is "written and tested" | Written, not tested. There's no test file. |
| F3 | `registerType: 'prompt'` causes stale-chunk 404s | Workbox precaches all JS and CSS, so an old SW serves old chunks consistently. The real risks are first visits, no-SW contexts, and long-lived tabs. |
| F3 related | 46 call sites use `AbortController` | 30 lines mention `AbortController`/`AbortSignal`. Of the 29 listed files, 6 are music, 1 is server-side, and 1 is a disabled route, leaving about 21 active. |
| F4 | "Immediately felt on every touch device" | The hover preview is gated to `(hover: hover) and (pointer: fine)`. Touch and TV devices are unaffected. |
| F4 | ~200 `MovieCard`s on 13 homepage rows | `MovieCard` isn't on the homepage. There are 8 hover-consuming rows, mostly mounted lazily, and the rows themselves are the consumers. |
| F4 | 8 `useCallback`s | 7. The 8th grep match was the import. |
| F5 | Open because tracking must work for signed-out viewers; `auth != null` is the fix | Everyone has an anonymous session, so `auth != null` gives almost no protection here or on `/reviews` and `/ratings`. Use `.validate` rules or move writes server-side. |
| F5 | Monotonic `+1` validate rule | It must also allow the first create, and it doesn't stop repeated scripted increments. |
| F5 confirmed | `purchase-adfree.js:255` rejects a "key"; `generate-adfree-keys` is uid-scoped | It rejects a PayPal *order*. `generate-adfree-keys` is admin-gated. |
| F5 confirmed | The media proxy has "a real host allowlist" | `.workers.dev` suffix match, so anyone can bypass it. Now **finding 7**. |
| F6 | `postMessage` listeners exist for embed progress; clear the watchdog on a playback signal | Watch.jsx has no `message` listener. A signal-cleared watchdog would always fire. Replaced with a timed, user-driven prompt. |
| F6 | No automatic failover anywhere | `DirectPlayer` has `onFallback` failover, but its only server is `disabled: true`. A manual server drawer exists. |
| F6 | Use `getFirstEnabledServerIndex` for the next server | That returns the *first* server. Use `findIndex(i > current && isServerEnabled(i, isAdFree))`. |
| F6 secondary | 69 console calls reach production | 69 built, but 43 are in never-loaded music chunks. 26 are live. |
| New | — | **Finding 7** (media proxy allowlist bypass) and **finding 8** (open TMDB relay with your token) added. |
