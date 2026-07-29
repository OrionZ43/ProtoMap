// src/lib/utils/firestoreDate.ts
//
// Приведение поля даты из Firestore к JS Date.
//
// ЗАЧЕМ: `doc.data().createdAt` — НЕ всегда Timestamp. Реально встречается:
//   • Timestamp            — веб пишет через serverTimestamp()
//   • null                 — pending serverTimestamp (локальный снапшот до подтверждения сервером)
//   • number               — epoch millis (Android-клиент, System.currentTimeMillis())
//   • string               — ISO-строка (легаси-документы)
//
// Опциональная цепочка `data.createdAt?.toDate()` защищает ТОЛЬКО от null/undefined:
// на числе или строке `.toDate` === undefined, и вызов падает с TypeError.
// Один такой документ ронял весь маппинг снапшота (Array.map бросает целиком),
// поэтому нормализуем в одном месте.

type FirestoreDateLike =
	| { toDate: () => Date }
	| Date
	| number
	| string
	| null
	| undefined;

/** Возвращает Date или null. Никогда не бросает. */
export function toJsDate(value: unknown): Date | null {
	if (value == null) return null;

	// Firestore Timestamp (или что угодно с toDate())
	if (typeof (value as { toDate?: unknown }).toDate === 'function') {
		try {
			const d = (value as { toDate: () => Date }).toDate();
			return d instanceof Date && !isNaN(d.getTime()) ? d : null;
		} catch {
			return null;
		}
	}

	if (value instanceof Date) {
		return isNaN(value.getTime()) ? null : value;
	}

	// epoch millis / ISO-строка
	if (typeof value === 'number' || typeof value === 'string') {
		const d = new Date(value);
		return isNaN(d.getTime()) ? null : d;
	}

	// Сырой объект вида { seconds, nanoseconds } — так выглядит Timestamp,
	// прошедший через JSON (например, из кэша или из REST-ответа).
	const raw = value as { seconds?: unknown; _seconds?: unknown };
	const secs = typeof raw.seconds === 'number' ? raw.seconds : raw._seconds;
	if (typeof secs === 'number') {
		const d = new Date(secs * 1000);
		return isNaN(d.getTime()) ? null : d;
	}

	return null;
}

/** То же, но с фолбеком — для полей, где UI требует непустую дату. */
export function toJsDateOr(value: unknown, fallback: Date): Date {
	return toJsDate(value) ?? fallback;
}

export type { FirestoreDateLike };
