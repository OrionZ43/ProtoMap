import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from './markdown';
import { marked } from 'marked';

describe('Markdown Utils', () => {
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

        // Expected output from escapeHtml
        const expected = 'test &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; other &#39;chars&#39;';

        expect(result).toBe(expected);
        expect(marked.parse).toHaveBeenCalledWith(text, expect.any(Object));
        expect(console.error).toHaveBeenCalledWith('[Markdown] Error:', expect.any(Error));
    });
});
