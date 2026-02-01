import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { FieldPath } from 'firebase-admin/firestore';

export type Comment = {
    id: string;
    text: string;
    author_uid: string;
    author_username: string;
    author_avatar_url: string;
    author_equipped_frame: string | null;
    createdAt: Date;
    likes: string[]; // Массив UID лайкнувших
    parentId: string | null; // ID родителя
    replies?: Comment[]; // Вложенные ответы (для рендера)
};

// Функция для создания абсолютного URL изображения для OG
function getAbsoluteImageUrl(avatarUrl: string | null | undefined, username: string): string {
    if (!avatarUrl) {
        // Fallback на DiceBear
        return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username)}`;
    }

    // Если уже абсолютный URL
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
        // Оптимизация для Cloudinary (1200x1200 для превью)
        if (avatarUrl.includes('cloudinary.com')) {
            const parts = avatarUrl.split('/upload/');
            return `${parts[0]}/upload/f_auto,q_auto,w_1200,h_1200,c_fill,g_face/${parts[1]}`;
        }

        // Оптимизация для Google аватаров
        if (avatarUrl.includes('googleusercontent.com')) {
            return avatarUrl.split('=')[0] + '=s1200-c';
        }

        return avatarUrl;
    }

    // Если относительный путь - делаем абсолютным
    return `https://proto-map.vercel.app${avatarUrl}`;
}

export const load: PageServerLoad = async ({ params, setHeaders }) => {
    const username = params.username;
    const usersRef = firestoreAdmin.collection('users');
    const userSnapshot = await usersRef.where('username', '==', username).limit(1).get();

    if (userSnapshot.empty) {
        throw error(404, 'Профиль не найден');
    }

    const userProfileDoc = userSnapshot.docs[0];
    const userProfileData = userProfileDoc.data();

    // Загружаем комментарии
    const commentsRef = userProfileDoc.ref.collection('comments').orderBy('createdAt', 'desc').limit(50);
    const commentsSnapshot = await commentsRef.get();

    // 1. Собираем сырые данные
    const rawComments: Comment[] = commentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            text: data.text || '',
            author_uid: data.author_uid || '',
            author_username: data.author_username || 'Аноним',
            author_avatar_url: data.author_avatar_url || '',
            author_equipped_frame: data.author_equipped_frame || null,
            createdAt: data.createdAt?.toDate() || new Date(),
            likes: data.likes || [],
            parentId: data.parentId || null,
            replies: []
        };
    });

    // 2. Актуализируем данные авторов (аватарки/рамки могли обновиться)
    const authorUids = [...new Set(rawComments.map(c => c.author_uid).filter(Boolean))];
    const authorsData = new Map<string, any>();

    if (authorUids.length > 0) {
        // Батчинг по 30 ID (ограничение Firestore 'in')
        for (let i = 0; i < authorUids.length; i += 30) {
            const chunk = authorUids.slice(i, i + 30);
            const snaps = await firestoreAdmin.collection('users')
                .where(FieldPath.documentId(), 'in', chunk)
                .get();
            snaps.forEach(d => authorsData.set(d.id, d.data()));
        }
    }

    // 3. Обновляем данные и СТРОИМ ДЕРЕВО
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];

    // Сначала обновляем и кладем в Map
    rawComments.forEach(c => {
        const freshAuthor = authorsData.get(c.author_uid);
        if (freshAuthor) {
            c.author_username = freshAuthor.username;
            c.author_avatar_url = freshAuthor.avatar_url;
            c.author_equipped_frame = freshAuthor.equipped_frame;
        }
        commentMap.set(c.id, c);
    });

    // Теперь распределяем: кто родитель, кто ребенок
    rawComments.forEach(c => {
        if (c.parentId && commentMap.has(c.parentId)) {
            // Это ответ, и родитель загружен
            const parent = commentMap.get(c.parentId)!;
            parent.replies?.push(c);
        } else {
            // Это корневой коммент (или сирота)
            rootComments.push(c);
        }
    });

    // Сортируем ответы в хронологическом порядке (старые вверху)
    rootComments.forEach(root => {
        if (root.replies && root.replies.length > 0) {
            root.replies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
    });

    // === НОВОЕ: Формируем SEO данные для Open Graph ===
    const seoData = {
        title: `${userProfileData.username} | ProtoMap`,
        description: userProfileData.status || userProfileData.about_me?.substring(0, 150) || `Профиль ${userProfileData.username} на ProtoMap - интерактивной карте протогенов`,
        image: getAbsoluteImageUrl(userProfileData.avatar_url, userProfileData.username),
        url: `https://proto-map.vercel.app/profile/${userProfileData.username}`,
        type: 'profile'
    };

    setHeaders({ 'Cache-Control': 'public, max-age=60' });

    return {
        profile: {
            uid: userProfileDoc.id,
            username: userProfileData.username,
            avatar_url: userProfileData.avatar_url,
            about_me: userProfileData.about_me,
            status: userProfileData.status || null,
            socials: userProfileData.socials || {},
            equipped_frame: userProfileData.equipped_frame || null,
            equipped_bg: userProfileData.equipped_bg || null
        },
        comments: rootComments, // Отдаем только корни, дети внутри
        seoData // НОВОЕ: Добавляем SEO данные
    };
};