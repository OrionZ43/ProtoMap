<!-- src/lib/components/chat/ChannelsFeed.svelte -->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { db } from '$lib/firebase';
	import {
		collection,
		query,
		orderBy,
		limit,
		onSnapshot,
		doc,
		setDoc,
		updateDoc,
		deleteDoc,
		deleteField,
		addDoc,
		serverTimestamp,
		increment,
		arrayUnion,
		arrayRemove,
		type Unsubscribe,
		type Timestamp
	} from 'firebase/firestore';
	import { userStore } from '$lib/stores';
	import VoiceMessage from '$lib/components/chat/VoiceMessage.svelte';

	// ── Константы ──────────────────────────────────────────────────────────
	const MAX_POST_LENGTH = 4000;
	const SUBSCRIBE_COOLDOWN = 2000;

	type Channel = {
		id: string;
		name: string;
		description: string;
		avatarUrl: string | null;
		ownerUid: string;
		subscriberCount: number;
		isSubscribed: boolean;
		lastPostText: string;
		lastMessageTimestamp: Date | null;
	};

	type Post = {
		id: string;
		text: string;
		author_uid: string;
		author_username: string;
		createdAt: Date;
		type: string;
		media_url: string | null;
		is_deleted: boolean;
		reactions: Record<string, string>;
		edited_text: string | null;
		owner_uid: string;
	};

	// ── Состояние ──────────────────────────────────────────────────────────
	let view: 'list' | 'channel' = 'list';
	let channels: Channel[] = [];
	let activeChannel: Channel | null = null;
	let posts: Post[] = [];
	let newPostText = '';
	let isPosting = false;
	let postsContainer: HTMLDivElement;

	let unsubChannels: Unsubscribe | null = null;
	let unsubPosts: Unsubscribe | null = null;

	export function onTabActivated() {
		if (view === 'channel' && postsContainer) {
			tick().then(() => {
				postsContainer.scrollTop = postsContainer.scrollHeight;
			});
		}
	}

	onMount(() => subscribeChannels());

	onDestroy(() => {
		unsubChannels?.();
		unsubPosts?.();
		unsubChannels = null;
		unsubPosts = null;
	});

	// ── Подписка на список каналов ─────────────────────────────────────────
	function subscribeChannels() {
		const uid = $userStore.user?.uid;
		unsubChannels?.();

		const q = query(
			collection(db, 'channels'),
			orderBy('lastMessageTimestamp', 'desc'),
			limit(20)
		);

		unsubChannels = onSnapshot(
			q,
			(snap) => {
				channels = snap.docs.map((d) => {
					const data = d.data();
					return {
						id: d.id,
						name: data.name ?? 'Канал',
						description: data.description ?? '',
						avatarUrl: data.avatarUrl ?? null,
						ownerUid: data.ownerUid ?? '',
						subscriberCount: data.subscriberCount ?? 0,
						// SECURITY: Проверяем членство по серверному массиву subscriberUids,
						// а не по клиентскому полю — нельзя доверять данным из UI
						isSubscribed: uid ? (data.subscriberUids ?? []).includes(uid) : false,
						lastPostText: data.lastPostText ?? '',
						lastMessageTimestamp:
							(data.lastMessageTimestamp as Timestamp)?.toDate() ?? null
					};
				});

				// Если открытый канал обновился — синхронизируем локальное состояние
				if (activeChannel) {
					const updated = channels.find((c) => c.id === activeChannel!.id);
					if (updated) activeChannel = updated;
				}
			},
			(err) => {
				console.error('[ChannelsFeed] channels error:', err);
			}
		);
	}

	// ── Открыть канал ──────────────────────────────────────────────────────
	function openChannel(channel: Channel) {
		unsubPosts?.();
		unsubPosts = null;
		activeChannel = channel;
		view = 'channel';
		posts = [];

		const q = query(
			collection(db, 'channels', channel.id, 'posts'),
			orderBy('createdAt', 'desc'),
			limit(30)
		);

		unsubPosts = onSnapshot(
			q,
			(snap) => {
				posts = snap.docs
					.map((d) => {
						const data = d.data();
						return {
							id: d.id,
							text: data.text ?? '',
							author_uid: data.author_uid ?? '',
							author_username: data.author_username ?? '',
							createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
							type: data.type ?? 'TEXT',
							media_url: data.media_url ?? null,
							is_deleted: data.is_deleted ?? false,
							reactions: data.reactions ?? {},
							edited_text: data.edited_text ?? null,
							owner_uid: data.owner_uid ?? ''
						};
					})
					// desc → reverse = хронологический порядок, удалённые скрываем на уровне шаблона
					.reverse();

				// Скролл вниз после загрузки постов
				tick().then(() => {
					if (postsContainer)
						postsContainer.scrollTop = postsContainer.scrollHeight;
				});
			},
			(err) => {
				console.error('[ChannelsFeed] posts error:', err);
			}
		);
	}

	function backToList() {
		unsubPosts?.();
		unsubPosts = null;
		view = 'list';
		activeChannel = null;
		posts = [];
	}

	// ── Подписка / отписка ─────────────────────────────────────────────────
	let isSubscribing = false;
	let lastSubscribeTime = 0;

	async function toggleSubscribe(channel: Channel) {
		const uid = $userStore.user?.uid;
		// SECURITY: Проверяем авторизацию перед любым изменением
		if (!uid || isSubscribing) return;

		// SECURITY: Владелец канала не может подписаться на свой канал
		if (uid === channel.ownerUid) return;

		const now = Date.now();
		if (now - lastSubscribeTime < SUBSCRIBE_COOLDOWN) return;
		isSubscribing = true;
		lastSubscribeTime = now;

		const wasSubscribed = channel.isSubscribed;

		// Оптимистичный UI — обновляем оба стейта одновременно
		const applyOptimistic = (sub: boolean) => {
			const delta = sub ? 1 : -1;
			channels = channels.map((c) =>
				c.id === channel.id
					? { ...c, isSubscribed: sub, subscriberCount: c.subscriberCount + delta }
					: c
			);
			if (activeChannel?.id === channel.id) {
				activeChannel = {
					...activeChannel,
					isSubscribed: sub,
					subscriberCount: activeChannel.subscriberCount + delta
				};
			}
		};

		applyOptimistic(!wasSubscribed);

		const ref = doc(db, 'channels', channel.id);
		try {
			if (wasSubscribed) {
				await updateDoc(ref, {
					subscriberUids: arrayRemove(uid),
					subscriberCount: increment(-1)
				});
				await deleteDoc(doc(db, 'channels', channel.id, 'subscribers', uid));
			} else {
				await updateDoc(ref, {
					subscriberUids: arrayUnion(uid),
					subscriberCount: increment(1)
				});
				// SECURITY: Записываем только uid и публичные данные — не токены, не email
				await setDoc(doc(db, 'channels', channel.id, 'subscribers', uid), {
					uid,
					username: $userStore.user?.username ?? '',
					avatarUrl: $userStore.user?.avatar_url ?? null,
					joinedAt: serverTimestamp()
				});
			}
		} catch (e) {
			console.error('[ChannelsFeed] toggle subscribe:', e);
			// Откат оптимистичного обновления при ошибке
			applyOptimistic(wasSubscribed);
		} finally {
			setTimeout(() => {
				isSubscribing = false;
			}, 1000);
		}
	}

	// ── Публикация поста ──────────────────────────────────────────────────
	async function publishPost() {
		const uid = $userStore.user?.uid;
		if (isPosting || !newPostText.trim() || !activeChannel || !uid) return;

		// SECURITY: Только владелец может публиковать посты.
		// Дублируется в Firestore Rules — здесь для UX.
		if (uid !== activeChannel.ownerUid) return;

		// SECURITY: Ограничение длины на клиенте (сервер должен тоже проверять)
		const text = newPostText.trim().slice(0, MAX_POST_LENGTH);
		if (!text) return;

		isPosting = true;
		newPostText = '';

		try {
			const postRef = await addDoc(
				collection(db, 'channels', activeChannel.id, 'posts'),
				{
					author_uid: uid,
					author_username: $userStore.user!.username,
					owner_uid: uid,
					text,
					type: 'TEXT',
					media_url: null,
					createdAt: serverTimestamp(),
					is_deleted: false,
					reactions: {},
					edited_text: null,
					edited_at: null
				}
			);

			await updateDoc(doc(db, 'channels', activeChannel.id), {
				lastPostText: text.slice(0, 200), // Превью — только первые 200 символов
				lastMessageTimestamp: serverTimestamp()
			});

			// Скролл вниз после публикации
			tick().then(() => {
				if (postsContainer)
					postsContainer.scrollTop = postsContainer.scrollHeight;
			});
		} catch (e) {
			console.error('[ChannelsFeed] publish post:', e);
			newPostText = newPostText || text; // Возвращаем текст при ошибке
		} finally {
			isPosting = false;
		}
	}

	// ── Реакции ───────────────────────────────────────────────────────────
	async function toggleReaction(post: Post, emoji: string) {
		const uid = $userStore.user?.uid;
		// SECURITY: Только авторизованные пользователи могут ставить реакции
		if (!uid || !activeChannel) return;

		const ref = doc(db, 'channels', activeChannel.id, 'posts', post.id);
		try {
			if (post.reactions[uid] === emoji) {
				// Убираем реакцию через deleteField — атомарно, без перезаписи всего объекта
				await updateDoc(ref, { [`reactions.${uid}`]: deleteField() });
			} else {
				await updateDoc(ref, { [`reactions.${uid}`]: emoji });
			}
		} catch (e) {
			console.error('[ChannelsFeed] reaction:', e);
		}
	}

	const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👍', '🤖'];
	let openReactPanel: string | null = null;

	function countReactions(reactions: Record<string, string>) {
		const counts: Record<string, number> = {};
		Object.values(reactions).forEach((e) => {
			counts[e] = (counts[e] ?? 0) + 1;
		});
		return Object.entries(counts).sort((a, b) => b[1] - a[1]);
	}

	function formatTime(date: Date) {
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		if (diff < 60_000) return 'только что';
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин`;
		if (diff < 86_400_000)
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
	}

	function handlePostKeydown(e: KeyboardEvent) {
		// Ctrl/Cmd + Enter — публикуем (обычный Enter = перенос строки)
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			publishPost();
		}
	}

	$: postLength = newPostText.length;
	$: isOverLimit = postLength > MAX_POST_LENGTH;
</script>

<!-- ══ СПИСОК КАНАЛОВ ══════════════════════════════════════════════════════ -->
{#if view === 'list'}
	<div class="channel-list">
		{#if channels.length === 0}
			<div class="empty-state">
				<div class="empty-icon">📡</div>
				<p class="empty-title">Каналов пока нет</p>
				<p class="empty-hint">Каналы появятся здесь когда их создадут пользователи</p>
			</div>
		{:else}
			{#each channels as ch (ch.id)}
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<button class="ch-row" on:click={() => openChannel(ch)}>
					<div class="ch-avatar-wrap">
						{#if ch.avatarUrl}
							<img src={ch.avatarUrl} alt={ch.name} class="ch-avatar" />
						{:else}
							<div class="ch-avatar-placeholder">{ch.name[0]?.toUpperCase()}</div>
						{/if}
					</div>
					<div class="ch-info">
						<div class="ch-header-row">
							<span class="ch-name">{ch.name}</span>
							<span class="ch-sub-count">{ch.subscriberCount} 👥</span>
						</div>
						<span class="ch-preview">{ch.lastPostText || ch.description || '...'}</span>
					</div>
				</button>
			{/each}
		{/if}
	</div>

<!-- ══ ЛЕНТА КАНАЛА ════════════════════════════════════════════════════════ -->
{:else if view === 'channel' && activeChannel}
	<div class="ch-feed-header">
		<button class="back-btn" on:click={backToList}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
				<path d="M15 18l-6-6 6-6"/>
			</svg>
		</button>
		<div class="ch-avatar-wrap small">
			{#if activeChannel.avatarUrl}
				<img src={activeChannel.avatarUrl} alt={activeChannel.name} class="ch-avatar" />
			{:else}
				<div class="ch-avatar-placeholder small">{activeChannel.name[0]?.toUpperCase()}</div>
			{/if}
		</div>
		<div class="ch-feed-title">
			<span class="ch-name">{activeChannel.name}</span>
			<span class="ch-sub-count-sm">{activeChannel.subscriberCount} подписчиков</span>
		</div>

		<!-- SECURITY: Кнопка подписки скрыта для владельца — он не может подписаться на свой канал -->
		{#if $userStore.user && activeChannel.ownerUid !== $userStore.user.uid}
			<button
				class="sub-btn"
				class:subbed={activeChannel.isSubscribed}
				disabled={isSubscribing}
				on:click|stopPropagation={() => toggleSubscribe(activeChannel!)}
				title={activeChannel.isSubscribed ? 'Отписаться' : 'Подписаться'}
			>
				{activeChannel.isSubscribed ? '✓' : '+'}
			</button>
		{/if}
	</div>

	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="posts-feed"
		bind:this={postsContainer}
		on:click={() => (openReactPanel = null)}
	>
		{#if posts.filter((p) => !p.is_deleted).length === 0}
			<div class="empty-state">
				<p class="empty-hint">Постов пока нет</p>
			</div>
		{:else}
			{#each posts as post (post.id)}
				{#if !post.is_deleted}
					<div class="post-card">
						<div class="post-meta">
							<span class="post-author">{post.author_username}</span>
							<span class="post-time">{formatTime(post.createdAt)}</span>
						</div>

						{#if (post.type === 'IMAGE' || post.type === 'image') && post.media_url}
							<a href={post.media_url} target="_blank" rel="noopener noreferrer">
								<img src={post.media_url} alt="image" class="post-img" loading="lazy" />
							</a>
						{:else if (post.type === 'VOICE' || post.type === 'voice') && post.media_url}
							<VoiceMessage src={post.media_url} isOwn={false} />
						{:else}
							<p class="post-text">{post.edited_text ?? post.text}</p>
						{/if}

						{#if post.text && (post.type === 'IMAGE' || post.type === 'image')}
							<p class="post-caption">{post.text}</p>
						{/if}

						{#if post.edited_text && post.type === 'TEXT'}
							<span class="edited-mark">изменено</span>
						{/if}

						<div class="reactions-row">
							{#each countReactions(post.reactions) as [emoji, count]}
								<button
									class="reaction-pill"
									class:own={post.reactions[$userStore.user?.uid ?? ''] === emoji}
									on:click|stopPropagation={() => toggleReaction(post, emoji)}
								>
									{emoji} {count}
								</button>
							{/each}

							{#if $userStore.user}
								<div class="add-react-wrap">
									<button
										class="add-react-btn"
										on:click|stopPropagation={() => {
											openReactPanel = openReactPanel === post.id ? null : post.id;
										}}
										title="Добавить реакцию"
									>
										😊
									</button>
									{#if openReactPanel === post.id}
										<div class="react-panel-ch">
											{#each QUICK_REACTIONS as emoji}
												<button
													class="qr-btn-ch"
													on:click|stopPropagation={() => {
														toggleReaction(post, emoji);
														openReactPanel = null;
													}}>{emoji}</button
												>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
		{/if}
	</div>

	<!-- Поле публикации — только для владельца канала -->
	{#if $userStore.user?.uid === activeChannel.ownerUid}
		<div class="post-input-area">
			<div class="post-input-wrap">
				<textarea
					bind:value={newPostText}
					on:keydown={handlePostKeydown}
					placeholder="Новый пост... (Ctrl+Enter для отправки)"
					disabled={isPosting}
					class="input-field"
					class:over-limit={isOverLimit}
					rows="2"
					maxlength={MAX_POST_LENGTH + 100}
				></textarea>
				{#if postLength > MAX_POST_LENGTH * 0.8}
					<span class="char-counter" class:over={isOverLimit}>
						{postLength}/{MAX_POST_LENGTH}
					</span>
				{/if}
			</div>
			<button
				on:click={publishPost}
				disabled={isPosting || !newPostText.trim() || isOverLimit}
				class="send-btn"
				title="Опубликовать"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
					<path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/>
				</svg>
			</button>
		</div>
	{/if}
{/if}

<style>
	.channel-list {
		flex: 1;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #334155 transparent;
	}

	.ch-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.85rem;
		border-bottom: 1px solid rgba(255,255,255,0.04);
		transition: background 0.15s;
		text-align: left;
	}

	.ch-row:hover { background: rgba(255,255,255,0.04); }

	.ch-avatar-wrap { flex-shrink: 0; }

	.ch-avatar { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; }
	.ch-avatar-wrap.small .ch-avatar { width: 32px; height: 32px; }

	.ch-avatar-placeholder {
		width: 42px;
		height: 42px;
		border-radius: 10px;
		background: rgba(252,238,10,0.1);
		border: 1px solid rgba(252,238,10,0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Chakra Petch', monospace;
		font-weight: 900;
		color: var(--cyber-yellow);
		font-size: 1.1rem;
	}

	.ch-avatar-placeholder.small { width: 32px; height: 32px; font-size: 0.85rem; }

	.ch-info { flex: 1; min-width: 0; }

	.ch-header-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.2rem;
	}

	.ch-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: #e2e8f0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ch-sub-count { font-size: 0.62rem; color: #475569; flex-shrink: 0; }

	.ch-preview {
		font-size: 0.75rem;
		color: #64748b;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ch-feed-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid rgba(255,255,255,0.06);
		flex-shrink: 0;
		background: rgba(9,11,17,0.9);
	}

	.back-btn {
		color: #94a3b8;
		padding: 0.25rem;
		border-radius: 4px;
		transition: color 0.2s;
	}

	.back-btn:hover { color: var(--cyber-yellow); }

	.ch-feed-title {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.ch-sub-count-sm { font-size: 0.62rem; color: #475569; }

	.sub-btn {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid rgba(252,238,10,0.4);
		color: var(--cyber-yellow);
		font-size: 1rem;
		font-weight: 900;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.sub-btn:hover { background: rgba(252,238,10,0.1); }
	.sub-btn.subbed { background: rgba(252,238,10,0.15); border-color: var(--cyber-yellow); }
	.sub-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.posts-feed {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		scrollbar-width: thin;
		scrollbar-color: #334155 transparent;
	}

	.post-card {
		background: rgba(15,20,30,0.5);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 8px;
		padding: 0.75rem;
		transition: border-color 0.15s;
	}

	.post-card:hover { border-color: rgba(255,255,255,0.1); }

	.post-meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.4rem;
	}

	.post-author { font-size: 0.78rem; font-weight: 700; color: var(--cyber-yellow); }
	.post-time { font-size: 0.62rem; color: #475569; }

	.post-text {
		font-size: 0.85rem;
		color: #e2e8f0;
		white-space: pre-wrap;
		word-break: break-words;
		line-height: 1.5;
	}

	.edited-mark { font-size: 0.6rem; color: #475569; font-style: italic; }

	.reactions-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.5rem;
		align-items: center;
	}

	.reaction-pill {
		background: rgba(255,255,255,0.05);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 12px;
		padding: 0.15rem 0.5rem;
		font-size: 0.75rem;
		color: #94a3b8;
		transition: all 0.15s;
		cursor: pointer;
	}

	.reaction-pill:hover { background: rgba(255,255,255,0.1); }

	.reaction-pill.own {
		background: rgba(252,238,10,0.12);
		border-color: rgba(252,238,10,0.3);
		color: var(--cyber-yellow);
	}

	.add-react-wrap { position: relative; margin-left: auto; }

	.add-react-btn {
		font-size: 0.85rem;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: rgba(255,255,255,0.05);
		border: 1px solid rgba(255,255,255,0.1);
		transition: all 0.15s;
		opacity: 0.5;
	}

	.add-react-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }

	.react-panel-ch {
		position: absolute;
		bottom: 28px;
		right: 0;
		display: flex;
		gap: 2px;
		background: rgba(10,12,18,0.97);
		border: 1px solid rgba(255,255,255,0.12);
		border-radius: 24px;
		padding: 4px 8px;
		z-index: 20;
		box-shadow: 0 4px 16px rgba(0,0,0,0.6);
		animation: pop-in 0.12s cubic-bezier(0.34,1.56,0.64,1);
		white-space: nowrap;
	}

	.qr-btn-ch {
		font-size: 1.2rem;
		padding: 2px 4px;
		border-radius: 6px;
		transition: transform 0.12s;
	}

	.qr-btn-ch:hover { transform: scale(1.35); }

	@keyframes pop-in { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }

	.post-input-area {
		padding: 0.5rem;
		border-top: 1px solid rgba(55,65,81,0.5);
		background: rgba(9,11,17,0.95);
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		flex-shrink: 0;
	}

	.post-input-wrap {
		flex: 1;
		position: relative;
	}

	.input-field {
		width: 100%;
		padding: 0.5rem;
		background: rgba(31,41,55,0.7);
		color: #e2e8f0;
		resize: none;
		outline: none;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		transition: border-color 0.2s;
		box-sizing: border-box;
	}

	.input-field:focus { border-color: var(--cyber-yellow); }
	.input-field.over-limit { border-color: #ff003c; }

	.char-counter {
		position: absolute;
		bottom: 6px;
		right: 8px;
		font-size: 0.58rem;
		color: #475569;
		pointer-events: none;
	}

	.char-counter.over { color: #ff003c; font-weight: 700; }

	.send-btn {
		padding: 0.5rem;
		background: var(--cyber-yellow);
		color: black;
		border-radius: 0.375rem;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		transition: box-shadow 0.2s;
	}

	.send-btn:hover { box-shadow: 0 0 12px rgba(252,238,10,0.4); }

	.send-btn:disabled {
		background: #374151;
		color: #6b7280;
		cursor: not-allowed;
		box-shadow: none;
	}

	.post-img {
		max-width: 100%;
		max-height: 280px;
		border-radius: 8px;
		object-fit: cover;
		display: block;
		cursor: pointer;
		transition: opacity 0.2s;
		margin-bottom: 0.25rem;
	}

	.post-img:hover { opacity: 0.9; }
	.post-caption { font-size: 0.82rem; color: #94a3b8; margin-top: 0.35rem; }

	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		text-align: center;
	}

	.empty-icon { font-size: 2rem; opacity: 0.4; }
	.empty-title { font-size: 0.85rem; color: #94a3b8; font-weight: 600; }
	.empty-hint { font-size: 0.75rem; color: #475569; line-height: 1.5; }
</style>