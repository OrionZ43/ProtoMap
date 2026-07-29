import { describe, it, expect } from 'vitest';
import { toJsDate, toJsDateOr } from './firestoreDate';

describe('toJsDate', () => {
	it('converts a Firestore Timestamp via toDate()', () => {
		const d = new Date('2026-03-01T12:00:00Z');
		expect(toJsDate({ toDate: () => d })).toEqual(d);
	});

	it('returns null for null / undefined (pending serverTimestamp)', () => {
		expect(toJsDate(null)).toBeNull();
		expect(toJsDate(undefined)).toBeNull();
	});

	it('converts epoch millis — Android System.currentTimeMillis()', () => {
		const ms = 1750000000000;
		expect(toJsDate(ms)?.getTime()).toBe(ms);
	});

	it('converts an ISO string', () => {
		expect(toJsDate('2026-01-01T10:00:00Z')?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
	});

	it('passes a Date through', () => {
		const d = new Date();
		expect(toJsDate(d)).toBe(d);
	});

	it('converts a JSON-serialised Timestamp ({ seconds })', () => {
		expect(toJsDate({ seconds: 1750000000, nanoseconds: 0 })?.getTime()).toBe(1750000000000);
		expect(toJsDate({ _seconds: 1750000000 })?.getTime()).toBe(1750000000000);
	});

	it('returns null instead of throwing on garbage', () => {
		expect(toJsDate('not a date')).toBeNull();
		expect(toJsDate(NaN)).toBeNull();
		expect(toJsDate({})).toBeNull();
		expect(toJsDate([])).toBeNull();
		expect(toJsDate(new Date('nope'))).toBeNull();
		expect(toJsDate({ toDate: () => { throw new Error('boom'); } })).toBeNull();
		expect(toJsDate({ toDate: () => 'not-a-date' })).toBeNull();
	});

	it('toJsDateOr falls back without throwing', () => {
		const fb = new Date('2000-01-01T00:00:00Z');
		expect(toJsDateOr(null, fb)).toBe(fb);
		expect(toJsDateOr('garbage', fb)).toBe(fb);
		expect(toJsDateOr(1750000000000, fb).getTime()).toBe(1750000000000);
	});
});
