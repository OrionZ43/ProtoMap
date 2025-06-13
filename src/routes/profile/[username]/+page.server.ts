import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
    const username = params.username;

    const usersRef = firestoreAdmin.collection('users');
    const snapshot = await usersRef.where('username', '==', username).limit(1).get();

     if (snapshot.empty) {
        setHeaders({
            'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=5'
        });
        throw error(404, 'Профиль не найден');
    }

    const userProfileData = snapshot.docs[0].data();
    const userProfileId = snapshot.docs[0].id;

    setHeaders({
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=60'
    });

    return {
        profile: {
            uid: userProfileId,
            username: userProfileData.username,
            avatar_url: userProfileData.avatar_url,
            social_link: userProfileData.social_link,
            about_me: userProfileData.about_me,
        }
    };
};