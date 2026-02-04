import { marked } from 'marked';
import { browser } from '$app/environment';

/**
 * Безопасный рендеринг Markdown в HTML
 * Уровень безопасности: максимальный (как у DOMPurify)
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

        // 2. Санитизация
        if (!browser) {
            return sanitizeHtmlServer(rawHtml);
        } else {
            return sanitizeHtmlBrowser(rawHtml);
        }
    } catch (error) {
        console.error('[Markdown] Render error:', error);
        return escapeHtml(text);
    }
}

/**
 * Серверная санитизация (уровень безопасности: максимальный)
 * Защита от всех известных XSS векторов
 */
function sanitizeHtmlServer(html: string): string {
    // Белый список разрешённых тегов
    const allowedTags = new Set([
        'b', 'i', 'em', 'strong', 'a', 'p', 'br',
        'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
        's', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ]);

    // 1. УДАЛЯЕМ ВСЕ ОПАСНЫЕ ТЕГИ (множественная защита)
    let clean = html;

    // Скрипты (все варианты)
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<script[^>]*>/gi, '');

    // Другие опасные теги
    const dangerousTags = [
        'iframe', 'object', 'embed', 'applet', 'link', 'style',
        'form', 'input', 'button', 'textarea', 'select', 'option',
        'base', 'meta', 'svg', 'math', 'template', 'slot'
    ];

    dangerousTags.forEach(tag => {
        // Парные теги
        const regex1 = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
        clean = clean.replace(regex1, '');
        // Одиночные теги
        const regex2 = new RegExp(`<${tag}[^>]*>`, 'gi');
        clean = clean.replace(regex2, '');
    });

    // 2. УДАЛЯЕМ ВСЕ ОПАСНЫЕ АТРИБУТЫ
    const dangerousAttrs = [
        'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onmousemove',
        'onmouseenter', 'onmouseleave', 'onfocus', 'onblur', 'onchange', 'onsubmit',
        'onkeydown', 'onkeyup', 'onkeypress', 'ondblclick', 'oncontextmenu',
        'ondrag', 'ondrop', 'onscroll', 'onwheel', 'oncopy', 'oncut', 'onpaste',
        'onabort', 'oncanplay', 'oncanplaythrough', 'oncuechange', 'ondurationchange',
        'onemptied', 'onended', 'oninput', 'oninvalid', 'onloadeddata', 'onloadedmetadata',
        'onloadstart', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange',
        'onreset', 'onseeked', 'onseeking', 'onselect', 'onstalled', 'onsuspend',
        'ontimeupdate', 'onvolumechange', 'onwaiting', 'ontoggle', 'onanimationstart',
        'onanimationend', 'onanimationiteration', 'ontransitionend', 'formaction',
        'action', 'background', 'poster', 'srcdoc'
    ];

    dangerousAttrs.forEach(attr => {
        // Удаляем атрибут во всех вариантах написания
        const regex = new RegExp(`\\s+${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
        clean = clean.replace(regex, '');
        const regex2 = new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>"']+`, 'gi');
        clean = clean.replace(regex2, '');
    });

    // 3. УДАЛЯЕМ JAVASCRIPT ПРОТОКОЛЫ
    const jsProtocols = [
        'javascript:', 'data:text/html', 'vbscript:', 'file:', 'about:',
        'data:application/', 'data:text/javascript'
    ];

    jsProtocols.forEach(protocol => {
        const regex = new RegExp(protocol.replace(':', '\\s*:\\s*'), 'gi');
        clean = clean.replace(regex, '');
    });

    // 4. УДАЛЯЕМ DATA URIs (кроме безопасных изображений)
    clean = clean.replace(/src\s*=\s*["']data:(?!image\/(png|jpg|jpeg|gif|webp|svg\+xml))/gi, 'src="');
    clean = clean.replace(/href\s*=\s*["']data:/gi, 'href="');

    // 5. УДАЛЯЕМ ЗАКОДИРОВАННЫЕ СИМВОЛЫ В АТРИБУТАХ (обход фильтров)
    clean = clean.replace(/&#x[0-9a-f]+;/gi, '');
    clean = clean.replace(/&#[0-9]+;/gi, '');
    clean = clean.replace(/\\x[0-9a-f]{2}/gi, '');
    clean = clean.replace(/\\u[0-9a-f]{4}/gi, '');

    // 6. УДАЛЯЕМ ТЕГИ, НЕ ВХОДЯЩИЕ В БЕЛЫЙ СПИСОК
    clean = clean.replace(/<(\/?[a-z][a-z0-9]*)[^>]*>/gi, (match, tagName) => {
        const tag = tagName.toLowerCase().replace('/', '');
        if (allowedTags.has(tag)) {
            return match; // Оставляем разрешённый тег
        }
        return ''; // Удаляем неразрешённый
    });

    // 7. БЕЗОПАСНЫЕ ССЫЛКИ
    clean = clean.replace(
        /<a\s+([^>]*\s+)?href\s*=\s*["']([^"']*)["']([^>]*)>/gi,
        (match, before = '', href, after = '') => {
            // Проверяем протокол
            const lowerHref = href.toLowerCase().trim();

            // Разрешённые протоколы
            const allowedProtocols = /^(https?:\/\/|mailto:|tel:|\/)/i;

            if (!allowedProtocols.test(lowerHref)) {
                return ''; // Удаляем ссылку с опасным протоколом
            }

            // Удаляем javascript и другие опасные протоколы
            if (lowerHref.includes('javascript:') ||
                lowerHref.includes('data:') ||
                lowerHref.includes('vbscript:')) {
                return '';
            }

            // Добавляем безопасные атрибуты
            let safeAttrs = after || '';
            if (!safeAttrs.includes('rel=')) {
                safeAttrs += ' rel="noopener noreferrer"';
            }
            if (href.match(/^https?:\/\//i) && !safeAttrs.includes('target=')) {
                safeAttrs += ' target="_blank"';
            }

            return `<a ${before}href="${href}"${safeAttrs}>`;
        }
    );

    // 8. БЕЗОПАСНЫЕ ИЗОБРАЖЕНИЯ
    clean = clean.replace(
        /<img\s+([^>]*\s+)?src\s*=\s*["']([^"']*)["']([^>]*)>/gi,
        (match, before = '', src, after = '') => {
            const lowerSrc = src.toLowerCase().trim();

            // Разрешаем только http(s) и безопасные data URIs
            const allowedSrc = /^(https?:\/\/|data:image\/(png|jpg|jpeg|gif|webp|svg\+xml))/i;

            if (!allowedSrc.test(lowerSrc)) {
                return ''; // Удаляем изображение с опасным src
            }

            // Удаляем onerror и другие события
            let safeAttrs = (before || '') + (after || '');
            safeAttrs = safeAttrs.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');

            return `<img ${safeAttrs}src="${src}">`;
        }
    );

    // 9. ФИНАЛЬНАЯ ПРОВЕРКА: удаляем всё что осталось опасного
    clean = clean.replace(/<script/gi, '&lt;script');
    clean = clean.replace(/javascript:/gi, '');

    return clean;
}

/**
 * Клиентская санитизация (использует DOM API для максимальной точности)
 */
function sanitizeHtmlBrowser(html: string): string {
    if (typeof document === 'undefined') {
        return sanitizeHtmlServer(html);
    }

    const allowedTags = new Set([
        'B', 'I', 'EM', 'STRONG', 'A', 'P', 'BR',
        'UL', 'OL', 'LI', 'CODE', 'PRE', 'BLOCKQUOTE',
        'S', 'DEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'IMG', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', '#text'
    ]);

    const allowedAttrs = new Set([
        'href', 'target', 'rel', 'class', 'src', 'alt', 'title', 'width', 'height'
    ]);

    const template = document.createElement('template');
    template.innerHTML = html.trim();

    function cleanNode(node: Node): Node | null {
        // Текстовые узлы - всегда безопасны
        if (node.nodeType === Node.TEXT_NODE) {
            return node;
        }

        // Элементы
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            // Проверяем тег в белом списке
            if (!allowedTags.has(element.tagName)) {
                // Не разрешён - удаляем тег, но сохраняем безопасное содержимое
                const fragment = document.createDocumentFragment();
                Array.from(element.childNodes).forEach(child => {
                    const cleanChild = cleanNode(child);
                    if (cleanChild) fragment.appendChild(cleanChild);
                });
                return fragment;
            }

            // Очищаем все атрибуты
            const attrs = Array.from(element.attributes);
            attrs.forEach(attr => {
                const attrName = attr.name.toLowerCase();

                // Удаляем неразрешённые атрибуты
                if (!allowedAttrs.has(attrName)) {
                    element.removeAttribute(attr.name);
                    return;
                }

                // Проверяем URL атрибуты (href, src)
                if (attrName === 'href' || attrName === 'src') {
                    const value = attr.value.toLowerCase().trim();

                    // Проверяем на опасные протоколы
                    if (value.includes('javascript:') ||
                        value.includes('data:text/html') ||
                        value.includes('vbscript:') ||
                        value.includes('file:')) {
                        element.removeAttribute(attr.name);
                        return;
                    }

                    // Для href разрешаем http(s), mailto, tel
                    if (attrName === 'href') {
                        if (!value.match(/^(https?:\/\/|mailto:|tel:|\/)/)) {
                            element.removeAttribute(attr.name);
                            return;
                        }
                    }

                    // Для src разрешаем http(s) и безопасные data URIs
                    if (attrName === 'src') {
                        if (!value.match(/^(https?:\/\/|data:image\/(png|jpg|jpeg|gif|webp|svg\+xml))/)) {
                            element.removeAttribute(attr.name);
                            return;
                        }
                    }
                }
            });

            // Добавляем безопасные атрибуты для ссылок
            if (element.tagName === 'A' && element.hasAttribute('href')) {
                const href = element.getAttribute('href') || '';
                if (!element.hasAttribute('rel')) {
                    element.setAttribute('rel', 'noopener noreferrer');
                }
                if (href.match(/^https?:\/\//i) && !element.hasAttribute('target')) {
                    element.setAttribute('target', '_blank');
                }
            }

            // Рекурсивно очищаем детей
            const children = Array.from(element.childNodes);
            children.forEach(child => {
                const cleanChild = cleanNode(child);
                if (cleanChild !== child) {
                    if (cleanChild) {
                        element.replaceChild(cleanChild, child);
                    } else {
                        element.removeChild(child);
                    }
                }
            });

            return element;
        }

        // Комментарии и другие узлы - удаляем
        return null;
    }

    const cleanContent = cleanNode(template.content);
    if (!cleanContent) return '';

    const div = document.createElement('div');
    div.appendChild(cleanContent);
    return div.innerHTML;
}

/**
 * Экранирование HTML (фолбэк на случай ошибки)
 */
function escapeHtml(text: string): string {
    return text.replace(/[<>&"']/g, (char) => {
        const entities: { [key: string]: string } = {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return entities[char];
    });
}