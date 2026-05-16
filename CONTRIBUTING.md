# Contributing — Cash Counter

This guide is for developers joining the Cash Counter project. Read it fully before writing any code.

---

## Before You Start

1. Read `README.md` for project overview and setup
2. Read `ARCHITECTURE.md` for data model and system design
3. Get access to: GitHub repo, Vercel (staging project only), Firebase (staging project only)
4. Never get access to production Vercel or Firebase until you've shipped at least 3 reviewed PRs on staging

---

## Branch Naming

```
feat/short-description       # New feature
fix/short-description        # Bug fix
chore/short-description      # Cleanup, deps, config
docs/short-description       # Documentation only
```

Examples:
```
feat/export-to-excel
fix/budget-date-filter
chore/update-firebase-sdk
```

---

## Commit Messages

Use this format:
```
type: short description (max 72 chars)
```

Types: `feat` `fix` `chore` `docs` `refactor` `test`

Examples:
```
feat: add bank account disconnect confirmation modal
fix: prevent negative amounts in entry form
chore: upgrade firebase-admin to 13.x
```

---

## Workflow

```bash
# 1. Always start from the latest staging
git checkout staging
git pull

# 2. Create your feature branch
git checkout -b feat/your-feature

# 3. Make changes, commit regularly
git add .
git commit -m "feat: description"

# 4. Push and open a PR into staging (not main)
git push -u origin feat/your-feature
```

Open a Pull Request on GitHub from your branch into `staging`. Never open a PR directly into `main`.

---

## Code Standards

### React / Frontend

- All components live in `src/App.jsx` — this is a deliberate architectural choice for this project size. Do not split into separate files without discussion.
- Use inline styles (React style objects) — no CSS files, no CSS modules, no Tailwind.
- State management is React hooks only — no Redux, no Zustand.
- Never use `localStorage` for financial data — Firestore only.
- Always use the existing colour variables: `#205361` (brand) and `#5CB1CB` (accent).

### API Functions

- All files in `api/` must be CommonJS (`module.exports`, `require`) — ES modules will break Vercel.
- Every endpoint must verify the Firebase ID token before doing anything.
- Every endpoint that touches user data must confirm the token UID matches the requested UID.
- Use the named Firebase Admin app pattern — never `admin.app()` or `admin.apps.length`.
- Always wrap the main handler in the `cors()` middleware.

### Firestore

- Store dates as `YYYY-MM-DD` strings — never `toISOString()` which shifts timezone.
- Never write to `users/{uid}/settings/plan` from client SDK — Admin SDK only.
- Entry amounts are stored in the main currency unit (₦) as a float — not in kobo.
- Mono transaction amounts come from Mono in kobo — divide by 100 before storing.

---

## Testing on Staging

All testing happens on the staging environment:

- URL: `ledgerbook-staging.vercel.app`
- Firebase: `ledgerbook-staging` project
- Paystack: test mode keys (`pk_test_` / `sk_test_`)
- Mono: test or live keys depending on what's being tested

**To test Paystack payments:** use Paystack test cards from their documentation — do not use real cards on staging.

**To test Mono:** use the test bank credentials from Mono's sandbox guide, or link a real account if the staging Mono keys are live.

---

## Things That Will Break the App

These are known gotchas — read carefully:

1. **`api/package.json` must stay `{"type":"commonjs"}`** — removing this breaks all API functions.
2. **Firebase env vars must have `VITE_` prefix** to be available in the React bundle. Without it, the variable is undefined at runtime.
3. **Firebase Admin SDK naming** — always use `apps.find(a => a.name === "cashcounter")` not `apps.length`. Multiple functions can share a Node process.
4. **Date storage** — always store `selectedDate` (a plain string) not `new Date(selectedDate).toISOString()`. The ISO conversion shifts dates back one day for Nigerian users.
5. **Plan writes from client** — Firestore rules block client writes to the plan document. Route all plan changes through Admin SDK API endpoints.
6. **Mono transaction IDs** — do not deduplicate by `monoTxId`. Mono live API returns different IDs for the same transaction on each call. Use `date + amount + narration` fingerprint instead.
7. **Vercel function limit** — Hobby plan allows max 12 serverless functions. Current count is ~10. Do not add new API files without consolidating or upgrading to Pro.

---

## Getting Help

Contact Oluwasegun Akinnusi (founder) at v.bookenterprise@gmail.com for:
- Access to production credentials
- Architecture decisions
- Paystack or Mono account questions
- Firestore rules changes
