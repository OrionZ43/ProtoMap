import { describe, it, expect } from 'vitest';
import { sanitizeClipboardHtml, mdToInlineHtml, serializeToMarkdown, isSafeHttpUrl } from './richtext';

describe('isSafeHttpUrl', () => {
  it('только http(s)', () => {
    expect(isSafeHttpUrl('https://x.com')).toBe(true);
    expect(isSafeHttpUrl('http://x.com')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,x')).toBe(false);
    expect(isSafeHttpUrl('/relative')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});

describe('sanitizeClipboardHtml (вставка из буфера)', () => {
  it('выкидывает <script> и обработчики, оставляет жирный', () => {
    const out = sanitizeClipboardHtml('<b>привет</b><script>alert(1)</script>');
    expect(out).toBe('<strong>привет</strong>');
    expect(out).not.toContain('script');
  });
  it('<img onerror> срезается полностью', () => {
    const out = sanitizeClipboardHtml('до<img src=x onerror=alert(1)>после');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror');
    expect(out).toContain('до');
    expect(out).toContain('после');
  });
  it('javascript:-ссылка теряет href, текст остаётся', () => {
    const out = sanitizeClipboardHtml('<a href="javascript:alert(1)">клик</a>');
    expect(out).not.toContain('href');
    expect(out).not.toContain('javascript');
    expect(out).toContain('клик');
  });
  it('http-ссылка сохраняется', () => {
    expect(sanitizeClipboardHtml('<a href="https://x.com">сайт</a>')).toBe('<a href="https://x.com">сайт</a>');
  });
  it('жирный/курсив стилем (Word): распознаются, цвет/размер выкидываются', () => {
    const out = sanitizeClipboardHtml('<span style="font-weight:700;color:red;font-size:30px">Ж</span><span style="font-style:italic">К</span>');
    expect(out).toBe('<strong>Ж</strong><em>К</em>');
    expect(out).not.toContain('color');
    expect(out).not.toContain('font-size');
  });
  // находка андроид-сессии #6: Google Docs оборачивает всё в <b font-weight:normal>
  it('font-weight:normal перебивает тег <b> (обёртка Google Docs)', () => {
    const out = sanitizeClipboardHtml('<b style="font-weight:normal" id="docs-internal-guid-x">plain <b>bold</b></b>');
    expect(out).toBe('plain <strong>bold</strong>');
  });
  // находка #д: копирование нашего спойлера сохраняет формат
  it('class="spoiler" при вставке становится редакторским sp-edit', () => {
    expect(sanitizeClipboardHtml('<span class="spoiler">secret</span>')).toBe('<span class="sp-edit">secret</span>');
  });
});

describe('mdToInlineHtml (markdown → показ)', () => {
  it('экранирует html', () => {
    expect(mdToInlineHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('жирный/курсив/зачёркнутый/код/спойлер', () => {
    expect(mdToInlineHtml('**ж** *к* ~~з~~ `код` ||с||')).toBe(
      '<strong>ж</strong> <em>к</em> <s>з</s> <code>код</code> <span class="spoiler" data-text="с">с</span>'
    );
  });
  it('http-ссылка → <a>, javascript — без href', () => {
    const ok = mdToInlineHtml('[сайт](https://x.com)');
    expect(ok).toContain('<a href="https://x.com"');
    expect(ok).toContain('rel="noopener noreferrer"');
    const bad = mdToInlineHtml('[клик](javascript:alert(1))');
    expect(bad).not.toContain('<a');
    expect(bad).not.toContain('href');
  });
  it('курсив снаружи жирного — оба применяются (контракт вложенности)', () => {
    expect(mdToInlineHtml('*a **b** c*')).toContain('<em>a <strong>b</strong> c</em>');
  });
  // находка #3: адрес не должен экранироваться дважды
  it('амперсанд в адресе экранируется один раз, ссылка цела', () => {
    const out = mdToInlineHtml('[ютуб](https://youtube.com/watch?v=x&t=10)');
    expect(out).toContain('href="https://youtube.com/watch?v=x&amp;t=10"');
    expect(out).not.toContain('&amp;amp;');
  });
  // находка #4: проходы форматирования не должны лезть в адрес
  it('звёздочки в адресе не превращаются в <em>', () => {
    const out = mdToInlineHtml('[a](https://x.com/*y*)');
    expect(out).toContain('href="https://x.com/*y*"');
    expect(out).not.toContain('<em>');
  });
  // находка #5: инъекция в data-text спойлера через ссылку/жирный
  it('ссылка внутри спойлера не ломает атрибут data-text', () => {
    const out = mdToInlineHtml('||[a](https://x.com)||');
    expect(out).toContain('class="spoiler"');
    expect(out).toContain('data-text="[a](https://x.com)"');
    expect(out).not.toContain('<a '); // ссылка не рендерится внутри спойлера
  });
  it('жирный внутри спойлера остаётся плоским в data-text', () => {
    const out = mdToInlineHtml('||**ж**||');
    expect(out).toContain('data-text="**ж**"');
    expect(out).not.toContain('<strong>');
  });
  // «мелочь» андроид-сессии: внутри кода разметка не разбирается
  it('внутри `кода` разметка остаётся литералом', () => {
    expect(mdToInlineHtml('`a**b**c`')).toContain('<code>a**b**c</code>');
    expect(mdToInlineHtml('`a**b**c`')).not.toContain('<strong>');
  });
  // находка андроид-сессии: вложенная заглушка не должна протекать сырой («a0c»)
  it('вложенный спойлер не оставляет сырую заглушку \\u0000', () => {
    const a = mdToInlineHtml('`a||b||c`');
    expect(a).not.toContain('\u0000');
    expect(a).toContain('<span class="spoiler"');
    expect(mdToInlineHtml('[||x||](https://y)')).not.toContain('\u0000');
    expect(mdToInlineHtml('[a](https://x||b||)')).not.toContain('\u0000');
  });
});

describe('serializeToMarkdown (поле → markdown)', () => {
  it('теги редактора → разметка', () => {
    const d = document.createElement('div');
    d.innerHTML = 'Это <b>ж</b>, <i>к</i>, <code>c</code>, <a href="https://x.com">л</a> и <span class="sp-edit">с</span>';
    expect(serializeToMarkdown(d)).toBe('Это **ж**, *к*, `c`, [л](https://x.com) и ||с||');
  });
  it('небезопасную ссылку не сериализует как ссылку', () => {
    const d = document.createElement('div');
    d.innerHTML = '<a href="javascript:x">т</a>';
    expect(serializeToMarkdown(d)).toBe('т');
  });
  // находка #2: маркер не должен перескакивать через перенос строки
  it('жирный через перенос закрывается и открывается на каждой строке', () => {
    const d = document.createElement('div');
    d.innerHTML = '<b>a<br>b</b>';
    expect(serializeToMarkdown(d)).toBe('**a**\n**b**');
  });
  // находка #4: спецсимволы адреса кодируются, чтобы разбор их не съел
  it('скобки в адресе кодируются при сериализации', () => {
    const d = document.createElement('div');
    d.innerHTML = '<a href="https://x.com/a(b)">t</a>';
    expect(serializeToMarkdown(d)).toBe('[t](https://x.com/a%28b%29)');
  });
});
