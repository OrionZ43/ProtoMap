import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        // 1. Markdown -> HTML
        const rawHtml = marked.parse(text, { breaks: true, gfm: true }) as string;

        // 2. Очистка от скриптов (XSS защита)
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 's', 'del', 'h1', 'h2', 'h3'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
        });
    } catch (e) {
        console.error("Markdown error:", e);
        return text; // Возвращаем текст как есть в случае ошибки
    }
}