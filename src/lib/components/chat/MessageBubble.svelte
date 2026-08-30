<!-- src/lib/components/chat/MessageBubble.svelte -->
<!--
	Единый рендер одного сообщения для всех личек: и полноэкранной страницы
	/messages, и виджета DMInbox. До этого разметка пузыря существовала в двух
	копиях и уже разошлась — в виджете была кнопка «копировать», на странице
	ленивая загрузка волны голосового. Здесь собрано и то, и другое.

	Стиль — «Радиоэфир»: свои сообщения жёлтые (передача), чужие циановые
	(приём), голосовые разворачиваются во всю ширину пузыря.
-->
<script lang="ts">
	import VoiceMessage from '$lib/components/chat/VoiceMessage.svelte';
	import ImageLightbox from '$lib/components/chat/ImageLightbox.svelte';
	import { getStickerUrl, type StickerPack } from '$lib/stores/stickerStore';
	import {
		mtype,
		fmtTime,
		countReactions,
		reactionCount,
		QUICK_EMOJI
	} from '$lib/utils/chatFormat';
	import type { DMMessage } from '$lib/stores/dmStore';

	export let msg: DMMessage;
	export let isOwn: boolean;
	export let partnerUid: string = '';
	export let partnerAvatar: string | null = null;
	export let myUid: string | null = null;
	export let packs: StickerPack[] = [];
	/** Показывать аватар собеседника слева (выключено в Избранном и при группировке). */
	export let showAvatar: boolean = true;
	/** Контейнер прокрутки — root для ленивой загрузки волны голосового. */
	export let scrollRoot: HTMLElement | null = null;
	/** Узкий режим для виджета: меньше стикеры и картинки. */
	export let compact: boolean = false;
	/** Реакция поставлена/снята. Запись в Firestore — забота потребителя. */
	export let onReact: (msg: DMMessage, emoji: string) => void = () => {};

	let hovered = false;
	let panelOpen = false;
	let lightboxOpen = false;
	let voiceVisible = false;
	let copied = false;

	$: T = mtype(msg.type);
	$: readByPartner = Boolean(partnerUid && msg.read_by?.[partnerUid]);
	$: myReaction = msg.reactions?.[myUid ?? ''] ?? null;

	function sticker(packId: string | null | undefined, filename: string | number): string {
		return getStickerUrl(packs, packId, filename);
	}

	function togglePanel(e: MouseEvent) {
		e.stopPropagation();
		panelOpen = !panelOpen;
	}

	function pick(emoji: string) {
		onReact(msg, emoji);
		panelOpen = false;
	}

	async function copyText() {
		try {
			await navigator.clipboard.writeText(msg.text);
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch (err) {
			console.warn('[Chat] copy failed:', err);
		}
	}

	/** Волну голосового декодируем только когда пузырь реально виден:
	    полсотни decodeAudioData подряд подвешивают вкладку. */
	function whenVisible(node: HTMLElement) {
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						voiceVisible = true;
						obs.disconnect();
						break;
					}
				}
			},
			{ root: scrollRoot ?? null, rootMargin: '250px' }
		);
		obs.observe(node);
		return { destroy: () => obs.disconnect() };
	}
</script>

<svelte:window on:click={() => (panelOpen = false)} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="row"
	class:own={isOwn}
	class:compact
	on:mouseenter={() => (hovered = true)}
	on:mouseleave={() => (hovered = false)}
>
	{#if !isOwn && showAvatar}
		<img src={partnerAvatar} alt="" class="row-ava" />
	{:else if !isOwn}
		<span class="row-ava-spacer"></span>
	{/if}

	<div class="wrap" class:own={isOwn}>
		<div
			class="bubble"
			class:own={isOwn}
			class:sticker={T === 'STICKER'}
			class:media={T === 'IMAGE'}
			class:voice={T === 'VOICE'}
		>
			{#if msg.is_deleted}
				<span class="deleted">Сообщение удалено</span>
			{:else if T === 'STICKER' && msg.sticker_pack_id && msg.sticker_id}
				<img
					src={sticker(msg.sticker_pack_id, msg.sticker_id)}
					alt="Стикер"
					class="sticker-img"
					loading="lazy"
				/>
			{:else if T === 'IMAGE'}
				{@const imageSrc = msg.media_url || (msg.text ? `data:image/jpeg;base64,${msg.text}` : '')}
				{#if imageSrc}
					<button
						class="img-btn"
						on:click={() => (lightboxOpen = true)}
						aria-label="Открыть изображение"
					>
						<img src={imageSrc} alt="Изображение" class="chat-img" loading="lazy" />
					</button>
					<ImageLightbox
						src={imageSrc}
						open={lightboxOpen}
						onClose={() => (lightboxOpen = false)}
					/>
				{:else}
					<span class="muted">Изображение недоступно</span>
				{/if}
			{:else if T === 'VOICE'}
				<div use:whenVisible class="voice-slot">
					{#if voiceVisible}
						{#if msg.media_url}
							<VoiceMessage src={msg.media_url} {isOwn} wide={!compact} />
						{:else if msg.text}
							<VoiceMessage src="data:audio/aac;base64,{msg.text}" {isOwn} wide={!compact} />
						{:else}
							<span class="muted">Голосовое недоступно</span>
						{/if}
					{:else}
						<div class="voice-skeleton">
							<div class="vs-play"></div>
							<div class="vs-bars">
								{#each Array(compact ? 20 : 32) as _}<span></span>{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<p class="text">{msg.text}</p>
			{/if}

			{#if T !== 'STICKER'}
				<span class="time">
					{fmtTime(msg.createdAt)}
					{#if isOwn}
						<span class="ticks" class:read={readByPartner}>{readByPartner ? '✓✓' : '✓'}</span>
					{/if}
				</span>
			{/if}
		</div>

		{#if hovered && myUid}
			<div class="tools" class:own={isOwn}>
				<button class="tool-btn" on:click={togglePanel} aria-label="Поставить реакцию">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						width="13"
						height="13"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M8 14s1.5 2 4 2 4-2 4-2" />
						<line x1="9" y1="9" x2="9.01" y2="9" />
						<line x1="15" y1="9" x2="15.01" y2="9" />
					</svg>
				</button>
				{#if msg.text && !msg.is_deleted && T === 'TEXT'}
					<button class="tool-btn" on:click={copyText} aria-label="Скопировать текст">
						{#if copied}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.4"
								width="13"
								height="13"
							>
								<path d="M20 6L9 17l-5-5" />
							</svg>
						{:else}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								width="13"
								height="13"
							>
								<rect x="9" y="9" width="13" height="13" rx="2" />
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
							</svg>
						{/if}
					</button>
				{/if}
			</div>
		{/if}

		{#if panelOpen && myUid}
			<!-- Клик по самой панели гасим, иначе обработчик на window закроет её
			     раньше, чем сработает выбор эмодзи. Клавиатура тут не нужна:
			     внутри обычные <button>, они фокусируются и жмутся сами. -->
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="panel" class:own={isOwn} on:click={(e) => e.stopPropagation()}>
				{#each QUICK_EMOJI as emoji}
					<button
						class="panel-btn"
						class:picked={myReaction === emoji}
						on:click={() => pick(emoji)}
					>
						{emoji}
					</button>
				{/each}
			</div>
		{/if}

		{#if reactionCount(msg.reactions) > 0}
			<div class="reactions" class:own={isOwn}>
				{#each countReactions(msg.reactions) as [emoji, n]}
					<button
						class="pill"
						class:mine={myReaction === emoji}
						on:click={() => onReact(msg, emoji)}
					>
						{emoji}<span class="pill-n">{n}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Оформление один в один с виджетом: серо-синий пузырь собеседника,
	   жёлтая подсветка своего, радиус 12px, жёлтый акцент. Циан оставлен
	   только на прочитанных галочках — как было в виджете. */
	.row {
		display: flex;
		align-items: flex-end;
		gap: 0.4rem;
		padding: 0.1rem 0;
	}
	.row.own {
		flex-direction: row-reverse;
	}

	.row-ava {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: #0d1119;
	}
	.row-ava-spacer {
		width: 26px;
		flex-shrink: 0;
	}

	.wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-width: 78%;
		min-width: 0;
	}
	.wrap.own {
		align-items: flex-end;
	}
	/* На широкой странице пузырь не должен растягиваться во всю ленту */
	.row:not(.compact) .wrap {
		max-width: 66%;
	}

	.bubble {
		position: relative;
		padding: 0.5rem 0.65rem 1.4rem;
		border-radius: 12px;
		background: rgba(31, 41, 55, 0.7);
		border: 1px solid rgba(75, 85, 99, 0.4);
		overflow-wrap: anywhere;
	}
	.bubble.own {
		background: rgba(252, 238, 10, 0.08);
		border-color: rgba(252, 238, 10, 0.2);
	}
	.bubble.sticker {
		background: transparent;
		border: none;
		padding: 0;
	}
	/* Раньше под картинкой была пустая полоса высотой со строку времени —
	   выглядело как поломанная вёрстка. Теперь время лежит поверх снимка
	   на затемнении, как принято в мессенджерах. */
	.bubble.media {
		padding: 4px;
	}
	.bubble.media .time {
		bottom: 10px;
		right: 10px;
		padding: 2px 6px;
		border-radius: 8px;
		background: rgba(3, 6, 10, 0.72);
		color: #cbd5e1;
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}
	.bubble.media .ticks {
		color: rgba(255, 255, 255, 0.55);
	}
	.bubble.media .ticks.read {
		color: var(--cyber-cyan, #00f0ff);
	}

	.img-btn {
		display: block;
		padding: 0;
		border: none;
		background: none;
		line-height: 0;
		cursor: zoom-in;
	}
	.bubble.voice {
		padding: 0.3rem 0.45rem 1.35rem;
	}

	.text {
		font-size: 0.85rem;
		line-height: 1.45;
		color: #e2e8f0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	.row:not(.compact) .text {
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.deleted,
	.muted {
		font-size: 0.8rem;
		color: #64748b;
		font-style: italic;
	}

	.time {
		position: absolute;
		bottom: 0.3rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 0.6rem;
		color: #64748b;
		/* Без этого «01:01» у короткого сообщения ломалось на «01:0» и «1» */
		white-space: nowrap;
	}

	/* Резервируем место под время в конце последней строки текста.
	   Иначе у короткого сообщения пузырь уже, чем время, и оно наезжает
	   на текст. Приём стандартный для мессенджеров: невидимая вставка
	   растягивает последнюю строку ровно настолько, сколько нужно. */
	.text::after {
		content: '';
		display: inline-block;
		width: 2.6rem;
	}
	.bubble.own .text::after {
		/* у своих сообщений добавляются галочки прочтения */
		width: 3.5rem;
	}
	.ticks {
		font-size: 0.55rem;
		letter-spacing: -1px;
		color: rgba(255, 255, 255, 0.3);
	}
	.ticks.read {
		color: var(--cyber-cyan, #00f0ff);
	}

	.chat-img {
		display: block;
		max-width: 220px;
		max-height: 200px;
		border-radius: 8px;
		object-fit: cover;
		cursor: pointer;
		transition: opacity 0.2s;
	}
	.chat-img:hover {
		opacity: 0.9;
	}
	.row:not(.compact) .chat-img {
		max-width: 300px;
		max-height: 260px;
	}

	.sticker-img {
		display: block;
		width: 110px;
		height: 110px;
		object-fit: contain;
	}
	.row:not(.compact) .sticker-img {
		width: 128px;
		height: 128px;
	}

	.voice-slot {
		min-width: 185px;
	}
	.row:not(.compact) .voice-slot {
		min-width: 240px;
	}

	.voice-skeleton {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.3rem;
	}
	.vs-play {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
		animation: skel 1.3s ease-in-out infinite;
	}
	.vs-bars {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 2px;
		height: 34px;
	}
	.vs-bars span {
		flex: 1;
		height: 38%;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		animation: skel 1.3s ease-in-out infinite;
	}
	@keyframes skel {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.7;
		}
	}

	/* ── Инструменты при наведении ───────────────────────────────────────── */
	.tools {
		position: absolute;
		bottom: -8px;
		right: -10px;
		display: flex;
		gap: 3px;
		z-index: 10;
	}
	.tools.own {
		right: auto;
		left: -10px;
	}
	.tool-btn {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #94a3b8;
		background: rgba(20, 25, 35, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 50%;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		transition:
			color 0.15s,
			transform 0.15s;
	}
	.tool-btn:hover {
		color: var(--cyber-yellow, #fcee0a);
		transform: scale(1.15);
	}

	.panel {
		position: absolute;
		bottom: 20px;
		right: -10px;
		display: flex;
		gap: 2px;
		padding: 4px 8px;
		background: rgba(10, 12, 18, 0.97);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 24px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
		z-index: 20;
		animation: pop-in 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.panel.own {
		right: auto;
		left: -10px;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	.panel-btn {
		font-size: 1.25rem;
		padding: 2px 4px;
		border-radius: 6px;
		transition: transform 0.12s;
	}
	.panel-btn:hover {
		transform: scale(1.35);
	}
	.panel-btn.picked {
		background: rgba(252, 238, 10, 0.16);
	}

	.reactions {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-top: 2px;
	}
	.reactions.own {
		justify-content: flex-end;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.72rem;
		padding: 2px 7px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.pill:hover {
		background: rgba(255, 255, 255, 0.12);
	}
	.pill.mine {
		background: rgba(252, 238, 10, 0.12);
		border-color: rgba(252, 238, 10, 0.3);
	}
	.pill-n {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
	}

	@media (prefers-reduced-motion: reduce) {
		.vs-play,
		.vs-bars span,
		.panel {
			animation: none !important;
		}
	}
</style>
