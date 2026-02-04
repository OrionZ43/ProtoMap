import { marked } from 'marked';
import { browser } from '$app/environment';

// Синхронный импорт для сервера (используем isomorphic-dompurify)
// Установи: npm install isomorphic-dompurify
import DOMPurify from 'isomorphic-dompurify';

/**
 * Безопасный рендеринг Markdown в HTML
 * Работает и на сервере, и в браузере
 */
export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        // 1. Markdown -> HTML
        const rawHtml = marked.parse(text, {
            breaks: true,
            gfm: true,
            silent: true
        }) as string;

        // 2. Санитизация через DOMPurify (работает везде!)
        const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: [
                'b', 'i', 'em', 'strong', 'a', 'p', 'br',
                'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
                's', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
            ],
            ALLOWED_ATTR: [
                'href', 'target', 'rel', 'class',
                'src', 'alt', 'title', 'width', 'height'
            ],
            ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
            // Дополнительная защита
            KEEP_CONTENT: false, // Удаляет содержимое запрещённых тегов
            ALLOW_DATA_ATTR: false, // Запрещает data-* атрибуты
            FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
        });

        // 3. Дополнительная защита для ссылок
        return sanitizedHtml.replace(
            /<a\s+([^>]*\s+)?href="([^"]*)"([^>]*)>/gi,
            (match, before = '', href, after = '') => {
                // Добавляем rel="noopener noreferrer" для безопасности
                if (!after.includes('rel=')) {
                    after += ' rel="noopener noreferrer"';
                }
                // Если внешняя ссылка - открываем в новой вкладке
                if (href.startsWith('http') && !after.includes('target=')) {
                    after += ' target="_blank"';
                }
                return `<a ${before}href="${href}"${after}>`;
            }
        );

    } catch (e) {
        console.error("Markdown rendering error:", e);
        // В случае ошибки возвращаем экранированный текст
        return escapeHtml(String(text));
    }
}

/**
 * Экранирование HTML (fallback на случай ошибки)
 */
function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
}