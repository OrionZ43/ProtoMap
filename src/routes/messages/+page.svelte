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
		startInbox,
		openChat,
		closeChat,
		setTyping,
		destroyDM,
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
	import VoiceMessage from '$lib/components/chat/VoiceMessage.svelte';
	import ChannelsFeed from '$lib/components/chat/ChannelsFeed.svelte';
	import { stickerStore, getStickerUrl } from '$lib/stores/stickerStore';
	import { scrollToBottom } from '$lib/utils/scroll';

	// ── UI state ───────────────────────────────────────────────────────────
	let messageText = '';
	let isSending = false;
	let isRecording = false;
	let uploadProgress = 0;
	let showStickerPicker = false;
	let hoveredMsg: string | null = null;
	let reactionPanelMsg: string | null = null;
	let messagesWindow: HTMLDivElement;
	let inputEl: HTMLTextAreaElement;
	let fileInputEl: HTMLInputElement;
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let searchQuery = '';

	// Стикеры из глобального стора
	$: packs = $stickerStore.packs;
	let activePack = $stickerStore.packs[0] ?? null;
	$: if (packs.length > 0 && !activePack) activePack = packs[0];

	// Вкладки
	type Tab = 'dm' | 'channels' | 'favorites';
	let activeTab: Tab = 'dm';

	// ── Реактивный запуск inbox ─────────────────────────────────────────────
	let inboxStarted = false;
	$: if (!$userStore.loading && $userStore.user && !inboxStarted) {
		inboxStarted = true;
		startInbox($userStore.user.uid);
	}
	$: if (!$userStore.user) inboxStarted = false;

	// ── Фильтрация списка диалогов по поиску ────────────────────────────────
	$: filteredChats = searchQuery.trim()
		? $chats.filter((c) =>
				c.partner.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
		  )
		: $chats;

	onMount(() => {
		const t = $page.url.searchParams.get('tab') as Tab;
		if (t && ['dm', 'channels', 'favorites'].includes(t)) activeTab = t;

		stickerStore.load();

		// pendingDM от кнопки «Написать» на профиле
		const unsub = chat.subscribe((state) => {
			if (state.pendingDM && $userStore.user) {
				const partner = state.pendingDM;
				chat.clearPendingDM();
				activeTab = 'dm';
				const myUid = $userStore.user.uid;
				const chatId = [myUid, partner.uid].sort().join('_');
				openChat(
					{ id: chatId, partner, lastMessage: '', lastMessageTimestamp: null, unread: 0 },
					myUid
				);
			}
		});

		const unsubUnread = totalUnread.subscribe((n) => chat.setDmUnread(n > 0));

		return () => {
			unsub();
			unsubUnread();
		};
	});

	onDestroy(() => {
		const uid = $userStore.user?.uid;
		if (uid) destroyDM(uid, $activeChat?.id);
	});

	// ── Автоскролл: только если пользователь уже внизу или чат только открылся ─
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
		const gap = messagesWindow.scrollHeight - messagesWindow.scrollTop - messagesWindow.clientHeight;
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

	// ── Ленивая загрузка волны голосовых (иначе 50 декодов = фриз) ──────────
	let voiceVisible: Record<string, boolean> = {};
	function whenVisible(node: HTMLElement, id: string) {
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						voiceVisible = { ...voiceVisible, [id]: true };
						obs.disconnect();
						break;
					}
				}
			},
			{ root: messagesWindow ?? null, rootMargin: '250px' }
		);
		obs.observe(node);
		return { destroy: () => obs.disconnect() };
	}

	// ── Открытие / закрытие чата ────────────────────────────────────────────
	function handleOpenChat(dmChat: DMChat) {
		if (!$userStore.user) return;
		openChat(dmChat, $userStore.user.uid);
		showStickerPicker = false;
		reactionPanelMsg = null;
	}

	function handleCloseChat() {
		if (!$userStore.user || !$activeChat) return;
		closeChat($userStore.user.uid, $activeChat.id);
		showStickerPicker = false;
		reactionPanelMsg = null;
	}

	function openFavorites() {
		if (!$userStore.user) return;
		const me = $userStore.user;
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
		activeTab = 'dm';
	}

	function switchToChannels() {
		activeTab = 'channels';
		if ($activeChat && $userStore.user) closeChat($userStore.user.uid, $activeChat.id);
		goto('/messages?tab=channels', { replaceState: true });
	}

	function switchToDM() {
		activeTab = 'dm';
		goto('/messages', { replaceState: true });
	}

	// ── Отправка ────────────────────────────────────────────────────────────
	async function sendMessage() {
		if (isSending || !messageText.trim() || !$activeChat || !$userStore.user) return;
		isSending = true;
		const text = messageText.trim();
		messageText = '';
		resetInputHeight();
		try {
			await _write({ type: 'TEXT', text });
		} catch (err) {
			console.error('[Messages] send failed:', err);
			messageText = text; // возвращаем текст, чтобы не потерять
		} finally {
			isSending = false;
		}
	}

	async function handleFileSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file || !$activeChat || !$userStore.user || !file.type.startsWith('image/')) return;

		if (file.size > 10 * 1024 * 1024) {
			console.warn('[Messages] image too large:', file.size);
			return;
		}

		isSending = true;
		uploadProgress = 0;
		try {
			const storage = getStorage();
			const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
			const msgRef = doc(collection(db, 'chats', $activeChat.id, 'messages'));
			const task = uploadBytesResumable(
				storageRef(storage, `chat_media/${$activeChat.id}/image/${msgRef.id}.${ext}`),
				file,
				{ contentType: file.type }
			);
			await new Promise<void>((res, rej) => {
				task.on(
					'state_changed',
					(s) => (uploadProgress = Math.round((s.bytesTransferred / s.totalBytes) * 100)),
					rej,
					async () => {
						const url = await getDownloadURL(task.snapshot.ref);
						await _write({ type: 'IMAGE', text: '', media_url: url }, msgRef);
						res();
					}
				);
			});
		} catch (err) {
			console.error('[Messages] image upload:', err);
		} finally {
			isSending = false;
			uploadProgress = 0;
			(e.target as HTMLInputElement).value = '';
		}
	}

	async function toggleRecording() {
		if (isRecording) {
			mediaRecorder?.stop();
			isRecording = false;
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			audioChunks = [];
			mediaRecorder = new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
			mediaRecorder.onstop = async () => {
				stream.getTracks().forEach((t) => t.stop());
				if (!$activeChat || !$userStore.user) return;
				isSending = true;
				try {
					const blob = new Blob(audioChunks, { type: 'audio/webm' });
					const storage = getStorage();
					const msgRef = doc(collection(db, 'chats', $activeChat.id, 'messages'));
					const task = uploadBytesResumable(
						storageRef(storage, `chat_media/${$activeChat.id}/voice/${msgRef.id}.webm`),
						blob,
						{ contentType: 'audio/webm' }
					);
					await task;
					await _write(
						{ type: 'VOICE', text: '', media_url: await getDownloadURL(task.snapshot.ref) },
						msgRef
					);
				} catch (err) {
					console.error('[Messages] voice upload:', err);
				} finally {
					isSending = false;
				}
			};
			mediaRecorder.start();
			isRecording = true;
		} catch (err) {
			console.error('[Messages] mic:', err);
		}
	}

	async function sendSticker(packId: string, filename: string) {
		showStickerPicker = false;
		await _write({ type: 'STICKER', text: '', sticker_pack_id: packId, sticker_id: filename });
	}

	async function _write(
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

		const preview =
			fields.type === 'IMAGE'
				? '📷 Изображение'
				: fields.type === 'VOICE'
					? '🎙 Голосовое'
					: fields.type === 'STICKER'
						? '🌟 Стикер'
						: (fields.text ?? '');

		await setDoc(
			doc(db, 'chats', chatId),
			{
				lastMessage: preview,
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
			console.error('[Messages] reaction:', err);
		}
	}

	// ── Ввод ────────────────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function onInput() {
		autogrow();
		if ($activeChat && $userStore.user) setTyping($activeChat.id, $userStore.user.uid);
	}

	function autogrow() {
		if (!inputEl) return;
		inputEl.style.height = 'auto';
		inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
	}

	function resetInputHeight() {
		if (inputEl) inputEl.style.height = 'auto';
	}

	function toggleReactionPanel(msgId: string, e: MouseEvent) {
		e.stopPropagation();
		reactionPanelMsg = reactionPanelMsg === msgId ? null : msgId;
	}

	// ── Утилиты ─────────────────────────────────────────────────────────────
	// Нормализуем регистр типа — приложение может писать TEXT/VOICE,
	// а веб раньше писал text/voice. Приводим к одному виду.
	function mtype(t: string | null | undefined): string {
		return (t ?? 'TEXT').toUpperCase();
	}

	function avatarFor(username: string, url: string | null | undefined): string {
		return url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username)}`;
	}

	function getSticker(packId: string | null | undefined, filename: string | number): string {
		return getStickerUrl(packs, packId, filename);
	}

	// ВАЖНО: ничего из вызываемого в разметке не должно бросать. Исключение при
	// рендере разрушает всё дерево компонентов Svelte — падает не чат, а весь сайт.
	function isPlainMap(v: unknown): v is Record<string, never> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	function isValidDate(d: unknown): d is Date {
		return d instanceof Date && !isNaN(d.getTime());
	}

	function fmt(date: Date) {
		if (!isValidDate(date)) return '';
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function fmtDate(date: Date | null) {
		if (!isValidDate(date)) return '';
		const d = Date.now() - date.getTime();
		if (d < 60_000) return 'сейчас';
		if (d < 3_600_000) return `${Math.floor(d / 60_000)} мин`;
		if (d < 86_400_000) return fmt(date);
		return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
	}

	function isSameDay(a: Date, b: Date) {
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function dayLabel(date: Date) {
		if (!isValidDate(date)) return '';
		const t = new Date();
		const y = new Date(t);
		y.setDate(y.getDate() - 1);
		if (isSameDay(date, t)) return 'Сегодня';
		if (isSameDay(date, y)) return 'Вчера';
		return date.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
	}

	function countReactions(r: Record<string, string> | null | undefined) {
		if (!isPlainMap(r)) return [];
		const c: Record<string, number> = {};
		Object.values(r).forEach((e) => (c[e as string] = (c[e as string] ?? 0) + 1));
		return Object.entries(c);
	}

	/** Сколько реакций у сообщения — безопасно для любого содержимого поля. */
	function reactionCount(r: unknown): number {
		return isPlainMap(r) ? Object.keys(r).length : 0;
	}

	const QUICK = ['❤️', '🔥', '😂', '👍', '😮'];
</script>

<svelte:head><title>Сообщения | ProtoMap</title></svelte:head>

<div class="page" class:has-active={!!$activeChat || activeTab === 'channels'} in:fade={{ duration: 160 }}>
	<!-- ══ ЛЕВАЯ КОЛОНКА ══════════════════════════════════════════════════ -->
	<aside class="sidebar">
		<div class="sidebar-top">
			<span class="sidebar-title">// КАНАЛЫ&nbsp;СВЯЗИ</span>
			{#if $totalUnread > 0}<span class="total-badge">{$totalUnread > 99 ? '99+' : $totalUnread}</span>{/if}
		</div>

		<nav class="tabs">
			<button class="tab" class:active={activeTab === 'dm'} on:click={switchToDM}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
				Личные
				{#if $totalUnread > 0}<span class="tab-badge">{$totalUnread > 99 ? '99+' : $totalUnread}</span>{/if}
			</button>
			<button class="tab" class:active={activeTab === 'channels'} on:click={switchToChannels}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
				Каналы
			</button>
			<button class="tab fav-tab" on:click={openFavorites}>
				<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
				Избранное
			</button>
		</nav>

		{#if activeTab !== 'channels'}
			<div class="search-wrap">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="search-ic"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
				<input class="search" placeholder="Поиск диалога" bind:value={searchQuery} />
			</div>
		{/if}

		<div class="chat-list">
			{#if activeTab === 'channels'}
				<div class="side-note">
					<span>// РЕЖИМ&nbsp;КАНАЛОВ</span>
					<small>Выбери канал справа</small>
				</div>
			{:else}
				{#if $userStore.user && !searchQuery.trim()}
					<button
						class="chat-row fav-row"
						on:click={openFavorites}
						class:active={$activeChat?.partner.uid === $userStore.user.uid}
					>
						<div class="fav-icon-wrap">
							<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
						</div>
						<div class="chat-info">
							<span class="chat-name fav-name">Избранное</span>
							<span class="chat-prev">Заметки и файлы</span>
						</div>
					</button>
				{/if}

				{#each filteredChats as dmChat (dmChat.id)}
					<button
						class="chat-row"
						on:click={() => handleOpenChat(dmChat)}
						class:active={$activeChat?.id === dmChat.id}
					>
						<div class="ava-wrap">
							<img
								src={avatarFor(dmChat.partner.username, dmChat.partner.avatarUrl)}
								alt={dmChat.partner.username}
								class="ava"
								loading="lazy"
							/>
							{#if dmChat.unread > 0}
								<span class="unread-dot">{dmChat.unread > 99 ? '99+' : dmChat.unread}</span>
							{/if}
						</div>
						<div class="chat-info">
							<div class="chat-row-top">
								<span class="chat-name" class:bold={dmChat.unread > 0}>{dmChat.partner.username}</span>
								<span class="chat-time">{fmtDate(dmChat.lastMessageTimestamp)}</span>
							</div>
							<span class="chat-prev" class:bold={dmChat.unread > 0}>{dmChat.lastMessage || '...'}</span>
						</div>
					</button>
				{/each}

				{#if filteredChats.length === 0 && !$userStore.loading && $userStore.user}
					<div class="list-empty">
						{#if searchQuery.trim()}
							<span>Ничего не найдено</span>
							<small>Попробуй другое имя</small>
						{:else}
							<span>Нет диалогов</span>
							<small>Напиши кому-нибудь через профиль на карте</small>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</aside>

	<!-- ══ ПРАВАЯ КОЛОНКА ══════════════════════════════════════════════════ -->
	<main class="main-area">
		{#if activeTab === 'channels'}
			<div class="channels-mobile-bar">
				<button class="back-btn" on:click={switchToDM} title="Назад" aria-label="Назад">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
				</button>
				<span class="cmb-title">// КАНАЛЫ</span>
			</div>
			<ChannelsFeed />
		{:else if !$activeChat}
			<div class="placeholder">
				<div class="ph-core">
					<div class="ph-ring"></div>
					<div class="ph-ring ph-ring-2"></div>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="30" height="30"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
				</div>
				<p class="ph-title">КАНАЛ НЕ ВЫБРАН</p>
				<p class="ph-hint">Выбери диалог слева, чтобы установить связь</p>
			</div>
		{:else}
			{@const isFav = $activeChat.partner.uid === $userStore.user?.uid}
			<div class="chat-header">
				<button class="back-btn" on:click={handleCloseChat} title="Назад" aria-label="Назад">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
				</button>
				<div class="chat-header-info">
					{#if isFav}
						<div class="fav-icon-sm">
							<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
						</div>
						<div class="header-text">
							<span class="partner-name">Избранное</span>
							<span class="partner-sub">Только ты видишь эти заметки</span>
						</div>
					{:else}
						<img
							src={avatarFor($activeChat.partner.username, $activeChat.partner.avatarUrl)}
							alt=""
							class="partner-ava"
						/>
						<div class="header-text">
							<a href="/u/{$activeChat.partner.uid}" class="partner-name">{$activeChat.partner.username}</a>
							{#if $partnerTyping}
								<span class="partner-sub typing">печатает…</span>
							{:else}
								<span class="partner-sub">// защищённый канал</span>
							{/if}
						</div>
					{/if}
				</div>
				<button class="close-chat-btn" on:click={handleCloseChat} title="Закрыть" aria-label="Закрыть">×</button>
			</div>

			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="msg-list" bind:this={messagesWindow} on:scroll={onListScroll} on:click={() => (reactionPanelMsg = null)}>
				{#if $messages.length === 0}
					<div class="empty-thread">
						<span>{isFav ? '📌' : '👋'}</span>
						<p>{isFav ? 'Здесь пусто. Сохрани заметку себе.' : 'Сообщений пока нет — напиши первым.'}</p>
					</div>
				{/if}

				{#each $messages as msg, idx (msg.id)}
					{@const isOwn = msg.author_uid === $userStore.user?.uid}
					{@const prev = $messages[idx - 1]}
					{@const T = mtype(msg.type)}

					{#if !prev || !isSameDay(msg.createdAt, prev.createdAt)}
						<div class="day-sep"><span>{dayLabel(msg.createdAt)}</span></div>
					{/if}

					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						class="msg-row"
						class:own={isOwn}
						on:mouseenter={() => (hoveredMsg = msg.id)}
						on:mouseleave={() => (hoveredMsg = null)}
					>
						{#if !isOwn && !isFav}
							<img src={avatarFor($activeChat.partner.username, $activeChat.partner.avatarUrl)} alt="" class="msg-ava" />
						{/if}

						<div class="bubble-wrap" class:own={isOwn}>
							<div class="bubble" class:own={isOwn} class:sticker={T === 'STICKER'} class:media={T === 'IMAGE'}>
								{#if msg.is_deleted}
									<span class="deleted">Сообщение удалено</span>
								{:else if T === 'STICKER' && msg.sticker_pack_id && msg.sticker_id}
									<img src={getSticker(msg.sticker_pack_id, msg.sticker_id)} alt="sticker" class="sticker-img" loading="lazy" />
								{:else if T === 'IMAGE' && msg.media_url}
									<a href={msg.media_url} target="_blank" rel="noopener noreferrer">
										<img src={msg.media_url} alt="" class="chat-img" loading="lazy" />
									</a>
								{:else if T === 'IMAGE' && msg.text}
									<img src="data:image/jpeg;base64,{msg.text}" alt="" class="chat-img" loading="lazy" />
								{:else if T === 'VOICE'}
									<div use:whenVisible={msg.id} class="voice-slot">
										{#if voiceVisible[msg.id]}
											{#if msg.media_url}
												<VoiceMessage src={msg.media_url} {isOwn} />
											{:else if msg.text}
												<VoiceMessage src="data:audio/aac;base64,{msg.text}" {isOwn} />
											{/if}
										{:else}
											<div class="voice-skeleton">
												<div class="vs-play"></div>
												<div class="vs-bars">{#each Array(20) as _}<span></span>{/each}</div>
											</div>
										{/if}
									</div>
								{:else}
									<p class="msg-text">{msg.text}</p>
								{/if}

								{#if T !== 'STICKER'}
									<span class="msg-time">
										{fmt(msg.createdAt)}
										{#if isOwn}
											{@const read = $activeChat && msg.read_by?.[$activeChat.partner.uid]}
											<span class="ticks" class:read>{read ? '✓✓' : '✓'}</span>
										{/if}
									</span>
								{/if}
							</div>

							{#if hoveredMsg === msg.id && $userStore.user}
								<button class="react-btn" class:own={isOwn} on:click={(e) => toggleReactionPanel(msg.id, e)} aria-label="Реакция">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
								</button>
							{/if}

							{#if reactionPanelMsg === msg.id}
								<div class="react-panel" class:own={isOwn}>
									{#each QUICK as e}
										<button class="rp-btn" on:click={() => { toggleReaction(msg, e); reactionPanelMsg = null; }}>{e}</button>
									{/each}
								</div>
							{/if}

							{#if reactionCount(msg.reactions) > 0}
								<div class="reactions" class:own={isOwn}>
									{#each countReactions(msg.reactions) as [e, n]}
										<button
											class="rpill"
											class:mine={msg.reactions?.[$userStore.user?.uid ?? ''] === e}
											on:click={() => toggleReaction(msg, e)}
										>{e} {n}</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if $partnerTyping}
					<div class="msg-row">
						<img src={avatarFor($activeChat.partner.username, $activeChat.partner.avatarUrl)} alt="" class="msg-ava" />
						<div class="typing-bubble"><span></span><span></span><span></span></div>
					</div>
				{/if}
			</div>

			<!-- Стикер-пикер -->
			{#if showStickerPicker}
				<div class="sticker-picker" transition:fade={{ duration: 120 }}>
					<div class="pack-tabs">
						{#each packs as pack (pack.id)}
							<button class="ptab" class:active={activePack?.id === pack.id} on:click={() => (activePack = pack)}>
								<img src={pack.iconUrl} alt={pack.name} class="ptab-img" />
							</button>
						{/each}
					</div>
					<div class="sticker-grid">
						{#if activePack}
							{#each activePack.stickers as filename (filename)}
								<button class="sbtn" on:click={() => sendSticker(activePack.id, filename)}>
									<img src={getSticker(activePack.id, filename)} alt="" loading="lazy" class="simg" />
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			<!-- Поле ввода -->
			<div class="input-area">
				{#if uploadProgress > 0}
					<div class="upload-bar"><div class="upload-fill" style="width:{uploadProgress}%"></div></div>
				{/if}
				<div class="input-row">
					<button class="tool" on:click={() => fileInputEl.click()} disabled={isSending} title="Изображение" aria-label="Изображение">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
					</button>
					<input bind:this={fileInputEl} type="file" accept="image/*" style="display:none" on:change={handleFileSelect} />

					<button class="tool" class:active={showStickerPicker} on:click={() => (showStickerPicker = !showStickerPicker)} title="Стикеры" aria-label="Стикеры">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20.5 11.5V7a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4.5"/><path d="M13 21c4.5 0 8-3.5 8-8h-5a3 3 0 0 0-3 3z"/></svg>
					</button>

					<textarea
						bind:this={inputEl}
						bind:value={messageText}
						on:keydown={handleKeydown}
						on:input={onInput}
						placeholder={isRecording ? '🔴 Идёт запись…' : 'Сообщение…'}
						disabled={isSending || isRecording}
						class="input-field"
						rows="1"
						maxlength="1000"
					></textarea>

					{#if isRecording}
						<div class="rec-wrap">
							<div class="rec-ring r1"></div>
							<div class="rec-ring r2"></div>
							<div class="rec-ring r3"></div>
							<button class="stop-btn" on:click={toggleRecording} aria-label="Остановить"><div class="stop-sq"></div></button>
						</div>
					{:else if messageText.trim()}
						<button class="send" on:click={sendMessage} disabled={isSending} aria-label="Отправить">
							<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>
						</button>
					{:else}
						<button class="tool voice-tool" on:click={toggleRecording} title="Голосовое" aria-label="Голосовое">
							<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	:global(body) { overflow: hidden; }

	.page {
		display: flex;
		height: calc(100vh - 64px);
		background:
			radial-gradient(1200px 600px at 20% -10%, rgba(0, 240, 255, 0.05), transparent 60%),
			radial-gradient(900px 500px at 110% 110%, rgba(252, 238, 10, 0.04), transparent 55%),
			#060609;
		overflow: hidden;
		position: relative;
	}

	/* ── SIDEBAR ─────────────────────────────────────────────────────────── */
	.sidebar {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(9, 11, 17, 0.82);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}

	.sidebar-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.05rem 1.25rem 0.7rem;
		flex-shrink: 0;
	}

	.sidebar-title {
		font-family: 'Chakra Petch', monospace;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--cyber-cyan, #00f0ff);
		letter-spacing: 0.22em;
		text-shadow: 0 0 12px rgba(0, 240, 255, 0.35);
	}

	.total-badge {
		background: var(--cyber-red, #ff003c);
		color: white;
		font-size: 0.58rem;
		font-weight: 900;
		min-width: 18px;
		height: 18px;
		border-radius: 9px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 5px;
		box-shadow: 0 0 10px rgba(255, 0, 60, 0.5);
	}

	.tabs { display: flex; padding: 0 0.6rem; gap: 2px; flex-shrink: 0; }

	.tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.55rem 0.2rem;
		font-family: 'Chakra Petch', monospace;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #4b5563;
		border-bottom: 2px solid transparent;
		transition: color 0.2s, border-color 0.2s;
		position: relative;
	}
	.tab:hover { color: #94a3b8; }
	.tab.active { color: var(--cyber-cyan, #00f0ff); border-bottom-color: var(--cyber-cyan, #00f0ff); }
	.fav-tab:hover { color: var(--cyber-yellow, #fcee0a); }

	.tab-badge {
		background: var(--cyber-red, #ff003c);
		color: white;
		font-size: 0.5rem;
		font-weight: 900;
		min-width: 13px;
		height: 13px;
		border-radius: 7px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 3px;
	}

	.search-wrap {
		position: relative;
		margin: 0.7rem 0.9rem 0.5rem;
		flex-shrink: 0;
	}
	.search-ic {
		position: absolute;
		left: 0.65rem;
		top: 50%;
		transform: translateY(-50%);
		color: #475569;
		pointer-events: none;
	}
	.search {
		width: 100%;
		padding: 0.5rem 0.7rem 0.5rem 2rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 10px;
		color: #e2e8f0;
		font-size: 0.82rem;
		outline: none;
		transition: border-color 0.2s, background 0.2s;
	}
	.search:focus { border-color: rgba(0, 240, 255, 0.4); background: rgba(0, 240, 255, 0.04); }
	.search::placeholder { color: #475569; }

	.chat-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.25rem 0.5rem 1rem;
		scrollbar-width: thin;
		scrollbar-color: #1e293b transparent;
	}
	.chat-list::-webkit-scrollbar { width: 6px; }
	.chat-list::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }

	.side-note {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		height: 100%;
		padding: 2rem 1rem;
		text-align: center;
		font-family: 'Chakra Petch', monospace;
		color: #334155;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
	}
	.side-note small { font-family: 'Inter', sans-serif; letter-spacing: 0; color: #475569; }

	.chat-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.7rem;
		border-radius: 12px;
		transition: background 0.15s;
		text-align: left;
		position: relative;
	}
	.chat-row:hover { background: rgba(255, 255, 255, 0.04); }
	.chat-row.active { background: rgba(0, 240, 255, 0.07); }
	.chat-row.active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 18%;
		bottom: 18%;
		width: 3px;
		border-radius: 2px;
		background: var(--cyber-cyan, #00f0ff);
		box-shadow: 0 0 8px var(--cyber-cyan, #00f0ff);
	}
	.fav-row.active { background: rgba(252, 238, 10, 0.07); }
	.fav-row.active::before { background: var(--cyber-yellow, #fcee0a); box-shadow: 0 0 8px var(--cyber-yellow, #fcee0a); }

	.fav-icon-wrap {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(252, 238, 10, 0.1);
		border: 1px solid rgba(252, 238, 10, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--cyber-yellow, #fcee0a);
		flex-shrink: 0;
	}

	.ava-wrap { position: relative; flex-shrink: 0; }
	.ava {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: #0d1119;
	}

	.unread-dot {
		position: absolute;
		top: -2px;
		right: -2px;
		background: var(--cyber-red, #ff003c);
		color: white;
		font-size: 0.55rem;
		font-weight: 900;
		min-width: 16px;
		height: 16px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 3px;
		border: 2px solid #090b11;
	}

	.chat-info { flex: 1; min-width: 0; }
	.chat-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem; margin-bottom: 0.1rem; }
	.chat-name {
		font-size: 0.88rem;
		color: #cbd5e1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chat-name.bold { font-weight: 700; color: #fff; }
	.fav-name { color: var(--cyber-yellow, #fcee0a); font-weight: 600; }
	.chat-time { font-size: 0.6rem; color: #475569; flex-shrink: 0; font-family: 'Chakra Petch', monospace; }
	.chat-prev {
		font-size: 0.76rem;
		color: #64748b;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chat-prev.bold { color: #94a3b8; }

	.list-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 3rem 1.5rem;
		text-align: center;
		color: #475569;
		font-size: 0.82rem;
	}
	.list-empty small { font-size: 0.72rem; color: #334155; line-height: 1.4; }

	/* ── MAIN ────────────────────────────────────────────────────────────── */
	.main-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.placeholder {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}
	.ph-core {
		position: relative;
		width: 96px;
		height: 96px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(0, 240, 255, 0.25);
	}
	.ph-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		border: 1px solid rgba(0, 240, 255, 0.15);
		animation: spin 14s linear infinite;
	}
	.ph-ring-2 { inset: 14px; border-color: rgba(252, 238, 10, 0.12); animation-direction: reverse; animation-duration: 10s; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.ph-title {
		font-family: 'Chakra Petch', monospace;
		font-size: 0.85rem;
		letter-spacing: 0.22em;
		color: #334155;
	}
	.ph-hint { font-size: 0.78rem; color: #1e293b; }

	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.7rem 1.1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
		background: rgba(9, 11, 17, 0.72);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		position: relative;
	}
	.chat-header::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.4), transparent);
	}

	.back-btn {
		display: none;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 8px;
		color: #94a3b8;
		flex-shrink: 0;
	}
	.back-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.06); }

	.chat-header-info { display: flex; align-items: center; gap: 0.65rem; flex: 1; min-width: 0; }
	.partner-ava {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(0, 240, 255, 0.3);
	}
	.header-text { display: flex; flex-direction: column; min-width: 0; }
	.partner-name {
		font-size: 0.95rem;
		font-weight: 700;
		color: #f1f5f9;
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.partner-name:hover { color: var(--cyber-cyan, #00f0ff); }
	.partner-sub { font-size: 0.66rem; color: #64748b; font-family: 'Chakra Petch', monospace; letter-spacing: 0.05em; }
	.partner-sub.typing { color: var(--cyber-cyan, #00f0ff); font-style: italic; }

	.fav-icon-sm {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: rgba(252, 238, 10, 0.1);
		border: 1px solid rgba(252, 238, 10, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--cyber-yellow, #fcee0a);
	}

	.close-chat-btn {
		font-size: 1.5rem;
		line-height: 1;
		color: #475569;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		flex-shrink: 0;
		transition: color 0.2s, transform 0.2s, background 0.2s;
	}
	.close-chat-btn:hover { color: #fff; transform: rotate(90deg); background: rgba(255, 255, 255, 0.05); }

	.msg-list {
		flex: 1;
		overflow-y: auto;
		padding: 1.1rem 1.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		scrollbar-width: thin;
		scrollbar-color: #1e293b transparent;
	}
	.msg-list::-webkit-scrollbar { width: 7px; }
	.msg-list::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }

	.empty-thread {
		margin: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		color: #475569;
		font-size: 0.85rem;
		text-align: center;
	}
	.empty-thread span { font-size: 2rem; opacity: 0.7; }

	.day-sep { display: flex; align-items: center; justify-content: center; margin: 0.6rem 0 0.2rem; }
	.day-sep span {
		font-family: 'Chakra Petch', monospace;
		font-size: 0.6rem;
		color: #64748b;
		background: rgba(15, 20, 30, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.06);
		padding: 0.2rem 0.7rem;
		border-radius: 10px;
		letter-spacing: 0.08em;
	}

	.msg-row { display: flex; align-items: flex-end; gap: 0.5rem; }
	.msg-row.own { flex-direction: row-reverse; }
	.msg-ava { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.08); }

	.bubble-wrap { display: flex; flex-direction: column; max-width: 66%; position: relative; gap: 0.25rem; }
	.bubble-wrap.own { align-items: flex-end; }

	.bubble {
		padding: 0.55rem 0.72rem 1.5rem;
		border-radius: 16px 16px 16px 4px;
		position: relative;
		background: rgba(19, 26, 38, 0.72);
		border: 1px solid rgba(0, 240, 255, 0.14);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}
	.bubble.own {
		border-radius: 16px 16px 4px 16px;
		background: rgba(252, 238, 10, 0.07);
		border-color: rgba(252, 238, 10, 0.22);
	}
	.bubble.sticker { background: transparent !important; border: none !important; padding: 0 !important; backdrop-filter: none; }
	.bubble.media { padding: 4px 4px 1.4rem; }

	.msg-text {
		font-size: 0.9rem;
		color: #e5edf5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
		line-height: 1.5;
	}

	.msg-time {
		position: absolute;
		bottom: 0.32rem;
		right: 0.6rem;
		font-size: 0.58rem;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 3px;
		font-family: 'Chakra Petch', monospace;
	}
	.ticks { font-size: 0.6rem; color: rgba(255, 255, 255, 0.3); letter-spacing: -2px; }
	.ticks.read { color: var(--cyber-cyan, #00f0ff); }
	.deleted { font-size: 0.82rem; color: #64748b; font-style: italic; }

	.chat-img { max-width: 300px; max-height: 240px; border-radius: 12px; object-fit: cover; display: block; cursor: pointer; }
	.sticker-img { width: 128px; height: 128px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5)); }

	.voice-slot { min-width: 190px; }
	.voice-skeleton { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.55rem; min-width: 185px; }
	.vs-play { width: 36px; height: 36px; border-radius: 50%; background: rgba(255, 255, 255, 0.06); flex-shrink: 0; animation: skel 1.3s ease-in-out infinite; }
	.vs-bars { flex: 1; display: flex; align-items: center; gap: 2px; height: 36px; }
	.vs-bars span { flex: 1; height: 40%; background: rgba(255, 255, 255, 0.08); border-radius: 2px; animation: skel 1.3s ease-in-out infinite; }
	@keyframes skel { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }

	.react-btn {
		position: absolute;
		bottom: -8px;
		right: -8px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #94a3b8;
		background: rgba(13, 17, 25, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 50%;
		z-index: 10;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
		transition: color 0.15s, border-color 0.15s;
	}
	.react-btn:hover { color: var(--cyber-cyan, #00f0ff); border-color: rgba(0, 240, 255, 0.4); }
	.react-btn.own { right: auto; left: -8px; }

	.react-panel {
		position: absolute;
		bottom: 22px;
		right: -8px;
		display: flex;
		gap: 2px;
		background: rgba(10, 12, 18, 0.97);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 24px;
		padding: 4px 8px;
		z-index: 20;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
		animation: pop-in 0.13s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.react-panel.own { right: auto; left: -8px; }
	@keyframes pop-in { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
	.rp-btn { font-size: 1.25rem; padding: 2px 4px; border-radius: 6px; transition: transform 0.12s; }
	.rp-btn:hover { transform: scale(1.3); }

	.reactions { display: flex; flex-wrap: wrap; gap: 3px; }
	.reactions.own { justify-content: flex-end; }
	.rpill {
		font-size: 0.72rem;
		padding: 2px 8px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.15s;
	}
	.rpill.mine { background: rgba(0, 240, 255, 0.12); border-color: rgba(0, 240, 255, 0.35); }

	.typing-bubble {
		display: flex;
		align-items: center;
		gap: 3px;
		background: rgba(19, 26, 38, 0.72);
		border: 1px solid rgba(0, 240, 255, 0.14);
		border-radius: 16px 16px 16px 4px;
		padding: 11px 15px;
	}
	.typing-bubble span { width: 5px; height: 5px; border-radius: 50%; background: var(--cyber-cyan, #00f0ff); opacity: 0.5; animation: tb 1.2s ease-in-out infinite; }
	.typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
	.typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
	@keyframes tb { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

	/* ── STICKER PICKER ──────────────────────────────────────────────────── */
	.sticker-picker {
		flex-shrink: 0;
		height: 250px;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(5, 8, 12, 0.98);
		display: flex;
		flex-direction: column;
	}
	.pack-tabs { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); overflow-x: auto; scrollbar-width: none; }
	.pack-tabs::-webkit-scrollbar { display: none; }
	.ptab { flex-shrink: 0; width: 38px; height: 38px; border-radius: 9px; overflow: hidden; padding: 3px; border: 2px solid transparent; transition: border-color 0.15s; }
	.ptab.active { border-color: var(--cyber-cyan, #00f0ff); }
	.ptab-img { width: 100%; height: 100%; object-fit: contain; }
	.sticker-grid {
		flex: 1;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		grid-auto-rows: 72px;
		gap: 6px;
		padding: 8px;
		align-content: start;
		scrollbar-width: thin;
		scrollbar-color: #1e293b transparent;
	}
	.sbtn { height: 72px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 4px; transition: background 0.15s; }
	.sbtn:hover { background: rgba(0, 240, 255, 0.08); }
	.simg { width: 64px; height: 64px; object-fit: contain; }

	/* ── INPUT ───────────────────────────────────────────────────────────── */
	.input-area {
		flex-shrink: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(9, 11, 17, 0.85);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.upload-bar { height: 2px; background: rgba(255, 255, 255, 0.05); }
	.upload-fill { height: 100%; background: var(--cyber-cyan, #00f0ff); box-shadow: 0 0 8px var(--cyber-cyan, #00f0ff); transition: width 0.2s; }

	.input-row { display: flex; align-items: flex-end; gap: 6px; padding: 9px 12px; }
	.tool {
		flex-shrink: 0;
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		border-radius: 10px;
		transition: color 0.2s, background 0.2s;
	}
	.tool:hover { color: #e2e8f0; background: rgba(255, 255, 255, 0.06); }
	.tool.active { color: var(--cyber-cyan, #00f0ff); background: rgba(0, 240, 255, 0.08); }
	.tool:disabled { opacity: 0.35; }
	.voice-tool:hover { color: var(--cyber-yellow, #fcee0a); }

	.input-field {
		flex: 1;
		padding: 0.6rem 0.75rem;
		background: rgba(255, 255, 255, 0.04);
		color: #e5edf5;
		resize: none;
		outline: none;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		font-size: 0.9rem;
		font-family: 'Inter', sans-serif;
		line-height: 1.4;
		transition: border-color 0.2s, background 0.2s;
		max-height: 120px;
		overflow-y: auto;
	}
	.input-field:focus { border-color: rgba(0, 240, 255, 0.4); background: rgba(0, 240, 255, 0.04); }
	.input-field::placeholder { color: #475569; }

	.send {
		flex-shrink: 0;
		width: 38px;
		height: 38px;
		background: var(--cyber-yellow, #fcee0a);
		color: #0a0a0a;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: box-shadow 0.2s, transform 0.1s;
	}
	.send:hover { box-shadow: 0 0 14px rgba(252, 238, 10, 0.5); }
	.send:active { transform: scale(0.92); }
	.send:disabled { background: #374151; color: #6b7280; box-shadow: none; }

	.rec-wrap { position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.rec-ring { position: absolute; border-radius: 50%; border: 1.5px solid var(--cyber-red, #ff003c); inset: 0; animation: ring-expand 1.8s ease-out infinite; }
	.rec-ring.r2 { animation-delay: 0.6s; }
	.rec-ring.r3 { animation-delay: 1.2s; }
	@keyframes ring-expand { 0% { transform: scale(0.4); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }
	.stop-btn { position: relative; z-index: 1; width: 26px; height: 26px; border-radius: 50%; background: var(--cyber-red, #ff003c); display: flex; align-items: center; justify-content: center; }
	.stop-sq { width: 9px; height: 9px; background: white; border-radius: 2px; }

	.channels-mobile-bar { display: none; }

	/* ── MOBILE: master-detail вместо display:none ───────────────────────── */
	@media (max-width: 768px) {
		.sidebar { width: 100%; }
		.channels-mobile-bar {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.6rem 0.9rem;
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(9, 11, 17, 0.9);
			flex-shrink: 0;
		}
		.cmb-title {
			font-family: 'Chakra Petch', monospace;
			font-size: 0.72rem;
			letter-spacing: 0.15em;
			color: var(--cyber-cyan, #00f0ff);
		}
		.main-area {
			position: absolute;
			inset: 0;
			background: #060609;
			transform: translateX(100%);
			transition: transform 0.25s ease;
			z-index: 30;
		}
		/* Когда чат открыт ИЛИ выбраны каналы — показываем правую панель */
		.page.has-active .main-area { transform: translateX(0); }
		.back-btn { display: flex; }
		.close-chat-btn { display: none; }
		.bubble-wrap { max-width: 78%; }
	}

	@media (prefers-reduced-motion: reduce) {
		.ph-ring, .rec-ring, .typing-bubble span, .vs-play, .vs-bars span { animation: none !important; }
		.main-area { transition: none; }
	}
</style>