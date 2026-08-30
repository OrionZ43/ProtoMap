// src/lib/utils/chatFormat.ts
//
// Общие хелперы форматирования для личек. Раньше эти функции жили в двух
// копиях — в routes/messages/+page.svelte и в components/chat/DMInbox.svelte,
// и уже начали расходиться (в одной копии «только что», в другой «сейчас»).
//
// ВАЖНО: ничего отсюда не должно бросать. Всё это вызывается прямо из разметки,
// а исключение при рендере в Svelte разрушает всё дерево компонентов — падает
// не чат, а весь сайт (DMInbox живёт в корневом layout).

/** true только для «обычного» словаря — не массив, не null, не примитив. */
export function isPlainMap(v: unknown): v is Record<string, string> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidDate(d: unknown): d is Date {
	return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Нормализуем регистр типа сообщения. Android пишет TEXT/VOICE, старый веб
 * писал text/voice — приводим к одному виду, чтобы ветвление в разметке было
 * одно, а не по два условия на каждый тип.
 */
export function mtype(t: string | null | undefined): string {
	return (t ?? 'TEXT').toUpperCase();
}

/** Время сообщения: 14:02 */
export function fmtTime(date: Date): string {
	if (!isValidDate(date)) return '';
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Относительное время для списка диалогов: «сейчас» / «5 мин» / 14:02 / 3 авг. */
export function fmtRelative(date: Date | null): string {
	if (!isValidDate(date)) return '';
	const d = Date.now() - date.getTime();
	if (d < 60_000) return 'сейчас';
	if (d < 3_600_000) return `${Math.floor(d / 60_000)} мин`;
	if (d < 86_400_000) return fmtTime(date);
	return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function isSameDay(a: Date, b: Date): boolean {
	if (!isValidDate(a) || !isValidDate(b)) return false;
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** Разделитель дня: Сегодня / Вчера / 3 августа */
export function dayLabel(date: Date): string {
	if (!isValidDate(date)) return '';
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	if (isSameDay(date, today)) return 'Сегодня';
	if (isSameDay(date, yesterday)) return 'Вчера';
	return date.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}

/** Нужен ли разделитель дня перед этим сообщением. */
export function needsDaySeparator(current: Date, prev: Date | undefined): boolean {
	if (!prev) return true;
	if (!isValidDate(current) || !isValidDate(prev)) return false;
	return !isSameDay(current, prev);
}

export function avatarFor(username: string, url: string | null | undefined): string {
	return (
		url ||
		`https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username || 'proto')}`
	);
}

/** [эмодзи, сколько раз] — безопасно для любого содержимого поля reactions. */
export function countReactions(r: unknown): [string, number][] {
	if (!isPlainMap(r)) return [];
	const c: Record<string, number> = {};
	Object.values(r).forEach((e) => {
		const key = String(e);
		c[key] = (c[key] ?? 0) + 1;
	});
	return Object.entries(c);
}

/** Сколько всего реакций — безопасно для любого содержимого поля. */
export function reactionCount(r: unknown): number {
	return isPlainMap(r) ? Object.keys(r).length : 0;
}

export type PreviewKind = 'image' | 'voice' | 'sticker' | 'text';

// Маркеры типа во превью последнего сообщения.
//
// ВАЖНО: эмодзи здесь — это не оформление, а машинный маркер в данных.
// Поле chats/{id}.lastMessage пишут ОБА клиента, и Android пишет ровно такие
// же строки. Если веб перестанет их писать, список диалогов не сможет отличить
// картинку от текста — в документе чата типа сообщения нет, есть только эта
// строка. Поэтому пишем как писали, а наружу эмодзи не показываем никогда:
// previewKind() разбирает строку на тип и текст, а иконку рисует ChatList.
const PREVIEW_MARKERS: [string, PreviewKind, string][] = [
	['📷', 'image', 'Изображение'],
	['🎙', 'voice', 'Голосовое'],
	['🌟', 'sticker', 'Стикер']
];

/**
 * Разбирает сохранённое превью на тип и чистый текст.
 * Понимает и то, что пишет веб, и то, что пишет Android.
 */
export function previewKind(lastMessage: string | null | undefined): {
	kind: PreviewKind;
	text: string;
} {
	const raw = (lastMessage ?? '').trim();
	for (const [marker, kind, label] of PREVIEW_MARKERS) {
		if (raw.startsWith(marker)) {
			return { kind, text: raw.slice(marker.length).trim() || label };
		}
	}
	return { kind: 'text', text: raw };
}

/** Превью последнего сообщения для списка диалогов. */
export function previewFor(type: string, text: string): string {
	switch (mtype(type)) {
		case 'IMAGE':
			return '📷 Изображение';
		case 'VOICE':
			return '🎙 Голосовое';
		case 'STICKER':
			return '🌟 Стикер';
		default:
			return text ?? '';
	}
}

export const QUICK_EMOJI = ['❤️', '🔥', '😂', '👍', '😮'];
