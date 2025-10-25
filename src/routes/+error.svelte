<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>404: Сигнал потерян | ProtoMap</title>
</svelte:head>

<div class="error-container">
    <div class="background-effects">
        <div class="grid-overlay"></div>
        <div class="scanline"></div>
        <div class="vignette"></div>
    </div>

    <div class="content">
        <div class="radar">
            <div class="sweep"></div>
        </div>

        <h1 class="glitch" data-text="404: NODE NOT FOUND">404: NODE NOT FOUND</h1>
        <p class="subtitle">Сигнал потерян. Запрашиваемый узел не отвечает или не существует в этом секторе сети.</p>
        <p class="error-details">Код ошибки: {$page.status} // URL: {$page.url.pathname}</p>

        <a href="/" class="return-btn font-display">
            <span>&lt;</span> ВЕРНУТЬСЯ НА ГЛАВНУЮ КАРТУ
        </a>
    </div>
</div>

<style>
    @keyframes sweep-anim {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    @keyframes pulse-light {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
    }
    @keyframes glitch-anim { 0% { clip-path: inset(15% 0 70% 0); transform: translateX(-2px); } 100% { clip-path: inset(80% 0 5% 0); transform: translateX(2px); } }
    @keyframes glitch-anim-2 { 0% { clip-path: inset(5% 0 90% 0); } 100% { clip-path: inset(70% 0 15% 0); } }
    @keyframes scanline-anim { 0% { transform: translateY(-50vh); } 100% { transform: translateY(150vh); } }

    .error-container {
        position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh;
        background-color: #050a05;
        color: var(--cyber-red, #ff3300);
        font-family: 'Chakra Petch', monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        overflow: hidden;
    }

    .background-effects { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    .grid-overlay {
        position: absolute; width: 100%; height: 100%; opacity: 0.1;
        background-image: linear-gradient(rgba(255, 51, 0, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 51, 0, 0.2) 1px, transparent 1px);
        background-size: 40px 40px;
    }
    .scanline {
        position: absolute; width: 100%; height: 150px;
        background: linear-gradient(to bottom, transparent, rgba(255, 51, 0, 0.1), transparent);
        animation: scanline-anim 5s linear infinite; opacity: 0.7;
    }
    .vignette {
        position: absolute; width: 100%; height: 100%;
        background: radial-gradient(circle, transparent 40%, black 120%);
    }

    .content {
        z-index: 10;
        padding: 2rem;
    }

    .radar {
        width: 150px; height: 150px;
        border: 2px solid rgba(255, 51, 0, 0.3);
        border-radius: 50%;
        margin: 0 auto 2rem auto;
        position: relative;
        background: radial-gradient(circle, rgba(255, 51, 0, 0.1) 0%, transparent 70%);
    }
    .radar::before, .radar::after {
        content: '';
        position: absolute;
        top: 50%; left: 0;
        width: 100%; height: 1px;
        background: rgba(255, 51, 0, 0.2);
    }
    .radar::after {
        transform: rotate(90deg);
    }

    .sweep {
        width: 50%; height: 50%;
        position: absolute;
        top: 0; left: 0;
        transform-origin: 100% 100%;
        background: linear-gradient(45deg, transparent 50%, rgba(255, 51, 0, 0.7) 100%);
        animation: sweep-anim 3s linear infinite;
    }

    h1 {
        font-size: 3rem;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 0.5rem;
    }
    .subtitle {
        font-size: 1rem;
        color: rgba(255,255,255,0.6);
        max-width: 40ch;
        margin: 0 auto 2rem auto;
    }
    .error-details {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.3);
        margin-bottom: 3rem;
    }

    .return-btn {
        display: inline-block;
        padding: 0.75rem 1.5rem;
        border: 2px solid var(--cyber-red);
        color: var(--cyber-red);
        text-decoration: none;
        transition: all 0.2s;
    }
    .return-btn:hover {
        background: var(--cyber-red);
        color: #000;
        box-shadow: 0 0 20px var(--cyber-red);
    }
    .return-btn span {
        margin-right: 0.5rem;
        display: inline-block;
        transition: transform 0.2s;
    }
    .return-btn:hover span {
        transform: translateX(-5px);
    }

    .glitch { position: relative; }
    .glitch::before, .glitch::after {
        content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #050a05; overflow: hidden;
    }
    .glitch::before { text-shadow: -2px 0 var(--cyber-yellow); left: 2px; animation: glitch-anim 2s infinite linear alternate-reverse; }
    .glitch::after { text-shadow: 2px 0 var(--cyber-cyan, #00f0ff); left: -2px; animation: glitch-anim-2 2s 0.2s infinite linear alternate-reverse; }
</style>