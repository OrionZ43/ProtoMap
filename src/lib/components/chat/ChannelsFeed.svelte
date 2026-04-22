<!-- src/lib/components/chat/ChannelsFeed.svelte -->
<!-- Вкладка каналов: список каналов → лента постов -->
<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { db } from '$lib/firebase';
    import {
        collection, query, where, orderBy, limit, onSnapshot, doc,
        setDoc, updateDoc, deleteDoc, deleteField, addDoc,
        serverTimestamp, increment, arrayUnion, arrayRemove,
        type Unsubscribe, type Timestamp
    } from 'firebase/firestore';
    import { userStore } from '$lib/stores';
    import VoiceMessage from '$lib/components/chat/VoiceMessage.svelte';

    type Channel = {
        id: string; name: string; description: string;
        avatarUrl: string | null; ownerUid: string;
        subscriberCount: number; isSubscribed: boolean;
        lastPostText: string; lastMessageTimestamp: Date | null;
    };

    type Post = {
        id: string; text: string; author_uid: string; author_username: string;
        createdAt: Date; type: string; media_url: string | null;
        is_deleted: boolean; reactions: Record<string, string>;
        edited_text: string | null; owner_uid: string;
    };

    // ── Состояние ──────────────────────────────────────────────────────────
    let view: 'list' | 'channel' = 'list';
    let channels: Channel[] = [];
    let activeChannel: Channel | null = null;
    let posts: Post[] = [];
    let newPostText = '';
    let isPosting = false;

    let unsubChannels: Unsubscribe | null = null;
    let unsubPosts: Unsubscribe | null = null;

    export function onTabActivated() { /* ничего особенного */ }

    onMount(() => subscribeChannels());
    onDestroy(() => { unsubChannels?.(); unsubPosts?.(); });

    // ── Каналы ─────────────────────────────────────────────────────────────
    function subscribeChannels() {
        const uid = $userStore.user?.uid;
        unsubChannels?.();

        // Показываем каналы на которые подписан пользователь
        // + его собственные каналы
        // Для простоты — загружаем все публичные (их немного на старте)
        const q = query(
            collection(db, 'channels'),
            orderBy('lastMessageTimestamp', 'desc'),
            limit(20)
        );

        unsubChannels = onSnapshot(q, snap => {
            channels = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.name ?? 'Канал',
                    description: data.description ?? '',
                    avatarUrl: data.avatarUrl ?? null,
                    ownerUid: data.ownerUid ?? '',
                    subscriberCount: data.subscriberCount ?? 0,
                    isSubscribed: uid ? (data.subscriberUids ?? []).includes(uid) : false,
                    lastPostText: data.lastPostText ?? '',
                    lastMessageTimestamp: (data.lastMessageTimestamp as Timestamp)?.toDate() ?? null,
                };
            });
        });
    }

    // ── Открыть канал ──────────────────────────────────────────────────────
    function openChannel(channel: Channel) {
        unsubPosts?.();
        activeChannel = channel;
        view = 'channel';
        posts = [];

        const q = query(
            collection(db, 'channels', channel.id, 'posts'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        unsubPosts = onSnapshot(q, snap => {
            posts = snap.docs.map(d => {
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
                    owner_uid: data.owner_uid ?? '',
                };
            });
        });
    }

    function backToList() {
        unsubPosts?.();
        view = 'list';
        activeChannel = null;
        posts = [];
    }

    // ── Подписка/отписка с защитой от спама ───────────────────────────────
    let isSubscribing = false;
    let lastSubscribeTime = 0;
    const SUBSCRIBE_COOLDOWN = 2000; // 2 секунды между нажатиями

    async function toggleSubscribe(channel: Channel) {
        const uid = $userStore.user?.uid;
        if (!uid || isSubscribing) return;
        const now = Date.now();
        if (now - lastSubscribeTime < SUBSCRIBE_COOLDOWN) return;
        isSubscribing = true;
        lastSubscribeTime = now;

        // Оптимистично обновляем UI сразу — не ждём onSnapshot
        const wasSubscribed = channel.isSubscribed;
        channels = channels.map(c => c.id === channel.id
            ? { ...c, isSubscribed: !wasSubscribed, subscriberCount: c.subscriberCount + (wasSubscribed ? -1 : 1) }
            : c
        );
        if (activeChannel?.id === channel.id) {
            activeChannel = { ...activeChannel, isSubscribed: !wasSubscribed,
                subscriberCount: activeChannel.subscriberCount + (wasSubscribed ? -1 : 1) };
        }

        const ref = doc(db, 'channels', channel.id);
        try {
            if (wasSubscribed) {
                await updateDoc(ref, {
                    subscriberUids:  arrayRemove(uid),
                    subscriberCount: increment(-1),
                });
                await deleteDoc(doc(db, 'channels', channel.id, 'subscribers', uid));
            } else {
                await updateDoc(ref, {
                    subscriberUids:  arrayUnion(uid),
                    subscriberCount: increment(1),
                });
                await setDoc(doc(db, 'channels', channel.id, 'subscribers', uid), {
                    uid,
                    username:  $userStore.user?.username ?? '',
                    avatarUrl: $userStore.user?.avatar_url ?? null,
                    joinedAt:  serverTimestamp(),
                });
            }
        } catch (e) {
            console.error('[CHANNEL] toggle subscribe:', e);
            // Откатываем если ошибка
            channels = channels.map(c => c.id === channel.id
                ? { ...c, isSubscribed: wasSubscribed, subscriberCount: c.subscriberCount + (wasSubscribed ? 1 : -1) }
                : c
            );
            if (activeChannel?.id === channel.id) {
                activeChannel = { ...activeChannel, isSubscribed: wasSubscribed,
                    subscriberCount: activeChannel.subscriberCount + (wasSubscribed ? 1 : -1) };
            }
        }
        finally {
            setTimeout(() => { isSubscribing = false; }, 1000);
        }
    }

    // ── Публикация поста (только владелец) ────────────────────────────────
    async function publishPost() {
        if (isPosting || !newPostText.trim() || !activeChannel || !$userStore.user) return;
        if ($userStore.user.uid !== activeChannel.ownerUid) return;
        isPosting = true;
        const text = newPostText.trim();
        newPostText = '';
        try {
            await addDoc(collection(db, 'channels', activeChannel.id, 'posts'), {
                author_uid:      $userStore.user.uid,
                author_username: $userStore.user.username,
                owner_uid:       $userStore.user.uid, // КРИТИЧНО для Firestore rules
                text,
                type:            'TEXT',
                media_url:       null,
                createdAt:       serverTimestamp(),
                is_deleted:      false,
                reactions:       {},
                edited_text:     null,
                edited_at:       null,
            });
            // Обновляем превью канала
            await updateDoc(doc(db, 'channels', activeChannel.id), {
                lastPostText:         text,
                lastMessageTimestamp: serverTimestamp(),
            });
        } catch (e) {
            console.error('[CHANNEL] publish post:', e);
            newPostText = text;
        } finally { isPosting = false; }
    }

    // ── Реакция на пост ───────────────────────────────────────────────────
    async function toggleReaction(post: Post, emoji: string) {
        const uid = $userStore.user?.uid;
        if (!uid || !activeChannel) return;
        const ref = doc(db, 'channels', activeChannel.id, 'posts', post.id);
        try {
            if (post.reactions[uid] === emoji) {
                await updateDoc(ref, { [`reactions.${uid}`]: deleteField() });
            } else {
                await updateDoc(ref, { [`reactions.${uid}`]: emoji });
            }
        } catch (e) { console.error('[CHANNEL] reaction:', e); }
    }

    const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👍', '🤖'];
    let openReactPanel: string | null = null;

    function countReactions(reactions: Record<string, string>) {
        const counts: Record<string, number> = {};
        Object.values(reactions).forEach(e => { counts[e] = (counts[e] ?? 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }

    function formatTime(date: Date) {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        if (diff < 60_000) return 'только что';
        if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин`;
        if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }
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
    <!-- Хедер канала -->
    <div class="ch-feed-header">
        <button class="back-btn" on:click={backToList}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
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
        {#if $userStore.user && activeChannel.ownerUid !== $userStore.user.uid}
            <button
                class="sub-btn"
                class:subbed={activeChannel.isSubscribed}
                disabled={isSubscribing}
                on:click|stopPropagation={() => toggleSubscribe(activeChannel)}
            >
                {activeChannel.isSubscribed ? '✓' : '+'}
            </button>
        {/if}
    </div>

    <!-- Посты -->
    <div class="posts-feed">
        {#if posts.length === 0}
            <div class="empty-state"><p class="empty-hint">Постов пока нет</p></div>
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

                        <!-- Реакции — пилюли под постом -->
                        <div class="reactions-row">
                            {#each countReactions(post.reactions) as [emoji, count]}
                                <button class="reaction-pill"
                                    class:own={post.reactions[$userStore.user?.uid ?? ''] === emoji}
                                    on:click={() => toggleReaction(post, emoji)}>
                                    {emoji} {count}
                                </button>
                            {/each}
                            <!-- Кнопка добавить реакцию -->
                            {#if $userStore.user}
                                <div class="add-react-wrap">
                                    <button class="add-react-btn" on:click={(e) => { e.stopPropagation(); openReactPanel = openReactPanel === post.id ? null : post.id; }}>
                                        😊
                                    </button>
                                    {#if openReactPanel === post.id}
                                        <div class="react-panel-ch">
                                            {#each QUICK_REACTIONS as emoji}
                                                <button class="qr-btn-ch" on:click={() => { toggleReaction(post, emoji); openReactPanel = null; }}>{emoji}</button>
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

    <!-- Поле публикации (только владелец) -->
    {#if $userStore.user?.uid === activeChannel.ownerUid}
        <div class="post-input-area">
            <textarea
                bind:value={newPostText}
                on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); publishPost(); } }}
                placeholder="Новый пост..."
                disabled={isPosting}
                class="input-field"
                rows="2"
            ></textarea>
            <button on:click={publishPost} disabled={isPosting || !newPostText.trim()} class="send-btn">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/>
                </svg>
            </button>
        </div>
    {/if}
{/if}

<style>
    .channel-list { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #334155 transparent; }

    .ch-row { width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s; text-align: left; }
    .ch-row:hover { background: rgba(255,255,255,0.04); }

    .ch-avatar-wrap { flex-shrink: 0; }
    .ch-avatar { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; }
    .ch-avatar-wrap.small .ch-avatar { width: 32px; height: 32px; }
    .ch-avatar-placeholder { width: 42px; height: 42px; border-radius: 10px; background: rgba(252,238,10,0.1); border: 1px solid rgba(252,238,10,0.2); display: flex; align-items: center; justify-content: center; font-family: 'Chakra Petch', monospace; font-weight: 900; color: var(--cyber-yellow); font-size: 1.1rem; }
    .ch-avatar-placeholder.small { width: 32px; height: 32px; font-size: 0.85rem; }

    .ch-info { flex: 1; min-width: 0; }
    .ch-header-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.2rem; }
    .ch-name { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ch-sub-count { font-size: 0.62rem; color: #475569; flex-shrink: 0; }
    .ch-preview { font-size: 0.75rem; color: #64748b; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Feed header */
    .ch-feed-header { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
    .back-btn { color: #94a3b8; padding: 0.25rem; border-radius: 4px; transition: color 0.2s; }
    .back-btn:hover { color: var(--cyber-yellow); }
    .ch-feed-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .ch-sub-count-sm { font-size: 0.62rem; color: #475569; }

    .sub-btn { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(252,238,10,0.4); color: var(--cyber-yellow); font-size: 1rem; font-weight: 900; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .sub-btn:hover { background: rgba(252,238,10,0.1); }
    .sub-btn.subbed { background: rgba(252,238,10,0.15); border-color: var(--cyber-yellow); }

    /* Posts */
    .posts-feed { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
    .post-card { background: rgba(15,20,30,0.5); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 0.75rem; }
    .post-meta { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem; }
    .post-author { font-size: 0.78rem; font-weight: 700; color: var(--cyber-yellow); }
    .post-time { font-size: 0.62rem; color: #475569; }
    .post-text { font-size: 0.85rem; color: #e2e8f0; white-space: pre-wrap; word-break: break-words; line-height: 1.5; }
    .edited-mark { font-size: 0.6rem; color: #475569; font-style: italic; }

    /* Reactions */
    .reactions-row { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.5rem; align-items: center; }
    .reaction-pill { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 0.15rem 0.5rem; font-size: 0.75rem; color: #94a3b8; transition: all 0.15s; }
    .reaction-pill:hover { background: rgba(255,255,255,0.1); }
    .reaction-pill.own { background: rgba(252,238,10,0.12); border-color: rgba(252,238,10,0.3); color: var(--cyber-yellow); }
    .add-react-wrap { position: relative; margin-left: auto; }
    .add-react-btn { font-size: 0.85rem; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); transition: all 0.15s; opacity: 0.5; }
    .add-react-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
    .react-panel-ch { position: absolute; bottom: 28px; right: 0; display: flex; gap: 2px; background: rgba(10,12,18,0.97); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 4px 8px; z-index: 20; box-shadow: 0 4px 16px rgba(0,0,0,0.6); animation: pop-in 0.12s cubic-bezier(0.34,1.56,0.64,1); white-space: nowrap; }
    .qr-btn-ch { font-size: 1.2rem; padding: 2px 4px; border-radius: 6px; transition: transform 0.12s; }
    .qr-btn-ch:hover { transform: scale(1.35); }
    @keyframes pop-in { from { opacity:0; transform: scale(0.7); } to { opacity:1; transform: scale(1); } }

    /* Post input */
    .post-input-area { padding: 0.5rem; border-top: 1px solid rgba(55,65,81,0.5); display: flex; gap: 0.5rem; align-items: flex-end; flex-shrink: 0; }
    .input-field { flex: 1; padding: 0.5rem; background: rgba(31,41,55,0.7); color: #e2e8f0; resize: none; outline: none; border: 1px solid transparent; border-radius: 0.375rem; font-size: 0.875rem; transition: border-color 0.2s; }
    .input-field:focus { border-color: var(--cyber-yellow); }
    .send-btn { padding: 0.5rem; background: var(--cyber-yellow); color: black; border-radius: 0.375rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center; aspect-ratio: 1; }
    .send-btn:disabled { background: #374151; color: #6b7280; cursor: not-allowed; }

    .post-img { max-width: 100%; max-height: 280px; border-radius: 8px; object-fit: cover; display: block; cursor: pointer; transition: opacity 0.2s; margin-bottom: 0.25rem; }
    .post-img:hover { opacity: 0.9; }
    .post-audio { width: 100%; height: 32px; accent-color: var(--cyber-yellow); margin: 0.25rem 0; }
    .post-caption { font-size: 0.82rem; color: #94a3b8; margin-top: 0.35rem; }

    /* Empty states */
    .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
    .empty-icon { font-size: 2rem; opacity: 0.4; }
    .empty-title { font-size: 0.85rem; color: #94a3b8; font-weight: 600; }
    .empty-hint { font-size: 0.75rem; color: #475569; line-height: 1.5; }
</style>