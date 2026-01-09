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

// --- ХЕЛПЕРЫ ---

// 🔥 ДОБАВЛЕНО: Парсер времени для мута
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
    const member = await ctx.getChatMember(ctx.from.id);
    return ['administrator', 'creator'].includes(member.status);
}

async function isTargetImmune(ctx: any, targetId: number): Promise<boolean> {
    try {
        const member = await ctx.getChatMember(targetId);
        return ['administrator', 'creator'].includes(member.status) || targetId === ctx.botInfo.id;
    } catch (e) { return false; }
}

async function getUserByTgId(tgId: number): Promise<FirebaseFirestore.DocumentSnapshot | null> {
    const snapshot = await db.collection('users').where('telegram_id', '==', tgId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0];
}

// ==================================================================
// 🔗 СИСТЕМА ПРИВЯЗКИ (/link)
// ==================================================================

bot.command("link", async (ctx) => {
    // 1. Попытка удалить сообщение (безопасность)
    try { await ctx.deleteMessage(); } catch (e) { console.log("Del msg fail:", e); }

    try {
        const message = ctx.message as any; // Приведение типов для TS
        const args = message.text.split(' ');
        const code = args[1]?.trim(); // Убираем пробелы

        console.log(`[LINK DEBUG] User ${ctx.from.id} sent code: ${code}`);

        if (!code) {
            await ctx.reply("❌ Введите код с сайта. Пример: `/link PM-A1B2C3`", { parse_mode: 'Markdown' });
            return;
        }

        // 2. Ищем код в базе
        const codeRef = db.collection('system').doc('telegram_codes').collection('active_codes').doc(code);
        const codeDoc = await codeRef.get();

        if (!codeDoc.exists) {
            console.log(`[LINK DEBUG] Code ${code} not found in DB`);
            await ctx.reply("❌ Код не найден. Возможно, он устарел или введен с ошибкой.");
            return;
        }

        const data = codeDoc.data();

        // Проверка срока жизни
        if (data?.expiresAt && Date.now() > data.expiresAt) {
            console.log(`[LINK DEBUG] Code ${code} expired`);
            await codeRef.delete(); // Удаляем протухший
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

        // 3. Проверка на дубликаты
        const existing = await db.collection('users').where('telegram_id', '==', tgId).get();
        if (!existing.empty) {
            // Если найден юзер и это НЕ тот же самый аккаунт
            if (existing.docs[0].id !== uid) {
                await ctx.reply("❌ Этот Telegram аккаунт уже привязан к другому профилю на сайте.");
                return;
            }
        }

        // 4. Запись в профиль юзера
        console.log(`[LINK DEBUG] Linking TG ${tgId} to UID ${uid}`);
        await db.collection('users').doc(uid).update({
            telegram_id: tgId,
            telegram_username: username
        });

        // 5. Удаляем использованный код
        await codeRef.delete();

        await ctx.reply("✅ Аккаунт успешно привязан! Теперь вы можете участвовать в дуэлях.");

    } catch (error: any) {
        console.error("[LINK CRITICAL ERROR]:", error);
        await ctx.reply(`⚠️ Системная ошибка при привязке: ${error.message}`);
    }
});


// ==================================================================
// ⚔️ СИСТЕМА ДУЭЛЕЙ (/duel)
// ==================================================================

bot.command("duel", async (ctx) => {
    const args = ctx.message.text.split(' ');
    const betStr = args[1];

    if (!betStr || isNaN(parseInt(betStr))) {
        await ctx.reply("⚔️ Формат: /duel [ставка]\nПример: /duel 100");
        return;
    }

    const bet = parseInt(betStr);
    if (bet < 10) { await ctx.reply("Минимальная ставка: 10 PC."); return; }
    if (bet > 10000) { await ctx.reply("Максимальная ставка: 10000 PC."); return; }

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

// Обработка кнопки "ПРИНЯТЬ"
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
                t.update(initiatorRef, { casino_credits: (iData.casino_credits || 0) - bet + winAmount });
                t.update(acceptorRef, { casino_credits: (aData.casino_credits || 0) - bet });
            } else {
                winnerName = aData.username;
                loserName = iData.username;
                t.update(acceptorRef, { casino_credits: (aData.casino_credits || 0) - bet + winAmount });
                t.update(initiatorRef, { casino_credits: (iData.casino_credits || 0) - bet });
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
        console.error("Duel Error:", e);
        if (e.message === "Initiator broke") {
            await ctx.reply("🚫 Дуэль отменена: У инициатора закончились деньги.");
        } else if (e.message === "Acceptor broke") {
            await ctx.reply(`🚫 @${ctx.from.username}, у вас недостаточно средств для принятия вызова!`);
        } else {
            await ctx.reply("Сбой системы. Дуэль аннулирована.");
        }
    }
});

// ==================================================================
// 🛡️ LOCKDOWN & ANTI-RAID
// ==================================================================

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
                    console.error(`Failed to autoban ${member.id}`, e);
                }
            }
            return;
        }
    } catch (e) {
        console.error("Lockdown check error:", e);
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
        console.error("Captcha Error:", e);
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
        try { await ctx.deleteMessage(); } catch (e) {}
        await ctx.reply(`Добро пожаловать в Сеть, ${ctx.from.first_name}!`);
    } catch (e) {
        console.error("Verification Error:", e);
    }
});

// ==================================================================
// 🔨 АДМИНИСТРИРОВАНИЕ (BAN/WARN/MUTE)
// ==================================================================

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
    const timeStr = args[1]; // 10m, 1h

    if (!timeStr) {
        await ctx.reply("⚠️ Укажите время: 10m (минуты), 2h (часы), 1d (дни).");
        return;
    }

    // Здесь теперь используется parseTime
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

export const telegramWebhook = onRequest(
    { secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request, response) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            response.status(500).send("No Token");
            return;
        }
        try {
            await bot.handleUpdate(request.body, response);
        } catch (e) {
            console.error("Bot Error:", e);
            response.status(200).send("Error handled");
        }
    }
);