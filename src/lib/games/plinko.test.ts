import { describe, it, expect } from 'vitest';
import {
	PLINKO_ROWS,
	PLINKO_PAYOUT_TENTHS,
	PLINKO_MIN_BET,
	PLINKO_MAX_BET_CAP,
	PLINKO_PRIZE_SLOTS,
	PLINKO_PRIZE_ITEM,
	PLINKO_OPENS_AT,
	isPlinkoPrizeOpen,
	isPlinkoOpen,
	plinkoMaxBet,
	plinkoPayout,
	dropBall
} from './plinko';

const binom = (n: number, k: number) => {
	let r = 1;
	for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
	return r;
};
const chance = (slot: number) => binom(PLINKO_ROWS, slot) / 2 ** PLINKO_ROWS;
const multiplier = (slot: number) => PLINKO_PAYOUT_TENTHS[slot] / 10;
const slots = PLINKO_PAYOUT_TENTHS.map((_, slot) => slot);

describe('Плинко: таблица выплат', () => {
	it('по лунке на каждое число отскоков вправо, края одинаковые', () => {
		expect(PLINKO_PAYOUT_TENTHS).toHaveLength(PLINKO_ROWS + 1);
		expect([...PLINKO_PAYOUT_TENTHS].reverse()).toEqual([...PLINKO_PAYOUT_TENTHS]);
	});

	// Возврат не выше, чем у существующих игр: слоты ~91,5%, монетка 97,5%.
	it('возврат 89,6% — ниже слотов', () => {
		const rtp = slots.reduce((sum, slot) => sum + chance(slot) * multiplier(slot), 0);
		expect(rtp).toBeCloseTo(0.8964, 4);
		expect(rtp).toBeLessThan(0.915);
	});

	it('четыре шарика из пяти теряют часть ставки', () => {
		const losing = slots.filter((slot) => multiplier(slot) < 1);
		const p = losing.reduce((sum, slot) => sum + chance(slot), 0);
		expect(p).toBeGreaterThan(0.78);
		expect(p).toBeLessThan(0.8);
	});

	it('на минимальной ставке выплаты целые, без потерь на округлении', () => {
		for (const slot of slots) {
			expect(plinkoPayout(PLINKO_MIN_BET, slot) * 10).toBe(PLINKO_MIN_BET * PLINKO_PAYOUT_TENTHS[slot]);
		}
	});
});

describe('Плинко: лимит ставки от банка', () => {
	it('ставка за шарик — 0,1% банка', () => {
		expect(plinkoMaxBet(73_056)).toBe(73);
	});

	it('у лимита есть потолок', () => {
		expect(plinkoMaxBet(10_000_000)).toBe(PLINKO_MAX_BET_CAP);
	});

	it('пустой или битый банк закрывает игру', () => {
		expect(plinkoMaxBet(0)).toBe(0);
		expect(plinkoMaxBet(-500)).toBe(0);
		expect(plinkoMaxBet(Number.NaN)).toBe(0);
		expect(plinkoMaxBet(9_999)).toBeLessThan(PLINKO_MIN_BET);
	});

	it('один шарик не забирает больше 5% банка', () => {
		for (const bank of [10_000, 73_056, 499_999, 5_000_000]) {
			const best = Math.max(...slots.map((slot) => plinkoPayout(plinkoMaxBet(bank), slot)));
			expect(best).toBeLessThanOrEqual(bank * 0.05);
		}
	});
});

describe('Плинко: шарик', () => {
	it('лунка — число отскоков вправо', () => {
		const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0];
		let i = 0;
		const ball = dropBall(() => bits[i++]);
		expect(ball.path).toEqual(bits);
		expect(ball.slot).toBe(8);
	});

	it('крайние лунки — все отскоки в одну сторону', () => {
		expect(dropBall(() => 0).slot).toBe(0);
		expect(dropBall(() => 1).slot).toBe(PLINKO_ROWS);
		expect(dropBall(() => 1).path).toHaveLength(PLINKO_ROWS);
	});
});

describe('Плинко: открытие', () => {
	it('открывается в полночь 20 октября по Минску и не закрывается', () => {
		expect(isPlinkoOpen(Date.parse('2026-10-19T23:59:59+03:00'))).toBe(false);
		expect(isPlinkoOpen(Date.parse('2026-10-20T00:00:00+03:00'))).toBe(true);
		expect(isPlinkoOpen(Date.parse('2027-03-01T12:00:00Z'))).toBe(true);
		expect(new Date(PLINKO_OPENS_AT).toISOString()).toBe('2026-10-19T21:00:00.000Z');
	});
});

describe('Плинко: приз ивента', () => {
	it('крайние лунки ×12 и выше — 274 из 65 536, примерно 1 из 239', () => {
		for (const slot of PLINKO_PRIZE_SLOTS) expect(multiplier(slot)).toBeGreaterThanOrEqual(12);
		const p = PLINKO_PRIZE_SLOTS.reduce((sum, slot) => sum + chance(slot), 0);
		expect(p * 2 ** PLINKO_ROWS).toBeCloseTo(274, 6);
	});

	it('приз в игре, пока открыто окно и рамки у игрока нет', () => {
		const prize = { is_hidden: true, available_from: '2026-10-20T00:00:00+03:00', available_until: '2026-11-03T00:00:00+03:00' };
		const during = Date.parse('2026-10-25T12:00:00Z');
		expect(isPlinkoPrizeOpen(prize, [], during)).toBe(true);
		expect(isPlinkoPrizeOpen(prize, [PLINKO_PRIZE_ITEM], during)).toBe(false);
		expect(isPlinkoPrizeOpen(prize, [], Date.parse('2026-11-03T00:00:00+03:00'))).toBe(false);
		// нет документа приза — нет и приза
		expect(isPlinkoPrizeOpen(undefined, [], during)).toBe(false);
	});
});
