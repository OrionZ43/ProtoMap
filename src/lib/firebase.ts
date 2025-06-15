import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
//import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";


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

/* Закомментируем этот блок
if (typeof window !== 'undefined') {
    // Лог для проверки переменных окружения на Vercel (оставь на время теста)
    console.log("Vercel Env - DEV:", import.meta.env.DEV);
    console.log("Vercel Env - RECAPTCHA_SITE_KEY:", import.meta.env.VITE_RECAPTCHA_SITE_KEY);

    const appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY!), // Добавил '!' для уверенности TS, если ключ точно есть
        isTokenAutoRefreshEnabled: true
    });
    console.log("Firebase AppCheck initialized with ReCaptchaEnterpriseProvider on Vercel.");
}
*/

export const auth = getAuth(app);
export const db = getFirestore(app);