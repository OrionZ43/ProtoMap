/**
 * Справочные команды: /stats, /help, /version, /ping, /whining.
 */

import { Telegraf } from "telegraf";
import { db } from "../core/bot";
import { hasFeature } from "../core/registry";
import { isAdmin } from "../core/helpers";

export function register(bot: Telegraf): void {
    // ─── Команды — инфо ──────────────────────────────────────────────────────────
    bot.command('stats', async (ctx) => {
        console.log('[COMMAND] /stats called by', ctx.from.id);
        try {
            const chatMembersCount = await ctx.getChatMembersCount();
            const warnedUsers      = await db.collection('telegram_moderation').get();
            const totalWarns       = warnedUsers.docs.reduce((sum, doc) => sum + (doc.data().warns || 0), 0);

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
        await ctx.reply(
            `🤖 **КОМАНДЫ БОТА**\n\n` +
            `**Для всех:**\n` +
            `/link [код] — Привязать Telegram к аккаунту\n` +
            `/duel [ставка] — Вызвать кого-то на дуэль\n` +
            `/stats — Статистика чата\n` +
            // Показываем только там, где команда реально работает, иначе в чате
            // ProtoMap люди будут звать её и думать, что бот сломался.
            (hasFeature(ctx.chat?.id, 'transcribe')
                ? `/text — Расшифровать голосовое или кружок (reply)\n` +
                  `/uwufier — То же, но няшно (reply)\n`
                : '') +
            (hasFeature(ctx.chat?.id, 'download')
                ? `/spoiler [ссылка] — Скачать под спойлером\n` +
                  `/dlstatus — Жива ли качалка\n`
                : '') +
            `/help — Эта справка\n` +
            `/ping — Проверка задержки\n` +
            `/version — Версия бота\n\n` +
            `**Для администраторов:**\n` +
            `/warn — Предупреждение (reply)\n` +
            `/unwarn — Снять предупреждение\n` +
            `/mute [время] — Заглушить (10m, 2h, 1d)\n` +
            `/unmute — Снять мут\n` +
            `/ban — Изгнать из чата\n` +
            `/unban [ID] — Разбанить\n` +
            `/lockdown [on/off] — Режим карантина\n` +
            `/whining — Статистика попыток обхода`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('version', async (ctx) => {
        console.log('[COMMAND] /version called');
        await ctx.reply(
            `⚙️ **ВЕРСИЯ СИСТЕМЫ**\n\n` +
            `🤖 ProtoMap Guardian Bot\n` +
            `📦 v2.1.0 (Turnstile Edition)\n` +
            `🏗️ Build: ${new Date().toISOString().split('T')[0]}\n` +
            `🔧 Framework: Telegraf + Firebase\n` +
            `💾 DB: Firestore\n` +
            `🛡️ Anti-bot: Cloudflare Turnstile\n` +
            `⚡ Status: Operational\n\n` +
            `> Coded with <3 by Orion`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('ping', async (ctx) => {
        console.log('[COMMAND] /ping called');
        const start = Date.now();
        const msg   = await ctx.reply('🏓 Pong!');
        const latency = Date.now() - start;
        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id, msg.message_id, undefined,
                `🏓 Pong!\n⏱️ Задержка: ${latency}ms`
            );
        } catch (e) { console.log('[PING] Edit failed:', e); }
    });

    bot.command('whining', async (ctx) => {
        if (!(await isAdmin(ctx))) return;
        console.log('[COMMAND] /whining stats requested');
        try {
            const logs = await db.collection('whining_attempts')
                .orderBy('timestamp', 'desc').limit(50).get();

            if (logs.empty) {
                await ctx.reply('📊 Попыток обхода не обнаружено. Все тихо! ✅');
                return;
            }

            const triggerCount: { [key: string]: number } = {};
            logs.docs.forEach(doc => {
                const t = doc.data().trigger;
                triggerCount[t] = (triggerCount[t] || 0) + 1;
            });

            const sorted = Object.entries(triggerCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
            let message  = '📊 **ТОП-10 ПОПЫТОК ОБХОДА:**\n\n';
            sorted.forEach(([trigger, count], i) => { message += `${i + 1}. \`${trigger}\` — ${count}x\n`; });
            message += `\n📝 Всего попыток: ${logs.size}`;
            await ctx.reply(message, { parse_mode: 'Markdown' });

        } catch (e) {
            console.error('[WHINING] Stats error:', e);
            await ctx.reply('Ошибка получения статистики.');
        }
    });
}
