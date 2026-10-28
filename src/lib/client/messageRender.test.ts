import { describe, it, expect } from 'vitest';
import { renderMessageHtml, spoilerToPreview, MSG_ALLOWED_TAGS, MSG_ALLOWED_ATTR } from './spoilers';

/**
 * Структурная проверка: разбираем уже отсанитайзенный вывод в DOM и
 * утверждаем, что выжили ТОЛЬКО разрешённые теги/атрибуты, нет ни одного
 * обработчика событий (on*), а href — только http(s). Проверяем структуру, а
 * не подстроки: подстрока «onerror» может легально лежать в тексте, но как
 * АТРИБУТ её быть не должно. Именно сочетания, а не одиночные векторы, —
 * то, на чём ручной разбор уже прокололся.
 */
function assertSafe(input: string): string {
  const out = renderMessageHtml(input);
  const root = document.createElement('div');
  root.innerHTML = out;
  root.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    expect(MSG_ALLOWED_TAGS, `тег <${tag}> для ввода ${JSON.stringify(input)}`).toContain(tag);
    for (const attr of el.getAttributeNames()) {
      expect(attr.startsWith('on'), `обработчик ${attr} для ${JSON.stringify(input)}`).toBe(false);
      expect(MSG_ALLOWED_ATTR, `атрибут ${attr} для ${JSON.stringify(input)}`).toContain(attr);
      if (attr === 'href') {
        expect(/^https?:\/\//i.test(el.getAttribute('href') ?? '')).toBe(true);
      }
    }
  });
  expect(out.toLowerCase()).not.toContain('<script');
  expect(out.toLowerCase()).not.toContain('<iframe');
  return out;
}

describe('renderMessageHtml — атаки (одиночные и в сочетаниях)', () => {
  const PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '<b onclick="alert(1)">x</b>',
    '<a href="javascript:alert(1)">x</a>',
    '[x](javascript:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](vbscript:msgbox(1))',
    // сочетания — именно здесь была дыра #5
    '||[a](https://x.com)||',
    '||**b**||',
    '||" onmouseover="alert(1)||',
    '||</span><img src=x onerror=alert(1)>||',
    '**</strong><script>alert(1)</script>**',
    '`</code><img src=x onerror=alert(1)>`',
    '[</a><script>alert(1)</script>](https://x.com)',
    '[text](https://x.com" onmouseover="alert(1))',
    '[x](https://x.com/<img src=y onerror=alert(1)>)',
    // попытка подделать служебную заглушку
    '\u0000{0}\u0000 **x**',
    // уже экранированное остаётся текстом
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  ];

  for (const p of PAYLOADS) {
    it(`безопасно: ${JSON.stringify(p).slice(0, 48)}`, () => {
      assertSafe(p);
    });
  }
});

describe('renderMessageHtml — легальная разметка выживает после DOMPurify', () => {
  it('жирный/курсив/зачёркнутый/код', () => {
    const out = renderMessageHtml('**ж** *к* ~~з~~ `код`');
    expect(out).toContain('<strong>ж</strong>');
    expect(out).toContain('<em>к</em>');
    expect(out).toContain('<s>з</s>');
    expect(out).toContain('<code>код</code>');
  });
  it('ссылка http(s) с target/rel', () => {
    const out = renderMessageHtml('[сайт](https://x.com)');
    const d = document.createElement('div');
    d.innerHTML = out;
    const a = d.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://x.com');
    expect(a?.getAttribute('rel')).toContain('noopener');
    expect(a?.getAttribute('target')).toBe('_blank');
  });
  it('спойлер сохраняет class и data-text (нужны анимации)', () => {
    const out = renderMessageHtml('||секрет||');
    const d = document.createElement('div');
    d.innerHTML = out;
    const sp = d.querySelector('span.spoiler');
    expect(sp).not.toBeNull();
    expect(sp?.getAttribute('data-text')).toBe('секрет');
  });
});

describe('spoilerToPreview — не светит содержимое', () => {
  it('маскирует спойлер в превью', () => {
    expect(spoilerToPreview('тайна ||секрет|| тут')).toBe('тайна ░░░ тут');
    expect(spoilerToPreview('||секрет||')).not.toContain('секрет');
  });
});
