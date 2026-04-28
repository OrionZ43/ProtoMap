<!-- src/routes/messages/+page.svelte -->
<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { userStore, chat } from '$lib/stores';
    import {
        chats, activeChat, messages, partnerTyping, totalUnread,
        startInbox, stopInbox, openChat, closeChat, setTyping, destroyDM,
        type DMChat, type DMMessage
    } from '$lib/stores/dmStore';
    import {
        collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, getDocs,
        setDoc, updateDoc, addDoc, serverTimestamp, increment,
        type Unsubscribe
    } from 'firebase/firestore';
    import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
    import { db, rtdb } from '$lib/firebase';
    import { onValue, ref, off } from 'firebase/database';
    import VoiceMessage from '$lib/components/chat/VoiceMessage.svelte';

// ── Загрузка стикер-паков из mobileapp/sticker_packs ─────────────────
    type StickerPack = { id: string; name: string; folder: string; stickers: string[]; iconUrl: string };
    let stickerPacks: StickerPack[] = [];
    let activePack: StickerPack | null = null;

    // UI state
    let messageText    = '';
    let isSending      = false;
    let isRecording    = false;
    let uploadProgress = 0;
    let showStickerPicker = false;
    let hoveredMsg: string | null = null;
    let reactionPanelMsg: string | null = null;

    let partnerPresence: { state: string, last_changed: number } | null = null;
    let presenceUnsubscribe: (() => void) | null = null;

    $: if ($activeChat?.partner?.uid) {
        if (presenceUnsubscribe) { presenceUnsubscribe(); presenceUnsubscribe = null; }
        if (rtdb) {
            const statusRef = ref(rtdb, `status/${$activeChat.partner.uid}`);
            const cb = onValue(statusRef, (snap) => {
                if (snap.exists()) {
                    partnerPresence = snap.val();
                } else {
                    partnerPresence = null;
                }
            });
            presenceUnsubscribe = () => off(statusRef, 'value', cb);
        }
    } else {
        if (presenceUnsubscribe) { presenceUnsubscribe(); presenceUnsubscribe = null; }
        partnerPresence = null;
    }

    onDestroy(() => {
        if (presenceUnsubscribe) {
            presenceUnsubscribe();
        }
    });

    function formatRelativeTime(timestamp: number) {
        if (!timestamp) return '';
        const now = Date.now();
        const diffInSeconds = Math.floor((now - timestamp) / 1000);

        if (diffInSeconds < 60) return 'только что';
        if (diffInSeconds < 3600) {
            const m = Math.floor(diffInSeconds / 60);
            return `${m} м. назад`;
        }
        if (diffInSeconds < 86400) {
            const h = Math.floor(diffInSeconds / 3600);
            return `${h} ч. назад`;
        }

        const date = new Date(timestamp);
        return date.toLocaleDateString('ru-RU');
    }

    let messagesWindow: HTMLDivElement;
    let fileInputEl: HTMLInputElement;
    let mediaRecorder: MediaRecorder | null = null;
    let audioChunks: Blob[] = [];

    // Вкладки
    type Tab = 'dm' | 'channels' | 'favorites';
    let activeTab: Tab = 'dm';

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

    onMount(() => {
        const t = $page.url.searchParams.get('tab') as Tab;
        if (t) activeTab = t;

        if ($userStore.user) startInbox($userStore.user.uid);
        loadStickerPacks();

        // pendingDM от кнопки "Написать" на профиле
        const unsub = chat.subscribe(state => {
            if (state.pendingDM && $userStore.user) {
                const partner = state.pendingDM;
                chat.clearPendingDM();
                activeTab = 'dm';
                const myUid  = $userStore.user.uid;
                const chatId = [myUid, partner.uid].sort().join('_');
                openChat({
                    id: chatId, partner,
                    lastMessage: '', lastMessageTimestamp: null, unread: 0,
                }, myUid);
            }
        });

        // Обновляем бейдж виджета
        const unsubUnread = totalUnread.subscribe(n => chat.setDmUnread(n > 0));

        return () => { unsub(); unsubUnread(); };
    });

    onDestroy(() => {
        const uid = $userStore.user?.uid;
        if (uid) destroyDM(uid, $activeChat?.id);
    });

    $: if ($messages.length > 0 && messagesWindow) {
        tick().then(() => { messagesWindow.scrollTop = messagesWindow.scrollHeight; });
    }

    // ── Открыть чат ────────────────────────────────────────────────────────
    function handleOpenChat(dmChat: DMChat) {
        if (!$userStore.user) return;
        openChat(dmChat, $userStore.user.uid);
        showStickerPicker = false;
    }

    function handleCloseChat() {
        if (!$userStore.user || !$activeChat) return;
        closeChat($userStore.user.uid, $activeChat.id);
    }

    function openFavorites() {
        if (!$userStore.user) return;
        const me = $userStore.user;
        openChat({
            id: me.uid + '_' + me.uid,
            partner: { uid: me.uid, username: 'Избранное', avatarUrl: null, frameId: null },
            lastMessage: '', lastMessageTimestamp: null, unread: 0,
        }, me.uid);
    }

    // ── Отправка ───────────────────────────────────────────────────────────
    async function sendMessage() {
        if (isSending || !messageText.trim() || !$activeChat || !$userStore.user) return;
        isSending = true;
        const text = messageText.trim();
        messageText = '';
        await _write({ type: 'TEXT', text });
        isSending = false;
    }

    async function handleFileSelect(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file || !$activeChat || !$userStore.user || !file.type.startsWith('image/')) return;
        isSending = true; uploadProgress = 0;
        try {
            const storage = getStorage();
            const ext = file.name.split('.').pop() ?? 'jpg';
            const msgRef = doc(collection(db, 'chats', $activeChat.id, 'messages'));
            const task = uploadBytesResumable(storageRef(storage, `chat_media/${$activeChat.id}/image/${msgRef.id}.${ext}`), file, { contentType: file.type });
            await new Promise<void>((res, rej) => {
                task.on('state_changed', s => { uploadProgress = Math.round(s.bytesTransferred / s.totalBytes * 100); }, rej,
                    async () => { const url = await getDownloadURL(task.snapshot.ref); await _write({ type: 'IMAGE', text: '', media_url: url }, msgRef); res(); });
            });
        } catch(e) { console.error(e); }
        finally { isSending = false; uploadProgress = 0; (e.target as HTMLInputElement).value = ''; }
    }

    async function toggleRecording() {
        if (isRecording) { mediaRecorder?.stop(); isRecording = false; return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (!$activeChat || !$userStore.user) return;
                isSending = true;
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                const storage = getStorage();
                const msgRef = doc(collection(db, 'chats', $activeChat.id, 'messages'));
                const task = uploadBytesResumable(storageRef(storage, `chat_media/${$activeChat.id}/voice/${msgRef.id}.webm`), blob, { contentType: 'audio/webm' });
                await task;
                await _write({ type: 'VOICE', text: '', media_url: await getDownloadURL(task.snapshot.ref) }, msgRef);
                isSending = false;
            };
            mediaRecorder.start(); isRecording = true;
        } catch(e) { console.error(e); }
    }

    async function sendSticker(packId: string, filename: string) {
        showStickerPicker = false;
        await _write({ type: 'STICKER', text: '', sticker_pack_id: packId, sticker_id: filename });
    }

    async function _write(fields: Partial<DMMessage> & { type: string }, ref?: any) {
        if (!$activeChat || !$userStore.user) return;
        const { uid: myUid, username: myName, avatar_url } = $userStore.user;
        const { id: chatId, partner } = $activeChat;
        const msgRef = ref ?? doc(collection(db, 'chats', chatId, 'messages'));
        await setDoc(msgRef, {
            author_uid: myUid, author_username: myName,
            text: fields.text ?? '', type: fields.type,
            media_url: fields.media_url ?? null,
            sticker_pack_id: fields.sticker_pack_id ?? null,
            sticker_id: fields.sticker_id ?? null,
            createdAt: serverTimestamp(), is_deleted: false,
            reactions: {}, read_by: {}, replyTo: null,
        });
        const preview = fields.type.includes('IMAGE') ? '📷 Изображение'
                      : fields.type.includes('VOICE') ? '🎙 Голосовое'
                      : fields.type.includes('STICKER') ? '🌟 Стикер'
                      : fields.text ?? '';
        await setDoc(doc(db, 'chats', chatId), {
            lastMessage: preview, lastMessageTimestamp: serverTimestamp(),
            participantIds: [myUid, partner.uid],
            participants: { [myUid]: { username: myName, avatarUrl: avatar_url ?? null }, [partner.uid]: { username: partner.username, avatarUrl: partner.avatarUrl ?? null } },
            [`unreadCount.${partner.uid}`]: increment(1),
        }, { merge: true });
    }

    async function toggleReaction(msg: DMMessage, emoji: string) {
        if (!$userStore.user || !$activeChat) return;
        const uid = $userStore.user.uid;
        const ref = doc(db, 'chats', $activeChat.id, 'messages', msg.id);
        if (msg.reactions[uid] === emoji) {
            const r = { ...msg.reactions }; delete r[uid];
            await updateDoc(ref, { reactions: r });
        } else {
            await updateDoc(ref, { [`reactions.${uid}`]: emoji });
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    function onInputTyping() {
        if ($activeChat && $userStore.user) setTyping($activeChat.id, $userStore.user.uid);
    }

    function toggleReactionPanel(msgId: string, e: MouseEvent) {
        e.stopPropagation(); reactionPanelMsg = reactionPanelMsg === msgId ? null : msgId;
    }

    // ── Утилиты ────────────────────────────────────────────────────────────
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
    function fmt(date: Date) { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    function fmtDate(date: Date | null) {
        if (!date) return '';
        const d = Date.now() - date.getTime();
        if (d < 60_000) return 'только что';
        if (d < 3_600_000) return `${Math.floor(d/60_000)} мин`;
        if (d < 86_400_000) return fmt(date);
        return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }
    function isSameDay(a: Date, b: Date) {
        return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
    }
    function dayLabel(date: Date) {
        const t = new Date(), y = new Date(t); y.setDate(y.getDate()-1);
        if (isSameDay(date,t)) return 'Сегодня';
        if (isSameDay(date,y)) return 'Вчера';
        return date.toLocaleDateString('ru',{day:'numeric',month:'long'});
    }
    function countReactions(r: Record<string,string>) {
        const c: Record<string,number>={};
        Object.values(r).forEach(e=>{c[e]=(c[e]??0)+1;});
        return Object.entries(c);
    }
    const QUICK = ['❤️','🔥','😂','👍','😮'];
</script>

<svelte:head><title>Сообщения | ProtoMap</title></svelte:head>

<div class="page" in:fade={{ duration: 200 }}>

    <!-- ══ ЛЕВАЯ КОЛОНКА ══════════════════════════════════════════════════ -->
    <aside class="sidebar">
        <div class="sidebar-top">
            <span class="sidebar-title">// СООБЩЕНИЯ</span>
            {#if $totalUnread > 0}<span class="total-badge">{$totalUnread}</span>{/if}
        </div>

        <nav class="tabs">
            <button class="tab" class:active={activeTab==='dm'} on:click={() => activeTab='dm'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Личные
                {#if $totalUnread > 0}<span class="tab-badge">{$totalUnread}</span>{/if}
            </button>
            <button class="tab" class:active={activeTab==='channels'} on:click={() => { activeTab='channels'; goto('/messages?tab=channels',{replaceState:true}); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 8.35V20a2 2 0 01-2 2H4a2 2 0 01-2-2V8.35A2 2 0 012.61 7l8-5a2 2 0 012.78 0l8 5A2 2 0 0122 8.35z"/><path d="M15 22v-4a5 5 0 00-6 0v4"/></svg>
                Каналы
            </button>
            <button class="tab fav-tab" on:click={openFavorites}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>
                Избранное
            </button>
        </nav>

        <!-- Список чатов -->
        {#if activeTab !== 'channels'}
            <div class="chat-list">
                <!-- Избранное первым -->
                {#if $userStore.user}
                    <button class="chat-row fav-row" on:click={openFavorites}
                            class:active={$activeChat?.partner.uid === $userStore.user.uid}>
                        <div class="fav-icon-wrap">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>
                        </div>
                        <div class="chat-info"><span class="chat-name fav-name">Избранное</span><span class="chat-prev">Заметки и файлы</span></div>
                    </button>
                {/if}

                {#each $chats as dmChat (dmChat.id)}
                    <button class="chat-row" on:click={() => handleOpenChat(dmChat)}
                            class:active={$activeChat?.id === dmChat.id}>
                        <div class="ava-wrap">
                            <img src={dmChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${dmChat.partner.username}`}
                                 alt={dmChat.partner.username} class="ava" />
                            {#if dmChat.unread > 0}<span class="unread-dot">{dmChat.unread > 99 ? '99+' : dmChat.unread}</span>{/if}
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

                {#if $chats.length === 0 && $userStore.user}
                    <div class="list-empty">
                        <span>Нет диалогов</span>
                        <small>Напиши кому-нибудь через профиль</small>
                    </div>
                {/if}
            </div>
        {:else}
            <!-- Каналы — просто ссылка на виджет для теперь -->
            <div class="list-empty"><span>Каналы в виджете</span><small>Нажми иконку чата внизу справа</small></div>
        {/if}
    </aside>

    <!-- ══ ПРАВАЯ КОЛОНКА ══════════════════════════════════════════════════ -->
    <main class="main-area">
        {#if !$activeChat}
            <div class="placeholder">
                <div class="ph-icon">💬</div>
                <p class="ph-title font-display">ВЫБЕРИ ЧАТ</p>
                <p class="ph-hint">Выбери диалог из списка слева</p>
            </div>
        {:else}
            <!-- Хедер переписки -->
            {@const isFav = $activeChat.partner.uid === $userStore.user?.uid}
            <div class="chat-header">
                <div class="chat-header-info">
                    {#if isFav}
                        <div class="fav-icon-sm"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg></div>
                        <span class="partner-name">Избранное</span>
                    {:else}
                        <img src={$activeChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$activeChat.partner.username}`}
                             alt="" class="partner-ava" />

                        <div class="chat-partner-info">
                            <a href="/u/{$activeChat.partner.uid}" class="partner-name">{$activeChat.partner.username}</a>
                            {#if partnerPresence}
                                {#if partnerPresence.state === 'online'}
                                    <span class="presence-dot online"></span>
                                {:else if partnerPresence.last_changed}
                                    <span class="presence-text">Был(а) в сети: {formatRelativeTime(partnerPresence.last_changed)}</span>
                                {/if}
                            {/if}
                        </div>

                        {#if $partnerTyping}<span class="typing-status">печатает...</span>{/if}
                    {/if}
                </div>
                <button class="close-chat-btn" on:click={handleCloseChat} title="Закрыть">×</button>
            </div>

            <!-- Сообщения -->
            <div class="msg-list" bind:this={messagesWindow} on:click={() => reactionPanelMsg=null}>
                {#each $messages as msg, idx (msg.id)}
                    {@const isOwn = msg.author_uid === $userStore.user?.uid}
                    {@const prev = $messages[idx-1]}

                    {#if !prev || !isSameDay(msg.createdAt, prev.createdAt)}
                        <div class="day-sep"><span>{dayLabel(msg.createdAt)}</span></div>
                    {/if}

                    <div class="msg-row" class:own={isOwn}
                         on:mouseenter={() => hoveredMsg=msg.id}
                         on:mouseleave={() => hoveredMsg=null}>
                        {#if !isOwn}
                            <img src={$activeChat.partner.avatarUrl || `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$activeChat.partner.username}`}
                                 alt="" class="msg-ava" />
                        {/if}

                        <div class="bubble-wrap" class:own={isOwn}>
                            <div class="bubble" class:own={isOwn}
                                 class:sticker={msg.type==='sticker'||msg.type==='STICKER'}>
                                {#if msg.is_deleted}
                                    <span class="deleted">Удалено</span>
                                {:else if (msg.type==='sticker'||msg.type==='STICKER') && msg.sticker_pack_id && msg.sticker_id}
                                    <img src={getStickerUrl(msg.sticker_pack_id, msg.sticker_id)} alt="sticker" class="sticker-img" loading="lazy"/>
                                {:else if (msg.type==='IMAGE'||msg.type==='image') && msg.media_url}
                                    <a href={msg.media_url} target="_blank" rel="noopener"><img src={msg.media_url} alt="" class="chat-img" loading="lazy"/></a>
                                {:else if (msg.type==='IMAGE'||msg.type==='image') && msg.text}
                                    <img src="data:image/jpeg;base64,{msg.text}" alt="" class="chat-img" loading="lazy"/>
                                {:else if (msg.type==='VOICE'||msg.type==='voice')}
                                    {#if msg.media_url}<VoiceMessage src={msg.media_url} {isOwn}/>
                                    {:else if msg.text}<VoiceMessage src="data:audio/aac;base64,{msg.text}" {isOwn}/>
                                    {/if}
                                {:else}
                                    <p class="msg-text">{msg.text}</p>
                                {/if}

                                {#if msg.type!=='sticker' && msg.type!=='STICKER'}
                                    <span class="msg-time">
                                        {fmt(msg.createdAt)}
                                        {#if isOwn}
                                            {@const read = $activeChat && msg.read_by?.[$activeChat.partner.uid]}
                                            <span class="ticks" class:read>{read ? '✓✓' : '✓'}</span>
                                        {/if}
                                    </span>
                                {/if}
                            </div>

                            <!-- Эмодзи -->
                            {#if hoveredMsg===msg.id && $userStore.user}
                                <button class="react-btn" class:own={isOwn}
                                        on:click={(e)=>toggleReactionPanel(msg.id,e)}>😊</button>
                            {/if}
                            {#if reactionPanelMsg===msg.id}
                                <div class="react-panel" class:own={isOwn}>
                                    {#each QUICK as e}<button class="rp-btn" on:click={()=>{toggleReaction(msg,e);reactionPanelMsg=null;}}>{e}</button>{/each}
                                </div>
                            {/if}

                            {#if Object.keys(msg.reactions).length > 0}
                                <div class="reactions" class:own={isOwn}>
                                    {#each countReactions(msg.reactions) as [e,n]}
                                        <button class="rpill" class:mine={msg.reactions[$userStore.user?.uid ?? ''] === e}
                                                on:click={()=>toggleReaction(msg,e)}>{e} {n}</button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}

                {#if $partnerTyping}
                    <div class="typing-row">
                        <img src={$activeChat.partner.avatarUrl||`https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${$activeChat.partner.username}`} alt="" class="msg-ava"/>
                        <div class="typing-bubble"><span></span><span></span><span></span></div>
                    </div>
                {/if}
            </div>

            <!-- Стикер-пикер -->
            {#if showStickerPicker}
                <div class="sticker-picker">
                    <div class="pack-tabs">
                        {#each stickerPacks as pack}
                            <button class="ptab" class:active={activePack?.id===pack.id} on:click={()=>activePack=pack}>
                                <img src={pack.iconUrl} alt={pack.name} class="ptab-img"/>
                            </button>
                        {/each}
                    </div>
                    <div class="sticker-grid">
                        {#if activePack}
                            {#each activePack.stickers as filename}
                                <button class="sbtn" on:click={() => sendSticker(activePack!.id, filename)}>
                                    <img src={getStickerUrl(activePack!.id, filename)} alt="" loading="lazy" class="simg"/>
                                </button>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- Ввод -->
            <div class="input-area">
                {#if uploadProgress > 0}
                    <div class="upload-bar"><div class="upload-fill" style="width:{uploadProgress}%"></div></div>
                {/if}
                <div class="input-row">
                    <button class="tool" on:click={()=>fileInputEl.click()} disabled={isSending} title="Изображение">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <input bind:this={fileInputEl} type="file" accept="image/*" style="display:none" on:change={handleFileSelect}/>

                    <button class="tool" on:click={()=>showStickerPicker=!showStickerPicker} title="Стикеры">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                    </button>

                    <textarea bind:value={messageText}
                        on:keydown={handleKeydown} on:input={onInputTyping}
                        placeholder={isRecording ? '🔴 Запись...' : 'Написать...'}
                        disabled={isSending||isRecording} class="input-field" rows="1"
                        maxlength="1000"></textarea>

                    {#if isRecording}
                        <div class="rec-wrap">
                            <div class="rec-ring r1"></div><div class="rec-ring r2"></div><div class="rec-ring r3"></div>
                            <button class="stop-btn" on:click={toggleRecording}><div class="stop-sq"></div></button>
                        </div>
                    {:else if messageText.trim()}
                        <button class="send" on:click={sendMessage} disabled={isSending}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/></svg>
                        </button>
                    {:else}
                        <button class="tool" on:click={toggleRecording} title="Голосовое">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                        </button>
                    {/if}
                </div>
            </div>
        {/if}
    </main>
</div>

<style>
    :global(body) { overflow: hidden; }
    .page { display: flex; height: calc(100vh - 64px); background: #060609; overflow: hidden; }

    /* ── Сайдбар ──────────────────────────────────────────────── */
    .sidebar { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,0.06); background: rgba(9,11,17,0.98); }
    .sidebar-top { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
    .sidebar-title { font-family: 'Chakra Petch', monospace; font-size: 0.72rem; color: var(--cyber-yellow); letter-spacing: 0.2em; opacity: 0.8; }
    .total-badge { background: #ff003c; color: white; font-size: 0.58rem; font-weight: 900; min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }

    .tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
    .tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.25rem; padding: 0.55rem 0.2rem; font-family: 'Chakra Petch', monospace; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.06em; color: #475569; border-bottom: 2px solid transparent; transition: color 0.2s, border-color 0.2s; }
    .tab:hover { color: #94a3b8; }
    .tab.active { color: var(--cyber-yellow); border-bottom-color: var(--cyber-yellow); }
    .fav-tab { color: #475569; }
    .fav-tab:hover { color: var(--cyber-yellow); }
    .tab-badge { background: #ff003c; color: white; font-size: 0.5rem; font-weight: 900; min-width: 13px; height: 13px; border-radius: 7px; display: flex; align-items: center; justify-content: center; padding: 0 2px; }

    .chat-list { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
    .chat-row { width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s; text-align: left; }
    .chat-row:hover { background: rgba(255,255,255,0.04); }
    .chat-row.active { background: rgba(252,238,10,0.06); border-left: 2px solid var(--cyber-yellow); }
    .fav-row:hover { background: rgba(252,238,10,0.04); }
    .fav-icon-wrap { width: 42px; height: 42px; border-radius: 50%; background: rgba(252,238,10,0.1); border: 1px solid rgba(252,238,10,0.2); display: flex; align-items: center; justify-content: center; color: var(--cyber-yellow); flex-shrink: 0; }
    .ava-wrap { position: relative; flex-shrink: 0; }
    .ava { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
    .unread-dot { position: absolute; top: -2px; right: -2px; background: #ff003c; color: white; font-size: 0.55rem; font-weight: 900; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 3px; }
    .chat-info { flex: 1; min-width: 0; }
    .chat-row-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.15rem; }
    .chat-name { font-size: 0.85rem; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-name.bold { font-weight: 700; color: #fff; }
    .fav-name { color: var(--cyber-yellow); font-weight: 600; }
    .chat-time { font-size: 0.6rem; color: #475569; flex-shrink: 0; }
    .chat-prev { font-size: 0.75rem; color: #64748b; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-prev.bold { color: #94a3b8; }
    .list-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; color: #475569; font-size: 0.82rem; }
    .list-empty small { font-size: 0.72rem; color: #334155; }

    /* ── Основная область ──────────────────────────────────────── */
    .main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; }
    .ph-icon { font-size: 3rem; opacity: 0.15; }
    .ph-title { font-size: 0.85rem; letter-spacing: 0.2em; color: #334155; }
    .ph-hint { font-size: 0.75rem; color: #1e293b; }

    /* Хедер чата */
    .chat-header { display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; background: rgba(9,11,17,0.9); }
    .chat-header-info { display: flex; align-items: center; gap: 0.65rem; }
    .partner-ava { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; }

    .partner-name { font-size: 0.95rem; font-weight: 700; color: #e2e8f0; text-decoration: none; }

    .chat-partner-info { display: flex; align-items: baseline; gap: 0.4rem; }
    .presence-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .presence-dot.online { background-color: #39ff14; box-shadow: 0 0 5px #39ff14; }
    .presence-text { font-size: 0.65rem; color: #64748b; font-family: 'Chakra Petch', monospace; }

    .partner-name:hover { color: var(--cyber-yellow); }
    .fav-icon-sm { width: 34px; height: 34px; border-radius: 50%; background: rgba(252,238,10,0.1); display: flex; align-items: center; justify-content: center; color: var(--cyber-yellow); }
    .typing-status { font-size: 0.72rem; color: #64748b; font-style: italic; }
    .close-chat-btn { font-size: 1.4rem; color: #475569; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.2s, transform 0.2s; }
    .close-chat-btn:hover { color: #fff; transform: rotate(90deg); }

    /* Список сообщений */
    .msg-list { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.35rem; scrollbar-width: thin; scrollbar-color: #334155 transparent; }

    .day-sep { display: flex; align-items: center; justify-content: center; margin: 0.5rem 0; }
    .day-sep span { font-family: 'Chakra Petch', monospace; font-size: 0.6rem; color: #475569; background: rgba(15,20,30,0.9); border: 1px solid rgba(255,255,255,0.06); padding: 0.18rem 0.6rem; border-radius: 10px; letter-spacing: 0.08em; }

    .msg-row { display: flex; align-items: flex-end; gap: 0.5rem; }
    .msg-row.own { flex-direction: row-reverse; }
    .msg-ava { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }

    .bubble-wrap { display: flex; flex-direction: column; max-width: 60%; position: relative; gap: 0.25rem; }
    .bubble-wrap.own { align-items: flex-end; }
    .bubble { padding: 0.55rem 0.7rem 1.45rem; border-radius: 14px; position: relative; background: rgba(31,41,55,0.75); border: 1px solid rgba(75,85,99,0.35); }
    .bubble.own { background: rgba(252,238,10,0.08); border-color: rgba(252,238,10,0.18); }
    .bubble.sticker { background: transparent !important; border: none !important; padding: 0 !important; }
    .msg-text { font-size: 0.88rem; color: #e2e8f0; white-space: pre-wrap; word-break: break-words; line-height: 1.45; }
    .msg-time { position: absolute; bottom: 0.3rem; right: 0.5rem; font-size: 0.6rem; color: #6b7280; display: flex; align-items: center; gap: 2px; }
    .ticks { font-size: 0.55rem; color: rgba(255,255,255,0.3); letter-spacing: -1px; }
    .ticks.read { color: var(--cyber-cyan, #00f0ff); }
    .deleted { font-size: 0.8rem; color: #64748b; font-style: italic; }
    .chat-img { max-width: 280px; max-height: 220px; border-radius: 10px; object-fit: cover; display: block; cursor: pointer; }
    .sticker-img { width: 120px; height: 120px; object-fit: contain; }

    /* Реакции */
    .react-btn { position: absolute; bottom: -10px; right: -10px; font-size: 0.85rem; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(20,25,35,0.95); border: 1px solid rgba(255,255,255,0.12); border-radius: 50%; z-index: 10; opacity: 0; transition: opacity 0.15s; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .react-btn.own { right: auto; left: -10px; }
    .bubble-wrap:hover .react-btn { animation: delayed-show 0.8s forwards; }
    @keyframes delayed-show { 0%,79%{opacity:0} 80%,100%{opacity:1} }
    .react-panel { position: absolute; bottom: 20px; right: -10px; display: flex; gap: 2px; background: rgba(10,12,18,0.97); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 4px 8px; z-index: 20; box-shadow: 0 4px 16px rgba(0,0,0,0.6); animation: pop-in 0.12s cubic-bezier(0.34,1.56,0.64,1); }
    .react-panel.own { right: auto; left: -10px; }
    @keyframes pop-in { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
    .rp-btn { font-size: 1.2rem; padding: 2px 3px; border-radius: 6px; transition: transform 0.12s; }
    .rp-btn:hover { transform: scale(1.35); }
    .reactions { display: flex; flex-wrap: wrap; gap: 3px; }
    .reactions.own { justify-content: flex-end; }
    .rpill { font-size: 0.72rem; padding: 2px 7px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.15s; }
    .rpill.mine { background: rgba(252,238,10,0.12); border-color: rgba(252,238,10,0.3); }

    /* Typing */
    .typing-row { display: flex; align-items: flex-end; gap: 0.5rem; }
    .typing-bubble { display: flex; align-items: center; gap: 3px; background: rgba(31,41,55,0.75); border: 1px solid rgba(75,85,99,0.35); border-radius: 14px; padding: 10px 14px; }
    .typing-bubble span { width: 5px; height: 5px; border-radius: 50%; background: #64748b; animation: tb 1.2s ease-in-out infinite; }
    .typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
    .typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes tb { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-4px);opacity:1} }

    /* Стикер-пикер */
    .sticker-picker { flex-shrink: 0; height: 240px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(5,8,12,0.98); display: flex; flex-direction: column; }
    .pack-tabs { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); overflow-x: auto; scrollbar-width: none; }
    .ptab { flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; overflow: hidden; padding: 2px; border: 2px solid transparent; transition: border-color 0.15s; }
    .ptab.active { border-color: var(--cyber-yellow); }
    .ptab-img { width: 100%; height: 100%; object-fit: contain; }
    .sticker-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: 70px; gap: 6px; padding: 8px; scrollbar-width: thin; scrollbar-color: #334155 transparent; align-content: start; }
    .sbtn { width: 100%; height: 70px; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 4px; transition: background 0.15s; }
    .sbtn:hover { background: rgba(255,255,255,0.08); }
    .simg { width: 62px; height: 62px; object-fit: contain; }

    /* Ввод */
    .input-area { flex-shrink: 0; border-top: 1px solid rgba(55,65,81,0.5); background: rgba(9,11,17,0.95); }
    .upload-bar { height: 2px; background: rgba(255,255,255,0.05); }
    .upload-fill { height: 100%; background: var(--cyber-yellow); transition: width 0.2s; }
    .input-row { display: flex; align-items: flex-end; gap: 6px; padding: 8px 12px; }
    .tool { flex-shrink: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #64748b; border-radius: 8px; transition: color 0.2s, background 0.2s; }
    .tool:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }
    .tool:disabled { opacity: 0.35; }
    .input-field { flex: 1; padding: 0.55rem 0.65rem; background: rgba(31,41,55,0.7); color: #e2e8f0; resize: none; outline: none; border: 1px solid transparent; border-radius: 10px; font-size: 0.9rem; transition: border-color 0.2s; max-height: 120px; overflow-y: auto; }
    .input-field:focus { border-color: var(--cyber-yellow); }
    .send { flex-shrink: 0; width: 36px; height: 36px; background: var(--cyber-yellow); color: black; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: box-shadow 0.2s; }
    .send:hover { box-shadow: 0 0 12px rgba(252,238,10,0.4); }
    .send:disabled { background: #374151; color: #6b7280; }

    /* Запись */
    .rec-wrap { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .rec-ring { position: absolute; border-radius: 50%; border: 1.5px solid #ff003c; inset: 0; animation: ring-expand 1.8s ease-out infinite; }
    .rec-ring.r2 { animation-delay: 0.6s; } .rec-ring.r3 { animation-delay: 1.2s; }
    @keyframes ring-expand { 0%{transform:scale(0.4);opacity:0.8} 100%{transform:scale(1.6);opacity:0} }
    .stop-btn { position: relative; z-index: 1; width: 24px; height: 24px; border-radius: 50%; background: #ff003c; display: flex; align-items: center; justify-content: center; }
    .stop-sq { width: 8px; height: 8px; background: white; border-radius: 1px; }

    /* Адаптивность */
    @media (max-width: 768px) {
        .sidebar { width: 100%; display: flex; }
        .main-area { display: none; }
    }
</style>