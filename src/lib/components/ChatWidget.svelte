<script lang="ts">
    import { onMount, onDestroy, afterUpdate } from 'svelte';
    import { db } from '$lib/firebase';
    import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, type Unsubscribe, type Timestamp } from 'firebase/firestore';
    import { userStore, chat } from '$lib/stores';
    import { modal } from '$lib/stores/modalStore';
    import { slide, fade } from 'svelte/transition';

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
    };

    let messages: ChatMessage[] = [];
    let isLoading = true;
    let unsubscribe: Unsubscribe | null = null;
    let messagesWindow: HTMLDivElement;

    let messageText = '';
    let isSending = false;
    let canSendMessage = true;
    const cooldownSeconds = 5;
    let replyingTo: { id: string; author_username: string; text: string } | null = null;
    let inputElement: HTMLTextAreaElement;

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
        messageText = '';

        try {
            const newMessage: any = {
                text: textToSend,
                author_uid: currentUser.uid,
                author_username: currentUser.username,
                author_avatar_url: currentUser.avatar_url || '',
                createdAt: serverTimestamp()
            };

            if (replyingTo) {
                newMessage.replyTo = {
                    author_username: replyingTo.author_username,
                    text: replyingTo.text
                };
                replyingTo = null;
            }

            await addDoc(collection(db, "global_chat"), newMessage);

            setTimeout(() => {
                canSendMessage = true;
            }, cooldownSeconds * 1000);

        } catch (error: any) {
            modal.error("Ошибка", `Не удалось отправить сообщение: ${error.message}`);
            messageText = textToSend;
            canSendMessage = true;
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
        replyingTo = {
            id: message.id,
            author_username: message.author_username,
            text: message.text
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
                    replyTo: data.replyTo
                };
            }).filter(msg => msg.createdAt).reverse();
            isLoading = false;
        }, (error) => {
            console.error("Ошибка real-time подписки на чат:", error);
            isLoading = false;
        });
    });

    onDestroy(() => {
        if (unsubscribe) {
            unsubscribe();
        }
    });

    afterUpdate(() => {
        if (messagesWindow) {
            messagesWindow.scrollTo({ top: messagesWindow.scrollHeight, behavior: 'smooth' });
        }
    });
</script>

{#if $chat.isOpen}
    <div
        class="chat-widget"
        transition:slide={{ duration: 300, x: 100, y: 100 }}
    >
        <div class="widget-header">
            <h3 class="font-display">// ОБЩИЙ ЧАТ</h3>
            <button on:click={chat.close} class="close-btn" aria-label="Закрыть чат">&times;</button>
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
                        <div class="date-separator">
                            <span>{formatDateSeparator(msg.createdAt)}</span>
                        </div>
                    {/if}

                    <div class="message-card" class:own-message={msg.author_uid === $userStore.user?.uid} transition:fade>
                        <a href={`/profile/${msg.author_username}`} class="shrink-0" title={msg.author_username}>
                            <img
                                src={msg.author_avatar_url || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${msg.author_username}`}
                                alt={msg.author_username}
                                class="message-avatar"
                            />
                        </a>

                        <div class="message-content-wrapper">
                            <a href={`/profile/${msg.author_username}`} class="message-author">{msg.author_username}</a>

                            <div class="message-body">
                                {#if msg.replyTo}
                                    <div class="reply-quote">
                                        <strong>{msg.replyTo.author_username}:</strong> {msg.replyTo.text}
                                    </div>
                                {/if}
                                <p class="message-text">{msg.text}</p>
                                <span class="message-time-inline">
                                    {msg.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>

                            <div class="message-meta">
                                {#if $userStore.user}
                                    <div class="message-actions">
                                        <button on:click={() => setReplyTo(msg)} class="action-btn">
                                            Ответить
                                        </button>
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
                        disabled={isSending || !canSendMessage}
                        placeholder={!canSendMessage ? 'Подождите...' : 'Введите сообщение...'}
                        class="input-field"
                    ></textarea>
                </div>
                <button
                    on:click={sendMessage}
                    disabled={isSending || !canSendMessage || !messageText.trim()}
                    class="send-button"
                >
                    {#if isSending}
                         <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
                    {/if}
                </button>
            {:else}
                <p class="w-full text-center text-gray-400 text-sm">
                    <a href="/login" class="text-cyber-yellow hover:underline">Войдите</a>, чтобы общаться в чате.
                </p>
            {/if}
        </div>
    </div>
{/if}

<style>
    .chat-widget {
        @apply fixed bottom-4 right-4 z-40 flex flex-col;
        width: calc(100vw - 2rem);
        height: 75vh;
        max-width: 420px;
        max-height: 650px;
        @apply bg-black/80 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl;
        clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
    }

    .widget-header {
        @apply flex justify-between items-center p-3 border-b border-gray-700/50 shrink-0;
    }

    .widget-header h3 {
        @apply text-cyber-yellow uppercase tracking-widest text-sm;
    }

    .close-btn {
        @apply text-3xl text-gray-400 hover:text-white leading-none p-1;
        transition: transform 0.2s;
    }
    .close-btn:hover {
        transform: rotate(90deg);
    }

    .messages-window {
        @apply flex-grow p-4 overflow-y-auto flex flex-col gap-4;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: var(--cyber-yellow) transparent;
    }

    .status-text {
        @apply m-auto text-center text-gray-500 font-mono text-sm uppercase;
    }

    .message-wrapper {
        @apply relative;
        transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .reply-swipe-icon {
        @apply absolute top-0 h-full w-16 flex items-center justify-center text-white opacity-0;
        transition: opacity 0.2s ease;
    }
    .reply-swipe-icon.left {
        left: 0;
        transform: translateX(-100%);
    }
    .reply-swipe-icon.right {
        right: 0;
        transform: translateX(100%);
    }
    .reply-swipe-icon.visible {
        opacity: 1;
    }

    .message-card {
        @apply flex items-start gap-3 w-full;
    }
    .own-message {
        @apply flex-row-reverse;
    }

    .message-avatar {
        @apply w-10 h-10 rounded-full object-cover border-2 border-gray-700 mt-1 shrink-0;
    }

    .message-content-wrapper {
        @apply flex flex-col max-w-[85%] sm:max-w-[75%];
    }
    .own-message .message-content-wrapper {
        @apply items-end;
    }

    .message-author {
        @apply font-bold text-white text-sm hover:underline mb-1 px-2;
    }
    .own-message .message-author {
        @apply text-cyber-yellow;
    }

    .message-body {
        @apply relative p-3 rounded-md;
        background: rgba(31, 41, 55, 0.5);
        border: 1px solid rgba(75, 85, 99, 0.5);
    }

    .message-body::before {
        content: '';
        @apply absolute top-2 w-2 h-4;
        left: -8px;
        background-color: var(--cyber-cyan);
        clip-path: polygon(0 50%, 100% 0, 100% 100%);
        opacity: 0.7;
    }
    .own-message .message-body::before {
        left: auto;
        right: -8px;
        background-color: var(--cyber-yellow);
        clip-path: polygon(100% 50%, 0 0, 0 100%);
    }

    .reply-quote {
        @apply block text-xs mb-2 border-l-2 pl-2 truncate;
        border-color: rgba(255, 255, 255, 0.3);
        color: rgba(255, 255, 255, 0.5);
    }
    .reply-quote strong {
        font-weight: 600;
        color: rgba(255, 255, 255, 0.7);
    }

    .message-text {
        @apply text-gray-200 whitespace-pre-wrap break-words;
    }

    .message-meta {
        @apply flex items-center justify-end gap-3 mt-2 text-xs text-gray-500;
    }

    .message-actions {
    }

    .action-btn {
        @apply hover:text-white transition-colors;
    }

    .message-input-area {
        @apply p-2 border-t border-gray-700/50 flex gap-2 shrink-0 items-end;
    }
    .input-wrapper {
        @apply w-full flex flex-col;
    }
    .replying-to-banner {
        @apply flex justify-between items-center text-xs p-2 bg-gray-700/50 rounded-t-md text-gray-300;
    }
    .replying-to-banner button {
        @apply font-bold text-lg leading-none;
    }
    .input-field {
        @apply w-full p-2 bg-gray-800/70 text-gray-200 resize-none outline-none border border-transparent focus:border-cyber-yellow;
        transition: border-color 0.2s;
        border-radius: 0.375rem;
    }
    .replying-to-banner + .input-field {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
    .input-field:disabled {
        @apply opacity-50 cursor-wait;
    }

    .send-button {
        @apply px-3 py-2 bg-cyber-yellow text-black font-bold rounded-md font-display uppercase tracking-wider h-auto shrink-0;
        @apply flex items-center justify-center;
        aspect-ratio: 1 / 1;
    }
    .send-button:disabled {
        @apply bg-gray-600 text-gray-400 opacity-50 cursor-not-allowed;
    }

    .reply-swipe-icon {
        display: none;
    }
    @media (pointer: coarse) {
        .reply-swipe-icon {
            @apply absolute top-0 h-full w-16 flex items-center justify-center text-white opacity-0;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
    }

    .date-separator {
        @apply flex justify-center items-center my-4;
    }
    .date-separator span {
        @apply text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full;
    }

    .messages-window::-webkit-scrollbar {
        width: 8px;
    }

    .messages-window::-webkit-scrollbar-track {
        background: transparent;
    }

    .messages-window::-webkit-scrollbar-thumb {
        background-color: var(--cyber-yellow, #fcee0a);
        border-radius: 4px;
        border: 2px solid transparent;
        background-clip: content-box;
    }

    .messages-window::-webkit-scrollbar-thumb:hover {
        background-color: #ffff00;
    }

    .message-time-inline {
    @apply absolute bottom-1 right-2 text-xs text-gray-500;
    }
</style>