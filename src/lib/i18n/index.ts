import { register, init, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';

// Регистрируем словари
register('ru', () => import('./locales/ru.json'));
register('en', () => import('./locales/en.json'));

// Определяем язык
const defaultLocale = 'ru';
let initialLocale = defaultLocale;

if (browser) {
    // Пытаемся найти сохраненный язык или берем из браузера
    const saved = localStorage.getItem('protomap_lang');
    if (saved) {
        initialLocale = saved;
    } else {
        const navLang = getLocaleFromNavigator();
        if (navLang && navLang.startsWith('en')) {
            initialLocale = 'en';
        }
    }
}

init({
    fallbackLocale: defaultLocale,
    initialLocale: initialLocale,
});