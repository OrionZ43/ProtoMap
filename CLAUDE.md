# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ProtoMap — an interactive map / social site for the protogen community (SvelteKit + Firebase, cyberpunk theme). Frontend deploys to Vercel (`proto-map.vercel.app`), backend is Firebase project `protomap-1e1db`.

**Code and UI strings are in Russian.** Comments, `console.log` prefixes, error messages returned to users, and modal copy are all Russian — match that when editing existing files.

## Team & communication style

You're working directly with **Orion/Denis** — project lead and web developer (SvelteKit,
Cloud Functions, Firebase). He's the only one prompting you in these sessions.

Other **Denis**(similar names) builds the Android app in a separate repository, against the same Firebase
backend. He's not part of these sessions, but changes here can silently break his app —
see "Related repository: Android app" below for specifics. Before changing anything
shared (Firestore schema, Cloud Functions regions or signatures, RTDB structure), flag
that it also touches mobile, so Orion can loop Denis in — don't assume it's fine just
because the web side works.

Be direct — no flattery, no softening a wrong call to avoid friction. If something in
the existing code is broken, fragile, or a bad pattern, say so plainly instead of working
around it quietly. Explain *why*, in plain language, not just *what*.

Prefer real fixes over patches. If the honest fix is bigger than a quick workaround,
say that explicitly and let Orion choose — don't silently pick the easy patch and call
it done. A workaround is acceptable only when you name it as one and explain what it's
deferring.

Respond in Russian.

## Commands

```bash
npm run dev                  # vite dev server (localhost:5173)
npm run build                # production build
npm test                     # vitest run (47 tests, 4 files — all passing)
npm run check                # svelte-check
npm run lint                 # prettier --check . && eslint .
npm run format               # prettier --write . — see warning below

npx vitest run src/lib/utils/markdown.test.ts    # single file
npx vitest run -t "renderMarkdown"               # single test by name
```

Cloud Functions live in `functions/` with their own `package.json`, tsconfig, and ESLint config (google style, 2-space indent, double quotes — different from the root config):

```bash
npm --prefix functions run build     # tsc → functions/lib (currently clean)
firebase deploy --only functions     # runs the build as predeploy hook
firebase deploy --only firestore:rules
npm --prefix functions run logs
```

### Lint/check baseline — important

The repo does **not** pass its own lint or check gates: `npm run check` reports ~35 errors / ~198 warnings, `prettier --check` flags 142 files, `eslint .` reports ~396 errors (mostly `no-explicit-any`). These are pre-existing. Consequences:

- Do not run `npm run format` repo-wide — it rewrites 142 files and buries the real diff. Format only files you touched.
- Existing source uses 4-space indent while `.prettierrc` specifies tabs. Match the surrounding file, not the config.
- When checking your work, compare against this baseline rather than expecting zero errors.
- `vitest --reporter=basic` no longer exists in Vitest 4; use the default reporter.

## Architecture

### Two backends, both privileged

1. **SvelteKit server** (`src/lib/server/firebase.admin.ts`) — `firebase-admin` initialized from the `PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY` env var. Falls back to a dummy app so builds don't crash without secrets. Used by `hooks.server.ts`, `+page.server.ts` loads, and `src/routes/api/*`.
2. **Firebase Cloud Functions** (`functions/src/`) — all game/economy/moderation logic. `setGlobalOptions({ region: 'europe-west1' })` in `index.ts`; sub-modules are re-exported from there (`telegramBot`, `stepper`, `referralFunctions`, `twoFactorAuth`).

Client code must import the shared, region-pinned instance: `import { functions } from '$lib/firebase'`. A local `getFunctions()` defaults to us-central1 and silently breaks calls — `codemod.mjs` exists to strip such declarations (`node codemod.mjs --dry` to preview).

### Auth: client SDK + server session cookie

`src/lib/stores.ts` runs a module-level `onAuthStateChanged` that is the single source of truth for `userStore`. On login it POSTs the ID token to `/api/auth`, which mints a 5-day `__session` cookie. `hooks.server.ts` verifies that cookie on **every** request (with `checkRevoked: true`), reads the user doc, and fills `event.locals.user`; any verification failure deletes the cookie and redirects to `/login` (401 for `/api/*`).

Bans are enforced in three places, deliberately: `hooks.server.ts` (redirect to `/banned`), `+layout.svelte` (`beforeNavigate` cancel), and `assertNotBanned()` in Cloud Functions (checks both the token claim and the DB doc).

`/login` and `/register` are explicitly exempted from session sync and from the store's sign-out path — the 2FA flow needs Firebase to authenticate the user *before* the code is entered. Regex checks on `window.location.pathname` in `stores.ts` implement this; breaking them breaks login.

### 2FA is custom, not Firebase MFA

Codes are generated with `crypto.randomInt` in `functions/src/twoFactorAuth.ts` and delivered via Telegram. Three interlocking pieces:

- `localStorage` key `2fa_passed_<uid>` — gates `userStore.set()` in `stores.ts` so the UI never flashes an authenticated state before the code is entered.
- Firestore `2fa_cleared/{uid}` — server-side proof with a 5-minute window, checked and deleted by `POST /api/auth` before it will issue a session cookie.
- After setting the flag, use a hard `window.location.href` navigation rather than `goto()` so stores re-initialize and the server sees the cookie.

### Cloud Function conventions

Every `onCall` opens with the same guard ladder — keep it when adding functions:

```ts
if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');
await assertNotBanned(request);      // takes request, not uid
assertEmailVerified(request.auth);
await checkGlobalRateLimit(uid, 'action', limit, windowMs);   // sensitive ops only
```

App Check uses ReCaptcha Enterprise, initialized in `src/lib/firebase.ts` (token pre-warmed on load; debug token enabled in dev). `onRequest` functions set `cors: false` and do CORS by hand via `handleCors` against `ALLOWED_ORIGINS` (`localhost:5173` + the Vercel domain).

### Firestore rules are the security model

`firestore.rules` (~25KB, sectioned with emoji headers) denies client writes to essentially all game, economy, and moderation collections — `stepper`, `crash_games`, `locations`, `rate_limits`, `2fa_codes`, `2fa_cleared`, `referral_*`, `moderation_*` are `allow write: if false`; `global_chat` is read-only to clients. **Mutations must go through Cloud Functions** (the Admin SDK bypasses rules). Adding a feature that writes from the client will be rejected at the rules layer by design. Content collections (`shop_items`, `news`) are the exception — admin-writable.

Admin identity is defined **twice** and both must be updated together:
- Rules: existence of an `admins/{uid}` doc (`isSuperAdmin()` additionally checks `role == 'super_admin'`).
- SvelteKit: the `ADMIN_UIDS` env var (comma-separated), read in `src/routes/admin/+layout.server.ts` and `src/routes/+layout.server.ts`.

### Map

`src/routes/+page.svelte` dynamically imports `$lib/client/mapLogic` inside `onMount` — Leaflet is browser-only and is excluded from `optimizeDeps` in `svelte.config.js`. Marker data comes from the `getLocations` HTTP function, which serves a JSON blob cached for 24h in the `system/map_cache` document (rebuilt on miss by batching user lookups in chunks of 30). Location privacy is intentional: coordinates are snapped to a district centroid and offset by `secureJitter()` (crypto-backed), never stored precisely.

`mapLogic.ts` builds popups as raw HTML strings — anything interpolated goes through `escapeHtml`.

### Stores and UI

- `src/lib/stores.ts` — `userStore` (auth + profile, live `onSnapshot`) and `chat`.
- `src/lib/stores/` — `dmStore`, `dmCache`, `usernameCache`, `stickerStore`, `settingsStore`, `modalStore`.
- **Use the `modal` store instead of `alert`/`confirm`** — it provides `.info/.success/.error/.warning/.confirm/.report` and renders through `Modal.svelte` mounted in the root layout.
- Components are written in **Svelte 4 idiom** (`export let`, `on:click`, `$:`) running on the Svelte 5 runtime — do not introduce runes into existing components.
- `NeonButton` takes its label via slot, not a `text` prop.

### Presence and realtime

RTDB (`europe-west1` instance, exported as `rtdb` from `$lib/firebase`) backs presence (`$lib/client/presence.ts`) and realtime game state. Two RTDB gotchas that have already caused bugs:

- RTDB does not store empty arrays — a drained array comes back `undefined`. Always default with `|| []` after `snapshot.val()`, on both client and function side.
- Unsubscribe from both the data ref **and** the `.info/connected` ref, or connections leak.

For animations driven by an RTDB event queue, keep a local "visual state" that only advances inside the animation loop; subscribing reactive state directly to the store spoils outcomes before the animation finishes.

### i18n and seasonal theming

`svelte-i18n`, initialized by importing `$lib/i18n` in the root layout. Default locale `ru`, plus `en`; locale resolves from `?lang=` → `localStorage.protomap_lang` → navigator. On April 1 the `ru` registration swaps to `locales/ru_april.json`.

`+layout.svelte` picks a seasonal theme from the current date and dynamically imports the matching stylesheet from `src/styles/` (halloween, winter, newyear, anniversary). Themes are date-gated in code, so changing windows means editing `initSeasonalTheme()`.

### Other subsystems

- **Telegram bot** (`functions/src/telegramBot.ts`, ~70KB) — Telegraf webhook for community moderation, account linking, and captcha. Webhook authenticity via `TG_WEBHOOK_SECRET`; verification deep links HMAC-signed with `TG_VERIFY_HMAC_SECRET`. Also hosts `monitorClaudeStatus` (scheduled). Chat allowlist is hardcoded (`ALLOWED_CHATS`).
- **Legal docs** — XML sources parsed server-side by `src/lib/server/legalLoader.ts` into typed nodes, rendered by `LegalDocRenderer.svelte`; versions live in `system/licenses` and drive `LegalUpdateBanner`.
- **Avatars** — uploaded through the `uploadAvatar` function to Cloudinary, moderated with Google Cloud Vision; Google profile pictures are migrated by `migrateExternalAvatar` after validating the host against an exact `*.googleusercontent.com` allowlist.
- **Markdown** — `src/lib/utils/markdown.ts` (marked + DOMPurify). Register `DOMPurify.addHook` at module scope only; calling it inside the render function duplicates hooks and leaks memory.
- **Profile routes** — `/u/[uid]` is canonical; `/profile/[username]` is the legacy username-based route.

### `.jules/bolt.md`

A running log of hard-won lessons (in Russian), each entry pairing a bug with its rule. Worth reading before touching 2FA, RTDB, or DOMPurify code; the recurring items are folded into the sections above.

## Where to log work

**After each significant task: write the chronological entry (date, what, why, how verified) to `docs/CHANGELOG_CLAUDE.md`, and add a one-line entry to `.jules/bolt.md` only if the task produced a new generalizable rule** — `bolt.md` stays a deduplicated bug→rule digest in its existing `**Урок:** / **Действие:**` format, not a work history. Rationale is recorded at the top of `docs/CHANGELOG_CLAUDE.md`.

## Detailed rules in `.claude/rules/`

Not auto-loaded — read the relevant file when the task touches its area:

- **`.claude/rules/firebase.md`** — deploy commands, the region split and how it breaks, both secret stores and which name lives where.
- **`.claude/rules/economy.md`** — the client-never-decides invariant behind the Firestore deny rules, the `onCall` guard ladder line by line, why bans are enforced three times.
- **`.claude/rules/known-issues.md`** — active verified defects (`soundGenerator.ts` invalid oscillator type, `/banned` missing imports, `register` missing transitions), plus the `mobileapp/*` read rules that still need proper verification and the uncommitted `firestore.rules`.

## Related repository: Android app

A separate Kotlin/Jetpack Compose repository (`by.iposdev.protomap`, owned by Denis)
shares this project's Firebase backend — same Firestore, RTDB, and Cloud Functions.
Modules: `app`, `admin` (on-demand dynamic feature gated by a signature-level permission),
`wearos`.

**Do not assume it updates automatically.** It's on its own release cadence through
Google Play review. Specifically:

- The mobile client pins a Cloud Functions region explicitly on its side. When migrating
  or removing functions from a region, coordinate with Denis first — deleting an old-region
  function before the mobile release using it has shipped breaks the app for everyone
  who hasn't updated.
- Mobile calls the same `onCall` functions for game logic (`playSlotMachine`, `playCoinFlip`,
  `startCrashGame`, etc.) rather than writing balance client-side — same trust boundary
  as the web client.
- The Android client writes some documents directly to Firestore that this repo doesn't
  produce: `auth_logs/{androidId}` and `mobileapp/beta_stats/users/{uid}` (telemetry/auth
  logging). Keep this in mind when reasoning about "who writes what" — those writers live
  in the other repo, not here.
- Before changing shared Firestore/RTDB schema (field names, collection structure),
  confirm with Denis that mobile doesn't depend on the old shape.

## Environment

Root `.env` (gitignored): `VITE_FIREBASE_*` (client config), `VITE_RECAPTCHA_SITE_KEY`, `PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string), `ADMIN_UIDS`, `TELEGRAM_BOT_TOKEN`.

Cloud Functions read from their own runtime config: `CLOUDINARY_*`, `GEMINI_API_KEY`, `NOMINATIM_USER_AGENT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TG_VERIFY_HMAC_SECRET`, `TG_WEBHOOK_SECRET`.

Firestore is in `europe-central2`; Functions and RTDB are in `europe-west1`. Functions target Node 22.
