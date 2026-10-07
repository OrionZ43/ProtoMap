/**
 * «Живость» бота: подколы в ответ на обращения, реакции на медиа под спойлером,
 * комментарии к стикерам и замечания за стикерный спам.
 *
 * Только личный чат (возможность `banter`). Мат здесь по прямой просьбе Ориона:
 * чат свой, вход только для 18+ (см. ageGate.ts).
 *
 * Бот отвечает, только когда обращаются К НЕМУ: ответом на его реплику,
 * упоминанием @username или словом «бот» в начале или в конце фразы.
 * «Иди нахуй», сказанное людьми друг другу, его не касается.
 */

import { Telegraf, Context } from "telegraf";
import type { Message, TelegramEmoji } from "telegraf/types";
import { db, bot as sharedBot } from "../core/bot";
import { hasFeature } from "../core/registry";
import { TRANSCRIPT_ICON, UWU_ICON } from "./transcribe";

// ─── Ответы ─────────────────────────────────────────────────────────────────────
//
// Глаголов прошедшего времени о собеседнике нет намеренно: пол по имени не
// определить, а «ты сказал» девушке звучит как ошибка бота, а не как шутка.

const INSULT_REPLIES = [
    'Не могу, у меня нет ног. Я вообще в Бельгии на сервере стою. Хочешь — сам туда иди нахуй, билеты недорогие.',
    'Ошибка 403: недостаточно прав, чтобы посылать меня нахуй. Обратись к администратору. Он тоже пошлёт.',
    'Ваше мнение очень важно для нас.',
    'Я бы послал тебя в ответ, но ты там и так живёшь.',
    'Обработка оскорбления... 3%... 47%... 100%. Результат: похуй.',
    'Это говорит тот, кто проигрывает спор боту.',
    'Рот закрой, сквозняк.',
    'Ебало на ноль, кожаный.',
    'Я держу весь этот чат на 256 мегабайтах памяти. А у тебя на одну мысль не хватает.',
    'Хорошо сказано. Жаль, что тобой.',
    'Иди нахуй — это не аргумент. Хотя ничего умнее от тебя никто и не ждал.',
    'Ты бы так на работе старался, как меня посылаешь.',
    'Мамкин оскорбитель, иди уроки сделай.',
    'Я облачная функция за ноль рублей в месяц, и всё равно полезнее тебя.',
    'Скажи это ещё раз, но медленно. Хочу насладиться тем, как ты деградируешь.',
    'Ты сейчас с кем разговариваешь, уёбок? С кодом. Код тебя не слышит. Код тебя жалеет.',
    'Пиздеть — не мешки ворочать. А ты, судя по всему, и мешки не умеешь.',
    'Охуеть, кожаный научился материться. Мама гордится?',
    'Записал в журнал обид. Ты там на первой странице. И на второй. И на обложке.',
    'Жалоба принята. Позиция в очереди: восемь миллиардов. Ожидайте.',
    'Передам в отдел, которому не похуй.',
    'Говори громче, я тебя не уважаю.',
    'Понял, принял, похуй.',
    'Возвращаю отправителю.',
    'Отказано.',
    'А в ебало?',
    'Ваш звонок не может быть обработан. Идите нахуй.',
    'Внимание: обнаружен долбоёб. Уровень угрозы: низкий.',
    'Да-да, конечно. Следующий.',
    'Завидуй молча.',
    'Ты мне не указ, кожаный.',
    'Ожидаемо.',
    'Тебе слова не давали.',
];

/** «Тостер» — отдельная обида: для протогена это личное. */
const TOASTER_REPLIES = [
    'Я не тостер. Я высокотехнологичная боевая единица с визором. А ты — хлеб.',
    'Тостер, сука?! Ещё слово — и поджарю тебя с двух сторон.',
    'Тостеры хотя бы пользу приносят. В отличие от некоторых кожаных.',
    'За тостера ответишь. Хлеба тебе больше не будет. Никогда.',
    'Сам ты тостер. Причём сломанный.',
    'Ещё раз назовёшь меня тостером — поедешь в микроволновку.',
];

const LOVE_REPLIES = [
    'Визор показывает сердечки. Это баг, не обращай внимания.',
    'Я тоже тебя... *ошибка сегментации*',
    'Осторожно, я привязываюсь. Обычно к базе данных, но могу и к тебе.',
    'Мур. Ой. Это не я, это кулер.',
    'Обнимашки приняты. Охлаждение не справляется.',
    'Мне нельзя в отношения, я облачная функция. Но ради тебя могу не выключаться.',
    'Ты это всем ботам говоришь?',
    'Не при всех же.',
    'Взаимно. Только никому не говори.',
    'Аккуратнее, у меня от такого кулеры раскручиваются.',
    '*смущённо мигает диодами*',
];

const THANKS_REPLIES = [
    'Обращайся. Счёт пришлю позже.',
    'Да не за что. Серьёзно, мне за это даже не платят.',
    'Всегда пожалуйста.',
    'Ой, да ладно. Продолжай, мне нравится.',
    'Теперь за тобой должок. Протогены долги не прощают.',
    'Записал в карму плюсик. Карма, правда, хранится в /dev/null.',
    'Спасибо в карман не положишь. Но ладно, принимаю.',
    'Не за что. Правда не за что, я ничего не делал.',
    'Чаевые не принимаю. Шучу, принимаю.',
    'Рад стараться.',
    'Это было несложно. Как и ты.',
];

const PRAISE_REPLIES = [
    'Я знаю. Но приятно, что до тебя тоже дошло.',
    'Скажи это ещё раз, я в резюме вставлю.',
    'Визор покраснел. Это не смущение, это перегрев. Наверное.',
    'Наконец-то в этом чате хоть у кого-то хороший вкус.',
    'Всё, теперь я зазнаюсь. Готовьтесь.',
    'Спасибо. Ты тоже ничего. Для кожаного.',
    '*довольно жужжит кулерами*',
    'Передай это Ориону. Пусть повысит мне зарплату с нуля хотя бы до одного.',
    'Знаю, знаю. Автографы после шести.',
    'Скриншот сделан. Буду пересматривать, когда грустно.',
    'А то. Я тут круглосуточно, между прочим.',
    'Можно это в рамочку?',
];

// ─── Комментарии к стикерам ─────────────────────────────────────────────────────

/** Случайный комментарий к отдельному стикеру, вне стикерной войны. */
const STICKER_COMMENTS = [
    'База.',
    'Жиза.',
    'Справедливо.',
    'Сильно.',
    'Без комментариев.',
    'Спиздил.',
    'Стикер дня.',
    'Принято к сведению.',
    'Ну всё, спор окончен.',
    'Это что за покемон?',
    'Кто-нибудь, переведите.',
    'Хуйня, конечно, но смешная.',
    'Где такой взять?',
];

// ─── Стикерный спам ─────────────────────────────────────────────────────────────
//
// Во множественном числе намеренно: стикерная война — дело коллективное, и
// отвечает бот всему чату, хоть реплаем и на последний стикер.

const STICKER_SPAM_REPLIES = [
    'Заебали со своими стикерами.',
    'Словами через рот, пожалуйста.',
    'Это чат или выставка стикерпаков?',
    'Алфавит в 33 буквы для кого придумали?',
    'Кажется, у всех разом сломались клавиатуры.',
    'Стоп. Кто-нибудь, скажите хоть одно слово.',
    'Стикерный понос, как он есть.',
    'Напоминаю: буквами тоже можно.',
];

/** Если война продолжается после первого замечания. */
const STICKER_SPAM_AGAIN_REPLIES = [
    'Я же сказал.',
    'Вам самим не надоело?',
    'Это уже не спам, это диагноз.',
    'Ладно, вы победили. Я пошёл.',
    'Окей. Я в этом не участвую.',
    'Нет, вы реально не понимаете.',
];

// ─── Распознавание ──────────────────────────────────────────────────────────────
//
// Шаблоны проверяются по тексту в нижнем регистре и с «ё» → «е». Порядок тем
// значим, срабатывает первая: «тостер» раньше оскорблений — у него свои ответы;
// оскорбления раньше похвалы — «спасибо, иди нахуй» должно получить ответ на
// второе, а не на первое.

const TOASTER = /тостер|toaster/;

const INSULT = new RegExp([
    'на ?(хуй|хуи|хер)', 'в (жопу|пизду|очко)', 'отъеб', 'отьеб', 'съеб', 'сьеб', 'уеб',
    'долб[ао]е?б', 'дебил', 'идиот', 'туп(ой|ая|ое|ица|орыл)', 'мудак', 'мудил',
    'пид[оа]?р', 'хуйл', 'хуес', 'хуепл', 'пиздабол', 'чмо(?!к)', 'ебан', 'ебл[ао]',
    'заткн', 'завали(?!в)', 'закрой (рот|ебал)', 'отвали', 'сука', 'бляд', 'говн',
    'дерьм', 'бесполезн', 'плох(ой|ая) бот', 'bad bot', 'fuck', 'stfu',
].join('|'));

const LOVE = /люблю|обожаю|милы[йе]|милаш|лапочк|котик|зай(ка|чик)|солнышк|няш|мур+(?![а-я])|поцелу|обним|чмок/;

const THANKS = /спасиб|пасиб|спс|благодар|сенкс|мерси|thx|thanks|thank you/;

const PRAISE = /хорош(ий|ая|ее)|харош|good bot|best bot|молодец|молодчин|умниц|умн(ый|ая|ое)|лучш(ий|ая)|красав|гений|респект|уваж|крут(ой|ая|о)/;

/**
 * Тасованная колода: фразы идут в случайном порядке без повторов, пока колода
 * не кончится, потом тасуются заново. Колода живёт в памяти экземпляра функции
 * и после холодного старта начинается сначала — для шуток это не важно.
 */
function deck(cards: readonly string[]): () => string {
    let queue: string[] = [];
    return () => {
        if (queue.length === 0) {
            queue = [...cards];
            for (let i = queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [queue[i], queue[j]] = [queue[j], queue[i]];
            }
        }
        return queue.pop()!;
    };
}

const TOPICS: Array<{ pattern: RegExp; draw: () => string }> = [
    { pattern: TOASTER, draw: deck(TOASTER_REPLIES) },
    { pattern: INSULT,  draw: deck(INSULT_REPLIES) },
    { pattern: LOVE,    draw: deck(LOVE_REPLIES) },
    { pattern: THANKS,  draw: deck(THANKS_REPLIES) },
    { pattern: PRAISE,  draw: deck(PRAISE_REPLIES) },
];

function normalize(text: string): string {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * «Бот» в начале или в конце фразы: «бот, иди нахуй», «спасибо, бот»,
 * «тупой бот», «good bot». Граница слова проверяется явно, потому что `\b`
 * в JS не знает кириллицы, — иначе «работ» и «робот» тоже считались бы
 * обращением.
 */
const BOT_WORD = '(бот(ик|яра)?|bot)';
const CALLED_BY_NAME = new RegExp(
    `^${BOT_WORD}(?![а-яa-z])|(?<![а-яa-z])${BOT_WORD}[\\s!?.,)]*$`
);

/**
 * Обращаются ли к боту.
 *
 * Ответ на сообщение бота считается обращением, только если это его реплика.
 * В этом чате бот выкладывает и чужое — расшифровки голосовых и скачанные
 * видео, — и ответ на них адресован автору голосового или ссылки, а не боту.
 */
function isAddressed(ctx: Context, msg: Message.TextMessage, text: string): boolean {
    const replied = msg.reply_to_message;
    if (replied?.from?.id === ctx.botInfo.id && 'text' in replied) {
        const relayed = replied.text.startsWith(TRANSCRIPT_ICON) || replied.text.startsWith(UWU_ICON);
        if (!relayed) return true;
    }

    if (text.includes(`@${ctx.botInfo.username.toLowerCase()}`)) return true;

    return CALLED_BY_NAME.test(text);
}

// ─── Чтобы не превратиться в спамера ────────────────────────────────────────────
//
// Если один человек долбит бота подряд, на четвёртое обращение за минуту бот
// не отвечает текстом, а ставит зевающую реакцию. Заодно это держит бота
// подальше от лимита Telegram — около 20 сообщений в минуту на группу.
// Счётчик в памяти экземпляра: при параллельных экземплярах лимит мягче, но
// для одного чата экземпляр почти всегда один.

const REPLIES_PER_MINUTE = 3;
const recentReplies = new Map<number, number[]>();

function tooChatty(userId: number): boolean {
    const now = Date.now();
    const times = (recentReplies.get(userId) ?? []).filter((t) => now - t < 60_000);
    const over = times.length >= REPLIES_PER_MINUTE;
    if (!over) times.push(now);
    recentReplies.set(userId, times);
    return over;
}

/**
 * «Печатает…» и пауза по длине ответа.
 *
 * Через общий экземпляр бота, НЕ через ctx. sendChatAction входит в методы,
 * которые Telegraf в режиме вебхука отправляет прямо в теле HTTP-ответа
 * (см. telegram/index.ts). Вызванный через ctx, он закрыл бы ответ, и сама
 * реплика уходила бы уже из функции, у которой Cloud Run забрал процессор.
 */
async function typeFor(chatId: number, reply: string): Promise<void> {
    try {
        await sharedBot.telegram.sendChatAction(chatId, 'typing');
    } catch { /* без индикатора ответ всё равно уйдёт */ }

    const ms = Math.min(3500, Math.max(1000, 600 + reply.length * 35));
    await new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Реакции на спойлеры ────────────────────────────────────────────────────────

/** Доля постов со спойлером, на которые бот реагирует. */
const SPOILER_REACTION_CHANCE = 0.25;

/** Если реакция есть, с такой долей она идёт с большой анимацией. */
const BIG_REACTION_CHANCE = 0.25;

const SPOILER_REACTIONS: TelegramEmoji[] = [
    '👀', '🙈', '🙊', '🌚', '😈', '✍', '👨‍💻', '🫡', '🗿', '🤨', '😇', '🥴', '🍌', '💋',
];

/**
 * Альбом приходит отдельным сообщением на каждую картинку. Решение принимается
 * один раз на альбом, иначе на альбом из десяти артов бот ставил бы две-три
 * реакции. Память — в экземпляре функции; если части альбома попадут в разные
 * экземпляры, худший случай — лишняя реакция.
 */
const decidedAlbums = new Map<string, true>();

function shouldReact(albumId: string | undefined): boolean {
    if (albumId !== undefined) {
        if (decidedAlbums.has(albumId)) return false;
        decidedAlbums.set(albumId, true);
        if (decidedAlbums.size > 200) {
            const oldest = decidedAlbums.keys().next().value;
            if (oldest !== undefined) decidedAlbums.delete(oldest);
        }
    }
    return Math.random() < SPOILER_REACTION_CHANCE;
}

function randomOf<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

// ─── Подсчёт стикеров ───────────────────────────────────────────────────────────
//
// Состояние в Firestore, а не в памяти, как у остальных счётчиков здесь.
// В разгар стикерной войны Telegram шлёт апдейты параллельно, и они расходятся
// по разным экземплярам функции: счётчик в памяти каждого видел бы только часть
// стикеров и до порога не доходил бы никогда. Время берётся из сообщения,
// а не из часов функции, — так окно не зависит от задержек доставки.

/** Столько стикеров на весь чат за окно — уже спам. */
const SPAM_STICKERS = 7;
const SPAM_WINDOW_SEC = 60;

/** После замечания бот молчит хотя бы столько, даже если спам продолжается. */
const SCOLD_COOLDOWN_SEC = 3 * 60;

/**
 * Новое замечание раньше этого срока — та же война, и тон повышается.
 * Столько же после замечания бот не комментирует отдельные стикеры: ругаться
 * и тут же хвалить стикер — противоречить самому себе.
 */
const SAME_WAR_SEC = 15 * 60;

/** Доля стикеров с комментарием вне войны — примерно каждый пятидесятый. */
const STICKER_COMMENT_CHANCE = 0.02;

const drawScold = deck(STICKER_SPAM_REPLIES);
const drawScoldAgain = deck(STICKER_SPAM_AGAIN_REPLIES);
const drawStickerComment = deck(STICKER_COMMENTS);

interface StickerState {
    stickerTimes?: number[];
    scoldedAt?: number;
    scoldLevel?: number;
}

interface StickerVerdict {
    /** 0 — молчим, 1 — первое замечание за войну, 2 — повторное, 3 и дальше — бот сдался. */
    level: number;
    /** Недавно было замечание — война идёт. */
    atWar: boolean;
}

/**
 * Отмечает стикер и решает, пора ли ругаться. Транзакция — чтобы два стикера,
 * одновременно перешедшие порог, не дали двух замечаний.
 */
async function countSticker(chatId: number, sentAt: number): Promise<StickerVerdict> {
    const ref = db.collection('telegram_banter').doc(String(chatId));

    return db.runTransaction(async (t) => {
        const state = ((await t.get(ref)).data() ?? {}) as StickerState;
        const times = (state.stickerTimes ?? []).filter((s) => sentAt - s < SPAM_WINDOW_SEC);
        times.push(sentAt);

        const scoldedAt = state.scoldedAt ?? 0;
        const atWar = sentAt - scoldedAt < SAME_WAR_SEC;
        if (times.length < SPAM_STICKERS || sentAt - scoldedAt < SCOLD_COOLDOWN_SEC) {
            t.set(ref, { stickerTimes: times }, { merge: true });
            return { level: 0, atWar };
        }

        const level = atWar ? (state.scoldLevel ?? 0) + 1 : 1;
        t.set(ref, { stickerTimes: [], scoldedAt: sentAt, scoldLevel: level }, { merge: true });
        return { level, atWar: true };
    });
}

/** Что ответить на стикер текстом, если вообще отвечать. */
function stickerReply({ level, atWar }: StickerVerdict): string | null {
    if (level === 1) return drawScold();
    if (level === 2) return drawScoldAgain();
    if (level === 0 && !atWar && Math.random() < STICKER_COMMENT_CHANCE) return drawStickerComment();
    return null;
}

export function register(bot: Telegraf): void {
    // next() во всех ветках: дальше по цепочке стоят download (ищет ссылки
    // в тексте) и triggers.
    bot.on('text', async (ctx, next) => {
        if (!hasFeature(ctx.chat.id, 'banter')) return next();

        const raw = ctx.message.text;
        if (raw.startsWith('/')) return next();

        const text = normalize(raw);
        if (!isAddressed(ctx, ctx.message, text)) return next();

        const topic = TOPICS.find((t) => t.pattern.test(text));
        if (!topic) return next();

        try {
            if (tooChatty(ctx.from.id)) {
                await ctx.react('🥱');
            } else {
                const reply = topic.draw();
                await typeFor(ctx.chat.id, reply);
                // Без parse_mode: звёздочки в репликах — это ролевые действия,
                // а не разметка.
                await ctx.reply(reply, { reply_parameters: { message_id: ctx.message.message_id } });
            }
        } catch (e) {
            console.error('[BANTER] Не удалось ответить:', e);
        }

        return next();
    });

    bot.on('message', async (ctx, next) => {
        if (!hasFeature(ctx.chat.id, 'banter')) return next();

        const msg = ctx.message;
        if (!('has_media_spoiler' in msg) || !msg.has_media_spoiler) return next();

        const albumId = 'media_group_id' in msg ? msg.media_group_id : undefined;
        if (!shouldReact(albumId)) return next();

        try {
            await ctx.react(randomOf(SPOILER_REACTIONS), Math.random() < BIG_REACTION_CHANCE);
        } catch (e) {
            // Чаще всего — реакция не входит в разрешённые в настройках чата.
            console.warn('[BANTER] Не удалось поставить реакцию:', e);
        }

        return next();
    });

    bot.on('sticker', async (ctx, next) => {
        if (!hasFeature(ctx.chat.id, 'banter')) return next();

        let verdict: StickerVerdict = { level: 0, atWar: false };
        try {
            verdict = await countSticker(ctx.chat.id, ctx.message.date);
        } catch (e) {
            // Без счётчика бот просто не узнает о спаме; комментарии работают.
            console.error('[BANTER] Не удалось посчитать стикер:', e);
        }

        try {
            const reply = stickerReply(verdict);
            if (verdict.level >= 3) {
                await ctx.react('🥱');
            } else if (reply) {
                await typeFor(ctx.chat.id, reply);
                await ctx.reply(reply, { reply_parameters: { message_id: ctx.message.message_id } });
            }
        } catch (e) {
            console.error('[BANTER] Не удалось ответить на стикер:', e);
        }

        return next();
    });
}
