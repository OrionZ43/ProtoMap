# Known issues

Active, verified defects. Each entry: what, where, how it was verified, what to do.
Remove an entry when it's fixed — this file is only useful if it's true.

Last verified: **2026-09-11** for 1, 2, 4; **2026-10-21** for 3 and 5–7 (against the working
tree and, where stated, against prod).

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

## 2. `mobileapp/*` read rules — NEEDS VERIFICATION, do not change blind

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

## 3. `users/{userId}` update rule is a denylist; usernames aren't unique on create

**Where:** `firestore.rules`, `match /users/{userId}` — `serverOwnedUserFields()` and the
`create` rule.

**What:** Since 2026-10-20 the owner may change any field of their user document *except* the
43 server-owned ones. That closes every hole found that day, but it is still a denylist: a
field a function starts writing tomorrow is client-writable until someone adds it to the list.
The right shape is an allowlist (`affectedKeys().hasOnly([...])`), and it needs the full set of
fields the old Android app (`by.iposdev.protomap`) writes directly. Over the first 5 hours of
the Data Access log, clients changed only `fcmToken`; rare actions (blocking a user —
`blocked_uids`, beta and stepper consent flags) may not have shown up yet.

Separately, the `create` rule can't check that a username is unique or not reserved: the site
checks availability client-side, so a modified client can register with someone else's nickname,
or with Cyrillic, spaces and look-alike letters (the rule allows 3–20 characters of anything).
Since 2026-10-21 everything else agrees on one set of username rules — `checkUsername`,
`changeUsername`, the safety-net trigger and the site (`src/lib/utils/username.ts`): 4–20
characters of `[a-zA-Z0-9_]`, no reserved substrings.

**Verified:** Firebase Rules API (`projects.test`), 30 allow/deny cases against the live
ruleset `984e426d` — all pass; the same cases against the previous ruleset passed 11 of 30.

**Do:** After a week of Data Access logs (enabled 2026-10-20), list every field clients write
to `users/{uid}` — principal `service-779680752096@firebase-rules.iam.gserviceaccount.com`,
`request.writes[].updateMask.fieldPaths` — and switch the owner update rule to `hasOnly`.
`setInitialUsername` (live since 2026-10-21) creates the profile with a checked, unique
username; move the site's registration to it once the new app has proven it, and drop the
client `create` only after the old app is retired.

---

## 4. `audioManager` preloads ten sound files that aren't in the repo

**Where:** `src/lib/client/audioManager.ts:33-45` (the `soundFiles` map) and the
`preload: true` loop at line 56.

**What:** Every entry in `soundFiles` is instantiated as a `Howl` with `preload: true`
when the manager initializes, so the browser fetches all of them up front. Ten of the
paths have no file behind them:

`entercasino.mp3`, `vd_bgm.mp3`, `vd_win.mp3`, `vd_lose.mp3`, `vd_reload.mp3`,
`vd_shot_live.mp3`, `vd_shot_blank.mp3`, `vd_item_scanner.mp3`, `vd_item_generic.mp3`,
`vd_item_emp.mp3`


**Verified:** 2026-09-04, by logging every response with status ≥ 400 during an automated
browser pass over `/casino/*` (`scripts/showcase/capture.mjs`). Ten distinct 404s per
casino page load, repeated on each visit — Howler retries rather than caching the failure.

**Severity: cosmetic but noisy.** Nothing throws; Howler swallows the load error. The cost
is a burst of failed requests on every casino page and a console full of 404s, which buries
real errors when debugging — that is exactly how it was found.

**Do:** either add the files, or remove those entries from `soundFiles` (and the matching
members of the `SoundName` union) until the game that needs them ships. Don't set
`preload: false` as the fix — that only defers the same 404 to first play.

---

## 5. DM unread counter: the old app still writes dotted field names

**Where:** the old app (`by.iposdev.protomap`) increments `unreadCount.<uid>` with a dotted
key inside `set(…, merge)`, which creates a top-level field literally named
`unreadCount.<uid>`. The site writes the nested map since 2026-10-21; the counter it reads
(`unreadCount[uid]`) works for messages sent from the site and the new app.

**Verified:** 2026-10-21, 56 of 56 recent chats had stray dotted fields.

**Do:** once the old app is retired, delete the stray `unreadCount.*` fields from `chats`
(one script, backup first).

---

## 6. Map points the old app sent before 2026-10-21 may be raw GPS

**What:** the old app sent its points as manual (`isManual: true`), and raw GPS when its own
geocoder failed; manual points are stored as they are and shown on the public map. Since
2026-10-21 `addOrUpdateLocation` snaps every point from the old app (by its App Check app id)
to the district centre. Older points can't be told apart from manual points set on the site.

**Do:** nothing automatic is safe. If needed, ask the affected users to re-set their point, or
snap all points whose `city` came from a manual lookup — that would also move points people
placed by hand on purpose.

---

## 7. Low-risk guard gaps

`migrateExternalAvatar` and `getTelegramAuthCode` check only `request.auth` (no App Check, no
ban check). `send2FACode` and `verify2FACode` have no App Check; the code itself is the
protection there (5 digits, 3 attempts, 5 minutes, one per minute).
