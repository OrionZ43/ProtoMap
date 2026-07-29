// Регрессия: зависание сайта при входе в чат.
//
// `bind:this` в legacy-режиме — это `mutable_source`. Запись в СВОЙСТВО такой
// переменной (`el.scrollTop = ...`) компилируется в `$.mutate(el, ...)`, что
// инвалидирует саму переменную. Если её же читает реактивный блок — получается
// бесконечный цикл через микротаску, без единой ошибки в консоли.
//
// Обычным рантайм-тестом это не поймать: цикл вешает поток, то есть тест не
// упадёт, а зависнет (в CI это хуже красного теста). Поэтому проверяем
// СКОМПИЛИРОВАННЫЙ код: в компонентах чата не должно быть `$.mutate` по
// переменным-контейнерам прокрутки.
import { describe, it, expect } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { scrollToBottom, distanceFromBottom } from './scroll';

const COMPONENTS: { file: string; containers: string[] }[] = [
	{ file: 'src/routes/messages/+page.svelte', containers: ['messagesWindow'] },
	{ file: 'src/lib/components/chat/DMInbox.svelte', containers: ['messagesWindow'] },
	{ file: 'src/lib/components/chat/GlobalChat.svelte', containers: ['messagesWindow'] },
	{ file: 'src/lib/components/chat/ChannelsFeed.svelte', containers: ['postsContainer'] }
];

/**
 * Комментарии компилятор переносит в вывод, а они у нас как раз описывают
 * `$.mutate(...)` словами — иначе тест ловил бы собственную документацию.
 * Убираем только целые строки-комментарии и блочные: так строковые литералы
 * с `//` (URL-ы в разметке) остаются целыми.
 */
function stripComments(code: string): string {
	return code
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((l) => !l.trim().startsWith('//'))
		.join('\n');
}

function compileClient(file: string): string {
	const src = readFileSync(file, 'utf8').replace(/<style>[\s\S]*<\/style>/, '');
	return stripComments(compile(src, { generate: 'client', runes: false, filename: file }).js.code);
}

describe('прокрутка не инвалидирует bind:this-переменную', () => {
	for (const { file, containers } of COMPONENTS) {
		for (const name of containers) {
			it(`${file}: нет $.mutate(${name})`, () => {
				const code = compileClient(file);
				// Страховка от «зелёного впустую»: если переменную переименуют,
				// тест должен упасть, а не молча проверять несуществующее имя.
				// Как именно Svelte её оформляет (mutable_source / source / let) —
				// деталь реализации, на неё не опираемся: важно лишь отсутствие мутаций.
				expect(code).toContain(name);
				const mutations = [...code.matchAll(new RegExp(`\\$\\.mutate\\(\\s*${name}\\b`, 'g'))];
				expect(
					mutations.length,
					`Найдено ${mutations.length} $.mutate(${name}) — прокручивай через ` +
						`scrollToBottom(${name}) из $lib/utils/scroll, иначе вернётся зависание.`
				).toBe(0);
			});
		}
	}
});

describe('scrollToBottom / distanceFromBottom', () => {
	const makeEl = (scrollHeight: number, clientHeight: number, scrollTop = 0) =>
		({ scrollHeight, clientHeight, scrollTop }) as HTMLElement;

	it('прокручивает вниз', () => {
		const el = makeEl(1000, 300);
		scrollToBottom(el);
		expect(el.scrollTop).toBe(1000);
	});

	it('не падает на null/undefined', () => {
		expect(() => scrollToBottom(null)).not.toThrow();
		expect(() => scrollToBottom(undefined)).not.toThrow();
		expect(distanceFromBottom(null)).toBe(0);
	});

	it('считает расстояние до низа', () => {
		expect(distanceFromBottom(makeEl(1000, 300, 700))).toBe(0);
		expect(distanceFromBottom(makeEl(1000, 300, 500))).toBe(200);
		// Нескроллируемый контейнер — ровно тот случай из инцидента
		expect(distanceFromBottom(makeEl(729, 729, 0))).toBe(0);
	});
});
