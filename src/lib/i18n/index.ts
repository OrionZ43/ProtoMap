import { register, init, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';

// Регистрируем словари
register('ru', () => import('./locales/ru.json'));
register('en', () => import('./locales/en.json'));

// Определяем язык
const defaultLocale = 'ru';
let initialLocale = defaultLocale;

if (browser) {
    // 1. Сначала проверяем URL (это приоритет для ссылок из почты)
    const searchParams = new URLSearchParams(window.location.search);
    const urlLang = searchParams.get('lang');

    // 2. Затем LocalStorage
    const saved = localStorage.getItem('protomap_lang');

    // 3. Затем Браузер
    const navLang = getLocaleFromNavigator();

    if (urlLang && (urlLang === 'ru' || urlLang === 'en')) {
        initialLocale = urlLang;
        // Можно сразу сохранить, чтобы при переходе на главную язык остался
        localStorage.setItem('protomap_lang', urlLang);
    } else if (saved) {
        initialLocale = saved;
    } else if (navLang && navLang.startsWith('en')) {
        initialLocale = 'en';
    }
}

init({
    fallbackLocale: defaultLocale,
    initialLocale: initialLocale,
});