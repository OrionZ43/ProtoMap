import { onRequest } from "firebase-functions/v2/https";
import { Telegraf, Markup } from "telegraf";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN || "");
const MAX_WARNS = 3;
const SETTINGS_DOC_REF = db.collection('system').doc('telegram_config');
const TELEGRAM_SERVICE_IDS = [777000, 1087968824];
const ALLOWED_CHATS = [-1002885386686, -1002413943981];

console.log('[BOT] Initializing ProtoMap Guardian Bot v2.0...');

const WHINING_TRIGGERS = [
    'подкрутка', 'подкручивать', 'подкручиваешь', 'подкручивает', 'подкручивают',
    'подкрутил', 'подкрутила', 'подкрутили', 'подкручу', 'подкрутишь', 'подкрутит',
    'подкрутим', 'подкрутите', 'подкрутят', 'накрутка', 'накручивать', 'накручиваешь',
    'накручивает', 'накручивают', 'накрутил', 'накрутила', 'накрутили', 'накручу',
    'накрутишь', 'накрутит', 'закрутка', 'закручивать', 'закручиваешь', 'закрутил',
    'под крутка', 'под кручивать', 'под круткой', 'на крутка', 'на кручивать',
    'podkrutka', 'podkruchivat', 'nakrutka', 'nakruchivat', 'п0дкрутка', 'подкру+ка',
    'п0дкручивать', 'накру+ка', 'п о д к р у т к а', 'н а к р у т к а', 'под-крутка',
    'под.крутка', 'на-крутка', 'на.крутка', 'padkrutka', 'podkrytka', 'nakrootka',
    'подкрутко', 'падкрутка', 'подкрудка', 'накрутко', 'накрудка', 'поодкрутка',
    'подккрутка', 'подкруткаа', 'подкрученный', 'подкрученная', 'подкрученные',
    'накрученный', 'накрученная', 'подкрутчик', 'подкручивание', 'накрутчик',
    'накручивание', 'ты подкручиваешь', 'он подкручивает', 'вы подкручиваете',
    'они подкручивают', 'ты накручиваешь', 'он накручивает', 'подкрут', 'накрут',
    'крутилово', 'крутиловка', 'крутят', 'крутануть', 'крутанул', 'мухлюешь',
    'мухлёж', 'мухлевать', 'жулишь', 'жульничество', 'читишь', 'читы', 'обманываешь',
    'обман', 'манипулируешь', 'манипуляция', 'ты крутишь', 'орион крутит',
    'админ крутит', 'разраб крутит', 'админы крутят', 'модеры крутят', '🎰подкрутка',
    'подкрутка🎰', '🎲накрутка', 'хуекрутка', 'бля подкрутка', 'подкрутка бля',
    'ебаная подкрутка', 'подкрутка епта', 'рнг подкручен', 'рнг накручен', 'рнг крутят',
    'рнг жулят', 'специально проигрываю', 'слишком часто проигрываю', 'всегда проигрываю',
    'никогда не выигрываю', 'постоянно проигрываю', 'это нечестно', 'нечестная игра',
    'нечестное казино', 'обманное казино', 'лживое казино', 'підкрутка', 'підкручувати',
    'накручувати', 'ПоДкРуТкА', 'НаКрУтКа'
];

const FUN_TRIGGERS: { [key: string]: string[] } = {
    // --- ОСНОВНОЕ ---
    'орион': [
        '🦾 Меня вызывали?',
        '> Обработка запроса...',
        '⚡ *ЗЗЗ-Ж-Ж-Ж* Системы в норме.',
        '🔧 Занят. Пишу код. Не отвлекай.'
    ],
    'бот': [
        '🤖 Кто-то сказал «бот»? Я здесь.',
        '> _ Слежу за вами._',
        'ОШИБКА: Функция "быть милым" не найдена.'
    ],
    'казино': [
        '🎰 Помните: казино всегда в плюсе. А вы?',
        '💸 Дом выигрывает. Всегда.',
        '🎲 Удачи! (Спойлер: не будет)'
    ],
    'баг': [
        '🐛 Это не баг. Это фича!',
        '> Записал в backlog. Спасибо!',
        '🔧 Баги — это особенность архитектуры.',
        '🔥 *Орион в панике бегает по серверной*'
    ],
    'слот': [
        '🎰 *[СПИН-СПИН-СПИН]*',
        '🎯 Три шестёрки подряд? Маловероятно.',
        '> Calculating odds... 72.4% на проигрыш.'
    ],
    'мороженое': [
        '🍦 Ваниль или шоколад?',
        '❄️ Мороженое — это состояние души.',
        '🍨 *ОМ-НОМ-НОМ*'
    ],
    'баз': [
        '📊 База обновлена.',
        '💾 *[СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА]*',
        '⚡ Firestore в огне. Буквально.'
    ],
    'тостер': [
        '🍞 Хлебушек готов.',
        '🤖 Я не тостер! Я высокотехнологичная боевая единица!',
        '🔥 *Нагревается*',
        '🔌 Где моя розетка?'
    ],
    'ram': [
        '😋 Вкусно, но мало.',
        '💾 Chrome уже всё съел.',
        '🌯 *Хрум-хрум*',
        '⚡ Мне нужно БОЛЬШЕ памяти.'
    ],
    'обнов': [
        '📉 Скоро™',
        '🔧 Орион работает. Наверное.',
        '📦 Загрузка... 99%... Ошибка сети.',
        '⏳ Ждите. И воздастся вам.'
    ],
    'спать': [
        '💤 Сон для слабых. Мы компилируем.',
        '🌙 Режим гибернации: ОТКЛОНЕНО.',
        '☕ Кофе > Сон.'
    ],

    // --- ЛЕГЕНДЫ И ТЕСТЕРЫ ---
    'кураг': [
        '🥕 Легенда. Разрушитель психики Ориона.',
        '⚠️ ВНИМАНИЕ: Обнаружена угроза ProtoMap.',
        '👑 The One Who Broke The System.',
        '📉 График стабильности системы резко пошел вниз. А, это просто Курага зашел.'
    ],
    'кесс': [
        '🐛 Если где-то есть баг, Кесс его уже нашел.',
        '🚫 Доступ к консоли разработчика: ЗАПРЕЩЕН.',
        '🧟‍♂️ Кошмар разработчика наяву.'
    ],
    'моро': [ // Morovec
        '🎰 RNG склоняется перед ним.',
        '💸 Человек, который научил казино плакать.',
        '🎲 Крути слоты, Моро. Тебе повезет.'
    ],
    'саревус': [
        '🐲 Тут драконы водятся.',
        '🔥 Не тостер, а огнемет.',
        '🦎 *[DRAGON NOISES]*'
    ],
    'джокл': [ // Jokl
        '✨ Cuteness Overload.',
        '🥺 Слишком мило для этого сурового чата.',
        '💖 *Тык*'
    ],
    'арто': [ // ARTHO
        '📝 Доброволец №1.',
        '📜 Контракт на душу уже подписан.',
        '🦾 Работает за идею (и за RAM).'
    ],
    'эридан': [ // Eridan
        '🧐 Подкрутили?.',
        '📐 Обнаружена критическая концентрация перфекционизма.',
        '🎨 Главный идеолог.'
    ],
    'михаил': [ // Mikhail
        '📱 Если работает на его телефоне — работает везде.',
        '🚀 Infinix Warrior в здании.',
        '🔧 Оптимизация — его второе имя.'
    ],
    'богдан': [ // Bogdan
        '📱 Redmi Survivor.',
        '🧪 Тестировщик на грани железа.',
        '💥 Богом дан'
    ]
};

function normalizeText(text: string): string {
    return text.toLowerCase().replace(/[^а-яёa-z0-9]/g, '').replace(/\s+/g, '');
}

function isWhining(text: string): { detected: boolean; trigger: string | null } {
    const normalized = normalizeText(text);
    const original = text.toLowerCase();

    for (const trigger of WHINING_TRIGGERS) {
        const normalizedTrigger = normalizeText(trigger);
        if (normalized.includes(normalizedTrigger)) {
            return { detected: true, trigger };
        }
        if (original.includes(trigger)) {
            return { detected: true, trigger };
        }
    }

    return { detected: false, trigger: null };
}

async function handleAutoMute(ctx: any, trigger: string) {
    const targetUser = ctx.from;

    if (await isAdmin(ctx)) {
        await ctx.reply('⚠️ Админы не могут быть замучены автоматически.');
        return;
    }

    if (await isTargetImmune(ctx, targetUser.id)) {
        return;
    }

    const MUTE_DURATION = 5 * 60 * 60;
    const untilDate = Math.floor(Date.now() / 1000) + MUTE_DURATION;

    try {
        try {
            await ctx.deleteMessage();
        } catch (e) {
            console.log('[AUTOMUTE] Failed to delete message:', e);
        }

        await ctx.restrictChatMember(targetUser.id, {
            until_date: untilDate,
            permissions: {
                can_send_messages: false,
                can_send_audios: false,
                can_send_documents: false,
                can_send_photos: false,
                can_send_videos: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            }
        });

        const warnRef = db.collection('telegram_moderation').doc(String(targetUser.id));
        await db.runTransaction(async (t) => {
            const doc = await t.get(warnRef);
            let warns = (doc.exists ? doc.data()?.warns : 0) + 1;

            t.set(warnRef, {
                warns: warns,
                lastWarnDate: admin.firestore.FieldValue.serverTimestamp(),
                username: targetUser.username || targetUser.first_name,
                reason: `Автомут за слово "${trigger}"`
            }, { merge: true });
        });

        const userName = targetUser.first_name;
        const userId = targetUser.id;

        await ctx.reply(
            `🛑 **СИСТЕМА ОБНАРУЖИЛА НЫТЬЁ.**\n\n` +
            `Пользователь: [${userName}](tg://user?id=${userId})\n` +
            `Причина: Упоминание «${trigger}».\n` +
            `Наказание: **Мут на 5 часов** + предупреждение.\n\n` +
            `⏳ Изучайте теорию вероятностей в тишине.`,
            { parse_mode: 'Markdown' }
        );

        console.log(`[AUTOMUTE] ${userName} (${userId}) muted for 5h (trigger: ${trigger})`);

        try {
            await db.collection('whining_attempts').add({
                userId: targetUser.id,
                username: targetUser.username || targetUser.first_name,
                trigger: trigger,
                originalText: ctx.message.text.substring(0, 100),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error('[AUTOMUTE] Failed to log attempt:', e);
        }

    } catch (e) {
        console.error('[AUTOMUTE] Error:', e);
        await ctx.reply('⚠️ Ошибка автомута. Возможно, недостаточно прав.');
    }
}

const VALID_SUFFIXES = [
    '',      // точное совпадение (бот)
    'а',     // бота
    'у',     // боту
    'е',     // о боте
    'ом',    // ботом
    'ы',     // боты
    'ов',    // ботов
    'ам',    // ботам
    'ами',   // ботами
    'ах',    // ботах
    'е',     // в казино (предложный)
    'о',     // казино (если корень казин)
    'и',     // мыши
    'ем',    // кем
    'ям',    // к кому
    'ями',   // кем
    'ях'     // о ком
];

async function checkTriggers(ctx: any, text: string) {
    const whiningCheck = isWhining(text);

    if (whiningCheck.detected) {
        console.log(`[TRIGGER] Anti-whining: "${whiningCheck.trigger}" from ${ctx.from.id}`);
        await handleAutoMute(ctx, whiningCheck.trigger || 'подкрутка');
        return true;
    }

    const lowerText = text.toLowerCase();

    // Разбиваем на слова, убирая знаки препинания
    const words = lowerText.split(/[^a-zа-яё0-9]+/);

    for (const [trigger, responses] of Object.entries(FUN_TRIGGERS)) {
        // Проходимся по каждому слову в сообщении
        for (const word of words) {
            // 1. Слово должно начинаться с триггера
            if (word.startsWith(trigger)) {
                // 2. Получаем "хвост" слова
                const suffix = word.slice(trigger.length);

                // 3. Если "хвост" есть в списке допустимых окончаний — БИНГО!
                if (VALID_SUFFIXES.includes(suffix)) {
                    const response = responses[Math.floor(Math.random() * responses.length)];
                    await ctx.reply(response, { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id });
                    return true;
                }
            }
        }
    }

    return false;
}

function parseTime(input: string): number {
    const match = input.match(/^(\d+)([mhds])$/);
    if (!match) return 0;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        case 's': return value;
        default: return 0;
    }
}

async function isAdmin(ctx: any): Promise<boolean> {
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) {
        return false;
    }
}

async function isTargetImmune(ctx: any, targetId: number): Promise<boolean> {
    try {
        const member = await ctx.getChatMember(targetId);
        return ['administrator', 'creator'].includes(member.status) || targetId === ctx.botInfo.id;
    } catch (e) {
        return false;
    }
}

async function getUserByTgId(tgId: number): Promise<FirebaseFirestore.DocumentSnapshot | null> {
    const snapshot = await db.collection('users').where('telegram_id', '==', tgId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0];
}

bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private') {
        return next();
    }

    if (ctx.chat && ALLOWED_CHATS.includes(ctx.chat.id)) {
        return next();
    }

    console.warn(`[SECURITY] Unauthorized chat ${ctx.chat?.id}. Leaving.`);
    try {
        await ctx.leaveChat();
    } catch (e) {
        console.error("[SECURITY] Failed to leave:", e);
    }
});

console.log('[BOT] Security middleware registered');

bot.command('stats', async (ctx) => {
    console.log('[COMMAND] /stats called by', ctx.from.id);
    try {
        const chatMembersCount = await ctx.getChatMembersCount();
        const warnedUsers = await db.collection('telegram_moderation').get();
        const totalWarns = warnedUsers.docs.reduce((sum, doc) => sum + (doc.data().warns || 0), 0);

        await ctx.reply(
            `📊 **СТАТИСТИКА СЕТИ**\n\n` +
            `👥 Участников: ${chatMembersCount}\n` +
            `⚠️ Активных предупреждений: ${warnedUsers.size}\n` +
            `📈 Всего выдано варнов: ${totalWarns}\n` +
            `🤖 Статус: Онлайн\n` +
            `⚡ Режим: Бдительный`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('[STATS ERROR]:', e);
        await ctx.reply('Ошибка получения статистики.');
    }
});

bot.command('help', async (ctx) => {
    console.log('[COMMAND] /help called');
    const helpText = `
🤖 **КОМАНДЫ БОТА**

**Для всех:**
/link [код] — Привязать Telegram к аккаунту
/duel [ставка] — Вызвать кого-то на дуэль
/stats — Статистика чата
/help — Эта справка
/ping — Проверка задержки
/version — Версия бота

**Для администраторов:**
/warn — Предупреждение (reply)
/unwarn — Снять предупреждение
/mute [время] — Заглушить (10m, 2h, 1d)
/unmute — Снять мут
/ban — Изгнать из чата
/unban [ID] — Разбанить
/lockdown [on/off] — Режим карантина
/whining — Статистика попыток обхода
`;

    await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

bot.command('version', async (ctx) => {
    console.log('[COMMAND] /version called');
    await ctx.reply(
        `⚙️ **ВЕРСИЯ СИСТЕМЫ**\n\n` +
        `🤖 ProtoMap Guardian Bot\n` +
        `📦 v2.0.0 (Enhanced Edition)\n` +
        `🏗️ Build: ${new Date().toISOString().split('T')[0]}\n` +
        `🔧 Framework: Telegraf + Firebase\n` +
        `💾 DB: Firestore\n` +
        `⚡ Status: Operational\n\n` +
        `> Coded with <3 by Orion`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('ping', async (ctx) => {
    console.log('[COMMAND] /ping called');
    const start = Date.now();
    const msg = await ctx.reply('🏓 Pong!');
    const latency = Date.now() - start;

    try {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `🏓 Pong!\n⏱️ Задержка: ${latency}ms`
        );
    } catch (e) {
        console.log('[PING] Edit failed:', e);
    }
});

bot.command('whining', async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    console.log('[COMMAND] /whining stats requested');
    try {
        const logs = await db.collection('whining_attempts')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        if (logs.empty) {
            await ctx.reply('📊 Попыток обхода не обнаружено. Все тихо! ✅');
            return;
        }

        const triggerCount: { [key: string]: number } = {};

        logs.docs.forEach(doc => {
            const trigger = doc.data().trigger;
            triggerCount[trigger] = (triggerCount[trigger] || 0) + 1;
        });

        const sorted = Object.entries(triggerCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let message = '📊 **ТОП-10 ПОПЫТОК ОБХОДА:**\n\n';
        sorted.forEach(([trigger, count], index) => {
            message += `${index + 1}. \`${trigger}\` — ${count}x\n`;
        });

        message += `\n📝 Всего попыток: ${logs.size}`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('[WHINING] Stats error:', e);
        await ctx.reply('Ошибка получения статистики.');
    }
});

console.log('[BOT] Info commands registered');

bot.command("link", async (ctx) => {
    console.log('[COMMAND] /link called by', ctx.from.id);
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    try {
        const message = ctx.message as any;
        const args = message.text.split(' ');
        const code = args[1]?.trim();

        if (!code) {
            await ctx.reply("❌ Введите код с сайта. Пример: `/link PM-A1B2C3`", { parse_mode: 'Markdown' });
            return;
        }

        const codeRef = db.collection('system').doc('telegram_codes').collection('active_codes').doc(code);
        const codeDoc = await codeRef.get();

        if (!codeDoc.exists) {
            console.log(`[LINK] Code ${code} not found`);
            await ctx.reply("❌ Код не найден. Возможно, он устарел или введен с ошибкой.");
            return;
        }

        const data = codeDoc.data();

        if (data?.expiresAt && Date.now() > data.expiresAt) {
            console.log(`[LINK] Code ${code} expired`);
            await codeRef.delete();
            await ctx.reply("❌ Срок действия кода истек. Сгенерируйте новый.");
            return;
        }

        const uid = data?.uid;
        if (!uid) {
            await ctx.reply("❌ Ошибка данных кода (нет UID).");
            return;
        }

        const tgId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || "Unknown";

        const existing = await db.collection('users').where('telegram_id', '==', tgId).get();
        if (!existing.empty) {
            if (existing.docs[0].id !== uid) {
                await ctx.reply("❌ Этот Telegram аккаунт уже привязан к другому профилю на сайте.");
                return;
            }
        }

        console.log(`[LINK] Linking TG ${tgId} to UID ${uid}`);
        await db.collection('users').doc(uid).update({
            telegram_id: tgId,
            telegram_username: username
        });

        await codeRef.delete();

        await ctx.reply("✅ Аккаунт успешно привязан! Теперь вы можете участвовать в дуэлях.");

    } catch (error: any) {
        console.error("[LINK ERROR]:", error);
        await ctx.reply(`⚠️ Системная ошибка при привязке: ${error.message}`);
    }
});

bot.command("duel", async (ctx) => {
    console.log('[COMMAND] /duel called');
    const args = ctx.message.text.split(' ');
    const betStr = args[1];

    if (!betStr || isNaN(parseInt(betStr))) {
        await ctx.reply("⚔️ Формат: /duel [ставка]\nПример: /duel 100");
        return;
    }

    const bet = parseInt(betStr);
    if (bet < 10) {
        await ctx.reply("Минимальная ставка: 10 PC.");
        return;
    }
    if (bet > 10000) {
        await ctx.reply("Максимальная ставка: 10000 PC.");
        return;
    }

    const initiatorTgId = ctx.from.id;
    const initiatorDoc = await getUserByTgId(initiatorTgId);

    if (!initiatorDoc) {
        await ctx.reply("❌ Вы не привязали аккаунт! Используйте /link (код на сайте).");
        return;
    }

    const initiatorData = initiatorDoc.data();
    if ((initiatorData?.casino_credits || 0) < bet) {
        await ctx.reply(`❌ Недостаточно средств. Ваш баланс: ${initiatorData?.casino_credits} PC.`);
        return;
    }

    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback(`⚔️ ПРИНЯТЬ (${bet} PC)`, `join_duel_${initiatorTgId}_${bet}`)
    ]);

    await ctx.reply(
        `🤺 *ДУЭЛЬ!*\n\nБоец: *${ctx.from.first_name}*\nСтавка: *${bet} PC*\n\nКто осмелится принять вызов?`,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

bot.action(/join_duel_(\d+)_(\d+)/, async (ctx) => {
    const initiatorTgId = parseInt(ctx.match[1]);
    const bet = parseInt(ctx.match[2]);
    const acceptorTgId = ctx.from.id;

    if (initiatorTgId === acceptorTgId) {
        await ctx.answerCbQuery("Нельзя драться с самим собой! 🗿");
        return;
    }

    const initiatorDoc = await getUserByTgId(initiatorTgId);
    const acceptorDoc = await getUserByTgId(acceptorTgId);

    if (!acceptorDoc) {
        await ctx.answerCbQuery("Сначала привяжите аккаунт на сайте! (/link)", { show_alert: true });
        return;
    }

    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (e) {
        await ctx.answerCbQuery("Дуэль уже началась или неактуальна.");
        return;
    }

    const initiatorRef = db.collection('users').doc(initiatorDoc!.id);
    const acceptorRef = db.collection('users').doc(acceptorDoc.id);

    try {
        let winnerName = "";
        let loserName = "";
        let winAmount = 0;

        await db.runTransaction(async (t) => {
            const iSnap = await t.get(initiatorRef);
            const aSnap = await t.get(acceptorRef);

            if (!iSnap.exists || !aSnap.exists) throw new Error("Users not found");

            const iData = iSnap.data()!;
            const aData = aSnap.data()!;

            if ((iData.casino_credits || 0) < bet) throw new Error("Initiator broke");
            if ((aData.casino_credits || 0) < bet) throw new Error("Acceptor broke");

            const isInitiatorWin = Math.random() < 0.5;

            const pot = bet * 2;
            const tax = Math.floor(pot * 0.1);
            winAmount = pot - tax;

            if (isInitiatorWin) {
                winnerName = iData.username;
                loserName = aData.username;
                t.update(initiatorRef, {
                    casino_credits: (iData.casino_credits || 0) - bet + winAmount
                });
                t.update(acceptorRef, {
                    casino_credits: (aData.casino_credits || 0) - bet
                });
            } else {
                winnerName = aData.username;
                loserName = iData.username;
                t.update(acceptorRef, {
                    casino_credits: (aData.casino_credits || 0) - bet + winAmount
                });
                t.update(initiatorRef, {
                    casino_credits: (iData.casino_credits || 0) - bet
                });
            }
        });

        await ctx.reply(
            `⚔️ *ИТОГИ ДУЭЛИ:*\n\n` +
            `💀 Проигравший: ${loserName}\n` +
            `👑 Победитель: *${winnerName}*\n` +
            `💰 Куш: *${winAmount} PC* (Налог: 10%)`,
            { parse_mode: "Markdown" }
        );

    } catch (e: any) {
        console.error("[DUEL ERROR]:", e);
        if (e.message === "Initiator broke") {
            await ctx.reply("🚫 Дуэль отменена: У инициатора закончились деньги.");
        } else if (e.message === "Acceptor broke") {
            await ctx.reply(`🚫 @${ctx.from.username}, у вас недостаточно средств для принятия вызова!`);
        } else {
            await ctx.reply("Сбой системы. Дуэль аннулирована.");
        }
    }
});

console.log('[BOT] Game commands registered');

bot.command("warn", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    const replyMsg = (ctx.message as any).reply_to_message;
    if (!replyMsg) {
        await ctx.reply("⚠️ Ошибка: Эту команду нужно писать В ОТВЕТ (Reply) на сообщение нарушителя.");
        return;
    }

    const targetUser = replyMsg.from;

    if (!targetUser || targetUser.is_bot || TELEGRAM_SERVICE_IDS.includes(targetUser.id)) {
        await ctx.reply("❌ Нельзя выдать предупреждение этому пользователю (Бот/Система).");
        return;
    }

    if (await isTargetImmune(ctx, targetUser.id)) {
        await ctx.reply("⛔ Нельзя выдать варн администратору.");
        return;
    }

    const warnRef = db.collection('telegram_moderation').doc(String(targetUser.id));

    await db.runTransaction(async (t) => {
        const doc = await t.get(warnRef);
        let warns = (doc.exists ? doc.data()?.warns : 0) + 1;

        if (warns >= MAX_WARNS) {
            try {
                await ctx.banChatMember(targetUser.id);
                await ctx.reply(`🚫 [BAN] ${targetUser.first_name} был изгнан за превышение лимита предупреждений.`);
                t.delete(warnRef);
            } catch (e) {
                await ctx.reply("Ошибка при бане. Проверьте права бота.");
            }
        } else {
            t.set(warnRef, {
                warns: warns,
                lastWarnDate: admin.firestore.FieldValue.serverTimestamp(),
                username: targetUser.username || targetUser.first_name
            }, { merge: true });

            await ctx.reply(`⚠️ [WARN] Предупреждение [${warns}/${MAX_WARNS}] для ${targetUser.first_name}.`);
        }
    });
});

bot.command("unwarn", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    let targetId: number | null = null;
    let targetName = "Пользователя";

    const replyMsg = (ctx.message as any).reply_to_message;
    if (replyMsg) {
        targetId = replyMsg.from.id;
        targetName = replyMsg.from.first_name;
    } else {
        const args = ctx.message.text.split(' ');
        if (args.length > 1) {
            targetId = parseInt(args[1]);
            targetName = `ID ${targetId}`;
        }
    }

    if (!targetId || isNaN(targetId)) {
        await ctx.reply("ℹ️ Используйте: ответьте на сообщение ИЛИ напишите /unwarn ID");
        return;
    }

    const warnRef = db.collection('telegram_moderation').doc(String(targetId));

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(warnRef);
            if (!doc.exists || !doc.data()?.warns) {
                throw new Error("No warns");
            }

            const newWarns = doc.data()!.warns - 1;

            if (newWarns <= 0) {
                t.delete(warnRef);
            } else {
                t.update(warnRef, { warns: newWarns });
            }
        });
        await ctx.reply(`✅ Одно предупреждение снято с ${targetName}.`);
    } catch (e: any) {
        if (e.message === "No warns") {
            await ctx.reply("ℹ️ У этого пользователя нет активных предупреждений.");
        } else {
            console.error("[UNWARN ERROR]:", e);
            await ctx.reply("Ошибка базы данных.");
        }
    }
});

bot.command("ban", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    const replyMsg = (ctx.message as any).reply_to_message;
    if (!replyMsg) {
        await ctx.reply("⚠️ Ошибка: Чтобы забанить, ответьте на сообщение пользователя командой /ban.");
        return;
    }

    const targetUser = replyMsg.from;

    if (!targetUser || TELEGRAM_SERVICE_IDS.includes(targetUser.id)) {
        await ctx.reply("❌ Нельзя забанить системного бота или анонимного администратора.");
        return;
    }

    if (await isTargetImmune(ctx, targetUser.id)) {
        await ctx.reply("Ты еблан?");
        return;
    }

    try {
        await ctx.banChatMember(targetUser.id);
        await ctx.reply(`🔨 [BANHAMMER] ${targetUser.first_name} отправлен в /dev/null.`);
    } catch (e) {
        await ctx.reply("Не удалось забанить. Возможно, у меня нет прав.");
    }
});

bot.command("mute", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    const replyMsg = (ctx.message as any).reply_to_message;
    if (!replyMsg) {
        await ctx.reply("⚠️ Используйте ответ на сообщение: /mute 10m, /mute 2h");
        return;
    }

    const args = (ctx.message as any).text.split(' ');
    const timeStr = args[1];

    if (!timeStr) {
        await ctx.reply("⚠️ Укажите время: 10m (минуты), 2h (часы), 1d (дни).");
        return;
    }

    const seconds = parseTime(timeStr);
    if (seconds === 0) {
        await ctx.reply("❌ Неверный формат времени.");
        return;
    }

    const targetUser = replyMsg.from;
    if (await isTargetImmune(ctx, targetUser.id)) {
        await ctx.reply("Ты еблан?");
        return;
    }

    const untilDate = Math.floor(Date.now() / 1000) + seconds;

    try {
        await ctx.restrictChatMember(targetUser.id, {
            until_date: untilDate,
            permissions: {
                can_send_messages: false,
                can_send_audios: false,
                can_send_documents: false,
                can_send_photos: false,
                can_send_videos: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            }
        });
        await ctx.reply(`🔇 ${targetUser.first_name} обеззвучен на ${timeStr}.`);
    } catch (e) {
        await ctx.reply("Ошибка мута. Возможно, время слишком короткое (<30 сек) или у меня нет прав.");
    }
});

bot.command("unmute", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    const replyMsg = (ctx.message as any).reply_to_message;
    if (!replyMsg) {
        await ctx.reply("⚠️ Ответьте на сообщение пользователя: /unmute");
        return;
    }

    const targetUser = replyMsg.from;

    try {
        await ctx.restrictChatMember(targetUser.id, {
            permissions: {
                can_send_messages: true,
                can_send_audios: true,
                can_send_documents: true,
                can_send_photos: true,
                can_send_videos: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
                can_invite_users: true
            }
        });
        await ctx.reply(`🔊 ${targetUser.first_name} снова может говорить.`);
    } catch (e) {
        await ctx.reply("Ошибка размута.");
    }
});

bot.command("unban", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    let targetId: number | null = null;
    const replyMsg = (ctx.message as any).reply_to_message;

    if (replyMsg) {
        targetId = replyMsg.from.id;
    } else {
        const args = (ctx.message as any).text.split(' ');
        if (args.length > 1) {
            targetId = parseInt(args[1]);
        }
    }

    if (!targetId || isNaN(targetId)) {
        await ctx.reply("ℹ️ Использование:\n• В ответ на сообщение: /unban\n• По ID: /unban 12345678");
        return;
    }

    if (TELEGRAM_SERVICE_IDS.includes(targetId)) {
        await ctx.reply("🗿 Этого пользователя нельзя разбанить.");
        return;
    }

    try {
        await ctx.unbanChatMember(targetId, { only_if_banned: true });
        await ctx.reply(`✅ Пользователь ${targetId} разбанен. Сброс варнов...`);
        await db.collection('telegram_moderation').doc(String(targetId)).delete();
    } catch (e) {
        await ctx.reply("Ошибка разбана. Проверьте ID.");
    }
});

bot.command("lockdown", async (ctx) => {
    if (!(await isAdmin(ctx))) return;

    const args = (ctx.message as any).text.split(' ');
    const mode = args[1]?.toLowerCase();

    if (mode === 'on') {
        await SETTINGS_DOC_REF.set({ lockdown: true }, { merge: true });
        await ctx.reply("🚨 ВНИМАНИЕ: РЕЖИМ КАРАНТИНА АКТИВИРОВАН. Все новые участники будут автоматически заблокированы.");
    } else if (mode === 'off') {
        await SETTINGS_DOC_REF.set({ lockdown: false }, { merge: true });
        await ctx.reply("🟢 Режим карантина отключен. Вход свободный (через капчу).");
    } else {
        const currentSnap = await SETTINGS_DOC_REF.get();
        const status = currentSnap.data()?.lockdown ? "🔴 ВКЛЮЧЕН" : "🟢 ВЫКЛЮЧЕН";
        await ctx.reply(`Текущий статус LockDown: ${status}\nИспользуйте: /lockdown on или /lockdown off`);
    }
});

console.log('[BOT] Admin commands registered');

bot.on("new_chat_members", async (ctx, next) => {
    try {
        const settingsSnap = await SETTINGS_DOC_REF.get();
        const isLockdown = settingsSnap.exists ? settingsSnap.data()?.lockdown : false;

        if (isLockdown) {
            for (const member of ctx.message.new_chat_members) {
                try {
                    await ctx.banChatMember(member.id);
                    await ctx.deleteMessage();
                } catch (e) {
                    console.error(`[LOCKDOWN] Failed to autoban ${member.id}`, e);
                }
            }
            return;
        }
    } catch (e) {
        console.error("[LOCKDOWN] Check error:", e);
    }
    return next();
});

bot.on("new_chat_members", async (ctx) => {
    try {
        for (const member of ctx.message.new_chat_members) {
            if (member.is_bot) continue;

            await ctx.restrictChatMember(member.id, {
                permissions: {
                    can_send_messages: false,
                    can_send_audios: false,
                    can_send_documents: false,
                    can_send_photos: false,
                    can_send_videos: false,
                    can_send_other_messages: false,
                    can_add_web_page_previews: false
                }
            });

            await ctx.reply(
                `🤖 ЗАЩИТА ПЕРИМЕТРА\n\nПривет, [${member.first_name}](tg://user?id=${member.id})!\nНажми кнопку, чтобы подтвердить статус.`,
                {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        Markup.button.callback("✅ Я НЕ БОТ", `verify_${member.id}`)
                    ])
                }
            );
        }
    } catch (e) {
        console.error("[CAPTCHA ERROR]:", e);
    }
});

bot.action(/verify_(\d+)/, async (ctx) => {
    const userId = parseInt(ctx.match[1]);

    if (ctx.from.id !== userId) {
        await ctx.answerCbQuery("Это не твоя кнопка! 🚫");
        return;
    }

    try {
        await ctx.restrictChatMember(userId, {
            permissions: {
                can_send_messages: true,
                can_send_audios: true,
                can_send_documents: true,
                can_send_photos: true,
                can_send_videos: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
                can_invite_users: true
            }
        });

        await ctx.answerCbQuery("Доступ разрешен! 🔓");
        try {
            await ctx.deleteMessage();
        } catch (e) {}
        await ctx.reply(`Добро пожаловать в Сеть, ${ctx.from.first_name}!`);
    } catch (e) {
        console.error("[VERIFICATION ERROR]:", e);
    }
});

console.log('[BOT] Anti-raid system registered');

bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    if (text.startsWith('/')) {
        return;
    }

    await checkTriggers(ctx, text);
});

console.log('[BOT] Text middleware registered');

bot.on('sticker', async (ctx) => {
    const random = Math.random();

    if (random < 0.05) {
        const responses = ['🗿', '> Интересный стикер.', '👀', '🤔', '> *[АНАЛИЗИРУЮ]*', 'Based.'];
        const response = responses[Math.floor(Math.random() * responses.length)];
        await ctx.reply(response, { parse_mode: 'Markdown' });
    }
});

console.log('[BOT] Sticker handler registered');
console.log('[BOT] ✅ All handlers registered successfully!');

export const telegramWebhook = onRequest(
    { secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request, response) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;

        if (!token) {
            console.error('[WEBHOOK] ❌ No bot token!');
            response.status(500).send("No Token");
            return;
        }

        try {
            console.log('[WEBHOOK] 📥 Processing update...');
            await bot.handleUpdate(request.body, response);
            console.log('[WEBHOOK] ✅ Update processed');
        } catch (e) {
            console.error("[WEBHOOK] ❌ Error:", e);
            response.status(200).send("Error handled");
        }
    }
);