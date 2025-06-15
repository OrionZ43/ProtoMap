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
    if (!siteKeyV3) {
        console.error("Firebase AppCheck: VITE_RECAPTCHA_V3_SITE_KEY is not set!");
    } else {
        try {
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(siteKeyV3),
                isTokenAutoRefreshEnabled: true
            });
            console.log("Firebase AppCheck initialized with ReCaptchaV3Provider.");
        } catch (e) {
            console.error("Firebase AppCheck: Error initializing with ReCaptchaV3Provider:", e);
        }
    }
}

export const auth = getAuth(app);
export const db = getFirestore(app);