<script lang="ts">
    import { onMount } from 'svelte';
    import { quintOut } from 'svelte/easing';
    import { tweened } from 'svelte/motion';

    const opacity = tweened(0, { duration: 400, easing: quintOut });
    onMount(() => {
        opacity.set(1);
    });
</script>

<svelte:head>
    <title>Условия Использования | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h2 class="title font-display">//: УСЛОВИЯ ИСПОЛЬЗОВАНИЯ</h2>
    <p class="subtitle">Последнее обновление: 23 ноября 2025 г.</p>

    <div class="content-text">
        <div class="disclaimer-box">
            <strong class="text-red-500">⚠️ ВНИМАНИЕ:</strong>
            <p>Сервис содержит элементы геймификации, имитирующие азартные игры («The Glitch Pit»). Игра ведется исключительно на виртуальную валюту, не имеющую реальной стоимости. Сервис не является платформой для азартных игр на деньги.</p>
        </div>

        <p>Настоящее Пользовательское Соглашение (далее — «Соглашение») является юридически обязательным договором между вами (далее — «Пользователь») и администрацией сервиса ProtoMap (далее — «Администрация», «Сервис»).</p>

        <h3 class="section-title">//: 1. АКЦЕПТ СОГЛАШЕНИЯ</h3>
        <ul>
            <li>Использование Сервиса любым способом (просмотр, регистрация, размещение контента) означает ваше полное и безоговорочное согласие с настоящим Соглашением.</li>
            <li>Если вы не согласны с условиями, вы не имеете права использовать Сервис.</li>
        </ul>

        <h3 class="section-title">//: 2. ПРАВИЛА ПОВЕДЕНИЯ</h3>
        <p>В целях поддержания безопасной и дружелюбной атмосферы, Пользователям запрещается:</p>
        <ul>
            <li>Публиковать контент, нарушающий законодательство, авторские права или права третьих лиц.</li>
            <li>Размещать спам, вредоносные ссылки, рекламу сторонних ресурсов без согласования.</li>
            <li>Использовать оскорбления, угрозы, язык вражды (hate speech) в комментариях и профиле.</li>
            <li>Выдавать себя за администратора Сервиса или другое лицо (имперсонация).</li>
            <li>Использовать автоматизированные скрипты (ботов) для накрутки валюты, спама или сбора данных.</li>
        </ul>

        <h3 class="section-title">//: 3. ВИРТУАЛЬНЫЕ ТОВАРЫ И ВАЛЮТА</h3>
        <p>Сервис предоставляет доступ к виртуальной валюте («Протокоины») и цифровым предметам («Рамки», «Бейджи»):</p>
        <ul>
            <li><strong>Отсутствие стоимости:</strong> Виртуальные товары не являются собственностью Пользователя, не имеют денежной стоимости и не подлежат обмену на реальные деньги.</li>
            <li><strong>Лицензия:</strong> Приобретая виртуальный товар, вы получаете ограниченную, отзывную, непередаваемую лицензию на использование данного элемента интерфейса в рамках Сервиса.</li>
            <li><strong>Сброс и Удаление:</strong> Администрация оставляет за собой право изменять баланс, удалять предметы или обнулять прогресс в случае технических сбоев, багоюза или нарушения правил.</li>
        </ul>

        <h3 class="section-title">//: 4. ИНТЕЛЛЕКТУАЛЬНАЯ СОБСТВЕННОСТЬ</h3>
        <ul>
            <li><strong>Контент Сервиса:</strong> Дизайн, логотип (ProtoMap), программный код, тексты интерфейса и механики являются интеллектуальной собственностью Администрации.</li>
            <li><strong>Контент Пользователя:</strong> Вы сохраняете авторские права на контент, который вы публикуете (аватары, тексты). Однако вы предоставляете Сервису неисключительную лицензию на хранение, отображение и воспроизведение этого контента для целей функционирования Сервиса.</li>
            <li><strong>Торговые марки:</strong> Упоминание любых сторонних брендов носит исключительно информационный характер. Мы не связаны с компанией Protomaps LLC.</li>
        </ul>

        <h3 class="section-title">//: 5. ОТКАЗ ОТ ГАРАНТИЙ (AS IS)</h3>
        <p>Сервис предоставляется на условиях «КАК ЕСТЬ». Администрация не гарантирует:</p>
        <ul>
            <li>Бесперебойную работу Сервиса, отсутствие ошибок или технических сбоев.</li>
            <li>Сохранность пользовательских данных в случае форс-мажорных обстоятельств или хакерских атак (несмотря на все принимаемые меры защиты).</li>
            <li>Соответствие Сервиса конкретным целям или ожиданиям Пользователя.</li>
        </ul>

        <h3 class="section-title">//: 6. БЛОКИРОВКА И ОТВЕТСТВЕННОСТЬ</h3>
        <p>Администрация имеет право в одностороннем порядке:</p>
        <ul>
            <li>Ограничить или полностью заблокировать доступ Пользователя к Сервису (Бан) за нарушение настоящего Соглашения.</li>
            <li>Удалить любую информацию или контент, нарушающий правила.</li>
            <li>Отказать в восстановлении доступа без объяснения причин в случае грубых нарушений.</li>
        </ul>

        <h3 class="section-title">//: 7. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ</h3>
        <ul>
            <li>Администрация вправе вносить изменения в Соглашение в любое время. Изменения вступают в силу с момента публикации.</li>
            <li>Вопросы и претензии принимаются через официальный канал связи в Telegram: <a href="https://t.me/Orion_Z43" target="_blank" class="link">@Orion_Z43</a>.</li>
        </ul>
    </div>
</div>

<style>
    .legal-container {
        max-width: 900px;
        margin: 2.5rem auto;
        padding: 3rem;
        background: rgba(10, 12, 15, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
    }
    .disclaimer-box {
        background: rgba(255, 0, 60, 0.1);
        border: 1px solid var(--cyber-red, #ff003c);
        padding: 1rem;
        margin-bottom: 2rem;
        font-size: 0.9rem;
        color: #ffccd5;
    }
    .title {
        font-size: 2.5rem;
        font-weight: 700;
        text-align: center;
        color: #fff;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .subtitle {
        text-align: center;
        color: var(--text-muted-color, #909dab);
        margin-bottom: 3rem;
        font-family: 'Chakra Petch', monospace;
        font-size: 0.9rem;
    }
    .content-text {
        font-size: 1rem;
        line-height: 1.8;
        color: #d1d5db;
    }
    .content-text p { margin-bottom: 1.5rem; text-align: justify; }

    .section-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        margin-top: 3rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.5rem;
    }
    .content-text ul {
        list-style-type: none;
        padding-left: 1rem;
        margin-bottom: 1.5rem;
    }
    .content-text li {
        position: relative;
        padding-left: 2rem;
        margin-bottom: 0.8rem;
    }
    .content-text li::before {
        content: '>';
        position: absolute;
        left: 0;
        color: var(--cyber-yellow, #fcee0a);
        font-weight: bold;
    }
    .link {
        color: var(--cyber-cyan, #00f0ff);
        text-decoration: none;
        border-bottom: 1px dashed var(--cyber-cyan);
        transition: all 0.2s;
    }
    .link:hover {
        color: #fff;
        border-bottom-style: solid;
    }
    @media (max-width: 640px) {
        .legal-container { margin: 1rem; padding: 1.5rem; }
        .title { font-size: 1.8rem; }
        .content-text { font-size: 0.95rem; }
    }
</style>