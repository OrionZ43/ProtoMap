import { describe, expect, it } from 'vitest';
import { aggregateDay, bigMoves, bonusBreakdown, composeBrief, curvePath, dayKey, dayStart, gameBreakdown, groupCounts, minskHour, segments, topActors, type DayEntry, type Translate } from './day';

const at = (iso: string) => Date.parse(iso);

function entry(over: Partial<DayEntry>): DayEntry {
    return { at: at('2026-10-20T10:00:00Z'), group: 'economy', kind: 'slots', uid: 'u1', delta: 0, alert: false, itemsAdded: [], ref: null, ...over };
}

describe('сутки по Минску', () => {
    it('день начинается в 00:00 по Минску, то есть в 21:00 UTC накануне', () => {
        expect(dayStart(at('2026-10-20T12:00:00Z'))).toBe(at('2026-10-19T21:00:00Z'));
        expect(dayKey(at('2026-10-20T20:59:59Z'))).toBe('2026-10-20');
        expect(dayKey(at('2026-10-20T21:00:00Z'))).toBe('2026-10-21');
    });

    it('час — минский', () => {
        expect(minskHour(at('2026-10-20T21:00:00Z'))).toBe(0);
        expect(minskHour(at('2026-10-20T13:41:00Z'))).toBe(16);
        expect(minskHour(at('2026-10-20T20:59:59Z'))).toBe(23);
    });
});

describe('aggregateDay', () => {
    it('итог казино — с его стороны: проигрыш игрока в плюс, выигрыш в минус', () => {
        const s = aggregateDay([
            entry({ kind: 'slots', delta: -50 }),
            entry({ kind: 'plinko', delta: 261 }),
            entry({ kind: 'crash_bet', delta: -100 }),
            entry({ kind: 'crash_cashout', delta: 150 })
        ]);
        expect(s.casinoNet).toBe(50 - 261 + 100 - 150);
        // Выплата краша — та же игра, раундов три.
        expect(s.rounds).toBe(3);
    });

    it('без игр итог — ноль, а не «−0»', () => {
        expect(Object.is(aggregateDay([entry({ group: 'content', kind: 'chat' })]).casinoNet, 0)).toBe(true);
    });

    it('дуэли и бонусы не входят в итог казино', () => {
        const s = aggregateDay([entry({ kind: 'duel', delta: 500 }), entry({ kind: 'daily_bonus', delta: 50 })]);
        expect(s.casinoNet).toBe(0);
        expect(s.bonuses).toBe(50);
    });

    it('покупки и самая покупаемая вещь', () => {
        const s = aggregateDay([
            entry({ kind: 'purchase', delta: -7500, itemsAdded: ['moon_night'] }),
            entry({ kind: 'purchase', delta: -7500, itemsAdded: ['moon_night'] }),
            entry({ kind: 'purchase', delta: -900, ref: 'pumpkin' })
        ]);
        expect(s.purchases).toBe(3);
        expect(s.topItem).toBe('moon_night');
    });

    it('люди, тревоги и часы', () => {
        const s = aggregateDay([
            entry({ uid: 'a', at: at('2026-10-20T13:10:00Z') }),
            entry({ uid: 'a', at: at('2026-10-20T13:50:00Z'), alert: true }),
            entry({ uid: 'b', group: 'content', kind: 'chat', at: at('2026-10-20T05:00:00Z') }),
            entry({ uid: null, group: 'account', kind: 'deleted' })
        ]);
        expect(s.events).toBe(4);
        expect(s.actors).toBe(2);
        expect(s.alerts).toBe(1);
        expect(s.hourly[16]).toBe(2);
        expect(s.hourly[8]).toBe(1);
        expect(s.hourly).toHaveLength(24);
    });
});

describe('composeBrief', () => {
    // Перевод-заглушка: ключ и значения, чтобы проверять сборку предложений.
    const tr: Translate = (key, o) => `${key.split('.').pop()}${o?.values && Object.keys(o.values).length ? JSON.stringify(o.values) : ''}`;
    const nf = new Intl.NumberFormat('en-US');
    const base = aggregateDay([]);

    it('тихий день', () => {
        expect(composeBrief({ visited: 0, online: 0, stats: base, topItemName: null, alerts24h: 0 }, tr, nf))
            .toBe('visited_none. games_none. alerts_none.');
    });

    it('день с играми, покупками и тревогами', () => {
        const stats = { ...base, rounds: 214, casinoNet: 4120, purchases: 6 };
        expect(composeBrief({ visited: 37, online: 4, stats, topItemName: 'Лунная ночь', alerts24h: 1 }, tr, nf)).toBe(
            'visited{"count":37}online{"count":4}. games{"count":214}casino_plus{"amount":"4,120"}. ' +
            'purchases{"count":6}purchases_top{"item":"Лунная ночь"}. alerts{"count":1}.'
        );
    });

    it('казино в минусе — сумма без знака, знак в словах', () => {
        const stats = { ...base, rounds: 2, casinoNet: -300 };
        expect(composeBrief({ visited: 1, online: 0, stats, topItemName: null, alerts24h: 0 }, tr, nf))
            .toContain('casino_minus{"amount":"300"}');
    });
});

describe('segments', () => {
    it('выделенные куски — между [[ и ]]', () => {
        expect(segments('Заходили [[9 человек]], в сети [[4]].')).toEqual([
            { text: 'Заходили ', mark: false },
            { text: '9 человек', mark: true },
            { text: ', в сети ', mark: false },
            { text: '4', mark: true },
            { text: '.', mark: false }
        ]);
    });

    it('текст без пометок — один кусок', () => {
        expect(segments('Тревог нет.')).toEqual([{ text: 'Тревог нет.', mark: false }]);
    });
});

describe('curvePath', () => {
    it('пик — на самой большой точке, сверху с отступом', () => {
        const c = curvePath([0, 2, 5, 1], 900, 150);
        expect(c.peak).toEqual({ x: 600, y: 14, index: 2, value: 5 });
        expect(c.line.startsWith('M0,142')).toBe(true);
        expect(c.area.endsWith('L900,150 L0,150 Z')).toBe(true);
    });

    it('пустой день — ровная линия у дна, без пика', () => {
        const c = curvePath([0, 0, 0], 900, 150);
        expect(c.peak).toBeNull();
        expect(c.line).not.toContain('NaN');
    });

    it('сглаживание не уходит ниже нуля', () => {
        const c = curvePath([0, 10, 0, 0], 300, 100);
        const ys = [...c.line.matchAll(/[ ,](-?\d+(?:\.\d+)?)(?= |$)/g)].map((m) => Number(m[1]));
        expect(Math.max(...ys)).toBeLessThanOrEqual(92);
    });
});

describe('подробности плиток', () => {
    const rows = [
        entry({ uid: 'a', kind: 'slots', delta: -50 }),
        entry({ uid: 'a', kind: 'slots', delta: 400 }),
        entry({ uid: 'b', kind: 'crash_bet', delta: -100 }),
        entry({ uid: 'b', kind: 'crash_cashout', delta: 250 }),
        entry({ uid: 'c', kind: 'plinko', delta: -30 }),
        entry({ uid: 'c', kind: 'daily_bonus', delta: 50 }),
        entry({ uid: 'a', kind: 'daily_bonus', delta: 50 }),
        entry({ uid: 'b', kind: 'referral_bonus', delta: 200 }),
        entry({ uid: 'a', group: 'content', kind: 'chat', delta: null })
    ].map((e, i) => ({ ...e, username: `user_${e.uid}`, id: String(i) }));

    it('игры: краш — ставка и выплата одной строкой, итог со стороны казино', () => {
        const g = Object.fromEntries(gameBreakdown(rows).map((r) => [r.game, r]));
        expect(g.slots).toEqual({ game: 'slots', rounds: 2, net: -350 });
        expect(g.crash).toEqual({ game: 'crash', rounds: 1, net: -150 });
        expect(g.plinko).toEqual({ game: 'plinko', rounds: 1, net: 30 });
        expect(Object.is(g.coinflip.net, 0)).toBe(true);
    });

    it('крупнейшие выигрыши и проигрыши — по отдельным событиям, бонусы не в счёт', () => {
        const m = bigMoves(rows, 2);
        expect(m.wins.map((e) => e.delta)).toEqual([400, 250]);
        expect(m.losses.map((e) => e.delta)).toEqual([-100, -50]);
    });

    it('бонусы по видам, крупные сверху', () => {
        expect(bonusBreakdown(rows)).toEqual([
            { kind: 'referral_bonus', count: 1, sum: 200 },
            { kind: 'daily_bonus', count: 2, sum: 100 }
        ]);
    });

    it('самые активные и группы', () => {
        const top = topActors(rows, 2);
        expect(top[0]).toEqual({ uid: 'a', username: 'user_a', count: 4, groups: { economy: 3, content: 1 } });
        expect(top).toHaveLength(2);
        expect(groupCounts(rows)).toEqual({ economy: 8, content: 1 });
    });
});
