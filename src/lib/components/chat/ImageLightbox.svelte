<!-- src/lib/components/chat/ImageLightbox.svelte -->
<!--
	Просмотр картинки поверх страницы. До этого изображение из чата открывалось
	только в новой вкладке — уводило из переписки и выглядело как переход
	«наружу».

	Закрывается по Escape, по клику на фон и по кнопке. Ссылка «Открыть
	оригинал» оставлена: иногда нужен именно исходник в полном размере.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';

	export let src: string;
	export let open: boolean = false;
	export let onClose: () => void = () => {};

	let prevOverflow = '';

	// Пока просмотрщик открыт, страница под ним скроллиться не должна.
	// Значение восстанавливаем, а не сбрасываем в '' — под нами может быть
	// страница личек, которая сама гасит overflow.
	$: if (typeof document !== 'undefined') {
		if (open) {
			if (!prevOverflow) prevOverflow = document.body.style.overflow || 'visible';
			document.body.style.overflow = 'hidden';
		} else if (prevOverflow) {
			document.body.style.overflow = prevOverflow === 'visible' ? '' : prevOverflow;
			prevOverflow = '';
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	onDestroy(() => {
		if (typeof document !== 'undefined' && prevOverflow) {
			document.body.style.overflow = prevOverflow === 'visible' ? '' : prevOverflow;
		}
	});
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" on:click={onClose} transition:fade={{ duration: 140 }}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="frame" on:click={(e) => e.stopPropagation()}>
			<img {src} alt="Изображение из переписки" class="pic" />

			<div class="bar">
				<a class="orig" href={src} target="_blank" rel="noopener noreferrer">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						width="14"
						height="14"
					>
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
					Открыть оригинал
				</a>
			</div>
		</div>

		<button class="close" on:click={onClose} aria-label="Закрыть просмотр">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				width="22"
				height="22"
			>
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		background: rgba(3, 5, 8, 0.92);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}

	.frame {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-width: 100%;
		max-height: 100%;
	}

	.pic {
		display: block;
		max-width: 100%;
		max-height: calc(100vh - 9rem);
		object-fit: contain;
		border: 1px solid #30363d;
		border-radius: 8px;
		background: #05080c;
	}

	.bar {
		display: flex;
		justify-content: center;
	}
	.orig {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		background: rgba(31, 41, 55, 0.7);
		color: #94a3b8;
		font-size: 0.75rem;
		text-decoration: none;
		transition:
			color 0.2s,
			border-color 0.2s;
	}
	.orig:hover {
		color: var(--cyber-yellow, #fcee0a);
		border-color: rgba(252, 238, 10, 0.35);
	}

	.close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		color: #94a3b8;
		background: rgba(31, 41, 55, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.12);
		transition:
			color 0.2s,
			transform 0.2s;
	}
	.close:hover {
		color: #fff;
		transform: rotate(90deg);
	}
</style>
