import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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

if (typeof window !== 'undefined') {
    const siteKeyV3 = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
    console.log("Firebase Init - V3 Site Key from env:", siteKeyV3);

    if (!siteKeyV3) {
        console.error("Firebase AppCheck: Переменная окружения VITE_RECAPTCHA_V3_SITE_KEY не установлена!");
    } else {
        try {
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(siteKeyV3), // Используем переменную
                isTokenAutoRefreshEnabled: true
            });
            console.log("Firebase AppCheck успешно инициализирован с ReCaptchaV3Provider.");
        } catch (e) {
            console.error("Firebase AppCheck: Ошибка при инициализации с ReCaptchaV3Provider:", e);
        }
    }
}

export const auth = getAuth(app);
export const db = getFirestore(app);