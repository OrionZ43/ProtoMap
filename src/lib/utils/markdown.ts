import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { browser } from '$app/environment';

export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        // 1. Превращаем Markdown в HTML
        // silent: true подавляет ошибки парсинга marked
        const rawHtml = marked.parse(text, { breaks: true, gfm: true, silent: true }) as string;

        // 2. Санитизация (Очистка)
        // На сервере Vercel DOMPurify иногда может сбоить.
        // Оборачиваем в жесткий try-catch.
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 's', 'del', 'h1', 'h2', 'h3'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
        });

        return cleanHtml;

    } catch (e) {
        console.error("[Markdown Error]:", e);

        // ФОЛЛБЭК: Если сломалось, возвращаем безопасный текст (экранируем теги)
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}