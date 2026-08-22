# Task 06: Settings UI And Navbar Integration

## Purpose

Give signed-in users a discoverable place to redeem keys, purchase ad-free, and view their current entitlement. Give admins a controlled in-app key-generation tool.

## Files

Create:

- `src/components/settings/AdFreeSettings.jsx`
- `src/components/settings/AdFreeSettings.test.jsx`

Modify:

- `src/components/Navbar.jsx`
- `src/styles/components.css`

## Existing Navbar Structure

The settings sidebar currently contains:

- `account`
- `profiles`
- `parental`
- `migration`
- `pin`

Add the new `adfree` tab for signed-in users. Use the existing `navbar-settings-nav-item`, panel, header, and close-button patterns. Do not create a new settings modal system.

## `AdFreeSettings` Props And Hooks

Component signature:

```jsx
<AdFreeSettings onClose={handleCloseSettings} />
```

Use:

- `useAdFree()` for state and actions.
- Existing toast context/pattern for success and error messages.
- `lucide-react` icons for Zap, Eye/EyeOff, Copy, Check, and close controls where appropriate.

## UI States

### State A: Signed-in, not activated

Render:

- Heading `Go Ad-Free`.
- Short description.
- Feature list: no smartlink popups, no native ad banner, no adblock modal, and no popunder after entitlement resolves.
- One-time price `$2.99 USD`.
- PayPal button container.
- Divider.
- Key input with `SFXAD-XXXXX-XXXXX-XXXXX` formatting.
- Password/text visibility toggle.
- Activate button.
- Loading and disabled states while redeeming or purchasing.

### State B: Activated

Render:

- `AD-FREE ACTIVE` status.
- Activation date formatted from `activatedAt`.
- Method `Purchase` or `Key`.
- Account-wide/cross-device explanation.
- No purchase controls that could suggest the entitlement can be bought twice.

### State C: Admin controls

If `isGlobalChatAdmin === true`, render in both State A and State B:

- Count selector/input from 1 through 25.
- Generate button.
- Loading/error state.
- Returned raw keys shown only in the current UI session.
- Copy button for each key.
- Never persist keys to localStorage or Firebase.

## PayPal Browser Integration

1. Read public `import.meta.env.VITE_PAYPAL_CLIENT_ID`.
2. When the settings panel opens or the component mounts, inject the PayPal SDK once if the client ID exists.
3. Include `currency=USD`.
4. Clean up only the script element owned by this component, or use a shared promise so repeated tab opens do not load duplicates.
5. `createOrder` must call `/api/create-adfree-order` through the context/API method and return the server `orderId`.
6. `onApprove` must call `purchaseAdFree(orderId)`.
7. Show success only after the RTDB listener reports `isAdFree`.
8. Display a useful non-secret error if the SDK cannot load.

## Navbar Changes

1. Import `Zap` from `lucide-react`.
2. Import `AdFreeSettings`.
3. Read `isSignedIn` from `useAuth()` as the existing Navbar does.
4. Insert the Ad-Free navigation item after the existing signed-in settings items, before or after Data Migration consistently.
5. Render the content view when `activeSettingsTab === 'adfree'`.
6. Ensure the tab disappears or becomes unreachable after sign-out.

## Styling

Add focused classes to `src/styles/components.css`. Follow existing settings styles rather than introducing a separate CSS file.

Required states:

- Desktop settings panel layout.
- Mobile settings panel layout inside the existing `max-width: 720px` media block.
- Disabled buttons and loading indicators.
- Long keys that do not overflow on narrow screens.
- Error and success messages with accessible contrast.
- Copy buttons with `aria-label` and visible copied feedback.

Avoid styling the page as nested cards. Use cards only for repeated feature/status groups, consistent with the existing settings design.

## Tests

Mock `useAdFree`, auth, toast, and PayPal SDK. Cover:

- Unsigned user does not see the Ad-Free tab.
- Signed-in user sees the tab.
- Not-activated state renders key and purchase controls.
- Activated state renders status and hides duplicate purchase controls.
- Admin controls appear only for admins.
- Count validation prevents values outside 1-25.
- Redeem button calls `redeemKey` with normalized input.
- PayPal `createOrder` calls the server endpoint.
- PayPal approval calls `purchaseAdFree`.
- Errors and loading states are visible.
- Copy button copies only the selected displayed key.

Run:

```bash
npm run test -- --run src/components/settings/AdFreeSettings.test.jsx
npm run test -- --run src/components/Navbar.test.jsx
npm run build
```

If `Navbar.test.jsx` does not exist, add a focused test or test the relevant existing Navbar test file; do not omit Navbar verification.

## Completion Checklist

- [ ] Unsigned users cannot see or open the Ad-Free tab.
- [ ] Signed-in users can redeem keys and start PayPal checkout.
- [ ] Activated users see account status and no duplicate purchase controls.
- [ ] Admins can generate and copy keys without persistence.
- [ ] Mobile and desktop settings layouts do not overflow.
- [ ] Focused settings and Navbar tests pass.
