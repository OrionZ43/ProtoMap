import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { LayoutServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

export const load: LayoutServerLoad = async ({ locals }) => {
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

    return {
        user:          locals.user,
        latestNewsDate,
        isAdmin,
        legalVersions, // ← new field consumed by LegalUpdateBanner
    };
};