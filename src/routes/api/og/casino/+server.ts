// src/routes/api/og/casino/+server.ts
//
// OG-картинки для всех страниц The Glitch Pit.
// ?page=lobby | coin | crash | slots | roulette | shop | inventory

import { ImageResponse } from '@vercel/og';
import type { RequestHandler } from '@sveltejs/kit';
import React from 'react';

const PAGES = ['lobby', 'coin', 'crash', 'slots', 'roulette', 'shop', 'inventory'] as const;
type PageType = typeof PAGES[number];

const PAGE_CONFIG: Record<PageType, { title: string; subtitle: string; icon: string; accent: string }> = {
    lobby: {
        title:    'The Glitch Pit',
        subtitle: 'Казино протогенов. Играй, побеждай, теряй всё.',
        icon:     '⚡',
        accent:   '#fcee0a',
    },
    coin: {
        title:    'Coin Flip',
        subtitle: 'Орёл или решка — 50/50 на твои кредиты.',
        icon:     '◉',
        accent:   '#fcee0a',
    },
    crash: {
        title:    'Data Uplink',
        subtitle: 'Выводи вовремя — или потеряешь всё при краше.',
        icon:     '>_',
        accent:   '#00f3ff',
    },
    slots: {
        title:    'Proto-Slots',
        subtitle: 'Три символа. Один джекпот. Удача решает.',
        icon:     '◈◈◈',
        accent:   '#bd00ff',
    },
    roulette: {
        title:    'Volt Deadlock',
        subtitle: 'Плазменная рулетка один на один с Орионом.',
        icon:     '⊹',
        accent:   '#ff003c',
    },
    shop: {
        title:    'Магазин',
        subtitle: 'Рамки, фоны и эксклюзивные предметы за PC.',
        icon:     '◎',
        accent:   '#fcee0a',
    },
    inventory: {
        title:    'Инвентарь',
        subtitle: 'Твои предметы. Экипируй и покажи себя.',
        icon:     '▣',
        accent:   '#39ff14',
    },
};

export const GET: RequestHandler = async ({ url }) => {
    const pageParam = url.searchParams.get('page') ?? '';
    const page: PageType = PAGES.includes(pageParam as PageType)
        ? (pageParam as PageType)
        : 'lobby';

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

    const accent  = cfg.accent;
    const accent2 = page === 'roulette' ? '#ff6a00'
                  : page === 'crash'    ? '#bd00ff'
                  : page === 'slots'    ? '#fcee0a'
                  : '#ff003c';

    const C = {
        bg:          '#050508',
        surface:     'rgba(10,10,15,0.9)',
        text:        '#e2e8f0',
        textMuted:   '#6b7280',
        gridLine:    `rgba(255,255,255,0.03)`,
        glowAccent:  `${accent}55`,
        glowAccent2: `${accent2}33`,
    } as const;

    const h = React.createElement;

    // ── Декор для каждой страницы ────────────────────────────────────────────
    const decoration = () => {
        if (page === 'lobby') {
            // Карты игр в правой части
            const cards = [
                { label: 'COIN FLIP', x: 780, y: 120, rot: '-8deg' },
                { label: 'DATA UPLINK', x: 920, y: 200, rot: '5deg' },
                { label: 'PROTO-SLOTS', x: 840, y: 330, rot: '-3deg' },
            ];
            return h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
                ...cards.map((c, i) =>
                    h('div', {
                        key: i,
                        style: {
                            position: 'absolute',
                            left: `${c.x}px`, top: `${c.y}px`,
                            padding: '8px 16px',
                            border: `1px solid ${accent}44`,
                            borderRadius: '6px',
                            background: `rgba(0,0,0,0.6)`,
                            fontSize: '16px',
                            fontFamily,
                            color: accent,
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            transform: `rotate(${c.rot})`,
                            opacity: 0.4,
                        }
                    }, c.label)
                )
            );
        }

        if (page === 'slots') {
            // Три символа барабанов
            const syms = ['◈', '♦', '◈'];
            return h('div', {
                style: {
                    position: 'absolute', right: '100px', top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex', gap: '20px',
                    opacity: 0.12, fontFamily,
                }
            },
                ...syms.map((s, i) =>
                    h('div', {
                        key: i,
                        style: {
                            width: '100px', height: '120px',
                            border: `2px solid ${accent}`,
                            borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '48px', color: accent,
                        }
                    }, s)
                )
            );
        }

        if (page === 'crash') {
            // Кривая краша
            return h('svg', {
                style: {
                    position: 'absolute', right: 0, top: 0,
                    width: '600px', height: '100%', opacity: 0.1,
                },
                viewBox: '0 0 600 630',
            },
                h('path', {
                    d: 'M 0 630 Q 200 630 350 250 L 480 60',
                    stroke: accent, strokeWidth: 4,
                    fill: 'none',
                    strokeLinecap: 'round',
                }),
                h('circle', { cx: 480, cy: 60, r: 12, fill: accent }),
                // «взрыв»
                h('circle', { cx: 530, cy: 40, r: 30, stroke: '#ff003c', strokeWidth: 2, fill: 'none', opacity: 0.5 }),
                h('circle', { cx: 530, cy: 40, r: 18, stroke: '#ff003c', strokeWidth: 2, fill: 'none', opacity: 0.3 }),
            );
        }

        if (page === 'roulette') {
            // HP-точки
            const dots = Array(5).fill(null);
            return h('div', {
                style: {
                    position: 'absolute', right: '120px', top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex', flexDirection: 'column', gap: '40px',
                    opacity: 0.15,
                }
            },
                h('div', { style: { display: 'flex', gap: '10px' } },
                    ...dots.map((_, i) =>
                        h('div', {
                            key: i,
                            style: {
                                width: '20px', height: '20px',
                                borderRadius: '3px',
                                background: i < 3 ? '#ff003c' : 'rgba(255,255,255,0.1)',
                                boxShadow: i < 3 ? '0 0 8px #ff003c' : 'none',
                            }
                        })
                    )
                ),
                h('div', { style: { display: 'flex', gap: '10px' } },
                    ...dots.map((_, i) =>
                        h('div', {
                            key: i,
                            style: {
                                width: '20px', height: '20px',
                                borderRadius: '3px',
                                background: i < 4 ? '#00f0ff' : 'rgba(255,255,255,0.1)',
                                boxShadow: i < 4 ? '0 0 8px #00f0ff' : 'none',
                            }
                        })
                    )
                ),
            );
        }

        if (page === 'coin') {
            // Монета
            return h('div', {
                style: {
                    position: 'absolute', right: '120px', top: '50%',
                    transform: 'translateY(-50%)',
                    width: '180px', height: '180px',
                    borderRadius: '50%',
                    border: `4px solid ${accent}`,
                    boxShadow: `0 0 40px ${accent}44, 0 0 80px ${accent}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '72px',
                    opacity: 0.2,
                    fontFamily,
                    color: accent,
                }
            }, '◉');
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

        // Сетка (тоньше, почти невидимая)
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

        // Угловые акценты — используем accent цвет страницы
        h('div', { style: { position: 'absolute', top: 0, left: 0, width: '3px', height: '120px', background: `linear-gradient(to bottom, ${accent}, transparent)` } }),
        h('div', { style: { position: 'absolute', top: 0, left: 0, width: '120px', height: '3px', background: `linear-gradient(to right, ${accent}, transparent)` } }),
        h('div', { style: { position: 'absolute', bottom: 0, right: 0, width: '3px', height: '120px', background: `linear-gradient(to top, ${accent2}, transparent)` } }),
        h('div', { style: { position: 'absolute', bottom: 0, right: 0, width: '120px', height: '3px', background: `linear-gradient(to left, ${accent2}, transparent)` } }),

        // Свечения
        h('div', { style: { position: 'absolute', top: '-100px', left: '-100px', width: '600px', height: '600px', borderRadius: '50%', background: `radial-gradient(circle, ${C.glowAccent} 0%, transparent 65%)` } }),
        h('div', { style: { position: 'absolute', bottom: '-100px', right: '-100px', width: '500px', height: '500px', borderRadius: '50%', background: `radial-gradient(circle, ${C.glowAccent2} 0%, transparent 65%)` } }),

        // Декор
        decoration(),

        // Основной контент
        h('div', {
            style: {
                position: 'relative', display: 'flex', flexDirection: 'column',
                justifyContent: 'center', flex: 1, padding: '60px 80px', gap: '20px',
                maxWidth: '720px',
            },
        },
            // Тег казино
            h('div', {
                style: {
                    fontSize: '18px', fontWeight: 400, letterSpacing: '0.3em',
                    color: `${accent}99`,
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                }
            }, '[ THE GLITCH PIT ]'),

            // Иконка
            h('div', {
                style: {
                    fontSize: '52px', lineHeight: 1,
                    color: accent,
                    textShadow: `0 0 24px ${accent}`,
                    marginBottom: '4px',
                }
            }, cfg.icon),

            // Заголовок
            h('div', {
                style: {
                    fontSize: '80px', fontWeight: 700,
                    lineHeight: 1.0, letterSpacing: '-1px',
                    backgroundImage: `linear-gradient(135deg, #ffffff 0%, ${accent} 100%)`,
                    backgroundClip: 'text', color: 'transparent',
                }
            }, cfg.title),

            // Разделитель
            h('div', { style: { width: '80px', height: '3px', background: `linear-gradient(to right, ${accent}, ${accent2})`, borderRadius: '2px' } }),

            // Подзаголовок
            h('div', {
                style: { fontSize: '28px', fontWeight: 400, color: C.textMuted, lineHeight: 1.5 }
            }, cfg.subtitle),
        ),

        // Нижняя панель
        h('div', {
            style: {
                position: 'relative', display: 'flex', flexDirection: 'row',
                alignItems: 'center', justifyContent: 'space-between',
                padding: '0 80px 36px',
            }
        },
            h('div', { style: { fontSize: '22px', color: `${accent}88`, fontWeight: 400, letterSpacing: '0.5px' } },
                'proto-map.vercel.app/casino'
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                h('div', { style: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: accent, boxShadow: `0 0 8px ${accent}` } }),
                h('div', { style: { fontSize: '26px', fontWeight: 700, color: C.text, letterSpacing: '2px' } },
                    'THE ', h('span', { style: { color: accent } }, 'GLITCH PIT')
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