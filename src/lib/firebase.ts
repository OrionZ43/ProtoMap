import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// 1. Импорты для защиты
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browser, dev } from '$app/environment';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

export const auth = getAuth(app);
export const db = getFirestore(app);

// 2. Инициализация App Check (Только на клиенте)
if (browser) {
    // В режиме разработки (localhost) включаем дебаг-токен, чтобы тебя не банило
    // Firebase выведет этот токен в консоль браузера, его нужно будет добавить в Firebase Console
    if (dev) {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    try {
        initializeAppCheck(app, {
            // Твой Enterprise ключ
            provider: new ReCaptchaEnterpriseProvider('6LdUABssAAAAAPr3oiK3j525Wsb5_EjYvxFex13-'),

            // Автоматически обновлять токен в фоне
            isTokenAutoRefreshEnabled: true
        });
        console.log("[Security] App Check shield activated (Enterprise).");
    } catch (e) {
        console.error("[Security] App Check failed to load:", e);
    }
}