# Architecture — Cash Counter

## Overview

Cash Counter is a single-page React application hosted on Vercel. The backend is a set of serverless functions in the `api/` directory. Data is stored in Firebase Firestore. There is no traditional server — all state lives in Firestore and all business logic runs either in the React client or in Vercel serverless functions.

---

## Firebase Projects

Two completely separate Firebase projects are used:

| Project | ID | Purpose |
|---|---|---|
| Production | `ledgerbook-1db5d` | Live user data |
| Staging | `ledgerbook-staging` | Development and testing |

The frontend reads Firebase config from `VITE_FIREBASE_*` environment variables, with hardcoded production fallbacks in `src/firebase.js`. This means:
- Staging Vercel project → uses `ledgerbook-staging` (env vars set)
- Production Vercel project → falls back to `ledgerbook-1db5d` (hardcoded)

A third Firebase project `vbook-ninja` is used exclusively for the Ninja referral programme and is accessed only from `api/ninja.js`.

---

## Firestore Data Model

```
users/{uid}
  ├── name, email, businessName, industry, phone
  ├── onboarded, onboardedAt
  ├── entryCount, entryMonth        ← free tier counter
  │
  ├── entries/{entryId}
  │     ├── type (income|expense)
  │     ├── amount (in main currency unit, e.g. ₦)
  │     ├── category
  │     ├── date (YYYY-MM-DD string — NOT ISO timestamp)
  │     ├── note
  │     ├── source ("manual" or "mono")
  │     ├── monoTxId (stored for reference — NOT used for dedup)
  │     └── createdAt
  │
  ├── settings/prefs
  │     ├── businessName, tagline, logo
  │     ├── currency
  │     ├── incCats[] (income categories)
  │     └── expCats[] (expense categories)
  │
  ├── settings/plan
  │     ├── plan ("free" | "pro")
  │     ├── status ("active" | "expired" | "cancelled")
  │     ├── interval ("monthly" | "biannually" | "annually")
  │     ├── activatedAt, expiresAt, lastPaymentAt
  │     └── subscriptionCode (Paystack)
  │
  ├── settings/mono
  │     ├── accountId (Mono account ID)
  │     ├── accountName, accountNumber, bankName
  │     ├── balance, currency
  │     ├── connectedAt, lastSyncAt
  │     └── status
  │
  ├── budgets/{budgetId}
  │     ├── name, targetAmount
  │     ├── startDate, endDate
  │     └── category
  │
  └── notifications/{notifId}
        ├── type, title, body
        ├── read
        └── createdAt
```

### Critical data rules

- **Dates** are stored as plain `YYYY-MM-DD` strings — never ISO timestamps. Converting via `new Date().toISOString()` shifts Nigerian users (UTC+1) back by one hour, causing entries to appear on the wrong day.
- **entryCount** is incremented atomically via `runTransaction` — never two separate writes.
- **plan document** can only be written by the Firebase Admin SDK (server-side). Client-side writes to this document are blocked by Firestore rules.

---

## Firestore Security Rules

Key rules summary:

- Users can only read/write their own data (`isOwner`)
- The admin email (`v.bookenterprise@gmail.com`) can read/write anything (`isAdmin`)
- The `plan` document can only be written by Admin SDK — never by the client
- Budget creation requires Pro status (`isProUser`)
- Entry creation enforces the free tier limit (`withinFreeLimit`) and amount validation (`amount > 0`)
- All rule functions perform additional Firestore reads — this is intentional for security but adds to read costs

---

## API Functions

All API files are in `api/` and must be CommonJS format (enforced by `api/package.json`).

Every endpoint that modifies user data follows this pattern:
1. Verify Firebase ID token (`auth().verifyIdToken(idToken)`)
2. Confirm token UID matches the requested UID
3. Check business rules (Pro status, plan validity)
4. Write to Firestore via Admin SDK
5. Return result

### Firebase Admin SDK initialisation

All API files use the same named app pattern to avoid conflicts when functions share a Node.js process:

```js
if (!admin.apps.find(a => a.name === "cashcounter")) {
  admin.initializeApp({ credential: ... }, "cashcounter");
}
return admin.app("cashcounter").firestore();
```

**Never use `admin.apps.length` or `admin.app()` (default app)** — this causes conflicts when multiple functions run in the same process.

---

## Mono Bank Integration

Mono Connect (v2 API) allows Pro users to link their Nigerian bank account and auto-import transactions.

**Flow:**
1. User clicks "Connect Bank" → Mono Connect widget opens
2. User authenticates with their bank on Mono's platform
3. Mono returns a `code` to our `onSuccess` callback
4. Client calls `POST /api/mono` with `action: "exchange"` + the code + Firebase ID token
5. Server exchanges the code for an `accountId` via Mono v2 API
6. Account details saved to `users/{uid}/settings/mono`
7. User taps "Sync Now" → `POST /api/mono` with `action: "sync"`
8. Server fetches all transactions from Mono, filters to 120hrs before `lastSyncAt`
9. Deduplicates using `date + amount + narration` fingerprint (Mono IDs are unstable on live)
10. New transactions written as entries with `source: "mono"`

**Key Mono behaviour:**
- Transaction IDs (`id`) are NOT stable — the same transaction returns a different ID on each API call on live accounts. Never deduplicate by ID.
- Date filter params (`start`/`end`) behave inconsistently between sandbox and live. Filter locally instead.
- Live transactions can take up to 5 days to appear in the API — hence the 120hr overlap window.

---

## Payment Flow (Paystack)

1. User selects a plan in the Upgrade modal
2. Client calls `POST /api/paystack-init` with email, planCode, uid
3. Server validates plan code against known codes (live + test), calls Paystack API
4. Paystack returns an authorization URL
5. Client redirects user to Paystack checkout
6. After payment, Paystack redirects to `/subscription-success`
7. Paystack also fires a webhook to `/api/paystack-webhook`
8. Webhook verifies HMAC signature, updates `users/{uid}/settings/plan` via Admin SDK

**Plan codes:**

| Plan | Live | Test |
|---|---|---|
| Monthly | PLN_riztufvgcixap7k | PLN_gh2mcit6fixix9k |
| 6-Month | PLN_lr0mhzc8n3wa28h | PLN_gxtrrhn8z2tfqmf |
| Annual | PLN_cizrk6zouo32rjs | PLN_87ghrcbnb4p8aaa |

---

## Free Tier Enforcement

Free users are limited to 20 entries per calendar month. This is enforced at three levels:

1. **UI** — `atLimit` state prevents the Add Entry button from working
2. **Transaction** — `runTransaction` reads counter, checks limit, writes entry + increments counter atomically
3. **Firestore rules** — `withinFreeLimit()` function blocks writes even if the client is bypassed

The counter resets at the start of each calendar month via the `entryMonth` field (format: `YYYY-MM`).

---

## Admin Panel

Located at `/admin` (public/admin.html). Protected by Firebase Auth — only `v.bookenterprise@gmail.com` can access.

Features: user list, plan management, CSV export, manual subscription editor.

The admin panel writes directly to Firestore using the client SDK — this works because `isAdmin()` in Firestore rules allows writes from the admin email.
