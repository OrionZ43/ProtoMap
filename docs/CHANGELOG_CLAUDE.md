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

---

## 2026-09-03 — Приведение в соответствие с Законом РБ № 99-З (часть 1)

**Что:** реализована основная часть плана правового аудита (`docs/аудит/claude-code-prompt.md`,
полный отчёт — артефакт, 5 HIGH / 10 MEDIUM). Рабочий трекер со статусами, решениями и
открытыми вопросами — `docs/COMPLIANCE_99Z.md`; он же источник истины по тому, что осталось.

**Почему именно так, а не по букве постановки задачи.** В самой постановке нашлись три
фактические ошибки, и их пришлось исправить прежде, чем что-то делать:

1. Cloud Functions указаны в `europe-central2` — это регион Firestore, функции живут в
   `europe-west1`. Scheduled-функция ретеншена по букве задачи уехала бы в пустой регион.
2. Тексты v5 описывали архитектуру модуля `wearos`, выдавая её за телефонное приложение:
   `StepCounterService`, `WalkTrackingService`, `RECEIVE_BOOT_COMPLETED`, чтение шагов из
   Health Connect. В `app` нет ничего из этого — там `WalkSessionService` с
   `foregroundServiceType="location"`. Источником, судя по всему, был `mobile.xml` — дамп
   всего проекта, где модули неразличимы. Приложение уже сносили из Play за Health Connect,
   так что публикация этих текстов повторила бы ту же заявку.
3. Задача «добавить обжалование блокировок» подавалась как работа с нуля — кнопка на
   `/banned` уже существовала, не хватало только исключения для п. 2.3.

**Сделано:**

- **Тексты v5** — вычищен Health Connect (0 упоминаний), разрешения приведены к
  фактическому манифесту `app`, подставлены реквизиты оператора. Оба документа прогнаны
  через `fast-xml-parser` по логике `legalLoader.ts`: 150 и 118 узлов, все с парами `ru`/`en`.
- **`scripts/upload-legal-docs.mjs`** — заливка в `system/licenses`. Сухой прогон по
  умолчанию, валидация перед записью, отказ при незаполненных плейсхолдерах.
- **Экран согласия на регистрации** — разъяснение прав отдельным блоком (ч. 2 п. 5 ст. 5),
  четыре раздельных непредзаполненных чекбокса вместо одной галочки (п. 1 ст. 5). Согласия
  пишутся и на обычной регистрации, и через Google; при уходе на `signInWithRedirect`
  переносятся через `sessionStorage`, иначе проверку было бы физически не пройти.
- **`functions/src/consents.ts`** — серверный журнал согласий (п. 7 ст. 5). До этого
  единственным следом принятия документов был `localStorage`, то есть доказывать было нечем.
  Версию документа определяет сервер; записи неизменяемы; `deleteAccount` теперь обезличивает
  их, а не удаляет.
- **`functions/src/retention.ts`** — автоудаление по срокам из раздела 8 Политики.
  По умолчанию НИЧЕГО не удаляет, только считает и логирует; включается `RETENTION_APPLY=true`.
  Обрабатываются только коллекции с проверенной по коду схемой. `auth_logs` намеренно не
  трогается: там ПД лежат внутри массива `login_history`, и на этих данных admin-модуль
  строит детект нарушений.
- **Уборка** — удалены сломанные маршруты `/app-privacy` и `/app-terms` и 78 КБ мёртвых
  юридических текстов из трёх локалей; добавлены отсутствовавшие ключи `privacy_policy` и
  `terms_of_service` (страницы на них ссылались, в заголовке вкладки показывался сам ключ);
  «казино» → «мини-игры» в мета-описаниях.

**Найдено попутно, не входило в задачу:**

- **`assertNotBanned` был полным no-op в пяти функциях.** Вызывался как
  `assertNotBanned(uid)` — со строкой вместо `request` — в `toggleCommentLike`,
  `startCrashGame`, `synthesizeArtifact`, `playSlotMachine`, `playCoinFlip`. Обе проверки
  (клейм токена и запись в БД) читали поля несуществующего объекта и молча пропускались:
  забаненный пользователь мог играть в казино и синтезировать артефакты. Компилятор не
  видел ошибки, потому что параметр объявлен `any`. Исправлены вызовы, параметр
  типизирован — теперь такая передача не собирается. Это третий рубеж защиты из
  `.claude/rules/economy.md`, и он существовал только на бумаге.
- **`/banned` падала при загрузке** (`known-issues.md` № 2) и **модалка 2FA на регистрации
  падала** (`known-issues.md` № 3) — оба закрыты. Плюс утечка `setInterval` на `/banned`.

**Решение по возрасту.** Гейт 18+ на «The Glitch Pit» решено не делать и поле «дата
рождения» не заводить. Юридического требования 18+ нет: `purchaseShopItem` тратит только
ProtoCoins, платёжной интеграции и p2p-передачи нет, то есть триггеры Указа № 9 не
наступили — цифра была самоназначенной в собственном ToS. Дата рождения без реакции на неё
нарушает минимизацию (п. 5 ст. 4) и создаёт журнал записей, доказывающих, что оператор знал
возраст субъекта. Самодекларация галочкой «мне 16» имеет ту же силу и не сохраняет ПД.
Расхождение с Google Play закрывается наоборот: честно заполнить анкету IARC и полученный
рейтинг записать в документы.

**Проверено:**

- `npm --prefix functions run build` → чисто.
- `npm test` → **85 passed / 8 files**.
- `svelte-check` → в тронутых файлах (`register`, `banned`, `admin/users`) диагностик нет.
- Полная прод-сборка (`PRIVATE_TURNSTILE_SECRET_KEY=x PRIVATE_TG_VERIFY_HMAC_SECRET=x
  npm run build`) → `✓ built in 23.79s`.
- `node scripts/upload-legal-docs.mjs` → отбивает заливку по незаполненным `[ДАТА]`,
  как и задумано.

**Не сделано и почему:**

- **Ничего не развёрнуто.** Функции, правила и документы лежат в рабочем дереве.
  Команды деплоя — в конце `docs/COMPLIANCE_99Z.md`.
- **Дата вступления в силу не подставлена** — по п. 6.2 ToS не раньше чем через 10 дней от
  публикации, нужно решение Ориона. Пока стоят плейсхолдеры, и скрипт заливки на них ругается.
- **18+ из текста ToS не убрано** — решение принято, но текст правится после подтверждения
  возрастного рейтинга в Play Console.
- **Android-половина экрана согласия, чистка `login_history` в `auth_logs`, переход
  Android на `system/licenses`** — чужой репозиторий, за Денисом.
- `firestore.rules` по-прежнему не закоммичен целиком (`known-issues.md` № 5); правило для
  `consents` добавлено в тот же незакоммиченный файл.

### Дополнение того же дня — дата и возраст

Орион подтвердил дату вступления в силу (**14.09.2026**, понедельник) и назвал фактический
рейтинг приложения в Play — **ESRB Mature 17+**.

Даты подставлены в оба документа. По возрасту выяснилось, что чисел было три, разной природы,
и они путались между собой: **16** — норма п. 9 ст. 5 (до этого возраста согласие даёт
законный представитель), **17** — фактический рейтинг стора, **18** — самоназначенный гейт на
«The Glitch Pit». Ценз доступа приведён к 17 везде, 18 убрано, 16 осталось отдельным правовым
замечанием, а не ограничением доступа. Отдельного возрастного ограничения у «The Glitch Pit»
больше нет — раздел внутри приложения, которому рейтинг уже присвоен.

Идентификатор согласия переименован `age16` → `age_minimum`: число поменялось за один день,
а id уходит в журнал навсегда. Записей ещё нет, переименование бесплатное.

Оба документа проходят валидацию скрипта заливки; сухой прогон видит переход
privacy 4.1 → 5.0 (39 → 70 КБ) и tos 4.0 → 5.0 (34 → 52 КБ). **Не залито** — см. ниже.

**Почему документы не залиты автоматически.** Заливка делает новую редакцию видимой всем
пользователям и поднимает баннер повторного принятия. При этом сам аудит начинается с
оговорки: «Перед публичным релизом… текст правок нужно проверить у практикующего белорусского
юриста по IT-праву». Проверки не было. Решение о публикации юридических документов — не то,
что стоит принимать за автора, поэтому всё подготовлено, но команда `--apply` оставлена ему.

---

## 2026-09-03 — Бот: расшифровка голосовых и кружков

**Что:** `functions/src/telegramTranscribe.ts` + хендлеры в `telegramBot.ts`.
Голосовые и видеокружки расшифровываются автоматически; команда `/text` ответом на
сообщение делает то же по запросу.

**Только в личном чате Ориона** (`GAREM_CHAT_ID`), и это ограничение по приватности,
а не по квоте. Бесплатный тариф Gemini API подразумевает использование данных для
улучшения продуктов Google — то есть голосовое уезжает третьей стороне. В своём чате
Орион об этом знает и может предупредить участников; в чате ProtoMap люди такого не
ожидают и согласия не давали. Изначально я включил оба чата — Орион это отклонил,
и он прав. Ограничение снимется, когда расшифровка переедет на локальный whisper.

**Почему Gemini, а не Whisper:** `GEMINI_API_KEY` в проекте уже есть и уже используется
(перевод инцидентов Claude), модель принимает `audio/ogg` и `video/mp4` напрямую —
**ffmpeg не нужен**, перекодирования нет. Бесплатного лимита на объём личного чата хватает.
Отдельную инфраструктуру поднимать не потребовалось.

Модель вынесена в `GEMINI_TRANSCRIBE_MODEL` с дефолтом `gemini-3.1-flash` — намеренно НЕ
`flash-lite`, который используется для перевода: у облегчённых моделей набор модальностей
урезан и аудио принимается не всегда.

**Ограничения зашиты явно:** не длиннее 5 минут, не больше 18 МБ (Bot API не отдаёт файлы
крупнее 20 МБ). Голосовое весит около мегабайта на минуту, кружок ограничен минутой, так что
в норме до лимитов далеко — проверки нужны для пересланных длинных аудиофайлов.

**Поведение при ошибке разное и это намеренно:** автоматический режим молчит (иначе каждое
неразборчивое голосовое порождало бы сообщение об ошибке), явный `/text` объясняет причину —
человек ждёт ответа. Ответ уходит **без `parse_mode`**: в расшифровке произвольная речь, и
символы разметки либо сломают отправку, либо будут интерпретированы.

**Поймано при написании, до деплоя:** `bot.on('text')` не вызывает `next()` и обрывает цепочку
Telegraf. Команда `/text`, зарегистрированная после него, не сработала бы никогда — это же
причина, по которой все существующие команды объявлены выше. Блок перенесён.

**Проверено:** `npm --prefix functions run build` чисто, тесты 85/85. **Не развёрнуто.**

**Дальше по боту** (согласовано в переписке с Орионом и Денисом): реестр чатов и разбивка по
папкам, автокоммент под постами канала, приветствие в чате комментариев, качалка медиа
отдельным воркером на сервере Дениса (Fedora CoreOS, docker compose, `/mnt/storage/data/protomap-dl`,
SELinux-метки `:z` на всех bind-mount).

### Удалён мониторинг статуса Claude и рабочий чат

Орион договорился с директором — уведомления о статусе Claude переезжают на бота
работодателя. Из нашего бота убрано всё связанное:

- `monitorClaudeStatus` (scheduled, каждые 5 минут) и её экспорт из `index.ts`
- `translateIncidentsToRu` — перевод инцидентов через Gemini, использовался только там
- типы Statuspage API, `CLAUDE_STATUS_DOC_REF`
- `WORK_CHAT_ID` и ветка middleware, которая глушила в нём весь функционал
- неиспользуемый импорт `onSchedule`

`telegramBot.ts`: 1490 → 1076 строк. `ALLOWED_CHATS` теперь два чата вместо трёх.
`GEMINI_API_KEY` по-прежнему нужен — его использует расшифровка голосовых.

⚠️ **Функция остаётся развёрнутой в Firebase, пока её не удалить явно.** Убрать из кода
недостаточно: она продолжит запускаться по расписанию и слать в рабочий чат.

```bash
firebase functions:delete monitorClaudeStatus --region europe-west1
```

Документ `system/claude_status` в Firestore осиротеет — можно удалить руками, вреда от него нет.

---

## 2026-09-03 (вечер) — Развёрнуто на прод + починен многолетний баг с регионами

Впервые за сегодня что-то реально выкачено. По ходу деплоя вскрылись две причины,
по которым он не проходил, и обе оказались важнее того, что деплоили.

### Причина 1: деплой падал на анализе исходников

```
Error: User code failed to load. Cannot determine backend specification. Timeout after 10000.
```

`const visionClient = new vision.ImageAnnotatorClient();` на верхнем уровне `index.ts`.
Конструктор ищет учётные данные и стучится на metadata-сервер GCP, которого при сборке нет;
попытки отваливаются по таймауту, и CLI не укладывается в свои 10 секунд. Ошибка не
указывает ни на файл, ни на строку. Сделан ленивым — `getVisionClient()`.

### Причина 2: `setGlobalOptions` вызывался слишком поздно — корень всей путаницы с регионами

В `index.ts` установка региона стояла строкой 19, а реэкспорты подмодулей — строками 8–15.
**В ES-модулях импорты вычисляются до тела модуля**, поэтому `telegramBot`, `stepper`,
`consents`, `retention` и `referralFunctions` успевали объявить свои функции до установки
региона и получали дефолтный **us-central1**, а функции из самого `index.ts` — europe-west1.

Это выглядело как «забыли снести старый регион после миграции», а на деле было живым багом:
каждый деплой заново раскладывал функции по двум регионам. Следствия, которые никто не связывал
с этим:

- `telegramWebhook`, шагомер и рефералка никогда не переезжали;
- **страница `/referral` на сайте не работала вообще** — клиент прибит к europe-west1
  (`src/lib/firebase.ts:29`), а функций там не существовало, и падало это под видом CORS;
- сегодняшние `recordConsents` и `enforceRetention` уехали бы туда же.

Исправлено: вызов вынесен в `functions/src/options.ts`, который импортируется **первой строкой**
`index.ts`. Отдельным модулем — чтобы порядок не сломал автоформаттер, сортирующий импорты.

### Что развёрнуто

- **Функции: 40 в europe-west1, в us-central1 остался только `onUserCreated`** (триггер v1,
  он там по определению). Было 30 / 41.
- Создано в правильном регионе: `telegramWebhook`, `stepperClaim`, `getStepperStatus`,
  `getOrCreateReferralCode`, `claimReferral`, `finishReferralCampaign`, `recordConsents`,
  `revokeConsent`, `getMyConsents`, `enforceRetention`.
- Обновлено: `deleteAccount`, `uploadAvatar` и пять функций с фиксом `assertNotBanned`
  (`startCrashGame`, `playSlotMachine`, `playCoinFlip`, `synthesizeArtifact`, `toggleCommentLike`).
- Удалено из us-central1: 22 дубля со старым кодом, три сироты от рулетки
  (`abandonRoulette`, `makeRouletteAction`, `startRoulette` — их нет в исходниках)
  и `monitorClaudeStatus`.
- **Правила Firestore** — включая новую коллекцию `consents`.
- **Вебхук Telegram переставлен** на `https://europe-west1-protomap-1e1db.cloudfunctions.net/telegramWebhook`.

### Проверено после деплоя

- `getWebhookInfo`: новый URL, очередь 0, ошибок нет.
- Логи `telegramWebhook`: инстанс поднялся, все хендлеры зарегистрированы, включая расшифровку.
- Секреты привязаны: `TELEGRAM_BOT_TOKEN` (v2), `TG_VERIFY_HMAC_SECRET`, `TG_WEBHOOK_SECRET`.
- `firebase functions:list`: 40 / 1 по регионам, все новые функции на месте.

### Что осталось непроверенным

- **Шагомер в приложении.** Функции только что появились в europe-west1, где приложение их
  и ищет. Если раньше шагомер не работал — должен заработать. Пусть Денис проверит.
- **Расшифровка голосовых** — код развёрнут, но живого голосового через него ещё не проходило.
- Документы v5 в Firestore **не залиты**: дата вступления в силу 14.09, но публикацию
  юридических текстов оставляю Ориону (аудит требует проверки у юриста).

### Расшифровка заработала — три ошибки по дороге

Развёрнуто и проверено на живом голосовом. Путь до рабочего состояния:

1. **`gemini-3.1-flash` не существует** — Gemini отвечал `404 ... is not found for API version
   v1beta`. Имя я взял по аналогии с `gemini-3.1-flash-lite`, который используется для перевода
   инцидентов. Проверить список моделей с машины разработчика **невозможно**: Gemini отвечает
   `400 User location is not supported for the API use` на запросы из Беларуси. Поэтому в бота
   добавлена команда `/models` — она спрашивает список у развёрнутой функции, которая работает
   из europe-west1. Оставлена насовсем.
2. **Выбрана `gemini-3.5-transcribe`** — специализированная модель под расшифровку.
   Перед этим проверен бесплатный тариф по ai.google.dev: у неё он есть, как и у запасных
   `gemini-3.5-flash` и `gemini-2.5-flash`. А вот у `gemini-omni-flash-preview`, который я
   сначала предложил запасным, бесплатного тарифа **нет вовсе** — Орион вовремя притормозил
   с вопросом про тариф, иначе деплой начал бы молча тратить деньги.
3. **Модель кладёт результат в `audioTranscription`, а не в `text`.** Ответ приходил с
   `finishReason: STOP`, то есть успешный, но код читал `parts[0].text` и получал пустоту.
   Теперь склеиваются все части и поддерживаются оба поля — иначе смена модели через
   `GEMINI_TRANSCRIBE_MODEL` молча ломала бы расшифровку.

Диагностика, которая всё это вскрыла (код ответа, `finishReason`, состав `parts` — прямо в
ответе бота на `/text`), оставлена. Без неё пришлось бы гадать: **логи Cloud Functions через
`firebase functions:log` в этой сессии так и не отдались ни разу**, возвращались пустые строки.

### Подтверждено про приватность

Проверены условия Gemini API, потому что на них основано решение включить расшифровку только
в личном чате. Формулировка жёстче, чем я излагал сначала: на бесплатном тарифе Google не только
использует данные для улучшения продуктов, но и прямо оговаривает, что «human reviewers may read,
annotate, and process your API input and output». То есть голосовое может послушать живой человек.
На платном тарифе этого нет. Ограничение `TRANSCRIBE_CHATS = [GAREM_CHAT_ID]` обосновано;
участников личного чата стоит предупредить.

### Итог по модели: одна универсальная, а не две

Кружки (`video/mp4`) специализированная `gemini-3.5-transcribe` не принимает вовсе —
отвечает `400 Image input modality is not enabled for this model`: она работает только со
звуком, а видео для неё это кадры.

Я написал развилку по MIME-типу (аудио — специализированная, видео — универсальная), Орион
спросил «а не проще всё на одной?» — и был прав. Развилка добавляла сложность ради выигрыша
в качестве, которого никто не измерял.

Сравнили на одном и том же голосовом: **универсальная `gemini-3.5-flash` оказалась лучше.**
Появились знаки препинания и заглавные буквы. Причина, судя по всему, в том, что
специализированная модель принимает только звук и текстовые инструкции игнорирует, а
универсальная читает промпт и выполняет его — то есть качеством можно управлять только у неё.

Итог: одна модель на голосовые и кружки, развилка удалена, в комментарии оставлена пометка
не возвращаться. Парсер по-прежнему понимает оба поля ответа (`text` и `audioTranscription`),
чтобы смена модели через `GEMINI_TRANSCRIBE_MODEL` не ломала расшифровку молча.

**Расшифровка проверена на живых голосовых и кружках — работает.**

---

## 2026-09-04 — Бот разложен по модулям

`functions/src/telegramBot.ts` (1250 строк одним файлом) разбит на `functions/src/telegram/`:

```
core/bot.ts        инстанс Telegraf, константы чатов, общие ссылки Firestore
core/registry.ts   CHAT_FEATURES — что включено в каком чате
core/helpers.ts    isAdmin, isTargetImmune, getUserByTgId
core/guards.ts     фильтр разрешённых чатов
features/          channel, info, linking, duel, moderation, captcha, transcribe, triggers
gemini.ts          расшифровка через Gemini (бывший telegramTranscribe.ts)
index.ts           сборка + вебхук
```

**Главное решение: модули не вешаются на бота при импорте.** Каждый экспортирует
`register(bot)`, а порядок задан явными вызовами в `index.ts`. Это не стилистика: в Telegraf
порядок регистрации определяет поведение, и обработчик без `next()` обрывает цепочку. Сделай
регистрацию побочным эффектом импорта — и автоформаттер, отсортировавший импорты, молча
изменит работу бота. Ровно на этом сегодня утром обнаружился многолетний баг с регионами
(`setGlobalOptions` после реэкспортов), повторять не хотелось.

**Проверка переезда, а не «вроде собралось»:** списки обработчиков до и после сравнены
автоматически (`comm` по отсортированным спискам `bot.use/command/action/on`). Из 21
обработчика в HEAD не потерян ни один; 7 добавленных сегодня на месте. Порядок сохранён во
всём, что на него влияет: guards первым, channel до triggers, команды до `bot.on('text')`,
triggers последним.

**Попутно найдено и исправлено:**

- В `index.ts` вебхука вызов был `bot.handleUpdate(request.body, response)` — второй аргумент
  включает режим webhook reply, когда Telegraf отвечает Telegram прямо в теле HTTP-ответа.
  При переписывании я его потерял и добавил свой `send('OK')`; это лишний round-trip к Bot API
  на каждое сообщение. Возвращено как было, с комментарием.
- `crypto.createHmac` в `features/captcha.ts` без импорта резолвился в глобальный Web Crypto,
  где такого метода нет. Пойман сборкой.

**Деплой снова уткнулся в `Timeout after 10000`** на анализе исходников. Локальный замер
показал, что весь граф модулей грузится за 1.5 секунды — то есть дело не в структуре, а в
гонке с metadata-сервером GCP. Со второй попытки прошло. Если начнёт повторяться —
`FUNCTIONS_DISCOVERY_TIMEOUT`.

**Проверено:** сборка чистая, вебхук отвечает, очередь пустая, ошибок нет.

---

## 2026-09-04 — Качалка медиа по ссылкам

Новая папка `worker/` — воркер, который крутится на сервере Дениса (Fedora CoreOS,
Docker 29.7.2), и `functions/src/telegram/features/download.ts` — сторона бота.

**Почему отдельная машина, а не Cloud Functions.** YouTube и TikTok жёстко режут запросы
с дата-центровых IP, а адреса Google Cloud среди них самые заблокированные — из функции это
упиралось бы в «Sign in to confirm you're not a bot» на каждой второй ссылке. Плюс `yt-dlp`
питоновский, а исходящий трафик Firebase на видео закончился бы за неделю.

Схема: бот кладёт задачу в `tg_download_queue` → воркер забирает транзакцией → качает →
отправляет файл **напрямую** в Bot API. Через Firebase файл не идёт. Входящие подключения
воркеру не нужны, поэтому он живёт за домашним NAT без проброса портов.

### Разграничение по чатам

`e621` и подобное качается только в личном чате (`download_nsfw`). В ProtoMap — только
обычные источники. Причина не вкусовая: по словам Ориона там почти все младше 18, и там же
действует раздел Соглашения о безопасности детей, который мы писали накануне.

### Защита

Модель угрозы — не «Денис подложит гадость», а компрометация самого сервиса: безголовый
сервер скармливает `yt-dlp` произвольные URL из чата, а на машине лежат ключ Firebase Admin
и токен бота. Орион решил оставить общий ключ и общий токен, но усилить защиту.

- **SSRF-проверка в воркере** (`src/urlcheck.ts`), а не только в боте. Дублирование
  намеренное: запрос из домашней сети делает воркер, значит и решать, куда идти, должен он.
  Отклоняются схемы кроме http(s), частные диапазоны, `localhost`/`.local`/`.internal`,
  ссылки по IP-литералу и хосты вне списка. Проверено на живых примерах, включая
  `169.254.169.254`. Без этого хватило бы прислать в чат `http://192.168.1.1/`, чтобы бот
  сходил на роутер Дениса и принёс ответ в Telegram.
- **`yt-dlp` запускается с подчищенным окружением** — только `PATH`, `HOME`, `TMPDIR`.
  Это большая программа, разбирающая недоверенный ввод; наследование `process.env` отдало бы
  при эксплойте токен бота и путь к ключу.
- **Бинарник проверяется по SHA-256** при автообновлении. Не совпало — обновление
  отменяется, работаем на прежней версии.
- Контейнер: непривилегированный пользователь, read-only ФС, `cap_drop: ALL`,
  `no-new-privileges`, лимиты памяти/CPU/процессов, SELinux-метки `:z` на всех монтированиях.
- В README описано, как закрыть контейнеру доступ в локальную сеть на уровне firewall —
  второй рубеж на случай ошибки в проверке.

### Мелочи, которые сэкономят вечер

- Образ на Debian, **не** Alpine: официальный бинарник `yt-dlp` собран под glibc.
- `ffmpeg` обязателен — YouTube отдаёт видео и звук раздельно, без него ролик без звука.
- Не перекодируем: на i7 шестого поколения без видеокарты это минуты. Не влезло в 50 МБ —
  бот честно так и говорит.
- Временные файлы на HDD, а не на SSD и не в `/tmp` (это tmpfs в оперативке).
- Каталоги на хосте должны принадлежать UID 10001, иначе `Permission denied` вылезет
  не при старте, а на первой же ссылке.

### Состояние

Собирается (воркер и функции), развёрнута сторона бота и правила Firestore
(`tg_download_queue` закрыта клиенту полностью — в задаче лежит URL, который исполнится на
чужой машине). **Воркер ни разу не запускался** — ждёт Дениса. CI на GitHub Actions делать
после того, как заработает вживую: автоматизировать неработающее незачем.
