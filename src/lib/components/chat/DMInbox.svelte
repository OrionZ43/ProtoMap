<!-- src/lib/components/chat/DMInbox.svelte -->
<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { db } from '$lib/firebase';
    import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
    import {
        collection, query, where, orderBy, limit, onSnapshot, doc,
        setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
        increment, arrayUnion, arrayRemove,
        type Unsubscribe
    } from 'firebase/firestore';
    import { userStore, chat } from '$lib/stores';
    import { getCached, setCache } from '$lib/stores/dmCache';
    import { toJsDate } from '$lib/utils/firestoreDate';
    import { scrollToBottom } from '$lib/utils/scroll';
    import { stickerStore } from '$lib/stores/stickerStore';
    import MessageBubble from '$lib/components/chat/MessageBubble.svelte';
    import Composer from '$lib/components/chat/Composer.svelte';
    import ChatList from '$lib/components/chat/ChatList.svelte';
    import {
        isPlainMap,
        avatarFor,
        dayLabel,
        needsDaySeparator,
        previewFor
    } from '$lib/utils/chatFormat';

    export let onUnreadChange: (count: number) => void = () => {};

    // ── Типы ───────────────────────────────────────────────────────────────
    type ParticipantData = {
        username?: string;
        avatarUrl?: string | null;
        frameId?: string | null;
    };

    type DMChat = {
        id: string;
        partner: { uid: string; username: string; avatarUrl: string | null; frameId?: string | null };
        lastMessage: string;
        lastMessageTimestamp: Date | null;
        unread: number;
    };

    type DMMessage = {
        id: string;
        text: string;
        author_uid: string;
        author_username: string;
        createdAt: Date;
        is_deleted: boolean;
        type: string;
        media_url: string | null;
        sticker_pack_id: string | null;
        sticker_id: string | null;
        reactions: Record<string, string>;
        replyTo: { author_username: string; text: string } | null;
        read_by?: Record<string, any>;
    };

    // ── Состояние ──────────────────────────────────────────────────────────
    let view: 'inbox' | 'chat' = 'inbox';
    let chats: DMChat[] = [];
    let activeChat: DMChat | null = null;
    let messages: DMMessage[] = [];
    let isSending = false;
    let uploadProgress = 0;
    let messagesWindow: HTMLDivElement;

    // Стикеры из глобального стора (один запрос на всё приложение).
    // Выбор активного пака и сам пикер теперь внутри Composer.
    $: packs = $stickerStore.packs;

    // ── Подписки ───────────────────────────────────────────────────────────
    let unsubInbox: Unsubscribe | null = null;
    let unsubMessages: Unsubscribe | null = null;
    let unsubTyping: Unsubscribe | null = null;

    // FIX: Таймауты typing нужно хранить чтобы очищать при destroy
    let myTypingTimeout: ReturnType<typeof setTimeout> | null = null;

    onMount(() => {
        // Ленивая загрузка стикеров — только один запрос на всё приложение
        stickerStore.load();
        subscribeInbox();
    });

    onDestroy(() => {
        // FIX: Полная очистка всех подписок при размонтировании
        unsubInbox?.();
        unsubMessages?.();
        unsubTyping?.();

        // FIX: Сбрасываем таймеры
        if (myTypingTimeout) clearTimeout(myTypingTimeout);

        // FIX: Сбрасываем свой typing при уничтожении компонента
        if (activeChat && $userStore.user) {
            updateDoc(doc(db, 'chats', activeChat.id), {
                [`typing.${$userStore.user.uid}`]: false
            }).catch(() => {});
        }

        // Запись микрофона живёт внутри Composer — он сам гасит recorder
        // и дорожки потока в своём onDestroy.
    });

    export function onTabActivated() {
        if (view === 'chat' && messagesWindow)
            tick().then(() => scrollToBottom(messagesWindow));
    }

    export function openFavorites() {
        const me = $userStore.user;
        if (!me) return;
        openChat({
            id: me.uid + '_' + me.uid,
            partner: { uid: me.uid, username: 'Избранное', avatarUrl: null, frameId: null },
            lastMessage: '', lastMessageTimestamp: null, unread: 0,
        });
    }

    export function openChatWith(partner: { uid: string; username: string; avatarUrl: string | null }) {
        const existing = chats.find(c => c.partner.uid === partner.uid);
        if (existing) {
            openChat(existing);
        } else {
            const myUid  = $userStore.user?.uid ?? '';
            const chatId = [myUid, partner.uid].sort().join('_');
            openChat({
                id: chatId,
                partner: { uid: partner.uid, username: partner.username, avatarUrl: partner.avatarUrl, frameId: null },
                lastMessage: '', lastMessageTimestamp: null, unread: 0,
            });
        }
    }

    // ── Инбокс ─────────────────────────────────────────────────────────────
    function subscribeInbox() {
        const uid = $userStore.user?.uid;
        if (!uid) return;
        unsubInbox?.();

        const q = query(
            collection(db, 'chats'),
            where('participantIds', 'array-contains', uid),
            orderBy('lastMessageTimestamp', 'desc')
        );
        unsubInbox = onSnapshot(q, snap => {
            chats = snap.docs.map(d => {
                const data = d.data();
                const partnerEntry = Object.entries(data.participants || {}).find(([id]) => id !== uid);
                const partnerUid  = partnerEntry?.[0] ?? '';
                const partnerData = (partnerEntry?.[1] as ParticipantData) ?? {};
                return {
                    id: d.id,
                    partner: { uid: partnerUid, username: partnerData.username ?? 'Unknown',
                               avatarUrl: partnerData.avatarUrl ?? null, frameId: partnerData.frameId ?? null },
                    lastMessage: data.lastMessage ?? '',
                    lastMessageTimestamp: toJsDate(data.lastMessageTimestamp),
                    unread: data.unreadCount?.[uid] ?? 0,
                };
            }).filter(c => c.partner.uid !== uid && c.partner.username !== 'Unknown');
            onUnreadChange(chats.reduce((s, c) => s + c.unread, 0));
        });
    }

    // ── Открыть переписку ─────────────────────────────────────────────────
    function openChat(dmChat: DMChat) {
        // FIX: Явно отписываемся от предыдущего чата перед открытием нового
        unsubMessages?.();
        unsubTyping?.();

        activeChat = dmChat;
        view = 'chat';

        const cached = getCached(dmChat.id);
        messages = cached.length > 0 ? cached : [];

        const q = query(
            collection(db, 'chats', dmChat.id, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        unsubMessages = onSnapshot(q, snap => {
            const fresh = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    text:            data.text ?? '',
                    author_uid:      data.author_uid ?? '',
                    author_username: data.author_username ?? 'unknown',
                    // createdAt может быть Timestamp | null | number | ISO-строкой —
                    // мобильный клиент пишет свои форматы. См. $lib/utils/firestoreDate.
                    createdAt:       toJsDate(data.createdAt) ?? new Date(),
                    is_deleted:      data.is_deleted ?? false,
                    type:            data.type ?? 'TEXT',
                    media_url:       data.media_url ?? null,
                    sticker_pack_id: data.sticker_pack_id ?? null,
                    sticker_id:      data.sticker_id ?? null,
                    reactions:       isPlainMap(data.reactions) ? data.reactions : {},
                    replyTo:         data.replyTo ?? null,
                    read_by:         isPlainMap(data.read_by) ? data.read_by : {},
                };
            }).reverse();

            setCache(dmChat.id, fresh);
            messages = fresh;

            if (cached.length === 0) {
                tick().then(() => scrollToBottom(messagesWindow));
            }
        });

        markRead(dmChat.id);

        // Typing — только для чужих чатов (не Избранное)
        if (dmChat.partner.uid !== $userStore.user?.uid) {
            subscribeTyping(dmChat.id, dmChat.partner.uid);
        }
    }

    function backToInbox() {
        // FIX: Сначала сбрасываем typing, потом отписываемся
        if (activeChat && $userStore.user) {
            if (myTypingTimeout) clearTimeout(myTypingTimeout);
            updateDoc(doc(db, 'chats', activeChat.id), {
                [`typing.${$userStore.user.uid}`]: false
            }).catch(() => {});
        }

        unsubMessages?.();
        unsubTyping?.();
        unsubMessages = null;
        unsubTyping = null;

        view = 'inbox';
        activeChat = null;
        messages = [];
        partnerTyping = false;
    }

    // ── Отправка текста ────────────────────────────────────────────────────
    async function sendMessage(text: string) {
        if (isSending || !text || !activeChat || !$userStore.user) return;
        isSending = true;
        try {
            await _writeMessage({ type: 'TEXT', text });
        } catch (err) {
            console.error('[DM] отправка не удалась:', err);
        } finally {
            isSending = false;
        }
    }

    // ── Отправка изображения ───────────────────────────────────────────────
    async function handleFileSelect(file: File) {
        if (!file || !activeChat || !$userStore.user) return;

        isSending = true;
        uploadProgress = 0;

        try {
            const storage = getStorage();
            const ext     = file.name.split('.').pop() ?? 'jpg';
            const msgRef  = doc(collection(db, 'chats', activeChat.id, 'messages'));
            const path    = `chat_media/${activeChat.id}/image/${msgRef.id}.${ext}`;
            const sRef    = storageRef(storage, path);
            const task    = uploadBytesResumable(sRef, file, { contentType: file.type });

            await new Promise<void>((resolve, reject) => {
                task.on('state_changed',
                    snap => { uploadProgress = Math.round(snap.bytesTransferred / snap.totalBytes * 100); },
                    reject,
                    async () => {
                        const url = await getDownloadURL(task.snapshot.ref);
                        await _writeMessage({ type: 'IMAGE', text: '', media_url: url }, msgRef);
                        resolve();
                    }
                );
            });
        } catch (err) { console.error('[DM] image upload:', err); }
        finally {
            isSending = false;
            uploadProgress = 0;
        }
    }

    // ── Голосовое ──────────────────────────────────────────────────────────
    // Сама запись (MediaRecorder, таймер, гашение дорожек) внутри Composer —
    // сюда приходит уже готовый Blob.
    async function _uploadVoice(blob: Blob) {
        if (!activeChat || !$userStore.user) return;
        isSending = true;
        try {
            const storage = getStorage();
            const msgRef  = doc(collection(db, 'chats', activeChat.id, 'messages'));
            const sRef    = storageRef(storage, `chat_media/${activeChat.id}/voice/${msgRef.id}.webm`);
            const task    = uploadBytesResumable(sRef, blob, { contentType: 'audio/webm' });
            await task;
            const url = await getDownloadURL(task.snapshot.ref);
            await _writeMessage({ type: 'VOICE', text: '', media_url: url }, msgRef);
        } catch (err) { console.error('[DM] voice upload:', err); }
        finally { isSending = false; }
    }

    async function sendSticker(packId: string, filename: string) {
        if (!activeChat || !$userStore.user) return;
        try {
            await _writeMessage({ type: 'STICKER', text: '', sticker_pack_id: packId, sticker_id: filename });
        } catch (err) {
            console.error('[DM] отправка стикера:', err);
        }
    }

    async function _writeMessage(
        fields: Partial<DMMessage> & { type: string },
        existingRef?: any
    ) {
        if (!activeChat || !$userStore.user) return;
        const myUid   = $userStore.user.uid;
        const myName  = $userStore.user.username;
        const partner = activeChat.partner;
        const chatId  = activeChat.id;

        const msgRef = existingRef ?? doc(collection(db, 'chats', chatId, 'messages'));
        await setDoc(msgRef, {
            author_uid:      myUid,
            author_username: myName,
            text:            fields.text ?? '',
            type:            fields.type,
            media_url:       fields.media_url ?? null,
            sticker_pack_id: fields.sticker_pack_id ?? null,
            sticker_id:      fields.sticker_id ?? null,
            createdAt:       serverTimestamp(),
            is_deleted:      false,
            reactions:       {},
            read_by:         {},
            replyTo:         null,
        });

        await setDoc(doc(db, 'chats', chatId), {
            lastMessage:          previewFor(fields.type, fields.text ?? ''),
            lastMessageTimestamp: serverTimestamp(),
            participantIds:       [myUid, partner.uid],
            participants: {
                [myUid]:       { username: myName,           avatarUrl: $userStore.user.avatar_url ?? null },
                [partner.uid]: { username: partner.username, avatarUrl: partner.avatarUrl ?? null },
            },
            [`unreadCount.${partner.uid}`]: increment(1),
        }, { merge: true });
    }

    // ── Реакции ────────────────────────────────────────────────────────────
    async function toggleReaction(msg: DMMessage, emoji: string) {
        const uid = $userStore.user?.uid;
        if (!uid || !activeChat) return;
        const ref = doc(db, 'chats', activeChat.id, 'messages', msg.id);
        if (msg.reactions?.[uid] === emoji) {
            const updated = { ...msg.reactions };
            delete updated[uid];
            await updateDoc(ref, { reactions: updated });
        } else {
            await updateDoc(ref, { [`reactions.${uid}`]: emoji });
        }
    }

    async function markRead(chatId: string) {
        const uid = $userStore.user?.uid;
        if (!uid) return;
        try { await updateDoc(doc(db, 'chats', chatId), { [`unreadCount.${uid}`]: 0 }); } catch {}
    }

    // ── Typing indicator ───────────────────────────────────────────────────
    let partnerTyping = false;

    function onInputTyping() {
        if (!activeChat || !$userStore.user) return;
        // FIX: Сбрасываем старый таймер перед установкой нового
        if (myTypingTimeout) clearTimeout(myTypingTimeout);

        updateDoc(doc(db, 'chats', activeChat.id), {
            [`typing.${$userStore.user.uid}`]: true
        }).catch(() => {});

        const chatId = activeChat.id;
        const uid = $userStore.user.uid;
        myTypingTimeout = setTimeout(() => {
            updateDoc(doc(db, 'chats', chatId), {
                [`typing.${uid}`]: false
            }).catch(() => {});
            myTypingTimeout = null;
        }, 2000);
    }

    function subscribeTyping(chatId: string, partnerId: string) {
        // FIX: Всегда отписываемся от предыдущего typing перед новой подпиской
        unsubTyping?.();
        unsubTyping = onSnapshot(doc(db, 'chats', chatId), snap => {
            partnerTyping = snap.data()?.typing?.[partnerId] === true;
        });
    }

    // Форматирование, реакции и рендер пузыря переехали в
    // $lib/utils/chatFormat.ts и components/chat/MessageBubble.svelte —
    // раньше всё это дублировалось здесь и на странице /messages.
</script>
<!-- ══ ИНБОКС ══════════════════════════════════════════════════════════════ -->
{#if view === 'inbox'}
    {#if !$userStore.user}
        <div class="empty-state">
            <p><a href="/login" class="link">Войди</a> чтобы видеть сообщения</p>
        </div>
    {:else}
        <ChatList {chats} onOpen={openChat} onFavorites={openFavorites} />
    {/if}

<!-- ══ ПЕРЕПИСКА ═══════════════════════════════════════════════════════════ -->
{:else if view === 'chat' && activeChat}
    {@const isFavorites = activeChat.partner.uid === $userStore.user?.uid}
    <div class="dm-header">
        <button class="back-btn" on:click={backToInbox} title="К списку диалогов" aria-label="К списку диалогов">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {#if isFavorites}
            <div class="favorites-icon-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
                </svg>
            </div>
            <span class="dm-partner-name">Избранное</span>
        {:else}
            <div class="avatar-wrap small">
                <img src={avatarFor(activeChat.partner.username, activeChat.partner.avatarUrl)}
                     alt={activeChat.partner.username} class="avatar" />
            </div>
            <a href="/u/{activeChat.partner.uid}" class="dm-partner-name">{activeChat.partner.username}</a>
        {/if}
    </div>

    <!-- Лента сообщений -->
    <div class="messages-window" bind:this={messagesWindow}>
        {#if messages.length === 0}
            <div class="empty-state"><p class="empty-hint">Напишите первое сообщение</p></div>
        {:else}
            {#each messages as msg, idx (msg.id)}
                {#if needsDaySeparator(msg.createdAt, messages[idx - 1]?.createdAt)}
                    <div class="day-sep"><span>{dayLabel(msg.createdAt)}</span></div>
                {/if}

                <MessageBubble
                    {msg}
                    isOwn={msg.author_uid === $userStore.user?.uid}
                    partnerUid={activeChat.partner.uid}
                    partnerAvatar={avatarFor(activeChat.partner.username, activeChat.partner.avatarUrl)}
                    myUid={$userStore.user?.uid ?? null}
                    {packs}
                    showAvatar={!isFavorites}
                    scrollRoot={messagesWindow}
                    compact
                    onReact={toggleReaction}
                />
            {/each}
        {/if}
    </div>

    {#if partnerTyping && activeChat}
        <div class="typing-indicator">
            <div class="typing-avatar">
                <img src={avatarFor(activeChat.partner.username, activeChat.partner.avatarUrl)} alt="" />
            </div>
            <div class="typing-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    {/if}

    <Composer
        {packs}
        {isSending}
        {uploadProgress}
        compact
        placeholder={isFavorites ? 'Заметка себе…' : 'Написать…'}
        onSend={sendMessage}
        onImage={handleFileSelect}
        onVoice={_uploadVoice}
        onSticker={sendSticker}
        onTyping={onInputTyping}
    />
{/if}

<style>
    /* Список диалогов, пузырь, реакции, стикер-пикер и поле ввода живут в
       общих компонентах: ChatList / MessageBubble / Composer. Здесь остаётся
       только то, что специфично для виджета. */

    /* ── DM хедер ───────────────────────────────────────────────────── */
    .dm-header { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
    .back-btn { color: #94a3b8; padding: 0.25rem; border-radius: 4px; transition: color 0.2s; }
    .back-btn:hover { color: var(--cyber-yellow); }
    .dm-partner-name { font-size: 0.9rem; font-weight: 700; color: #e2e8f0; text-decoration: none; }
    .dm-partner-name:hover { color: var(--cyber-yellow); text-decoration: underline; }

    /* Размер задаёт ОБЁРТКА, а не картинка. Причина: на .avatar-wrap вешается
       сырой frameId, а cosmetics.css — глобальный файл — содержит правила
       `.frame_high_roller img { width:100% !important; height:100% !important }`
       (то же у frame_ludoman/anniversary/alpha). Они перебивают скоупленный
       размер картинки, и если обёртка без размеров, то 100% резолвить не во что —
       аватарка раздувается на всю строку. В остальном приложении эти рамки
       висят на .avatar-wrapper с фиксированными 128px, поэтому там всё цело. */
    .avatar-wrap { position: relative; flex-shrink: 0; width: 42px; height: 42px; }
    .avatar-wrap.small { width: 32px; height: 32px; }
    .avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
    .favorites-icon-sm { width: 32px; height: 32px; border-radius: 50%; background: rgba(252,238,10,0.1); display: flex; align-items: center; justify-content: center; color: var(--cyber-yellow); flex-shrink: 0; }

    /* ── Лента ──────────────────────────────────────────────────────── */
    .messages-window { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
    .day-sep { display: flex; align-items: center; justify-content: center; margin: 0.75rem 0 0.5rem; }
    .day-sep span { font-family: var(--font-display); font-size: 0.62rem; color: #475569; background: rgba(15,20,30,0.8); border: 1px solid rgba(255,255,255,0.06); padding: 0.2rem 0.65rem; border-radius: 10px; letter-spacing: 0.08em; }

    /* ── Пустые состояния ───────────────────────────────────────────── */
    .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
    .empty-hint { font-size: 0.75rem; color: #475569; line-height: 1.5; }
    .link { color: var(--cyber-yellow); text-decoration: underline; }

    /* ── Индикатор набора ───────────────────────────────────────────── */
    .typing-indicator { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.75rem 0.1rem; flex-shrink: 0; }
    .typing-avatar img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; opacity: 0.7; }
    .typing-dots { display: flex; align-items: center; gap: 3px; background: rgba(31,41,55,0.7); border: 1px solid rgba(75,85,99,0.4); border-radius: 12px; padding: 6px 10px; }
    .typing-dots span { width: 5px; height: 5px; border-radius: 50%; background: #64748b; animation: typing-bounce 1.2s ease-in-out infinite; }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

    @media (prefers-reduced-motion: reduce) {
        .typing-dots span { animation: none; }
    }
</style>
