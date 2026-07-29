# The trust boundary: balance, bans, and anything else the client must not decide

The Firestore rules already enforce most of this. This file states the *invariant* the rules
are an implementation of, because rules are read one `match` block at a time and the intent
is easy to miss — and because the invariant also covers places rules don't reach.

## The invariant

> **The client is an input device and a renderer. It never decides.**
> Every value a user could profit from — credit balance, item ownership, streaks, step
> conversions, referral rewards, game outcomes, ban state — is computed and written **only**
> by server code (Cloud Functions or the SvelteKit server), never by the browser or the
> Android app.

The client may *read* these values to display them. It may *ask* for a change by calling a
function. It may never write the result.

## Why, concretely

Firebase's client SDK talks straight to Firestore. There is no application server in the
request path to sanity-check anything. So if a rule permits a client write, then anyone with
a browser console and the user's own credentials can write it — not a hypothetical attacker,
just a curious user with devtools open. "The UI only sends valid values" is not a control;
the UI is attacker-controlled code.

That means the difference between a working economy and a fully drained one is exactly the
set of `allow write` conditions in `firestore.rules`. Nothing else stands in the way.

The second reason is arithmetic integrity. A balance update must be read-modify-write under a
transaction, together with its audit trail and rate-limit bookkeeping. A client can't do that
atomically across documents, and two clients racing produce free credits.

## What this looks like in the rules

Denied to clients outright (`allow write: if false`) — server-only via the Admin SDK, which
bypasses rules entirely:

`stepper/*`, `stepper_idempotency/*`, `stepper_leaderboard/*`, `crash_games/*`, `locations/*`,
`rate_limits/*`, `2fa_codes/*`, `2fa_cleared/*`, `referrals/*`, `referral_codes/*`,
`referral_campaign/*`, `referral_idempotency/*`, `moderation_flags/*`, `moderation_queue/*`,
`telegram_moderation/**`, `global_chat` (create), `admins/*`.

Content collections are admin-writable, not user-writable: `shop_items`, `news`.

`users/{uid}` is the subtle one: the owner can write parts of their own profile, so any
economy field living there (`casino_credits`, `owned_items`, `daily_streak`,
`last_daily_bonus`, `equipped_*`, `isBanned`) must be **explicitly excluded** from what the
owner may set. When adding a field to the user document, decide which side of the boundary it
is on *before* writing the rule. Default to server-only.

## The corresponding rule in function code

Every `onCall` opens with the same ladder. It is not boilerplate — each line closes a
distinct hole:

```ts
if (request.app == undefined) throw new HttpsError('failed-precondition', 'App Check required.');
if (!request.auth)            throw new HttpsError('unauthenticated', 'Auth required.');
await assertNotBanned(request);        // takes request, not uid
assertEmailVerified(request.auth);
await checkGlobalRateLimit(uid, 'action', limit, windowMs);   // anything paying out
```

- **App Check** — the call came from our app, not curl.
- **auth** — there is a user.
- **assertNotBanned** — checks *both* the token claim and the live DB doc, because a ban
  applied after the token was minted isn't in the claim yet, and a revoked token isn't in the
  DB. Either alone is bypassable.
- **assertEmailVerified** — throwaway accounts can't farm.
- **checkGlobalRateLimit** — a transaction over `rate_limits/{uid}`; the only thing between a
  payout function and a scripted loop.

Randomness for anything with money or security attached comes from `crypto`
(`crypto.randomInt`, `crypto.randomBytes`), never `Math.random()`. This already caused one
real fix (2FA codes) — see `.jules/bolt.md`, 2024-05-30.

## Bans specifically

Ban state is enforced in three places on purpose, and all three are load-bearing:

1. `hooks.server.ts` — verifies the session cookie with `checkRevoked: true`, reads the user
   doc, redirects to `/banned`. Kills SSR access.
2. `+layout.svelte` — `beforeNavigate` cancel, as client-side belt-and-braces.
3. `assertNotBanned()` in every callable — the only one that actually protects data, since a
   banned user can skip the web app entirely and call functions directly.

Deleting (3) because (1) exists is a security regression, not a cleanup.

## Two independent definitions of "admin"

- Firestore rules: existence of an `admins/{uid}` document (`isSuperAdmin()` additionally
  requires `role == 'super_admin'`).
- SvelteKit server: the `ADMIN_UIDS` env var.

They are not synchronized by anything. Granting admin means updating **both**, or you get a
user who can open `/admin` but whose reads are denied (or worse, the reverse).

## Applying this to new work

Before adding any write path, ask: *if a user sent this request with arbitrary values, what
would they gain?* If the answer isn't "nothing", it belongs in a Cloud Function behind the
guard ladder. Adding a client write and a matching permissive rule is the failure mode this
file exists to prevent.
