// src/routes/api/audio-proxy/+server.ts
// Проксирует аудиофайлы из Firebase Storage с нужными CORS заголовками
// чтобы Web Audio API мог анализировать через OfflineAudioContext

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const audioUrl = url.searchParams.get('url');
    if (!audioUrl) {
        return new Response('Missing url param', { status: 400 });
    }

    // Разрешаем только наш Firebase Storage
    if (!audioUrl.startsWith('https://firebasestorage.googleapis.com/')) {
        return new Response('Forbidden', { status: 403 });
    }

    const res = await fetch(audioUrl, {
        headers: { 'Range': 'bytes=0-' } // запрашиваем полный файл, не partial content
    });
    // Firebase может вернуть 206, это нормально — у нас весь файл
    if (!res.ok && res.status !== 206) {
        return new Response('Upstream error', { status: res.status });
    }


    const contentType = res.headers.get('content-type') ?? 'audio/webm';
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
        headers: {
            'Content-Type':                contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control':               'public, max-age=86400',
        },
    });
};