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

`firestore.indexes.json` is an export of prod (`firebase firestore:indexes`), not a hand-written
list. Indexes and TTL policies have been created in the console before, and until 2026-09-11 the
file was missing 5 composite indexes and 2 TTL policies. A deploy without `--force` leaves extra
prod indexes alone; **with `--force` it deletes everything not in the file** — chat lists, news
and referral ranking would break, and message TTL would stop. Re-export before any `--force`.

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

### Подложка «Тёмная»: OpenFreeMap

Слой «Тёмная» (он же слой по умолчанию) рисуется из **векторных** тайлов OpenFreeMap
(схема OpenMapTiles, данные OSM): MapLibre внутри Leaflet, плагин
`@maplibre/maplibre-gl-leaflet`. Ключа и лимита запросов нет.

- **Стиль** — `src/lib/client/darkMatterStyle.json`: Dark Matter GL от CARTO, перекрашенный
  под их растр `dark_all` до 01.10.2026, подписи из `name:ru`, номера домов с зума 18, метро
  и вокзалы с 13-го, места с 16-го. Остальные слои («Стандартная», «Полночь», «Синий неон»)
  — растр OSM с CSS-фильтрами.
- **Шрифты** — с сервера OpenFreeMap. Там есть только `Noto Sans Regular`, `Noto Sans Bold`
  и `Noto Sans Italic`, и составные наборы через запятую он не склеивает: в `text-font` —
  ровно один из этих трёх.
- **Точка** у подписей городов и станций — своя картинка, `static/map/sprite*`. MapLibre
  нужен полный адрес спрайта, его собирает `mapLogic.ts` из `location.origin`.
- **Атрибуция** «OpenFreeMap © OpenMapTiles © OpenStreetMap» обязательна. Не убирать
  `customAttribution` в `mapLogic.ts`.
- **Сборки раз в неделю.** `tiles.openfreemap.org/planet` (TileJSON, кэш час) каждый раз
  отдаёт адрес тайлов с датой сборки, тайлы под ним кэшируются надолго. После новой сборки
  браузер качает тайлы заново.
- **Вес.** Стартовый вид (зум 4) — около 5 МБ тайлов и 0,2 МБ шрифтов, MapLibre — около
  0,34 МБ в gzip вместе с картой. На мелких зумах тайл тяжёлый: в нём названия примерно на
  80 языках. Вблизи тайлы лёгкие.
- **Без WebGL 2** — OSM с CSS-фильтром `.map-dark`.
- **Предел зума** Leaflet берёт только у тайловых слоёв, поэтому `mapLogic.ts` ставит
  `map.setMaxZoom` при каждой смене подложки. Без этого у векторного слоя зум бесконечный,
  а markercluster падает с «Map has no maxZoom specified».
- **Границы районов** (`admin_level` 6) в тайлах OpenMapTiles есть только с зума 10.
- **`maplibre-gl` — ветка 5.x.** С 6.0 пакет только ESM, воркер грузится отдельным файлом,
  а стиль-спека строже к старому синтаксису (`stops`, старые фильтры), на котором написан
  стиль. Переход на 6 — отдельная задача с проверкой стиля на всех зумах.
- **Мобильное приложение свой базовый слой держит у себя.** Если оно тянет растр CARTO, там
  видна их новая отрисовка с 01.10.2026; починить можно только релизом через Google Play.

Почему не CARTO. В августе 2026 их растр без ключа стал отдаваться с водяным знаком
«API KEY REQUIRED», с 1 октября `dark_all` перерисован заново (ETag тайлов
`martin-20261001-02`: синеватое море, толстые границы, полые подписи), а их векторные
данные собраны 15.12.2025 — в центре Минска около 5 % магазинов уже не те. В репозитории
при этом не менялось ничего.

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
