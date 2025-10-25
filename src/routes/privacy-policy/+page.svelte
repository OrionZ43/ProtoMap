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
    <title>Политика Конфиденциальности | ProtoMap</title>
</svelte:head>

<div class="legal-container cyber-panel" style="opacity: {$opacity}">
    <h2 class="title font-display">//: ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ</h2>
    <p class="subtitle">Последнее обновление: 25 октября 2025 г.</p>

    <div class="content-text">
        <p>Ваша приватность — наш главный приоритет. Эта Политика Конфиденциальности объясняет, какие данные мы (ProtoMap, "Сервис") собираем, как мы их используем и защищаем. Этот документ является частью нашего <a href="/terms-of-service" class="link">Пользовательского Соглашения</a>.</p>

        <h3 class="section-title">//: 1. КАКИЕ ДАННЫЕ МЫ СОБИРАЕМ</h3>
        <p>Мы собираем только ту информацию, которая необходима для функционирования Сервиса:</p>
        <ul>
            <li><strong>Данные, предоставляемые вами:</strong> При регистрации вы предоставляете email, пароль и уникальное имя пользователя (username). В своем профиле вы можете добровольно указать дополнительную информацию: статус, "о себе", ссылки на социальные сети и изображение (аватар).</li>
            <li><strong>Данные, создаваемые при использовании Сервиса:</strong> Это комментарии, которые вы оставляете в профилях, и сообщения в общем чате.</li>
            <li><strong>Данные о местоположении:</strong> Когда вы устанавливаете метку на карте, мы получаем ваши географические координаты. <strong>ВАЖНО:</strong> Мы <strong>не храним</strong> ваши точные координаты. Мы используем их только один раз для определения центра ближайшего района или населенного пункта и сохраняем только эти "безопасные", неточные координаты.</li>
            <li><strong>Файлы Cookie:</strong> Мы используем `httpOnly` cookie исключительно для управления вашей сессией аутентификации. Это технически необходимые файлы, которые позволяют вам оставаться в системе. Мы не используем их для отслеживания или рекламы.</li>
            <li><strong>Данные, собираемые автоматически:</strong> Как и большинство веб-сервисов, наши серверы могут автоматически записывать техническую информацию, такую как ваш IP-адрес, тип браузера и время запроса. Эта информация используется для диагностики и обеспечения безопасности.</li>
        </ul>

        <h3 class="section-title">//: 2. КАК МЫ ИСПОЛЬЗУЕМ ВАШИ ДАННЫЕ</h3>
        <p>Ваши данные используются исключительно для следующих целей:</p>
        <ul>
            <li><strong>Обеспечение работы Сервиса:</strong> Отображение вашего профиля, аватара и метки на карте; аутентификация и поддержание сессии; отправка и получение комментариев и сообщений.</li>
            <li><strong>Безопасность и модерация:</strong> Для расследования жалоб на контент и предотвращения нарушений наших правил.</li>
            <li><strong>Коммуникация:</strong> Мы можем использовать ваш email для важных уведомлений, связанных с безопасностью вашей учетной записи (например, для сброса пароля). Мы никогда не будем использовать его для маркетинговых рассылок.</li>
        </ul>

        <h3 class="section-title">//: 3. С КЕМ МЫ ДЕЛИМСЯ ДАННЫМИ</h3>
        <p>Мы <strong>не продаем</strong> и <strong>не передаем</strong> ваши личные данные третьим лицам. Ваши данные могут быть доступны только следующим сторонним сервисам, которые помогают нам обеспечивать работу ProtoMap:</p>
        <ul>
            <li><strong>Google Firebase:</strong> Платформа, которую мы используем для аутентификации, базы данных и хостинга серверной части.</li>
            <li><strong>Vercel:</strong> Платформа для хостинга клиентской части нашего сайта.</li>
            <li><strong>Cloudinary:</strong> Сервис, который мы используем для хранения и оптимизации ваших аватаров.</li>
            <li><strong>Nominatim (OpenStreetMap):</strong> Сервис, который мы используем для анонимизации ваших координат. Мы отправляем ему координаты, а он возвращает нам название района.</li>
        </ul>
        <p>Каждый из этих сервисов имеет собственную строгую политику конфиденциальности.</p>

        <h3 class="section-title">//: 4. ХРАНЕНИЕ И ЗАЩИТА ДАННЫХ</h3>
        <p>Мы используем современные технические средства для защиты ваших данных, предоставляемые платформой Google Firebase. Ваши пароли хранятся в зашифрованном виде (хэшируются). Однако ни один метод передачи данных через Интернет не является на 100% безопасным.</p>

        <h3 class="section-title">//: 5. ВАШИ ПРАВА</h3>
        <p>Вы имеете право:</p>
        <ul>
            <li>Получать доступ к своим личным данным, которые вы предоставили (вы можете видеть их в своем профиле).</li>
            <li>Редактировать свои данные через страницу редактирования профиля.</li>
            <li>Удалять часть своих данных (например, удалить свою метку с карты или комментарии).</li>
            <li><strong>Полностью удалить свою учетную запись.</strong> Эта функция доступна на странице редактирования профиля. При удалении аккаунта ваша личная информация (профиль, email, метка на карте) будет безвозвратно стерта. Созданный вами публичный контент (комментарии и сообщения в чате) будет <strong>анонимизирован</strong> (отвязан от вашей личности), чтобы сохранить целостность публичных диалогов.</li>
        </ul>

        <h3 class="section-title">//: 6. КОНТАКТНАЯ ИНФОРМАЦИЯ</h3>
        <p>Если у вас есть вопросы по поводу этой Политики Конфиденциальности, пожалуйста, свяжитесь с нами через Telegram: <a href="https://t.me/Orion_Z43" target="_blank" class="link">@Orion_Z43</a>.</p>
    </div>
</div>

<style>
    .legal-container {
        max-width: 800px;
        margin: 2.5rem auto;
        padding: 2rem 2.5rem;
        background: rgba(10, 10, 10, 0.7);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        border: 1px solid rgba(252, 238, 10, 0.2);
        clip-path: polygon(0 20px, 20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
    }
    .title {
        font-size: 2rem;
        font-weight: 700;
        text-align: center;
        color: #fff;
        margin-bottom: 0.5rem;
    }
    .subtitle {
        text-align: center;
        color: var(--text-muted-color, #909dab);
        margin-bottom: 2rem;
        font-family: 'Chakra Petch', monospace;
    }
    .content-text {
        font-size: 1rem;
        line-height: 1.7;
        color: var(--text-color, #e8e8e8);
    }
    .content-text p {
        margin-bottom: 1rem;
    }
    .section-title {
        font-family: 'Chakra Petch', monospace;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--cyber-yellow, #fcee0a);
        margin-top: 2rem;
        margin-bottom: 1rem;
        border-bottom: 1px solid rgba(252, 238, 10, 0.2);
        padding-bottom: 0.5rem;
    }
    .content-text ul {
        list-style-type: none;
        padding-left: 1rem;
        margin-bottom: 1rem;
    }
    .content-text li {
        position: relative;
        padding-left: 1.5rem;
        margin-bottom: 0.5rem;
    }
    .content-text li::before {
        content: '//:';
        position: absolute;
        left: 0;
        color: var(--cyber-yellow, #fcee0a);
        opacity: 0.7;
    }
    .link {
        color: var(--cyber-cyan, #00f0ff);
        text-decoration: underline;
        transition: color 0.2s;
    }
    .link:hover {
        color: #fff;
    }
    @media (max-width: 640px) {
        .legal-container {
            margin: 1rem;
            padding: 1.5rem;
        }
        .title {
            font-size: 1.5rem;
        }
        .content-text {
            font-size: 0.9rem;
        }
    }
</style>