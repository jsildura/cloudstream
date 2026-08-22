# Task 07: Suppress Active Ads And Defer Popunder

## Purpose

Connect the ad gate to every active ad surface. This task must preserve normal behavior for anonymous and non-entitled users while ensuring ad-free users never receive the active ad surfaces.

## Files

Modify:

- `src/pages/Watch.jsx`
- `src/components/Modal.jsx`
- `src/components/BannerSlider.jsx`
- `src/components/HoverPreviewCard.jsx`
- `src/components/NativeAd.jsx`
- `src/components/AdblockModal.jsx`
- `index.html`

Create or modify focused tests for each touched behavior.

## Common Smartlink Rule

Import both helpers in every smartlink component:

```js
import { shouldSuppressAds, isAdGateReady } from '../utils/adGating';
```

For every smartlink handler:

- If `shouldSuppressAds()` is true, do not read or update ad cooldown storage and do not call `window.open`.
- If `isAdGateReady()` is false, fail closed: do not call `window.open`; continue the normal navigation action.
- If the state is `ads`, preserve the existing first-click grace and two-minute cooldown exactly.
- Normal navigation/play behavior must happen regardless of ad suppression.

Apply this to:

- `Watch.jsx` `skipAutoAdvance`.
- `Modal.jsx` `playButtonClick`.
- `BannerSlider.jsx` `handleWatchNow`.
- `HoverPreviewCard.jsx` `handleWatchNow`.

Do not change the existing ad URL or cooldown constants unless a test demonstrates a bug.

## NativeAd Rules

The existing component has `useEffect` and `useRef` hooks. Hook order must not change.

1. Call `useAdFree()` at the top.
2. Keep all hooks before any conditional return.
3. Add `isAdFree` to the effect dependency list.
4. Inside the effect, return before creating/inserting the Adsterra script when `isAdFree` is true.
5. Clean up an already-added script/container when transitioning to ad-free.
6. After hooks have run, return `null` when ad-free.
7. Render the existing native ad section for `ads` and while the gate is pending only if the product owner explicitly accepts that pending leakage. The recommended implementation is to hide it while pending until the entitlement is resolved.

The critical rule is: never conditionally skip a hook.

## AdblockModal Rules

Import both gate helpers. The modal must not show when:

- The user is ad-free.
- The gate is pending.
- It has been dismissed.
- Detection is incomplete.
- No adblock was detected.

For a resolved `ads` user, preserve the current desktop modal and TV banner behavior.

## Popunder Rules

The current `index.html` injects the popunder in the head before React mounts. Remove that immediate injection.

Replace it with a global loader function:

```js
window.__STREAMFLIX_LOAD_ADS__ = function () {
  if (window.__STREAMFLIX_AD_STATE !== 'ads') return;
  if (document.querySelector('script[data-streamflix-popunder]')) return;
  // Create the existing Adsterra script and mark it with data-streamflix-popunder.
};
```

Keep the existing TV/console user-agent guard. `AdFreeContext` calls the loader only after it sets the state to `ads`. It must not call the loader for `pending` or `adfree`.

Do not use localStorage as the authority. A newly used device may have no localStorage entry even though the Google account is ad-free.

Leave the separate popunder-window/splash detection logic around lines 302-315 unchanged.

## Tests

For every smartlink component, mock `window.open`, set each gate state, click the handler, and assert:

- `pending`: no popup, navigation still occurs.
- `adfree`: no popup, navigation still occurs.
- `ads`: existing first-click/cooldown behavior remains.

For NativeAd:

- Ad-free renders no section and inserts no script.
- Ads-enabled renders the existing section and inserts the script once.
- Transitioning to ad-free cleans up correctly.
- Hook-order errors do not occur during rerender.

For AdblockModal:

- Pending and ad-free users see no modal/banner.
- Ads-enabled blocked users retain existing behavior.

For `index.html`/popunder:

- Loader does nothing in `pending` and `adfree`.
- Loader inserts one script in `ads`.
- Repeated loader calls do not insert duplicates.
- TV/console browsers do not insert it.

Run the relevant existing tests plus new focused tests:

```bash
npm run test -- --run src/pages/Watch.kids.test.jsx
npm run test -- --run src/components/BannerSlider.test.jsx
npm run test -- --run src/components/AdblockModal.test.jsx
npm run test -- --run src/components/NativeAd.test.jsx
npm run build
```

Add missing tests rather than treating an absent test file as a pass.

## Completion Checklist

- [ ] All four smartlink handlers use the same tri-state behavior.
- [ ] NativeAd keeps hook order valid.
- [ ] Adblock detection is suppressed for pending/ad-free users.
- [ ] Popunder is deferred and deduplicated.
- [ ] Non-entitled users still receive ads after resolution.
