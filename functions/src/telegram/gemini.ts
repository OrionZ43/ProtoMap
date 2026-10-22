/**
 * Всё, что бот делает через Gemini: расшифровка голосовых и видеокружков
 * и ответы на вопросы (features/ask.ts).
 *
 * Почему Gemini, а не Whisper: ключ `GEMINI_API_KEY` в проекте уже есть и уже
 * используется (перевод инцидентов Claude в telegramBot.ts), модель принимает
 * аудио и видео на вход напрямую, и бесплатного лимита на объём личного чата
 * хватает с запасом. Отдельный сервис под это поднимать нечего.
 *
 * ffmpeg не нужен: Gemini принимает и `audio/ogg` (формат голосовых Telegram),
 * и `video/mp4` (формат кружков) как есть, без перекодирования.
 *
 * Ограничения, из которых выведены проверки ниже:
 *   - бот может скачать файл не больше 20 МБ (лимит Bot API, не наш);
 *   - inline-данные в запросе к Gemini тоже упираются примерно в 20 МБ,
 *     дальше нужен отдельный File API — для голосовых это недостижимо;
 *   - голосовое весит около мегабайта на минуту, кружок ограничен минутой,
 *     так что в норме до лимитов далеко. Проверки нужны для случая, когда
 *     кто-то перешлёт в чат часовой аудиофайл.
 */

const TELEGRAM_API = 'https://api.telegram.org';

/** Максимальная длительность, которую берём в расшифровку. */
const MAX_DURATION_SEC = 300;

/** Запас до лимита Bot API в 20 МБ. */
const MAX_FILE_BYTES = 18 * 1024 * 1024;

/**
 * Модель расшифровки — `gemini-3.8-flash`.
 *
 * Стоит с 2026-10-14 по решению Ориона. До этого была `gemini-3.5-flash`, но
 * Google убрал её из списков: адрес работает, а запросы на него сам
 * перенаправляет на `gemini-3.6-flash` (ai.google.dev/gemini-api/docs/deprecations).
 *
 * Лимиты бесплатного тарифа считаются на проект, а не на ключ, и у каждой
 * модели свои — всё, что сидит на одной модели, делит одну квоту. Цифры Google
 * публикует только в AI Studio (aistudio.google.com/rate-limit). Какая квота
 * кончилась и сколько в ней, пишет в лог ошибка 429 — см. quotaInfo.
 *
 * Имя сверяется по списку доступных ключу моделей (команда `/models` в боте):
 * `gemini-3.1-flash`, который был взят самым первым, не существовал вовсе —
 * Gemini отвечал на него 404. Запросить список с машины разработчика нельзя,
 * Gemini блокирует запросы из Беларуси, поэтому список спрашивается у
 * развёрнутой функции.
 *
 * Бесплатный тариф есть — проверено по ai.google.dev/gemini-api/docs/pricing.
 * Запасной вариант с теми же параметрами запроса — `gemini-3.6-flash`. У моделей
 * 2.5 «размышления» задаются другим полем (`thinkingBudget`), под них запрос
 * пришлось бы менять. НЕ брать `gemini-omni-flash-preview` и `gemini-4-argon` —
 * бесплатного тарифа у них нет.
 *
 * ⚠️ На бесплатном тарифе Google использует отправленное для улучшения своих
 * продуктов, и условия прямо допускают, что «human reviewers may read,
 * annotate, and process your API input and output». То есть голосовое может
 * послушать живой человек. Это и есть причина, по которой расшифровка включена
 * только в личном чате (возможность `transcribe` в core/registry.ts), а не в общем.
 *
 * Переопределяется переменной окружения — сменить модель можно правкой
 * `functions/.env` без изменения кода.
 */
/**
 * Одна модель на голосовые и на кружки.
 *
 * Сначала стояла специализированная `gemini-3.5-transcribe`. На голосовых она
 * работает, но кружок — это `video/mp4`, и она отвечает на него
 * `400 Image input modality is not enabled for this model`: принимает только
 * звук, а видео для неё это кадры.
 *
 * Вариант с двумя моделями (аудио — специализированная, видео — универсальная)
 * был написан и отвергнут: развилка по MIME-типу ради выигрыша в качестве,
 * которого никто не измерял.
 *
 * Сравнили на одном и том же голосовом — универсальная оказалась ЛУЧШЕ.
 * Похоже, потому, что специализированная принимает только звук и текстовые
 * инструкции игнорирует, а универсальная читает промпт и выполняет его: знаки
 * препинания и заглавные буквы появились именно после перехода. То есть
 * управлять качеством можно только у универсальной.
 *
 * → Обратно на `gemini-3.5-transcribe` не возвращаться. Она не хуже как
 *   распознаватель, но ею нельзя рулить промптом, и кружки она не берёт вовсе.
 *
 * Вытащить звуковую дорожку из кружка и скормить её аудио-модели нельзя без
 * ffmpeg, а тащить его в Cloud Functions (`ffmpeg-static` — под 70 МБ) ради
 * этого не стоит.
 */
const MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.8-flash';

/**
 * Модель для вопросов боту — `gemini-3.5-flash-lite`.
 *
 * Сначала вопросы шли на 3.8 вместе с расшифровкой, но квота бесплатного
 * тарифа у 3.8 кончилась в первый же вечер, после нескольких десятков
 * запросов. Google цифр не публикует; на его форуме разработчик пишет о 20
 * запросах в день у 3.8 и 500 у Flash-Lite (не подтверждено Google, но с
 * нашим 429 сходится). Вопросов в чате больше, чем голосовых, поэтому им —
 * модель с большей квотой. «Размышления» она принимает на всех уровнях, от
 * `minimal` (её умолчание) до `high` — см. ASK_THINKING.
 */
const ASK_MODEL = process.env.GEMINI_ASK_MODEL || 'gemini-3.5-flash-lite';

/**
 * «Размышления» расшифровки — на самом низком уровне, который 3.8 принимает.
 * По умолчанию `medium`, это лишние секунды на каждое голосовое; `minimal`
 * у 3.8 — ошибка 400.
 *
 * Температуры в запросах нет намеренно. Для моделей Gemini 3 Google советует
 * оставлять её по умолчанию: ниже 1.0 возможны зацикливания, а в расшифровке
 * это повторяющийся текст. Для 3.8 прямо сказано её убрать. Раньше стояла 0.1.
 */
const TRANSCRIBE_THINKING = { thinkingLevel: 'low' };

/**
 * «Размышления» вопросов — `high`, самый высокий уровень. На `low` бот заметно
 * тупил, и Орион попросил, чтобы он думал больше (2026-10-20).
 *
 * Уровень — потолок, а не норма: на «привет» модель думает мало, на задачку —
 * дольше. Платим временем ответа, а не квотой: дневная квота бесплатного
 * тарифа считает запросы, токены размышлений её не тратят. Если ответы станут
 * долгими — `medium`; сколько уходит на каждый ответ, пишет в журнал askGemini.
 *
 * Flash-Lite и запасная 3.6 принимают все четыре уровня, от `minimal` до `high`
 * (таблица «Controlling thinking», ai.google.dev/gemini-api/docs/thinking).
 * Переопределяется переменной `GEMINI_ASK_THINKING`.
 */
const ASK_THINKING = { thinkingLevel: process.env.GEMINI_ASK_THINKING || 'high' };

/**
 * Фильтры безопасности — на минимум. В чате люди ругаются и шутят как хотят:
 * дефолтные пороги режут такое на выходе, и вместо текста приходит пустой
 * ответ с finishReason. Эти четыре категории — единственные настраиваемые;
 * PROHIBITED_CONTENT отключить нельзя ничем.
 */
const SAFETY_SETTINGS = [
    'HARM_CATEGORY_HARASSMENT',
    'HARM_CATEGORY_HATE_SPEECH',
    'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_NONE' }));

/** finishReason, которыми модель сообщает, что отвечать не стала. */
const REFUSAL_REASONS = ['PROHIBITED_CONTENT', 'SAFETY', 'RECITATION', 'BLOCKLIST'];

/**
 * Текст ответа модели.
 *
 * Берём НЕ parts[0], а склеиваем все текстовые части. У моделей 3.x первой
 * частью нередко идёт «размышление» (`thought: true`) с пустым или служебным
 * текстом, а сам ответ лежит дальше. Жёсткое обращение к parts[0].text давало
 * пустую строку на валидном ответе.
 *
 * `gemini-3.5-transcribe` кладёт результат в `audioTranscription`, а не
 * в `text` — это специализированная модель со своей формой ответа.
 * Проверено на живом ответе: parts = [{ audioTranscription: ... }],
 * finishReason = STOP. Универсальные модели отдают `text`, поэтому
 * поддерживаем оба варианта — иначе смена модели через
 * GEMINI_TRANSCRIBE_MODEL молча перестанет работать.
 */
function candidateText(candidate: any): string {
    const parts: any[] = candidate?.content?.parts ?? [];
    return parts
        .filter((p) => p?.thought !== true)
        .map((p): string => {
            if (typeof p?.text === 'string') return p.text;
            if (typeof p?.audioTranscription === 'string') return p.audioTranscription;
            if (typeof p?.audioTranscription?.text === 'string') return p.audioTranscription.text;
            return '';
        })
        .join('')
        .trim();
}

/** Человекочитаемое сообщение из тела ошибки Gemini, если оно там есть. */
function errorMessage(body: string): string {
    try {
        const parsed = JSON.parse(body);
        if (parsed?.error?.message) return String(parsed.error.message);
    } catch { /* тело не JSON — показываем как есть */ }
    return body.slice(0, 200);
}

/**
 * Какая квота кончилась — из подробностей ошибки 429.
 *
 * В `message` у 429 только общая фраза «You exceeded your current quota».
 * Сама квота лежит в `error.details`: `QuotaFailure.violations` с `quotaId`
 * (у дневной в имени `PerDay`, например
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`) и `quotaValue` — размером
 * квоты; рядом `RetryInfo.retryDelay`. При дневной квоте retryDelay бывает в
 * секундах, но через секунды квота не вернётся — решаем по `quotaId`.
 */
function quotaInfo(body: string): { daily: boolean; text: string } | null {
    try {
        const details: any[] = JSON.parse(body)?.error?.details ?? [];
        const violations: any[] = details
            .filter((d) => String(d?.['@type']).endsWith('QuotaFailure'))
            .flatMap((d) => d.violations ?? []);
        if (violations.length === 0) return null;

        const retry = details.find((d) => String(d?.['@type']).endsWith('RetryInfo'))?.retryDelay;
        const text = violations
            .map((v) => `${v.quotaId ?? v.quotaMetric ?? '?'} = ${v.quotaValue ?? '?'}`)
            .join('; ') + (retry ? ` · повтор через ${retry}` : '');
        return { daily: violations.some((v) => /PerDay/i.test(String(v.quotaId ?? ''))), text };
    } catch {
        return null;
    }
}

/** Описание неудачного ответа для лога и для `/text`: код, модель, сообщение, квота. */
function failureDetail(status: number, model: string, body: string): string {
    const quota = status === 429 ? quotaInfo(body) : null;
    return `HTTP ${status} · модель ${model} · ${errorMessage(body)}` + (quota ? ` · квота: ${quota.text}` : '');
}

/**
 * Запасная модель — на случай, когда основная перегружена.
 *
 * В первый же вечер на 3.8 вопрос боту получил 503 «This model is currently
 * experiencing high demand»: модель свежая, и спрос на неё скачет. Ждать, пока
 * спадёт, человеку в чате некогда, а 3.6 принимает тот же запрос. Квоту это
 * не трогает: запасная включается только на 503 и 500, не на 429.
 */
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';

/** Ответы, после которых есть смысл повторить: сервер перегружен или упал, а не отказал. */
const RETRYABLE_STATUSES = [500, 503];

/** Сколько ждать Gemini: одну попытку и всё вместе — с повтором и запасной моделью. */
interface Budget {
    attemptMs: number;
    totalMs: number;
}

/**
 * Вопрос боту обрабатывается, пока Telegram ждёт ответа вебхука, а Cloud Run
 * обрывает такой запрос через 60 секунд. Без ограничения перегруженная 3.8
 * держала запрос дольше минуты: Cloud Run обрывал вебхук, Telegram присылал
 * то же сообщение снова, и бот ответил на один вопрос несколько раз.
 *
 * На `high` (ASK_THINKING) трудный вопрос думается дольше, поэтому попытке
 * дано 30 секунд, а всему вместе — 50. Последние десять секунд до обрыва —
 * на холодный старт экземпляра и отправку ответа.
 */
const ASK_BUDGET: Budget = { attemptMs: 30_000, totalMs: 50_000 };

/**
 * Расшифровка длинного голосового сама идёт десятки секунд, поэтому ждём
 * дольше. Повторной доставки она не вызывает: transcribe.ts первым делом шлёт
 * «печатает…» через ctx, и Telegram получает ответ вебхука сразу (журнал
 * работ, 2026-10-05 (2), «Найдено, не исправлено»).
 */
const TRANSCRIBE_BUDGET: Budget = { attemptMs: 45_000, totalMs: 120_000 };

/**
 * Служебные тексты (сводка админки, functions/src/activity/brief.ts) никто не
 * ждёт в вебхуке: сводку просит страница или расписание, поэтому времени больше.
 */
const SERVICE_BUDGET: Budget = { attemptMs: 45_000, totalMs: 100_000 };

/** Меньше этого на попытку не тратим — всё равно не успеет. */
const MIN_ATTEMPT_MS = 3_000;

/**
 * POST generateContent: модель `primary`, при сбое — повтор через секунду, потом
 * запасная модель тем же порядком, и всё это в пределах `budget`.
 *
 * Сетевой сбой (`fetch failed`) тоже повторяется: ловили его на запросе,
 * который до и после проходил нормально, — разовый обрыв на холодном
 * экземпляре Cloud Functions. Модель, не ответившая за `attemptMs`, второго
 * шанса не получает: повисла — значит, сразу к запасной. 4xx не повторяются:
 * ответ будет тот же, а 429 — это квота, через секунду она не вернётся.
 *
 * Возвращает последний полученный ответ — статус разбирает вызывающий — и
 * модель, которая его дала. Если ответа не было ни одного, бросает последнюю
 * ошибку: сетевую или TimeoutError.
 */
async function generate(
    request: object,
    apiKey: string,
    tag: string,
    budget: Budget,
    primary: string,
): Promise<{ response: any; model: string }> {
    const payload = JSON.stringify(request);
    const startedAt = Date.now();
    const left = () => budget.totalMs - (Date.now() - startedAt);
    let last: { response: any; model: string } | null = null;
    let failure: unknown = null;

    for (const model of [...new Set([primary, FALLBACK_MODEL])]) {
        for (let attempt = 1; attempt <= 2 && left() >= MIN_ATTEMPT_MS; attempt++) {
            try {
                const response = await (globalThis as any).fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                        signal: AbortSignal.timeout(Math.min(budget.attemptMs, left())),
                    }
                );
                last = { response, model };
                if (!RETRYABLE_STATUSES.includes(response.status)) return last;
                console.warn(`[${tag}] ${model}: HTTP ${response.status}, попытка ${attempt}/2`);
            } catch (e) {
                failure = e;
                if ((e as any)?.name === 'TimeoutError') {
                    console.warn(`[${tag}] ${model}: нет ответа за ${budget.attemptMs / 1000} с`);
                    break;
                }
                console.warn(`[${tag}] ${model}: сетевой сбой, попытка ${attempt}/2:`, e);
            }
            if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
        }
    }

    if (last) return last;
    throw failure;
}

/**
 * Диагностика: список моделей, доступных ключу.
 *
 * Нужна потому, что запросить его с машины разработчика нельзя — Gemini
 * отвечает `400 User location is not supported for the API use` на запросы из
 * Беларуси. Из Cloud Functions (europe-west1) тот же запрос проходит, поэтому
 * список приходится спрашивать у развёрнутой функции.
 */
export async function listGeminiModels(): Promise<string[] | { error: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { error: 'GEMINI_API_KEY не задан' };

    try {
        const res = await (globalThis as any).fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`
        );
        const data = await res.json();
        if (!res.ok) {
            return { error: `HTTP ${res.status}: ${data?.error?.message ?? ''}` };
        }
        return (data.models ?? [])
            .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
            .map((m: any) => String(m.name).replace('models/', ''));
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Обычная расшифровка.
 *
 * Требование «только текст» не косметическое: любая вводная фраза модели
 * («Вот расшифровка:») уйдёт прямо в сообщение чата.
 */
export const DEFAULT_PROMPT =
    'Расшифруй речь из этого файла. Верни ТОЛЬКО текст сказанного, ' +
    'без пояснений, без вводных фраз, без markdown. ' +
    'Сохрани язык оригинала. Расставь знаки препинания и заглавные буквы. ' +
    'Если речи нет или она неразборчива — верни пустую строку.';

/**
 * Няшный режим (`/uwufier`).
 *
 * Преобразование отдано модели, а не регулярками на стороне бота. Первая
 * версия была именно набором замен (р→в, вставки «ня», заикание) — выброшена:
 * модель понимает смысл сказанного и переписывает осмысленно, а замена букв
 * просто портит текст, не считаясь с тем, что в нём написано.
 */
export const UWU_PROMPT =
    'Расшифруй речь из этого файла и оформи получившийся текст в интернет-стиле ' +
    '«uwu-speak», известном по фурри-сообществам: уменьшительно-ласкательные ' +
    'суффиксы, вставки «ня» и «uwu», волнистая тильда в конце фраз, каомодзи ' +
    'вроде >w< и :3. Это чисто типографская стилизация текста для чата ' +
    'взрослых людей — не смена смысла, не отыгрыш персонажа и не имитация ' +
    'детской речи. Смысл сказанного сохрани полностью. ' +
    'Сохрани язык оригинала. ' +
    'Верни ТОЛЬКО получившийся текст, без пояснений и без markdown. ' +
    'Если речи нет или она неразборчива — верни пустую строку.';

export type TranscribeFailReason =
    | 'too_long' | 'too_big' | 'no_key' | 'download_failed' | 'api_failed'
    /** Модель ответила успешно, но текста не выдала — речи не было или не разобрала. */
    | 'empty'
    /**
     * Модель отказалась выдавать результат (`finishReason` = PROHIBITED_CONTENT,
     * SAFETY, RECITATION). Это НЕ то же самое, что `empty`: там нечего было
     * расшифровывать, здесь есть что, но выдавать не стали. Разделено, потому
     * что «речь не распознана» на отказе — сообщение, уводящее в неверную сторону.
     */
    | 'refused';

export type TranscribeResult =
    | { ok: true; text: string }
    /**
     * `detail` заполняется для `api_failed` (код и текст ошибки Gemini) и для
     * `empty` (форма ответа: finishReason, состав parts). Показывается в ответе
     * на явную команду `/text`, потому что логи Cloud Functions через
     * `firebase functions:log` доходят не всегда, и без этого диагностика
     * превращается в гадание.
     */
    | { ok: false; reason: TranscribeFailReason; detail?: string };

/**
 * Скачивает файл из Telegram и возвращает его содержимое.
 *
 * Два запроса по устройству Bot API: сначала `getFile` отдаёт временный путь,
 * потом файл забирается с отдельного хоста `api.telegram.org/file/bot<token>/`.
 */
async function downloadTelegramFile(
    fileId: string,
    botToken: string
): Promise<Buffer | null> {
    try {
        const metaRes = await (globalThis as any).fetch(
            `${TELEGRAM_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
        );
        if (!metaRes.ok) {
            console.error(`[TRANSCRIBE] getFile HTTP ${metaRes.status}`);
            return null;
        }

        const meta = await metaRes.json();
        const filePath = meta?.result?.file_path;
        if (!filePath) {
            console.error('[TRANSCRIBE] getFile не вернул file_path');
            return null;
        }

        const fileSize = meta?.result?.file_size;
        if (typeof fileSize === 'number' && fileSize > MAX_FILE_BYTES) {
            console.warn(`[TRANSCRIBE] Файл ${fileSize} байт — больше лимита`);
            return null;
        }

        const fileRes = await (globalThis as any).fetch(
            `${TELEGRAM_API}/file/bot${botToken}/${filePath}`
        );
        if (!fileRes.ok) {
            console.error(`[TRANSCRIBE] Скачивание HTTP ${fileRes.status}`);
            return null;
        }

        return Buffer.from(await fileRes.arrayBuffer());
    } catch (e) {
        console.error('[TRANSCRIBE] Ошибка скачивания файла:', e);
        return null;
    }
}

// ─── Картинки для вопросов боту ──────────────────────────────────────────────────

/** Картинка в виде inline-данных для Gemini: mime и base64. */
export interface InlineImage {
    mimeType: string;
    data: string;
}

/**
 * Скачивает фото или статичный стикер из Telegram и готовит его для Gemini.
 *
 * Та же труба, что у расшифровки: модели 3.x мультимодальные и видят картинку
 * байтами в запросе, ровно как голосовое. Возвращает null, если нет токена,
 * скачать не вышло или файл больше лимита (MAX_FILE_BYTES) — вопрос тогда уйдёт
 * без картинки, текстом.
 */
export async function inlineImageFromTelegram(fileId: string, mimeType: string): Promise<InlineImage | null> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.warn('[ASK] TELEGRAM_BOT_TOKEN не задан — картинка не отправлена');
        return null;
    }
    const buffer = await downloadTelegramFile(fileId, botToken);
    if (!buffer || buffer.length > MAX_FILE_BYTES) return null;
    return { mimeType, data: buffer.toString('base64') };
}

/**
 * Расшифровывает голосовое сообщение или видеокружок.
 *
 * @param fileId   file_id из `ctx.message.voice` или `ctx.message.video_note`
 * @param mimeType `audio/ogg` для голосовых, `video/mp4` для кружков
 * @param duration длительность в секундах (Telegram присылает её в сообщении)
 * @param customPrompt чем заменить обычную инструкцию расшифровки.
 *        Через него сделан `/uwufier`: та же аудиодорожка, другой промпт,
 *        один запрос вместо «расшифровать, потом переписать»
 */
export async function transcribeVoice(
    fileId: string,
    mimeType: string,
    duration: number,
    customPrompt?: string
): Promise<TranscribeResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[TRANSCRIBE] GEMINI_API_KEY не задан');
        return { ok: false, reason: 'no_key' };
    }

    if (duration > MAX_DURATION_SEC) {
        return { ok: false, reason: 'too_long' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.error('[TRANSCRIBE] TELEGRAM_BOT_TOKEN не задан');
        return { ok: false, reason: 'no_key' };
    }

    const buffer = await downloadTelegramFile(fileId, botToken);
    if (!buffer) return { ok: false, reason: 'download_failed' };
    if (buffer.length > MAX_FILE_BYTES) return { ok: false, reason: 'too_big' };

    const prompt = customPrompt || DEFAULT_PROMPT;

    const request = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: buffer.toString('base64'),
                        },
                    },
                ],
            },
        ],
        generationConfig: { thinkingConfig: TRANSCRIBE_THINKING },
        safetySettings: SAFETY_SETTINGS,
    };

    try {
        const { response, model } = await generate(request, apiKey, 'TRANSCRIBE', TRANSCRIBE_BUDGET, MODEL);

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            console.error(`[TRANSCRIBE] Gemini HTTP ${response.status}: ${body.slice(0, 300)}`);

            return { ok: false, reason: 'api_failed', detail: failureDetail(response.status, model, body) };
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const parts: any[] = candidate?.content?.parts ?? [];
        const text = candidateText(candidate);

        if (!text) {
            // Диагностика: без неё «пусто» неотличимо от «модель отказалась».
            // finishReason покажет SAFETY / MAX_TOKENS / RECITATION, а форма
            // ответа — если структура окажется другой, чем ожидалось.
            const shape = JSON.stringify({
                finishReason: candidate?.finishReason,
                partKeys: parts.map((p) => Object.keys(p ?? {})),
                promptFeedback: data?.promptFeedback,
            });
            console.warn(`[TRANSCRIBE] Пустой ответ: ${shape}`);

            const reason: TranscribeFailReason =
                REFUSAL_REASONS.includes(String(candidate?.finishReason)) ? 'refused' : 'empty';

            return { ok: false, reason, detail: shape.slice(0, 300) };
        }

        return { ok: true, text };
    } catch (e) {
        // `TypeError: fetch failed` от undici — обёртка без полезной информации.
        // Настоящая причина (ECONNRESET, UND_ERR_HEADERS_TIMEOUT, ошибка TLS,
        // обрыв тела ответа) лежит в `cause`, иногда на два уровня вглубь.
        // Без её распаковки диагностика упирается в «сеть сломалась».
        const chain: string[] = [];
        let cur: any = e;
        for (let depth = 0; cur && depth < 3; depth++) {
            const name = cur?.name ?? '';
            const code = cur?.code ? ` (${cur.code})` : '';
            const msg = cur?.message ?? String(cur);
            chain.push(`${name}${code}: ${msg}`);
            cur = cur.cause;
        }

        console.error('[TRANSCRIBE] Ошибка запроса к Gemini:', chain.join(' ← '), e);

        return {
            ok: false,
            reason: 'api_failed',
            detail: `сеть · модель ${MODEL} · ${chain.join(' ← ')}`.slice(0, 350),
        };
    }
}

// ─── Вопросы боту ───────────────────────────────────────────────────────────────

export type AskResult =
    | { ok: true; text: string }
    /**
     * `limited` — лечится минутами: 429 по минутной квоте, 503 (модель перегружена
     * и после повтора, и на запасной) или ни одна модель не ответила вовремя.
     * `exhausted` — кончилась дневная квота модели, до сброса спрашивать бесполезно.
     * `refused` — модель отказалась отвечать.
     */
    | { ok: false; reason: 'no_key' | 'limited' | 'exhausted' | 'refused' | 'empty' | 'api_failed'; detail?: string };

export type JsonResult =
    | { ok: true; data: any; model: string }
    | { ok: false; reason: 'no_key' | 'http' | 'empty' | 'bad_json' | 'timeout' | 'api_failed'; detail?: string };

/**
 * Ответ строго в виде JSON по схеме — для служебных текстов (сводка админки,
 * functions/src/activity/brief.ts). Модель и «размышления» — как у вопросов
 * боту (ASK_MODEL, ASK_THINKING), время — SERVICE_BUDGET.
 *
 * Схема — подмножество OpenAPI, которое принимает Gemini (`responseSchema`):
 * так модель не завернёт ответ в ```json и не добавит пояснений.
 */
export async function generateJson(system: string, user: string, schema: object, tag: string): Promise<JsonResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn(`[${tag}] GEMINI_API_KEY не задан`);
        return { ok: false, reason: 'no_key' };
    }

    const startedAt = Date.now();
    try {
        const { response, model } = await generate({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
                thinkingConfig: ASK_THINKING,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
                responseSchema: schema,
            },
            safetySettings: SAFETY_SETTINGS,
        }, apiKey, tag, SERVICE_BUDGET, ASK_MODEL);

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const detail = failureDetail(response.status, model, body);
            console.error(`[${tag}] ${detail}`);
            return { ok: false, reason: 'http', detail };
        }

        const data = await response.json();
        const text = candidateText(data?.candidates?.[0]);
        const usage = data?.usageMetadata;
        console.log(`[${tag}] ${model}: ${((Date.now() - startedAt) / 1000).toFixed(1)} с · размышления ` +
            `${usage?.thoughtsTokenCount ?? 0} · ответ ${usage?.candidatesTokenCount ?? '?'} ток.`);
        if (!text) return { ok: false, reason: 'empty', detail: String(data?.candidates?.[0]?.finishReason ?? '') };
        try {
            return { ok: true, data: JSON.parse(text), model };
        } catch {
            return { ok: false, reason: 'bad_json', detail: text.slice(0, 200) };
        }
    } catch (e) {
        const timedOut = (e as any)?.name === 'TimeoutError';
        console.error(`[${tag}] ${timedOut ? 'Gemini не ответил вовремя' : 'Ошибка запроса к Gemini'}:`, e);
        return { ok: false, reason: timedOut ? 'timeout' : 'api_failed', detail: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Ответ на текстовый запрос; характер бота задаёт `persona` (системная
 * инструкция).
 *
 * `maxOutputTokens` считает и «размышления». На `high` их может набраться
 * несколько тысяч, и прежних 2048 (стояли при `low`) не хватило бы: упрётся —
 * придёт finishReason MAX_TOKENS и пустой ответ. Длину самого ответа держит
 * характер («одно-три предложения»), а не этот потолок.
 */
export async function askGemini(persona: string, request: string, images: InlineImage[] = []): Promise<AskResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[ASK] GEMINI_API_KEY не задан');
        return { ok: false, reason: 'no_key' };
    }

    // Картинки идут частями того же сообщения, после текста вопроса.
    const parts: any[] = [{ text: request }];
    for (const img of images) {
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
    }

    const startedAt = Date.now();
    try {
        const { response, model } = await generate({
            systemInstruction: { parts: [{ text: persona }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { thinkingConfig: ASK_THINKING, maxOutputTokens: 8192 },
            safetySettings: SAFETY_SETTINGS,
        }, apiKey, 'ASK', ASK_BUDGET, ASK_MODEL);

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const detail = failureDetail(response.status, model, body);
            console.error(`[ASK] ${detail}`);
            if (response.status === 429) {
                return { ok: false, reason: quotaInfo(body)?.daily ? 'exhausted' : 'limited', detail };
            }
            return { ok: false, reason: response.status === 503 ? 'limited' : 'api_failed', detail };
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const text = candidateText(candidate);
        // Цена размышлений: без этой строки успешный ответ в журнале не виден
        // вовсе, и подбирать ASK_THINKING было бы не по чему.
        const usage = data?.usageMetadata;
        const cost = `${((Date.now() - startedAt) / 1000).toFixed(1)} с · размышления ` +
            `${usage?.thoughtsTokenCount ?? 0} · ответ ${usage?.candidatesTokenCount ?? '?'} ток.`;
        if (text) {
            console.log(`[ASK] ${model}: ${cost}`);
            return { ok: true, text };
        }

        // Без кандидатов — заблокирован сам запрос, причина тогда в promptFeedback.
        const why = String(candidate?.finishReason ?? data?.promptFeedback?.blockReason ?? '');
        console.warn(`[ASK] Пустой ответ: ${why} · ${model}: ${cost}`);
        return { ok: false, reason: REFUSAL_REASONS.includes(why) ? 'refused' : 'empty', detail: why };
    } catch (e) {
        const timedOut = (e as any)?.name === 'TimeoutError';
        console.error(`[ASK] ${timedOut ? 'Gemini не ответил вовремя' : 'Ошибка запроса к Gemini'}:`, e);
        return {
            ok: false,
            reason: timedOut ? 'limited' : 'api_failed',
            detail: e instanceof Error ? e.message : String(e),
        };
    }
}

// ─── Вопрос с возможным действием ────────────────────────────────────────────────

/**
 * Ответ модели вместе с решением о действии над участником.
 *
 * `action` — что модель решила сделать; `seconds` для мута (0 — навсегда, null —
 * не указала). КОГО трогать, модель НЕ решает: цель и право проверяет вызывающий
 * (ask.ts) по Telegram id, иначе через текст можно было бы выпросить мут чужими
 * руками. Формы ответа и ошибок — как у askGemini, чтобы переиспользовать разбор.
 */
export type ActionResult =
    | { ok: true; reply: string; action: 'none' | 'mute' | 'unmute' | 'ban' | 'kick'; seconds: number | null }
    | { ok: false; reason: 'no_key' | 'limited' | 'exhausted' | 'refused' | 'empty' | 'api_failed'; detail?: string };

/** Схема ответа: текст реплики плюс действие. Цели в ней нет намеренно. */
const ACTION_SCHEMA = {
    type: 'object',
    properties: {
        reply: {type: 'string'},
        action: {type: 'string', enum: ['none', 'mute', 'unmute', 'ban', 'kick']},
        seconds: {type: 'integer'},
    },
    required: ['reply', 'action'],
};

/**
 * Как askGemini, но ответ строго по ACTION_SCHEMA: кроме текста модель возвращает
 * действие. Модель, время и картинки — те же, что у обычных вопросов.
 */
export async function askGeminiAction(persona: string, request: string, images: InlineImage[] = []): Promise<ActionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[ASK] GEMINI_API_KEY не задан');
        return {ok: false, reason: 'no_key'};
    }

    const parts: any[] = [{text: request}];
    for (const img of images) {
        parts.push({inline_data: {mime_type: img.mimeType, data: img.data}});
    }

    const startedAt = Date.now();
    try {
        const {response, model} = await generate({
            systemInstruction: {parts: [{text: persona}]},
            contents: [{role: 'user', parts}],
            generationConfig: {
                thinkingConfig: ASK_THINKING,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
                responseSchema: ACTION_SCHEMA,
            },
            safetySettings: SAFETY_SETTINGS,
        }, apiKey, 'ASK', ASK_BUDGET, ASK_MODEL);

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const detail = failureDetail(response.status, model, body);
            console.error(`[ASK] ${detail}`);
            if (response.status === 429) {
                return {ok: false, reason: quotaInfo(body)?.daily ? 'exhausted' : 'limited', detail};
            }
            return {ok: false, reason: response.status === 503 ? 'limited' : 'api_failed', detail};
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const text = candidateText(candidate);
        const usage = data?.usageMetadata;
        const cost = `${((Date.now() - startedAt) / 1000).toFixed(1)} с · размышления ` +
            `${usage?.thoughtsTokenCount ?? 0} · ответ ${usage?.candidatesTokenCount ?? '?'} ток.`;

        if (!text) {
            const why = String(candidate?.finishReason ?? data?.promptFeedback?.blockReason ?? '');
            console.warn(`[ASK] Пустой ответ: ${why} · ${model}: ${cost}`);
            return {ok: false, reason: REFUSAL_REASONS.includes(why) ? 'refused' : 'empty', detail: why};
        }

        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch {
            console.warn(`[ASK] Ответ не JSON: ${text.slice(0, 200)}`);
            return {ok: false, reason: 'empty', detail: 'bad_json'};
        }

        const reply = typeof parsed?.reply === 'string' ? parsed.reply : '';
        const action = ['none', 'mute', 'unmute', 'ban', 'kick'].includes(parsed?.action) ? parsed.action : 'none';
        const seconds = Number.isFinite(parsed?.seconds) ? Math.floor(parsed.seconds) : null;
        if (!reply) return {ok: false, reason: 'empty', detail: 'no reply'};

        console.log(`[ASK] ${model}: ${cost} · action=${action}${seconds != null ? ` ${seconds}s` : ''}`);
        return {ok: true, reply, action, seconds};
    } catch (e) {
        const timedOut = (e as any)?.name === 'TimeoutError';
        console.error(`[ASK] ${timedOut ? 'Gemini не ответил вовремя' : 'Ошибка запроса к Gemini'}:`, e);
        return {ok: false, reason: timedOut ? 'limited' : 'api_failed', detail: e instanceof Error ? e.message : String(e)};
    }
}
