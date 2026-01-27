import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

export const load: PageServerLoad = async ({ locals }) => {
    // 1. Проверка прав (как в layout, но на всякий случай)
    if (!locals.user || !adminList.includes(locals.user.uid)) {
        throw error(403, 'Access Denied');
    }

    try {
        // 2. Читаем данные банка
        const bankDoc = await firestoreAdmin.collection('system').doc('casino_stats').get();
        const bankData = bankDoc.data();
        const bankBalance = bankData?.bank_balance || 0;

        // 3. Читаем статистику пользователей (опционально, для красоты)
        // count() - это дешевая агрегация
        const usersSnapshot = await firestoreAdmin.collection('users').count().get();
        const totalUsers = usersSnapshot.data().count;

        return {
            bankBalance,
            totalUsers
        };

    } catch (e) {
        console.error("Admin Dashboard Error:", e);
        return {
            bankBalance: 0,
            totalUsers: 0
        };
    }
};