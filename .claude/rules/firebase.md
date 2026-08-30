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
| `VITE_CARTO_BASEMAP_KEY` | `src/lib/client/mapLogic.ts` — ключ базовых карт CARTO (public by design) |

### authDomain и вход через Google

`authDomain` задаётся переменной `VITE_FIREBASE_AUTH_DOMAIN`, в коде он не
захардкожен. Значения РАЗНЫЕ по окружениям, и это сделано намеренно:

| Окружение | Значение | Почему |
| --- | --- | --- |
| Vercel (прод) | `proto-map.vercel.app` | iframe становится same-origin |
| Локально | `protomap-1e1db.firebaseapp.com` | см. ниже |

**Зачем свой домен.** Firebase вставляет в страницу невидимый iframe с
`<authDomain>/__/auth/iframe` и через него передаёт результат входа из попапа.
Пока authDomain чужой, браузеры со строгой приватностью (Firefox с Total Cookie
Protection, Safari с ITP) выдают этому iframe **разделённое** хранилище: попап
пишет результат в одну «банку», iframe читает из другой, вход падает с
`auth/internal-error`. Когда authDomain совпадает с доменом сайта, делить нечего.

Физически обработчик по-прежнему у Firebase — в `vercel.json` стоит rewrite
`/__/auth/:path*` → `https://protomap-1e1db.firebaseapp.com/__/auth/:path*`.
Это проксирование на стороне Vercel, браузер видит только наш домен.

**Почему локально остаётся старый домен.** Firebase строит адрес обработчика как
`https://<authDomain>/__/auth/handler` — схема `https` захардкожена. Для
`localhost:5173` по http это даёт нерабочий `https://localhost:5173/...`,
поэтому same-origin схема локально не собирается. В деве продолжаем ходить на
`firebaseapp.com`, а если Firefox рвёт вход — выключить щит для localhost.

**Что нельзя забыть при смене домена.** В Google Cloud Console у OAuth-клиента,
которым пользуется Firebase, в Authorized redirect URIs должен быть
`https://proto-map.vercel.app/__/auth/handler`. Без этой строки вход ляжет
у ВСЕХ, а не только в Firefox.

**Как проверить прокси, не трогая вход.** Открыть
`https://proto-map.vercel.app/__/auth/iframe` в браузере. Если отдаётся страница
Firebase, а не 404 — rewrite работает, и только после этого можно менять
`authDomain`. Откат — вернуть переменную и передеплоить.

### CARTO basemaps

Слой «Тёмная» (он же слой по умолчанию) берёт тайлы с `basemaps.cartocdn.com`. С 2026 года
CARTO требует API-ключ: без него тайлы отдаются с водяным знаком «API KEY REQUIRED»
поверх всей карты. Ключ бесплатный, без очереди на одобрение:
<https://carto.com/basemaps/apikey/>.

- Лимит — 5 млн запросов тайлов в календарный месяц, растр и вектор считаются вместе.
- Атрибуция CARTO **и** OpenStreetMap обязательна — это условие бесплатного тарифа.
  Не убирать из `attribution` в `mapLogic.ts`.
- Ключ уходит в URL тайла, то есть публичен по природе — отсюда префикс `VITE_`.
  Прятать его бессмысленно, но условия запрещают шарить его между несвязанными проектами.
- Без переменной сборка НЕ падает: `mapLogic.ts` переключается на OSM с CSS-фильтром
  `.map-dark`, и CARTO в бандл вообще не попадает (ветка сворачивается на сборке).
- Растровые тайлы CARTO объявлены устаревающими в пользу векторных; обновления данных
  для растра могут остановить. Переезд на вектор — это уход с растрового Leaflet
  на MapLibre, отдельная задача.
- **Мобильное приложение свой базовый слой держит у себя.** Если оно тоже тянет CARTO,
  то водяной знак там тоже, и починить его можно только релизом через Google Play.
  Координировать с Денисом.

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
