# Known issues

Active, verified defects. Each entry: what, where, how it was verified, what to do.
Remove an entry when it's fixed — this file is only useful if it's true.

Last verified: **2026-07-30** (against the working tree, not against prod).

---

## 1. `oscillator.type = 'whitenoise'` — invalid oscillator type

**Where:** `src/lib/client/soundGenerator.ts:20`, in `generateSpinSound()`.

**What:** `'whitenoise'` is not a Web Audio `OscillatorType`. The valid values are `sine`,
`square`, `sawtooth`, `triangle`, `custom`. Assigning an invalid value to an enum-typed
attribute throws a `TypeError` in the browser, so `generateSpinSound()` cannot run at all.
White noise is not producible with `OscillatorNode` — it needs an `AudioBufferSourceNode`
filled with random samples (or an `AudioWorklet`).

**Verified:** `svelte-check` → `soundGenerator.ts 20:5 Type '"whitenoise"' is not assignable
to type 'OscillatorType'`.

**Severity today: dormant.** `grep` finds **no importers** of `soundGenerator.ts` anywhere in
`src/` — the module is entirely unreferenced (the app uses `$lib/client/audioManager` instead).
Nothing crashes right now.

**Do:** don't wire this module up without fixing the function first. If you need the spin
noise, generate a buffer of random samples and play it through the existing lowpass filter
chain; the rest of the function is fine. If nobody wants the sound, deleting the module is
also a legitimate resolution.

---

## 2. `/banned` page throws on load — missing `get` / `t` imports

**Where:** `src/routes/banned/+page.svelte:8`

```ts
const fullReason = data.reason || get(t)('banned.default_reason');
```

Neither `get` (from `svelte/store`) nor `t` (from `svelte-i18n`) is imported. This runs during
component initialization, so it's an immediate `ReferenceError` — the page is completely
broken, not degraded.

**Verified:** `svelte-check` → `banned/+page.svelte 8:39 Cannot find name 'get'` and
`8:43 Cannot find name 't'`.

**Why it matters more than it looks:** this is the page banned users are *forcibly redirected
to* by `hooks.server.ts`. A banned user hits a redirect to a page that throws. The fix is two
import lines, but note the page is server-rendered too, so `get(t)` must be safe during SSR —
prefer resolving the fallback string in `+page.server.ts`, or use the `$t` store in markup
instead of `get(t)` in the instance script.

---

## 3. `register` page uses `fade` / `slide` without importing them

**Where:** `src/routes/register/+page.svelte:312` (`transition:fade`) and `:314`
(`transition:slide`). The script imports `quintOut` from `svelte/easing` and `tweened` from
`svelte/motion`, but nothing from `svelte/transition`.

**Verified:** `svelte-check` → `register/+page.svelte 312:14 Cannot find name 'fade'`,
`314:68 Cannot find name 'slide'`.

**Do:** add `import { fade, slide } from 'svelte/transition';`. Check what the transition is
attached to before assuming it's cosmetic — lines 312–314 wrap a modal overlay, so a throw
here can take out the registration flow rather than just skipping an animation.

---

## 4. `mobileapp/*` read rules — NEEDS VERIFICATION, do not change blind

**Status: the originally reported problem is not present in the current file.** Recorded here
because the *verification* is still outstanding and the conclusion was reached unsoundly.

**What was reported:** a wildcard `match /mobileapp/{document=**}` with `allow read: if true`,
suspected of leaking beta-tester `email` + `android_id` through
`mobileapp/beta_stats/users/{uid}`.

**What is actually in `firestore.rules` today** — no wildcard; per-document rules, and the
sensitive path is already gated:

| Path | read |
| --- | --- |
| `mobileapp/config` | `if true` |
| `mobileapp/general/news/{newsId}` | `if true` |
| `mobileapp/feature_flags` | `if true` |
| `mobileapp/compatibility` | `if true` |
| `mobileapp/sticker_packs` | `if true` |
| `mobileapp/beta_stats/users/{userId}` | `if isAdmin() \|\| isOwner(userId)` |
| `mobileapp/beta_stats/users/{userId}/daily_stats/{date}` | `if isAdmin() \|\| isOwner(userId)` |

So `beta_stats` is owner-or-admin only. The remaining public documents are client config
(feature flags, compatibility matrix, sticker packs, news) — non-PII by design, and the
Android app reads several of them before sign-in, which is presumably why they're public.

**Why this is still open, and the methodology lesson:** the earlier "it's fine" conclusion
came from observing a **403**. That is not evidence about the rule. App Check runs *before*
rules and also returns 403, so a 403 could mean "App Check rejected the request" and tell you
nothing about `allow read`. Testing a rule requires a request that gets *past* App Check.

**To verify properly** — an authenticated request with a valid App Check token, as a user who
is neither the owner nor an admin, against `mobileapp/beta_stats/users/{someoneElseUid}`:

- Rules unit tests (`@firebase/rules-unit-testing`) against the emulator — App Check isn't in
  the path, so a `PERMISSION_DENIED` there is unambiguously the rule. Best option; no test
  harness for rules exists in this repo yet.
- Or the Rules Playground in the Firebase console (simulates auth, no App Check).

**Do not** loosen or tighten these rules based on a 403 alone, and do not narrow the public
config documents without checking with the Android side first — the app reads them
pre-authentication, so making them private breaks cold start. See the mobile section of
CLAUDE.md.

---

## 5. Uncommitted `firestore.rules` — the deployed state is unknown

`git diff` shows **+560 / −2** on `firestore.rules`: `HEAD` contains only a stub
(`users` with `allow read: if true`), while the entire ~570-line ruleset — every deny rule the
economy depends on, everything in `economy.md` — exists **only in the working tree**.

Consequences to keep in mind:

- Nothing in git tells you what is actually live in Firebase. Only `firebase deploy` history
  does. Don't infer the deployed rules from `HEAD` **or** from the working tree.
- A careless `git checkout -- firestore.rules` destroys the whole ruleset. Treat this file as
  unbacked work until it's committed.
- If the stub is what's deployed, `users` is world-readable and `list` is open — worth
  confirming early.

**Do:** confirm what's deployed before editing, and get this file committed.
