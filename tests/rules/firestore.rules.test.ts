import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
	initializeTestEnvironment,
	assertFails,
	assertSucceeds,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// Тесты правил бьют по эмулятору (поднимается `npm run test:rules`), загружая
// наш реальный firestore.rules. Это первый харнес правил в репозитории —
// дальше по нему тестируем правила центра уведомлений и прочее.

let testEnv: RulesTestEnvironment;
const ADMIN = 'admin_uid';
const USER = 'user_uid';
const VALID = { latest: 5, minimum: 3, force: false, flags: { casino: true, shop: false } };

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: 'protomap-rules-test',
		firestore: {
			rules: readFileSync('firestore.rules', 'utf8'),
			host: '127.0.0.1',
			port: 8080
		}
	});
});

afterAll(async () => {
	await testEnv.cleanup();
});

beforeEach(async () => {
	await testEnv.clearFirestore();
	// Засеиваем документ админа в обход правил, чтобы isAdmin() срабатывал.
	await testEnv.withSecurityRulesDisabled(async (ctx) => {
		await setDoc(doc(ctx.firestore(), 'admins', ADMIN), { role: 'admin' });
	});
});

describe('system/android_app', () => {
	it('читать может кто угодно, даже без входа', async () => {
		const db = testEnv.unauthenticatedContext().firestore();
		await assertSucceeds(getDoc(doc(db, 'system/android_app')));
	});

	it('админ пишет корректную форму — можно', async () => {
		const db = testEnv.authenticatedContext(ADMIN).firestore();
		await assertSucceeds(setDoc(doc(db, 'system/android_app'), VALID));
	});

	it('админ, но latest строкой — нельзя', async () => {
		const db = testEnv.authenticatedContext(ADMIN).firestore();
		await assertFails(setDoc(doc(db, 'system/android_app'), { ...VALID, latest: '5' }));
	});

	it('админ, но нет flags — нельзя', async () => {
		const db = testEnv.authenticatedContext(ADMIN).firestore();
		const noFlags = { latest: 5, minimum: 3, force: false };
		await assertFails(setDoc(doc(db, 'system/android_app'), noFlags));
	});

	it('админ, но значение флага не bool — нельзя', async () => {
		const db = testEnv.authenticatedContext(ADMIN).firestore();
		await assertFails(setDoc(doc(db, 'system/android_app'), { ...VALID, flags: { casino: 'yes' } }));
	});

	it('пустой flags допустим', async () => {
		const db = testEnv.authenticatedContext(ADMIN).firestore();
		await assertSucceeds(setDoc(doc(db, 'system/android_app'), { ...VALID, flags: {} }));
	});

	it('обычный пользователь (не админ) писать не может', async () => {
		const db = testEnv.authenticatedContext(USER).firestore();
		await assertFails(setDoc(doc(db, 'system/android_app'), VALID));
	});

	it('без входа писать нельзя', async () => {
		const db = testEnv.unauthenticatedContext().firestore();
		await assertFails(setDoc(doc(db, 'system/android_app'), VALID));
	});
});

describe('граница доверия (регрессия харнеса)', () => {
	it('клиент не может писать в stepper/*', async () => {
		const db = testEnv.authenticatedContext(USER).firestore();
		await assertFails(setDoc(doc(db, 'stepper', USER), { credits: 999999 }));
	});
});

describe('users/{uid}/notifications', () => {
	const NOTIF = 'notif1';
	const path = `users/${USER}/notifications/${NOTIF}`;

	beforeEach(async () => {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			await setDoc(doc(ctx.firestore(), path), { type: 'profile_comment', text: 'привет', read: false, createdAt: new Date() });
		});
	});

	it('владелец читает своё уведомление', async () => {
		await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(USER).firestore(), path)));
	});
	it('чужое уведомление читать нельзя', async () => {
		await assertFails(getDoc(doc(testEnv.authenticatedContext('other_uid').firestore(), path)));
	});
	it('владелец помечает прочитанным (read false→true)', async () => {
		await assertSucceeds(updateDoc(doc(testEnv.authenticatedContext(USER).firestore(), path), { read: true }));
	});
	it('снять прочтение (true→false) нельзя', async () => {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			await updateDoc(doc(ctx.firestore(), path), { read: true });
		});
		await assertFails(updateDoc(doc(testEnv.authenticatedContext(USER).firestore(), path), { read: false }));
	});
	it('менять другое поле нельзя', async () => {
		await assertFails(updateDoc(doc(testEnv.authenticatedContext(USER).firestore(), path), { text: 'взлом' }));
	});
	it('read вместе с другим полем нельзя', async () => {
		await assertFails(updateDoc(doc(testEnv.authenticatedContext(USER).firestore(), path), { read: true, text: 'x' }));
	});
	it('клиент не создаёт уведомление', async () => {
		await assertFails(setDoc(doc(testEnv.authenticatedContext(USER).firestore(), `users/${USER}/notifications/new1`), { type: 'x', read: false }));
	});
	it('клиент не удаляет уведомление', async () => {
		await assertFails(deleteDoc(doc(testEnv.authenticatedContext(USER).firestore(), path)));
	});
});

describe('announcements', () => {
	beforeEach(async () => {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			await setDoc(doc(ctx.firestore(), 'announcements/a1'), { title: 'T', text: 'x', lang: 'ru', createdAt: new Date() });
		});
	});

	it('вошедший читает объявление', async () => {
		await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(USER).firestore(), 'announcements/a1')));
	});
	it('без входа читать нельзя', async () => {
		await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'announcements/a1')));
	});
	it('клиент не пишет объявление', async () => {
		await assertFails(setDoc(doc(testEnv.authenticatedContext(ADMIN).firestore(), 'announcements/a2'), { title: 'T', text: 'x' }));
	});
});
