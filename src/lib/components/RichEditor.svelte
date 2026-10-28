<script lang="ts">
	/**
	 * Поле ввода с форматированием «как в Telegram»: постоянной панели НЕТ.
	 * При выделении текста над ним всплывает мини-панель (жирный/курсив/
	 * зачёркнутый/код/ссылка/спойлер); при снятии выделения — прячется.
	 * Хранит/отдаёт markdown через bind:value
	 * (**жирный** *курсив* ~~зачёркнутый~~ `код` [текст](url) ||спойлер||).
	 * Чистая логика (разбор/сборка, чистка вставки, безопасность ссылок) — в
	 * src/lib/client/richtext.ts и покрыта тестами. Здесь — DOM-обвязка и панель.
	 */
	import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { sanitizeClipboardHtml, serializeToMarkdown, mdToInlineHtml, isSafeHttpUrl } from '$lib/client/richtext';

	export let value = '';
	export let placeholder = '';
	/** 'chat' — Enter отправляет (Shift+Enter — перенос). */
	export let variant: 'full' | 'chat' = 'full';

	const dispatch = createEventDispatcher<{ submit: void }>();
	let field: HTMLElement;
	let bar: HTMLElement;
	let last = '';
	let showBar = false;
	let barLeft = 0;
	let barTop = 0;
	let caretLeft = 20;
	let below = false;
	let active = { b: false, i: false, s: false, code: false, sp: false };

	export function focus() {
		field?.focus();
	}

	function sync() {
		const md = serializeToMarkdown(field);
		last = md;
		value = md;
	}

	// Внешняя установка value (черновик, очистка после отправки) — не затираем при вводе.
	$: if (field && value !== last) {
		last = value;
		field.innerHTML = value ? mdToInlineHtml(value) : '';
	}

	// ─── всплывающая панель по выделению ───────────────────────────────
	function selRange(): Range | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
		const r = sel.getRangeAt(0);
		return field && field.contains(r.commonAncestorContainer) ? r : null;
	}

	function inAncestor(pred: (e: Element) => boolean): boolean {
		let n: Node | null = window.getSelection()?.anchorNode ?? null;
		while (n && n !== field) {
			if (n.nodeType === 1 && pred(n as Element)) return true;
			n = n.parentNode;
		}
		return false;
	}

	async function updateBar() {
		const r = selRange();
		if (!r) { showBar = false; return; }
		try {
			active = {
				b: document.queryCommandState('bold'),
				i: document.queryCommandState('italic'),
				s: document.queryCommandState('strikeThrough'),
				code: inAncestor((e) => e.tagName === 'CODE'),
				sp: inAncestor((e) => e.classList?.contains('sp-edit'))
			};
		} catch (e) { /* queryCommandState может бросать — не критично */ }
		const rect = r.getBoundingClientRect();
		showBar = true;
		await tick(); // панель отрисована — можно измерить
		const bw = bar?.offsetWidth ?? 220;
		const bh = bar?.offsetHeight ?? 40;
		const cx = rect.left + rect.width / 2;
		const left = Math.max(8, Math.min(cx - bw / 2, window.innerWidth - bw - 8));
		let top = rect.top - bh - 10;
		below = top < 8;
		if (below) top = rect.bottom + 10;
		barLeft = left;
		barTop = top;
		caretLeft = Math.max(14, Math.min(cx - left, bw - 14));
	}

	const refresh = () => updateBar();

	onMount(() => {
		try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* */ }
		last = value;
		if (value) field.innerHTML = mdToInlineHtml(value);
		document.addEventListener('selectionchange', refresh);
		window.addEventListener('scroll', refresh, true);
		window.addEventListener('resize', refresh);
	});
	onDestroy(() => {
		document.removeEventListener('selectionchange', refresh);
		window.removeEventListener('scroll', refresh, true);
		window.removeEventListener('resize', refresh);
	});

	function onPaste(e: ClipboardEvent) {
		e.preventDefault();
		const dt = e.clipboardData;
		if (!dt) return;
		const html = dt.getData('text/html');
		const res = html
			? sanitizeClipboardHtml(html)
			: dt.getData('text/plain').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
		document.execCommand('insertHTML', false, res);
		sync();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') { showBar = false; return; }
		if (variant === 'chat' && e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			dispatch('submit');
		}
	}

	type Make = { match: (n: Element) => boolean; create: () => HTMLElement };
	function ancestor(node: Node | null, pred: (n: Element) => boolean): HTMLElement | null {
		while (node && node !== field) {
			if (node.nodeType === 1 && pred(node as Element)) return node as HTMLElement;
			node = node.parentNode;
		}
		return null;
	}
	function toggleWrap(make: Make) {
		const sel = window.getSelection();
		if (!sel || !sel.rangeCount) return;
		const range = sel.getRangeAt(0);
		const host = ancestor(range.commonAncestorContainer, make.match);
		if (host) {
			const p = host.parentNode!;
			while (host.firstChild) p.insertBefore(host.firstChild, host);
			p.removeChild(host); (p as Element).normalize?.();
		} else if (!range.collapsed) {
			const el = make.create();
			try { range.surroundContents(el); } catch (err) { el.appendChild(range.extractContents()); range.insertNode(el); }
		}
		after();
	}
	function after() { sync(); updateBar(); }
	function exec(cmd: string) { document.execCommand(cmd, false); after(); }
	function code() { toggleWrap({ match: (n) => n.tagName === 'CODE', create: () => document.createElement('code') }); }
	function spoiler() { toggleWrap({ match: (n) => n.classList?.contains('sp-edit'), create: () => { const s = document.createElement('span'); s.className = 'sp-edit'; return s; } }); }

	function link() {
		const sel = window.getSelection();
		const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
		const text = saved ? saved.toString() : '';
		let url = (window.prompt($t('editor.link_prompt'), 'https://') ?? '').trim();
		if (!url) return;
		if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
		if (!isSafeHttpUrl(url)) return;
		field.focus();
		if (saved && sel) { sel.removeAllRanges(); sel.addRange(saved); } // prompt крадёт фокус — вернуть выделение
		const label = (text || url).replace(/</g, '&lt;').replace(/>/g, '&gt;');
		document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${label}</a>`);
		after();
	}
</script>

<div class="rich">
	<div
		class="field"
		class:empty={!value}
		contenteditable="true"
		role="textbox"
		tabindex="0"
		aria-multiline="true"
		data-placeholder={placeholder}
		bind:this={field}
		on:input={sync}
		on:paste={onPaste}
		on:keydown={onKeydown}
		on:mouseup={refresh}
		on:blur={() => (showBar = false)}
	></div>
</div>

{#if showBar}
	<div class="sel-bar" class:below bind:this={bar} style="left:{barLeft}px; top:{barTop}px;" role="toolbar" aria-label={$t('editor.toolbar')}>
		<button type="button" class="tb" class:active={active.b} title={$t('editor.bold')} aria-label={$t('editor.bold')} on:mousedown|preventDefault on:click={() => exec('bold')}><b>B</b></button>
		<button type="button" class="tb" class:active={active.i} title={$t('editor.italic')} aria-label={$t('editor.italic')} on:mousedown|preventDefault on:click={() => exec('italic')}><i>I</i></button>
		<button type="button" class="tb" class:active={active.s} title={$t('editor.strike')} aria-label={$t('editor.strike')} on:mousedown|preventDefault on:click={() => exec('strikeThrough')}><span class="st">S</span></button>
		<span class="sep"></span>
		<button type="button" class="tb" class:active={active.code} title={$t('editor.code')} aria-label={$t('editor.code')} on:mousedown|preventDefault on:click={code}><span class="mono">&lt;/&gt;</span></button>
		<button type="button" class="tb" title={$t('editor.link')} aria-label={$t('editor.link')} on:mousedown|preventDefault on:click={link}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
		</button>
		<span class="sep"></span>
		<button type="button" class="tb" class:active={active.sp} title={$t('editor.spoiler')} aria-label={$t('editor.spoiler')} on:mousedown|preventDefault on:click={spoiler}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
		</button>
		<span class="caret" style="left:{caretLeft}px;"></span>
	</div>
{/if}

<style>
	.rich { border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; background: #111; }
	.field { min-height: 44px; max-height: 220px; overflow-y: auto; padding: 10px 12px; font-size: 0.95rem; line-height: 1.6; outline: none; }
	.field.empty::before { content: attr(data-placeholder); color: #666; pointer-events: none; }
	.field :global(strong), .field :global(b) { color: #fff; font-weight: 700; }
	.field :global(em), .field :global(i) { font-style: italic; }
	.field :global(a) { color: #6cb6ff; }
	.field :global(code) { font-family: ui-monospace, monospace; background: rgba(255, 255, 255, 0.1); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
	.field :global(.sp-edit) { background: rgba(245, 205, 70, 0.22); border-radius: 3px; padding: 0 2px; box-shadow: inset 0 0 0 1px rgba(245, 205, 70, 0.4); }

	.sel-bar { position: fixed; z-index: 1000; display: inline-flex; align-items: center; gap: 1px; padding: 4px; background: #26272e; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); }
	.tb { min-width: 30px; height: 30px; padding: 0 7px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; border-radius: 6px; color: #dcdcdc; cursor: pointer; font-size: 0.95rem; font-family: inherit; transition: background 0.12s, color 0.12s; }
	.tb:hover { background: rgba(245, 205, 70, 0.14); color: var(--cyber-yellow, #f5cd46); }
	.tb.active { background: rgba(245, 205, 70, 0.18); color: var(--cyber-yellow, #f5cd46); }
	.tb svg { width: 16px; height: 16px; }
	.tb .st { text-decoration: line-through; }
	.tb .mono { font-family: ui-monospace, monospace; font-size: 0.8rem; }
	.sep { width: 1px; height: 18px; margin: 0 3px; background: rgba(255, 255, 255, 0.14); }
	.caret { position: absolute; bottom: -5px; width: 10px; height: 10px; background: #26272e; border-right: 1px solid rgba(255, 255, 255, 0.12); border-bottom: 1px solid rgba(255, 255, 255, 0.12); transform: rotate(45deg); }
	.sel-bar.below .caret { bottom: auto; top: -5px; border-right: 0; border-bottom: 0; border-left: 1px solid rgba(255, 255, 255, 0.12); border-top: 1px solid rgba(255, 255, 255, 0.12); }
</style>
