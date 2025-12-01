<script lang="ts">
    import { onMount, onDestroy, afterUpdate } from 'svelte';
    import { db } from '$lib/firebase';
    import { collection, query, orderBy, limit, onSnapshot, type Unsubscribe, type Timestamp } from 'firebase/firestore';
    import { getFunctions, httpsCallable } from 'firebase/functions';
    import { userStore, chat } from '$lib/stores';
    import { modal } from '$lib/stores/modalStore';
    import { slide, fade } from 'svelte/transition';
    import { AudioManager } from '$lib/client/audioManager';

    type ReplyInfo = {
        author_username: string;
        text: string;
    };

    type ChatMessage = {
        id: string;
        text: string;
        author_uid: string;
        author_username: string;
        author_avatar_url: string;
        createdAt: Date;
        replyTo?: ReplyInfo;
        image?: boolean;
        voiceMessage?: boolean;
        replyToImage?: boolean;
        replyToVoiceMessage?: boolean;
        author_equipped_frame?: string | null;
    };

    let messages: ChatMessage[] = [];
    let isLoading = true;
    let unsubscribe: Unsubscribe | null = null;
    let messagesWindow: HTMLDivElement;

    let messageText = '';
    let isSending = false;
    let canSendMessage = true;
    const cooldownSeconds = 3;

    let replyingTo: { id: string; author_username: string; text: string; isMedia?: boolean } | null = null;
    let inputElement: HTMLTextAreaElement;

    $: isVerified = $userStore.user?.emailVerified ?? false;

    async function sendMessage() {
        if (isSending || !canSendMessage) return;
        if (!messageText.trim()) return;

        const currentUser = $userStore.user;
        if (!currentUser) {
            modal.error("Ошибка", "Необходимо войти в систему, чтобы отправлять сообщения.");
            return;
        }

        isSending = true;
        canSendMessage = false;

        const textToSend = messageText.trim();

        let replyData = null;
        if (replyingTo) {
            replyData = {
                author_username: replyingTo.author_username,
                text: replyingTo.text
            };
        }

        try {
            const functions = getFunctions();
            const sendMessageFunc = httpsCallable(functions, 'sendMessage');

            await sendMessageFunc({
                text: textToSend,
                replyTo: replyData
            });

            AudioManager.play('message');
            messageText = '';
            replyingTo = null;

            setTimeout(() => { canSendMessage = true; }, cooldownSeconds * 1000);

        } catch (error: any) {
            console.error("Ошибка отправки:", error);
            const msg = error.message || "Не удалось отправить сообщение.";

            if (msg.includes('Охладите')) {
                modal.warning("Спам-фильтр", "Вы пишете слишком часто. Подождите немного.");
            } else if (msg.includes('заблокированы') || msg.includes('permission-denied')) {
                modal.error("БАН", "Доступ к чату ограничен. Проверьте статус аккаунта.");
            } else {
                modal.error("Ошибка связи", msg);
            }

            if (!msg.includes('Охладите')) {
                canSendMessage = true;
            } else {
                setTimeout(() => { canSendMessage = true; }, cooldownSeconds * 1000);
            }
        } finally {
            isSending = false;
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    }

    function setReplyTo(message: ChatMessage) {
        let quoteText = message.text;
        let isMedia = false;

        if (message.image) { quoteText = '[Изображение]'; isMedia = true; }
        else if (message.voiceMessage) { quoteText = '[Голосовое сообщение]'; isMedia = true; }

        replyingTo = {
            id: message.id,
            author_username: message.author_username,
            text: quoteText,
            isMedia
        };
        inputElement?.focus();
    }

    function isSameDay(date1: Date, date2: Date): boolean {
        if (!date1 || !date2) return false;
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    function formatDateSeparator(date: Date): string {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(date, today)) return 'Сегодня';
        if (isSameDay(date, yesterday)) return 'Вчера';
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }

    onMount(() => {
        const q = query(collection(db, "global_chat"), orderBy("createdAt", "desc"), limit(50));
        unsubscribe = onSnapshot(q, (querySnapshot) => {
            messages = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    text: data.text || '',
                    author_uid: data.author_uid || '',
                    author_username: data.author_username || 'unknown',
                    author_avatar_url: data.author_avatar_url || '',
                    createdAt: (data.createdAt as Timestamp)?.toDate(),
                    replyTo: data.replyTo,
                    image: data.image || false,
                    voiceMessage: data.voiceMessage || false,
                    replyToImage: data.replyToImage || false,
                    replyToVoiceMessage: data.replyToVoiceMessage || false,
                    author_equipped_frame: data.author_equipped_frame || null
                };
            }).filter(msg => msg.createdAt).reverse();
            isLoading = false;
        }, (error) => {
            console.error("Ошибка real-time подписки на чат:", error);
            isLoading = false;
        });
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    afterUpdate(() => {
        if (messagesWindow) messagesWindow.scrollTo({ top: messagesWindow.scrollHeight, behavior: 'smooth' });
    });

    function closeChat() {
        chat.close();
        AudioManager.play('popup_close');
    }
</script>

{#if $chat.isOpen}
    <div class="chat-widget" transition:slide={{ duration: 300, x: 100, y: 100 }}>
        <div class="widget-header">
            <h3 class="font-display">// ОБЩИЙ ЧАТ</h3>
            <button on:click={closeChat} class="close-btn" aria-label="Закрыть чат">&times;</button>
        </div>

        <div class="messages-window" bind:this={messagesWindow}>
            {#if isLoading}
                <p class="status-text">ЗАГРУЗКА СООБЩЕНИЙ СЕТИ...</p>
            {:else if messages.length === 0}
                <p class="status-text">СИГНАЛОВ НЕ ОБНАРУЖЕНО. НАЧНИТЕ ДИАЛОГ.</p>
            {:else}
                {#each messages as msg, i (msg.id)}
                    {@const prevMsg = messages[i - 1]}

                    {#if i === 0 || !isSameDay(msg.createdAt, prevMsg.createdAt)}
                        <div class="date-separator"><span>{formatDateSeparator(msg.createdAt)}</span></div>
                    {/if}

                    <div class="message-card" class:own-message={msg.author_uid === $userStore.user?.uid} transition:fade>
                        <a href={`/profile/${msg.author_username}`} class="shrink-0" title={msg.author_username}>
                            <div class="avatar-container comment-avatar-wrapper {msg.author_equipped_frame || ''}">
                                <img
                                    src={msg.author_avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${msg.author_username}`}
                                    alt={msg.author_username}
                                    class="message-avatar"
                                />
                            </div>
                        </a>

                        <div class="message-content-wrapper">
                            <a href={`/profile/${msg.author_username}`} class="message-author">{msg.author_username}</a>

                            <div class="message-body">
                                {#if msg.replyTo}
                                    <div class="reply-quote">
                                        <strong>{msg.replyTo.author_username}:</strong>
                                        {#if msg.replyToImage} <span class="text-cyber-cyan italic">[Изображение]</span>
                                        {:else if msg.replyToVoiceMessage} <span class="text-cyber-yellow italic">[Голосовое]</span>
                                        {:else} {msg.replyTo.text} {/if}
                                    </div>
                                {/if}

                                {#if msg.image}
                                    <div class="mobile-exclusive image">
                                        <div class="icon">🖼️</div>
                                        <div class="info"><span class="title">ИЗОБРАЖЕНИЕ</span><span class="subtitle">Доступно в приложении</span></div>
                                    </div>
                                {:else if msg.voiceMessage}
                                    <div class="mobile-exclusive voice">
                                        <div class="icon">🎙️</div>
                                        <div class="info"><span class="title">ГОЛОСОВОЕ</span><span class="subtitle">Доступно в приложении</span></div>
                                    </div>
                                {:else}
                                    <p class="message-text">{msg.text}</p>
                                {/if}

                                <span class="message-time-inline">{msg.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>

                            <div class="message-meta">
                                {#if $userStore.user}
                                    <div class="message-actions">
                                        <button on:click={() => setReplyTo(msg)} class="action-btn">Ответить</button>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>

        <div class="message-input-area">
            {#if $userStore.user}
                {#if isVerified}
                    <!-- ОБЫЧНЫЙ ВВОД (Если подтвержден) -->
                    <div class="input-wrapper">
                        {#if replyingTo}
                            <div class="replying-to-banner" transition:slide={{duration: 200}}>
                                <span>Ответ на: <span class="font-bold">{replyingTo.author_username}</span></span>
                                <button on:click={() => replyingTo = null}>&times;</button>
                            </div>
                        {/if}
                        <textarea
                            bind:this={inputElement}
                            bind:value={messageText}
                            on:keydown={handleKeydown}
                            maxlength="1000"
                            disabled={isSending || !canSendMessage}
                            placeholder={!canSendMessage ? 'Подождите...' : 'Введите сообщение...'}
                            class="input-field"
                        ></textarea>
                    </div>
                    <button on:click={sendMessage} disabled={isSending || !canSendMessage || !messageText.trim()} class="send-button">
                        {#if isSending}
                             <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        {:else}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
                        {/if}
                    </button>
                {:else}
                    <!-- ЗАГЛУШКА (Если НЕ подтвержден) -->
                    <div class="w-full text-center py-2 bg-red-900/20 border border-red-500/30 rounded text-xs">
                        <span class="text-red-400 block mb-1">⚠️ ДОСТУП ОГРАНИЧЕН</span>
                        <a href="/profile/{$userStore.user.username}" class="text-cyber-yellow hover:underline font-bold">
                            ПОДТВЕРДИТЕ EMAIL
                        </a>
                        <span class="text-gray-400"> для доступа к чату</span>
                    </div>
                {/if}
            {:else}
                <p class="w-full text-center text-gray-400 text-sm"><a href="/login" class="text-cyber-yellow hover:underline">Войдите</a>, чтобы общаться в чате.</p>
            {/if}
        </div>
    </div>
{/if}

<style>
    .chat-widget {
        @apply fixed bottom-4 right-4 z-40 flex flex-col;
        width: calc(100vw - 2rem); height: 75vh; max-width: 420px; max-height: 650px;
        @apply bg-black/80 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl;
        clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
    }
    .widget-header { @apply flex justify-between items-center p-3 border-b border-gray-700/50 shrink-0; }
    .widget-header h3 { @apply text-cyber-yellow uppercase tracking-widest text-sm; }
    .close-btn { @apply text-3xl text-gray-400 hover:text-white leading-none p-1; transition: transform 0.2s; }
    .close-btn:hover { transform: rotate(90deg); }
    .messages-window { @apply flex-grow p-4 overflow-y-auto flex flex-col gap-4; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: var(--cyber-yellow) transparent; }
    .status-text { @apply m-auto text-center text-gray-500 font-mono text-sm uppercase; }

    .message-card { @apply flex items-start gap-3 w-full; }
    .own-message { @apply flex-row-reverse; }

    .avatar-container {
        position: relative; width: 40px; height: 40px; flex-shrink: 0; margin-top: 4px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
    }
    .message-avatar {
        width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
        border: none !important;
    }

    .message-content-wrapper { @apply flex flex-col max-w-[85%] sm:max-w-[75%]; }
    .own-message .message-content-wrapper { @apply items-end; }
    .message-author { @apply font-bold text-white text-sm hover:underline mb-1 px-2; }
    .own-message .message-author { @apply text-cyber-yellow; }

    .message-body { @apply relative p-3 rounded-md; background: rgba(31, 41, 55, 0.5); border: 1px solid rgba(75, 85, 99, 0.5); padding-bottom: 1.75rem; }
    .reply-quote { @apply block text-xs mb-2 border-l-2 pl-2 truncate; border-color: rgba(255, 255, 255, 0.3); color: rgba(255, 255, 255, 0.5); max-width: 200px; }
    .message-text { @apply text-gray-200 whitespace-pre-wrap break-words; max-height: 300px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--cyber-yellow) transparent; }
    .message-meta { @apply flex items-center justify-end gap-3 mt-2 text-xs text-gray-500; }
    .action-btn { @apply hover:text-white transition-colors; }

    .message-input-area { @apply p-2 border-t border-gray-700/50 flex gap-2 shrink-0 items-end; }
    .input-wrapper { @apply w-full flex flex-col; }
    .replying-to-banner { @apply flex justify-between items-center text-xs p-2 bg-gray-700/50 rounded-t-md text-gray-300; }
    .replying-to-banner button { @apply font-bold text-lg leading-none; }
    .input-field { @apply w-full p-2 bg-gray-800/70 text-gray-200 resize-none outline-none border border-transparent focus:border-cyber-yellow; transition: border-color 0.2s; border-radius: 0.375rem; }
    .replying-to-banner + .input-field { border-top-left-radius: 0; border-top-right-radius: 0; }
    .input-field:disabled { @apply opacity-50 cursor-wait; }
    .send-button { @apply px-3 py-2 bg-cyber-yellow text-black font-bold rounded-md font-display uppercase tracking-wider h-auto shrink-0; @apply flex items-center justify-center; aspect-ratio: 1 / 1; }
    .send-button:disabled { @apply bg-gray-600 text-gray-400 opacity-50 cursor-not-allowed; }

    .date-separator { @apply flex justify-center items-center my-4; }
    .date-separator span { @apply text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full; }

    .messages-window::-webkit-scrollbar { width: 8px; }
    .messages-window::-webkit-scrollbar-track { background: transparent; }
    .messages-window::-webkit-scrollbar-thumb { background-color: var(--cyber-yellow, #fcee0a); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
    .messages-window::-webkit-scrollbar-thumb:hover { background-color: #ffff00; }
    .message-time-inline { @apply absolute bottom-1 right-2 text-xs text-gray-500; }

    .mobile-exclusive { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(0, 0, 0, 0.3); border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: 6px; font-family: 'Chakra Petch', monospace; min-width: 200px; }
    .mobile-exclusive.image { border-color: var(--cyber-cyan); background: rgba(0, 240, 255, 0.05); }
    .mobile-exclusive.voice { border-color: var(--cyber-yellow); background: rgba(252, 238, 10, 0.05); }
    .mobile-exclusive .icon { font-size: 1.2rem; }
    .mobile-exclusive .info { display: flex; flex-direction: column; }
    .mobile-exclusive .title { font-weight: bold; font-size: 0.8rem; color: #fff; letter-spacing: 0.05em; }
    .mobile-exclusive .subtitle { font-size: 0.65rem; color: rgba(255, 255, 255, 0.6); }
</style>