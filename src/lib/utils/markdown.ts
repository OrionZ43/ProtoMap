import { marked } from 'marked';
import { browser } from '$app/environment';

// Импортируем DOMPurify только если мы в браузере (динамически)
// Это предотвратит ошибку ERR_REQUIRE_ESM на сервере Vercel
let DOMPurify: any;

if (browser) {
    import('dompurify').then((module) => {
        DOMPurify = module.default;
    });
}

export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        // 1. Markdown -> HTML
        const rawHtml = marked.parse(text, { breaks: true, gfm: true, silent: true }) as string;

        // 2. ЕСЛИ МЫ НА СЕРВЕРЕ (SSR)
        // Возвращаем текст без опасных тегов (простая регулярка), чтобы не ломать сборку.
        // Да, это менее надежно, но на клиенте оно перерисуется нормально.
        if (!browser || !DOMPurify) {
             // Удаляем скрипты и iframes грубой силой, чтобы боты не выполняли их
             return rawHtml.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                           .replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gim, "");
        }

        // 3. ЕСЛИ МЫ В БРАУЗЕРЕ
        // Используем мощный DOMPurify
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 's', 'del', 'h1', 'h2', 'h3', 'img'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt']
        });

    } catch (e) {
        console.error("MD Error:", e);
        return String(text);
    }
}