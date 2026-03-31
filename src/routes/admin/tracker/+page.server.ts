// src/routes/admin/tracker/+page.server.ts

import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

function assertAdmin(locals: App.Locals) {
    if (!locals.user || !adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ.');
    }
}

export type Task = {
    id:          string;
    title:       string;
    description: string;
    platform:    'web' | 'app' | 'backend' | 'design';
    priority:    'low' | 'medium' | 'critical';
    status:      'todo' | 'in_progress' | 'done';
    assignee:    'orion' | 'iposdev' | 'system';
    createdAt:   Date;
};

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    if (!adminList.includes(locals.user.uid)) throw error(403, 'Access Denied');

    try {
        const snapshot = await firestoreAdmin
            .collection('roadmap')
            .orderBy('createdAt', 'desc')
            .get();

        const tasks: Task[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id:          doc.id,
                title:       d.title       || 'Untitled',
                description: d.description || '',
                platform:    d.platform    || 'web',
                priority:    d.priority    || 'medium',
                status:      d.status      || 'todo',
                assignee:    d.assignee    || 'system',
                createdAt:   d.createdAt?.toDate() || new Date()
            };
        });

        return { tasks };
    } catch (e) {
        return { tasks: [] };
    }
};

export const actions: Actions = {

    create: async ({ request, locals }) => {
        assertAdmin(locals);
        const data = await request.formData();

        const title    = (data.get('title')       as string ?? '').trim();
        const platform = data.get('platform')      as string;
        const priority = data.get('priority')      as string;
        const assignee = data.get('assignee')      as string;
        const desc     = (data.get('description') as string ?? '').trim();

        if (!title)    return fail(400, { message: 'Название обязательно.' });
        if (!['web','app','backend','design'].includes(platform)) return fail(400);
        if (!['low','medium','critical'].includes(priority))     return fail(400);
        if (!['orion','iposdev','system'].includes(assignee))    return fail(400);

        await firestoreAdmin.collection('roadmap').add({
            title, description: desc, platform, priority, assignee,
            status:    'todo',
            createdAt: FieldValue.serverTimestamp(),
            author:    locals.user!.uid
        });
        return { success: true };
    },

    edit: async ({ request, locals }) => {
        assertAdmin(locals);
        const data = await request.formData();
        const id   = (data.get('id') as string ?? '').trim();
        if (!id) return fail(400);

        const updates: Record<string, string> = {};
        const title    = (data.get('title')       as string ?? '').trim();
        const desc     = (data.get('description') as string ?? '').trim();
        const priority = data.get('priority') as string;
        const assignee = data.get('assignee') as string;

        if (title)    updates.title       = title;
        if (desc)     updates.description = desc;
        if (priority && ['low','medium','critical'].includes(priority)) updates.priority = priority;
        if (assignee && ['orion','iposdev','system'].includes(assignee)) updates.assignee = assignee;

        await firestoreAdmin.collection('roadmap').doc(id).update(updates);
        return { success: true };
    },

    updateStatus: async ({ request, locals }) => {
        assertAdmin(locals);
        const data   = await request.formData();
        const id     = (data.get('id')     as string ?? '').trim();
        const status = (data.get('status') as string ?? '').trim();
        if (!id || !['todo','in_progress','done'].includes(status)) return fail(400);

        await firestoreAdmin.collection('roadmap').doc(id).update({ status });
        return { success: true };
    },

    delete: async ({ request, locals }) => {
        assertAdmin(locals);
        const data = await request.formData(); // ← фикс бага: было `data` без объявления
        const id   = (data.get('id') as string ?? '').trim();
        if (!id) return fail(400);

        await firestoreAdmin.collection('roadmap').doc(id).delete();
        return { success: true };
    }
};