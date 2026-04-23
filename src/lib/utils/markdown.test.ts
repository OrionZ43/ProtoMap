import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from './markdown';
import { marked } from 'marked';

describe('renderMarkdown', () => {

    describe('Error handling', () => {
        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should fall back to escapeHtml when marked.parse throws an error', () => {
            vi.spyOn(marked, 'parse').mockImplementation(() => {
                throw new Error('Test parsing error');
            });

            const text = 'test <script>alert("xss")</script> & other \'chars\'';
            const result = renderMarkdown(text);
            const expected = 'test &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; other &#39;chars&#39;';

            expect(result).toBe(expected);
            expect(marked.parse).toHaveBeenCalledWith(text, expect.any(Object));
            expect(console.error).toHaveBeenCalledWith('[Markdown] Error:', expect.any(Error));
        });
    });

    describe('Empty and null values', () => {
        it('should return empty string for null', () => {
            expect(renderMarkdown(null)).toBe('');
        });
        it('should return empty string for undefined', () => {
            expect(renderMarkdown(undefined)).toBe('');
        });
        it('should return empty string for empty string', () => {
            expect(renderMarkdown('')).toBe('');
        });
    });

    describe('Basic markdown formatting', () => {
        it('should render bold text', () => {
            const result = renderMarkdown('**bold**');
            expect(result).toContain('<strong>bold</strong>');
        });
        it('should render italic text', () => {
            const result = renderMarkdown('*italic*');
            expect(result).toContain('<em>italic</em>');
        });
        it('should render headings', () => {
            const result = renderMarkdown('# Heading 1');
            expect(result).toContain('<h1>Heading 1</h1>');
        });
        it('should render lists', () => {
            const result = renderMarkdown('- item 1\n- item 2');
            expect(result).toContain('<ul>');
            expect(result).toContain('<li>item 1</li>');
            expect(result).toContain('<li>item 2</li>');
        });
        it('should render links', () => {
            const result = renderMarkdown('[link](https://example.com)');
            expect(result).toContain('<a href="https://example.com"');
            expect(result).toContain('target="_blank"');
            expect(result).toContain('rel="noopener noreferrer"');
        });
    });

    describe('XSS prevention', () => {
        it('should strip script tags', () => {
            const result = renderMarkdown('<script>alert("xss")</script>');
            expect(result).not.toContain('<script>');
        });
        it('should handle broken HTML gracefully', () => {
            const result = renderMarkdown('<div onclick="alert(1)">text</div>');
            expect(result).not.toContain('onclick');
        });
    });

    describe('Safe HTML attributes', () => {
        it('should allow src and alt in images', () => {
            const result = renderMarkdown('![alt text](https://example.com/img.jpg)');
            expect(result).toContain('img');
            expect(result).toContain('src="https://example.com/img.jpg"');
            expect(result).toContain('alt="alt text"');
        });
    });

    describe('Environment handling (Server vs DOM)', () => {
        const originalDocument = global.document;

        afterEach(() => {
            if (originalDocument !== undefined) {
                global.document = originalDocument;
            } else {
                // @ts-ignore
                delete global.document;
            }
        });

        it('should sanitize with DOM if document is defined', () => {
            expect(typeof document).toBe('object');
            const result = renderMarkdown('**DOM**');
            expect(result).toContain('<strong>DOM</strong>');
        });

        it('should sanitize with server-side logic if document is undefined', () => {
            // @ts-ignore
            delete global.document;
            expect(typeof document).toBe('undefined');

            const result = renderMarkdown('**Server**');
            expect(result).toContain('<strong>Server</strong>');

            const xssResult = renderMarkdown('[xss](javascript:alert("xss"))');
            expect(xssResult).toContain('<a>xss</a>');
            expect(xssResult).not.toContain('javascript:');
        });
    });
});