# Firebase: deploy, regions, secrets

Reference sheet — read before deploying, moving a function between regions, or touching secrets.
Not loaded every session; CLAUDE.md carries only the summary.

## Project layout

| Thing | Value |
| --- | --- |
| Firebase project | `protomap-1e1db` (`.firebaserc` default alias) |
| Firestore | `europe-central2`, database `(default)` |
| Cloud Functions | `europe-west1` (`setGlobalOptions` in `functions/src/index.ts`) |
| RTDB | `europe-west1` — URL hardcoded in `src/lib/firebase.ts` |
| Functions runtime | Node 22 (`functions/package.json` → `engines`) |
| Frontend host | Vercel (`proto-map.vercel.app`) |

The region split is deliberate but easy to break: Firestore sits in `europe-central2` while
Functions/RTDB are in `europe-west1`. Cross-region reads inside a function are normal here —
don't "fix" it by moving one side without checking the other.

## Deploy

```bash
npm --prefix functions run build          # tsc → functions/lib; run this first, it is the gate
firebase deploy --only functions          # build runs again as the predeploy hook
firebase deploy --only functions:playSlotMachine,functions:playCoinFlip   # single functions
firebase deploy --only firestore:rules
npm --prefix functions run logs
```

`functions/` has its own `package.json`, `tsconfig.json`, and `.eslintrc.js` (google style,
2-space indent, double quotes) — different from the root config. Lint/format the two trees
with their own tooling; never run the root Prettier over `functions/`.

`firebase.json` sets `predeploy: npm --prefix "$RESOURCE_DIR" run build`, so a TS error blocks
the deploy. That is the intended safety net — don't bypass it.

## Regions: the rule that actually bites

**Client code must import the shared instance:**

```ts
import { functions } from '$lib/firebase';   // already pinned to europe-west1
```

A bare `getFunctions(app)` defaults to `us-central1`. Calls then fail against a function that
only exists in `europe-west1`, and the failure looks like CORS/App Check noise rather than a
region mismatch — expensive to debug. `codemod.mjs` strips such local declarations
(`node codemod.mjs --dry` to preview). It deliberately skips `src/lib/firebase.ts` and any
call with an explicit region argument.

**Before deleting or moving a function out of a region, coordinate with the Android app.**
The mobile client pins its region independently and ships on Google Play's review cadence.
Removing an old-region function before the mobile release that stopped using it has rolled
out breaks the app for everyone who hasn't updated. See the mobile section in CLAUDE.md.

## Secrets

Two separate stores — a name existing in one says nothing about the other.

**SvelteKit / Vercel** — root `.env` locally, Vercel project env vars in prod:

| Var | Used by |
| --- | --- |
| `VITE_FIREBASE_*` | `src/lib/firebase.ts` (client config; `VITE_` = public by design) |
| `VITE_RECAPTCHA_SITE_KEY` | App Check site key (public) |
| `PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY` | `src/lib/server/firebase.admin.ts`, JSON string |
| `ADMIN_UIDS` | comma-separated, `+layout.server.ts` and `admin/+layout.server.ts` |
| `PRIVATE_TURNSTILE_SECRET_KEY`, `PRIVATE_TG_VERIFY_HMAC_SECRET` | `api/verify-chat/+server.ts` |
| `TELEGRAM_BOT_TOKEN` | server routes |

`$env/static/private` imports are resolved **at build time**. A missing var is a hard build
failure, not a runtime warning:

```
"PRIVATE_TG_VERIFY_HMAC_SECRET" is not exported by "virtual:env/static/private"
```

As of 2026-07-30 the local `.env` lacks `PRIVATE_TURNSTILE_SECRET_KEY` and
`PRIVATE_TG_VERIFY_HMAC_SECRET`, so `npm run build` fails locally while Vercel builds fine.
To type-check a build locally, pass throwaway values for that run only — do not commit them
into `.env`:

```bash
PRIVATE_TURNSTILE_SECRET_KEY=x PRIVATE_TG_VERIFY_HMAC_SECRET=x npm run build
```

**Cloud Functions** — its own runtime config, read via `process.env`:
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GEMINI_API_KEY`,
`NOMINATIM_USER_AGENT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TG_VERIFY_HMAC_SECRET`,
`TG_WEBHOOK_SECRET`.

Note `TG_VERIFY_HMAC_SECRET` (functions) and `PRIVATE_TG_VERIFY_HMAC_SECRET` (SvelteKit) are
the *same* secret under two names, because the two sides sign and verify the same Telegram
deep links. Rotating one without the other silently breaks chat verification.

## App Check

ReCaptcha Enterprise, initialized in `src/lib/firebase.ts`; the token is pre-warmed on load
so the first callable doesn't pay for the handshake. In dev,
`FIREBASE_APPCHECK_DEBUG_TOKEN = true` is set — register the printed debug token in the
Firebase console or every call fails locally.

Because App Check rejects before your code runs, a 403 in local testing is ambiguous: it may
be App Check, not the Firestore rule you were testing. See `known-issues.md` for why that
matters when verifying rules.
