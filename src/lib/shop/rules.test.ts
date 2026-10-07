import { describe, it, expect } from 'vitest';
import { isOnSale, isWithinWindow, toMillis, HIDDEN_ITEM_IDS } from './rules';

const at = (iso: string) => Date.parse(iso);
// Окно Хэллоуина: с 20 октября до начала 3 ноября по Москве
const halloween = { available_from: '2026-10-20T00:00:00+03:00', available_until: '2026-11-03T00:00:00+03:00' };

describe('Витрина: окно продаж', () => {
	it('без окна товар продаётся всегда', () => {
		expect(isOnSale('frame_neon_blue', {}, at('2026-10-07T12:00:00Z'))).toBe(true);
	});

	it('сезонный товар — только внутри окна, конец не включён', () => {
		expect(isOnSale('frame_cobweb', halloween, at('2026-10-19T23:59:59+03:00'))).toBe(false);
		expect(isOnSale('frame_cobweb', halloween, at('2026-10-20T00:00:00+03:00'))).toBe(true);
		expect(isOnSale('frame_cobweb', halloween, at('2026-11-02T23:59:59+03:00'))).toBe(true);
		expect(isOnSale('frame_cobweb', halloween, at('2026-11-03T00:00:00+03:00'))).toBe(false);
	});

	it('скрытые и призовые не продаются никогда', () => {
		for (const id of HIDDEN_ITEM_IDS) expect(isOnSale(id, {}, Date.now())).toBe(false);
		expect(isOnSale('frame_pumpkin_head', { ...halloween, is_hidden: true }, at('2026-10-25T12:00:00Z'))).toBe(false);
		// но окно приза при этом открыто — его разыгрывает Плинко
		expect(isWithinWindow({ ...halloween, is_hidden: true }, at('2026-10-25T12:00:00Z'))).toBe(true);
		// is_hidden: false — обычный товар
		expect(isOnSale('frame_neon_blue', { is_hidden: false }, Date.now())).toBe(true);
	});

	it('время читается из Timestamp Firestore, строки и числа', () => {
		expect(toMillis({ toMillis: () => 42 })).toBe(42);
		expect(toMillis('2026-10-20T00:00:00Z')).toBe(at('2026-10-20T00:00:00Z'));
		expect(toMillis(7)).toBe(7);
		expect(toMillis(undefined)).toBeNull();
		expect(toMillis('не дата')).toBeNull();
	});
});
