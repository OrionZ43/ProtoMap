import { marked } from 'marked';

/**
 * Рендеринг Markdown в HTML
 * Работает везде - и на сервере, и на клиенте
 */
export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        // Рендерим markdown в HTML
        const html = marked.parse(text, {
            breaks: true,
            gfm: true,
            silent: true
        }) as string;

        // Простая санитизация (удаляем опасные теги)
        return sanitizeHtml(html);
    } catch (error) {
        console.error('[Markdown] Error:', error);
        // В случае ошибки - вернём экранированный текст
        return escapeHtml(text);
    }
}

/**
 * Санитизация HTML
 */
function sanitizeHtml(html: string): string {
    let clean = html;

    // Удаляем скрипты
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<script[^>]*>/gi, '');

    // Удаляем другие опасные теги
    clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    clean = clean.replace(/<embed[^>]*>/gi, '');
    clean = clean.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Удаляем опасные атрибуты (onclick, onerror и т.д.)
    clean = clean.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');

    // Удаляем javascript: протоколы
    clean = clean.replace(/javascript:/gi, '');
    clean = clean.replace(/data:text\/html/gi, '');

    // Безопасные ссылки
    clean = clean.replace(
        /<a\s+([^>]*\s+)?href\s*=\s*["']([^"']*)["']([^>]*)>/gi,
        (match, before = '', href, after = '') => {
            // Проверяем протокол
            if (href.match(/^(https?:\/\/|mailto:|tel:|\/)/i)) {
                // Добавляем безопасные атрибуты
                let attrs = after || '';
                if (!attrs.includes('rel=')) {
                    attrs += ' rel="noopener noreferrer"';
                }
                if (href.match(/^https?:\/\//i) && !attrs.includes('target=')) {
                    attrs += ' target="_blank"';
                }
                return `<a ${before}href="${href}"${attrs}>`;
            }
            // Опасная ссылка - удаляем
            return '';
        }
    );

    return clean;
}

/**
 * Экранирование HTML (фолбэк)
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}