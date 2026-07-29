// src/lib/utils/scroll.ts

/**
 * Прокрутка контейнера вниз.
 *
 * ЗАЧЕМ ФУНКЦИЯ, А НЕ `el.scrollTop = el.scrollHeight` НА МЕСТЕ:
 *
 * `bind:this={el}` компилируется в `mutable_source`. Присваивание СВОЙСТВУ такой
 * переменной Svelte считает мутацией самой переменной и генерирует
 * `$.mutate(el, ...)`, то есть инвалидирует её. Если рядом есть реактивный блок,
 * который читает эту же переменную, получается бесконечный цикл:
 *
 *     $: if (messagesWindow && ...) {        // зависит от messagesWindow
 *         tick().then(() => {
 *             messagesWindow.scrollTop = ...  // → $.mutate(messagesWindow)
 *         });                                 // → блок «грязный» → flush → блок → ...
 *     }
 *
 * Коварство в трёх вещах:
 *   1. Инвалидация происходит при ЛЮБОЙ мутации, даже если значение не изменилось —
 *      нескроллируемый контейнер (scrollHeight === clientHeight) цикл не разрывает.
 *   2. Перезапуск идёт через микротаску (`tick().then`), поэтому каждый проход —
 *      НОВЫЙ цикл обновления. Предохранитель `effect_update_depth_exceeded`
 *      не срабатывает никогда, и в консоли нет ни одной ошибки.
 *   3. Вкладка просто перестаёт отвечать. Диагностировать нечем.
 *
 * Передача узла ПАРАМЕТРОМ — это чтение (`$.get`), а не мутация, поэтому
 * `$.mutate` не генерируется и цикл невозможен.
 *
 * Реальный инцидент: вход в любой личный чат вешал сайт (~20 000 перезапусков
 * блока в секунду). См. docs/CHANGELOG_CLAUDE.md, 2026-07-30.
 */
export function scrollToBottom(el: HTMLElement | null | undefined): void {
	if (!el) return;
	el.scrollTop = el.scrollHeight;
}

/** Насколько далеко от низа находится контейнер, в пикселях. */
export function distanceFromBottom(el: HTMLElement | null | undefined): number {
	if (!el) return 0;
	return el.scrollHeight - el.scrollTop - el.clientHeight;
}
