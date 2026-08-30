<!-- src/lib/components/chat/ChatList.svelte -->
<!--
	Общий список диалогов: одна разметка и один стиль для виджета (DMInbox)
	и для страницы /messages. Оформление — как в виджете: строки с
	разделителями, жёлтый акцент, аватар 42px.

	Про размер аватарки: его задаёт ОБЁРТКА, а не картинка. На .avatar-wrap
	вешается сырой frameId, а cosmetics.css — глобальный файл — содержит
	`.frame_high_roller img { width:100% !important; height:100% !important }`
	и такие же правила для frame_ludoman / frame_anniversary / frame_alpha.
	Они перебивают скоупленный размер картинки, поэтому обёртка обязана иметь
	собственные width/height — иначе 100% резолвить не во что и аватарка
	раздувается на всю строку.
-->
<script lang="ts">
	import { avatarFor, fmtRelative } from '$lib/utils/chatFormat';
	import type { DMChat } from '$lib/stores/dmStore';

	export let chats: DMChat[] = [];
	/** id открытого диалога — для подсветки. В виджете не используется. */
	export let activeChatId: string | null = null;
	/** uid → 'online' | 'offline'. Пусто — точки присутствия не рисуются. */
	export let presence: Record<string, string> = {};
	export let favoritesActive: boolean = false;
	/** Показывать строку «Избранное» первой. */
	export let showFavorites: boolean = true;
	/** Текст пустого состояния показываем, только если это не результат поиска. */
	export let emptyTitle: string = 'Личных чатов пока нет';
	export let emptyHint: string = 'Открой профиль пользователя и напиши ему';

	export let onOpen: (chat: DMChat) => void = () => {};
	export let onFavorites: () => void = () => {};
</script>

<div class="list">
	{#if showFavorites}
		<button class="row favorites" class:active={favoritesActive} on:click={onFavorites}>
			<div class="fav-icon">
				<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
					<path
						d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"
					/>
				</svg>
			</div>
			<div class="info">
				<div class="top">
					<span class="name fav-name">Избранное</span>
				</div>
				<span class="preview">Заметки, ссылки, файлы для себя</span>
			</div>
		</button>
	{/if}

	{#each chats as c (c.id)}
		<button class="row" class:active={activeChatId === c.id} on:click={() => onOpen(c)}>
			<div class="avatar-wrap {c.partner.frameId || ''}">
				<img src={avatarFor(c.partner.username, c.partner.avatarUrl)} alt="" class="avatar" />
				{#if presence[c.partner.uid] === 'online'}
					<span class="online-dot" title="В сети"></span>
				{/if}
				{#if c.unread > 0}
					<span class="unread">{c.unread > 99 ? '99+' : c.unread}</span>
				{/if}
			</div>
			<div class="info">
				<div class="top">
					<span class="name" class:has-unread={c.unread > 0}>{c.partner.username}</span>
					<span class="time">{fmtRelative(c.lastMessageTimestamp)}</span>
				</div>
				<span class="preview" class:has-unread={c.unread > 0}>{c.lastMessage || '...'}</span>
			</div>
		</button>
	{/each}

	{#if chats.length === 0}
		<div class="empty">
			<div class="empty-icon">💬</div>
			<p class="empty-title">{emptyTitle}</p>
			<p class="empty-hint">{emptyHint}</p>
		</div>
	{/if}
</div>

<style>
	.list {
		flex: 1;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #334155 transparent;
	}
	.list::-webkit-scrollbar {
		width: 6px;
	}
	.list::-webkit-scrollbar-thumb {
		background: #334155;
		border-radius: 3px;
	}

	.row {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.85rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		text-align: left;
		transition: background 0.15s;
	}
	.row:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	.row.active {
		background: rgba(252, 238, 10, 0.06);
	}
	.row.active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--cyber-yellow, #fcee0a);
		box-shadow: 0 0 8px var(--cyber-yellow, #fcee0a);
	}
	.favorites {
		border-bottom-color: rgba(252, 238, 10, 0.08);
	}
	.favorites:hover {
		background: rgba(252, 238, 10, 0.04);
	}

	/* Размеры держит обёртка — см. комментарий в шапке файла */
	.avatar-wrap {
		position: relative;
		flex-shrink: 0;
		width: 42px;
		height: 42px;
	}
	.avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		display: block;
		background: #0d1119;
	}
	.fav-icon {
		width: 42px;
		height: 42px;
		flex-shrink: 0;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(252, 238, 10, 0.1);
		border: 1px solid rgba(252, 238, 10, 0.25);
		color: var(--cyber-yellow, #fcee0a);
	}

	.online-dot {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #39ff14;
		border: 2px solid #0a0d13;
		box-shadow: 0 0 6px rgba(57, 255, 20, 0.7);
	}

	.unread {
		position: absolute;
		top: -3px;
		right: -3px;
		min-width: 16px;
		height: 16px;
		padding: 0 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: var(--cyber-red, #ff003c);
		color: #fff;
		font-size: 0.55rem;
		font-weight: 900;
	}

	.info {
		flex: 1;
		min-width: 0;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.2rem;
		gap: 0.5rem;
	}
	.name {
		font-size: 0.85rem;
		font-weight: 600;
		color: #e2e8f0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name.has-unread {
		color: #fff;
		font-weight: 700;
	}
	.fav-name {
		color: var(--cyber-yellow, #fcee0a);
	}
	.time {
		flex-shrink: 0;
		font-size: 0.62rem;
		color: #475569;
	}
	.preview {
		display: block;
		font-size: 0.75rem;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.preview.has-unread {
		color: #94a3b8;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2.5rem 2rem;
		text-align: center;
	}
	.empty-icon {
		font-size: 2rem;
		opacity: 0.4;
	}
	.empty-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: #94a3b8;
	}
	.empty-hint {
		font-size: 0.75rem;
		color: #475569;
		line-height: 1.5;
	}
</style>
