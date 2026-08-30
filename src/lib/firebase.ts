import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from "firebase/app-check";
import { browser, dev } from '$app/environment';
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDatabase } from "firebase/database";

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

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(app, 'europe-west1');

// Экспортируем инстанс App Check, чтобы страницы могли прогреть токен заранее
export let appCheck: AppCheck | null = null;

if (browser) {
    if (dev) {
        // Debug-токен App Check для локальной разработки.
        //
        // `true` заставляет SDK сгенерировать СЛУЧАЙНЫЙ токен, положить его в
        // IndexedDB и напечатать в консоль — его нужно вручную зарегистрировать
        // в Firebase Console (App Check → Apps → Manage debug tokens).
        // Проблема в том, что при любой чистке хранилища токен пересоздаётся,
        // и регистрировать его приходится заново. В браузерах со строгими
        // настройками приватности (Firefox с защитой от отпечатков и
        // разделением хранилища) это происходит постоянно, и App Check
        // отвечает 403 на каждый запрос токена.
        //
        // Поэтому: если задан VITE_APPCHECK_DEBUG_TOKEN — берём его. Он
        // фиксированный, регистрируется в консоли один раз и переживает
        // очистку хранилища. Если не задан — прежнее поведение.
        //
        // Только dev: в прод-сборке `dev` вычисляется в false и весь блок
        // вырезается, там работает настоящий ReCaptcha Enterprise.
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
            import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
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
// ═══════════════════════════════════════════════════════════════
// ВРЕМЕННЫЙ КОД ДЛЯ ЗАМЕРА РЕГИОНОВ — удалить после переезда.
//
// Добавить в КОНЕЦ src/lib/firebase.ts.
// Работает только в dev (npm run dev), в прод-сборку не попадёт:
// `dev` из $app/environment вырезается при билде вместе с блоком.
// ═══════════════════════════════════════════════════════════════

if (browser && dev) {
    // Прокидываем в window то, что нужно бенчмарку из консоли.
    // App Check и auth-токен SDK подставит сам — поэтому меряем
    // ровно тот путь, которым ходит настоящий пользователь.
    (window as any).__fb = { app, getFunctions, httpsCallable };
    console.log('[DEV] window.__fb готов — можно запускать бенчмарк регионов');
}