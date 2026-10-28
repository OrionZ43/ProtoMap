/**
 * Чистые помощники редактора сообщений (контент-editable) и инлайн-разметки.
 * Вынесены сюда, потому что это места с риском инъекций — их надо покрывать
 * тестами отдельно от DOM-компонента.
 *
 * Общий контракт разметки (что уходит в text сообщения, читают сайт и апп):
 *   **жирный**  *курсив*  ~~зачёркнутый~~  `код`  [текст](https://…)  ||спойлер||
 *
 * Принципы безопасности:
 *  - любой текст экранируется ДО вставки тегов (как в spoilerToHtml);
 *  - ссылки — только http(s); javascript:/data:/прочее отбрасываются и на
 *    вставке из буфера, и при разборе markdown;
 *  - спойлер, код и ссылка «изымаются» из строки заглушками ДО проходов
 *    жирный/курсив — иначе разметка лезет внутрь адреса ссылки и внутрь
 *    атрибута data-text спойлера и ломает/инъектит HTML.
 */

function escTxt(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return escTxt(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Разрешена ли ссылка: только http(s). */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  return /^https?:\/\//i.test((url ?? "").trim());
}

const BOLD_STYLE = /font-weight\s*:\s*(bold|[6-9]\d\d)/i;
const ITALIC_STYLE = /font-style\s*:\s*italic/i;
const STRIKE_STYLE = /text-decoration[^;]*line-through/i;
const MONO_STYLE = /font-family[^;]*(mono|consolas|courier)/i;
// Явная «нежирность»/«некурсивность» перебивает тег <b>/<i>. Google Docs
// оборачивает весь фрагмент в <b style="font-weight:normal">, из-за чего без
// этой проверки жирным становится вся вставка.
const WEIGHT_OFF = /font-weight\s*:\s*(normal|[1-5]\d\d)\b/i;
const STYLE_OFF = /font-style\s*:\s*normal/i;

function walkClean(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += escTxt(n.textContent ?? ""); return; }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return;
    if (tag === "br") { out += "<br>"; return; }
    const st = el.getAttribute("style") ?? "";
    const cls = el.getAttribute("class") ?? "";
    const inner = walkClean(el);
    let r = inner;
    const mono = tag === "code" || tag === "kbd" || tag === "samp" || MONO_STYLE.test(st);
    const strike = tag === "s" || tag === "strike" || tag === "del" || STRIKE_STYLE.test(st);
    const italic = !STYLE_OFF.test(st) && (tag === "i" || tag === "em" || ITALIC_STYLE.test(st));
    const bold = !WEIGHT_OFF.test(st) && (tag === "b" || tag === "strong" || BOLD_STYLE.test(st));
    const spoiler = /(^|\s)(spoiler|sp-edit)(\s|$)/.test(cls);
    if (mono) r = `<code>${r}</code>`;
    if (strike) r = `<s>${r}</s>`;
    if (italic) r = `<em>${r}</em>`;
    if (bold) r = `<strong>${r}</strong>`;
    if (spoiler) r = `<span class="sp-edit">${r}</span>`;
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      if (isSafeHttpUrl(href)) r = `<a href="${escAttr(href)}">${r}</a>`;
    }
    if (/^(p|div|li|h[1-6]|blockquote|tr)$/.test(tag)) r = r + "<br>";
    out += r;
  });
  return out;
}

/**
 * Очистка вставленного из буфера HTML: оставить только наш набор
 * (жирный/курсив/зачёркнутый/код/ссылки/спойлер, в т.ч. заданные стилем),
 * выкинуть чужие шрифты/цвета/размеры, скрипты и обработчики событий.
 */
export function sanitizeClipboardHtml(html: string | null | undefined): string {
  if (!html || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return walkClean(doc.body).replace(/(<br>)+$/g, "");
}

/** Жирный/курсив/зачёркнутый по уже экранированному и «изъятому» тексту. */
function inlineEmphasis(h: string): string {
  return h
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+?)~~/g, "<s>$1</s>");
}

function renderInlineLine(line: string): string {
  // \u0000 — служебный маркер заглушек; из входа его убираем, чтобы им нельзя
  // было подделать заглушку.
  let h = escTxt(line.replace(/\u0000/g, ""));
  const stash: string[] = [];
  const put = (htmlPiece: string): string => `\u0000${stash.push(htmlPiece) - 1}\u0000`;

  // Порядок = приоритет при столкновении на одном символе: спойлер > ссылка > код.
  // Спойлер первым, его содержимое остаётся ПЛОСКИМ (и в data-text, и на экране).
  h = h.replace(/\|\|([^|\n]+?)\|\|/g, (_m, s: string) =>
    put(`<span class="spoiler" data-text="${s.replace(/"/g, "&quot;")}">${s}</span>`));
  // Ссылка — адрес не форматируется; форматируется только текст. Код — литералом.
  // У обоих из содержимого ИСКЛЮЧЁН \u0000: иначе внешний элемент «проглотит» уже
  // изъятую заглушку, а разворот за один проход оставит внутреннюю сырой («a0c»).
  // С исключением вложенное просто не размечается (внешние маркеры — литералом).
  h = h.replace(/\[([^\]\n\u0000]+?)\]\(([^)\s\u0000]+?)\)/g, (_m, tx: string, u: string) =>
    isSafeHttpUrl(u)
      ? put(`<a href="${u.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${inlineEmphasis(tx)}</a>`)
      : _m);
  h = h.replace(/`([^`\n\u0000]+?)`/g, (_m, c: string) => put(`<code>${c}</code>`));

  h = inlineEmphasis(h);
  return h.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => stash[Number(i)]);
}

/** Markdown → безопасный инлайн-HTML (для показа и для deser в редакторе). */
export function mdToInlineHtml(md: string | null | undefined): string {
  if (!md) return "";
  return md.split("\n").map(renderInlineLine).join("<br>");
}

/** Маркер не переходит через \n: закрываем и открываем его на каждой строке. */
function wrapMd(marker: string, inner: string): string {
  if (!inner) return "";
  return inner.split("\n").map((seg) => (seg ? marker + seg + marker : seg)).join("\n");
}

/**
 * Кодируем в адресе символы, которые иначе съест разбор markdown: скобки
 * (обрывают `(url)`), `* ~ \` |` (проходы форматирования) и пробел.
 */
function encUrlForMd(u: string | null | undefined): string {
  return (u ?? "").replace(/[()*~`| ]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

/** contenteditable (DOM) → markdown. Обратная к mdToInlineHtml по набору тегов. */
export function serializeToMarkdown(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += n.textContent ?? ""; return; }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    const t = el.tagName.toLowerCase();
    const inner = serializeToMarkdown(el);
    if (t === "b" || t === "strong") out += wrapMd("**", inner);
    else if (t === "i" || t === "em") out += wrapMd("*", inner);
    else if (t === "s" || t === "strike" || t === "del") out += wrapMd("~~", inner);
    else if (t === "code") out += wrapMd("`", inner);
    else if (t === "a" && isSafeHttpUrl(el.getAttribute("href"))) out += `[${inner}](${encUrlForMd(el.getAttribute("href"))})`;
    else if (el.classList?.contains("sp-edit")) out += wrapMd("||", inner);
    else if (t === "br") out += "\n";
    else if (t === "div" || t === "p") out += (out && !out.endsWith("\n") ? "\n" : "") + inner;
    else out += inner;
  });
  return out;
}
