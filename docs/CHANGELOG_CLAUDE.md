# Claude Code — work log

Chronological history of significant tasks: date, what changed, why, how it was verified.
Newest first.

## Why this file exists separately from `.jules/bolt.md`

`.jules/bolt.md` is a previous agent's **bug → rule digest**. Every entry is a
`**Урок:** / **Действие:**` pair distilled to a durable rule, and it's read the way you read a
checklist: *before* touching 2FA, RTDB, or DOMPurify, to find out what not to break. Its value
comes from being short and deduplicated.

That's a different artifact from a work history. A history needs scope, files touched, what was
verified, and what was deliberately left alone — the kind of detail that makes a digest
unreadable. Appending task narratives to `bolt.md` would degrade both: the checklist gets noisy,
and the history gets cramped into someone else's format.

So the split is:

- **`.jules/bolt.md`** — append **only** when a task yields a new generalizable rule, in its
  existing `## date -[Title] **Урок:** … **Действие:** …` format. Keep entries one-liners.
  Don't reformat or restructure existing entries; it's another agent's artifact.
- **`docs/CHANGELOG_CLAUDE.md`** (this file) — the chronological record. Every significant task
  gets an entry, whether or not it produced a rule. Cross-reference `bolt.md` when both apply.

---

## 2026-07-30 — Opening a DM froze the tab (the actual cause)

**Supersedes the diagnosis in the entry below.** That entry fixed real crashes, but it did not
explain the reported symptom. The user then clarified: the tab **hangs** (unresponsive), it
doesn't error out. Different failure class — a blocked main thread, not an exception.

**Root cause.** `bind:this={messagesWindow}` compiles, in legacy mode, to a `mutable_source`.
Assigning to a **property** of such a variable is treated by Svelte as mutating the variable
itself, so `messagesWindow.scrollTop = ...` compiled to:

```js
$.mutate(messagesWindow, $.get(messagesWindow).scrollTop = $.get(messagesWindow).scrollHeight);
```

`messagesWindow` was also a declared dependency of the very reactive block doing the write:

```js
$.legacy_pre_effect(
  () => ($messages(), $.get(messagesWindow), $activeChat(), tick, $.get(forceScroll), $.get(atBottom)),
  () => { ... tick().then(() => { $.mutate(messagesWindow, ...) }) }
);
```

So: block runs → `tick().then` → `$.mutate` invalidates `messagesWindow` → block is dirty →
flush → block runs. Measured at **~20 000 iterations/second**.

Three properties made this pathological to find, and explain why it survived months:

1. `mutable_source` invalidates on **any** mutation, whether or not the value changed. The
   container wasn't even scrollable (`scrollHeight === clientHeight === 729`, `scrollTop` stayed
   0) — the DOM write was a no-op, yet still re-triggered the loop.
2. The re-trigger goes through a microtask, so each pass is a **new** update cycle rather than a
   deeper one. Svelte's `effect_update_depth_exceeded` guard never fires and **nothing is logged**.
3. It only reproduces with a chat open, because `messagesWindow` is bound only inside the
   chat view — before that, the `&& messagesWindow` guard is false. That is the exact
   "list fine / chat fatal" asymmetry that was reported.

**How it was found:** temporary instrumentation counting executions of the reactive block and
`onListScroll`. The counters showed `onListScroll=0` with `block=22092/sec`, which killed the
scroll-feedback hypothesis, and the paused call stack
(`run_micro_tasks → flush → process_fn → update_effect → update_reaction → untrack → block`)
placed the loop inside Svelte's own flush. Compiling the component and reading the generated
`legacy_pre_effect` made the cause unambiguous. Guessing had failed twice before this.

**Fixed:**
- Added `src/lib/utils/scroll.ts` — `scrollToBottom(el)` / `distanceFromBottom(el)`. Passing the
  node as an **argument** is a read (`$.get`), so no `$.mutate` is emitted and the cycle is
  impossible by construction. The rationale is documented in the file.
- Converted all 8 scroll sites: `messages/+page.svelte` (the live loop), plus `DMInbox.svelte`
  (2), `GlobalChat.svelte` (2), `ChannelsFeed.svelte` (3). Those seven weren't looping — no
  reactive block reads their container — but the pattern was armed: adding one `$:` that reads
  `messagesWindow` would have reproduced the same fatal hang.

**Verified:**
- `npm test` → **85 passed / 8 files**. New `src/lib/utils/scroll.test.ts`.
- Confirmed the guard works by reinstating the direct write and watching the test fail.
- `svelte-check` → 34 errors / 198 warnings, unchanged from the post-fix baseline.

**Note on the regression test:** it is a **compile-time** test — it compiles each chat component
and asserts the output contains no `$.mutate(<container>)`. A runtime test cannot cover this: the
loop blocks the thread, so the test would *hang* rather than fail, which is worse than a red test
in CI. Two lessons were baked into the test itself after it misfired during development: strip
whole-line comments before scanning (the compiler preserves comments, and ours describe
`$.mutate` in prose), and don't assert on `mutable_source` — once the variable is only read,
Svelte stops emitting it, so that assertion was checking an implementation detail.

**Process note:** I twice reported a confident diagnosis that didn't match the symptom, having
read "падает"/"ложится" as "throws". The reproduction only came from instrumenting the running
app. jsdom was a dead end here — no layout engine — and two of my harness attempts produced
artifacts (a synchronously-firing `IntersectionObserver`, an overridden `globalThis.fetch` that
broke Vite's module runner) rather than the bug.

---

## 2026-07-30 — Opening a DM took down the whole site (crashes; partial diagnosis)

**Symptom (production):** the dialog list opened normally, but entering any specific chat killed
the entire page — not an error confined to the chat, the whole layout went down.

**Root cause — two defects that compound.**

*The trigger, in the snapshot mapper.* Both DM mappers normalized `createdAt` like this:

```ts
createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date()
```

Optional chaining guards `null`/`undefined` only. When `createdAt` is a **number** (epoch
millis, which is what a Kotlin client writing `System.currentTimeMillis()` produces) or an
**ISO string** (legacy documents), `.toDate` is `undefined` and calling it throws
`TypeError: data.createdAt?.toDate is not a function`. The throw happens inside `Array.map`, so
**one** bad document discards the entire snapshot — no message renders and the listener dies.
The Android app is a first-class writer to `chats/{id}/messages` (the code already accommodates
its `TEXT`/`voice` casing and base64 AAC payloads), so foreign shapes are expected, not exotic.

*The amplifier, in the render path.* Functions called from the chat markup threw on incomplete
messages — `Object.keys(msg.reactions)` when the field is absent, and
`isSameDay(msg.createdAt, …)` when the date is absent. In Svelte an exception during render
tears down the **entire component tree**, and `DMInbox` lives inside `ChatWidget` in the root
layout. That is the mechanism that converted a chat-level data problem into "the whole site
falls over": the list only touches fields with safe defaults, so it rendered fine; opening a
chat rendered messages and died.

**Fixed:**

- Added `src/lib/utils/firestoreDate.ts` — `toJsDate()` coerces Timestamp / `Date` / epoch
  millis / ISO string / JSON-serialised `{seconds}` to a valid `Date`, and returns `null`
  instead of throwing on anything else.
- `src/lib/stores/dmStore.ts` and `src/lib/components/chat/DMInbox.svelte` (each has its own
  duplicate mapper) now use `toJsDate` for `createdAt` and `lastMessageTimestamp`, and coerce
  `reactions` / `read_by` to real dictionaries via an `isPlainMap` guard.
- Made every markup-called helper total in `src/routes/messages/+page.svelte` and `DMInbox.svelte`:
  `fmt`, `fmtDate`, `isSameDay`, `dayLabel`, `formatTime`, `formatDaySeparator`,
  `needsDaySeparator`, `formatLastSeen`, `countReactions`, plus a new `reactionCount()` replacing
  raw `Object.keys(msg.reactions)`.
- `src/lib/components/chat/GlobalChat.svelte:169` — `toLocaleDateString(get(locale))` threw
  `TypeError` whenever `svelte-i18n`'s locale store was still `null`; now `?? undefined`. Same
  class of layout-level killer, found while auditing the chat subsystem.

**Verified:**

- Reproduced both crashes before fixing, in a throwaway harness, then converted the harness into
  permanent regression tests. Confirmed the guard works by reverting one fix and watching the
  test fail.
- `npm test` → **78 passed / 7 files** (was 47/4). New: `src/lib/utils/firestoreDate.test.ts`,
  `src/lib/stores/dmStore.test.ts`, `src/routes/messages/messages.test.ts`.
- `svelte-check` → **34 errors / 198 warnings** in 36 files, down from the 35/198 in 37 files
  baseline (the GlobalChat error is gone); no new diagnostics in any touched file.

**Test infrastructure changed:** `vitest.config.ts` gained `resolve.conditions: ['browser']`
(without it `mount()` fails with `lifecycle_function_unavailable` and component tests are
impossible) and a `setupFiles` entry. New `src/test-setup.ts` stubs `Element.prototype.animate`
and `IntersectionObserver` — jsdom gaps, not app behaviour. All 47 pre-existing tests still pass
under the new config.

**Not done / open:** the exact production data shape was not confirmed — no prod access, so
whether the live trigger is epoch-millis timestamps, absent fields, or both is unverified. The
fix covers all of them, and the render path is now total, so any *future* malformed message
degrades a single bubble instead of the site. Left alone deliberately: the duplicated mapper and
message-rendering markup between `DMInbox.svelte` and `messages/+page.svelte` — genuinely worth
unifying, but out of scope for a production outage fix, and the duplication is why this bug
needed fixing twice.
