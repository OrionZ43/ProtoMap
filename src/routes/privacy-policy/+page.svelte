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
    <p class="subtitle">Последнее обновление: 23 ноября 2025 г.</p>

    <div class="content-text">
        <div class="disclaimer-box">
            <strong class="text-red-500">⚠️ ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ (DISCLAIMER):</strong>
            <p>Проект <strong>ProtoMap</strong> (данный веб-сайт) является независимым, некоммерческим развлекательным сервисом. Мы <strong>не связаны, не аффилированы и не имеем отношения</strong> к компании <em class="text-white">Protomaps LLC</em> (protomaps.com) или их продуктам. Любые совпадения в названиях случайны.</p>
        </div>

        <p>Настоящая Политика конфиденциальности (далее — «Политика») описывает порядок сбора, использования, хранения и защиты информации о пользователях (далее — «Пользователи») сервиса ProtoMap.</p>

        <h3 class="section-title">//: 1. ОБЩИЕ ПОЛОЖЕНИЯ</h3>
        <ul>
            <li>Используя Сервис, Пользователь выражает свое полное согласие с условиями настоящей Политики.</li>
            <li>В случае несогласия с условиями Политики, Пользователь должен немедленно прекратить использование Сервиса.</li>
        </ul>

        <h3 class="section-title">//: 2. СОБИРАЕМАЯ ИНФОРМАЦИЯ</h3>
        <p>Мы собираем следующие категории данных:</p>
        <ul>
            <li><strong>Данные учетной записи:</strong> Адрес электронной почты (email), хэшированный пароль, уникальный идентификатор (UID), имя пользователя (username).</li>
            <li><strong>Публичный профиль:</strong> Информация, которую Пользователь добровольно размещает в открытом доступе: аватар, статус, описание «о себе», ссылки на социальные сети.</li>
            <li><strong>Игровые данные:</strong> Баланс виртуальной валюты («Протокоины»), история транзакций, список приобретенных виртуальных предметов (инвентарь), статистика игр.</li>
            <li><strong>Геолокационные данные:</strong> Координаты, предоставляемые Пользователем для отображения на карте. Сервис намеренно огрубляет (анонимизирует) эти данные до уровня населенного пункта или района перед сохранением. Точные GPS-координаты на серверах не хранятся.</li>
            <li><strong>Контент:</strong> Текстовые комментарии, сообщения в чатах и метаданные, связанные с ними (время отправки).</li>
            <li><strong>Технические данные:</strong> IP-адреса, тип устройства, данные браузера и файлы cookie (исключительно для целей аутентификации и безопасности).</li>
        </ul>

        <h3 class="section-title">//: 3. ЦЕЛИ ОБРАБОТКИ ДАННЫХ</h3>
        <p>Мы используем собранную информацию для:</p>
        <ul>
            <li><strong>Функционирования Сервиса:</strong> Аутентификация, отображение меток на карте, работа чатов и комментариев.</li>
            <li><strong>Геймификации:</strong> Подсчет рейтингов, отображение списков лидеров («Топ Хайроллеров»), работа механик казино и магазина.</li>
            <li><strong>Безопасности:</strong> Выявление и блокировка нарушителей, защита от спама, предотвращение мошенничества с виртуальной валютой.</li>
        </ul>

        <h3 class="section-title">//: 4. ВИРТУАЛЬНЫЕ ЦЕННОСТИ</h3>
        <ul>
            <li>«Протокоины», «Рамки», «Предметы» и иные цифровые объекты внутри Сервиса являются исключительно элементами программного кода и дизайна.</li>
            <li>Они <strong>не имеют реальной денежной стоимости</strong>, не являются криптовалютой, электронными денежными средствами или финансовыми инструментами.</li>
            <li>Сервис не предоставляет возможности обмена виртуальных ценностей на реальные деньги (fiat) или иные материальные блага.</li>
        </ul>

        <h3 class="section-title">//: 5. ПЕРЕДАЧА ДАННЫХ ТРЕТЬИМ ЛИЦАМ</h3>
        <p>Мы не продаем и не передаем персональные данные Пользователей третьим лицам в маркетинговых целях. Данные могут обрабатываться следующими техническими партнерами:</p>
        <ul>
            <li><strong>Google Firebase (США):</strong> Хостинг базы данных, аутентификация, облачные функции.</li>
            <li><strong>Vercel Inc. (США):</strong> Хостинг клиентской части веб-приложения.</li>
            <li><strong>Cloudinary (США):</strong> Хранение и обработка изображений (аватаров).</li>
            <li><strong>OpenStreetMap / Nominatim:</strong> Сервис геокодирования (используется для преобразования координат в название города без сохранения личности).</li>
        </ul>

        <h3 class="section-title">//: 6. ПРАВА ПОЛЬЗОВАТЕЛЯ И УДАЛЕНИЕ ДАННЫХ</h3>
        <p>Пользователь имеет право:</p>
        <ul>
            <li>Редактировать свои личные данные в настройках профиля.</li>
            <li><strong>Запросить полное удаление аккаунта.</strong> Функция автоматического удаления доступна в интерфейсе Сервиса.
                <br><span class="text-gray-400 text-sm ml-4">// При удалении аккаунта все персональные данные (Email, UID, профиль, метка) уничтожаются безвозвратно. Публичный контент (сообщения) проходит процедуру анонимизации (отвязки от личности), чтобы сохранить связность публичных бесед.</span>
            </li>
        </ul>

        <h3 class="section-title">//: 7. БЛОКИРОВКА И ОТВЕТСТВЕННОСТЬ</h3>
        <ul>
            <li>Администрация оставляет за собой право заблокировать доступ к Сервису любому Пользователю за нарушение правил, без предварительного уведомления.</li>
            <li>В случае блокировки (бана) доступ к аккаунту и виртуальным ценностям прекращается. Компенсация не предусмотрена.</li>
        </ul>

        <h3 class="section-title">//: 8. ИЗМЕНЕНИЯ В ПОЛИТИКЕ</h3>
        <p>Мы оставляем за собой право вносить изменения в настоящую Политику. Продолжение использования Сервиса после внесения изменений означает принятие новой редакции Политики.</p>

        <h3 class="section-title">//: 9. КОНТАКТЫ</h3>
        <p>По вопросам приватности и данных: <a href="https://t.me/Orion_Z43" target="_blank" class="link">Telegram @Orion_Z43</a>.</p>
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