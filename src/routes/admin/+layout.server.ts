import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

export const load: LayoutServerLoad = async ({ locals }) => {
    // 1. Если не вошел - на логин
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    // 2. Если вошел, но не админ - 403 с издевкой
    if (!adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ. Уровень допуска: "Смертный". Возвращайтесь в песочницу.');
    }

    return {
        user: locals.user
    };
};