import { redirect } from '@sveltejs/kit';
import { firestoreAdmin } from '$lib/server/firebase.admin';
import { plinkoMaxBet, isPlinkoPrizeOpen, isPlinkoOpen, PLINKO_PRIZE_ITEM } from '$lib/games/plinko';
import { seasonNow } from '$lib/seasonal/seasons';
import { previewShopItems } from '$lib/server/seasonPreview';
import type { PageServerLoad } from './$types';

// Банк казино правила отдают только админам, поэтому читаем его здесь, сервером.
// Игроку уходит только лимит ставки за шарик, сумма банка остаётся на сервере.
// Приз ивента виден, пока открыто окно призового предмета и у игрока его нет;
// выдаёт его всё равно только playPlinko.
export const load: PageServerLoad = async ({ locals }) => {
    // До открытия (20 октября) игры нет: ни в лобби, ни по прямой ссылке
    if (!isPlinkoOpen(seasonNow().getTime())) throw redirect(303, '/casino');

    try {
        const [bankDoc, prizeDoc, userDoc] = await Promise.all([
            firestoreAdmin.collection('system').doc('casino_stats').get(),
            firestoreAdmin.collection('shop_items').doc(PLINKO_PRIZE_ITEM).get(),
            locals.user ? firestoreAdmin.collection('users').doc(locals.user.uid).get() : null
        ]);
        const bank = Number(bankDoc.data()?.bank_balance);
        const owned: string[] = userDoc?.data()?.owned_items || [];
        // На дев-сервере с подменой даты приз берётся из каталога, пока его нет в базе.
        const prize = prizeDoc.data() ?? (await previewShopItems()).get(PLINKO_PRIZE_ITEM);
        const prizeAvailable = isPlinkoPrizeOpen(prize, owned, seasonNow().getTime());
        return { maxBet: Number.isFinite(bank) ? plinkoMaxBet(bank) : null, prizeAvailable };
    } catch (error) {
        console.error('[PLINKO] Не удалось прочитать банк казино:', error);
        return { maxBet: null, prizeAvailable: false };
    }
};
