import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        // 1. Markdown -> HTML
        // Добавляем silent: true, чтобы marked не кидал исключения
        const rawHtml = marked.parse(text, { breaks: true, gfm: true, silent: true }) as string;

        // 2. Очистка (XSS защита)
        // Если DOMPurify упадет на сервере, мы попадем в catch
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 's', 'del', 'h1', 'h2', 'h3'],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
        });
    } catch (e) {
        console.error("Markdown render error:", e);
        // ФОЛЛБЭК: Возвращаем безопасный простой текст, если парсер сломался
        return String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}