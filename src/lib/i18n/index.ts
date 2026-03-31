import { register, init, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';

const d = new Date();
const isAprilFools = d.getMonth() === 3 && d.getDate() === 1;

if (isAprilFools) {
    register('ru', () => import('./locales/ru_april.json'));
} else {
    register('ru', () => import('./locales/ru.json'));
}

register('en', () => import('./locales/en.json'));

const defaultLocale = 'ru';
let initialLocale = defaultLocale;

if (browser) {
    const searchParams = new URLSearchParams(window.location.search);
    const urlLang = searchParams.get('lang');
    const saved = localStorage.getItem('protomap_lang');
    const navLang = getLocaleFromNavigator();

    if (urlLang && (urlLang === 'ru' || urlLang === 'en')) {
        initialLocale = urlLang;
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