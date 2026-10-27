import { describe, it, expect } from 'vitest';
import { spoilerToHtml } from './spoilers';

describe('spoilerToHtml', () => {
  it('пустое/отсутствующее → пустая строка', () => {
    expect(spoilerToHtml('')).toBe('');
    expect(spoilerToHtml(null)).toBe('');
    expect(spoilerToHtml(undefined)).toBe('');
  });

  it('оборачивает ||...|| в спойлер-спан с data-text', () => {
    const out = spoilerToHtml('тайна: ||он предатель||, вот так');
    expect(out).toContain('<span class="spoiler" data-text="он предатель">он предатель</span>');
    expect(out.startsWith('тайна: ')).toBe(true);
  });

  it('несколько спойлеров в одном тексте', () => {
    const out = spoilerToHtml('||a|| и ||b||');
    expect(out).toBe('<span class="spoiler" data-text="a">a</span> и <span class="spoiler" data-text="b">b</span>');
  });

  it('текст без спойлеров просто экранируется', () => {
    expect(spoilerToHtml('обычный текст')).toBe('обычный текст');
    expect(spoilerToHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('XSS вне спойлера: теги инертны', () => {
    const out = spoilerToHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('XSS внутри спойлера: содержимое экранировано, тег не исполняется', () => {
    const out = spoilerToHtml('||<img src=x onerror=alert(1)>||');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    // span обёртка есть, но полезная нагрузка инертна
    expect(out).toContain('class="spoiler"');
  });

  it('инъекция кавычкой не ломает атрибут data-text', () => {
    const out = spoilerToHtml('||" onmouseover="alert(1)||');
    // кавычки экранированы — из атрибута не выйти
    expect(out).not.toMatch(/data-text="[^"]*"\s+onmouseover/);
    expect(out).toContain('&quot;');
  });

  it('одиночная | и пустые || не превращаются в спойлер', () => {
    expect(spoilerToHtml('a | b')).toBe('a | b');
    expect(spoilerToHtml('||||')).toBe('||||');
  });
});
