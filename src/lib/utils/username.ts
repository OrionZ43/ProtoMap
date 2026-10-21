/**
 * Правила ника — те же, что у функций checkUsername и changeUsername
 * (functions/src/index.ts): латиница, цифры и _, от 4 до 20 символов, без
 * подстрок, под которыми можно выдать себя за администрацию. Пока сайт
 * проверял только длину, с него регистрировались ники, которые потом нельзя
 * было сменить ни на что похожее.
 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{4,20}$/;

const RESERVED_WORDS = ['admin', 'moderator', 'system', 'root', 'support', 'protomap', 'owner', 'dev', 'bot'];

export function isReservedUsername(name: string): boolean {
	const lower = name.toLowerCase();
	return RESERVED_WORDS.some((word) => lower.includes(word));
}

/**
 * Ник для входа через Google: имя аккаунта без лишних символов, иначе
 * user_<первые 8 символов uid>. 15 символов оставляют место для суффикса
 * «_NNNN», если ник занят.
 */
export function usernameFromDisplayName(displayName: string | null | undefined, uid: string): string {
	const base = (displayName ?? '').replace(/[^a-zA-Z0-9_]/g, '').substring(0, 15);
	return base.length >= 4 && !isReservedUsername(base) ? base : `user_${uid.substring(0, 8)}`;
}
