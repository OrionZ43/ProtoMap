import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';
import { FieldValue } from 'firebase-admin/firestore';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    if (!adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ. Уровень допуска: "Смертный". Возвращайтесь в песочницу.');
    }

    return {
        user: locals.user
    };
};

export const actions: Actions = {
    search: async ({ request }) => {
        const data = await request.formData();
        const query = (data.get('query') as string).trim();

        if (!query) return fail(400, { message: 'Введите имя цели' });

        try {
            const usersRef = firestoreAdmin.collection('users');

            const snapshot = await usersRef
                .where('username', '>=', query)
                .where('username', '<=', query + '\uf8ff')
                .limit(5)
                .get();

            if (snapshot.empty) {
                return fail(404, { message: 'Цель не обнаружена в этом измерении.' });
            }

            if (snapshot.size === 1 && snapshot.docs[0].data().username === query) {
                const doc = snapshot.docs[0];
                const userData = doc.data();
                return {
                    success: true,
                    target: {
                        uid: doc.id,
                        username: userData.username,
                        email: userData.email,
                        casino_credits: userData.casino_credits || 0,
                        avatar_url: userData.avatar_url,
                        owned_items: userData.owned_items || [],
                        isBanned: userData.isBanned || false
                    }
                };
            }

            const candidates = snapshot.docs.map(doc => ({
                username: doc.data().username,
                uid: doc.id,
                avatar_url: doc.data().avatar_url
            }));

            return { success: true, candidates };

        } catch (err) {
            console.error(err);
            return fail(500, { message: 'Ошибка сканирования базы данных.' });
        }
    },

    modifyCredits: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);

        const data = await request.formData();
        const targetUid = data.get('uid') as string;
        const amount = parseInt(data.get('amount') as string);

        if (!targetUid || isNaN(amount)) return fail(400);

        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                casino_credits: FieldValue.increment(amount)
            });
            return { actionSuccess: true, message: `Баланс изменен на ${amount > 0 ? '+' : ''}${amount} PC` };
        } catch (e) {
            return fail(500, { message: 'Ошибка транзакции' });
        }
    },

    grantAllItems: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);

        const data = await request.formData();
        const targetUid = data.get('uid') as string;

        const allFrames = [
            'frame_neon_blue', 'frame_glitch', 'frame_high_roller',
            'frame_biohazard', 'frame_plasma', 'frame_stealth'
        ];

        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                owned_items: FieldValue.arrayUnion(...allFrames)
            });
            return { actionSuccess: true, message: 'Выдан полный пакет кастомизации.' };
        } catch (e) {
            return fail(500, { message: 'Ошибка выдачи предметов' });
        }
    },

    banUser: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);

        const data = await request.formData();
        const targetUid = data.get('uid') as string;
        const reason = data.get('reason') as string;

        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                isBanned: true,
                banReason: reason || 'Нарушение правил сообщества.',
                bannedAt: FieldValue.serverTimestamp()
            });

            return { actionSuccess: true, message: 'СУБЪЕКТ ИЗОЛИРОВАН.' };
        } catch (e) {
            return fail(500, { message: 'Сбой протокола блокировки.' });
        }
    },

    unbanUser: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);
        const data = await request.formData();
        const targetUid = data.get('uid') as string;

        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                isBanned: false,
                banReason: FieldValue.delete(),
                bannedAt: FieldValue.delete()
            });
            return { actionSuccess: true, message: 'СУБЪЕКТ ВОССТАНОВЛЕН В ПРАВАХ.' };
        } catch (e) {
            return fail(500, { message: 'Ошибка разблокировки.' });
        }
    }
};