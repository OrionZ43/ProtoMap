<!-- src/lib/components/chat/GlobalChat.svelte -->
<!-- Бывший ChatWidget.svelte — глобальный чат без изменений логики -->
<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { db } from '$lib/firebase';
    import { collection, query, orderBy, limit, onSnapshot, where, type Unsubscribe, type Timestamp } from 'firebase/firestore';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { userStore } from '$lib/stores';
    import { modal } from '$lib/stores/modalStore';
    import { AudioManager } from '$lib/client/audioManager';
    import { t, locale } from 'svelte-i18n';
    import { get } from 'svelte/store';
    import { usernameCache, getUsername, getAvatarUrl } from '$lib/stores/usernameCache';
    import { chat } from '$lib/stores';

    type ReplyInfo = { author_username: string; text: string; };
    type ChatMessage = {
        id: string; text: string; author_uid: string; author_username: string;
        author_avatar_url: string; createdAt: Date; replyTo?: ReplyInfo;
        image?: boolean; voiceMessage?: boolean; replyToImage?: boolean;
        replyToVoiceMessage?: boolean; author_equipped_frame?: string | null; lang?: string;
    };

    let messages: ChatMessage[] = [];
    let isLoading = true;
    let isLoadingMore = false;
    let unsubscribe: Unsubscribe | null = null;
    let messagesWindow: HTMLDivElement;
    let messageText = '';
    let isSending = false;
    let canSendMessage = true;
    const cooldownSeconds = 3;
    let replyingTo: any = null;
    let inputElement: HTMLTextAreaElement;
    let messagesLimit = 20;
    let chatLang = 'ru';
    let reachedEnd = false;
    let lastReadTime = 0;

    onMount(() => {
        const stored = localStorage.getItem('protomap_last_read_chat');
        if (stored) lastReadTime = parseInt(stored, 10);
        else lastReadTime = Date.now();

        // locale.subscribe вызовет initChatSubscription сам при монтировании —
        // не нужен отдельный вызов, иначе будет двойная Firestore подписка
        let first = true;
        const unsubscribeLocale = locale.subscribe(val => {
            if (val) {
                const lang = val.substring(0, 2);
                if (first || lang !== chatLang) {
                    first = false;
                    chatLang = lang;
                    initChatSubscription(chatLang);
                }
            }
        });
        return () => { if (unsubscribe) unsubscribe(); unsubscribeLocale(); };
    });

    // Скролл при открытии вкладки
    export function onTabActivated() {
        tick().then(() => scrollToTarget());
        chat.setUnread(false);
    }

    function switchChatLang(lang: string) {
        if (chatLang === lang) return;
        chatLang = lang; messagesLimit = 20; reachedEnd = false;
        initChatSubscription(chatLang);
    }

    function loadMore() {
        if (isLoadingMore || reachedEnd) return;
        isLoadingMore = true; messagesLimit += 20;
        initChatSubscription(chatLang);
    }

    function initChatSubscription(lang: string) {
        if (unsubscribe) unsubscribe();
        isLoading = true;
        const q = query(
            collection(db, "global_chat"),
            where("lang", "==", lang),
            orderBy("createdAt", "desc"),
            limit(messagesLimit)
        );
        unsubscribe = onSnapshot(q, async (querySnapshot) => {
            const newMessages = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id, text: data.text || '',
                    author_uid: data.author_uid || '',
                    author_username: data.author_username || 'unknown',
                    author_avatar_url: data.author_avatar_url || '',
                    createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
                    replyTo: data.replyTo, image: data.image || false,
                    voiceMessage: data.voiceMessage || false,
                    replyToImage: data.replyToImage || false,
                    replyToVoiceMessage: data.replyToVoiceMessage || false,
                    author_equipped_frame: data.author_equipped_frame || null
                };
            }).filter(msg => msg.createdAt).reverse();

            if (newMessages.length < messagesLimit) reachedEnd = true;
            if (newMessages.length > 0) {
                const lastMsg = newMessages[newMessages.length - 1];
                if (!$chat.isOpen && lastMsg.createdAt.getTime() > lastReadTime) {
                    chat.setUnread(true);
                    AudioManager.play('message');
                }
            }
            const wasLoading = isLoading;
            messages = newMessages; isLoading = false; isLoadingMore = false;
            await tick();
            if (wasLoading && $chat.isOpen) scrollToTarget();
        }, (error) => { console.error(error); isLoading = false; isLoadingMore = false; });
    }

    function scrollToTarget() {
        if (!messagesWindow) return;
        const unreadMarker = document.getElementById('unread-marker');
        if (unreadMarker) unreadMarker.scrollIntoView({ block: 'center', behavior: 'auto' });
        else messagesWindow.scrollTop = messagesWindow.scrollHeight;
    }

    async function sendMessage() {
        if (isSending || !canSendMessage || !messageText.trim()) return;
        const currentUser = $userStore.user;
        if (!currentUser) { modal.error(get(t)('ui.error'), get(t)('chat.login_req')); return; }
        isSending = true; canSendMessage = false;
        try {
            const functions = getFunctions();
            await httpsCallable(functions, 'sendMessage')({
                text: messageText.trim(),
                replyTo: replyingTo ? { author_username: replyingTo.author_username, text: replyingTo.text } : null,
                lang: chatLang
            });
            AudioManager.play('message');
            messageText = ''; replyingTo = null;
            lastReadTime = Date.now();
            localStorage.setItem('protomap_last_read_chat', lastReadTime.toString());
            setTimeout(() => { canSendMessage = true; }, cooldownSeconds * 1000);
            await tick();
            if (messagesWindow) messagesWindow.scrollTop = messagesWindow.scrollHeight;
        } catch (e) { canSendMessage = true; } finally { isSending = false; }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
    }

    function setReplyTo(message: ChatMessage) {
        let quoteText = message.text; let isMedia = false;
        if (message.image) { quoteText = '[Изображение]'; isMedia = true; }
        else if (message.voiceMessage) { quoteText = '[Голосовое сообщение]'; isMedia = true; }
        replyingTo = { id: message.id, author_username: message.author_username, text: quoteText, isMedia };
        inputElement?.focus();
    }

    function isSameDay(d1: Date, d2: Date) {
        if (!d1 || !d2) return false;
        return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    }

    function formatDateSeparator(date: Date) {
        const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(date, today)) return get(t)('profile.time.today');
        if (isSameDay(date, yesterday)) return get(t)('profile.time.yesterday');
        return date.toLocaleDateString(get(locale), { day: 'numeric', month: 'long' });
    }
</script>

<!-- Переключалка языка -->
<div class="lang-bar">
    <div class="chat-lang-toggle">
        <button class:active={chatLang === 'ru'} on:click={() => switchChatLang('ru')}>RU</button>
        <button class:active={chatLang === 'en'} on:click={() => switchChatLang('en')}>EN</button>
    </div>
</div>

<div class="messages-window" bind:this={messagesWindow}>
    {#if isLoading && !isLoadingMore}
        <p class="status-text animate-pulse">{$t('ui.loading')}</p>
    {:else}
        {#if !reachedEnd && messages.length >= 20}
            <button class="load-more-btn" on:click={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? "..." : $t('chat.load_more')}
            </button>
        {:else if messages.length > 0}
            <p class="reached-end-text">{$t('chat.no_more')}</p>
        {/if}

        {#if messages.length === 0}
            <div class="empty-chat"><p class="status-text">{$t('chat.empty')}</p></div>
        {:else}
            {#each messages as msg, i (msg.id)}
                {@const prevMsg = messages[i - 1]}
                {@const isUnread = msg.createdAt.getTime() > lastReadTime}
                {@const isFirstUnread = isUnread && (i === 0 || messages[i - 1].createdAt.getTime() <= lastReadTime)}
                {@const displayName = msg.author_uid ? getUsername($usernameCache, msg.author_uid, msg.author_username) : msg.author_username}
                {@const displayAvatar = msg.author_uid ? getAvatarUrl($usernameCache, msg.author_uid, msg.author_avatar_url) : msg.author_avatar_url}

                {#if i === 0 || !isSameDay(msg.createdAt, prevMsg.createdAt)}
                    <div class="date-separator"><span>{formatDateSeparator(msg.createdAt)}</span></div>
                {/if}
                {#if isFirstUnread}
                    <div class="unread-separator" id="unread-marker">
                        <span class="line"></span><span class="text">NEW SIGNALS</span><span class="line"></span>
                    </div>
                {/if}

                <div class="message-card" class:own-message={msg.author_uid === $userStore.user?.uid}>
                    <a href={msg.author_uid ? `/u/${msg.author_uid}` : `/profile/${msg.author_username}`} class="shrink-0">
                        <div class="avatar-container comment-avatar-wrapper {msg.author_equipped_frame || ''}">
                            <img src={displayAvatar || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${msg.author_username}`} alt={displayName} class="message-avatar" />
                        </div>
                    </a>
                    <div class="message-content-wrapper">
                        <a href={msg.author_uid ? `/u/${msg.author_uid}` : `/profile/${msg.author_username}`} class="message-author">{displayName}</a>
                        <div class="message-body">
                            {#if msg.replyTo}
                                <div class="reply-quote">
                                    <strong>{msg.replyTo.author_username}:</strong>
                                    {#if msg.replyToImage}<span class="text-cyber-cyan italic">[Изображение]</span>
                                    {:else if msg.replyToVoiceMessage}<span class="text-cyber-yellow italic">[Голосовое]</span>
                                    {:else}{msg.replyTo.text}{/if}
                                </div>
                            {/if}
                            {#if msg.image}
                                <div class="mobile-exclusive image"><div class="icon">🖼️</div><div class="info"><span class="title">ИЗОБРАЖЕНИЕ</span><span class="subtitle">Доступно в приложении</span></div></div>
                            {:else if msg.voiceMessage}
                                <div class="mobile-exclusive voice"><div class="icon">🎙️</div><div class="info"><span class="title">ГОЛОСОВОЕ</span><span class="subtitle">Доступно в приложении</span></div></div>
                            {:else}
                                <p class="message-text">{msg.text}</p>
                            {/if}
                            <span class="message-time-inline">{msg.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div class="message-meta">
                            {#if $userStore.user}
                                <button on:click={() => setReplyTo(msg)} class="action-btn">{$t('chat.reply')}</button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        {/if}
    {/if}
</div>

<div class="message-input-area">
    {#if $userStore.user}
        <div class="input-wrapper">
            {#if replyingTo}
                <div class="replying-to-banner">
                    <span>Ответ на: <span class="font-bold">{replyingTo.author_username}</span></span>
                    <button on:click={() => replyingTo = null}>&times;</button>
                </div>
            {/if}
            <textarea bind:this={inputElement} bind:value={messageText} on:keydown={handleKeydown}
                maxlength="1000" disabled={isSending || !canSendMessage}
                placeholder={!canSendMessage ? $t('chat.wait') : $t('chat.placeholder')}
                class="input-field"></textarea>
        </div>
        <button on:click={sendMessage} disabled={isSending || !canSendMessage || !messageText.trim()} class="send-button">
            {#if isSending}
                <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
            {/if}
        </button>
    {:else}
        <p class="w-full text-center text-gray-400 text-sm"><a href="/login" class="text-cyber-yellow hover:underline">{$t('chat.login_req')}</a></p>
    {/if}
</div>

<style>
    .lang-bar { padding: 0.4rem 0.75rem 0; display: flex; }
    .messages-window { flex-grow: 1; padding: 1rem; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; scrollbar-width: thin; scrollbar-color: var(--cyber-yellow) transparent; }
    .status-text { margin: auto; text-align: center; color: #64748b; font-family: monospace; font-size: 0.75rem; text-transform: uppercase; }
    .message-card { display: flex; align-items: flex-start; gap: 0.75rem; width: 100%; margin-bottom: 1rem; }
    .own-message { flex-direction: row-reverse; }
    .avatar-container { position: relative; width: 40px; height: 40px; flex-shrink: 0; margin-top: 4px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
    .message-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    .message-content-wrapper { display: flex; flex-direction: column; max-width: 85%; }
    .own-message .message-content-wrapper { align-items: flex-end; }
    .message-author { font-weight: bold; color: white; font-size: 0.875rem; margin-bottom: 0.25rem; padding: 0 0.5rem; text-decoration: none; }
    .message-author:hover { text-decoration: underline; }
    .own-message .message-author { color: var(--cyber-yellow); }
    .message-body { position: relative; padding: 0.75rem; padding-bottom: 1.75rem; border-radius: 0.375rem; background: rgba(31,41,55,0.5); border: 1px solid rgba(75,85,99,0.5); }
    .reply-quote { display: block; font-size: 0.75rem; margin-bottom: 0.5rem; border-left: 2px solid rgba(255,255,255,0.3); padding-left: 0.5rem; color: rgba(255,255,255,0.5); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .message-text { color: #e2e8f0; white-space: pre-wrap; word-break: break-words; max-height: 300px; overflow-y: auto; }
    .message-time-inline { position: absolute; bottom: 0.25rem; right: 0.5rem; font-size: 0.65rem; color: #6b7280; }
    .message-meta { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; font-size: 0.75rem; color: #6b7280; }
    .action-btn { transition: color 0.2s; } .action-btn:hover { color: white; }
    .message-input-area { padding: 0.5rem; border-top: 1px solid rgba(55,65,81,0.5); display: flex; gap: 0.5rem; flex-shrink: 0; align-items: flex-end; }
    .input-wrapper { width: 100%; display: flex; flex-direction: column; }
    .replying-to-banner { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; padding: 0.5rem; background: rgba(55,65,81,0.5); border-radius: 0.375rem 0.375rem 0 0; color: #d1d5db; }
    .replying-to-banner button { font-weight: bold; font-size: 1.125rem; line-height: 1; }
    .input-field { width: 100%; padding: 0.5rem; background: rgba(31,41,55,0.7); color: #e2e8f0; resize: none; outline: none; border: 1px solid transparent; border-radius: 0.375rem; transition: border-color 0.2s; }
    .input-field:focus { border-color: var(--cyber-yellow); }
    .input-field:disabled { opacity: 0.5; cursor: wait; }
    .send-button { padding: 0.5rem 0.75rem; background: var(--cyber-yellow); color: black; font-weight: bold; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; aspect-ratio: 1; }
    .send-button:disabled { background: #4b5563; color: #9ca3af; opacity: 0.5; cursor: not-allowed; }
    .date-separator { display: flex; justify-content: center; align-items: center; margin: 1rem 0; }
    .date-separator span { font-size: 0.65rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; background: rgba(31,41,55,0.5); padding: 0.25rem 0.75rem; border-radius: 9999px; }
    .mobile-exclusive { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px; font-family: 'Chakra Petch', monospace; min-width: 180px; }
    .mobile-exclusive.image { border-color: var(--cyber-cyan); background: rgba(0,240,255,0.05); }
    .mobile-exclusive.voice { border-color: var(--cyber-yellow); background: rgba(252,238,10,0.05); }
    .mobile-exclusive .icon { font-size: 1rem; }
    .mobile-exclusive .info { display: flex; flex-direction: column; }
    .mobile-exclusive .title { font-weight: bold; font-size: 0.75rem; color: #fff; }
    .mobile-exclusive .subtitle { font-size: 0.6rem; color: rgba(255,255,255,0.6); }
    .chat-lang-toggle { display: flex; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px; }
    .chat-lang-toggle button { font-size: 0.65rem; font-weight: 800; padding: 2px 6px; border-radius: 2px; color: #555; transition: all 0.2s; }
    .chat-lang-toggle button.active { background: var(--cyber-yellow); color: #000; box-shadow: 0 0 5px var(--cyber-yellow); }
    .load-more-btn { width: 100%; padding: 0.5rem 0; font-size: 0.625rem; font-weight: bold; letter-spacing: 0.1em; color: #6b7280; text-transform: uppercase; margin-bottom: 1rem; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); }
    .load-more-btn:hover { color: white; }
    .reached-end-text { width: 100%; text-align: center; padding: 1rem 0; font-size: 0.5625rem; color: #374151; text-transform: uppercase; letter-spacing: 0.1em; }
    .empty-chat { margin: auto; text-align: center; padding: 1.5rem; }
    .unread-separator { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 1rem 0; animation: flash-red 2s infinite; }
    .unread-separator .line { flex-grow: 1; height: 1px; background: #ff003c; }
    .unread-separator .text { color: #ff003c; font-size: 0.6rem; font-weight: bold; letter-spacing: 0.2em; white-space: nowrap; }
    @keyframes flash-red { 0%,100%{opacity:0.6} 50%{opacity:1} }
</style>