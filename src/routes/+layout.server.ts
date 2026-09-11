import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { LayoutServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

/**
 * Момент вступления в силу редакции 5.1 — та же дата, что напечатана в самих
 * документах («Вступает в силу: 18.09.2026»), в минском времени.
 *
 * До неё экран согласий не показывается: неделя между публикацией и этой датой
 * дана людям на чтение, и требовать принять документ раньше, чем он вступил
 * в силу, нельзя. После неё — показывается всем, у кого в журнале нет записи
 * на текущую редакцию.
 */
const CONSENT_GATE_FROM = new Date('2026-09-18T00:00:00+03:00');

/**
 * Маршруты, которые экран согласий не перекрывает.
 *
 * Сами документы в первую очередь: перекрыть их означало бы требовать принять
 * то, что невозможно прочитать. Плюс страницы, где сессии фактически нет.
 */
const CONSENT_GATE_EXEMPT = [
    '/privacy-policy',
    '/terms-of-service',
    '/personal-data-policy',
    '/ai-policy',
    '/banned',
    // Отказ должен быть выполнимым: здесь живёт удаление аккаунта и отзыв
    // согласия. Перекрыть её означало бы запереть человека без выхода.
    '/settings/security',
    '/login',
    '/register',
    '/reset-password',
    '/auth-action',
    '/verify-email'
];

export const load: LayoutServerLoad = async ({ locals, url }) => {
    let latestNewsDate: string | null = null;

    const isAdmin = locals.user && adminList.includes(locals.user.uid);

    // ── Parallel fetch: news + legal versions ────────────────────────────
    const [newsResult, licensesResult] = await Promise.allSettled([

        firestoreAdmin.collection('news')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get(),

        // Single doc read — very cheap, ~1 Firestore read unit
        firestoreAdmin.collection('system').doc('licenses').get(),
    ]);

    // Process news
    if (newsResult.status === 'fulfilled' && !newsResult.value.empty) {
        const data = newsResult.value.docs[0].data();
        if (data.createdAt) {
            latestNewsDate = data.createdAt.toDate().toISOString();
        }
    } else if (newsResult.status === 'rejected') {
        console.error('[layout] Failed to load news date:', newsResult.reason);
    }

    // Process legal versions
    let legalVersions: { privacy: string; tos: string } = { privacy: '', tos: '' };
    if (licensesResult.status === 'fulfilled' && licensesResult.value.exists) {
        const d = licensesResult.value.data() ?? {};
        legalVersions = {
            privacy: (d['privacy_policy_version']  as string) ?? '',
            tos:     (d['terms_of_service_version'] as string) ?? '',
        };
    } else if (licensesResult.status === 'rejected') {
        console.error('[layout] Failed to load legal versions:', licensesResult.reason);
    }

    // ── Нужно ли требовать согласие ──────────────────────────────────────
    //
    // Сравниваем редакцию, на которую у человека есть запись в журнале, с той,
    // что опубликована сейчас. Зеркала в документе пользователя уже прочитаны
    // в hooks.server.ts, так что лишнего обращения к базе здесь нет.
    //
    // Считаем на сервере, а не в браузере: клиентскую проверку обходит любой,
    // кто откроет консоль, а нам нужна не витрина, а фактическое согласие.
    const gateActive = Date.now() >= CONSENT_GATE_FROM.getTime();
    const exempt = CONSENT_GATE_EXEMPT.some(
        (p) => url.pathname === p || url.pathname.startsWith(p + '/')
    );

    const consentOutdated = Boolean(
        locals.user &&
            legalVersions.privacy &&
            legalVersions.tos &&
            (locals.user.consentsPrivacyVersion !== legalVersions.privacy ||
                locals.user.consentsTosVersion !== legalVersions.tos)
    );

    return {
        user:          locals.user,
        latestNewsDate,
        isAdmin,
        legalVersions, // ← new field consumed by LegalUpdateBanner
        needsConsent: gateActive && !exempt && consentOutdated,
    };
};