// src/routes/admin/users/+page.server.ts

import { firestoreAdmin, authAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';
import { FieldValue } from 'firebase-admin/firestore';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

// Централизованная проверка прав — вызывается в каждом action
function assertAdmin(locals: App.Locals) {
    if (!locals.user || !adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ.');
    }
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    if (!adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ. Уровень допуска: "Смертный". Возвращайтесь в песочницу.');
    }
    return { user: locals.user };
};

export const actions: Actions = {

    search: async ({ request, locals }) => {
        assertAdmin(locals);
        const data  = await request.formData();
        const query = (data.get('query') as string ?? '').trim();

        if (!query) return fail(400, { message: 'Введите имя цели' });

        try {
            const usersRef = firestoreAdmin.collection('users');

            const exactSnapshot = await usersRef.where('username', '==', query).limit(1).get();
            if (!exactSnapshot.empty) {
                const doc      = exactSnapshot.docs[0];
                const userData = doc.data();
                // Получаем статус emailVerified из Firebase Auth
                const authUser = await authAdmin.getUser(doc.id).catch(() => null);
                return {
                    success: true,
                    target: {
                        uid:            doc.id,
                        username:       userData.username,
                        email:          userData.email,
                        emailVerified:  authUser?.emailVerified ?? false,
                        casino_credits: userData.casino_credits || 0,
                        avatar_url:     userData.avatar_url,
                        owned_items:    userData.owned_items || [],
                        isBanned:       userData.isBanned || false,
                        telegram_id:    userData.telegram_id ?? null,
                        createdAt:      userData.createdAt?.toDate?.()?.toLocaleDateString('ru') ?? '—',
                    }
                };
            }

            const snapshot = await usersRef
                .where('username', '>=', query)
                .where('username', '<=', query + '\uf8ff')
                .limit(5).get();

            if (snapshot.empty) return fail(404, { message: 'Цель не обнаружена в этом измерении.' });

            const candidates = snapshot.docs.map(doc => ({
                username:  doc.data().username,
                uid:       doc.id,
                avatar_url: doc.data().avatar_url
            }));

            return { success: true, candidates };

        } catch (err) {
            console.error(err);
            return fail(500, { message: 'Ошибка сканирования базы данных.' });
        }
    },

    modifyCredits: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const amount    = parseInt(data.get('amount') as string);
        if (!targetUid || isNaN(amount)) return fail(400, { message: 'Некорректные параметры.' });
        // Защита: нельзя начислять себе
        if (targetUid === locals.user!.uid) return fail(403, { message: 'Нельзя изменять собственный баланс.' });
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
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        if (!targetUid) return fail(400);
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

    // 🆕 Принудительная верификация email
    verifyEmail: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        if (!targetUid) return fail(400, { message: 'UID не указан.' });
        try {
            await authAdmin.updateUser(targetUid, { emailVerified: true });
            console.log(`[ADMIN] Email verified for uid=${targetUid} by admin=${locals.user!.uid}`);
            return { actionSuccess: true, message: 'EMAIL ВЕРИФИЦИРОВАН ПРИНУДИТЕЛЬНО.' };
        } catch (e: any) {
            return fail(500, { message: 'Ошибка верификации: ' + e.message });
        }
    },

    banUser: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        const reason    = (data.get('reason') as string ?? '').trim();
        if (!targetUid) return fail(400);
        // Защита: нельзя банить самого себя и других админов
        if (targetUid === locals.user!.uid) return fail(403, { message: 'Нельзя заблокировать самого себя.' });
        if (adminList.includes(targetUid))  return fail(403, { message: 'Нельзя заблокировать администратора.' });
        try {
            await authAdmin.setCustomUserClaims(targetUid, { banned: true });
            await authAdmin.revokeRefreshTokens(targetUid);
            await firestoreAdmin.collection('users').doc(targetUid).update({
                isBanned:  true,
                banReason: reason || 'Нарушение протоколов сети.',
                bannedAt:  FieldValue.serverTimestamp()
            });
            console.log(`[ADMIN] Banned uid=${targetUid} reason="${reason}" by admin=${locals.user!.uid}`);
            return { actionSuccess: true, message: 'СУБЪЕКТ ИЗОЛИРОВАН (TOKEN REVOKED).' };
        } catch (e: any) {
            return fail(500, { message: 'Сбой протокола блокировки: ' + e.message });
        }
    },

    unbanUser: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const targetUid = (data.get('uid') as string ?? '').trim();
        if (!targetUid) return fail(400);
        try {
            await authAdmin.setCustomUserClaims(targetUid, { banned: false });
            await firestoreAdmin.collection('users').doc(targetUid).update({
                isBanned:  false,
                banReason: FieldValue.delete(),
                bannedAt:  FieldValue.delete()
            });
            return { actionSuccess: true, message: 'СУБЪЕКТ ВОССТАНОВЛЕН В ПРАВАХ.' };
        } catch (e: any) {
            return fail(500, { message: 'Ошибка разблокировки: ' + e.message });
        }
    },

    migrate: async ({ request, locals }) => {
        assertAdmin(locals);
        const data      = await request.formData();
        const sourceUid = (data.get('sourceUid') as string ?? '').trim();
        const targetUid = (data.get('targetUid') as string ?? '').trim();
        if (!sourceUid || !targetUid || sourceUid === targetUid) {
            return fail(400, { message: 'Некорректные ID аккаунтов.' });
        }
        // Нельзя мигрировать аккаунт другого админа
        if (adminList.includes(sourceUid)) return fail(403, { message: 'Нельзя мигрировать аккаунт администратора.' });

        const sourceRef = firestoreAdmin.collection('users').doc(sourceUid);
        const targetRef = firestoreAdmin.collection('users').doc(targetUid);

        try {
            await firestoreAdmin.runTransaction(async (t) => {
                const sourceDoc = await t.get(sourceRef);
                const targetDoc = await t.get(targetRef);
                if (!sourceDoc.exists || !targetDoc.exists) throw new Error('Один из аккаунтов не найден.');

                const s = sourceDoc.data()!;
                const tg = targetDoc.data()!;

                t.update(targetRef, {
                    casino_credits: (tg.casino_credits || 0) + (s.casino_credits || 0),
                    owned_items:    [...new Set([...(tg.owned_items || []), ...(s.owned_items || [])])],
                    daily_streak:   Math.max(s.daily_streak || 0, tg.daily_streak || 0),
                    avatar_url:     tg.avatar_url || s.avatar_url,
                    migratedFrom:   sourceUid,
                    migratedAt:     FieldValue.serverTimestamp()
                });

                t.update(sourceRef, {
                    casino_credits: 0,
                    daily_streak:   0,
                    isBanned:       true,
                    banReason:      `MIGRATED TO: ${targetUid}`,
                    username:       `MIGRATED_${s.username}`,
                    status:         'ACCOUNT_TRANSFER_COMPLETE'
                });
            });

            const locQuery = await firestoreAdmin.collection('locations').where('user_id', '==', sourceUid).get();
            if (!locQuery.empty) {
                const batch = firestoreAdmin.batch();
                locQuery.docs.forEach(doc => batch.update(doc.ref, { user_id: targetUid }));
                await batch.commit();
            }

            console.log(`[ADMIN] Migrated ${sourceUid} -> ${targetUid} by admin=${locals.user!.uid}`);
            return { actionSuccess: true, message: `Миграция успешна! ${sourceUid} → ${targetUid}` };

        } catch (e: any) {
            return fail(500, { message: `Ошибка: ${e.message}` });
        }
    }
};