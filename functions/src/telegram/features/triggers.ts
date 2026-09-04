/**
 * Реакции на слова и стикеры.
 *
 * Два разных механизма в одном модуле: автомут за нытьё про «подкрутку»
 * (WHINING_TRIGGERS) и шуточные ответы на ключевые слова (FUN_TRIGGERS).
 * Оба включаются возможностью `triggers` и в личном чате выключены.
 *
 * Регистрируется ПОСЛЕДНИМ: `bot.on('text')` ловит любое текстовое сообщение,
 * и всё, что должно обработать текст раньше, обязано стоять выше.
 */

import { Telegraf } from "telegraf";
import { db, admin } from "../core/bot";
import { hasFeature } from "../core/registry";
import { isAdmin, isTargetImmune } from "../core/helpers";

// ─── Триггеры нытья ───────────────────────────────────────────────────────────
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
    'моро': [
        '🎰 RNG склоняется перед ним.',
        '💸 Человек, который научил казино плакать.',
        '🎲 Крути слоты, Моро. Тебе повезет.'
    ],
    'саревус': [
        '🐲 Тут драконы водятся.',
        '🔥 Не тостер, а огнемет.',
        '🦎 *[DRAGON NOISES]*'
    ],
    'джокл': [
        '✨ Cuteness Overload.',
        '🥺 Слишком мило для этого сурового чата.',
        '💖 *Тык*'
    ],
    'арто': [
        '📝 Доброволец №1.',
        '📜 Контракт на душу уже подписан.',
        '🦾 Работает за идею (и за RAM).'
    ],
    'эридан': [
        '🧐 Подкрутили?.',
        '📐 Обнаружена критическая концентрация перфекционизма.',
        '🎨 Главный идеолог.'
    ],
    'михаил': [
        '📱 Если работает на его телефоне — работает везде.',
        '🚀 Infinix Warrior в здании.',
        '🔧 Оптимизация — его второе имя.'
    ],
    'богдан': [
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
    const original   = text.toLowerCase();

    for (const trigger of WHINING_TRIGGERS) {
        const normalizedTrigger = normalizeText(trigger);
        if (normalized.includes(normalizedTrigger)) return { detected: true, trigger };
        if (original.includes(trigger))             return { detected: true, trigger };
    }
    return { detected: false, trigger: null };
}

async function handleAutoMute(ctx: any, trigger: string) {
    const targetUser = ctx.from;

    if (await isAdmin(ctx)) {
        await ctx.reply('⚠️ Админы не могут быть замучены автоматически.');
        return;
    }
    if (await isTargetImmune(ctx, targetUser.id)) return;

    const MUTE_DURATION = 5 * 60 * 60;
    const untilDate     = Math.floor(Date.now() / 1000) + MUTE_DURATION;

    try {
        try { await ctx.deleteMessage(); } catch (e) {}

        await ctx.restrictChatMember(targetUser.id, {
            until_date: untilDate,
            permissions: {
                can_send_messages:         false,
                can_send_audios:           false,
                can_send_documents:        false,
                can_send_photos:           false,
                can_send_videos:           false,
                can_send_other_messages:   false,
                can_add_web_page_previews: false,
            }
        });

        const warnRef = db.collection('telegram_moderation').doc(String(targetUser.id));
        await db.runTransaction(async (t) => {
            const doc   = await t.get(warnRef);
            const warns = (doc.exists ? doc.data()?.warns : 0) + 1;
            t.set(warnRef, {
                warns,
                lastWarnDate: admin.firestore.FieldValue.serverTimestamp(),
                username:     targetUser.username || targetUser.first_name,
                reason:       `Автомут за слово "${trigger}"`
            }, { merge: true });
        });

        await ctx.reply(
            `🛑 **СИСТЕМА ОБНАРУЖИЛА НЫТЬЁ.**\n\n` +
            `Пользователь: [${targetUser.first_name}](tg://user?id=${targetUser.id})\n` +
            `Причина: Упоминание «${trigger}».\n` +
            `Наказание: **Мут на 5 часов** + предупреждение.\n\n` +
            `⏳ Изучайте теорию вероятностей в тишине.`,
            { parse_mode: 'Markdown' }
        );

        console.log(`[AUTOMUTE] ${targetUser.first_name} (${targetUser.id}) muted for 5h (trigger: ${trigger})`);

        try {
            await db.collection('whining_attempts').add({
                userId:       targetUser.id,
                username:     targetUser.username || targetUser.first_name,
                trigger,
                originalText: ctx.message.text.substring(0, 100),
                timestamp:    admin.firestore.FieldValue.serverTimestamp()
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
    '', 'а', 'у', 'е', 'ом', 'ы', 'ов', 'ам', 'ами', 'ах',
    'о', 'и', 'ем', 'ям', 'ями', 'ях'
];

async function checkTriggers(ctx: any, text: string) {
    const whiningCheck = isWhining(text);
    if (whiningCheck.detected) {
        console.log(`[TRIGGER] Anti-whining: "${whiningCheck.trigger}" from ${ctx.from.id}`);
        await handleAutoMute(ctx, whiningCheck.trigger || 'подкрутка');
        return true;
    }

    const lowerText = text.toLowerCase();
    const words     = lowerText.split(/[^a-zа-яё0-9]+/);

    for (const [trigger, responses] of Object.entries(FUN_TRIGGERS)) {
        for (const word of words) {
            if (word.startsWith(trigger)) {
                const suffix = word.slice(trigger.length);
                if (VALID_SUFFIXES.includes(suffix)) {
                    const response = responses[Math.floor(Math.random() * responses.length)];
                    await ctx.reply(response, {
                        parse_mode:           'Markdown',
                        reply_to_message_id:  ctx.message.message_id
                    });
                    return true;
                }
            }
        }
    }
    return false;
}

export function register(bot: Telegraf): void {
    bot.on('text', async (ctx, next) => {
        // Ни автомута за «подкрутку», ни ответов на слова вроде «орион» —
        // в личном чате это выключено, см. реестр CHAT_FEATURES.
        //
        // next() вызывается во всех ветках намеренно. Раньше обработчик просто
        // делал return, обрывая цепочку Telegraf, — из-за этого любой хендлер,
        // зарегистрированный ниже, не получал текстовых сообщений вообще.
        // На этом уже спотыкалась команда /text.
        if (!hasFeature(ctx.chat?.id, 'triggers')) return next();

        const text = ctx.message.text;
        if (text.startsWith('/')) return next();

        await checkTriggers(ctx, text);
        return next();
    });

    // ─── Стикеры ─────────────────────────────────────────────────────────────────
    bot.on('sticker', async (ctx) => {
        if (Math.random() < 0.05) {
            const responses = ['🗿', '> Интересный стикер.', '👀', '🤔', '> *[АНАЛИЗИРУЮ]*', 'Based.'];
            await ctx.reply(responses[Math.floor(Math.random() * responses.length)], { parse_mode: 'Markdown' });
        }
    });
}
