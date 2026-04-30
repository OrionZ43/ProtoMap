import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from "firebase/app-check";
import { browser, dev } from '$app/environment';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: "https://protomap-1e1db-default-rtdb.europe-west1.firebasedatabase.app"
};

let app;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(app, 'us-central1');

// Экспортируем инстанс App Check, чтобы страницы могли прогреть токен заранее
export let appCheck: AppCheck | null = null;

if (browser) {
    if (dev) {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    try {
        appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider('6LdUABssAAAAAPr3oiK3j525Wsb5_EjYvxFex13-'),
            isTokenAutoRefreshEnabled: true
        });
        console.log("[Security] App Check shield activated (Enterprise).");

        // Сразу прогреваем токен в фоне — чтобы при первом клике он уже был закэширован
        getToken(appCheck, false).catch(() => {
            // Молча игнорируем — прогрев необязателен, просто оптимизация
        });
    } catch (e) {
        console.error("[Security] App Check failed to load:", e);
    }
}