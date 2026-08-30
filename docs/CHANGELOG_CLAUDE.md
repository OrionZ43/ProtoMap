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

## 2026-08-30 (2) — Перенос auth-обработчика на свой домен (подготовка)

**Зачем.** Два симптома одного корня: `auth/internal-error` в Firefox со строгой
приватностью и блокировка попапа. Оба из-за того, что iframe с
`protomap-1e1db.firebaseapp.com` для браузера — третья сторона: ему выдают
отдельное («разделённое») хранилище, и обмен между попапом и iframe рвётся.
Если authDomain совпадает с доменом сайта, проблема исчезает по определению.

**Проверено до начала, а не на веру.** Документация Vercel подтверждает, что
`destination` у `rewrites` может быть внешним URL и это именно проксирование,
с примером `{"source": "/proxy/:match*", "destination": "https://example.com/:match*"}`.
Предупреждение SvelteKit «не используйте vercel.json rewrites» к нашему случаю
не относится: оно про rewrites ВНУТРЬ приложения, где SvelteKit не видит
переписанный URL. У нас назначение внешнее, до SvelteKit запрос не доходит.

**Что сделано в коде.** Создан `vercel.json` с одним правилом:
`/__/auth/:path*` → `https://protomap-1e1db.firebaseapp.com/__/auth/:path*`.
Конфликтов нет: в `static/` и в роутах ничего на `__` не начинается.
Изменений в исходниках не потребовалось — `authDomain` читается из
`VITE_FIREBASE_AUTH_DOMAIN`, то есть переключается переменной окружения.

**Локальная разработка остаётся на старом домене** намеренно: Firebase строит
адрес обработчика как `https://<authDomain>/__/auth/handler` с захардкоженной
схемой `https`, поэтому `localhost:5173` по http в этой схеме не работает.

**Порядок выката (важен именно такой).**

1. Задеплоить `vercel.json`. Для пользователей ничего не меняется — authDomain
   пока прежний, правило просто лежит.
2. Открыть `https://proto-map.vercel.app/__/auth/iframe`. Отдалась страница
   Firebase — прокси работает. 404 — дальше не идти, разбираться с Host-хедером.
3. Google Cloud Console → OAuth-клиент → Authorized redirect URIs → добавить
   `https://proto-map.vercel.app/__/auth/handler`.
4. Vercel → `VITE_FIREBASE_AUTH_DOMAIN` = `proto-map.vercel.app` → передеплой.
5. Проверить вход: Chrome, Firefox обычный и строгий, Яндекс, приватное окно,
   плюс обычный вход по почте (сверху навёрнута кастомная 2FA).

Откат — вернуть переменную и передеплоить, около двух минут.

**Не проверено и проверяемо только после деплоя:** какой `Host` Vercel
отправляет на Firebase при внешнем rewrite. Если он форвардит наш домен вместо
домена назначения, Firebase Hosting не узнает проект и вернёт 404 — это и ловит
шаг 2. Поэтому шаг 2 обязателен и стоит ДО смены authDomain.

**Проверено локально.** `npm run build` проходит с `vercel.json` на месте,
`npm test` 85/85.

---

## 2026-08-30 — «Окно заблокировано» при входе через Google (только на проде)

**Симптом.** На `proto-map.vercel.app/register` и `/login` кнопка Google выдавала
«Окно заблокировано, разрешите всплывающие окна» в Firefox и Яндекс.Браузере.
На localhost не воспроизводилось никогда. Держалось несколько месяцев.

**Причина.** Firebase грузит gapi и cross-origin iframe с `authDomain`
(`protomap-1e1db.firebaseapp.com`) **только в момент вызова** `signInWithPopup` —
то есть уже внутри обработчика клика. Это сетевая работа до `window.open`,
и на холодном браузере она не укладывается в окно пользовательского жеста:
браузер видит `window.open` без свежего клика и блокирует его, а Firebase
рапортует `auth/popup-blocked`.

На localhost баг не виден потому, что у разработчика gapi и iframe давно в кэше
и поднимаются мгновенно. У обычного пользователя кэш пустой при каждом заходе —
отсюда «на проде всегда, локально никогда».

**Что сделано.** В `onMount` обеих страниц добавлен прогрев резолвера попапа:
`getRedirectResult(auth).catch(() => {})`. Это публичный способ инициализировать
тот же резолвер заранее, параллельно с прогревом App Check. К моменту клика
iframe уже поднят, `window.open` происходит сразу и в окно жеста укладывается.

Заодно удалён мёртвый блок из обоих обработчиков: повторный
`await getToken(appCheck)` перед `signInWithPopup`. Он был недостижим (кнопка
`disabled`, пока `!appCheckReady`), но представлял собой мину: при любом
изменении условия `disabled` этот `await` снова начал бы рвать цепочку жеста.

**Важно про getRedirectResult.** Вход через редирект в проекте не используется,
поэтому вызов всегда возвращает `null` и ничего не «съедает». Если когда-нибудь
появится `signInWithRedirect`, результат из этого прогрева придётся обрабатывать,
а не игнорировать — иначе он проглотит успешный вход.

**Проверено.** `npm test` 85/85, `npm run build` проходит, `svelte-check`
34 ошибки / 191 предупреждение — ровно как до правки, новых нет.

**Живьём не проверено:** нужен деплой и клик в Firefox/Яндексе с чистым кэшем
(обязательно приватное окно — иначе gapi уже в кэше и баг не воспроизведётся).

**Что это НЕ чинит.** Отдельная проблема того же узла: Firefox с Total Cookie
Protection и Safari с ITP выдают iframe с `firebaseapp.com` разделённое
хранилище, из-за чего вход падает с `auth/internal-error`. Прогрев тут не
поможет — лечится только переносом auth-обработчика на свой домен
(`vercel.json` rewrite `/__/auth/*` + `authDomain = proto-map.vercel.app`
+ redirect URI в Google Cloud). Отдельная задача, трогает боевой путь входа
и кастомную 2FA.

---

## 2026-08-02 (3) — Карта: «API KEY REQUIRED» поверх тайлов CARTO

**Симптом.** Внезапно на всей карте появилась надпись «API KEY REQUIRED» со ссылкой
на carto.com/basemaps/apikey. В репозитории ничего не менялось — это внешнее изменение
на стороне провайдера.

**Причина.** `mapLogic.ts` брал слой «Тёмная» с `basemaps.cartocdn.com/dark_all` без
ключа. CARTO закрыл анонимный доступ к базовым картам и теперь отдаёт такие тайлы
с водяным знаком. Накрыло всех, потому что это слой по умолчанию
(`savedLayerName = "Тёмная"`), а не только тех, кто выбрал его руками.

**Что сделано.** `mapLogic.ts` читает `VITE_CARTO_BASEMAP_KEY`:

- ключ есть — тёмные тайлы CARTO с `?key=`, с атрибуцией CARTO + OpenStreetMap
  (это условие бесплатного тарифа, а не украшение);
- ключа нет — слой «Тёмная» строится из OSM с CSS-фильтром `.map-dark`
  (добавлен в `app.css`) — тем же приёмом, что уже используют «Полночь»
  и «Синий неон». Без водяного знака и без падения сборки.

Заодно починена атрибуция всех слоёв: было `'© OSM'` без ссылки, стало
`© OpenStreetMap` со ссылкой на лицензию — это требование ODbL, а не вкусовщина.

**Проверено.** Сборка проходит в обоих режимах. Без ключа строки `cartocdn`
в клиентском бандле нет вообще (Vite подставляет `undefined` на сборке и
сворачивает ветку); с `VITE_CARTO_BASEMAP_KEY=TESTKEY123` в бандле лежит
`basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=TESTKEY123`.

**Что нужно от человека.** Запросить ключ на <https://carto.com/basemaps/apikey/>
(бесплатно, без очереди, лимит 5 млн тайлов/месяц) и положить его в `.env`
и в Vercel. Форма требует email и принятия T&C — это решение владельца проекта,
агент её не заполнял.

**Что остаётся открытым.**

- Растровые тайлы CARTO объявлены устаревающими; обновления данных для них могут
  остановить. Переезд на вектор — это уход с Leaflet на MapLibre, отдельная задача.
- Бесплатный тариф заявлен как non-commercial; если ProtoMap считать коммерческим,
  при выходе за лимит CARTO попросит коммерческое соглашение.
- **Мобильное приложение.** Если оно тоже тянет тайлы CARTO, водяной знак там тоже,
  а починка требует релиза через Google Play. Нужно спросить Дениса.

---

## 2026-08-02 (2) — `/messages` переведён в стиль виджета; починены раздутые аватарки

**Отменяет визуальную часть записи ниже.** «Радиоэфир» из предыдущей итерации не подошёл:
он читался как отдельный продукт, а не как ProtoMap. Новое требование — тот же стиль, что
у плавающего виджета сообщений (`ChatWidget` + `DMInbox`). Вынесенные общие компоненты при
этом полностью себя оправдали: перекраска делалась один раз, а получили её и страница,
и виджет.

**Баг: аватарки раздувались на всю строку (вкладка личек в виджете).**

Причина не в редизайне — баг давний. `src/styles/cosmetics.css` подключается как обычный
глобальный CSS и содержит правила вида:

```css
.frame_high_roller img { width: 100% !important; height: 100% !important; }
```

Такие же есть у `frame_ludoman`, `frame_anniversary`, `frame_alpha`. `DMInbox` вешал сырой
`frameId` прямо на обёртку аватарки (`<div class="avatar-wrap {frameId}">`), а у `.avatar-wrap`
были заданы только `position: relative; flex-shrink: 0` — без размеров. `!important` перебивал
скоупленные 42px картинки, и `100%` резолвился не в 42px, а в доступную ширину flex-строки.
В остальном приложении те же рамки висят на `.avatar-wrapper` (с «-er»), которому задано
`128px × 128px`, поэтому там всё было цело. Видно было только у владельцев этих рамок —
отсюда «у некоторых людей».

**Исправление:** размер аватарки теперь задаёт обёртка (`.avatar-wrap { width: 42px; height: 42px }`),
а картинка тянется на `100%`. Так глобальному `!important` есть от чего считать, и рамки
продолжают работать — их не пришлось отключать. Применено в `ChatList.svelte`, в шапке диалога
`DMInbox.svelte` и в шапке диалога на странице.

**Что изменено по дизайну.**

- `ChatList.svelte` — новый общий компонент списка диалогов (третий из обещанных). Теперь
  инбокс виджета и сайдбар страницы — буквально один компонент: строки с разделителями,
  аватар 42px, жёлтый акцент, красный бейдж непрочитанных.
- `MessageBubble.svelte` — перекрашен в идиому виджета: пузырь собеседника
  `rgba(31,41,55,0.7)` с рамкой `rgba(75,85,99,0.4)`, свой — жёлтая подсветка
  `rgba(252,238,10,0.08)`, радиус 12px. Убраны срезы `clip-path` и циановые полосы из
  «Радиоэфира». Циан остался только на прочитанных галочках — как было в виджете.
- `Composer.svelte` — поле `rgba(31,41,55,0.7)` с жёлтой рамкой в фокусе, кнопки 34px,
  жёлтая кнопка отправки. Индикатор записи вернулся к виджетному: три расходящихся кольца
  и квадратная кнопка стоп; таймер записи оставлен в плейсхолдере (`🔴 Запись... 0:12`).
- `StickerPicker.svelte` — фон и активный пак переведены на жёлтый акцент виджета.
- `routes/messages/+page.svelte` — переписан: две панели с рамкой `#30363d` и срезанными
  углами (`clip-path`, как у виджета), вкладки ЛИЧКИ/КАНАЛЫ в стиле виджетных вкладок,
  поиск, `ChatList` слева, шапка диалога + лента + `Composer` справа.
- `ContactRail.svelte` удалён, `freqFor()` удалён из `chatFormat.ts` — оба были только
  для «Радиоэфира».

**Что осталось от прошлой итерации намеренно.** Индикатор присутствия (зелёная точка на
аватарке в списке и «в сети» в шапке) — виджет его не показывает, но он дешёвый и полезный,
а в палитру попадает: тот же `#39ff14`, что и `[ ONLINE ]` в профиле. Убирается одной строкой,
если мешает.

**Проверено.** `npm test` — 85/85. `svelte-check` — 34 ошибки / 192 предупреждения против
базовых ~35/~198, в тронутых файлах диагностик нет. `npm run build` проходит.
`prettier --write` — только по новым и переписанным файлам.

**Живьём не проверял:** `/messages` и виджет требуют авторизации. Фикс аватарок проверен по
причине (глобальные `!important`-правила в `cosmetics.css` против обёртки без размеров),
а не наблюдением — на владельце рамки `frame_high_roller` стоит взглянуть глазами.

---

## 2026-08-02 — Редизайн `/messages` («Радиоэфир») и вынос общих компонентов чата

**Задача.** Страница личек выглядела «не в стиле проекта и скучно». Разобрал причины и
предложил три направления; выбран вариант «Радиоэфир» (переосмысление, а не перекраска)
плюс вынос общих компонентов, чтобы редизайн не пришлось писать дважды.

**Что было не так (диагноз, а не вкусовщина).**

1. **Половина подписей рисовалась системным Courier.** В `messages/+page.svelte` девять
   объявлений `font-family: 'Chakra Petch', monospace` стояли на русском тексте
   («// КАНАЛЫ СВЯЗИ», «Личные», «КАНАЛ НЕ ВЫБРАН», «Сегодня», «печатает…»). У Chakra Petch
   нет кириллицы (subsets: latin, latin-ext, thai, vietnamese) — весь русский текст падал в
   моноширинный фолбэк ОС. Ровно эта же ошибка была найдена и исправлена ранее в
   `mobile-beta/+page.svelte:404`, но в чат фикс не доехал.
2. **Ни одного фирменного приёма проекта:** нет срезов `clip-path`, сетки на фоне, свечений —
   только скруглённые прямоугольники, то есть геометрия дефолтного мессенджера.
3. **Цвет присутствовал номинально** — границы `rgba(255,255,255,0.06–0.08)`, свои и чужие
   пузыри различались 7% против 14% прозрачности.
4. **Присутствие не показывалось вообще**, хотя `presence.ts` в проекте есть и профиль
   рисует `[ ONLINE ]`.
5. **Две независимые реализации личек** — страница на `dmStore` и `DMInbox.svelte` (914 строк)
   на локальном состоянии, с разошедшейся разметкой пузыря (в виджете была кнопка
   «копировать», на странице — ленивая загрузка волны голосового).

**Что сделано.**

Новые общие сущности:

- `src/lib/utils/chatFormat.ts` — форматирование времени/дат, реакции, `avatarFor`,
  `previewFor`, `freqFor(uid)` (детерминированная «частота» 87.50–108.00 МГц из uid).
- `src/lib/components/chat/MessageBubble.svelte` — единый рендер сообщения всех типов;
  собрал лучшее из обеих копий (копирование текста из виджета + ленивый декод волны со
  страницы).
- `src/lib/components/chat/Composer.svelte` — панель ввода; запись микрофона внутри,
  наружу отдаёт готовый `Blob`. Компонент презентационный, в Firestore не пишет —
  запись осталась у потребителей, потому что слои данных у них разные.
- `src/lib/components/chat/StickerPicker.svelte` — общий стикер-пикер.
- `src/lib/components/chat/ContactRail.svelte` — стойка контактов 88px, разворот при
  наведении / `:focus-within` / по кнопке-пину; на ≤768px всегда развёрнута как master-вид.
- `watchUserPresence()` в `src/lib/client/presence.ts` — чтение чужого `status/{uid}`.

Изменено:

- `src/routes/messages/+page.svelte` переписан: рейл + «эфир», шапка с частотой и волной
  вместо «печатает…», индикатор в эфире / вне эфира, голосовые во всю ширину пузыря,
  ударная волна по фону на новое сообщение, заглушка «поиск сигнала».
- `DMInbox.svelte` переведён на `MessageBubble` / `Composer`; удалено ~210 строк
  дублирующей разметки и ~60 строк мёртвого CSS. Слой данных намеренно не трогал —
  см. «Что осталось».
- `VoiceMessage.svelte` — добавлен режим `wide`; цвета выровнены с пузырями
  (свои жёлтые, чужие циановые — раньше было наоборот).
- Шрифты: в `app.css` заведены `--font-display` (Russo One, кириллица есть),
  `--font-tech` (Chakra Petch — только латиница и цифры), `--font-body`. Кириллические
  подписи переведены на `--font-display` в чате, `ChatWidget`, `GlobalChat`, `ChannelsFeed`.

**Два бага, найденных попутно и исправленных.**

- `:global(body) { overflow: hidden }` в стилях роута: CSS роута в SvelteKit после навигации
  не выгружается, поэтому правило продолжало действовать на других страницах. Заменено на
  установку/восстановление `document.body.style.overflow` в `onMount`.
- `watchUserPresence` вызывается из реактивного блока, то есть во время рендера. Если `rtdb`
  оказывался заглушкой, `ref()` бросал — а исключение при рендере в Svelte разрушает всё
  дерево компонентов, то есть ложилась вся страница. Обёрнут в try/catch с no-op.
  Поймано тестом `messages.test.ts`, который ровно для этого класса багов и написан.

**Проверено.**

- `npm test` — 85/85 проходят (в том числе 17 сценариев «враждебных» сообщений).
- `npx svelte-check` — 34 ошибки / 192 предупреждения против базовых ~35/~198; в тронутых
  файлах диагностик нет.
- `prettier --write` только по новым файлам. По `DMInbox.svelte` и прочим правленым файлам
  намеренно не запускал: они в 4-пробельном стиле, а конфиг требует табов — прогон переписал
  бы файл целиком и похоронил реальный дифф.

**Что осталось и почему.**

- Слой данных всё ещё дублируется: страница живёт на `dmStore`, `DMInbox` — на локальном
  состоянии. Не объединял намеренно: `ChatWidget` смонтирован в корневом layout, то есть на
  `/messages` виджет и страница существуют одновременно, и общий модульный `activeChat`
  заставил бы их драться за одну подписку. Это отдельная задача с отдельной проверкой.
- Chakra Petch с кириллицей остался в `Navbar`, `Footer`, `SplashModal`, `CinematicLoader`,
  `LegalDocRenderer`, `LegalUpdateBanner`, `SettingsModal`, `casino/ArtifactSynthesis` и
  `u/[uid]/+page.svelte:747` («Был(а) в сети»). За пределы чата не лез — это отдельная
  задача по типографике всего сайта.

**Мобильного приложения не касается:** изменения чисто фронтендовые, схема Firestore/RTDB,
регионы и сигнатуры функций не тронуты.

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
