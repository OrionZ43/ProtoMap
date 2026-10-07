import { describe, it, expect } from 'vitest';
import { getSeason, getThemeSeason, isAprilFools } from './seasons';

const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe('Сезоны: границы дат', () => {
	it('Хэллоуин — с 20 октября по 2 ноября включительно', () => {
		expect(getSeason(on('2026-10-19'))).toBeNull();
		expect(getSeason(on('2026-10-20'))).toBe('halloween');
		expect(getSeason(on('2026-10-31'))).toBe('halloween');
		expect(getSeason(on('2026-11-02'))).toBe('halloween');
		expect(getSeason(on('2026-11-03'))).toBeNull();
	});

	it('Зима — 1–14 декабря, Новый год — с 15 декабря по 14 января', () => {
		expect(getSeason(on('2026-11-30'))).toBeNull();
		expect(getSeason(on('2026-12-01'))).toBe('winter');
		expect(getSeason(on('2026-12-14'))).toBe('winter');
		expect(getSeason(on('2026-12-15'))).toBe('newyear');
		expect(getSeason(on('2027-01-14'))).toBe('newyear');
		expect(getSeason(on('2027-01-15'))).toBeNull();
	});

	it('Годовщина — 4–10 мая', () => {
		expect(getSeason(on('2026-05-03'))).toBeNull();
		expect(getSeason(on('2026-05-04'))).toBe('anniversary');
		expect(getSeason(on('2026-05-10'))).toBe('anniversary');
		expect(getSeason(on('2026-05-11'))).toBeNull();
	});

	it('Первое апреля — сезон без темы', () => {
		expect(getSeason(on('2026-04-01'))).toBe('april');
		expect(getThemeSeason(on('2026-04-01'))).toBeNull();
		expect(isAprilFools(on('2026-04-01'))).toBe(true);
		expect(isAprilFools(on('2026-04-02'))).toBe(false);
	});

	it('у тематических сезонов getThemeSeason совпадает с getSeason', () => {
		for (const iso of ['2026-10-25', '2026-12-05', '2026-12-31', '2026-05-07']) {
			expect(getThemeSeason(on(iso))).toBe(getSeason(on(iso)));
		}
	});
});
