// src/routes/admin/tracker/+page.server.ts
//
// «Роадмап» в админке: задачи по колонкам «ждёт — в работе — готово».
// Ошибки — кодами; текст для них страница берёт из локалей (admin_roadmap.result).

import { firestoreAdmin } from '$lib/server/firebase.admin';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { FieldValue } from 'firebase-admin/firestore';
import { ADMIN_UIDS } from '$env/static/private';

const adminList = ADMIN_UIDS ? ADMIN_UIDS.split(',') : [];

const PLATFORMS = ['web', 'app', 'backend', 'design'];
const PRIORITIES = ['low', 'medium', 'critical'];
const STATUSES = ['todo', 'in_progress', 'done'];
/** iposdev остаётся у старых задач; новым его не назначают (страница его не предлагает). */
const ASSIGNEES = ['orion', 'iposdev', 'system'];

function assertAdmin(locals: App.Locals) {
    if (!locals.user || !adminList.includes(locals.user.uid)) {
        throw error(403, 'ОТКАЗАНО В ДОСТУПЕ.');
    }
}

/** Запись в Firestore: сбой возвращается кодом, а не страницей ошибки. */
async function write(run: () => Promise<unknown>) {
    try {
        await run();
        return { success: true };
    } catch (e) {
        console.error('[admin/tracker] запись:', e);
        return fail(500, { code: 'failed' });
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

        if (!title) return fail(400, { code: 'required' });
        if (!PLATFORMS.includes(platform) || !PRIORITIES.includes(priority) || !ASSIGNEES.includes(assignee)) {
            return fail(400, { code: 'bad_input' });
        }

        return write(() => firestoreAdmin.collection('roadmap').add({
            title, description: desc, platform, priority, assignee,
            status:    'todo',
            createdAt: FieldValue.serverTimestamp(),
            author:    locals.user!.uid
        }));
    },

    edit: async ({ request, locals }) => {
        assertAdmin(locals);
        const data = await request.formData();
        const id   = (data.get('id') as string ?? '').trim();
        if (!id) return fail(400, { code: 'bad_input' });

        const title    = (data.get('title')       as string ?? '').trim();
        const platform = data.get('platform') as string;
        const priority = data.get('priority') as string;
        const assignee = data.get('assignee') as string;
        if (!title) return fail(400, { code: 'required' });

        // Описание пишется всегда: пустое поле — значит, описание убрали.
        // Раньше пустое значение пропускалось, и стереть описание было нельзя.
        const updates: Record<string, string> = {
            title,
            description: (data.get('description') as string ?? '').trim()
        };
        if (PLATFORMS.includes(platform)) updates.platform = platform;
        if (PRIORITIES.includes(priority)) updates.priority = priority;
        if (ASSIGNEES.includes(assignee)) updates.assignee = assignee;

        return write(() => firestoreAdmin.collection('roadmap').doc(id).update(updates));
    },

    updateStatus: async ({ request, locals }) => {
        assertAdmin(locals);
        const data   = await request.formData();
        const id     = (data.get('id')     as string ?? '').trim();
        const status = (data.get('status') as string ?? '').trim();
        if (!id || !STATUSES.includes(status)) return fail(400, { code: 'bad_input' });

        return write(() => firestoreAdmin.collection('roadmap').doc(id).update({ status }));
    },

    delete: async ({ request, locals }) => {
        assertAdmin(locals);
        const data = await request.formData();
        const id   = (data.get('id') as string ?? '').trim();
        if (!id) return fail(400, { code: 'bad_input' });

        return write(() => firestoreAdmin.collection('roadmap').doc(id).delete());
    }
};
