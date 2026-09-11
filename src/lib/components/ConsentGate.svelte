<script lang="ts">
    /**
     * Экран согласий для тех, кто зарегистрировался раньше.
     *
     * Зачем он есть. Галочки собирались только на странице регистрации, а
     * учётные записи, созданные до неё, не имели ни одной записи в журнале
     * согласий — и никакого способа её поставить. Массовый разлогин эту дыру
     * не закрывает: форма входа согласий не собирает, человек вернулся бы в тот
     * же аккаунт с тем же нулём в журнале.
     *
     * Показывается по решению сервера (`needsConsent` в `+layout.server.ts`), а
     * не по проверке в браузере: клиентскую проверку обходит любой, кто откроет
     * консоль, а нужно фактическое согласие, а не его видимость.
     *
     * Закрыть его нечем — это не баннер. Выйти из аккаунта и удалить его можно,
     * прочитать документы можно (их маршруты выведены из-под перекрытия), а
     * пользоваться Сервисом без согласия — нет.
     */
    import { fade, scale } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation';
    import { signOut } from 'firebase/auth';
    import { httpsCallable } from 'firebase/functions';
    import { auth, functions } from '$lib/firebase';
    import { t, locale } from 'svelte-i18n';
    import NeonButton from '$lib/components/NeonButton.svelte';

    /** Редакции, которые человеку предлагается принять. Для показа в шапке. */
    export let versions: { privacy: string; tos: string } = { privacy: '', tos: '' };

    let ageMinimum = false;
    let coreProcessing = false;
    let crossBorder = false;
    let tos = false;

    let saving = false;
    let error = '';

    // Ни одна галочка не предзаполнена: предзаполненная галочка не является
    // выражением воли. То же правило, что и на регистрации.
    $: allGiven = ageMinimum && coreProcessing && crossBorder && tos;

    /**
     * Виды согласий в том порядке, в котором их ждёт Cloud Function.
     * `activity_data` (шагомер) здесь нет: на вебе шагомера не существует,
     * его спрашивает Android в своём разделе.
     */
    const GRANTED = ['age_minimum', 'core_processing', 'cross_border', 'tos'];

    /**
     * Переключение языка прямо здесь.
     *
     * Экран перекрывает всё, включая переключатель в шапке сайта. Без своего
     * человек, читающий по-английски, оказался бы заперт перед юридическим
     * текстом на русском — а согласие должно быть осознанным.
     */
    function changeLang(lang: 'ru' | 'en') {
        locale.set(lang);
        try {
            localStorage.setItem('protomap_lang', lang);
        } catch {
            // Приватный режим: язык переключится, но не запомнится.
        }
    }

    async function accept() {
        if (!allGiven || saving) return;
        saving = true;
        error = '';

        try {
            const fn = httpsCallable(functions, 'recordConsents');
            await fn({ granted: GRANTED, method: 'web' });

            // Перечитываем данные страницы: сервер увидит свежие зеркала версий
            // в документе пользователя и больше не поднимет `needsConsent`.
            await invalidateAll();
        } catch (e) {
            // Пользователю — понятный текст на его языке. Техническую причину
            // («internal», «failed-precondition: …») показывать незачем: сделать
            // с ней он ничего не может, а в консоли она нужна нам.
            console.error('[consent] recordConsents:', e);
            error = $t('legal.gate.error');
            saving = false;
        }
    }

    async function leave() {
        await signOut(auth);
        window.location.href = '/login';
    }
</script>

<div class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" transition:fade={{ duration: 200 }}>
    <div class="panel" transition:scale={{ duration: 260, start: 0.97 }}>
        <div class="corner-tl" aria-hidden="true"></div>
        <div class="corner-br" aria-hidden="true"></div>
        <div class="scanline" aria-hidden="true"></div>

        <div class="bar">
            <span class="dot" aria-hidden="true"></span>
            <span class="bar-id font-display">// CONSENT_REQUIRED</span>

            <div class="lang" role="group" aria-label="Язык / Language">
                <button type="button" class="lang-btn font-display" class:active={$locale === 'ru'}
                        on:click={() => changeLang('ru')}>RU</button>
                <button type="button" class="lang-btn font-display" class:active={$locale === 'en'}
                        on:click={() => changeLang('en')}>EN</button>
            </div>
        </div>

        <header class="head">
            <h2 id="gate-title" class="title font-display">{$t('legal.gate.title')}</h2>
            <p class="lede">{$t('legal.gate.lede')}</p>
            {#if versions.privacy || versions.tos}
                <p class="versions font-display">
                    {#if versions.privacy}
                        <span>{$t('legal.gate.v_privacy')} <b>{versions.privacy}</b></span>
                    {/if}
                    {#if versions.tos}
                        <span>{$t('legal.gate.v_tos')} <b>{versions.tos}</b></span>
                    {/if}
                </p>
            {/if}
        </header>

        <div class="body">
            <section class="notice">
                <div class="notice-head font-display">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    {$t('auth.consent.notice_title')}
                </div>

                <p>{$t('auth.consent.operator')}</p>
                <p>{$t('auth.consent.purposes')}</p>
                <p><strong>{$t('auth.consent.rights_title')}</strong> {$t('auth.consent.rights')}</p>
                <p><strong>{$t('auth.consent.howto_title')}</strong> {$t('auth.consent.howto')}</p>
                <p><strong>{$t('auth.consent.consequences_title')}</strong> {$t('auth.consent.consequences')}</p>
                <p>
                    {$t('auth.consent.policy_more')}
                    <a href="/personal-data-policy" target="_blank" rel="noopener">{$t('auth.consent.policy_link')}</a>.
                </p>
            </section>

            <div class="checks">
                <label class="check">
                    <input type="checkbox" bind:checked={ageMinimum} />
                    <span class="box" aria-hidden="true"></span>
                    <span class="label">
                        {$t('auth.consent.cb_age_minimum')}
                        <span class="hint">{$t('auth.consent.age_hint')}</span>
                    </span>
                </label>

                <label class="check">
                    <input type="checkbox" bind:checked={coreProcessing} />
                    <span class="box" aria-hidden="true"></span>
                    <span class="label">{$t('auth.consent.cb_core')}</span>
                </label>

                <label class="check">
                    <input type="checkbox" bind:checked={crossBorder} />
                    <span class="box" aria-hidden="true"></span>
                    <span class="label">{$t('auth.consent.cb_cross_border')}</span>
                </label>

                <label class="check">
                    <input type="checkbox" bind:checked={tos} />
                    <span class="box" aria-hidden="true"></span>
                    <span class="label">
                        {$t('auth.terms_agree')}
                        <a href="/terms-of-service" target="_blank" rel="noopener">{$t('auth.terms_link')}</a>
                        {$t('legal.gate.and')}
                        <a href="/privacy-policy" target="_blank" rel="noopener">{$t('auth.privacy_link')}</a>
                    </span>
                </label>
            </div>

            {#if error}
                <p class="error" role="alert">{error}</p>
            {/if}
        </div>

        <footer class="foot">
            <NeonButton type="button" disabled={!allGiven || saving} on:click={accept}>
                {saving ? $t('legal.gate.saving') : $t('legal.gate.accept')}
            </NeonButton>

            <div class="alt">
                <button type="button" class="link-btn" on:click={leave}>{$t('legal.gate.logout')}</button>
                <span class="sep" aria-hidden="true">//</span>
                <!-- Отказ должен быть выполнимым, иначе согласие не свободно.
                     /settings/security выведена из-под перекрытия ровно за этим. -->
                <a class="link-btn" href="/settings/security">{$t('legal.gate.refuse')}</a>
            </div>
        </footer>
    </div>
</div>

<style>
    .gate {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(3, 5, 10, 0.92);
        backdrop-filter: blur(6px);
        overflow-y: auto;
    }

    .panel {
        position: relative;
        width: min(46rem, 100%);
        max-height: calc(100vh - 2rem);
        display: flex;
        flex-direction: column;
        background: #08080c;
        border: 1px solid rgba(252, 238, 10, 0.22);
        box-shadow:
            0 0 42px rgba(252, 238, 10, 0.09),
            inset 0 0 60px rgba(252, 238, 10, 0.012);
        overflow: hidden;
    }

    /* Угловые акценты и скан-линия — тот же язык, что у LegalUpdateBanner */
    .corner-tl,
    .corner-br {
        position: absolute;
        width: 16px;
        height: 16px;
        border-color: var(--cyber-yellow, #f5e663);
        pointer-events: none;
    }
    .corner-tl {
        top: 0;
        left: 0;
        border-top: 2px solid;
        border-left: 2px solid;
    }
    .corner-br {
        right: 0;
        bottom: 0;
        border-right: 2px solid;
        border-bottom: 2px solid;
    }
    .scanline {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: repeating-linear-gradient(
            to bottom,
            transparent 0 3px,
            rgba(252, 238, 10, 0.018) 3px 4px
        );
    }

    /* Служебная строка — та же подача, что над документами на /privacy-policy */
    .bar {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.55rem 1.1rem;
        background: rgba(252, 238, 10, 0.05);
        border-bottom: 1px solid rgba(252, 238, 10, 0.2);
    }
    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 0 8px var(--cyber-yellow, #fcee0a);
        animation: gate-pulse 2s infinite ease-in-out;
    }
    @keyframes gate-pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.35; }
    }
    .bar-id {
        font-size: 0.7rem;
        letter-spacing: 0.16em;
        color: var(--cyber-yellow, #fcee0a);
    }
    .lang {
        display: flex;
        gap: 2px;
        margin-left: auto;
        padding: 2px;
        border: 1px solid rgba(252, 238, 10, 0.25);
        background: rgba(0, 0, 0, 0.4);
    }
    .lang-btn {
        padding: 2px 9px;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #6f8599;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: color 0.18s, background 0.18s;
    }
    .lang-btn:hover:not(.active) {
        color: #d8e8f5;
    }
    .lang-btn.active {
        color: #06080f;
        background: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 0 8px rgba(252, 238, 10, 0.45);
    }

    .head {
        padding: 1.3rem 1.6rem 1.1rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .title {
        margin: 0 0 0.55rem;
        font-size: clamp(1.25rem, 3vw, 1.7rem);
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #ffffff;
        text-shadow: 0 0 18px rgba(255, 255, 255, 0.12);
    }
    .lede {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.55;
        color: #9fb2c6;
    }
    .versions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin: 0.75rem 0 0;
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        color: #6b6b57;
    }
    .versions b {
        color: var(--cyber-yellow, #fcee0a);
        font-weight: 700;
    }

    .body {
        padding: 1.2rem 1.6rem;
        overflow-y: auto;
    }

    /* Полоса прокрутки внутри разъяснения — в цвет интерфейса, а не системная */
    .notice::-webkit-scrollbar {
        width: 6px;
    }
    .notice::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.3);
    }
    .notice::-webkit-scrollbar-thumb {
        background: rgba(252, 238, 10, 0.35);
    }
    .notice::-webkit-scrollbar-thumb:hover {
        background: rgba(252, 238, 10, 0.55);
    }

    .notice {
        /* Прокручивается сам блок разъяснения, а не всё тело окна: иначе
           галочки и кнопка уезжают под сгиб, и главное действие приходится
           искать прокруткой. */
        max-height: 26vh;
        overflow-y: auto;
        margin-bottom: 1.4rem;
        padding: 0.9rem 1rem;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-left: 3px solid var(--cyber-yellow, #fcee0a);
    }
    .notice-head {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        margin-bottom: 0.7rem;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--cyber-yellow, #fcee0a);
    }
    .notice p {
        margin: 0 0 0.6rem;
        font-size: 0.8rem;
        line-height: 1.6;
        color: #8ea3b8;
    }
    .notice p:last-child {
        margin-bottom: 0;
    }
    .notice strong {
        color: #cfe2f2;
    }

    .checks {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
    }
    .check {
        display: flex;
        align-items: flex-start;
        gap: 0.7rem;
        padding: 0.6rem 0.75rem;
        background: rgba(255, 255, 255, 0.015);
        border: 1px solid rgba(255, 255, 255, 0.06);
        cursor: pointer;
        transition: border-color 0.18s, background 0.18s;
    }
    .check:hover {
        border-color: rgba(252, 238, 10, 0.32);
        background: rgba(252, 238, 10, 0.03);
    }
    .check input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
    }
    .box {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        margin-top: 2px;
        border: 1px solid rgba(252, 238, 10, 0.45);
        background: rgba(252, 238, 10, 0.05);
        position: relative;
        transition: background 0.15s, border-color 0.15s;
    }
    .check input:checked + .box {
        background: var(--cyber-yellow, #fcee0a);
        border-color: var(--cyber-yellow, #fcee0a);
        box-shadow: 0 0 10px rgba(252, 238, 10, 0.45);
    }
    .check input:checked + .box::after {
        content: '';
        position: absolute;
        left: 5px;
        top: 1px;
        width: 5px;
        height: 10px;
        border: solid #06080f;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
    }
    .check input:focus-visible + .box {
        outline: 2px solid var(--cyber-yellow, #f5e663);
        outline-offset: 2px;
    }
    .label {
        font-size: 0.82rem;
        line-height: 1.5;
        color: #a9bccf;
    }
    .label a {
        color: var(--cyber-yellow, #fcee0a);
        text-decoration: none;
        border-bottom: 1px dashed rgba(252, 238, 10, 0.45);
    }
    .label a:hover {
        color: #fff;
        border-color: rgba(255, 255, 255, 0.6);
    }

    .error {
        margin: 1rem 0 0;
        padding: 0.6rem 0.8rem;
        font-size: 0.8rem;
        color: #ff9a9a;
        background: rgba(255, 60, 60, 0.08);
        border-left: 2px solid #ff5c5c;
    }

    .foot {
        /* NeonButton берёт цвет отсюда: по умолчанию он голубой, а у нас
           фирменная пара — чёрный и жёлтый. */
        --primary-color: var(--cyber-yellow, #fcee0a);
        padding: 1.1rem 1.6rem 1.4rem;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.85rem;
    }
    .alt {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        justify-content: center;
    }
    .link-btn {
        background: none;
        border: none;
        padding: 0;
        font-size: 0.76rem;
        color: #6f8599;
        text-decoration: none;
        border-bottom: 1px dashed rgba(111, 133, 153, 0.4);
        cursor: pointer;
        transition: color 0.18s, border-color 0.18s;
    }
    .link-btn:hover {
        color: var(--cyber-yellow, #fcee0a);
        border-color: rgba(252, 238, 10, 0.5);
    }
    .sep {
        color: #3d4d5c;
    }

    @media (max-width: 640px) {
        .bar,
        .head,
        .body,
        .foot {
            padding-left: 1.1rem;
            padding-right: 1.1rem;
        }
        .title {
            font-size: 1.25rem;
        }
    }

    /* Пояснение под галочкой возраста: почему младше 16 нельзя */
    .label .hint {
        display: block;
        margin-top: 0.25rem;
        font-size: 0.72rem;
        line-height: 1.45;
        color: #6b7280;
    }
    .notice a {
        color: var(--cyber-yellow, #fcee0a);
        text-decoration: none;
        border-bottom: 1px dashed rgba(252, 238, 10, 0.45);
    }
    .notice a:hover {
        color: #fff;
        border-color: rgba(255, 255, 255, 0.6);
    }
</style>
