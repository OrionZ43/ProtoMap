/**
 * Спойлеры в сообщениях: `||скрытый текст||`.
 *
 * Две части:
 *  - `spoilerToHtml()` — превращает ПЛОСКИЙ текст сообщения в HTML, где `||...||`
 *    становится `<span class="spoiler" data-text="...">...</span>`. Весь текст
 *    экранируется ДО вставки тегов, поэтому XSS через `{@html}` невозможен
 *    (чат раньше рисовал `{msg.text}` с авто-экранированием — тут экранируем сами).
 *  - действие `spoilers` (use:spoilers на контейнере) — на клиенте находит
 *    `.spoiler` и запускает эффект: облако меняющихся символов, по тапу
 *    расшифровывается. В покое ничего не переносится — каждый символ сидит в
 *    ячейке ширины своей настоящей буквы (иначе при мерцании строки прыгают).
 *
 * Для markdown-поверхностей (комментарии, новости) `||...||` подключается
 * отдельно, расширением marked в `markdown.ts`, но стили и действие — общие.
 */

/** Экранирование для HTML-текста И значений атрибутов (& сначала). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Плоский текст → HTML со спойлерами. Безопасно для `{@html}`: сначала
 * экранируем весь текст, потом оборачиваем уже экранированные `||...||`.
 * Спойлер — в пределах одной строки, без вложенных `|`.
 */
export function spoilerToHtml(text: string | null | undefined): string {
  if (!text) return '';
  const e = esc(text);
  return e.replace(/\|\|([^|\n]+?)\|\|/g, (_m, inner: string) =>
    `<span class="spoiler" data-text="${inner}">${inner}</span>`
  );
}

const GLYPHS = '0123456789/\\|!<>=+:;?';
const rg = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/** Запускает эффект на одном `.spoiler`. Возвращает очистку (стоп таймера). */
function initSpoiler(el: HTMLElement, label?: string): () => void {
  const real = el.dataset.text ?? el.textContent ?? '';
  const cs = getComputedStyle(el);
  const mc = document.createElement('canvas').getContext('2d');
  if (mc) mc.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;

  el.textContent = '';
  const cells: HTMLElement[] = [];
  const reals: string[] = [];
  const tokens = real.match(/\s+|\S+/g) ?? [];
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) { el.appendChild(document.createTextNode(tok)); continue; }
    const word = document.createElement('span');
    word.className = 'sp-word';
    for (const ch of tok) {
      const cell = document.createElement('span');
      cell.className = 'sp-cell';
      const w = mc ? Math.ceil(mc.measureText(ch).width * 100) / 100 : 0;
      if (w) cell.style.width = `${w}px`;
      cell.textContent = ch;
      word.appendChild(cell);
      cells.push(cell);
      reals.push(ch);
    }
    el.appendChild(word);
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let locked = 0;
  const total = cells.length;

  const scrambleTick = () => {
    const cap = Math.min(8, Math.max(1, Math.round(total * 0.4)));
    for (let k = 0; k < cap; k++) {
      const i = (Math.random() * total) | 0;
      if (cells[i]) cells[i].textContent = rg();
    }
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const reveal = () => {
    if (el.classList.contains('on')) return;
    el.classList.add('on');
    stop();
    const stepMs = Math.max(12, Math.round(620 / Math.max(1, total)));
    timer = setInterval(() => {
      locked++;
      for (let i = 0; i < total; i++) cells[i].textContent = i < locked ? reals[i] : rg();
      if (locked >= total) { stop(); el.textContent = real; }
    }, stepMs);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); reveal(); }
  };

  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  if (label) el.setAttribute('aria-label', label);
  el.addEventListener('click', reveal);
  el.addEventListener('keydown', onKey);

  for (const c of cells) c.textContent = rg();
  timer = setInterval(scrambleTick, 85);

  return () => { stop(); el.removeEventListener('click', reveal); el.removeEventListener('keydown', onKey); };
}

/**
 * Действие Svelte: на контейнере с сообщениями находит `.spoiler` и инициализирует.
 * Пере-сканирует при изменении содержимого (новые сообщения), чистит таймеры на destroy.
 */
export function spoilers(node: HTMLElement, params?: { label?: string }) {
  let label = params?.label;
  const cleanups = new Set<() => void>();
  const scan = () => {
    node.querySelectorAll<HTMLElement>('.spoiler:not([data-sp])').forEach((el) => {
      el.setAttribute('data-sp', '1');
      cleanups.add(initSpoiler(el, label));
    });
  };
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(node, { childList: true, subtree: true });
  return {
    update(p?: { label?: string }) { label = p?.label; },
    destroy() {
      mo.disconnect();
      cleanups.forEach((fn) => fn());
      cleanups.clear();
    },
  };
}
