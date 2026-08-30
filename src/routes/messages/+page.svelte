<!-- src/routes/messages/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { userStore, chat } from '$lib/stores';
	import {
		chats,
		activeChat,
		messages,
		partnerTyping,
		totalUnread,
		openChat,
		closeChat,
		setTyping,
		type DMChat,
		type DMMessage
	} from '$lib/stores/dmStore';
	import {
		collection,
		doc,
		setDoc,
		updateDoc,
		serverTimestamp,
		increment
	} from 'firebase/firestore';
	import {
		getStorage,
		ref as storageRef,
		uploadBytesResumable,
		getDownloadURL
	} from 'firebase/storage';
	import { db } from '$lib/firebase';
	import { watchUserPresence } from '$lib/client/presence';
	import ChannelsFeed from '$lib/components/chat/ChannelsFeed.svelte';
	import ChatList from '$lib/components/chat/ChatList.svelte';
	import MessageBubble from '$lib/components/chat/MessageBubble.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import { stickerStore } from '$lib/stores/stickerStore';
	import { scrollToBottom } from '$lib/utils/scroll';
	import { avatarFor, dayLabel, needsDaySeparator, previewFor } from '$lib/utils/chatFormat';

	// ── UI-состояние ────────────────────────────────────────────────────────
	let isSending = false;
	let uploadProgress = 0;
	let messagesWindow: HTMLDivElement;
	let searchQuery = '';

	type Tab = 'dm' | 'channels';
	let activeTab: Tab = 'dm';

	$: packs = $stickerStore.packs;
	$: isFav = Boolean($activeChat) && $activeChat?.partner.uid === $userStore.user?.uid;
	$: partnerOnline = Boolean($activeChat) && presence[$activeChat?.partner.uid ?? ''] === 'online';

	$: query = searchQuery.trim().toLowerCase();
	$: filteredChats = query
		? $chats.filter((c) => c.partner.username.toLowerCase().includes(query))
		: $chats;

	// Подписку на список диалогов держит корневой layout — она нужна на всех
	// страницах, чтобы счётчик непрочитанных в навбаре работал без открытия
	// виджета. Здесь только читаем $chats.

	// ── Присутствие собеседников ────────────────────────────────────────────
	// Подписки держим здесь, а не в ChatList: список перерисовывается на каждое
	// новое сообщение, и подписка внутри строки пересоздавалась бы вместе с ней.
	// Наружу отдаём готовую карту uid → состояние.
	let presence: Record<string, string> = {};
	let presenceSubs: Record<string, () => void> = {};

	$: syncPresence(
		Array.from(
			new Set([
				...$chats.map((c) => c.partner.uid),
				...($activeChat ? [$activeChat.partner.uid] : [])
			])
		).filter((uid) => uid && uid !== $userStore.user?.uid)
	);

	function syncPresence(uids: string[]) {
		for (const uid of uids) {
			if (presenceSubs[uid]) continue;
			presenceSubs[uid] = watchUserPresence(uid, (p) => {
				presence = { ...presence, [uid]: p.state };
			});
		}
		for (const uid of Object.keys(presenceSubs)) {
			if (uids.includes(uid)) continue;
			presenceSubs[uid]();
			delete presenceSubs[uid];
		}
	}

	function dropPresence() {
		Object.values(presenceSubs).forEach((un) => un());
		presenceSubs = {};
		presence = {};
	}

	// ── Монтирование ────────────────────────────────────────────────────────
	onMount(() => {
		const t = $page.url.searchParams.get('tab') as Tab;
		if (t === 'channels') activeTab = 'channels';

		stickerStore.load();

		// body.overflow гасим из JS, а не глобальным правилом в блоке стилей.
		// CSS роута в SvelteKit после навигации не выгружается, поэтому
		// :global(body) продолжал действовать на других страницах.
		// (И тег стилей упоминать в комментарии нельзя — препроцессор Vite
		//  ищет его текстом и принимает за начало настоящего блока.)
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		// pendingDM — переход с кнопки «Написать» в профиле
		const unsubPending = chat.subscribe((state) => {
			if (state.pendingDM && $userStore.user) {
				const partner = state.pendingDM;
				chat.clearPendingDM();
				activeTab = 'dm';
				const myUid = $userStore.user.uid;
				openChat(
					{
						id: [myUid, partner.uid].sort().join('_'),
						partner,
						lastMessage: '',
						lastMessageTimestamp: null,
						unread: 0
					},
					myUid
				);
			}
		});

		return () => {
			unsubPending();
			document.body.style.overflow = prevOverflow;
		};
	});

	onDestroy(() => {
		dropPresence();
		// Закрываем только открытую переписку. destroyDM здесь звать нельзя:
		// он снимает и подписку на список диалогов, которой владеет layout,
		// и счётчик непрочитанных перестал бы обновляться после ухода
		// со страницы.
		const uid = $userStore.user?.uid;
		if (uid && $activeChat) closeChat(uid, $activeChat.id);
	});

	// ── Автоскролл ──────────────────────────────────────────────────────────
	let atBottom = true;
	let forceScroll = false;
	let lastChatId: string | null = null;

	$: if ($activeChat && $activeChat.id !== lastChatId) {
		lastChatId = $activeChat.id;
		forceScroll = true;
		atBottom = true;
	}
	$: if (!$activeChat) lastChatId = null;

	function onListScroll() {
		if (!messagesWindow) return;
		const gap =
			messagesWindow.scrollHeight - messagesWindow.scrollTop - messagesWindow.clientHeight;
		atBottom = gap < 140;
	}

	// ⚠️ Скроллим ТОЛЬКО через scrollToBottom(). Прямая запись
	// `messagesWindow.scrollTop = ...` здесь вешала весь сайт: см. подробности
	// в $lib/utils/scroll.ts — коротко, `bind:this` это `mutable_source`, запись
	// в его свойство компилируется в `$.mutate(messagesWindow)`, а эта переменная
	// стоит в зависимостях блока → бесконечный цикл без единой ошибки в консоли.
	$: if ($messages.length >= 0 && messagesWindow && $activeChat) {
		tick().then(() => {
			if (forceScroll || atBottom) {
				scrollToBottom(messagesWindow);
				forceScroll = false;
			}
		});
	}

	// ── Открытие / закрытие ─────────────────────────────────────────────────
	function handleOpenChat(dmChat: DMChat) {
		if (!$userStore.user) return;
		activeTab = 'dm';
		openChat(dmChat, $userStore.user.uid);
	}

	function handleCloseChat() {
		if (!$userStore.user || !$activeChat) return;
		closeChat($userStore.user.uid, $activeChat.id);
	}

	function openFavorites() {
		if (!$userStore.user) return;
		const me = $userStore.user;
		activeTab = 'dm';
		openChat(
			{
				id: `${me.uid}_${me.uid}`,
				partner: { uid: me.uid, username: 'Избранное', avatarUrl: null, frameId: null },
				lastMessage: '',
				lastMessageTimestamp: null,
				unread: 0
			},
			me.uid
		);
	}

	function switchToDM() {
		activeTab = 'dm';
		goto('/messages', { replaceState: true });
	}

	function switchToChannels() {
		activeTab = 'channels';
		if ($activeChat && $userStore.user) closeChat($userStore.user.uid, $activeChat.id);
		goto('/messages?tab=channels', { replaceState: true });
	}

	function back() {
		if (activeTab === 'channels') {
			switchToDM();
			return;
		}
		handleCloseChat();
	}

	// ── Отправка ────────────────────────────────────────────────────────────
	async function sendText(text: string) {
		if (isSending || !text) return;
		isSending = true;
		try {
			await write({ type: 'TEXT', text });
		} catch (err) {
			console.error('[Messages] отправка не удалась:', err);
		} finally {
			isSending = false;
		}
	}

	async function sendImage(file: File) {
		if (!$activeChat || !$userStore.user) return;
		isSending = true;
		uploadProgress = 0;
		try {
			const storage = getStorage();
			const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
			const msgRef = doc(collection(db, 'chats', $activeChat.id, 'messages'));
			const task = uploadBytesResumable(
				storageRef(storage, `chat_media/${$activeChat.id}/image/${msgRef.id}.${ext}`),
				file,
				// см. комментарий про cacheControl ниже, в отправке голосового
				{ contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }
			);
			await new Promise<void>((res, rej) => {
				task.on(
					'state_changed',
					(s) => (uploadProgress = Math.round((s.bytesTransferred / s.totalBytes) * 100)),
					rej,
					async () => {
						const url = await getDownloadURL(task.snapshot.ref);
						await write({ type: 'IMAGE', text: '', media_url: url }, msgRef);
						res();
					}
				);
			});
		} catch (err) {
			console.error('[Messages] загрузка изображения:', err);
		} finally {
			isSending = false;
			uploadProgress = 0;
		}
	}

	async function sendVoice(blob: Blob) {
		if (!$activeChat || !$userStore.user) return;
		isSending = true;
		try {
			const storage = getStorage();
			const msgRef = doc(collection(db, 'chats', $activeChat.id, 'messages'));
			const task = uploadBytesResumable(
				storageRef(storage, `chat_media/${$activeChat.id}/voice/${msgRef.id}.webm`),
				blob,
				// cacheControl обязателен: Firebase Storage по умолчанию НЕ ставит
				// заголовок, и файл отдаётся как private, max-age=0 — браузер
				// перепроверяет его при каждом показе (304 на каждый запрос).
				// Медиа чата неизменяемо: в пути лежит уникальный id сообщения,
				// один URL всегда отдаёт один и тот же файл.
				{ contentType: 'audio/webm', cacheControl: 'public, max-age=31536000, immutable' }
			);
			await task;
			await write(
				{ type: 'VOICE', text: '', media_url: await getDownloadURL(task.snapshot.ref) },
				msgRef
			);
		} catch (err) {
			console.error('[Messages] загрузка голосового:', err);
		} finally {
			isSending = false;
		}
	}

	async function sendSticker(packId: string, filename: string) {
		try {
			await write({ type: 'STICKER', text: '', sticker_pack_id: packId, sticker_id: filename });
		} catch (err) {
			console.error('[Messages] отправка стикера:', err);
		}
	}

	async function write(
		fields: Partial<DMMessage> & { type: string },
		ref?: ReturnType<typeof doc>
	) {
		if (!$activeChat || !$userStore.user) return;
		const { uid: myUid, username: myName, avatar_url } = $userStore.user;
		const { id: chatId, partner } = $activeChat;
		const msgRef = ref ?? doc(collection(db, 'chats', chatId, 'messages'));

		await setDoc(msgRef, {
			author_uid: myUid,
			author_username: myName,
			text: fields.text ?? '',
			type: fields.type,
			media_url: fields.media_url ?? null,
			sticker_pack_id: fields.sticker_pack_id ?? null,
			sticker_id: fields.sticker_id ?? null,
			createdAt: serverTimestamp(),
			is_deleted: false,
			reactions: {},
			read_by: {},
			replyTo: null
		});

		await setDoc(
			doc(db, 'chats', chatId),
			{
				lastMessage: previewFor(fields.type, fields.text ?? ''),
				lastMessageTimestamp: serverTimestamp(),
				participantIds: [myUid, partner.uid],
				participants: {
					[myUid]: { username: myName, avatarUrl: avatar_url ?? null },
					[partner.uid]: { username: partner.username, avatarUrl: partner.avatarUrl ?? null }
				},
				[`unreadCount.${partner.uid}`]: increment(1)
			},
			{ merge: true }
		);
	}

	async function toggleReaction(msg: DMMessage, emoji: string) {
		if (!$userStore.user || !$activeChat) return;
		const uid = $userStore.user.uid;
		const ref = doc(db, 'chats', $activeChat.id, 'messages', msg.id);
		try {
			if (msg.reactions?.[uid] === emoji) {
				const r = { ...msg.reactions };
				delete r[uid];
				await updateDoc(ref, { reactions: r });
			} else {
				await updateDoc(ref, { [`reactions.${uid}`]: emoji });
			}
		} catch (err) {
			console.error('[Messages] реакция:', err);
		}
	}

	function handleTyping() {
		if ($activeChat && $userStore.user) setTyping($activeChat.id, $userStore.user.uid);
	}
</script>

<svelte:head><title>Сообщения | ProtoMap</title></svelte:head>

<div
	class="page"
	class:has-active={!!$activeChat || activeTab === 'channels'}
	in:fade={{ duration: 160 }}
>
	<!-- ══ ЛЕВАЯ ПАНЕЛЬ ═══════════════════════════════════════════════════ -->
	<aside class="panel sidebar">
		<div class="tabs">
			<button class="tab" class:active={activeTab === 'dm'} on:click={switchToDM}>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					width="14"
					height="14"
				>
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
				<span>ЛИЧКИ</span>
				{#if $totalUnread > 0}
					<span class="tab-badge">{$totalUnread > 9 ? '9+' : $totalUnread}</span>
				{/if}
			</button>
			<button class="tab" class:active={activeTab === 'channels'} on:click={switchToChannels}>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					width="14"
					height="14"
				>
					<path
						d="M22 8.35V20a2 2 0 01-2 2H4a2 2 0 01-2-2V8.35A2 2 0 012.61 7l8-5a2 2 0 012.78 0l8 5A2 2 0 0122 8.35z"
					/>
					<path d="M15 22v-4a5 5 0 00-6 0v4" />
				</svg>
				<span>КАНАЛЫ</span>
			</button>
		</div>

		{#if activeTab !== 'channels'}
			<div class="search-wrap">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					width="14"
					height="14"
					class="search-ic"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="M21 21l-4.35-4.35" />
				</svg>
				<input class="search" placeholder="Поиск диалога" bind:value={searchQuery} />
			</div>

			<ChatList
				chats={filteredChats}
				activeChatId={$activeChat?.id ?? null}
				{presence}
				showFavorites={Boolean($userStore.user) && !query}
				favoritesActive={isFav}
				emptyTitle={query ? 'Ничего не найдено' : 'Личных чатов пока нет'}
				emptyHint={query ? 'Попробуй другое имя' : 'Открой профиль пользователя и напиши ему'}
				onOpen={handleOpenChat}
				onFavorites={openFavorites}
			/>
		{:else}
			<div class="side-note">
				<div class="side-note-icon">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						width="30"
						height="30"
					>
						<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
						<circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
					</svg>
				</div>
				<p class="side-note-title">Режим каналов</p>
				<p class="side-note-hint">Выбери канал справа</p>
			</div>
		{/if}
	</aside>

	<!-- ══ ПРАВАЯ ПАНЕЛЬ ══════════════════════════════════════════════════ -->
	<main class="panel main">
		{#if activeTab === 'channels'}
			<div class="dm-header">
				<button class="back-btn" on:click={back} aria-label="Назад">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						width="18"
						height="18"><path d="M15 18l-6-6 6-6" /></svg
					>
				</button>
				<span class="partner-name">Каналы</span>
			</div>
			<ChannelsFeed />
		{:else if !$activeChat}
			<div class="placeholder">
				<div class="ph-icon">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						width="46"
						height="46"
					>
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
					</svg>
				</div>
				<p class="ph-title">Диалог не выбран</p>
				<p class="ph-hint">Выбери переписку слева или начни новую через профиль на карте</p>
			</div>
		{:else}
			<div class="dm-header">
				<button class="back-btn" on:click={back} aria-label="Назад">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						width="18"
						height="18"><path d="M15 18l-6-6 6-6" /></svg
					>
				</button>

				{#if isFav}
					<div class="favorites-icon-sm">
						<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
							<path
								d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"
							/>
						</svg>
					</div>
					<div class="header-text">
						<span class="partner-name">Избранное</span>
						<span class="partner-sub">Заметки, которые видишь только ты</span>
					</div>
				{:else}
					<div class="avatar-wrap {$activeChat.partner.frameId || ''}">
						<img
							src={avatarFor($activeChat.partner.username, $activeChat.partner.avatarUrl)}
							alt=""
							class="avatar"
						/>
						{#if partnerOnline}<span class="online-dot"></span>{/if}
					</div>
					<div class="header-text">
						<a href="/u/{$activeChat.partner.uid}" class="partner-name">
							{$activeChat.partner.username}
						</a>
						{#if $partnerTyping}
							<span class="partner-sub typing">печатает…</span>
						{:else if partnerOnline}
							<span class="partner-sub online">в сети</span>
						{:else}
							<span class="partner-sub">не в сети</span>
						{/if}
					</div>
				{/if}

				<button class="close-btn" on:click={handleCloseChat} aria-label="Закрыть диалог">×</button>
			</div>

			<div class="messages-window" bind:this={messagesWindow} on:scroll={onListScroll}>
				{#if $messages.length === 0}
					<div class="empty-thread">
						<p class="empty-hint">
							{isFav
								? 'Здесь пусто — сохрани себе первую заметку.'
								: 'Сообщений пока нет — напиши первым.'}
						</p>
					</div>
				{/if}

				{#each $messages as msg, idx (msg.id)}
					{#if needsDaySeparator(msg.createdAt, $messages[idx - 1]?.createdAt)}
						<div class="day-sep"><span>{dayLabel(msg.createdAt)}</span></div>
					{/if}

					<MessageBubble
						{msg}
						isOwn={msg.author_uid === $userStore.user?.uid}
						partnerUid={$activeChat.partner.uid}
						partnerAvatar={avatarFor($activeChat.partner.username, $activeChat.partner.avatarUrl)}
						myUid={$userStore.user?.uid ?? null}
						{packs}
						showAvatar={!isFav}
						scrollRoot={messagesWindow}
						onReact={toggleReaction}
					/>
				{/each}
			</div>

			{#if $partnerTyping}
				<div class="typing-indicator">
					<div class="typing-avatar">
						<img
							src={avatarFor($activeChat.partner.username, $activeChat.partner.avatarUrl)}
							alt=""
						/>
					</div>
					<div class="typing-dots"><span></span><span></span><span></span></div>
				</div>
			{/if}

			<Composer
				{packs}
				{isSending}
				{uploadProgress}
				placeholder={isFav ? 'Заметка себе...' : 'Написать...'}
				onSend={sendText}
				onImage={sendImage}
				onVoice={sendVoice}
				onSticker={sendSticker}
				onTyping={handleTyping}
			/>
		{/if}
	</main>
</div>

<style>
	.page {
		position: relative;
		display: flex;
		gap: 0.75rem;
		height: calc(100vh - 64px);
		padding: 0.75rem;
		overflow: hidden;
		background: #0a0a0a;
	}

	/* Панель — тот же приём, что у виджета: тёмное стекло, рамка #30363d
	   и срезанные углы по диагонали. */
	.panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: rgba(5, 8, 12, 0.95);
		border: 1px solid #30363d;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
		clip-path: polygon(
			0 10px,
			10px 0,
			100% 0,
			100% calc(100% - 10px),
			calc(100% - 10px) 100%,
			0 100%
		);
	}

	.sidebar {
		width: 320px;
		flex-shrink: 0;
	}
	.main {
		flex: 1;
		min-width: 0;
	}

	/* ── Вкладки ─────────────────────────────────────────────────────────── */
	.tabs {
		display: flex;
		align-items: stretch;
		flex-shrink: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.tab {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		height: 42px;
		padding: 0 0.65rem;
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		color: #475569;
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		transition:
			color 0.2s,
			border-color 0.2s;
	}
	.tab:hover {
		color: #94a3b8;
	}
	.tab.active {
		color: var(--cyber-yellow, #fcee0a);
		border-bottom-color: var(--cyber-yellow, #fcee0a);
	}
	.tab svg {
		flex-shrink: 0;
	}
	.tab-badge {
		min-width: 14px;
		height: 14px;
		padding: 0 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 7px;
		background: var(--cyber-red, #ff003c);
		color: #fff;
		font-size: 0.5rem;
		font-weight: 900;
		line-height: 1;
	}

	/* ── Поиск ───────────────────────────────────────────────────────────── */
	.search-wrap {
		position: relative;
		flex-shrink: 0;
		margin: 0.55rem 0.6rem 0.35rem;
	}
	.search-ic {
		position: absolute;
		left: 0.6rem;
		top: 50%;
		transform: translateY(-50%);
		color: #475569;
		pointer-events: none;
	}
	.search {
		width: 100%;
		padding: 0.45rem 0.6rem 0.45rem 1.9rem;
		background: rgba(31, 41, 55, 0.7);
		border: 1px solid transparent;
		border-radius: 8px;
		color: #e2e8f0;
		font-size: 0.8rem;
		outline: none;
		transition: border-color 0.2s;
	}
	.search:focus {
		border-color: var(--cyber-yellow, #fcee0a);
	}
	.search::placeholder {
		color: #475569;
	}

	.side-note {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 2rem 1.5rem;
		text-align: center;
	}
	.side-note-icon {
		font-size: 2rem;
		opacity: 0.4;
	}
	.side-note-title {
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		color: #94a3b8;
	}
	.side-note-hint {
		font-size: 0.75rem;
		color: #475569;
	}

	/* ── Шапка диалога ───────────────────────────────────────────────────── */
	.dm-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
		padding: 0.5rem 0.75rem;
		min-height: 52px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.back-btn {
		display: none;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: 6px;
		color: #94a3b8;
	}
	.back-btn:hover {
		color: var(--cyber-yellow, #fcee0a);
	}

	/* Размер держит обёртка: на неё вешается frameId, а глобальные правила
	   вида `.frame_high_roller img { width:100% !important }` из cosmetics.css
	   перебивают размер картинки — без размеров обёртки аватарка раздувается. */
	.avatar-wrap {
		position: relative;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
	}
	.avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		display: block;
		background: #0d1119;
	}
	.online-dot {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #39ff14;
		border: 2px solid #05080c;
		box-shadow: 0 0 6px rgba(57, 255, 20, 0.7);
	}
	.favorites-icon-sm {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(252, 238, 10, 0.1);
		color: var(--cyber-yellow, #fcee0a);
	}

	.header-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.partner-name {
		font-size: 0.9rem;
		font-weight: 700;
		color: #e2e8f0;
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	a.partner-name:hover {
		color: var(--cyber-yellow, #fcee0a);
		text-decoration: underline;
	}
	.partner-sub {
		font-size: 0.68rem;
		color: #64748b;
	}
	.partner-sub.online {
		color: #39ff14;
	}
	.partner-sub.typing {
		color: var(--cyber-yellow, #fcee0a);
		font-style: italic;
	}

	.close-btn {
		flex-shrink: 0;
		width: 30px;
		height: 30px;
		font-size: 1.5rem;
		line-height: 1;
		color: #4b5563;
		border-radius: 6px;
		transition:
			color 0.2s,
			transform 0.2s;
	}
	.close-btn:hover {
		color: #fff;
		transform: rotate(90deg);
	}

	/* ── Лента ───────────────────────────────────────────────────────────── */
	.messages-window {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.85rem 1rem;
		scrollbar-width: thin;
		scrollbar-color: #334155 transparent;
	}
	.messages-window::-webkit-scrollbar {
		width: 6px;
	}
	.messages-window::-webkit-scrollbar-thumb {
		background: #334155;
		border-radius: 3px;
	}

	.day-sep {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0.75rem 0 0.5rem;
	}
	.day-sep span {
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		color: #475569;
		background: rgba(15, 20, 30, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.06);
		padding: 0.2rem 0.65rem;
		border-radius: 10px;
	}

	.empty-thread {
		margin: auto;
		text-align: center;
	}
	.empty-hint {
		font-size: 0.8rem;
		color: #475569;
		line-height: 1.5;
	}

	.placeholder {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		text-align: center;
	}
	.ph-icon {
		font-size: 2.5rem;
		opacity: 0.35;
	}
	.ph-title {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		color: #94a3b8;
	}
	.ph-hint {
		font-size: 0.78rem;
		color: #475569;
		max-width: 320px;
		line-height: 1.5;
	}

	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
		padding: 0.3rem 1rem 0.1rem;
	}
	.typing-avatar img {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		object-fit: cover;
		opacity: 0.7;
	}
	.typing-dots {
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 6px 10px;
		border-radius: 12px;
		background: rgba(31, 41, 55, 0.7);
		border: 1px solid rgba(75, 85, 99, 0.4);
	}
	.typing-dots span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #64748b;
		animation: typing-bounce 1.2s ease-in-out infinite;
	}
	.typing-dots span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing-dots span:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes typing-bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.4;
		}
		30% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}

	/* ── Мобильный: master-detail ────────────────────────────────────────── */
	@media (max-width: 768px) {
		.page {
			padding: 0;
			gap: 0;
		}
		.panel {
			border: none;
			border-radius: 0;
			clip-path: none;
			box-shadow: none;
		}
		.sidebar {
			width: 100%;
		}
		.main {
			position: absolute;
			inset: 0;
			z-index: 30;
			background: #0a0a0a;
			transform: translateX(100%);
			transition: transform 0.25s ease;
		}
		.page.has-active .main {
			transform: translateX(0);
		}
		.back-btn {
			display: flex;
		}
		.close-btn {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.typing-dots span {
			animation: none;
		}
		.main {
			transition: none;
		}
	}
</style>
