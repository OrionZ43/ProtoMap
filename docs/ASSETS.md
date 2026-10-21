# Сторонние материалы: иконки и звуки

Откуда взяты картинки и звуки, которые сайт отдаёт пользователям, и под какой они лицензией. Те же
файлы берёт новое Android-приложение (`com.z43studios.protomap`): что решено здесь, действует и
там.

Публичные уведомления, которых требуют лицензии, лежат в `static/licenses/third-party.txt` (на
сайте — `/licenses/third-party.txt`). В них попадает только то, что подтверждено.

Проверено 21.10.2026. Совпадение файлов с SVG Repo подтверждено побайтно: скачанный оригинал и наш
файл совпадают по md5. Страницы иконок на svgrepo.com закрыты проверкой Vercel от ботов (ответ
429, в том числе для Playwright). Поэтому лицензии ниже, помеченные «по выдаче», взяты из
поисковой выдачи, а не со страницы. Их нужно открыть в обычном браузере.

## Иконки

| Файл | Где используется | Источник | Лицензия | Статус |
|---|---|---|---|---|
| `static/casino/paw.svg` | символ слот-машины | Teenyicons, [svgrepo 368879](https://www.svgrepo.com/svg/368879/paw), репозиторий `smhmd/teenyicons` | MIT, © 2020 Anja van Staden | подтверждено по LICENSE на GitHub; уведомление — в `third-party.txt` |
| `static/casino/heart.svg` | символ слот-машины | Pictogrammers Memory, [svgrepo 498819](https://www.svgrepo.com/svg/498819/heart), репозиторий `Pictogrammers/Memory` | Apache 2.0 (Pictogrammers Free License: иконки — Apache 2.0) | подтверждено по LICENSE на GitHub; текст лицензии — в `third-party.txt` |
| `static/casino/ram.svg` | символ слот-машины | [svgrepo 276812](https://www.svgrepo.com/svg/276812/ram-memory-ram) | CC0 по выдаче | открыть страницу |
| `static/halloween/pumpkin.svg` | пути встроены в `PumpkinLoader.svelte` и `plinkoBoard.ts` | [svgrepo 444050](https://www.svgrepo.com/svg/444050/halloween-pumpkin) | CC0 по выдаче | открыть страницу |
| `static/halloween/web.svg` | маска паутины на панели «Инфо» (`halloween.css`) | [svgrepo 109382](https://www.svgrepo.com/svg/109382/halloween-spider-web) | CC0 по выдаче | **риск**, см. ниже |
| `static/halloween/spider.svg` | пути встроены в `HalloweenSpiders.svelte` — паучки | [svgrepo 63496](https://www.svgrepo.com/svg/63496/spider) | не подтверждена | **риск**, см. ниже |
| `static/halloween/ghost.svg` | маска призраков на карте (`halloween.css`) | не найден: 19 кандидатов, ни один не совпал | неизвестна | **открыт** |

Удалены 21.10.2026 как неиспользуемые: `halloween/candy1.svg`, `halloween/candy2.svg`,
`halloween/heart.svg` (копия `casino/heart.svg`).

**Риск у `web` и `spider`.** Это старые загрузки на SVG Repo. Их названия совпадают с иконками набора
Freepik «Halloween Hand Drawn» на Flaticon, а там они бесплатны только с подписью автора. С файлами
Flaticon наши не сравнивались. Если окажется, что это Freepik:
- либо подпись на сайте и в приложении — точный текст Flaticon показывает на странице иконки;
- либо замена рисунка.

Паучки — персонажи темы, поэтому замена рисунка паука решается только с Орионом.

## Звуки

`static/sounds/` — 37 файлов, добавлены Орионом начиная с 24.10.2025. Источник и лицензии нигде не
записаны, метаданных в файлах нет. `lets-go-gambling.mp3` — фраза из мема, почти наверняка чужая
запись. В приложение для Google Play её не брать без решения Ориона.

## Что сделать

- Открыть в браузере страницы `ram`, `pumpkin`, `web`, `spider` (ссылки в таблице) и записать сюда
  лицензию и автора.
- Найти источник `ghost.svg` — Орион добавлял его сам.
- Вспомнить, откуда звуки, — хотя бы те, что уходят в приложение.
