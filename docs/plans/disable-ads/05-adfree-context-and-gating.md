# Task 05: AdFreeContext And Fail-Closed Client Gate

## Purpose

Expose the account entitlement to React and provide a small non-React utility for ad handlers. The important behavior is fail-closed: while auth or RTDB is unresolved, the client must not fire an ad.

## Files

Create:

- `src/contexts/AdFreeContext.jsx`
- `src/contexts/AdFreeContext.test.jsx`
- `src/utils/adGating.js`
- `src/utils/adGating.test.js`

Modify:

- `src/main.jsx`

## Context Interface

Export:

```js
export const useAdFree = () => useContext(AdFreeContext);
export function AdFreeProvider({ children });
```

Context value:

```js
{
  isAdFree: boolean,
  isAdFreeLoading: boolean,
  adFreeData: object | null,
  adFreeError: string | null,
  redeemKey: async (rawKey) => result,
  purchaseAdFree: async (orderId) => result,
  generateKeys: async (count) => result,
  clearAdFreeError: () => void
}
```

## Global Gate Contract

Use one global state value:

- `window.__STREAMFLIX_AD_STATE = 'pending'` during auth/entitlement resolution.
- `window.__STREAMFLIX_AD_STATE = 'ads'` for anonymous or resolved non-entitled users.
- `window.__STREAMFLIX_AD_STATE = 'adfree'` for a resolved entitled Google account.

Create:

```js
export function shouldSuppressAds() {
  return window.__STREAMFLIX_AD_STATE === 'adfree';
}

export function isAdGateReady() {
  return window.__STREAMFLIX_AD_STATE === 'ads' || window.__STREAMFLIX_AD_STATE === 'adfree';
}
```

## Provider Behavior

1. Start in loading/pending state.
2. Read `accountUser`, `isSignedIn`, and `isGlobalChatAdmin` from `useAuth()`.
3. If there is no Google account, detach any old listener, clear entitlement state, set gate to `ads`, and finish loading.
4. If there is an account, call `initFirebase().db.ref('accounts/<uid>/adFree')`.
5. Attach a named `value` listener. When the snapshot exists, set `isAdFree`, `adFreeData`, and gate state.
6. When the snapshot is absent, set `isAdFree: false`, `adFreeData: null`, and gate state `ads`.
7. Detach the exact handler with `.off('value', handler)` on UID change and unmount.
8. Clear any localStorage hint on sign-out. A localStorage value must never grant entitlement or change the initial pending state.
9. Set gate state before calling any popunder loader.

## API Methods

For every API method:

1. Confirm `accountUser` exists.
2. Call `accountUser.getIdToken()`.
3. Send `Authorization: Bearer <token>` and JSON content type.
4. Parse the JSON response.
5. Return a stable `{ ok, reason, message }` object instead of throwing raw fetch errors into UI.
6. Let the RTDB listener, not the POST response alone, become the source of truth for `isAdFree`.

Endpoints:

- `redeemKey` -> `/api/redeem-key`
- `purchaseAdFree` -> `/api/purchase-adfree`
- `generateKeys` -> `/api/generate-adfree-keys`

## Provider Placement

In `src/main.jsx`, place `AdFreeProvider` inside `AuthProvider` and outside `ProfileProvider`:

```jsx
<AuthProvider>
  <AdFreeProvider>
    <ProfileProvider>
      <ProfileDataProvider>
        <App />
      </ProfileDataProvider>
    </ProfileProvider>
  </AdFreeProvider>
</AuthProvider>
```

## Tests

Mock `useAuth`, `initFirebase`, RTDB refs, and `fetch`. Cover:

- Initial state is loading and gate is pending.
- Anonymous state becomes `ads`.
- Entitled snapshot becomes `adfree`.
- Missing snapshot becomes `ads`.
- Listener detaches on UID change and unmount.
- Stale listener cannot overwrite a newer account.
- API calls include the Firebase ID token.
- API errors become stable result objects.
- Global gate helper behavior for all three states.
- LocalStorage cannot make an account ad-free.

Run:

```bash
npm run test -- --run src/contexts/AdFreeContext.test.jsx src/utils/adGating.test.js
```

## Completion Checklist

- [ ] Context uses Firebase compat `.ref` API.
- [ ] Gate starts pending and fails closed.
- [ ] Listener cleanup is tested.
- [ ] Sign-out clears entitlement state.
- [ ] Main provider nesting compiles and tests pass.
