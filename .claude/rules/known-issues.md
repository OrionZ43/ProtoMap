# Known issues

Active, verified defects. Each entry: what, where, how it was verified, what to do.
Remove an entry when it's fixed — this file is only useful if it's true.

Last verified: **2026-09-11** for 2; **2026-10-21** for 3, 5–7 and 9 (against the working tree
and, where stated, against prod). Numbers are kept stable when an entry is removed — other
documents refer to them.

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

---

## 8. Channels: subscriber lists are visible to members

`subscriberUids` on `channels/{id}` and `channels/{id}/subscribers/*` are readable by any
signed-in user — who follows which channel is public to members. The site checks its own
subscription with `uid in subscriberUids`, so hiding the list needs a different shape (for
example, only `subscribers/{uid}` readable by its owner). Orion, 2026-10-21: leave as is for now.

---

## 9. `functions` lint can't run as configured

**Where:** `functions/package.json` (`"lint": "eslint --ext .js,.ts ."`), `functions/.eslintrc.js`,
root `eslint.config.js`.

**What:** `functions` has ESLint 8.57. It switches to flat config as soon as it finds an
`eslint.config.js` in any ancestor directory, and it finds the root one. That config loads the
root `@typescript-eslint` v8, which crashes under ESLint 8: `Error while loading rule
'@typescript-eslint/no-unused-expressions': Cannot read properties of undefined (reading
'allowShortCircuit')`. So `npm --prefix functions run lint` fails on every file and
`functions/.eslintrc.js` is never applied. The deploy gate is `tsc`, not lint, so nothing else
breaks.

**Workaround:** from `functions/`, `ESLINT_USE_FLAT_CONFIG=false npx eslint --ext .ts src/<file>.ts`
applies `.eslintrc.js`. On the whole tree that reports thousands of errors, mostly `indent` and
`quotes` in files written with 4 spaces and single quotes; `channelComments.ts` and `groups.ts`
are clean.

**Verified:** 2026-10-21.

**Do:** put `ESLINT_USE_FLAT_CONFIG=false` into the `lint` script (`cross-env` on Windows) or give
`functions` its own flat config; reformatting the tree, if wanted, is a separate isolated commit.
