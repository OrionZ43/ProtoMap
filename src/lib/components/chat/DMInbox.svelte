<!-- src/lib/components/chat/DMInbox.svelte -->
<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { db } from '$lib/firebase';
    import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
    import {
        collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, getDocs,
        setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
        increment, arrayUnion, arrayRemove,
        type Unsubscribe, type Timestamp
    } from 'firebase/firestore';
    import { userStore, chat } from '$lib/stores';
    import { getCached, setCache, upsertMessage, dmCacheVersion } from '$lib/stores/dmCache';
    import VoiceMessage from '$lib/components/chat/VoiceMessage.svelte';

    export let onUnreadChange: (count: number) => void = () => {};

    // ── Типы ───────────────────────────────────────────────────────────────
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
        type: string;           // TEXT | IMAGE | VOICE | sticker
        media_url: string | null;
        sticker_pack_id: string | null;
        sticker_id: string | null;
        reactions: Record<string, string>;
        replyTo: { author_username: string; text: string } | null;
    };

    // ── Состояние ──────────────────────────────────────────────────────────
    let view: 'inbox' | 'chat' = 'inbox';
    let chats: DMChat[] = [];
    let activeChat: DMChat | null = null;
    let messages: DMMessage[] = [];
    let messageText = '';
    let isSending = false;
    let messagesWindow: HTMLDivElement;
    let inputEl: HTMLTextAreaElement;
    let fileInputEl: HTMLInputElement;
    let uploadProgress = 0;   // 0–100, показываем прогресс-бар
    let isRecording = false;
    let mediaRecorder: MediaRecorder | null = null;
    let audioChunks: Blob[] = [];
    let showStickerPicker = false;

    // Стикер-паки — строятся динамически из Storage

// ── Загрузка стикер-паков из mobileapp/sticker_packs ─────────────────
    type StickerPack = { id: string; name: string; folder: string; stickers: string[]; iconUrl: string };
    let stickerPacks: StickerPack[] = [];
    let activePack: StickerPack | null = null;

    async function loadStickerPacks() {
        try {
            const snap = await getDoc(doc(db, 'mobileapp', 'sticker_packs'));
            if (!snap.exists()) return;
            const data = snap.data();

            let rawPacks = data.sticker_packs;

            // 1. В базе лежит СТРОКА! Нам нужно превратить её в объекты.
            if (typeof rawPacks === 'string') {
                try {
                    // Вырезаем кривые лишние запятые перед скобками, чтобы парсер не сломался
                    let fixedString = rawPacks.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
                    rawPacks = JSON.parse(fixedString);
                } catch (err) {
                    console.error("Ошибка парсинга JSON из базы. Строка кривая:", err);
                    return;
                }
            }

            // 2. Достаем нужный массив (у тебя он лежит внутри pack_list)
            let packList =[];
            if (rawPacks && Array.isArray(rawPacks.pack_list)) {
                packList = rawPacks.pack_list;
            } else if (Array.isArray(rawPacks)) {
                packList = rawPacks;
            } else if (rawPacks && typeof rawPacks === 'object') {
                packList = Object.values(rawPacks);
            }

            // 3. Собираем паки для отображения
            const parsedPacks = packList.map(p => {
                if (!p || typeof p !== 'object' || !p.id) return null;

                const packId = p.id;
                // Данные о стикерах лежат рядом (например, rawPacks.sp_oriosha)
                const packData = rawPacks[packId] || data[packId] || {};

                const cleanId = packId.replace(/^(pack_|sp_)/, '');
                const spFolder = 'sp_' + cleanId;
                const basePath = packData.base_path || `stickers/${spFolder}`;

                let stickers = packData.stickers || p.stickers ||[];
                if (!Array.isArray(stickers) || stickers.length === 0) {
                    const count = packData.count || p.count || 30;
                    stickers =[];
                    for (let i = 1; i <= count; i++) {
                        stickers.push(`${spFolder}_${i}.png`);
                    }
                }

                let iconFile = p.icon_file || packData.icon_file || stickers[0] || `${spFolder}_1.png`;
                if (!String(iconFile).endsWith('.png')) {
                    iconFile = `${spFolder}_${iconFile}.png`;
                }

                // Чистим опечатку sp_sp_ в именах иконок
                iconFile = String(iconFile).replace('sp_sp_', 'sp_');

                return {
                    id: packId,
                    name: p.title || packData.title || cleanId,
                    folder: basePath,
                    stickers,
                    iconUrl: `https://firebasestorage.googleapis.com/v0/b/protomap-1e1db.firebasestorage.app/o/${encodeURIComponent(basePath + '/' + iconFile)}?alt=media`
                };
            }).filter(Boolean); // Убираем пустые (null)

            stickerPacks = parsedPacks;
            if (stickerPacks.length > 0) {
                activePack = stickerPacks[0];
            }

            console.log("✅ УРА! СТИКЕРЫ УСПЕШНО ЗАГРУЖЕНЫ:", stickerPacks);

        } catch (e) {
            console.error('[Stickers] load failed:', e);
        }
    }

    loadStickerPacks();

    let unsubInbox: Unsubscribe | null = null;
    let unsubMessages: Unsubscribe | null = null;

    onMount(() => subscribeInbox());
    onDestroy(() => { unsubInbox?.(); unsubMessages?.(); });

    export function onTabActivated() {
        if (view === 'chat' && messagesWindow)
            tick().then(() => { messagesWindow.scrollTop = messagesWindow.scrollHeight; });
    }

    // Открыть Избранное (чат с самим собой)
    export function openFavorites() {
        const me = $userStore.user;
        if (!me) return;
        openChat({
            id:      me.uid + '_' + me.uid, // chatId с самим собой
            partner: {
                uid:      me.uid,
                username: 'Избранное',
                avatarUrl: null,
                frameId:  null,
            },
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
                const partnerData = partnerEntry?.[1] as any ?? {};
                return {
                    id: d.id,
                    partner: { uid: partnerUid, username: partnerData.username ?? 'Unknown',
                               avatarUrl: partnerData.avatarUrl ?? null, frameId: partnerData.frameId ?? null },
                    lastMessage: data.lastMessage ?? '',
                    lastMessageTimestamp: (data.lastMessageTimestamp as Timestamp)?.toDate() ?? null,
                    unread: data.unreadCount?.[uid] ?? 0,
                };
            }).filter(c => c.partner.uid !== uid && c.partner.username !== 'Unknown'); // скрываем self-chat и битые чаты
            onUnreadChange(chats.reduce((s, c) => s + c.unread, 0));
        });
    }

    // ── Открыть переписку ─────────────────────────────────────────────────
    function openChat(dmChat: DMChat) {
        unsubMessages?.();
        activeChat = dmChat;
        view = 'chat';
        showStickerPicker = false;

        // Сразу показываем кэш — без мигания загрузки
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
                    createdAt:       (data.createdAt as Timestamp)?.toDate() ?? new Date(),
                    is_deleted:      data.is_deleted ?? false,
                    type:            data.type ?? 'TEXT',
                    media_url:       data.media_url ?? null,
                    sticker_pack_id: data.sticker_pack_id ?? null,
                    sticker_id:      data.sticker_id ?? null,
                    reactions:       data.reactions ?? {},
                    replyTo:         data.replyTo ?? null,
                };
            }).reverse();

            // Обновляем кэш и список
            setCache(dmChat.id, fresh);
            messages = fresh;

            // Скролл только если это первая загрузка (кэш был пустой)
            if (cached.length === 0) {
                tick().then(() => { if (messagesWindow) messagesWindow.scrollTop = messagesWindow.scrollHeight; });
            }
        });

        markRead(dmChat.id);

        // Подписываемся на typing партнёра
        if (dmChat.partner.uid !== $userStore.user?.uid) {
            subscribeTyping(dmChat.id, dmChat.partner.uid);
        }
    }

    function backToInbox() {
        unsubMessages?.();
        unsubTyping?.();
        // Сбрасываем свой typing статус
        if (activeChat && $userStore.user) {
            updateDoc(doc(db, 'chats', activeChat.id), {
                [`typing.${$userStore.user.uid}`]: false
            }).catch(() => {});
        }
        view = 'inbox'; activeChat = null; messages = []; showStickerPicker = false; partnerTyping = false;
    }

    // ── Отправка текста ────────────────────────────────────────────────────
    async function sendMessage() {
        if (isSending || !messageText.trim() || !activeChat || !$userStore.user) return;
        isSending = true;
        const text = messageText.trim();
        messageText = '';
        await _writeMessage({ type: 'TEXT', text });
        isSending = false;
    }

    // ── Отправка изображения ───────────────────────────────────────────────
    async function handleFileSelect(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file || !activeChat || !$userStore.user) return;
        if (!file.type.startsWith('image/')) return;

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
        } catch (e) { console.error('[DM] image upload:', e); }
        finally { isSending = false; uploadProgress = 0; (e.target as HTMLInputElement).value = ''; }
    }

    // ── Запись голосового ──────────────────────────────────────────────────
    async function toggleRecording() {
        if (isRecording) {
            mediaRecorder?.stop();
            isRecording = false;
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioChunks  = [];
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const blob   = new Blob(audioChunks, { type: 'audio/webm' });
                    stream.getTracks().forEach(t => t.stop());
                    await _uploadVoice(blob);
                };
                mediaRecorder.start();
                isRecording = true;
            } catch (e) { console.error('[DM] mic:', e); }
        }
    }

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
        } catch (e) { console.error('[DM] voice upload:', e); }
        finally { isSending = false; }
    }

    // ── Отправка стикера ───────────────────────────────────────────────────
    async function sendSticker(packId: string, filename: string) {
        if (!activeChat || !$userStore.user) return;
        showStickerPicker = false;
        await _writeMessage({ type: 'STICKER', text: '', sticker_pack_id: packId, sticker_id: filename });
    }

    // ── Вспомогательная запись сообщения ──────────────────────────────────
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

        const preview = fields.type === 'IMAGE' || fields.type === 'image'   ? '📷 Изображение'
                      : fields.type === 'VOICE' || fields.type === 'voice'   ? '🎙 Голосовое'
                      : fields.type === 'sticker' || fields.type === 'STICKER' ? '🌟 Стикер'
                      : fields.text ?? '';

        await setDoc(doc(db, 'chats', chatId), {
            lastMessage:          preview,
            lastMessageTimestamp: serverTimestamp(),
            participantIds:       [myUid, partner.uid],
            participants: {
                [myUid]:       { username: myName,           avatarUrl: $userStore.user.avatar_url ?? null },
                [partner.uid]: { username: partner.username, avatarUrl: partner.avatarUrl ?? null },
            },
            [`unreadCount.${partner.uid}`]: increment(1),
        }, { merge: true });
    }

    // ── Реакция ────────────────────────────────────────────────────────────
    async function toggleReaction(msg: DMMessage, emoji: string) {
        const uid = $userStore.user?.uid;
        if (!uid || !activeChat) return;
        const ref = doc(db, 'chats', activeChat.id, 'messages', msg.id);
        if (msg.reactions[uid] === emoji) {
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

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

function getStickerUrl(packId: string | undefined, filenameRaw: string | number): string {
        if (!packId) return '';
        const pack = stickerPacks.find(p => p.id === packId);

        const cleanId = packId.replace(/^(pack_|sp_)/, '');
        const spFolder = 'sp_' + cleanId;

        const folder = pack?.folder || `stickers/${spFolder}`;

        let file = String(filenameRaw);
        if (!file.endsWith('.png')) {
            file = `${spFolder}_${file}.png`;
        }

        // Автоматически чиним опечатки вроде sp_sp_kess_1.png, которые есть в базе
        file = file.replace('sp_sp_', 'sp_');

        return `https://firebasestorage.googleapis.com/v0/b/protomap-1e1db.firebasestorage.app/o/${encodeURIComponent(folder + '/' + file)}?alt=media`;
    }

    function getStickerPreviewUrl(packId: string, filenameRaw: string | number): string {
        return getStickerUrl(packId, filenameRaw);
    }

    function formatTime(date: Date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ── Разделители по дням ───────────────────────────────────────────────
    function isSameDay(a: Date, b: Date) {
        return a.getFullYear() === b.getFullYear() &&
               a.getMonth()    === b.getMonth()    &&
               a.getDate()     === b.getDate();
    }

    function formatDaySeparator(date: Date): string {
        const today     = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(date, today))     return 'Сегодня';
        if (isSameDay(date, yesterday)) return 'Вчера';
        return date.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
    }

    function needsDaySeparator(msg: DMMessage, prev: DMMessage | undefined): boolean {
        if (!prev) return true;
        return !isSameDay(msg.createdAt, prev.createdAt);
    }

    // ── Typing indicator ──────────────────────────────────────────────────
    // Typing через Firestore
    let partnerTyping = false;
    let typingTimeout: ReturnType<typeof setTimeout>;
    let myTypingTimeout: ReturnType<typeof setTimeout>;

    function onInputTyping() {
        // Отправляем статус печатания
        if (!activeChat || !$userStore.user) return;
        clearTimeout(myTypingTimeout);
        updateDoc(doc(db, 'chats', activeChat.id), {
            [`typing.${$userStore.user.uid}`]: true
        }).catch(() => {});
        myTypingTimeout = setTimeout(() => {
            if (!activeChat || !$userStore.user) return;
            updateDoc(doc(db, 'chats', activeChat.id), {
                [`typing.${$userStore.user.uid}`]: false
            }).catch(() => {});
        }, 2000);
    }

    // Слушаем typing партнёра
    let unsubTyping: Unsubscribe | null = null;

    function subscribeTyping(chatId: string, partnerId: string) {
        unsubTyping?.();
        unsubTyping = onSnapshot(doc(db, 'chats', chatId), snap => {
            partnerTyping = snap.data()?.typing?.[partnerId] === true;
        });
    }

    function formatLastSeen(date: Date | null) {
        if (!date) return '';
        const diff = Date.now() - date.getTime();
        if (diff < 60_000)     return 'только что';
        if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} мин`;
        if (diff < 86_400_000) return formatTime(date);
        return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }

    function countReactions(r: Record<string, string>) {
        const c: Record<string, number> = {};
        Object.values(r).forEach(e => { c[e] = (c[e] ?? 0) + 1; });
        return Object.entries(c);
    }

    const QUICK_EMOJI = ['❤️','🔥','😂','👍','😮'];
    let hoveredMsg: string | null = null;
    let reactionPanelMsg: string | null = null; // ID сообщения с открытой панелью реакций

    function toggleReactionPanel(msgId: string, e: MouseEvent) {
        e.stopPropagation();
        reactionPanelMsg = reactionPanelMsg === msgId ? null : msgId;
    }

    function closeReactionPanel() { reactionPanelMsg = null; }
</script>

<!-- ══ ИНБОКС ══════════════════════════════════════════════════════════════ -->
{#if view === 'inbox'}
    <div class="inbox">
        {#if !$userStore.user}
            <div class="empty-state">
                <p><a href="/login" class="link">Войди</a> чтобы видеть сообщения</p>
            </div>
        {:else}
            <!-- Избранное — всегда первым -->
            {#if $userStore.user}
                <button class="chat-row favorites-row" on:click={openFavorites}>
                    <div class="favorites-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
                        </svg>
                    </div>
                    <div class="chat-info">
                        <div class="chat-header-row">
                            <span class="chat-name favorites-name">Избранное</span>
                        </div>
                        <span class="chat-preview">Заметки, ссылки, файлы для себя</span>
                    </div>
                </button>
            {/if}

            {#if chats.length === 0}
                <div class="empty-state" style="margin-top: 1rem;">
                    <div class="empty-icon">💬</div>
                    <p class="empty-title">Личных чатов пока нет</p>
                    <p class="empty-hint">Открой профиль пользователя и напиши ему</p>
                </div>
            {/if}

            {#each chats as dmChat (dmChat.id)}
                <button class="chat-row" on:click={() => openChat(dmChat)}>
                    <div class="avatar-wrap {dmChat.partner.frameId || ''}">
                        <img src={dmChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${dmChat.partner.username}`}
                             alt={dmChat.partner.username} class="avatar" />
                        {#if dmChat.unread > 0}
                            <span class="unread-badge">{dmChat.unread > 99 ? '99+' : dmChat.unread}</span>
                        {/if}
                    </div>
                    <div class="chat-info">
                        <div class="chat-header-row">
                            <span class="chat-name" class:has-unread={dmChat.unread > 0}>{dmChat.partner.username}</span>
                            <span class="chat-time">{formatLastSeen(dmChat.lastMessageTimestamp)}</span>
                        </div>
                        <span class="chat-preview" class:has-unread={dmChat.unread > 0}>{dmChat.lastMessage || '...'}</span>
                    </div>
                </button>
            {/each}
        {/if}
    </div>

<!-- ══ ПЕРЕПИСКА ═══════════════════════════════════════════════════════════ -->
{:else if view === 'chat' && activeChat}
    {@const isFavorites = activeChat.partner.uid === $userStore.user?.uid}
    <div class="dm-header">
        <button class="back-btn" on:click={backToInbox}>
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
                <img src={activeChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${activeChat.partner.username}`}
                     alt={activeChat.partner.username} class="avatar" />
            </div>
            <a href="/u/{activeChat.partner.uid}" class="dm-partner-name">{activeChat.partner.username}</a>
        {/if}
    </div>

    <!-- Лента сообщений -->
    <div class="messages-window" bind:this={messagesWindow} on:click={closeReactionPanel}>
        {#if messages.length === 0}
            <div class="empty-state"><p class="empty-hint">Напишите первое сообщение</p></div>
        {:else}
            {#each messages as msg, idx (msg.id)}
                {@const isOwn = msg.author_uid === $userStore.user?.uid}
                {@const prevMsg = messages[idx - 1]}

                <!-- Разделитель по дням -->
                {#if needsDaySeparator(msg, prevMsg)}
                    <div class="day-sep">
                        <span>{formatDaySeparator(msg.createdAt)}</span>
                    </div>
                {/if}

                <div class="msg-row" class:msg-own={isOwn}
                     on:mouseenter={() => hoveredMsg = msg.id}
                     on:mouseleave={() => { hoveredMsg = null; }}>

                    {#if !isOwn}
                        <img src={activeChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${activeChat.partner.username}`}
                             alt="" class="msg-avatar" />
                    {/if}

                    <div class="msg-bubble-wrap">
                        <div class="msg-bubble" class:own={isOwn} class:sticker-bubble={msg.type === 'sticker' || msg.type === 'STICKER'}>
                            {#if msg.is_deleted}
                                <span class="deleted-text">Сообщение удалено</span>

                            {:else if (msg.type === 'sticker' || msg.type === 'STICKER') && msg.sticker_pack_id && msg.sticker_id}
                                <img src={getStickerUrl(msg.sticker_pack_id, msg.sticker_id)}
                                     alt="sticker" class="sticker-img" loading="lazy" />

                            {:else if (msg.type === 'IMAGE' || msg.type === 'image')}
                                {#if msg.media_url}
                                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                                        <img src={msg.media_url} alt="image" class="chat-img" loading="lazy" />
                                    </a>
                                {:else if msg.text}
                                    <!-- Старый формат приложения — base64 в поле text -->
                                    <img src="data:image/jpeg;base64,{msg.text}" alt="image" class="chat-img" loading="lazy" />
                                {:else}
                                    <span class="muted-text">Изображение недоступно</span>
                                {/if}

                            {:else if (msg.type === 'VOICE' || msg.type === 'voice')}
                                {#if msg.media_url}
                                    <VoiceMessage src={msg.media_url} {isOwn} />
                                {:else if msg.text}
                                    <VoiceMessage src="data:audio/aac;base64,{msg.text}" {isOwn} />
                                {:else}
                                    <span class="muted-text">Голосовое недоступно</span>
                                {/if}

                            {:else}
                                <p class="msg-text">{msg.text}</p>
                            {/if}

                            {#if msg.type !== 'sticker'}
                                <span class="msg-time">
                                    {formatTime(msg.createdAt)}
                                    {#if isOwn}
                                        <!-- Галочки: одна = доставлено, две = прочитано -->
                                        {@const readByPartner = activeChat && msg.read_by?.[activeChat.partner.uid]}
                                        <span class="ticks" class:read={readByPartner}>
                                            {readByPartner ? '✓✓' : '✓'}
                                        </span>
                                    {/if}
                                </span>
                            {/if}
                        </div>

                        <!-- Кнопка 😊 при ховере — справа для чужих, слева для своих -->
                        {#if hoveredMsg === msg.id && $userStore.user}
                            <button class="react-trigger" class:react-own={isOwn}
                                    on:click={(e) => toggleReactionPanel(msg.id, e)}>
                                😊
                            </button>
                        {/if}

                        <!-- Кнопка копирования — появляется рядом с эмодзи -->
                        {#if hoveredMsg === msg.id && msg.text && $userStore.user}
                            <button class="copy-btn-msg" class:react-own={isOwn}
                                    on:click={() => { navigator.clipboard.writeText(msg.text); hoveredMsg = null; }}
                                    title="Копировать">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                            </button>
                        {/if}

                        <!-- Панель эмодзи по клику -->
                        {#if reactionPanelMsg === msg.id && $userStore.user}
                            <div class="reaction-panel" class:reaction-panel-own={isOwn}>
                                {#each QUICK_EMOJI as emoji}
                                    <button class="rp-btn" on:click={() => { toggleReaction(msg, emoji); closeReactionPanel(); }}>
                                        {emoji}
                                    </button>
                                {/each}
                            </div>
                        {/if}

                        <!-- Реакции под сообщением -->
                        {#if Object.keys(msg.reactions).length > 0}
                            <div class="reactions" class:own={isOwn}>
                                {#each countReactions(msg.reactions) as [emoji, count]}
                                    <button class="reaction-pill"
                                            class:my-reaction={msg.reactions[$userStore.user?.uid ?? ''] === emoji}
                                            on:click={() => toggleReaction(msg, emoji)}>
                                        {emoji} {count}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <!-- Typing indicator -->
    {#if partnerTyping && activeChat}
        <div class="typing-indicator">
            <div class="typing-avatar">
                <img src={activeChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${activeChat.partner.username}`}
                     alt="" />
            </div>
            <div class="typing-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    {/if}

    <!-- Стикер-пикер -->
    {#if showStickerPicker}
        <div class="sticker-picker">
            <div class="pack-tabs">
                {#each stickerPacks as pack}
                    <button class="pack-tab" class:active={activePack.id === pack.id}
                            on:click={() => activePack = pack}>
                        <img src={pack.iconUrl} alt={pack.name} class="pack-thumb" />
                    </button>
                {/each}
            </div>
            <div class="sticker-grid">
                {#if activePack}
                    {#each activePack.stickers as filename}
                        <button class="sticker-btn" on:click={() => sendSticker(activePack!.id, filename)}>
                            <img src={getStickerUrl(activePack!.id, filename)} alt=""
                                 loading="lazy" class="sticker-preview" />
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    {/if}

    <!-- Поле ввода -->
    <div class="input-area">
        <!-- Прогресс загрузки -->
        {#if uploadProgress > 0}
            <div class="upload-bar">
                <div class="upload-fill" style="width: {uploadProgress}%"></div>
            </div>
        {/if}

        <div class="input-row">
            <!-- Прикрепить фото -->
            <button class="tool-btn" title="Изображение" on:click={() => fileInputEl.click()} disabled={isSending}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
            </button>
            <input bind:this={fileInputEl} type="file" accept="image/*" class="hidden-file"
                   on:change={handleFileSelect} />

            <!-- Стикеры -->
            <button class="tool-btn" title="Стикеры" on:click={() => showStickerPicker = !showStickerPicker}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
            </button>

            <!-- Поле текста -->
            <textarea bind:this={inputEl} bind:value={messageText}
                on:keydown={handleKeydown}
                on:input={onInputTyping}
                maxlength="1000" placeholder={isRecording ? '🔴 Запись...' : 'Написать...'}
                disabled={isSending || isRecording} class="input-field" rows="1"></textarea>

            <!-- Голосовое / Отправить -->
            {#if isRecording}
                <!-- Анимация записи -->
                <div class="recording-indicator">
                    <div class="rec-rings">
                        <div class="rec-ring r1"></div>
                        <div class="rec-ring r2"></div>
                        <div class="rec-ring r3"></div>
                    </div>
                    <button class="stop-rec-btn" on:click={toggleRecording} title="Остановить запись">
                        <div class="stop-square"></div>
                    </button>
                </div>
            {:else if messageText.trim()}
                <button class="send-btn" on:click={sendMessage} disabled={isSending}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/>
                    </svg>
                </button>
            {:else}
                <button class="tool-btn mic-btn" on:click={toggleRecording} title="Голосовое">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                </button>
            {/if}
        </div>
    </div>
{/if}

<style>
    /* ── Инбокс ─────────────────────────────────────────────────────── */
    .inbox { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
    .chat-row { width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s; text-align: left; }
    .chat-row:hover { background: rgba(255,255,255,0.04); }
    .avatar-wrap { position: relative; flex-shrink: 0; }
    .avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
    .avatar-wrap.small .avatar { width: 32px; height: 32px; }
    .unread-badge { position: absolute; top: -3px; right: -3px; background: #ff003c; color: white; font-size: 0.55rem; font-weight: 900; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 3px; }
    .chat-info { flex: 1; min-width: 0; }
    .chat-header-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.2rem; }
    .chat-name { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-name.has-unread { color: #fff; font-weight: 700; }
    .chat-time { font-size: 0.62rem; color: #475569; flex-shrink: 0; margin-left: 0.5rem; }
    .chat-preview { font-size: 0.75rem; color: #64748b; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-preview.has-unread { color: #94a3b8; }

    /* ── DM хедер ───────────────────────────────────────────────────── */
    .dm-header { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
    .back-btn { color: #94a3b8; padding: 0.25rem; border-radius: 4px; transition: color 0.2s; }
    .back-btn:hover { color: var(--cyber-yellow); }
    .dm-partner-name { font-size: 0.9rem; font-weight: 700; color: #e2e8f0; text-decoration: none; }
    .dm-partner-name:hover { color: var(--cyber-yellow); text-decoration: underline; }

    /* ── Лента ──────────────────────────────────────────────────────── */
    .messages-window { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
    .msg-row { display: flex; align-items: flex-end; gap: 0.4rem; position: relative; }
    .msg-own { flex-direction: row-reverse; }
    .msg-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .msg-bubble-wrap { display: flex; flex-direction: column; max-width: 78%; gap: 0.25rem; position: relative; }
    .msg-own .msg-bubble-wrap { align-items: flex-end; }
    .msg-bubble { padding: 0.5rem 0.65rem 1.4rem; border-radius: 12px; position: relative; background: rgba(31,41,55,0.7); border: 1px solid rgba(75,85,99,0.4); }
    .msg-bubble.own { background: rgba(252,238,10,0.08); border-color: rgba(252,238,10,0.2); }
    .msg-bubble.sticker-bubble { background: transparent !important; border: none !important; padding: 0 !important; }
    .msg-text { font-size: 0.85rem; color: #e2e8f0; white-space: pre-wrap; word-break: break-words; line-height: 1.45; }
    .msg-time { position: absolute; bottom: 0.3rem; right: 0.5rem; font-size: 0.6rem; color: #64748b; }
    .deleted-text { font-size: 0.8rem; color: #64748b; font-style: italic; }

    /* ── Изображение ────────────────────────────────────────────────── */
    .chat-img { max-width: 220px; max-height: 200px; border-radius: 8px; object-fit: cover; display: block; cursor: pointer; transition: opacity 0.2s; }
    .chat-img:hover { opacity: 0.9; }

    /* ── Голосовое ──────────────────────────────────────────────────── */
    .voice-msg { display: flex; align-items: center; gap: 0.5rem; color: var(--cyber-yellow); min-width: 180px; }
    .audio-player { height: 28px; width: 150px; accent-color: var(--cyber-yellow); flex: 1; }
    .muted-text { font-size: 0.75rem; color: #475569; font-style: italic; }

    /* ── Стикер ─────────────────────────────────────────────────────── */
    .sticker-img { width: 110px; height: 110px; object-fit: contain; display: block; }

    /* ── Реакции ────────────────────────────────────────────────────── */
    /* Кнопка 😊 при ховере */
    .react-trigger { position: absolute; bottom: -8px; right: -10px; font-size: 0.85rem; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(20,25,35,0.95); border: 1px solid rgba(255,255,255,0.12); border-radius: 50%; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.4); opacity: 0; animation: none; transition: transform 0.15s; }
    .react-trigger.react-own { right: auto; left: -10px; }
    .msg-bubble-wrap:hover .react-trigger { animation: delayed-show 0.8s forwards; }
    .react-trigger:hover { transform: scale(1.2); }
    @keyframes delayed-show { 0%,79% { opacity: 0; } 80%,100% { opacity: 1; } }

    /* Панель реакций по клику */
    .reaction-panel { position: absolute; bottom: 20px; right: -10px; display: flex; gap: 2px; background: rgba(10,12,18,0.97); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 4px 8px; z-index: 20; box-shadow: 0 4px 16px rgba(0,0,0,0.6); animation: pop-in 0.12s cubic-bezier(0.34,1.56,0.64,1); }
    .reaction-panel-own { right: auto; left: -10px; }
    .rp-btn { font-size: 1.25rem; padding: 2px 4px; border-radius: 6px; transition: transform 0.12s; }
    .rp-btn:hover { transform: scale(1.35); }
    @keyframes pop-in { from { opacity:0; transform: scale(0.7); } to { opacity:1; transform: scale(1); } }
    .reactions { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
    .reactions.own { justify-content: flex-end; }
    .reaction-pill { font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.15s; }
    .reaction-pill:hover { background: rgba(255,255,255,0.12); }
    .reaction-pill.my-reaction { background: rgba(252,238,10,0.12); border-color: rgba(252,238,10,0.3); }

    /* ── Стикер-пикер ───────────────────────────────────────────────── */
    .sticker-picker { flex-shrink: 0; height: 240px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(5,8,12,0.98); display: flex; flex-direction: column; }
    .pack-tabs { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); overflow-x: auto; scrollbar-width: none; }
    .pack-tab { flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; overflow: hidden; padding: 2px; border: 2px solid transparent; transition: border-color 0.15s; }
    .pack-tab.active { border-color: var(--cyber-yellow); }
    .pack-thumb { width: 100%; height: 100%; object-fit: contain; }
    .sticker-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 72px; gap: 6px; padding: 8px; scrollbar-width: thin; scrollbar-color: #334155 transparent; align-content: start; }
    .sticker-btn { width: 100%; height: 72px; border-radius: 8px; overflow: hidden; transition: background 0.15s, transform 0.15s; padding: 4px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
    .sticker-btn:hover { background: rgba(255,255,255,0.08); transform: scale(1.05); }
    .sticker-preview { width: 64px; height: 64px; object-fit: contain; display: block; flex-shrink: 0; }

    /* ── Ввод ───────────────────────────────────────────────────────── */
    .input-area { flex-shrink: 0; border-top: 1px solid rgba(55,65,81,0.5); }
    .upload-bar { height: 2px; background: rgba(255,255,255,0.05); }
    .upload-fill { height: 100%; background: var(--cyber-yellow); transition: width 0.2s; }
    .input-row { display: flex; align-items: flex-end; gap: 4px; padding: 6px 8px; }
    .input-field { flex: 1; padding: 0.45rem 0.5rem; background: rgba(31,41,55,0.7); color: #e2e8f0; resize: none; outline: none; border: 1px solid transparent; border-radius: 8px; font-size: 0.875rem; transition: border-color 0.2s; max-height: 80px; overflow-y: auto; }
    .input-field:focus { border-color: var(--cyber-yellow, #fcee0a); }
    .input-field:disabled { opacity: 0.5; }
    .tool-btn { flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; color: #64748b; border-radius: 8px; transition: color 0.2s, background 0.2s; }
    .tool-btn:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }
    .tool-btn:disabled { opacity: 0.35; }
    /* Анимация записи */
    .recording-indicator { position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .rec-rings { position: absolute; inset: 0; }
    .rec-ring { position: absolute; border-radius: 50%; border: 1.5px solid #ff003c; inset: 0; animation: ring-expand 1.8s ease-out infinite; }
    .rec-ring.r1 { animation-delay: 0s; }
    .rec-ring.r2 { animation-delay: 0.6s; }
    .rec-ring.r3 { animation-delay: 1.2s; }
    @keyframes ring-expand { 0% { transform: scale(0.4); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }
    .stop-rec-btn { position: relative; z-index: 1; width: 24px; height: 24px; border-radius: 50%; background: #ff003c; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
    .stop-rec-btn:hover { transform: scale(1.1); }
    .stop-square { width: 8px; height: 8px; background: white; border-radius: 1px; }
    .send-btn { flex-shrink: 0; width: 34px; height: 34px; background: var(--cyber-yellow); color: black; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: box-shadow 0.2s; }
    .send-btn:hover { box-shadow: 0 0 10px rgba(252,238,10,0.4); }
    .send-btn:disabled { background: #374151; color: #6b7280; }
    .hidden-file { display: none; }

    /* ── Пустые состояния ───────────────────────────────────────────── */
    .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
    .empty-icon { font-size: 2rem; opacity: 0.4; }
    .empty-title { font-size: 0.85rem; color: #94a3b8; font-weight: 600; }
    .empty-hint { font-size: 0.75rem; color: #475569; line-height: 1.5; }
    .link { color: var(--cyber-yellow); text-decoration: underline; }

    .favorites-row { border-bottom: 1px solid rgba(252,238,10,0.08); }
    .favorites-row:hover { background: rgba(252,238,10,0.04); }
    .favorites-icon { width: 42px; height: 42px; border-radius: 50%; background: rgba(252,238,10,0.1); border: 1px solid rgba(252,238,10,0.25); display: flex; align-items: center; justify-content: center; color: var(--cyber-yellow); flex-shrink: 0; }
    .favorites-name { color: var(--cyber-yellow) !important; }
    .favorites-icon-sm { width: 32px; height: 32px; border-radius: 50%; background: rgba(252,238,10,0.1); display: flex; align-items: center; justify-content: center; color: var(--cyber-yellow); flex-shrink: 0; }


    /* ── Разделители по дням ────────────────────────────────────── */
    .day-sep { display: flex; align-items: center; justify-content: center; margin: 0.75rem 0 0.5rem; }
    .day-sep span { font-family: 'Chakra Petch', monospace; font-size: 0.62rem; color: #475569; background: rgba(15,20,30,0.8); border: 1px solid rgba(255,255,255,0.06); padding: 0.2rem 0.65rem; border-radius: 10px; letter-spacing: 0.08em; }

    /* ── Галочки прочтения ──────────────────────────────────────── */
    .ticks { font-size: 0.55rem; color: rgba(255,255,255,0.3); margin-left: 2px; letter-spacing: -1px; }
    .ticks.read { color: var(--cyber-cyan, #00f0ff); }

    /* ── Кнопка копирования ─────────────────────────────────────── */
    .copy-btn-msg { position: absolute; bottom: -10px; right: -48px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(20,25,35,0.95); border: 1px solid rgba(255,255,255,0.12); border-radius: 50%; z-index: 10; color: #94a3b8; opacity: 0; transition: opacity 0.15s, color 0.15s; }
    .msg-bubble-wrap:hover .copy-btn-msg { opacity: 1; }
    .copy-btn-msg:hover { color: white; }
    .copy-btn-msg.react-own { right: auto; left: -48px; }

    /* ── Typing indicator ────────────────────────────────────────── */
    .typing-indicator { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.75rem 0.1rem; flex-shrink: 0; }
    .typing-avatar img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; opacity: 0.7; }
    .typing-dots { display: flex; align-items: center; gap: 3px; background: rgba(31,41,55,0.7); border: 1px solid rgba(75,85,99,0.4); border-radius: 12px; padding: 6px 10px; }
    .typing-dots span { width: 5px; height: 5px; border-radius: 50%; background: #64748b; animation: typing-bounce 1.2s ease-in-out infinite; }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

</style>