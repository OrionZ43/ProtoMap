import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Мы убираем экспорт 'Comment', так как теперь грузим их на клиенте
// export type Comment = { ... };

export const load: PageServerLoad = async ({ params, setHeaders, url }) => {
    const username = params.username;

    try {
        const usersRef = firestoreAdmin.collection('users');
        const userSnapshot = await usersRef.where('username', '==', username).limit(1).get();

        if (userSnapshot.empty) {
            throw error(404, 'Профиль не найден');
        }

        const userProfileDoc = userSnapshot.docs[0];
        const userProfileData = userProfileDoc.data() || {};

        setHeaders({ 'Cache-Control': 'public, max-age=60' });

        // === ГЕНЕРАЦИЯ МЕТА-ДАННЫХ ДЛЯ БОТОВ (Open Graph) ===
        const metaTitle = `${userProfileData.username || 'User'} | ProtoMap`;

        const rawDesc = userProfileData.about_me || 'Профиль пользователя в сети ProtoMap.';
        const metaDesc = rawDesc.replace(/[\r\n]+/g, ' ').substring(0, 150) + (rawDesc.length > 150 ? '...' : '');

        let metaImage = userProfileData.avatar_url;
        if (!metaImage) {
            metaImage = `https://api.dicebear.com/7.x/bottts-neutral/png?seed=${userProfileData.username}`;
        } else if (metaImage.includes('cloudinary.com')) {
            const parts = metaImage.split('/upload/');
            if (parts.length === 2) {
                metaImage = `${parts[0]}/upload/w_600,h_600,c_fill,f_jpg/${parts[1]}`;
            }
        }

        // === ВОЗВРАЩАЕМ ТОЛЬКО ПРОФИЛЬ И МЕТА-ДАННЫЕ ===
        return {
            profile: {
                uid: userProfileDoc.id,
                username: userProfileData.username || 'Unknown',
                avatar_url: userProfileData.avatar_url || '',
                about_me: userProfileData.about_me || '',
                status: userProfileData.status || null,
                socials: userProfileData.socials || {},
                equipped_frame: userProfileData.equipped_frame || null,
                equipped_bg: userProfileData.equipped_bg || null
            },

            // Комментарии теперь пустые, будем грузить на клиенте
            comments: [],

            // Данные для <svelte:head>
            meta: {
                title: metaTitle,
                description: metaDesc,
                image: metaImage,
                url: url.href // Передаем полный URL страницы
            }
        };

    } catch (e: any) {
        console.error(`CRITICAL PROFILE LOAD ERROR [${username}]:`, e);
        if (e.status === 404) throw error(404, 'Профиль не найден');
        throw error(500, 'Ошибка сервера при загрузке профиля.');
    }
};