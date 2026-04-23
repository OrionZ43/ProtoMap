import { marked } from 'marked';
import DOMPurify from 'dompurify';

if (typeof window !== 'undefined') {
    DOMPurify.addHook('afterSanitizeAttributes', function(node) {
        if (node.tagName === 'A' && node.hasAttribute('href')) {
            const href = node.getAttribute('href') || '';
            if (href.match(/^https?:\/\//i)) {
                node.setAttribute('target', '_blank');
                node.setAttribute('rel', 'noopener noreferrer');
            }
        }
    });
}

/**
 * Основная функция рендеринга Markdown.
 * Использует DOMPurify на клиенте и кастомный санитайзер на сервере.
 */
export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        const html = marked.parse(text, {
            breaks: true,
            gfm: true,
            silent: true
        }) as string;

        if (typeof window !== 'undefined') {
            // На клиенте используем проверенный DOMPurify
            return DOMPurify.sanitize(html);
        } else {
            // На сервере используем нашу логику
            return sanitizeServerSide(html);
        }
    } catch (error) {
        console.error('[Markdown] Error:', error);
        return escapeHtml(text);
    }
}

/**
 * Простая очистка HTML на стороне сервера (SSR).
 */
function sanitizeServerSide(html: string): string {
    const allowedTags = new Set([
        'p', 'br', 'strong', 'b', 'em', 'i', 's', 'del',
        'a', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr', 'img'
    ]);

    let result = '';
    let inTag = false;
    let tagStart = -1;

    for (let i = 0; i < html.length; i++) {
        const char = html[i];

        if (char === '<') {
            inTag = true;
            tagStart = i;
        } else if (char === '>' && inTag) {
            inTag = false;

            const fullTag = html.substring(tagStart, i + 1);
            const isClosing = fullTag.startsWith('</');
            const tagMatch = fullTag.match(/^<\/?([a-z][a-z0-9]*)/i);

            if (tagMatch) {
                const tagName = tagMatch[1].toLowerCase();
                if (allowedTags.has(tagName)) {
                    if (isClosing) {
                        result += `</${tagName}>`;
                    } else {
                        result += cleanTag(fullTag, tagName);
                    }
                }
            }
        } else if (!inTag) {
            result += char;
        }
    }

    return result;
}

function cleanTag(tagHtml: string, tagName: string): string {
    if (tagName === 'a') {
        const hrefMatch = tagHtml.match(/href\s*=\s*["']([^"']+)["']/i);
        if (hrefMatch && isSafeUrl(hrefMatch[1])) {
            const href = escapeAttr(hrefMatch[1]);
            const isExternal = hrefMatch[1].match(/^https?:\/\//);
            const target = isExternal ? ' target="_blank"' : '';
            return `<a href="${href}"${target} rel="noopener noreferrer">`;
        }
        return '<a>';
    }

    if (tagName === 'img') {
        const srcMatch = tagHtml.match(/src\s*=\s*["']([^"']+)["']/i);
        const altMatch = tagHtml.match(/alt\s*=\s*["']([^"']*)["']/i);
        if (srcMatch && isSafeUrl(srcMatch[1])) {
            const src = escapeAttr(srcMatch[1]);
            const alt = altMatch ? escapeAttr(altMatch[1]) : '';
            return `<img src="${src}" alt="${alt}">`;
        }
        return '';
    }

    return `<${tagName}>`;
}

/**
 * Проверка URL на безопасность. 
 * Учитывает фикс Болта по очистке пробелов и проверке всех частей строки.
 */
export function isSafeUrl(url: string): boolean {
    const lower = url.toLowerCase().trim();

    // Блокируем опасные протоколы (используем .includes для защиты от обхода через пробелы)
    if (
        lower.includes('javascript:') ||
        lower.includes('data:text') ||
        lower.includes('vbscript:') ||
        lower.includes('file:')
    ) {
        return false;
    }

    // Разрешаем только безопасные протоколы, относительные пути и якоря
    return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(lower);
}

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtml(text: string): string {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}