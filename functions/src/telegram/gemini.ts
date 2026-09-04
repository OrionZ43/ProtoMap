/**
 * Расшифровка голосовых сообщений и видеокружков через Gemini.
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
 * Модель для расшифровки — специализированная, не универсальный flash.
 *
 * Имя проверено по списку доступных ключу моделей (команда `/models` в боте):
 * `gemini-3.1-flash`, который я взял сначала, не существует вовсе — Gemini
 * отвечал на него 404. Запросить список с машины разработчика нельзя, Gemini
 * блокирует запросы из Беларуси, поэтому список спрашивается у развёрнутой
 * функции.
 *
 * Бесплатный тариф у неё есть — проверено по ai.google.dev/gemini-api/docs/pricing.
 * Запасные варианты, тоже с бесплатным тарифом: `gemini-3.5-flash`,
 * `gemini-2.5-flash`. НЕ брать `gemini-omni-flash-preview` — у него
 * бесплатного тарифа нет вовсе.
 *
 * ⚠️ На бесплатном тарифе Google использует отправленное для улучшения своих
 * продуктов, и условия прямо допускают, что «human reviewers may read,
 * annotate, and process your API input and output». То есть голосовое может
 * послушать живой человек. Это и есть причина, по которой расшифровка включена
 * только в личном чате (TRANSCRIBE_CHATS в telegramBot.ts), а не в общем.
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
const MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-flash';

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

    /**
     * Один повтор при сетевом сбое.
     *
     * Ловили `fetch failed` на запросе, который до этого и после этого проходил
     * нормально — то есть разовый обрыв соединения, а не отказ API (у отказа
     * приходит осмысленный HTTP-код). На холодном инстансе Cloud Functions такое
     * случается. Повторяем только сетевую ошибку: если Gemini ответил 4xx,
     * повторять бессмысленно, ответ будет тот же.
     */
    const postWithRetry = async (): Promise<any> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await doPost();
            } catch (e) {
                lastError = e;
                console.warn(`[TRANSCRIBE] Сетевой сбой, попытка ${attempt}/2:`, e);
                if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
            }
        }
        throw lastError;
    };

    const doPost = () =>
        (globalThis as any).fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
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
                    generationConfig: { temperature: 0.1 },
                    // Расшифровываем живую речь из чата, где люди ругаются и
                    // шутят как хотят. Дефолтные пороги режут такое на выходе,
                    // и вместо текста приходит пустой ответ с finishReason.
                    // Эти четыре категории — единственные настраиваемые;
                    // PROHIBITED_CONTENT отключить нельзя ничем.
                    safetySettings: [
                        'HARM_CATEGORY_HARASSMENT',
                        'HARM_CATEGORY_HATE_SPEECH',
                        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        'HARM_CATEGORY_DANGEROUS_CONTENT',
                    ].map((category) => ({ category, threshold: 'BLOCK_NONE' })),
                }),
            }
        );

    try {
        const response = await postWithRetry();

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            console.error(`[TRANSCRIBE] Gemini HTTP ${response.status}: ${body.slice(0, 300)}`);

            // Вытаскиваем человекочитаемое сообщение, если оно есть в JSON
            let msg = body.slice(0, 200);
            try {
                const parsed = JSON.parse(body);
                if (parsed?.error?.message) msg = parsed.error.message;
            } catch { /* тело не JSON — показываем как есть */ }

            return {
                ok: false,
                reason: 'api_failed',
                detail: `HTTP ${response.status} · модель ${MODEL} · ${msg}`,
            };
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0];

        // Берём НЕ parts[0], а склеиваем все текстовые части.
        // У моделей 3.x первой частью нередко идёт «размышление» (`thought: true`)
        // с пустым или служебным текстом, а сама расшифровка лежит дальше.
        // Жёсткое обращение к parts[0].text давало пустую строку на валидном ответе.
        const parts: any[] = candidate?.content?.parts ?? [];

        // `gemini-3.5-transcribe` кладёт результат в `audioTranscription`, а не
        // в `text` — это специализированная модель со своей формой ответа.
        // Проверено на живом ответе: parts = [{ audioTranscription: ... }],
        // finishReason = STOP. Универсальные модели отдают `text`, поэтому
        // поддерживаем оба варианта — иначе смена модели через
        // GEMINI_TRANSCRIBE_MODEL молча перестанет работать.
        const partText = (p: any): string => {
            if (typeof p?.text === 'string') return p.text;
            if (typeof p?.audioTranscription === 'string') return p.audioTranscription;
            if (typeof p?.audioTranscription?.text === 'string') return p.audioTranscription.text;
            return '';
        };

        const text = parts
            .filter((p) => p?.thought !== true)
            .map(partText)
            .join('')
            .trim();

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

            const refusals = ['PROHIBITED_CONTENT', 'SAFETY', 'RECITATION', 'BLOCKLIST'];
            const reason: TranscribeFailReason =
                refusals.includes(String(candidate?.finishReason)) ? 'refused' : 'empty';

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
