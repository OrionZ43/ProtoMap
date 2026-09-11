# Памятка для Дениса

Что поменялось на общем бэкенде ProtoMap 11.09.2026 и что нужно в Android-приложении. Первый блок — до 18 сентября: в этот день вступают в силу новые документы, и сайт начинает требовать согласие на новую редакцию.

Ссылки на код приложения — по копии от 15.07.2026, которая лежит у Ориона. Если код с тех пор уехал, ищи по именам. Пути даны от `app/src/main/java/by/iposdev/protomap/`, если не сказано иначе.

> **Для Claude в репозитории приложения.** Бэкенд (Cloud Functions, правила Firestore) живёт в другом репозитории — веб-проекте ProtoMap. Менять его отсюда нельзя: всё, что нужно на сервере, — через Ориона. Клиенту закрыта запись в коллекцию `consents` и в поля согласий в `users/{uid}` (`allow write: if false`), поэтому согласие пишется только вызовом функции. Не обходи это записью с клиента: журнал, в который пишет клиент, ничего не доказывает.

## Что поменялось

- **Документы.** Политика конфиденциальности 5.2 и Пользовательское соглашение 5.1 залиты в `system/licenses`, вступают в силу 18.09.2026. Появился третий документ — Политика в отношении обработки персональных данных 1.1: её требует статья 17 Закона № 99-З, собрана по примерной форме НЦЗПД.
- **Возраст — 16 лет.** До 16 согласие на обработку данных даёт законный представитель (пункт 9 статьи 5 Закона), поэтому регистрация доступна с 16. Раньше в документах было 17 — по рейтингу стора. Рейтинг стора описывает содержание приложения, а не возраст допуска.
- **Журнал согласий на сервере.** Согласие фиксирует функция `recordConsents`: запись в `consents` с версией документа, датой, способом и IP. Версию определяет сервер по `system/licenses`, а не клиент. В `users/{uid}` функция пишет зеркала версий, по которым и сайт, и приложение понимают, принял ли человек текущую редакцию. Принял на сайте — считается в приложении, и наоборот.
- **С 18.09 сайт закрывает всё экраном согласий** для тех, у кого зеркала не совпадают с `system/licenses`.
- **`deleteAccount` переписан.** Теперь он удаляет или обезличивает всё, что относится к человеку (пункт 10). Та же очистка будет срабатывать для аккаунтов без входа 3 года.
- **Шагомер.** Рейтинг — только по отдельному согласию `activity_leaderboard`. Отзыв согласия на шагомер удаляет данные о шагах с сервера (пункт 5).
- **Все вызываемые функции — в `europe-west1`.** В `us-central1` остался только триггер `onUserCreated`.

## До 18 сентября

### 1. Проверь регион функций

С 03.09 вызываемые функции есть только в `europe-west1`: дубли в `us-central1` удалены. В копии от 15.07 вызовы идут в `us-central1`:

- `di/AppModule.kt:33` — `FirebaseFunctions.getInstance()` без региона, это `us-central1` по умолчанию. Через него `SharedViewModel` зовёт `deleteAccount` и `uploadAvatar`.
- `ui/auth/AuthViewModel.kt:37`, `ui/auth/CreateUsernameScreen.kt:192`, `ui/settings/security/SecurityViewModel.kt:54` — явно `"us-central1"`: `checkUsername`, `send2FACode`, `verify2FACode`, `toggle2FA`, `getTelegramAuthCode`.
- Без региона: `ui/casino/shop/ShopViewModel.kt:33`, `ui/profile/ProfileScreen.kt:898`, `ui/chat/direct/DirectChatViewModel.kt:106`, `ui/stepper/StepperCloudRepository.kt:104`.

Если в релизе так же, все эти вызовы с 03.09 получают `NOT_FOUND`. Исправление — один экземпляр `FirebaseFunctions.getInstance("europe-west1")` в `AppModule` и он же везде. Сверено по `firebase functions:list`: всё, что вызывает приложение, в `europe-west1` есть, кроме двух функций из пункта 13. Если уже переехал — просто подтверди.

### 2. Согласие при регистрации

Сейчас в интро одна общая галочка `accept_all_agreements` (`ui/intro/IntroScreen.kt:618`), принятые версии пишутся в SharedPreferences (`IntroScreen.kt:349-366`), `recordConsents` не вызывается нигде. Такое согласие не доказать, а возраст не спрашивается.

Нужно так же, как на сайте (`src/routes/register/+page.svelte` в веб-репо):

1. **Перед галочками — разъяснение прав:** оператор, цели, права, как ими воспользоваться, последствия отказа. Закон требует дать это до согласия. Тексты — в справке 2.
2. **Четыре отдельные галочки, все обязательные:** `age_minimum`, `core_processing`, `cross_border`, `tos`. Кнопка неактивна, пока не отмечены все. Под галочками — подсказка про возраст и ссылка на Политику обработки персональных данных.
3. **Сразу после создания аккаунта — `recordConsents`** с этими четырьмя id и `method: "android"`:
   - после `createUserWithEmailAndPassword` (`ui/auth/AuthViewModel.kt:126`);
   - после входа через Google (`AuthViewModel.kt:197`), если аккаунт новый: `additionalUserInfo?.isNewUser == true`.

Галочки ставь на экран регистрации, а не в интро: интро показывается один раз на устройство, а аккаунтов на нём можно создать несколько. Для нового аккаунта через Google проще всего показать экран из пункта 3 сразу после входа и не пускать дальше до согласия. Общую галочку в интро можно убрать: согласием она не считается.

Если `recordConsents` упал, регистрацию не роняй, пиши в лог: человека поймает экран из пункта 3. На сайте сделано так же.

### 3. Повторное принятие с 18.09

При каждом запуске с вошедшим пользователем сравнивай версии в `system/licenses` с зеркалами в `users/{uid}`:

| `system/licenses` | `users/{uid}` |
| --- | --- |
| `privacy_policy_version` | `consents_privacy_version` |
| `terms_of_service_version` | `consents_tos_version` |

Если хоть одна пара не совпадает и сейчас не раньше 18.09.2026 00:00 по Минску, показывай полноэкранный экран согласий:

- заголовок и вводный текст — `gate_title` и `gate_lede` из справки 2;
- то же разъяснение прав и те же четыре галочки, что при регистрации;
- «Согласен, продолжить» → `recordConsents`, затем перечитать `users/{uid}` и закрыть экран;
- «Выйти из аккаунта»;
- «Не согласен — удалить аккаунт» → экран удаления в «Безопасности».

С экрана должны открываться сами документы: нельзя требовать принять то, что нельзя прочитать. До 18.09 экран не навязывается — неделя дана на чтение. Новому аккаунту без зеркал (пункт 2, Google) экран показывается сразу, без оглядки на дату.

Это заменяет сравнение с SharedPreferences в `MainActivity.kt:220-264` и запись версий в `IntroScreen.kt:349-366`: источник истины теперь сервер. Логика та же, что на сайте (`src/routes/+layout.server.ts:87-105`). Пример проверки — в справке 1.

### 4. Возраст 16

Галочка `age_minimum` — «Мне исполнилось 16 лет.», под ней подсказка `consent_age_hint`. Если где-то в приложении или в описании стора минимальным возрастом указано 17 или 18 — замени на 16. Анкету IARC Орион пересмотрит позже, её не трогай.

### 5. Шагомер: согласие, рейтинг, отзыв

Шаги — данные о физической активности, то есть специальные персональные данные: их можно обрабатывать только по отдельному согласию (статья 8 Закона № 99-З). Показ шагов другим людям в рейтинге — ещё и распространение, и на него нужно своё согласие. Политика 5.2 так и описывает: оба согласия необязательные, рейтинг — только с отдельной отметкой.

Сейчас приложение:
- запрашивает `ACTIVITY_RECOGNITION` и запускает прогулку без записанного согласия (`ui/stepper/StepperScreen.kt:332-356`);
- показывает в рейтинге всех, у кого есть шаги (`StepperCloudRepository.kt:200-258`).

**Что уже сделано на сервере (11.09):**

- **Отозвавшим — без начисления.** `stepperClaim` не начисляет тем, кто отозвал согласие (`activity_data_consent == false`), и отвечает `FAILED_PRECONDITION` «Согласие на обработку данных о шагах отозвано.». У кого поля нет — согласие ещё не спрашивали, — начисление пока работает: иначе шагомер сломался бы у всех до твоего релиза.
- **Рейтинг по согласию и без истории.** В рейтинг сервер пишет только тех, у кого `activity_leaderboard_consent == true`, и только суммы: `stepsToday`, `stepsWeek`, `stepsMonth`, `totalSteps`. Поля `history` там больше нет: шаги по дням лежат в `stepper/{uid}.stepsByDay`, а этот документ читает только владелец. Три старые записи без согласия удалены, их итоги перенесены в `stepper/{uid}.totalSteps`.
- **Отзыв удаляет данные.** Отзыв согласия на шагомер удаляет с сервера данные о шагах: `stepper/{uid}` вместе с журналом начислений, запись в рейтинге и ключи идемпотентности. Начисленные ProtoCoins остаются.
- **Защита от повторной оплаты.** Если сегодня уже было начисление, до конца суток (UTC) после отзыва остаётся отметка `claimsLockedUntil`, и `stepperClaim` отвечает `FAILED_PRECONDITION` «Шаги за сегодня уже учтены. Начисление возобновится завтра.». Без неё можно было бы отозвать согласие, дать его снова и получить ProtoCoins за те же шаги ещё раз.
- **Появилось `claimedDate`.** Сервер теперь пишет `stepper/{uid}.claimedDate` — день (UTC), к которому относятся `dailyClaimed*`. `getClaimedSteps` (`StepperCloudRepository.kt:136-151`) читал это поле, а сервер его не писал, поэтому оплаченные шаги в приложении всегда были нулём.
- **Почасовая разбивка не хранится.** `hourStats` в журнал начислений больше не сохраняется и вычищен из старых записей: Политика обещает хранить итоги дня. Присылать разбивку по-прежнему нужно — по ней проверяются лимиты и бонусные часы.

**Что нужно в приложении:**

1. **Экран согласия перед первым включением шагомера** — до запроса разрешения: `consent_activity_text` и две галочки (строки в справке 2).
   - `consent_cb_activity` — без неё шагомер не включается. Вызов — `recordConsents(["activity_data"])`.
   - `consent_cb_leaderboard` — необязательная, по умолчанию снята. Если отмечена, `"activity_leaderboard"` уходит в том же вызове.

   Только после успешного вызова — разрешение и `startWalk`.
2. **Переключатель «Показывать меня в рейтинге»** в настройках шагомера. Включение — `recordConsents(["activity_leaderboard"])`, выключение — `revokeConsent("activity_leaderboard")`. Запись в рейтинге появится со следующим начислением, а удаляется сразу.
3. **Выключение шагомера** → `revokeConsent("activity_data")`: сервер отзовёт заодно и рейтинг и удалит данные о шагах. В приложении — остановить `WalkSessionService` и удалить локальную историю шагов.
4. **Разрешение отозвали в настройках Android.** Политика (п. 9.3) считает это отзывом согласия, но сервер об этом не узнает. При запуске и при открытии шагомера проверяй `ACTIVITY_RECOGNITION`: если разрешения нет, а `activity_data_consent == true`, вызывай `revokeConsent("activity_data")`.
5. **Кто уже пользуется шагомером.** Если шагомер включён, а `activity_data_consent != true`, — показать экран согласия. Отказался — выключить шагомер.
6. **Рейтинг в приложении.** На `history` в документах рейтинга не рассчитывай: `LeaderboardEntry.history` будет пустым. `updateLeaderboard` (`StepperCloudRepository.kt:153-198`) можно удалить — правила запрещают клиенту писать в рейтинг, этот код ни разу не срабатывал.

Необязательные согласия сервер принимает отдельно только от того, кто принял обязательные на **текущую** редакцию. Иначе ответ — `FAILED_PRECONDITION` «Сначала нужно принять текущую редакцию документов.»: тогда сначала экран из пункта 3 — или отправь всё одним вызовом. `activity_leaderboard` без согласия на шагомер не принимается: «Показ в рейтинге доступен только с согласием на шагомер.».

Когда версия с согласием разойдётся по пользователям, включим на сервере и обратное: без `activity_data_consent == true` — без начисления. Дату согласуем, иначе сломаем старые версии приложения.

### 6. Документы в приложении

`ui/legal/LegalScreens.kt` показывает `privacy_policy` и `terms_of_service` из `system/licenses`. Нужно ещё два изменения.

**Третий документ.** Поле `personal_data_policy`, версия в `personal_data_policy_version` (сейчас `"1.1"`). Ссылка на него — на экране согласий (строки `consent_policy_more` и `consent_policy_link`) и в настройках рядом с двумя другими. Согласие на эту Политику не спрашивают, поэтому её версия в проверке из пункта 3 не участвует.

**Тег `<table>` в парсере.** `LegalParser.parseXml` молча пропускает незнакомые теги, поэтому оба приложения к Политике обработки (цели обработки и уполномоченные лица) в приложении сейчас просто исчезнут. Формат — в справке 3. На телефоне сайт рисует таблицу карточками: строка — карточка, у каждой ячейки подпись из шапки. Так читается лучше, чем таблица на пять колонок.

| Поле в `system/licenses` | Версия | Что это |
| --- | --- | --- |
| `privacy_policy` | `privacy_policy_version` = `"5.2"` | Политика конфиденциальности |
| `terms_of_service` | `terms_of_service_version` = `"5.1"` | Пользовательское соглашение |
| `personal_data_policy` | `personal_data_policy_version` = `"1.1"` | Политика обработки ПД, новая |

## После 18 сентября

### 7. Группы при удалении аккаунта — нужна твоя схема

`purgeAccount` не трогает `groups` и `group_invites`: схема твоя, угадывать её на сервере не стали. По `data/repository/GroupRepository.kt` видно:

- `groups/{groupId}`: `ownerUid`, `memberUids`, `memberCount`, `avatarUrl`, `inviteCode`;
- `groups/{groupId}/members/{uid}`: `username`, `avatarUrl`, `role`;
- `groups/{groupId}/topics/{topicId}`: `createdBy`;
- `…/topics/{topicId}/messages/{messageId}`: `author_uid`, `author_username`, `text`, `media_url`, `is_deleted`;
- файлы в Storage: `group_media/{groupId}/{topicId}/{type}/{messageId}.{ext}` и аватары групп;
- `group_invites/{code}`: `groupId`, `createdBy`.

Предлагается так же, как с каналами:

1. Убрать участника из `memberUids`, уменьшить `memberCount` на 1, удалить `members/{uid}`.
2. Его сообщения в топиках обезличить, как в личках: `author_uid: null`, `author_username: "Deleted"`. Его медиа удалить; сообщение, где не осталось текста, пометить `is_deleted: true`.
3. Удалить приглашения, которые он создал.

**Вопрос: что делать с группой, где он владелец?** Передать самому давнему участнику, оставить без владельца (`ownerUid: null`, как сделано с каналами) или удалить целиком? И нужно ли что-то делать с топиками, которые он создал (`createdBy`)?

Ответь Ориону схемой и выбором — очистку допишем в `functions/src/accountPurge.ts`.

### 8. `auth_logs`: срок хранения и удаление

В обеих политиках записано: «IP-адрес и журналы безопасности — 6 месяцев с момента фиксации события».

Сейчас `data/manager/AuthLogManager.kt:25-84` при каждом запуске дописывает в `auth_logs/{androidId}.login_history` запись с `uid`, `email`, версиями, отпечатком и уровнем защиты. Массив растёт бесконечно. В самом документе ещё лежат `first_email` и `last_email`. Документ адресован по ANDROID_ID, а не по uid, а по элементам массива запрос не построить. Поэтому ни срок хранения, ни удаление при удалении аккаунта сейчас сделать нельзя.

Предложение:

- Историю входов вынести в подколлекцию `auth_logs/{androidId}/logins/{autoId}` с полями `uid`, `timestamp` и `expireAt` = `timestamp` + 183 дня. На `expireAt` Орион включит TTL-политику Firestore, и шесть месяцев будут соблюдаться сами.
- `email` в каждой записи не нужен, достаточно `uid`: меньше данных — меньше чистить.
- При удалении аккаунта сервер найдёт записи через `collectionGroup("logins").where("uid", "==", uid)`, удалит их и очистит `first_email`/`last_email`, если это его адрес.
- Admin-модуль читает `login_history` (`admin/…/devices/DeviceApprovalScreen.kt:111-156`, `admin/…/violations/ViolationMonitoringScreen.kt:518-523`) — его придётся перевести на подколлекцию.

Если согласен — сделай запись у себя и скажи Ориону. TTL и очистку при удалении добавим на сервере.

### 9. Тексты приложения и стора

Документы 5.1 говорят:

- карта с метками доступна неограниченному кругу лиц;
- файлы (медиа и аватары) хранятся в Firebase Storage в США; база Firestore — в Польше; функции и Realtime Database — в Бельгии;
- при удалении аккаунта медиа удаляются, а тексты сообщений обезличиваются;
- возраст — 16.

Если описание в сторе или тексты в приложении говорят другое (например, «данные хранятся только в ЕС» или «сообщения удаляются вместе с аккаунтом») — приведи к этому.

## К сведению

### 10. Что теперь делает `deleteAccount`

Одна функция очистки `purgeAccount` (`functions/src/accountPurge.ts`) — её зовут `deleteAccount` и ежедневная очистка неактивных аккаунтов (04:00 по Минску).

- **Личные чаты.** Сообщения удалённого остаются, но с `author_uid: null` и `author_username: "Deleted"`. Его медиа удаляются (`media_url: null`); сообщение без текста помечается `is_deleted: true`. Пересланные медиа (`forward_info`) остаются. В документе чата `participants.{uid}` становится `{username: "Deleted", avatarUrl: null, frameId: null}`, а `unreadCount.{uid}` и `typing.{uid}` удаляются. «Избранное» (чат с самим собой) удаляется целиком.
- **Каналы.** Если он владелец — `ownerUid: null`, аватар канала удаляется. Если подписчик — он убирается из `subscriberUids`, `subscriberCount` уменьшается на 1, `subscribers/{uid}` удаляется. Посты обезличиваются так же, как сообщения.
- **Общий чат.** Картинки и голосовые удаляются: сообщение только с медиа — целиком, остальные обезличиваются.
- **Комментарии** обезличиваются: `author_uid: null`, `author_username: "Deleted"`, `author_avatar_url: null`.
- **Удаляется целиком:** `users/{uid}` с подколлекциями, метка на карте, шагомер с журналом начислений и ключами идемпотентности, запись в рейтинге, рефералка, лимиты, 2FA, `mobileapp/beta_stats/users/{uid}`, его файлы в Storage, аватар в Cloudinary, `status/{uid}` в Realtime Database. Последним удаляется пользователь в Auth.
- **Журнал согласий** не удаляется: он хранится 3 года как доказательство. Из записей убираются IP и способ, проставляется `accountDeletedAt`.

Что проверить в приложении:

- `ChatMessage.authorUid` и `CommentData.authorUid` уже nullable (`data/model/ChatMessage.kt:77`, `safeAuthorUid` на строке 145) — хорошо.
- `ownerUid` канала может стать `null`. `data/repository/ChannelRepository.kt:279,457` читают его через `?: ""` — не упадёт, но проверь, что экран канала без владельца не ломается.
- Имя `"Deleted"` и пустой аватар отрисовываются нормально.
- После успешного `deleteAccount` выход и очистка локальной базы Room этого аккаунта. Иначе переписка удалённого аккаунта остаётся на телефоне.

**Неактивные аккаунты.** 3 года без входа — та же очистка. Сейчас работает в режиме пробного прогона, включит Орион. Активность — это последний вход или обновление токена, так что аккаунт, в который заходят через приложение, не потеряется.

### 11. Индексы Firestore

`firestore.indexes.json` в веб-репо — выгрузка с прода: 9 составных индексов и 4 настройки полей, включая TTL. Если создаёшь индекс или TTL в консоли Firebase — скажи Ориону, файл надо перевыгрузить. Иначе следующий деплой индексов с `--force` его удалит.

## Вопросы

### 12. Порядок релиза

Пункты 2, 3 и 5 связаны: согласия на шагомер и рейтинг сервер принимает отдельно только после обязательных на текущую редакцию. Выпускай экран согласий не позже экрана шагомера. Когда ждать версию в сторе? Это определяет, когда включать проверку в `stepperClaim`.

### 13. `sendImageMessage` и `sendVoiceMessage`

Таких функций на бэкенде нет — ни в исходниках, ни на проде (проверено 11.09). В копии от 15.07 общий чат отправляет через них картинки и голосовые (`ui/chat/ChatViewModel.kt:195`, `:203`). Если релиз так делает, эти сообщения не уходят. Как они отправляются сейчас? Если функция нужна — опиши, что на входе и какие лимиты размера, сделаем на сервере.

### 14. `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

По коду разрешение нужно шагомеру: после выдачи разрешений, на устройствах не Samsung и не Google, приложение просит отключить оптимизацию батареи, чтобы система не останавливала `WalkSessionService` (`ui/stepper/StepperScreen.kt:339-352`, `:389-403`). Документы описывают его так же.

Подтверди, что других применений нет и что в Play Console оно заявлено под учёт прогулки: Google пускает это разрешение только тем, чьей основной функции оно действительно нужно.

### 15. Сервер с качалкой

Если твой сервер скачивает медиа по ссылкам из чата, он обрабатывает данные по поручению Ориона, то есть это уполномоченное лицо. Его надо внести в приложение 2 к Политике обработки.

Нужно знать:

- чей это сервер и у какого хостинга;
- в какой стране он стоит — от этого зависит трансграничная передача;
- что он хранит и сколько.

## Справка 1. Контракты функций

Все функции — в `europe-west1`, с App Check и вошедшим пользователем. `recordConsents` не требует подтверждённой почты: его зовут сразу после регистрации.

| Функция | Вход | Выход | Ошибки |
| --- | --- | --- | --- |
| `recordConsents` | `{granted: [id…], method: "android"}` | `{status: "ok", recorded, versions: {privacy, tos}}` | `invalid-argument` — пустой список или неизвестный id; `failed-precondition` — отмечены не все обязательные, необязательные без принятой текущей редакции или `activity_leaderboard` без согласия на шагомер; `internal` — не читаются версии документов |
| `revokeConsent` | `{consentId}` — `"activity_data"` или `"activity_leaderboard"` | `{status: "ok", revoked}` | `failed-precondition` — обязательное согласие; текст ошибки отправляет к удалению аккаунта |
| `getMyConsents` | `{}` | `{items: [{consentId, documentVersion, grantedAt, revokedAt, method}]}`, новые сверху, даты в мс | — |
| `deleteAccount` | `{}` | `{status: "success"}` | `internal` — очистка упала; повторный вызов безопасен |
| `stepperClaim` | как раньше | как раньше | новые `failed-precondition`: «Согласие на обработку данных о шагах отозвано.» и «Шаги за сегодня уже учтены. Начисление возобновится завтра.» |

`revokeConsent("activity_data")` отзывает заодно и `activity_leaderboard` и удаляет данные о шагах; `revoked` считает оба.

Версии документов сервер берёт сам из `system/licenses`, клиент их не передаёт. `method` — `"android"`, любое другое значение запишется как `"web"`. В журнале `documentVersion` выглядит так: `"tos 5.1"` для `tos` и `"privacy 5.2"` для остальных.

| id | Что это | Обязательное |
| --- | --- | --- |
| `age_minimum` | мне исполнилось 16 лет | да |
| `core_processing` | обработка данных для аккаунта, карты и чатов | да |
| `cross_border` | передача данных за границу | да |
| `tos` | Пользовательское соглашение и Политика конфиденциальности | да |
| `activity_data` | шагомер, специальные персональные данные | нет |
| `activity_leaderboard` | показ шагов в рейтинге; только вместе с `activity_data` | нет |

Поля пишет только сервер, клиент их читает:

| Поле | Значение |
| --- | --- |
| `users/{uid}.consents_privacy_version` | версия Политики, на которую есть согласие |
| `users/{uid}.consents_tos_version` | версия Соглашения, на которую есть согласие |
| `users/{uid}.consents_updated_at` | когда приняты обязательные |
| `users/{uid}.activity_data_consent` | `true` — согласие на шагомер дано, `false` — отозвано, поля нет — не давал |
| `users/{uid}.activity_leaderboard_consent` | то же для рейтинга |
| `stepper/{uid}.claimedDate` | день (UTC), к которому относятся `dailyClaimedNormalSteps` и `dailyClaimedBonusSteps` |
| `stepper/{uid}.stepsByDay`, `totalSteps` | шаги по дням за 30 дней и итог за всё время |
| `stepper/{uid}.claimsLockedUntil` | после отзыва согласия: до этого времени начисление закрыто |

```kotlin
private val functions = FirebaseFunctions.getInstance("europe-west1")

private val REQUIRED_CONSENTS = listOf("age_minimum", "core_processing", "cross_border", "tos")

suspend fun recordConsents(granted: List<String>) {
    functions.getHttpsCallable("recordConsents")
        .call(mapOf("granted" to granted, "method" to "android"))
        .await()
}

suspend fun revokeConsent(consentId: String) {
    functions.getHttpsCallable("revokeConsent")
        .call(mapOf("consentId" to consentId))
        .await()
}

// Включение шагомера; галочка рейтинга — по желанию
val granted = if (showInLeaderboard) listOf("activity_data", "activity_leaderboard")
              else listOf("activity_data")
try {
    recordConsents(granted)
} catch (e: FirebaseFunctionsException) {
    if (e.code == FirebaseFunctionsException.Code.FAILED_PRECONDITION) {
        // Обязательные на текущую редакцию не приняты — сначала экран согласий
    }
}

// Выключение шагомера: сервер отзовёт и рейтинг и удалит данные о шагах
revokeConsent("activity_data")
```

```kotlin
// 18.09.2026 00:00 по Минску (UTC+3)
const val CONSENT_GATE_FROM_MS = 1_789_678_800_000L

suspend fun consentOutdated(uid: String): Boolean {
    val db = Firebase.firestore
    val lic = db.collection("system").document("licenses").get().await()
    val me = db.collection("users").document(uid).get().await()
    val pp = lic.getString("privacy_policy_version") ?: return false
    val tos = lic.getString("terms_of_service_version") ?: return false
    return me.getString("consents_privacy_version") != pp ||
        me.getString("consents_tos_version") != tos
}

// Экран из пункта 3: устаревшее согласие и дата наступила,
// либо новый аккаунт без зеркал — сразу
val showGate = consentOutdated(uid) &&
    (System.currentTimeMillis() >= CONSENT_GATE_FROM_MS || isNewAccount)
```

## Справка 2. Тексты для strings.xml

Тексты те же, что на сайте: в веб-репо это `auth.consent`, `auth.terms_*` и `legal.gate` в `src/lib/i18n/locales/ru.json` и `en.json`. Выгружены оттуда же, уже с экранированием для Android. Строки шагомера и рейтинга (`consent_activity_*`, `consent_cb_activity`, `consent_*leaderboard*`) — только для приложения. Названия ссылок (`consent_tos_link`, `consent_pp_link`, `consent_policy_link`) — кликабельные, ведут на документы.

`values/strings.xml`:

```xml
<!-- Разъяснение прав — показывать перед галочками -->
<string name="consent_notice_title">Прежде чем вы дадите согласие</string>
<string name="consent_operator">Оператором ваших персональных данных является Ковалёв Денис Дмитриевич, действующий под наименованием Z43 Studios, адрес места жительства: г. Минск, Республика Беларусь, электронная почта: orion.z43studios@gmail.com.</string>
<string name="consent_purposes">Мы обрабатываем ваши данные для работы учётной записи, отображения метки на карте, обмена сообщениями, начисления внутренней валюты и защиты Сервиса от злоупотреблений. С данными совершаются: сбор, систематизация, хранение, изменение, использование, обезличивание, блокирование, предоставление, распространение (только в отношении данных, которые вы публикуете сами), удаление. Обработка ведётся автоматизированным способом с использованием облачных сервисов. Согласие даётся на срок 3 года с даты последнего входа в учётную запись либо до момента отзыва.</string>
<string name="consent_rights_title">Ваши права.</string>
<string name="consent_rights">Вы вправе в любое время без объяснения причин отозвать согласие; получить информацию об обработке ваших данных; требовать изменения неполных, устаревших или неточных данных; один раз в календарный год бесплатно получить сведения о том, кому предоставлялись ваши данные; требовать прекращения обработки и удаления данных; обжаловать наши действия в Национальный центр защиты персональных данных Республики Беларусь, а его решение — в судебном порядке.</string>
<string name="consent_howto_title">Как этим воспользоваться.</string>
<string name="consent_howto">Быстрый путь — раздел «Настройки — Безопасность» или письмо на нашу почту. Формальный путь — заявление по статье 14 Закона № 99-З. Сроки ответа: 5 рабочих дней на запрос информации об обработке; 15 дней на отзыв согласия, изменение, удаление и сведения о передаче третьим лицам.</string>
<string name="consent_consequences_title">Последствия.</string>
<string name="consent_consequences">Без согласия регистрация невозможна: Сервис не может работать, не обрабатывая эти данные. Отзыв согласия влечёт удаление учётной записи в 15-дневный срок и не имеет обратной силы.</string>

<!-- Галочки: все четыре обязательны -->
<string name="consent_cb_age_minimum">Мне исполнилось 16 лет.</string>
<string name="consent_age_hint">До 16 лет согласие на обработку персональных данных даёт законный представитель (пункт 9 статьи 5 Закона № 99-З), поэтому регистрация доступна с 16 лет.</string>
<string name="consent_cb_core">Я ознакомился с разъяснением прав и даю согласие на обработку моих персональных данных для работы учётной записи, карты и чатов.</string>
<string name="consent_cb_cross_border">Я даю согласие на передачу моих персональных данных на территорию иностранных государств, включая государства, на территории которых не обеспечивается надлежащий уровень защиты прав субъектов персональных данных, и подтверждаю, что проинформирован о связанных с этим рисках.</string>
<string name="consent_tos_prefix">Я принимаю</string>
<string name="consent_tos_link">Пользовательское Соглашение</string>
<string name="consent_and">и</string>
<string name="consent_pp_link">Политику Конфиденциальности</string>
<string name="consent_policy_more">Цели обработки, сроки хранения и получатели данных перечислены в</string>
<string name="consent_policy_link">Политике в отношении обработки персональных данных</string>

<!-- Экран повторного принятия (пункт 3) -->
<string name="gate_title">Обновились документы</string>
<string name="gate_lede">Политика конфиденциальности и Пользовательское Соглашение вступили в силу в новой редакции. Чтобы продолжить пользоваться ProtoMap, подтвердите согласие — это делается один раз.</string>
<string name="gate_accept">Согласен, продолжить</string>
<string name="gate_saving">Записываем…</string>
<string name="gate_error">Не удалось записать согласие. Попробуйте ещё раз.</string>
<string name="gate_logout">Выйти из аккаунта</string>
<string name="gate_refuse">Не согласен — удалить аккаунт</string>

<!-- Шагомер и рейтинг (пункт 5) -->
<string name="consent_activity_title">Шагомер и ваши данные</string>
<string name="consent_activity_text">Функция «Шагомер» получает количество шагов с датчика устройства и начисляет за них ProtoCoins. Данные о физической активности — специальные персональные данные, и по статье 8 Закона № 99-З на их обработку нужно отдельное согласие. На сервере хранятся суточная статистика шагов и итоги прогулок (шаги, время, начисленные ProtoCoins); поминутные показания датчика остаются на устройстве. Согласие действует 3 года с даты последнего входа в учётную запись либо до отзыва. Отозвать его можно в любой момент, выключив шагомер: данные о шагах удалятся с сервера, начисление ProtoCoins за шаги прекратится, остальные функции Сервиса продолжат работать.</string>
<string name="consent_cb_activity">Я даю согласие на обработку данных о моей физической активности (количество шагов, итоги прогулок) для работы шагомера и начисления ProtoCoins.</string>
<string name="consent_cb_leaderboard">Показывать моё имя пользователя, аватар и количество шагов за день, неделю, месяц и всё время другим пользователям в рейтинге шагомера.</string>
<string name="consent_leaderboard_hint">Необязательно. Отметку можно снять в любой момент в настройках шагомера — запись в рейтинге удалится сразу.</string>
```

`values-en/strings.xml`:

```xml
<!-- Разъяснение прав — показывать перед галочками -->
<string name="consent_notice_title">Before you give your consent</string>
<string name="consent_operator">The operator of your personal data is Kovalev Denis Dmitrievich, acting under the name Z43 Studios, place of residence: Minsk, Republic of Belarus, e-mail: orion.z43studios@gmail.com.</string>
<string name="consent_purposes">We process your data to operate your account, display your marker on the map, exchange messages, award in-game currency, and protect the Service from abuse. The following operations are performed: collection, systematisation, storage, modification, use, depersonalisation, blocking, provision, dissemination (only in respect of data you publish yourself), and deletion. Processing is automated and uses cloud services. Consent is given for 3 years from the date of your last sign-in, or until withdrawn.</string>
<string name="consent_rights_title">Your rights.</string>
<string name="consent_rights">You may at any time and without giving reasons withdraw your consent; obtain information about the processing of your data; require the modification of incomplete, outdated or inaccurate data; once per calendar year obtain, free of charge, information about who your data was provided to; require processing to cease and your data to be deleted; and appeal our actions to the National Personal Data Protection Center of the Republic of Belarus, and its decision to the courts.</string>
<string name="consent_howto_title">How to exercise them.</string>
<string name="consent_howto">The quick route is Settings — Security, or an e-mail to our address. The formal route is an application under Article 14 of Law No. 99-Z. Response times: 5 working days for a request for information about processing; 15 days for withdrawal of consent, modification, deletion, and information about transfers to third parties.</string>
<string name="consent_consequences_title">Consequences.</string>
<string name="consent_consequences">Registration is not possible without consent: the Service cannot operate without processing this data. Withdrawal of consent results in deletion of your account within 15 days and has no retroactive effect.</string>

<!-- Галочки: все четыре обязательны -->
<string name="consent_cb_age_minimum">I am at least 16 years old.</string>
<string name="consent_age_hint">Below the age of 16, consent to the processing of personal data is given by a legal representative (Article 5(9) of Law No. 99-Z), so registration is available from the age of 16.</string>
<string name="consent_cb_core">I have read the explanation of my rights and consent to the processing of my personal data for the operation of my account, the map and chats.</string>
<string name="consent_cb_cross_border">I consent to the transfer of my personal data to foreign states, including states that do not ensure an adequate level of protection of data subjects\' rights, and confirm that I have been informed of the associated risks.</string>
<string name="consent_tos_prefix">I accept the</string>
<string name="consent_tos_link">Terms of Service</string>
<string name="consent_and">and</string>
<string name="consent_pp_link">Privacy Policy</string>
<string name="consent_policy_more">Processing purposes, retention periods and data recipients are listed in the</string>
<string name="consent_policy_link">Personal Data Processing Policy</string>

<!-- Экран повторного принятия (пункт 3) -->
<string name="gate_title">Documents updated</string>
<string name="gate_lede">A new revision of the Privacy Policy and Terms of Service has taken effect. To keep using ProtoMap, please confirm your consent — this is a one-time step.</string>
<string name="gate_accept">I agree, continue</string>
<string name="gate_saving">Saving…</string>
<string name="gate_error">Could not record your consent. Please try again.</string>
<string name="gate_logout">Sign out</string>
<string name="gate_refuse">I do not agree — delete my account</string>

<!-- Шагомер и рейтинг (пункт 5) -->
<string name="consent_activity_title">The Step Counter and your data</string>
<string name="consent_activity_text">The Step Counter feature reads your step count from the device sensor and awards ProtoCoins for it. Physical activity data is a special category of personal data, and under Article 8 of Law No. 99-Z processing it requires separate consent. The server stores daily step statistics and walk summaries (steps, time, ProtoCoins awarded); minute-by-minute sensor readings stay on the device. Consent is valid for 3 years from your last sign-in or until withdrawn. You can withdraw it at any time by turning the Step Counter off: your step data will be deleted from the server, ProtoCoins activity rewards will stop, and the rest of the Service will keep working.</string>
<string name="consent_cb_activity">I consent to the processing of my physical activity data (step count, walk summaries) for the Step Counter and ProtoCoins rewards.</string>
<string name="consent_cb_leaderboard">Show my username, avatar and step counts for the day, week, month and all time to other users in the Step Counter leaderboard.</string>
<string name="consent_leaderboard_hint">Optional. You can untick this at any time in the Step Counter settings — your leaderboard entry will be deleted immediately.</string>
```

## Справка 3. Тег `<table>` в документах

Встречается пока только в Политике обработки: приложения 1 и 2. Подпись `caption` необязательна. Число ячеек в каждой строке `row` равно числу ячеек в шапке `head`. У каждой ячейки есть и `ru`, и `en` — скрипт заливки документов в веб-репо (`scripts/upload-legal-docs.mjs`) это проверяет.

Фрагмент приложения 1 (в документе у таблицы пять колонок):

```xml
<table>
    <caption>
        <ru>Цели обработки, категории субъектов, перечень данных, правовые основания и сроки хранения</ru>
        <en>Purposes of processing, categories of data subjects, data, legal bases and retention periods</en>
    </caption>
    <head>
        <cell><ru>Цель обработки</ru><en>Purpose of processing</en></cell>
        <cell><ru>Категории субъектов</ru><en>Data subjects</en></cell>
    </head>
    <row>
        <cell><ru>…</ru><en>…</en></cell>
        <cell><ru>Пользователи Сервиса</ru><en>Users of the Service</en></cell>
    </row>
</table>
```

Модель для `LegalElement`:

```kotlin
data class Table(
    val caption: LocalizedText?,
    val head: List<LocalizedText>,
    val rows: List<List<LocalizedText>>
) : LegalElement()
```

`parseLocalizedText(parser, "cell")` и `parseLocalizedText(parser, "caption")` подходят как есть: внутри те же пары `ru`/`en`.
