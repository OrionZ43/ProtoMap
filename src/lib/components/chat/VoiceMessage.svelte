<!-- src/lib/components/chat/VoiceMessage.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    export let src: string;
    export let isOwn: boolean = false;

    let audio: HTMLAudioElement;
    let isPlaying   = false;
    let currentTime = 0;
    let duration    = 0;


    // Реальная форма волны из файла — 36 значений амплитуды
    let waveform: number[] = [];
    let waveLoading = true;

    // Загружаем через прокси и анализируем OfflineAudioContext
    async function loadWaveform() {
        try {
            const proxyUrl = src.startsWith('data:')
                ? src  // base64 — грузим напрямую
                : `/api/audio-proxy?url=${encodeURIComponent(src)}`;

            const res = await fetch(proxyUrl);
            const buf = await res.arrayBuffer();

            const ctx     = new OfflineAudioContext(1, 44100 * 30, 44100);
            const decoded = await ctx.decodeAudioData(buf);
            const data    = decoded.getChannelData(0);
            const n       = 36;
            const step    = Math.floor(data.length / n);

            waveform = Array.from({ length: n }, (_, i) => {
                let sum = 0;
                for (let j = 0; j < step; j++) sum += Math.abs(data[i * step + j] ?? 0);
                return Math.max(0.04, Math.min(1, (sum / step) * 6));
            });
        } catch (e) {
            console.warn('[Voice] waveform load failed:', e);
            // Фолбек — плоская линия с небольшим шумом (честно, не рандом)
            waveform = Array(36).fill(0.15);
        } finally {
            waveLoading = false;
        }
    }

    onMount(() => { loadWaveform(); });

    $: displayBars = waveform;
    $: progress    = duration > 0 ? currentTime / duration : 0;
    $: color       = isOwn ? '#00f0ff' : '#fcee0a';

    async function togglePlay() {
        if (!audio) return;
        if (isPlaying) { audio.pause(); return; }
        try { await audio.play(); }
        catch(e) { console.error('[Voice] play:', e); }
    }

    function onPlay()  { isPlaying = true; }
    function onPause() { isPlaying = false; }
    function onEnded() { isPlaying = false; currentTime = 0; }
    function onTime()  { currentTime = audio?.currentTime ?? 0; }
    function onMeta()  { duration = isFinite(audio?.duration) ? audio.duration : 0; }

    function seek(e: MouseEvent) {
        if (!duration) return;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        audio.currentTime = ((e.clientX - r.left) / r.width) * duration;
    }

    function fmt(s: number) {
        if (!isFinite(s) || s < 0) return '0:00';
        return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
    }

    onDestroy(() => {});
</script>

<!-- svelte-ignore a11y-media-has-caption -->
<audio
    bind:this={audio}
    {src}
    preload="metadata"
    on:play={onPlay}
    on:pause={onPause}
    on:ended={onEnded}
    on:timeupdate={onTime}
    on:loadedmetadata={onMeta}
></audio>

<div class="vc" class:own={isOwn}>
    <button class="play-btn" on:click={togglePlay} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
        {#if isPlaying}
            <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
                <rect x="6" y="4" width="4" height="16" rx="1.5"/>
                <rect x="14" y="4" width="4" height="16" rx="1.5"/>
            </svg>
        {:else}
            <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
                <path d="M8 5v14l11-7z"/>
            </svg>
        {/if}
    </button>

    <div class="wave" on:click={seek}
         role="slider" tabindex="0"
         aria-valuenow={Math.round(progress*100)} aria-valuemin={0} aria-valuemax={100}>

        {#if waveLoading}
            <!-- Скелетон пока грузится -->
            <div class="bars skeleton">
                {#each Array(36) as _}
                    <div class="bar" style="height: 6px; background: rgba(255,255,255,0.08);"></div>
                {/each}
            </div>
        {:else}
            <div class="bars">
                {#each displayBars as h, i}
                    <div class="bar"
                         style="height:{Math.max(3, h * 36)}px;
                                background:{i/displayBars.length <= progress ? color : 'rgba(255,255,255,0.18)'};">
                    </div>
                {/each}
            </div>
        {/if}

        <div class="times">
            <span>{fmt(currentTime)}</span>
            <span class="dur">{fmt(duration)}</span>
        </div>
    </div>
</div>

<style>
    .vc { display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.55rem; min-width:185px; max-width:245px; }

    .play-btn {
        flex-shrink:0; width:36px; height:36px; border-radius:50%;
        background:rgba(252,238,10,.12); border:1.5px solid rgba(252,238,10,.45); color:#fcee0a;
        display:flex; align-items:center; justify-content:center;
        transition:background .2s, box-shadow .2s;
    }
    .play-btn:hover { background:rgba(252,238,10,.22); box-shadow:0 0 10px rgba(252,238,10,.3); }
    .own .play-btn { background:rgba(0,240,255,.1); border-color:rgba(0,240,255,.4); color:#00f0ff; }
    .own .play-btn:hover { background:rgba(0,240,255,.2); box-shadow:0 0 10px rgba(0,240,255,.3); }

    .wave { flex:1; cursor:pointer; display:flex; flex-direction:column; gap:3px; }

    .bars { display:flex; align-items:center; gap:2px; height:36px; }
    .bar { flex:1; border-radius:2px; min-height:3px; transition:height .04s ease; }

    .skeleton .bar { animation: skel 1.2s ease-in-out infinite; }
    @keyframes skel { 0%,100%{opacity:.3} 50%{opacity:.7} }

    .times { display:flex; justify-content:space-between; }
    .times span { font-family:'Chakra Petch',monospace; font-size:.58rem; color:rgba(255,255,255,.35); }
    .times .dur { color:rgba(255,255,255,.2); }
</style>