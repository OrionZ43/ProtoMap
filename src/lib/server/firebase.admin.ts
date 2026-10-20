import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';
import { PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY } from '$env/static/private';

let serviceAccount;
try {
    serviceAccount = JSON.parse(PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (e) {
    console.error("Failed to parse PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY as JSON.");
}

if (!getApps().length) {
    try {
        if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key && serviceAccount.client_email && !serviceAccount.private_key.includes('dummy')) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            // dummy initialize to prevent build crash when no real env var is provided
            admin.initializeApp({ projectId: 'dummy' });
        }
    } catch (e) {
        console.error("Failed to initialize firebase admin app, falling back to dummy", e);
        admin.initializeApp({ projectId: 'dummy' });
    }
}

export const firestoreAdmin = admin.firestore();
export const authAdmin = admin.auth();

/**
 * Realtime Database (europe-west1). Адрес — явно: в initializeApp он не задан.
 * Функция, а не константа: при сборке без секретов база не нужна и не создаётся.
 */
export const rtdbAdmin = () => admin.app().database('https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app');