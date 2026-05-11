// src/routes/api/og/+server.ts
//
// Один эндпоинт для всех статичных страниц.
// ?page=map | referral | news | messages

import { ImageResponse } from '@vercel/og';
import type { RequestHandler } from '@sveltejs/kit';

// Локальный хелпер вместо React.createElement — react не нужен как зависимость
const h = (type: any, props: any, ...children: any[]): any => {
    const flat = children.flat(Infinity).filter((c) => c != null);
    return {
        type,
        props: {
            ...props,
            children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
        },
    };
};

const PAGES = ['map', 'referral', 'news', 'messages'] as const;
type PageType = typeof PAGES[number];

// ── Тексты для каждой страницы ───────────────────────────────────────────────
const PAGE_CONFIG: Record<PageType, { title: string; subtitle: string; icon: string }> = {
    map: {
        title:    'ProtoMap',
        subtitle: 'Интерактивная карта сообщества протогенов',
        icon:     '◈',
    },
    referral: {
        title:    'Реферальная\nпрограмма',
        subtitle: 'Пригласи друга — оба получат награду',
        icon:     '✦',
    },
    news: {
        title:    'Новости',
        subtitle: 'Обновления и анонсы ProtoMap',
        icon:     '>_',
    },
    messages: {
        title:    'Сообщения',
        subtitle: 'Личные переписки внутри ProtoMap',
        icon:     '◎',
    },
};

export const GET: RequestHandler = async ({ url }) => {
    const pageParam = url.searchParams.get('page') ?? '';
    const page: PageType = PAGES.includes(pageParam as PageType)
        ? (pageParam as PageType)
        : 'map';

    const cfg = PAGE_CONFIG[page];

    // ── Шрифты ──────────────────────────────────────────────────────────────
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

    // ── Палитра ──────────────────────────────────────────────────────────────
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

    // ── Уникальные декоративные элементы для каждой страницы ────────────────
    const pageDecoration = () => {
        if (page === 'map') {
            const pins = [
                [200, 180], [420, 260], [310, 350], [560, 200],
                [480, 380], [650, 300], [720, 160], [580, 430],
            ] as [number, number][];
            return h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
                ...pins.map(([x, y], i) =>
                    h('div', {
                        key: i,
                        style: {
                            position: 'absolute', left: `${x}px`, top: `${y}px`,
                            width: i === 2 ? '16px' : '10px',
                            height: i === 2 ? '16px' : '10px',
                            borderRadius: '50%',
                            backgroundColor: i === 2 ? C.cyan : C.purple,
                            boxShadow: `0 0 ${i === 2 ? 16 : 8}px ${i === 2 ? C.cyan : C.purple}`,
                            opacity: i === 2 ? 1 : 0.6,
                        }
                    })
                ),
                h('svg', {
                    style: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
                    viewBox: '0 0 1200 630',
                },
                    h('line', { x1: 200, y1: 180, x2: 310, y2: 350, stroke: C.cyan, strokeWidth: 1, opacity: 0.2 }),
                    h('line', { x1: 310, y1: 350, x2: 480, y2: 380, stroke: C.cyan, strokeWidth: 1, opacity: 0.2 }),
                    h('line', { x1: 420, y1: 260, x2: 560, y2: 200, stroke: C.purple, strokeWidth: 1, opacity: 0.2 }),
                    h('line', { x1: 560, y1: 200, x2: 720, y2: 160, stroke: C.purple, strokeWidth: 1, opacity: 0.2 }),
                ),
            );
        }

        if (page === 'referral') {
            const stars = [
                { x: 120, y: 200, size: 60, opacity: 0.15 },
                { x: 750, y: 120, size: 40, opacity: 0.12 },
                { x: 900, y: 350, size: 50, opacity: 0.1  },
            ];
            return h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
                ...stars.map((s, i) =>
                    h('div', {
                        key: i,
                        style: {
                            position: 'absolute',
                            left: `${s.x}px`, top: `${s.y}px`,
                            fontSize: `${s.size}px`, lineHeight: 1,
                            color: C.cyan, opacity: s.opacity,
                            fontFamily,
                        }
                    }, '✦')
                )
            );
        }

        if (page === 'news') {
            const lines = [
                '> ProtoMap v2.4.1',
                '> Карта обновлена',
                '> +247 протогенов',
                '> Новый биом: Ocean',
                '> ...',
            ];
            return h('div', {
                style: {
                    position: 'absolute', right: '80px', top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    opacity: 0.12, fontFamily,
                }
            },
                ...lines.map((line, i) =>
                    h('div', {
                        key: i,
                        style: { fontSize: '22px', color: C.cyan, letterSpacing: '1px', fontWeight: 400 }
                    }, line)
                )
            );
        }

        if (page === 'messages') {
            return h('div', { style: { position: 'absolute', right: '90px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '20px', opacity: 0.1 } },
                h('div', {
                    style: {
                        backgroundColor: C.cyan, borderRadius: '18px 18px 4px 18px',
                        padding: '16px 24px', fontSize: '20px', color: C.bg,
                        maxWidth: '260px', fontFamily,
                    }
                }, 'Привет! Ты уже на карте?'),
                h('div', {
                    style: {
                        backgroundColor: C.purple, borderRadius: '18px 18px 18px 4px',
                        padding: '16px 24px', fontSize: '20px', color: C.text,
                        maxWidth: '260px', alignSelf: 'flex-end', fontFamily,
                    }
                }, 'Да, только что добавился!'),
            );
        }

        return null;
    };

    const image = new ImageResponse(
        h('div', {
            style: {
                width: '1200px', height: '630px',
                display: 'flex', flexDirection: 'column',
                backgroundColor: C.bg, fontFamily,
                position: 'relative', overflow: 'hidden',
            },
        },

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

        h('div', { style: { position: 'absolute', top: 0, left: 0, width: '3px', height: '120px', background: `linear-gradient(to bottom, ${C.cyan}, transparent)` } }),
        h('div', { style: { position: 'absolute', top: 0, left: 0, width: '120px', height: '3px', background: `linear-gradient(to right, ${C.cyan}, transparent)` } }),
        h('div', { style: { position: 'absolute', bottom: 0, right: 0, width: '3px', height: '120px', background: `linear-gradient(to top, ${C.purple}, transparent)` } }),
        h('div', { style: { position: 'absolute', bottom: 0, right: 0, width: '120px', height: '3px', background: `linear-gradient(to left, ${C.purple}, transparent)` } }),

        h('div', { style: { position: 'absolute', top: '-80px', left: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: `radial-gradient(circle, ${C.glowCyan} 0%, transparent 65%)` } }),
        h('div', { style: { position: 'absolute', bottom: '-100px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: `radial-gradient(circle, ${C.glowPurple} 0%, transparent 65%)` } }),

        pageDecoration(),

        h('div', {
            style: {
                position: 'relative', display: 'flex', flexDirection: 'column',
                justifyContent: 'center', flex: 1, padding: '60px 80px', gap: '24px',
                maxWidth: page === 'map' ? '100%' : '680px',
            },
        },
            h('div', {
                style: {
                    fontSize: '52px', lineHeight: 1,
                    color: C.cyan,
                    textShadow: `0 0 20px ${C.cyan}`,
                    marginBottom: '8px',
                }
            }, cfg.icon),

            h('div', {
                style: {
                    fontSize: cfg.title.includes('\n') ? '64px' : '80px',
                    fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px',
                    backgroundImage: `linear-gradient(135deg, #ffffff 0%, ${C.cyan} 100%)`,
                    backgroundClip: 'text', color: 'transparent',
                    whiteSpace: 'pre-line',
                }
            }, cfg.title),

            h('div', { style: { width: '80px', height: '3px', background: `linear-gradient(to right, ${C.cyan}, ${C.purple})`, borderRadius: '2px' } }),

            h('div', {
                style: { fontSize: '28px', fontWeight: 400, color: C.textMuted, lineHeight: 1.5 }
            }, cfg.subtitle),
        ),

        h('div', {
            style: {
                position: 'relative', display: 'flex', flexDirection: 'row',
                alignItems: 'center', justifyContent: 'space-between',
                padding: '0 80px 36px',
            }
        },
            h('div', { style: { fontSize: '22px', color: C.cyanDim, fontWeight: 400, letterSpacing: '0.5px' } },
                'proto-map.vercel.app'
            ),
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
                'Cache-Control': 'public, max-age=604800, s-maxage=604800',
                'Content-Type':  'image/png',
            },
        }
    );

    return image;
};