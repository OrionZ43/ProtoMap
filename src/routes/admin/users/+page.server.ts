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

        const allItems = [
            'frame_neon_blue', 'frame_glitch', 'frame_high_roller',
            'frame_biohazard', 'frame_plasma', 'frame_stealth',
            'frame_cryo', 'frame_festive', 'frame_aurora', 'frame_ludoman',
            'bg_carbon', 'bg_matrix', 'bg_synthwave'
        ];

        try {
            await firestoreAdmin.collection('users').doc(targetUid).update({
                owned_items: FieldValue.arrayUnion(...allItems)
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
    },

    migrate: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);

        const data = await request.formData();
        const sourceUid = (data.get('sourceUid') as string).trim();
        const targetUid = (data.get('targetUid') as string).trim();

        if (!sourceUid || !targetUid || sourceUid === targetUid) {
            return fail(400, { message: 'Некорректные ID аккаунтов.' });
        }

        const sourceRef = firestoreAdmin.collection('users').doc(sourceUid);
        const targetRef = firestoreAdmin.collection('users').doc(targetUid);

        try {
            await firestoreAdmin.runTransaction(async (t) => {
                const sourceDoc = await t.get(sourceRef);
                const targetDoc = await t.get(targetRef);

                if (!sourceDoc.exists || !targetDoc.exists) {
                    throw new Error('Один из аккаунтов не найден.');
                }

                const sourceData = sourceDoc.data()!;
                const targetData = targetDoc.data()!;

                const newCredits = (targetData.casino_credits || 0) + (sourceData.casino_credits || 0);

                const sourceItems = sourceData.owned_items || [];
                const targetItems = targetData.owned_items || [];
                const newItems = [...new Set([...sourceItems, ...targetItems])];

                const newStreak = Math.max(sourceData.daily_streak || 0, targetData.daily_streak || 0);

                const newAvatar = targetData.avatar_url || sourceData.avatar_url;

                t.update(targetRef, {
                    casino_credits: newCredits,
                    owned_items: newItems,
                    daily_streak: newStreak,
                    avatar_url: newAvatar,
                    migratedFrom: sourceUid,
                    migratedAt: FieldValue.serverTimestamp()
                });

                t.update(sourceRef, {
                    casino_credits: 0,
                    daily_streak: 0,
                    isBanned: true,
                    banReason: `MIGRATED TO: ${targetUid}`,
                    username: `MIGRATED_${sourceData.username}`,
                    status: "ACCOUNT_TRANSFER_COMPLETE"
                });
            });

            const locQuery = await firestoreAdmin.collection('locations').where('user_id', '==', sourceUid).get();
            if (!locQuery.empty) {
                const batch = firestoreAdmin.batch();
                locQuery.docs.forEach(doc => {
                    batch.update(doc.ref, { user_id: targetUid });
                });
                await batch.commit();
            }

            return { actionSuccess: true, message: `Миграция успешна! ${sourceUid} -> ${targetUid}` };

        } catch (e: any) {
            console.error("Migration Error:", e);
            return fail(500, { message: `Ошибка: ${e.message}` });
        }
    }
};