import { onRequest } from "firebase-functions/v2/https";
import { Telegraf } from "telegraf";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN || "");

// ============================================
// ТЕСТОВЫЕ КОМАНДЫ (МИНИМУМ)
// ============================================

bot.command('test', async (ctx) => {
    console.log('[TEST] Command /test called by', ctx.from.id);
    await ctx.reply('✅ Бот работает! Команды доходят!');
});

bot.command('stats', async (ctx) => {
    console.log('[STATS] Command called');
    await ctx.reply('📊 Статистика (тест):\nВсё работает!');
});

bot.command('help', async (ctx) => {
    console.log('[HELP] Command called');
    await ctx.reply('🤖 Помощь (тест):\n/test\n/stats\n/help\n/ping');
});

bot.command('ping', async (ctx) => {
    console.log('[PING] Command called');
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
        console.error('Edit error:', e);
    }
});

// Триггер на текст
bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Пропускаем команды
    if (text.startsWith('/')) {
        console.log('[TEXT] Skipping command:', text);
        return;
    }

    // Тестовый триггер
    if (text.toLowerCase().includes('тест')) {
        console.log('[TRIGGER] Test word detected');
        await ctx.reply('✅ Триггер сработал!');
    }
});

console.log('✅ Bot handlers registered');

export const telegramWebhook = onRequest(
    { secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request, response) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;

        if (!token) {
            console.error('❌ NO BOT TOKEN!');
            response.status(500).send("No Token");
            return;
        }

        console.log('📥 Webhook received update');

        try {
            await bot.handleUpdate(request.body, response);
            console.log('✅ Update processed successfully');
        } catch (e) {
            console.error("❌ Bot Error:", e);
            response.status(200).send("Error handled");
        }
    }
);