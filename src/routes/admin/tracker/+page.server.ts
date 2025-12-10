import { firestoreAdmin } from '$lib/server/firebase.admin';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

// Добавили assignee
export type Task = {
    id: string;
    title: string;
    description: string;
    platform: 'web' | 'app' | 'backend' | 'design';
    priority: 'low' | 'medium' | 'critical';
    status: 'todo' | 'in_progress' | 'done';
    assignee: 'orion' | 'iposdev' | 'system'; // <--- НОВОЕ
    createdAt: Date;
};

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user || !adminList.includes(locals.user.uid)) {
        throw redirect(303, '/');
    }

    try {
        const snapshot = await firestoreAdmin.collection('roadmap').orderBy('createdAt', 'desc').get();
        const tasks: Task[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'Untitled',
                description: data.description || '',
                platform: data.platform || 'web',
                priority: data.priority || 'medium',
                status: data.status || 'todo',
                assignee: data.assignee || 'system', // Дефолт
                createdAt: data.createdAt?.toDate() || new Date()
            };
        });
        return { tasks };
    } catch (e) {
        return { tasks: [] };
    }
};

export const actions: Actions = {
    create: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);
        const data = await request.formData();

        await firestoreAdmin.collection('roadmap').add({
            title: data.get('title'),
            description: data.get('description'),
            platform: data.get('platform'),
            priority: data.get('priority'),
            assignee: data.get('assignee'), // Сохраняем исполнителя
            status: 'todo',
            createdAt: FieldValue.serverTimestamp(),
            author: locals.user.username
        });
        return { success: true };
    },

    // НОВОЕ: Редактирование всей задачи
    edit: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);
        const data = await request.formData();
        const id = data.get('id') as string;

        const updates: any = {
            title: data.get('title'),
            description: data.get('description'),
            priority: data.get('priority'),
            assignee: data.get('assignee')
        };

        // Удаляем undefined поля
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        await firestoreAdmin.collection('roadmap').doc(id).update(updates);
        return { success: true };
    },

    updateStatus: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);
        const data = await request.formData();
        await firestoreAdmin.collection('roadmap').doc(data.get('id') as string).update({
            status: data.get('status')
        });
        return { success: true };
    },

    delete: async ({ request, locals }) => {
        if (!locals.user || !adminList.includes(locals.user.uid)) return fail(403);
        await firestoreAdmin.collection('roadmap').doc(data.get('id') as string).delete();
        return { success: true };
    }
};