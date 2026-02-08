import { marked } from 'marked';

export function renderMarkdown(text: string | null | undefined): string {
    if (!text) return '';

    try {
        const html = marked.parse(text, {
            breaks: true,
            gfm: true,
            silent: true
        }) as string;

        if (typeof document !== 'undefined') {
            return sanitizeWithDOM(html);
        } else {
            return sanitizeServerSide(html);
        }
    } catch (error) {
        console.error('[Markdown] Error:', error);
        return escapeHtml(text);
    }
}

function sanitizeWithDOM(html: string): string {
    const template = document.createElement('template');
    template.innerHTML = html;

    const allowedTags = new Set([
        'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'S', 'DEL',
        'A', 'CODE', 'PRE', 'BLOCKQUOTE',
        'UL', 'OL', 'LI',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
        'HR', 'IMG'
    ]);

    const allowedAttrs = new Set(['href', 'src', 'alt', 'title', 'width', 'height']);

    function clean(node: Node): Node | null {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode(true);
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;

            if (!allowedTags.has(el.tagName)) {
                const frag = document.createDocumentFragment();
                Array.from(el.childNodes).forEach(child => {
                    const cleaned = clean(child);
                    if (cleaned) frag.appendChild(cleaned);
                });
                return frag;
            }

            const newEl = el.cloneNode(false) as Element;

            Array.from(el.attributes).forEach(attr => {
                if (allowedAttrs.has(attr.name)) {
                    if (attr.name === 'href' || attr.name === 'src') {
                        const url = attr.value.toLowerCase();
                        if (!url.includes('javascript:') &&
                            !url.includes('data:text') &&
                            !url.includes('vbscript:')) {
                            newEl.setAttribute(attr.name, attr.value);
                        }
                    } else {
                        newEl.setAttribute(attr.name, attr.value);
                    }
                }
            });

            if (newEl.tagName === 'A' && newEl.hasAttribute('href')) {
                newEl.setAttribute('rel', 'noopener noreferrer');
                const href = newEl.getAttribute('href') || '';
                if (href.match(/^https?:\/\//)) {
                    newEl.setAttribute('target', '_blank');
                }
            }

            Array.from(el.childNodes).forEach(child => {
                const cleaned = clean(child);
                if (cleaned) newEl.appendChild(cleaned);
            });

            return newEl;
        }

        return null;
    }

    const div = document.createElement('div');
    Array.from(template.content.childNodes).forEach(child => {
        const cleaned = clean(child);
        if (cleaned) div.appendChild(cleaned);
    });

    return div.innerHTML;
}

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

function isSafeUrl(url: string): boolean {
    const lower = url.toLowerCase().trim();

    if (lower.includes('javascript:') ||
        lower.includes('data:text') ||
        lower.includes('vbscript:') ||
        lower.includes('file:')) {
        return false;
    }

    return /^(https?:\/\/|mailto:|tel:|\/)/i.test(url);
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
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}