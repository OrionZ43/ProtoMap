<!-- src/routes/admin/+page.svelte -->
<!--
    «Сегодня» — главная админки. Сверху сводка дня обычными словами, ниже плитки
    по разделам: слева люди, экономика, сообщество и активность, справа контроль,
    лента и сезон. Наведение — плитка разрастается на месте с коротким превью
    (слот peek), нажатие — раскрывается в карточку с подробностями
    (Tile.svelte → Sheet.svelte). Данные — +page.server.ts, подсчёты — $lib/admin/day.
-->
<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { fade } from 'svelte/transition';
    import { t, locale } from 'svelte-i18n';
    import { composeBrief, curvePath, minskHour, segments } from '$lib/admin/day';
    import { describeEntry, kindLabel } from '$lib/admin/describe';
    import { formats } from '$lib/admin/format';
    import Tile from '$lib/components/admin/Tile.svelte';
    import Sheet from '$lib/components/admin/Sheet.svelte';
    import EventList from '$lib/components/admin/EventList.svelte';
    import PersonList from '$lib/components/admin/PersonList.svelte';
    import PeekEvents from '$lib/components/admin/PeekEvents.svelte';
    import type { PageData } from './$types';

    export let data: PageData;

    const CURVE_W = 900;
    const CURVE_H = 150;
    // Утром кривая хотя бы на 6 часов — иначе она почти отвесная.
    const MIN_HOURS = 6;
    // Кружки людей без аватарки.
    const PALETTE = ['#5be49b', '#fcee0a', '#c9bbff', '#ffb020', '#7ee8f2'];
    const FACES = 5;
    // Строк в превью при наведении.
    const PEEK = 6;
    const GROUPS = ['economy', 'content', 'profile', 'map', 'moderation', 'admin', 'account'];

    // Цвет плитки и её карточки.
    const TONES: Record<string, string> = {
        visitors: 't-people', newcomers: 't-teal', active: 't-graphite',
        casino: 't-money', bonuses: 't-gold', shop: 't-shop',
        chat: 't-violet', comments: 't-graphite', channels: 't-plum', map: 't-teal',
        alerts: 't-alert', moderation: 't-red', admin: 't-graphite',
        feed: 't-graphite', season: 't-season', activity: 't-curve'
    };

    const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

    // Открытая карточка. Фокус после закрытия — на ту же плитку.
    let open: string | null = null;
    function show(e: CustomEvent<{ id: string }>) {
        open = e.detail.id;
    }
    async function close() {
        const id = open;
        open = null;
        await tick();
        document.querySelector<HTMLElement>(`[data-tile="${id}"]`)?.focus({ preventScroll: true });
    }

    $: f = formats($locale);
    $: dateLine = new Intl.DateTimeFormat($locale?.startsWith('en') ? 'en-GB' : 'ru-RU',
        { timeZone: 'Europe/Minsk', weekday: 'long', day: 'numeric', month: 'long' }).format(data.now);
    $: hint = $t('admin_home.tiles.open_hint');
    $: quiet = $t('admin_home.tiles.quiet');

    $: hour = minskHour(data.now);
    $: part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : hour < 23 ? 'evening' : 'night';
    $: greeting = segments($t(`admin_home.greeting.${part}`, { values: { name: data.name } }));

    // ── Сводка: от Gemini (functions/src/activity/brief.ts), пока её нет — по шаблону ──
    // Старше часа или нет совсем — страница сама просит свежую.
    const BRIEF_STALE = 60 * 60_000;
    let ai = data.brief;
    let briefState: 'idle' | 'loading' | 'failed' = 'idle';

    async function refreshBrief() {
        if (briefState === 'loading') return;
        briefState = 'loading';
        try {
            const [{ functions }, { httpsCallable }] = await Promise.all([import('$lib/firebase'), import('firebase/functions')]);
            const res = await httpsCallable(functions, 'refreshAdminBrief')();
            ai = res.data as typeof ai;
            briefState = 'idle';
        } catch (e) {
            console.warn('[admin] Сводка Gemini не получилась:', e);
            briefState = 'failed';
        }
    }

    onMount(() => {
        if (!ai || Date.now() - ai.at > BRIEF_STALE) refreshBrief();
    });

    $: aiText = ai ? ($locale?.startsWith('en') ? ai.en : ai.ru) : null;
    $: brief = segments(aiText ?? composeBrief({
        visited: data.people.visited,
        online: data.people.online,
        stats: data.today,
        topItemName: data.topItemName,
        alerts24h: data.attention.count
    }, $t, f.nf));

    // Кривая — с полуночи до текущего часа.
    $: span = Math.max(hour + 1, MIN_HOURS);
    $: curve = curvePath(data.today.hourly.slice(0, span), CURVE_W, CURVE_H);
    $: ticks = [0, 0.25, 0.5, 0.75].map((x) => Math.round(x * (span - 1)));
    $: peak = curve.peak
        ? segments($t('admin_home.tiles.peak', { values: { hour: hh(curve.peak.index), count: curve.peak.value } }))
        : null;

    $: maxNet = Math.max(1, ...data.week.map((d) => Math.abs(d.net)));
    $: barHeight = (net: number) => (net === 0 ? 6 : 14 + (Math.abs(net) / maxNet) * 86);
    $: maxGroup = Math.max(1, ...Object.values(data.details.groups));
    $: maxSold = Math.max(1, ...(data.season?.items.map((i) => i.sold) ?? [0]));

    $: d = data.details;
    $: latestAlert = data.attention.list[0] ?? null;
    $: newest = data.people.newcomers[0] ?? null;
    $: topActor = d.active[0] ?? null;
    $: bonusTotal = d.bonuses.reduce((s, b) => s + b.sum, 0);
    $: bonusCount = d.bonuses.reduce((s, b) => s + b.count, 0);
    $: lastChat = d.chat[0] ?? null;
    $: lastComment = d.comments[0] ?? null;
    $: lastChannel = d.channels[0] ?? null;
    $: lastPin = d.map[0] ?? null;
    $: lastModeration = d.moderation[0] ?? null;
    $: lastAdmin = d.admin[0] ?? null;

    $: visitorRows = data.people.visitors.map((v) => ({
        uid: v.uid, username: v.username, avatar: v.avatar, online: v.online,
        meta: v.online ? $t('admin_home.sheet.online') : $t('admin_home.sheet.seen', { values: { time: f.clock(v.at) } })
    }));
    $: newcomerRows = data.people.newcomers.map((n) => ({
        uid: n.uid, username: n.username, avatar: n.avatar,
        meta: $t('admin_home.sheet.joined', { values: { time: f.when(n.at, data.now) } })
    }));

    $: TITLES = {
        visitors: $t('admin_home.sheet.visitors'), newcomers: $t('admin_home.sheet.newcomers'), active: $t('admin_home.sheet.active'),
        casino: $t('admin_home.sheet.casino'), bonuses: $t('admin_home.sheet.bonuses'), shop: $t('admin_home.sheet.shop'),
        chat: $t('admin_home.sheet.chat'), comments: $t('admin_home.sheet.comments'), channels: $t('admin_home.sheet.channels'),
        map: $t('admin_home.sheet.map'), alerts: $t('admin_home.sheet.alerts'), moderation: $t('admin_home.sheet.moderation'),
        admin: $t('admin_home.sheet.admin'), feed: $t('admin_home.sheet.feed'), activity: $t('admin_home.sheet.activity'),
        season: data.season ? $t(`admin_home.tiles.season.${data.season.theme}`) : ''
    } as Record<string, string>;
</script>

<svelte:head>
    <title>{$t('admin_home.title')} | ProtoMap</title>
</svelte:head>

<section class="hero">
    <div class="date">{dateLine} · {f.clock(data.now)}</div>
    <h1>{#each greeting as p}{#if p.mark}<b>{p.text}</b>{:else}{p.text}{/if}{/each}</h1>
    {#key aiText ?? 'template'}
        <p class="brief" in:fade={{ duration: 450 }}>{#each brief as p}{#if p.mark}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</p>
    {/key}
    <div class="by" aria-live="polite">
        {#if ai && aiText}
            <span class="ai">
                <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>
                {$t('admin_home.brief.ai_by')}
            </span>
            <span>{$t(ai.scope === 'day' ? 'admin_home.brief.ai_day' : 'admin_home.brief.ai_today', { values: { time: f.when(ai.at, data.now) } })}</span>
        {:else}
            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
            {$t('admin_home.brief.source')}
        {/if}
        <button type="button" class="refresh" on:click={refreshBrief} disabled={briefState === 'loading'}>
            <svg class="adm-i" class:spin={briefState === 'loading'} viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
            {briefState === 'loading' ? $t('admin_home.brief.writing') : $t('admin_home.brief.refresh')}
        </button>
        {#if briefState === 'failed'}<span class="failed">{$t('admin_home.brief.failed')}</span>{/if}
    </div>
</section>

<div class="board">
    <div class="main">
        <!-- ── Люди ── -->
        <section class="cat c-people" aria-labelledby="cat-people">
            <h2 id="cat-people" class="cat-title">{$t('admin_home.cat.people')}</h2>
            <div class="grid">
                <Tile id="visitors" {open} {hint} class="span2" tone={TONES.visitors} on:open={show}>
                    <div class="people-row">
                        <div class="val">{f.nf.format(data.people.visited)}</div>
                        <div class="txt">
                            <span class="label">{$t('admin_home.tiles.visited')}</span>
                            {#if data.people.online > 0}
                                <span class="sub live"><i></i>{$t('admin_home.tiles.online_now', { values: { count: data.people.online } })}</span>
                            {/if}
                        </div>
                        <div class="faces">
                            {#each data.people.visitors.slice(0, FACES) as v, i (v.uid)}
                                <span style="--c: {PALETTE[i % PALETTE.length]}">
                                    {#if v.avatar}<img src={v.avatar} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{v.username.charAt(0).toUpperCase()}{/if}
                                </span>
                            {/each}
                            {#if data.people.visited > FACES}<span class="more">+{data.people.visited - FACES}</span>{/if}
                        </div>
                    </div>
                    <svelte:fragment slot="peek">
                        {#if data.people.visitors.length > 0}
                            <ul class="pk">
                                {#each data.people.visitors.slice(0, PEEK) as v, i (v.uid)}
                                    <li>
                                        <span class="pk-ava" style="--c: {PALETTE[i % PALETTE.length]}">
                                            {#if v.avatar}<img src={v.avatar} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{v.username.charAt(0).toUpperCase()}{/if}
                                        </span>
                                        <span class="pk-t">{v.username}</span>
                                        <span class="pk-v" class:on={v.online}>{v.online ? $t('admin_home.sheet.online') : f.clock(v.at)}</span>
                                    </li>
                                {/each}
                            </ul>
                            {#if data.people.visited > PEEK}<p class="pk-more">+{data.people.visited - PEEK}</p>{/if}
                        {:else}
                            <p class="pk-empty">{quiet}</p>
                        {/if}
                    </svelte:fragment>
                </Tile>

                <Tile id="newcomers" {open} {hint} tone={TONES.newcomers} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.newcomers')}</div>
                    <div class="val">{f.nf.format(data.people.newWeek)}</div>
                    <div class="sub ellipsis">
                        {newest ? $t('admin_home.tiles.newcomers_last', { values: { name: newest.username } }) : $t('admin_home.tiles.total', { values: { total: f.nf.format(data.people.total) } })}
                    </div>
                    <svelte:fragment slot="peek">
                        {#if data.people.newcomers.length > 0}
                            <ul class="pk">
                                {#each data.people.newcomers.slice(0, PEEK) as n, i (n.uid)}
                                    <li>
                                        <span class="pk-ava" style="--c: {PALETTE[i % PALETTE.length]}">
                                            {#if n.avatar}<img src={n.avatar} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{n.username.charAt(0).toUpperCase()}{/if}
                                        </span>
                                        <span class="pk-t">{n.username}</span>
                                        <span class="pk-v">{f.when(n.at, data.now)}</span>
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <p class="pk-empty">{$t('admin_home.tiles.total', { values: { total: f.nf.format(data.people.total) } })}</p>
                        {/if}
                    </svelte:fragment>
                </Tile>

                <Tile id="active" {open} {hint} tone={TONES.active} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.active')}</div>
                    {#if topActor}
                        <div class="val-name ellipsis">{topActor.username}</div>
                        <div class="sub">{$t('admin_home.tiles.actions', { values: { count: topActor.count } })}</div>
                    {:else}
                        <div class="sub at-bottom">{quiet}</div>
                    {/if}
                    <svelte:fragment slot="peek">
                        {#if d.active.length > 0}
                            <ul class="pk">
                                {#each d.active.slice(0, PEEK) as a, i (a.uid)}
                                    <li>
                                        <span class="pk-n">{i + 1}</span>
                                        <span class="pk-t">{a.username}</span>
                                        <span class="pk-v">{$t('admin_home.tiles.actions', { values: { count: a.count } })}</span>
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <p class="pk-empty">{quiet}</p>
                        {/if}
                    </svelte:fragment>
                </Tile>
            </div>
        </section>

        <!-- ── Экономика ── -->
        <section class="cat c-economy" aria-labelledby="cat-economy">
            <h2 id="cat-economy" class="cat-title">{$t('admin_home.cat.economy')}</h2>
            <div class="grid">
                <Tile id="casino" {open} {hint} class="span2" tone={TONES.casino} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.casino')}</div>
                    <div class="mini-bars" aria-hidden="true">
                        {#each data.week as w, i (w.key)}
                            <i class:today={i === data.week.length - 1} class:neg={w.net < 0} style="height: {barHeight(w.net)}%"></i>
                        {/each}
                    </div>
                    <div class="val" class:neg={data.today.casinoNet < 0}>{f.signed(data.today.casinoNet)}<small> PC</small></div>
                    <div class="sub">{$t('admin_home.tiles.bank', { values: { amount: f.nf.format(data.bank) } })}</div>
                    <svelte:fragment slot="peek">
                        <ul class="pk">
                            {#each d.games as g (g.game)}
                                <li>
                                    <span class="pk-t">{$t(`admin_home.games.${g.game}`)}</span>
                                    <span class="pk-m">{$t('admin_home.sheet.rounds', { values: { count: g.rounds } })}</span>
                                    <span class="pk-v" class:p={g.net > 0} class:m={g.net < 0}>{f.signed(g.net)}</span>
                                </li>
                            {/each}
                        </ul>
                    </svelte:fragment>
                </Tile>

                <Tile id="bonuses" {open} {hint} tone={TONES.bonuses} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.bonuses')}</div>
                    <div class="val">{f.signed(bonusTotal)}<small> PC</small></div>
                    <div class="sub">{$t('admin_home.tiles.bonuses_sub', { values: { count: bonusCount } })}</div>
                    <svelte:fragment slot="peek">
                        {#if d.bonuses.length > 0}
                            <ul class="pk">
                                {#each d.bonuses.slice(0, PEEK) as b (b.kind)}
                                    <li>
                                        <span class="pk-t">{kindLabel(b.kind, $t)}</span>
                                        <span class="pk-m">× {b.count}</span>
                                        <span class="pk-v p">{f.signed(b.sum)}</span>
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <p class="pk-empty">{quiet}</p>
                        {/if}
                    </svelte:fragment>
                </Tile>

                <Tile id="shop" {open} {hint} tone={TONES.shop} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.shop')}</div>
                    <div class="val">{f.nf.format(data.today.purchases)}<small> {$t('admin_home.tiles.purchases', { values: { count: data.today.purchases } })}</small></div>
                    {#if data.topItemName}
                        <div class="sub ellipsis">{$t('admin_home.tiles.top_item', { values: { item: data.topItemName } })}</div>
                    {/if}
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.purchases} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={PEEK} />
                    </svelte:fragment>
                </Tile>
            </div>
        </section>

        <!-- ── Сообщество ── -->
        <section class="cat c-community" aria-labelledby="cat-community">
            <h2 id="cat-community" class="cat-title">{$t('admin_home.cat.community')}</h2>
            <div class="grid">
                <Tile id="chat" {open} {hint} tone={TONES.chat} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.chat')}</div>
                    <div class="val">{f.nf.format(d.counts.chat)}</div>
                    <div class="sub ellipsis">{lastChat ? `${lastChat.username ?? '?'}: ${lastChat.text ?? ''}` : quiet}</div>
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.chat} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={PEEK} />
                    </svelte:fragment>
                </Tile>
                <Tile id="comments" {open} {hint} tone={TONES.comments} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.comments')}</div>
                    <div class="val">{f.nf.format(d.counts.comments)}</div>
                    <div class="sub ellipsis">{lastComment ? `${lastComment.username ?? '?'} → ${lastComment.targetName ?? '?'}` : quiet}</div>
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.comments} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={PEEK} />
                    </svelte:fragment>
                </Tile>
                <Tile id="channels" {open} {hint} tone={TONES.channels} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.channels')}</div>
                    <div class="val">{f.nf.format(d.counts.channels)}</div>
                    <div class="sub ellipsis">{lastChannel ? describeEntry(lastChannel, $t, data.itemNames) : quiet}</div>
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.channels} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={PEEK} />
                    </svelte:fragment>
                </Tile>
                <Tile id="map" {open} {hint} tone={TONES.map} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.map')}</div>
                    <div class="val">{f.nf.format(d.counts.map)}</div>
                    <div class="sub ellipsis">{lastPin ? `${lastPin.username ?? '?'} · ${describeEntry(lastPin, $t, data.itemNames)}` : quiet}</div>
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.map} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={PEEK} />
                    </svelte:fragment>
                </Tile>
            </div>
        </section>

        <!-- ── Активность ── -->
        <section class="cat c-activity" aria-labelledby="cat-activity">
            <h2 id="cat-activity" class="cat-title">{$t('admin_home.cat.activity')}</h2>
            <div class="grid">
                <Tile id="activity" {open} {hint} class="span4 tall" tone={TONES.activity} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.activity')}</div>
                    <div class="peak">
                        {#if peak}{#each peak as p}{#if p.mark}<b>{p.text}</b>{:else}{p.text}{/if}{/each}{:else}{$t('admin_home.tiles.activity_none')}{/if}
                    </div>
                    <div class="plot" aria-hidden="true">
                        <svg viewBox="0 0 {CURVE_W} {CURVE_H}" preserveAspectRatio="none">
                            <defs>
                                <!-- userSpaceOnUse: у ровной линии нулевая высота, и градиент в долях рамки её бы не нарисовал. -->
                                <linearGradient id="adm-curve-fill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={CURVE_H}>
                                    <stop offset="0" stop-color="#fcee0a" stop-opacity=".22" />
                                    <stop offset="1" stop-color="#fcee0a" stop-opacity="0" />
                                </linearGradient>
                                <linearGradient id="adm-curve-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={CURVE_W} y2="0">
                                    <stop offset="0" stop-color="#ffb020" />
                                    <stop offset=".6" stop-color="#fcee0a" />
                                    <stop offset="1" stop-color="#8b6cff" />
                                </linearGradient>
                            </defs>
                            <path d={curve.area} fill="url(#adm-curve-fill)" />
                            <path d={curve.line} fill="none" stroke="url(#adm-curve-stroke)" stroke-width="2.5" vector-effect="non-scaling-stroke" />
                        </svg>
                        {#if curve.peak}
                            <!-- Точка пика — вне SVG: растянутый viewBox сплющил бы круг в эллипс. -->
                            <span class="dot" style="left: {(curve.peak.x / CURVE_W) * 100}%; top: {(curve.peak.y / CURVE_H) * 100}%"></span>
                        {/if}
                    </div>
                    <div class="hours">{#each ticks as h}<span>{hh(h)}</span>{/each}<span>{f.clock(data.now)}</span></div>
                </Tile>
            </div>
        </section>
    </div>

    <aside class="side">
        <!-- ── Контроль ── -->
        <section class="cat c-control" aria-labelledby="cat-control">
            <h2 id="cat-control" class="cat-title">{$t('admin_home.cat.control')}</h2>
            <div class="grid">
                <Tile id="alerts" {open} {hint} class="span2 tall" tone="{TONES.alerts} {data.attention.count === 0 ? 'calm' : ''}" on:open={show}>
                    <div class="label">{$t('admin_home.tiles.attention')}</div>
                    {#if data.attention.count > 0 && latestAlert}
                        <span class="count">{data.attention.count}</span>
                        <h3 class="alert-title">
                            {#if latestAlert.username}<b>{latestAlert.username}</b> · {/if}{describeEntry(latestAlert, $t, data.itemNames)}
                        </h3>
                        <div class="sub">
                            {f.when(latestAlert.at, data.now)}{#if latestAlert.delta} · {f.signed(latestAlert.delta)} PC{/if}
                        </div>
                    {:else}
                        <h3 class="alert-title">{$t('admin_home.tiles.attention_calm')}</h3>
                        <div class="sub">{$t('admin_home.tiles.attention_calm_sub')}</div>
                    {/if}
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={data.attention.list.slice(1)} itemNames={data.itemNames} {f} now={data.now} empty={$t('admin_home.tiles.attention_calm_sub')} limit={4} />
                    </svelte:fragment>
                </Tile>
                <Tile id="moderation" {open} {hint} tone={TONES.moderation} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.moderation')}</div>
                    <div class="val">{f.nf.format(d.counts.moderation)}</div>
                    <div class="sub ellipsis">{lastModeration ? kindLabel(lastModeration.kind, $t) : quiet}</div>
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.moderation} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={4} />
                    </svelte:fragment>
                </Tile>
                <Tile id="admin" {open} {hint} tone={TONES.admin} on:open={show}>
                    <div class="label">{$t('admin_home.tiles.admin')}</div>
                    <div class="val">{f.nf.format(d.counts.admin)}</div>
                    <div class="sub ellipsis">{lastAdmin ? lastAdmin.username ?? '?' : quiet}</div>
                    <svelte:fragment slot="peek">
                        <PeekEvents rows={d.admin} itemNames={data.itemNames} {f} now={data.now} empty={quiet} limit={4} />
                    </svelte:fragment>
                </Tile>
            </div>
        </section>

        <!-- ── Лента ── -->
        <section class="cat c-feed" aria-labelledby="cat-feed">
            <h2 id="cat-feed" class="cat-title">{$t('admin_home.cat.feed')}</h2>
            <div class="grid">
                <Tile id="feed" {open} {hint} class="span2 xtall" tone={TONES.feed} on:open={show}>
                    <div class="label"><span class="live"><i></i>{$t('admin_home.tiles.now')}</span></div>
                    {#if data.feed.length > 0}
                        <ul class="feed">
                            {#each data.feed.slice(0, 7) as r (r.id)}
                                <li>
                                    <time>{f.when(r.at, data.now)}</time>
                                    <span class="what">{#if r.username}<b>{r.username}</b> · {/if}{describeEntry(r, $t, data.itemNames)}</span>
                                    {#if r.delta}<span class="delta" class:p={r.delta > 0} class:m={r.delta < 0}>{f.signed(r.delta)}</span>{/if}
                                </li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="sub">{$t('admin_home.tiles.feed_empty')}</p>
                    {/if}
                </Tile>
            </div>
        </section>

        {#if data.season}
            <!-- ── Сезон ── -->
            <section class="cat c-season" aria-labelledby="cat-season">
                <h2 id="cat-season" class="cat-title">{$t('admin_home.cat.season')}</h2>
                <div class="grid">
                    <Tile id="season" {open} {hint} class="span2 tall" tone={TONES.season} on:open={show}>
                        <div class="label">{$t(`admin_home.tiles.season.${data.season.theme}`)}</div>
                        <div class="val">{f.nf.format(data.season.sold)}</div>
                        <div class="sub">{$t('admin_home.tiles.season_sold', { values: { count: data.season.sold } })}</div>
                        <div class="progress"><i style="width: {Math.min(100, (data.season.day / data.season.total) * 100)}%"></i></div>
                        <div class="sub small">
                            {$t('admin_home.tiles.season_sub', { values: { day: data.season.day, total: data.season.total, date: f.dayMonth(data.season.until) } })}
                        </div>
                        <svelte:fragment slot="peek">
                            <ul class="pk">
                                {#each data.season.items.slice(0, PEEK) as it (it.id)}
                                    <li>
                                        <span class="pk-t">{it.name}</span>
                                        <span class="pk-v">{f.nf.format(it.sold)}</span>
                                    </li>
                                {/each}
                            </ul>
                        </svelte:fragment>
                    </Tile>
                </div>
            </section>
        {/if}
    </aside>
</div>

{#if open}
    <Sheet id={open} title={TITLES[open] ?? ''} tone={TONES[open] ?? ''} closeLabel={$t('admin_home.sheet.close')} on:close={close}>
        {#if open === 'visitors'}
            <p class="lead">
                {#each segments($t('admin_home.sheet.visitors_lead', { values: { count: data.people.visited, online: data.people.online } })) as p}{#if p.mark}<b>{p.text}</b>{:else}{p.text}{/if}{/each}
            </p>
            <PersonList people={visitorRows} empty={$t('admin_home.sheet.empty')} journalLabel={$t('admin_home.sheet.journal')} />
        {:else if open === 'newcomers'}
            <p class="lead">{$t('admin_home.tiles.total', { values: { total: f.nf.format(data.people.total) } })}</p>
            <PersonList people={newcomerRows} empty={$t('admin_home.sheet.empty')} journalLabel={$t('admin_home.sheet.journal')} />
        {:else if open === 'active'}
            {#if d.active.length > 0}
                <ol class="rank">
                    {#each d.active as a, i (a.uid)}
                        <li>
                            <span class="n">{i + 1}</span>
                            <a class="name" href="/admin/activity?user={encodeURIComponent(a.uid)}">{a.username}</a>
                            <span class="chips">
                                {#each GROUPS.filter((g) => a.groups[g]) as g}<span class="chip">{$t(`admin_activity.groups.${g}`)} · {a.groups[g]}</span>{/each}
                            </span>
                            <span class="count-text">{$t('admin_home.tiles.actions', { values: { count: a.count } })}</span>
                        </li>
                    {/each}
                </ol>
            {:else}
                <p class="empty">{$t('admin_home.sheet.empty')}</p>
            {/if}
        {:else if open === 'casino'}
            <div class="split">
                <div>
                    <div class="big" class:neg={data.today.casinoNet < 0}>{f.signed(data.today.casinoNet)}<small> PC</small></div>
                    <p class="lead">
                        {#each segments($t('admin_home.sheet.bank', { values: { amount: f.nf.format(data.bank) } })) as p}{#if p.mark}<b>{p.text}</b>{:else}{p.text}{/if}{/each}
                    </p>
                </div>
                <div class="week">
                    <h3>{$t('admin_home.sheet.casino_week')}</h3>
                    <div class="bars">
                        {#each data.week as w, i (w.key)}
                            <div class="bar" class:today={i === data.week.length - 1}>
                                <span class="amount" class:neg={w.net < 0}>{w.net === 0 ? '0' : f.signed(w.net)}</span>
                                <i class:neg={w.net < 0} style="height: {barHeight(w.net)}%"></i>
                                <span class="day">{w.key.slice(8, 10)}.{w.key.slice(5, 7)}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
            <h3>{$t('admin_home.sheet.casino_games')}</h3>
            <table class="table">
                <tbody>
                    {#each d.games as g (g.game)}
                        <tr>
                            <th scope="row">{$t(`admin_home.games.${g.game}`)}</th>
                            <td>{$t('admin_home.sheet.rounds', { values: { count: g.rounds } })}</td>
                            <td class="num" class:p={g.net > 0} class:m={g.net < 0}>{f.signed(g.net)} PC</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            <div class="two">
                <div>
                    <h3>{$t('admin_home.sheet.wins')}</h3>
                    <EventList rows={d.wins} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
                </div>
                <div>
                    <h3>{$t('admin_home.sheet.losses')}</h3>
                    <EventList rows={d.losses} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
                </div>
            </div>
        {:else if open === 'bonuses'}
            <p class="lead">
                {#each segments($t('admin_home.sheet.bonuses_total', { values: { amount: f.nf.format(bonusTotal) } })) as p}{#if p.mark}<b>{p.text}</b>{:else}{p.text}{/if}{/each}
            </p>
            {#if d.bonuses.length > 0}
                <table class="table">
                    <tbody>
                        {#each d.bonuses as b (b.kind)}
                            <tr>
                                <th scope="row">{kindLabel(b.kind, $t)}</th>
                                <td>{$t('admin_home.tiles.bonuses_sub', { values: { count: b.count } })}</td>
                                <td class="num p">{f.signed(b.sum)} PC</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {:else}
                <p class="empty">{$t('admin_home.sheet.empty')}</p>
            {/if}
        {:else if open === 'shop'}
            <p class="lead">
                {#each segments($t('admin_home.sheet.shop_total', { values: { amount: f.nf.format(d.spent) } })) as p}{#if p.mark}<b>{p.text}</b>{:else}{p.text}{/if}{/each}
            </p>
            <EventList rows={d.purchases} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'chat'}
            <EventList rows={d.chat} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'comments'}
            <EventList rows={d.comments} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'channels'}
            <EventList rows={d.channels} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'map'}
            <EventList rows={d.map} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'alerts'}
            <EventList rows={data.attention.list} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.tiles.attention_calm_sub')} />
        {:else if open === 'moderation'}
            <EventList rows={d.moderation} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'admin'}
            <EventList rows={d.admin} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.sheet.empty')} />
        {:else if open === 'feed'}
            <EventList rows={data.feed} itemNames={data.itemNames} now={data.now} {f} empty={$t('admin_home.tiles.feed_empty')} />
        {:else if open === 'season' && data.season}
            <div class="progress big-progress"><i style="width: {Math.min(100, (data.season.day / data.season.total) * 100)}%"></i></div>
            <p class="lead">{$t('admin_home.tiles.season_sub', { values: { day: data.season.day, total: data.season.total, date: f.dayMonth(data.season.until) } })}</p>
            <h3>{$t('admin_home.sheet.season_items')}</h3>
            <ul class="meter">
                {#each data.season.items as it (it.id)}
                    <li>
                        <span class="name">{it.name}</span>
                        <span class="track"><i style="width: {(it.sold / maxSold) * 100}%"></i></span>
                        <span class="num">{f.nf.format(it.sold)}</span>
                    </li>
                {/each}
            </ul>
        {:else if open === 'activity'}
            <div class="plot-big" aria-hidden="true">
                <!-- Свои градиенты: пока карточка открыта, плитки с её градиентами в документе нет. -->
                <svg viewBox="0 0 {CURVE_W} {CURVE_H}" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="adm-curve-fill-big" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={CURVE_H}>
                            <stop offset="0" stop-color="#fcee0a" stop-opacity=".22" />
                            <stop offset="1" stop-color="#fcee0a" stop-opacity="0" />
                        </linearGradient>
                        <linearGradient id="adm-curve-stroke-big" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={CURVE_W} y2="0">
                            <stop offset="0" stop-color="#ffb020" />
                            <stop offset=".6" stop-color="#fcee0a" />
                            <stop offset="1" stop-color="#8b6cff" />
                        </linearGradient>
                    </defs>
                    <path d={curve.area} fill="url(#adm-curve-fill-big)" />
                    <path d={curve.line} fill="none" stroke="url(#adm-curve-stroke-big)" stroke-width="2.5" vector-effect="non-scaling-stroke" />
                </svg>
            </div>
            <div class="hours-big">{#each ticks as h}<span>{hh(h)}</span>{/each}<span>{f.clock(data.now)}</span></div>
            <h3>{$t('admin_home.sheet.activity_groups')}</h3>
            <ul class="meter">
                {#each GROUPS.filter((g) => d.groups[g]) as g}
                    <li>
                        <span class="name">{$t(`admin_activity.groups.${g}`)}</span>
                        <span class="track"><i style="width: {(d.groups[g] / maxGroup) * 100}%"></i></span>
                        <span class="num">{f.nf.format(d.groups[g])}</span>
                    </li>
                {:else}
                    <li class="empty">{$t('admin_home.tiles.activity_none')}</li>
                {/each}
            </ul>
        {/if}

        <a class="to-journal" href="/admin/activity">
            {$t('admin_home.sheet.open_journal')}
            <svg class="adm-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </a>
    </Sheet>
{/if}

<style>
    /* ── Сводка ── */
    .hero { margin: 34px 0 30px; }
    .date { font-size: 12.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
    h1 { margin: 10px 0 14px; font: 300 38px/1.12 var(--display); letter-spacing: -.01em; }
    h1 b { font-weight: 500; }
    .brief { margin: 0; max-width: 1000px; font-size: 18.5px; line-height: 1.6; color: var(--soft); }
    .brief mark { color: var(--text); background: linear-gradient(transparent 63%, rgba(252, 238, 10, .26) 63%); padding: 0 2px; }
    .by { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; margin-top: 14px; color: var(--muted); font-size: 13px; }
    .ai { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 9px; border-radius: 999px; color: #d9d0ff; background: rgba(139, 108, 255, .14); border: 1px solid rgba(139, 108, 255, .28); }
    .ai .star { width: 15px; height: 15px; fill: #b8a6ff; }
    .refresh { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255, 255, 255, .03); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; transition: color .2s ease, border-color .2s ease; }
    .refresh:hover:not(:disabled) { color: var(--text); border-color: var(--line-strong); }
    .refresh:disabled { cursor: default; color: #b8a6ff; }
    .refresh .adm-i { width: 14px; height: 14px; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .failed { color: var(--dim); }
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

    /* ── Разделы ── */
    .board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 28px; align-items: start; }
    .cat { margin-bottom: 26px; }
    .cat:last-child { margin-bottom: 0; }
    .cat-title { margin: 0 0 12px; display: flex; align-items: center; gap: 12px; font: 500 12px var(--body); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
    .cat-title::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 136px; gap: 12px; }
    .side .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    /* Ячейка плитки — в Tile.svelte, поэтому размеры в сетке — через :global. */
    .grid :global(.span2) { grid-column: span 2; }
    .grid :global(.span4) { grid-column: span 4; }
    .grid :global(.tall) { grid-row: span 2; }
    .grid :global(.xtall) { grid-row: span 3; }

    /* ── Содержимое плиток (внутри .tile-main — точки отсчёта для значков) ── */
    .label { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 8px; padding-right: 26px; }
    .val { font: 300 40px/1 var(--display); letter-spacing: -.02em; margin-top: auto; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .val small { font-size: 16px; color: var(--muted); }
    .val.neg { color: var(--red); }
    .val-name { margin-top: auto; font: 400 22px/1.15 var(--display); }
    .sub { color: var(--muted); font-size: 13.5px; margin-top: 6px; }
    .sub.small { font-size: 12.5px; }
    .at-bottom { margin-top: auto; }
    .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .live { display: inline-flex; align-items: center; gap: 7px; }
    .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 4px rgba(91, 228, 155, .16); }

    .people-row { flex: 1; display: flex; align-items: center; gap: 18px; min-height: 0; }
    .people-row .val { margin: 0; font-size: 46px; }
    .people-row .txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .people-row .sub { margin: 0; }
    .faces { margin-left: auto; display: flex; flex-shrink: 0; padding-right: 12px; }
    .faces span { width: 36px; height: 36px; border-radius: 50%; border: 3px solid #0d2a29; margin-left: -10px; display: grid; place-items: center; overflow: hidden; font: 600 12px var(--display); color: #062120; background: var(--c, #7ee8f2); }
    .faces .more { background: #7ee8f2; }
    .faces img { width: 100%; height: 100%; object-fit: cover; }

    .mini-bars { position: absolute; right: 32px; top: 0; display: flex; align-items: flex-end; gap: 4px; height: 34px; }
    .mini-bars i { width: 7px; border-radius: 3px; background: rgba(91, 228, 155, .3); }
    .mini-bars i.neg { background: rgba(255, 107, 129, .35); }
    .mini-bars i.today { background: var(--green); }
    .mini-bars i.today.neg { background: var(--red); }

    h3 { margin: 0; }
    .alert-title { margin: auto 0 0; padding-right: 8px; font: 400 21px/1.3 var(--display); letter-spacing: -.01em; display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .alert-title b { font-weight: 500; }
    .count { position: absolute; right: 32px; top: -2px; font: 500 13px var(--display); color: #131209; background: var(--yellow); border-radius: 999px; padding: 3px 10px; }

    .peak { margin-top: 6px; color: var(--soft); font-size: 14px; }
    .peak b { color: var(--text); font-weight: 600; }
    .plot { position: absolute; left: -20px; right: -20px; bottom: 16px; height: 170px; }
    .plot svg, .plot-big svg { width: 100%; height: 100%; display: block; }
    .dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 6px rgba(252, 238, 10, .16); transform: translate(-50%, -50%); }
    .hours { position: absolute; left: 2px; right: 2px; bottom: -6px; display: flex; justify-content: space-between; font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }

    .feed { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
    .feed li { display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; color: rgba(243, 243, 246, .78); min-width: 0; }
    .feed time { color: var(--dim); font-size: 12px; min-width: 38px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
    .feed .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .feed b { color: #fff; font-weight: 500; }
    .delta { flex-shrink: 0; font-variant-numeric: tabular-nums; }
    .p { color: var(--green); }
    .m { color: var(--red); }

    .progress { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, .08); overflow: hidden; margin-top: 14px; }
    .progress i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ff8a28, var(--amber)); }

    /* ── Превью при наведении (слот peek в Tile.svelte) ── */
    .pk { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .pk li { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; color: rgba(243, 243, 246, .82); }
    .pk-ava { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; overflow: hidden; background: var(--c, #7ee8f2); color: #0a0a0c; font: 600 10px var(--display); }
    .pk-ava img { width: 100%; height: 100%; object-fit: cover; }
    .pk-n { width: 16px; flex-shrink: 0; color: var(--dim); font-variant-numeric: tabular-nums; }
    .pk-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    .pk-m { color: var(--muted); white-space: nowrap; }
    .pk-v { flex-shrink: 0; color: var(--muted); font-variant-numeric: tabular-nums; }
    .pk-v.on, .pk-v.p { color: var(--green); }
    .pk-v.m { color: var(--red); }
    .pk-more { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
    .pk-empty { margin: 0; color: var(--muted); font-size: 13px; }

    /* ── Содержимое карточек ── */
    .lead { margin: 0 0 18px; color: var(--soft); font-size: 15.5px; }
    .lead b { color: var(--text); font-weight: 600; }
    .empty { margin: 6px 0; color: var(--muted); }
    .to-journal { display: inline-flex; align-items: center; gap: 6px; margin-top: 22px; color: var(--muted); font-size: 14px; text-decoration: none; }
    .to-journal:hover { color: var(--text); }
    :global(.sheet-body) h3 { margin: 24px 0 10px; font: 500 12px var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }

    .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 24px; align-items: end; }
    .big { font: 300 54px/1 var(--display); letter-spacing: -.02em; margin-bottom: 12px; color: var(--green); }
    .big.neg { color: var(--red); }
    .big small { font-size: 20px; color: var(--muted); }
    .week h3 { margin-top: 0 !important; }
    .bars { display: flex; align-items: flex-end; gap: 10px; height: 150px; }
    .bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; }
    .bar i { display: block; width: 100%; max-width: 34px; border-radius: 8px; background: rgba(91, 228, 155, .3); }
    .bar i.neg { background: rgba(255, 107, 129, .35); }
    .bar.today i { background: var(--green); }
    .bar.today i.neg { background: var(--red); }
    .bar .amount { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bar .amount.neg { color: var(--red); }
    .bar .day { font-size: 12px; color: var(--dim); }

    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 11px 0; border-bottom: 1px solid var(--line); text-align: left; font-size: 14.5px; }
    .table th { font-weight: 500; }
    .table td { color: var(--muted); }
    .table .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
    .table .num.p { color: var(--green); }
    .table .num.m { color: var(--red); }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }

    .rank { list-style: none; margin: 0; padding: 0; }
    .rank li { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--line); }
    .rank .n { width: 24px; color: var(--dim); font-variant-numeric: tabular-nums; }
    .rank .name { color: var(--text); font-weight: 500; text-decoration: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rank .name:hover { text-decoration: underline; text-underline-offset: 3px; }
    .rank .chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
    .rank .chip { padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    .rank .count-text { color: var(--soft); font-size: 13.5px; white-space: nowrap; }

    .meter { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .meter li { display: grid; grid-template-columns: minmax(120px, 220px) 1fr 56px; align-items: center; gap: 14px; font-size: 14.5px; }
    .meter .track { height: 8px; border-radius: 999px; background: rgba(255, 255, 255, .06); overflow: hidden; }
    .meter .track i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--amber), var(--yellow)); }
    .meter .num { text-align: right; color: var(--soft); font-variant-numeric: tabular-nums; }
    .big-progress { height: 10px; margin: 0 0 12px; }
    .plot-big { height: 220px; margin-top: 4px; }
    .hours-big { display: flex; justify-content: space-between; font-size: 12px; color: var(--dim); margin-top: 6px; font-variant-numeric: tabular-nums; }

    /* ── Узкие экраны: одна колонка, контроль — сверху ── */
    @media (max-width: 1180px) {
        .board { display: flex; flex-direction: column; gap: 0; }
        .main, .side { display: contents; }
        .cat { margin-bottom: 26px !important; }
        .c-control { order: 0; }
        .c-people { order: 1; }
        .c-economy { order: 2; }
        .c-community { order: 3; }
        .c-feed { order: 4; }
        .c-activity { order: 5; }
        .c-season { order: 6; }
        .side .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .c-feed .grid :global(.xtall) { grid-column: span 4; grid-row: span 3; }
        .c-season .grid :global(.span2) { grid-column: span 4; }
    }

    @media (max-width: 760px) {
        .hero { margin: 22px 0 22px; }
        h1 { font-size: 28px; }
        .brief { font-size: 16.5px; }
        .grid, .side .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; grid-auto-rows: 128px; }
        .grid :global(.span2), .grid :global(.span4), .c-feed .grid :global(.xtall), .c-season .grid :global(.span2) { grid-column: span 2; }
        .people-row { flex-wrap: wrap; gap: 8px 14px; }
        .faces { margin-left: 0; }
        .split, .two { grid-template-columns: 1fr; }
        .meter li { grid-template-columns: minmax(90px, 140px) 1fr 44px; }
    }
</style>
