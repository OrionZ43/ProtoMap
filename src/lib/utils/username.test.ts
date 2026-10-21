import { describe, expect, it } from 'vitest';
import { USERNAME_PATTERN, isReservedUsername, usernameFromDisplayName } from './username';

describe('USERNAME_PATTERN', () => {
	it('принимает латиницу, цифры и _ от 4 до 20 символов', () => {
		expect(USERNAME_PATTERN.test('Proto_42')).toBe(true);
		expect(USERNAME_PATTERN.test('abcd')).toBe(true);
		expect(USERNAME_PATTERN.test('a'.repeat(20))).toBe(true);
	});

	it('отклоняет кириллицу, пробелы и неверную длину', () => {
		expect(USERNAME_PATTERN.test('Протоген')).toBe(false);
		expect(USERNAME_PATTERN.test('Proto Gen')).toBe(false);
		expect(USERNAME_PATTERN.test('abc')).toBe(false);
		expect(USERNAME_PATTERN.test('a'.repeat(21))).toBe(false);
	});
});

describe('isReservedUsername', () => {
	it('ищет запретное слово как подстроку без учёта регистра', () => {
		expect(isReservedUsername('ProtoMapHelper')).toBe(true);
		expect(isReservedUsername('Robotron')).toBe(true);
		expect(isReservedUsername('Kitsune')).toBe(false);
	});
});

describe('usernameFromDisplayName', () => {
	const uid = 'AbCdEfGh12345678';

	it('берёт имя аккаунта без лишних символов', () => {
		expect(usernameFromDisplayName('Kit Sune!', uid)).toBe('KitSune');
	});

	it('обрезает до 15 символов под суффикс', () => {
		expect(usernameFromDisplayName('A'.repeat(30), uid)).toBe('A'.repeat(15));
	});

	it('делает user_<uid8>, если имени не хватает или оно запретное', () => {
		expect(usernameFromDisplayName('Денис', uid)).toBe('user_AbCdEfGh');
		expect(usernameFromDisplayName(null, uid)).toBe('user_AbCdEfGh');
		expect(usernameFromDisplayName('ProtoMap Admin', uid)).toBe('user_AbCdEfGh');
	});
});
