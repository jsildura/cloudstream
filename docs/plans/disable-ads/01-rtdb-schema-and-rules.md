# Task 01: Firebase RTDB Schema And Security Rules

## Purpose

Add the database locations needed by the feature and ensure a browser client cannot create, modify, or delete an entitlement. This task must happen before the backend or React context because every later task depends on the data shape and security contract.

## Files

Modify:

- `database.rules.json`

Create:

- `tests/database/adfree.rules.test.js`

Read:

- `tests/database/helpers.js`
- `tests/database/database.rules.test.js`
- `database.rules.transitional.json`

## Data Contract

The backend writes:

```json
{
  "accounts": {
    "<uid>": {
      "adFree": {
        "keyHash": "<hex HMAC>",
        "activatedAt": 1720000000000,
        "method": "key",
        "orderId": "<optional PayPal order id>"
      }
    }
  },
  "adFreeKeys": {
    "<hash>": {
      "status": "available",
      "createdAt": 1720000000000,
      "createdBy": "<optional uid>"
    }
  },
  "adFreeOrders": {
    "<orderId>": {
      "uid": "<uid>",
      "keyHash": "<hash>",
      "completedAt": 1720000000000
    }
  }
}
```

The client may read only its own `accounts/<uid>/adFree`. The client may not read or write `adFreeKeys` or `adFreeOrders`.

## Critical Firebase Rule Detail

The current `accounts/$uid` node has an owner-level `.write`. Firebase rules are additive: a child rule cannot deny a write already allowed by a parent. Therefore, adding only this is insufficient:

```json
"adFree": { ".write": false }
```

The parent write condition must also require that the `adFree` value is unchanged:

```json
newData.child('adFree').val() === data.child('adFree').val()
```

This preserves existing profile writes while rejecting parent writes that add or change `adFree`.

## Implementation Steps

### Step 1: Add the parent invariant

In `database.rules.json`, update the `.write` under `accounts/$uid` by appending:

```text
&& newData.child('adFree').val() === data.child('adFree').val()
```

Keep the existing Google-provider and UID checks unchanged.

### Step 2: Add the `adFree` child

Under `accounts/$uid`, add:

```json
"adFree": {
  ".read": "auth != null && auth.token.firebase.sign_in_provider === 'google.com' && auth.uid === $uid",
  ".write": false,
  ".validate": "newData.hasChildren(['keyHash', 'activatedAt', 'method']) && newData.child('keyHash').isString() && newData.child('activatedAt').isNumber() && (newData.child('method').val() === 'key' || newData.child('method').val() === 'purchase')"
}
```

Do not add client write permissions. Admin REST writes bypass Firebase client rules.

### Step 3: Add server-only top-level nodes

Before the final closing brace under `rules`, add:

```json
"adFreeKeys": {
  ".read": false,
  ".write": false
},
"adFreeOrders": {
  ".read": false,
  ".write": false
}
```

### Step 4: Write rules tests

Follow the setup style in `tests/database/database.rules.test.js` and `tests/database/helpers.js`. Use fake Google-authenticated users; do not use production credentials.

Tests must cover:

- Owner Google user can read their own `accounts/<uid>/adFree`.
- Owner cannot read another user’s `adFree`.
- Owner cannot write `accounts/<uid>/adFree` directly.
- Owner cannot add `adFree` through a write to `accounts/<uid>`.
- Owner cannot change `adFree` through a parent update.
- Owner can still create/update a valid profile.
- Unauthenticated and anonymous users cannot read `adFree`.
- Clients cannot read or write `adFreeKeys`.
- Clients cannot read or write `adFreeOrders`.

### Step 5: Run the focused rules tests

Run:

```bash
npm run test:rules
```

Do not continue if existing profile tests fail because of the parent invariant. Fix the rule expression while preserving profile behavior.

## Completion Checklist

- [ ] `database.rules.json` is valid JSON.
- [ ] Existing profile writes still pass.
- [ ] All new entitlement/key/order denial tests pass.
- [ ] No service-account or production data was added to tests.

## Handoff To Task 02

Task 02 may use these paths and the entitlement shape. The backend still must use service-account REST credentials because client rules intentionally deny its writes.
