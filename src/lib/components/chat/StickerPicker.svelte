<!-- src/lib/components/chat/StickerPicker.svelte -->
<!-- Общий стикер-пикер: раньше существовал двумя копиями — в DMInbox и на
     странице /messages. Паки берём из глобального stickerStore. -->
<script lang="ts">
	import { getStickerUrl, type StickerPack } from '$lib/stores/stickerStore';

	export let packs: StickerPack[] = [];
	export let compact: boolean = false;
	export let onPick: (packId: string, filename: string) => void = () => {};

	let activePack: StickerPack | null = null;
	$: if (packs.length > 0 && (!activePack || !packs.some((p) => p.id === activePack?.id))) {
		activePack = packs[0];
	}
</script>

<div class="picker" class:compact>
	<div class="pack-tabs">
		{#each packs as pack (pack.id)}
			<button
				class="ptab"
				class:active={activePack?.id === pack.id}
				on:click={() => (activePack = pack)}
				title={pack.name}
			>
				<img src={pack.iconUrl} alt={pack.name} class="ptab-img" loading="lazy" />
			</button>
		{/each}
	</div>

	<div class="grid">
		{#if activePack}
			{@const pack = activePack}
			{#each pack.stickers as filename (filename)}
				<button class="sbtn" on:click={() => onPick(pack.id, filename)}>
					<img src={getStickerUrl(packs, pack.id, filename)} alt="" class="simg" loading="lazy" />
				</button>
			{/each}
		{:else}
			<p class="empty">Стикеры не загрузились</p>
		{/if}
	</div>
</div>

<style>
	.picker {
		flex-shrink: 0;
		height: 250px;
		display: flex;
		flex-direction: column;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(5, 8, 12, 0.98);
	}
	.picker.compact {
		height: 240px;
	}

	.pack-tabs {
		display: flex;
		gap: 4px;
		padding: 6px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.pack-tabs::-webkit-scrollbar {
		display: none;
	}
	.ptab {
		flex-shrink: 0;
		width: 38px;
		height: 38px;
		padding: 3px;
		border: 2px solid transparent;
		border-radius: 9px;
		overflow: hidden;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.ptab:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.ptab.active {
		border-color: var(--cyber-yellow, #fcee0a);
		box-shadow: 0 0 10px rgba(252, 238, 10, 0.25);
	}
	.ptab-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.grid {
		flex: 1;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
		grid-auto-rows: 72px;
		gap: 6px;
		padding: 8px;
		align-content: start;
		scrollbar-width: thin;
		scrollbar-color: #1e293b transparent;
	}
	.grid::-webkit-scrollbar {
		width: 6px;
	}
	.grid::-webkit-scrollbar-thumb {
		background: #1e293b;
		border-radius: 3px;
	}

	.sbtn {
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 9px;
		transition:
			background 0.15s,
			transform 0.12s;
	}
	.sbtn:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: scale(1.05);
	}
	.simg {
		width: 62px;
		height: 62px;
		object-fit: contain;
	}

	.empty {
		grid-column: 1 / -1;
		padding: 2rem 1rem;
		text-align: center;
		font-size: 0.8rem;
		color: #475569;
	}
</style>
