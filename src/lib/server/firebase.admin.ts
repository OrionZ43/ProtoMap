import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';
import { PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY } from '$env/static/private';

const serviceAccount = JSON.parse(
    PRIVATE_FIREBASE_SERVICE_ACCOUNT_KEY
);

if (!getApps().length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

export const firestoreAdmin = admin.firestore();
export const authAdmin = admin.auth();