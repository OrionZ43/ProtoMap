import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { PageServerLoad } from './$types';

/**
 * Сколько меток на карте — единственное, что нужно витрине.
 *
 * Считается агрегатным запросом, а не выборкой документов: `count()` тарифицируется
 * как одно чтение независимо от размера коллекции.
 *
 * Ответ кэшируется на час. Страница входа открывается часто, а число меняется
 * редко; без кэша это было бы чтение Firestore на каждый показ ради цифры,
 * которая никому не важна с точностью до единицы.
 */
export const load: PageServerLoad = async ({ setHeaders }) => {
    setHeaders({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

    try {
        const snap = await firestoreAdmin.collection('locations').count().get();
        return { protogens: snap.data().count };
    } catch (e) {
        // Витрина — украшение. Если счётчик не достался, показывается
        // текстовая подпись, и страница входа работает как ни в чём не бывало.
        console.error('[auth] Не удалось получить число меток:', e);
        return { protogens: null };
    }
};
