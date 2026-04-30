import { loadLegalDoc } from '$lib/server/legalLoader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
    setHeaders({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

    const { doc, version } = await loadLegalDoc('terms_of_service');

    return { doc, version };
};