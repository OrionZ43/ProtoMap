// src/routes/api/og/profile/+server.ts
//
// Node runtime — читает Firestore напрямую, рисует OG-карточку профиля.
// Защита от спама — rate limiting в vercel.json (20 req/min per IP).

import { ImageResponse } from '@vercel/og';
import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { RequestHandler } from '@sveltejs/kit';
import React from 'react';

// Node runtime (по умолчанию) — позволяет использовать firebase-admin
// export const config = { runtime: 'edge' }; // НЕ нужен

export const GET: RequestHandler = async ({ url }) => {
    const uid = url.searchParams.get('uid');

    if (!uid || uid.length > 128) {
        return new Response('Missing or invalid uid', { status: 400 });
    }

    // ── Данные профиля из Firestore ──────────────────────────────────────────
    let username  = 'Protogen';
    let status: string | null = null;
    let avatarUrl: string | null = null;

    try {
        const doc = await firestoreAdmin.collection('users').doc(uid).get();
        if (doc.exists) {
            const d = doc.data()!;
            username  = d.username   ?? 'Protogen';
            status    = d.status     ?? d.about_me?.substring(0, 90) ?? null;
            avatarUrl = d.avatar_url ?? null;
        }
    } catch {
        // Firestore недоступен — рисуем заглушку с дефолтными данными
    }

    // ── Нормализация аватарки ────────────────────────────────────────────────
    const resolvedAvatar = (() => {
        if (!avatarUrl) {
            return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username)}`;
        }
        if (avatarUrl.includes('cloudinary.com')) {
            const parts = avatarUrl.split('/upload/');
            if (parts.length === 2) {
                return `${parts[0]}/upload/f_auto,q_auto,w_256,h_256,c_fill,g_face/${parts[1]}`;
            }
        }
        if (avatarUrl.includes('googleusercontent.com')) {
            return avatarUrl.split('=')[0] + '=s256-c';
        }
        return avatarUrl;
    })();

    // ── Шрифты (Chakra Petch с Google Fonts) ────────────────────────────────
    const [fontRegular, fontBold] = await Promise.all([
        fetch('https://fonts.gstatic.com/s/chakrapetch/v11/cIf6MapFe0ERKmTZ5QN9RuJ0qvA.woff')
            .then(r => r.arrayBuffer()).catch(() => null),
        fetch('https://fonts.gstatic.com/s/chakrapetch/v11/cIf9MapFe0ERKmTZ5QN9RuJ0ioSP.woff')
            .then(r => r.arrayBuffer()).catch(() => null),
    ]);

    const fonts: ConstructorParameters<typeof ImageResponse>[1]['fonts'] = [];
    if (fontRegular) fonts.push({ name: 'Chakra Petch', data: fontRegular, weight: 400, style: 'normal' });
    if (fontBold)    fonts.push({ name: 'Chakra Petch', data: fontBold,    weight: 700, style: 'normal' });
    const fontFamily = fonts.length > 0 ? 'Chakra Petch, sans-serif' : 'sans-serif';

    // ── Цветовая палитра ─────────────────────────────────────────────────────
    const C = {
        bg:         '#080b14',
        cyan:       '#00d4ff',
        cyanDim:    '#00a8cc',
        purple:     '#7b2fff',
        text:       '#e2e8f0',
        textMuted:  '#7a8aaa',
        gridLine:   'rgba(0, 212, 255, 0.06)',
        glowCyan:   'rgba(0, 212, 255, 0.35)',
        glowPurple: 'rgba(123, 47, 255, 0.25)',
    } as const;

    const h = React.createElement;
    const statusText = status && status.length > 90
        ? status.substring(0, 87) + '…'
        : status;

    const image = new ImageResponse(
        h('div', {
            style: {
                width: '1200px', height: '630px',
                display: 'flex', flexDirection: 'column',
                backgroundColor: C.bg, fontFamily,
                position: 'relative', overflow: 'hidden',
            },
        },

        // ── Сетка ───────────────────────────────────────────────────────────
        h('svg', {
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
            viewBox: '0 0 1200 630',
        },
            ...[0,1,2,3,4,5,6,7,8,9].map(i =>
                h('line', { key: `h${i}`, x1: 0, y1: i * 70, x2: 1200, y2: i * 70, stroke: C.gridLine, strokeWidth: 1 })
            ),
            ...[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i =>
                h('line', { key: `v${i}`, x1: i * 100, y1: 0, x2: i * 100, y2: 630, stroke: C.gridLine, strokeWidth: 1 })
            ),
        ),

        // ── Угловые акценты ─────────────────────────────────────────────────
        h('div', { style: { position: 'absolute', top: 0, left: 0, width: '3px', height: '120px', background: `linear-gradient(to bottom, ${C.cyan}, transparent)` } }),
        h('div', { style: { position: 'absolute', top: 0, left: 0, width: '120px', height: '3px', background: `linear-gradient(to right, ${C.cyan}, transparent)` } }),
        h('div', { style: { position: 'absolute', bottom: 0, right: 0, width: '3px', height: '120px', background: `linear-gradient(to top, ${C.purple}, transparent)` } }),
        h('div', { style: { position: 'absolute', bottom: 0, right: 0, width: '120px', height: '3px', background: `linear-gradient(to left, ${C.purple}, transparent)` } }),

        // ── Фоновые свечения ────────────────────────────────────────────────
        h('div', { style: { position: 'absolute', top: '-80px', left: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: `radial-gradient(circle, ${C.glowCyan} 0%, transparent 65%)` } }),
        h('div', { style: { position: 'absolute', bottom: '-100px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: `radial-gradient(circle, ${C.glowPurple} 0%, transparent 65%)` } }),

        // ── Основной контент ────────────────────────────────────────────────
        h('div', {
            style: {
                position: 'relative', display: 'flex', flexDirection: 'row',
                alignItems: 'center', flex: 1, padding: '60px 80px', gap: '64px',
            },
        },

            // Аватар
            h('div', {
                style: {
                    position: 'relative', flexShrink: 0,
                    width: '220px', height: '220px', borderRadius: '50%',
                    boxShadow: [
                        `0 0 0 3px ${C.cyan}`,
                        `0 0 30px 8px ${C.glowCyan}`,
                        `0 0 80px 20px rgba(0,212,255,0.15)`,
                    ].join(', '),
                }
            },
                h('img', {
                    src: resolvedAvatar, width: 220, height: 220,
                    style: { borderRadius: '50%', objectFit: 'cover', width: '220px', height: '220px' }
                }),
                h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid rgba(0,212,255,0.4)` } }),
            ),

            // Текстовый блок
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minWidth: 0 } },

                // Username с градиентом
                h('div', {
                    style: {
                        fontSize: '72px', fontWeight: 700,
                        lineHeight: 1.1, letterSpacing: '-1px',
                        backgroundImage: `linear-gradient(135deg, #ffffff 0%, ${C.cyan} 100%)`,
                        backgroundClip: 'text', color: 'transparent',
                    }
                }, username),

                // Разделительная линия
                h('div', { style: { width: '80px', height: '3px', background: `linear-gradient(to right, ${C.cyan}, ${C.purple})`, borderRadius: '2px' } }),

                // Статус / описание
                statusText
                    ? h('div', {
                        style: {
                            fontSize: '28px', fontWeight: 400,
                            color: C.textMuted, lineHeight: 1.5, maxWidth: '600px',
                        }
                    }, statusText)
                    : null,
            ),
        ),

        // ── Нижняя панель ───────────────────────────────────────────────────
        h('div', {
            style: {
                position: 'relative', display: 'flex', flexDirection: 'row',
                alignItems: 'center', justifyContent: 'space-between',
                padding: '0 80px 36px',
            }
        },
            // URL профиля
            h('div', {
                style: { fontSize: '22px', color: C.cyanDim, fontWeight: 400, letterSpacing: '0.5px' }
            }, `proto-map.vercel.app/u/${username}`),

            // ProtoMap wordmark
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                h('div', { style: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: C.cyan, boxShadow: `0 0 8px ${C.cyan}` } }),
                h('div', { style: { fontSize: '26px', fontWeight: 700, color: C.text, letterSpacing: '2px' } },
                    'PROTO', h('span', { style: { color: C.cyan } }, 'MAP')
                ),
            ),
        ),
    ),
        {
            width: 1200, height: 630, fonts,
            headers: {
                // Кешируем на 1 час на CDN — баланс между актуальностью и нагрузкой
                'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
                'Content-Type':  'image/png',
            },
        }
    );

    return image;
};