/**
 * Расшифровка голосовых и кружков.
 *
 * Команды `/text` и `/uwufier` отличаются только промптом и иконкой — сама
 * расшифровка одна и та же. Автоматический режим при неудаче молчит, явный
 * вызов объясняет причину: человек ждёт ответа и должен его получить.
 *
 * Обе команды регистрируются ДО `bot.on('text')` из triggers — иначе Telegraf
 * до них не дойдёт.
 */

import { Telegraf } from "telegraf";
import { hasFeature } from "../core/registry";
import {
    transcribeVoice,
    listGeminiModels,
    DEFAULT_PROMPT,
    UWU_PROMPT,
    type TranscribeResult
} from "../gemini";

const TRANSCRIBE_ERRORS: Record<Exclude<TranscribeResult, { ok: true }>['reason'], string> = {
    too_long:        'Слишком длинное — расшифровываю до 5 минут.',
    too_big:         'Файл слишком большой.',
    no_key:          'Расшифровка не настроена.',
    download_failed: 'Не смог скачать файл из Telegram.',
    api_failed:      'Сервис расшифровки не ответил.',
    empty:           'Речь не распознана.',
    refused:         'Модель отказалась это обрабатывать.'
};

/** Лимит длины сообщения в Telegram — 4096 символов. */
const TG_MESSAGE_LIMIT = 4096;

async function replyWithTranscript(
    ctx: any,
    fileId: string,
    mime: string,
    duration: number,
    verbose: boolean,
    prompt?: string,
    icon = '🎙'
) {
    try {
        await ctx.sendChatAction('typing');
    } catch { /* необязательно, молча пропускаем */ }

    const result = await transcribeVoice(fileId, mime, duration, prompt);
    const replyTo = ctx.message?.message_id;

    if (!result.ok) {
        if (verbose) {
            // detail есть только у api_failed — это диагностика для разработчика,
            // а не для пользователя. Без неё причину сбоя не установить: логи
            // Cloud Functions через CLI доходят не всегда.
            const extra = result.detail ? '\n\n' + result.detail : '';
            await ctx.reply(`${icon} ${TRANSCRIBE_ERRORS[result.reason]}${extra}`, {
                reply_to_message_id: replyTo
            });
        } else {
            console.warn(`[TRANSCRIBE] Пропуск: ${result.reason}`);
        }
        return;
    }

    // Без parse_mode: в расшифровке произвольная речь пользователя, и любые
    // символы разметки либо сломают отправку, либо будут интерпретированы.
    const body = result.text.length > TG_MESSAGE_LIMIT - 4
        ? result.text.slice(0, TG_MESSAGE_LIMIT - 5) + '…'
        : result.text;

    await ctx.reply(`${icon} ${body}`, { reply_to_message_id: replyTo });
}

/**
 * Общая обвязка команд, работающих ответом на голосовое или кружок.
 * Отличаются только промптом и иконкой — сама расшифровка одна и та же.
 */
async function handleReplyCommand(ctx: any, prompt: string, icon: string) {
    // Ограничение то же, что у автоматического режима: голосовое уходит в
    // Gemini, а значит третьей стороне. Явный запрос этого не меняет — человек
    // просит расшифровать ЧУЖОЙ голос, а не свой.
    if (!hasFeature(ctx.chat?.id, 'transcribe')) return;

    const replied = ctx.message?.reply_to_message;
    if (!replied) {
        await ctx.reply('Ответь этой командой на голосовое или кружок.');
        return;
    }

    if (replied.voice) {
        await replyWithTranscript(
            ctx, replied.voice.file_id, replied.voice.mime_type || 'audio/ogg',
            replied.voice.duration ?? 0, true, prompt, icon
        );
    } else if (replied.video_note) {
        await replyWithTranscript(
            ctx, replied.video_note.file_id, 'video/mp4',
            replied.video_note.duration ?? 0, true, prompt, icon
        );
    } else {
        await ctx.reply('Это не голосовое и не кружок.');
    }
}

export function register(bot: Telegraf): void {
    // Список моделей, доступных ключу Gemini.
    //
    // Оставлено насовсем, хотя заводилось для разовой диагностики: с машины
    // разработчика этот запрос не проходит вообще — Gemini отвечает
    // «User location is not supported» на запросы из Беларуси. Спросить список
    // можно только у развёрнутой функции, а Google модели регулярно переименовывает
    // и снимает с поддержки. Один раз это уже стоило трёх деплоев вслепую.
    bot.command('models', async (ctx) => {
        if (!hasFeature(ctx.chat?.id, 'transcribe')) return;

        const result = await listGeminiModels();
        if (!Array.isArray(result)) {
            await ctx.reply('Не удалось получить список: ' + result.error);
            return;
        }
        const body = result.join('\n') || '(пусто)';
        await ctx.reply(body.slice(0, 3900));
    });

    bot.command('text', (ctx) => handleReplyCommand(ctx, DEFAULT_PROMPT, '🎙'));

    // Няшный режим. Работает не заменой букв на стороне бота, а другим промптом:
    // модель понимает, что сказано, и переписывает осмысленно. Первая версия была
    // набором регулярок (р→в, вставки «ня», заикание) — выброшена как заведомо
    // худшая: она портила текст, не считаясь с его содержанием.
    bot.command('uwufier', (ctx) => handleReplyCommand(ctx, UWU_PROMPT, '🌸'));

    // ─── 🆕 Расшифровка голосовых и кружков ──────────────────────────────────────
    //
    // Автоматически — только там, где включена возможность transcribe. Вручную — /text
    // ответом на сообщение, работает в любом разрешённом чате.
    //
    // Разница в поведении при ошибке сделана намеренно: автоматический режим при
    // неудаче молчит (иначе каждое неразборчивое голосовое порождало бы сообщение
    // об ошибке), а явный вызов /text объясняет, что пошло не так, — человек ждёт
    // ответа и должен его получить.

    bot.on('voice', async (ctx) => {
        if (!hasFeature(ctx.chat?.id, 'transcribe')) return;
        const voice = (ctx.message as any).voice;
        await replyWithTranscript(ctx, voice.file_id, voice.mime_type || 'audio/ogg', voice.duration ?? 0, false);
    });

    bot.on('video_note', async (ctx) => {
        if (!hasFeature(ctx.chat?.id, 'transcribe')) return;
        const note = (ctx.message as any).video_note;
        await replyWithTranscript(ctx, note.file_id, 'video/mp4', note.duration ?? 0, false);
    });
}
