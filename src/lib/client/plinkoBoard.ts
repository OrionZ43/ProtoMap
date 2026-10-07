// Доска Плинко: штырьки, лунки и шарики, которые проходят путь, выбранный сервером.
// Без фреймворка — доску можно собрать отдельно от страницы (превью, демо).
// Шарик исход не выбирает: путь приходит готовым, доска его только показывает.
//
// Движение — баллистика: между ударами шарик летит по параболе под действием
// тяжести. Каждый отскок рассчитан так, чтобы парабола упёрлась в нужный штырёк
// следующего ряда, поэтому шарик скачет каждый раз по-разному, но ложится ровно
// в лунку, которую назвал сервер. Случайность здесь только для вида отскоков.

const SVG_NS = 'http://www.w3.org/2000/svg';

const DX = 24; // шаг штырьков в ряду
const DY = 21; // шаг рядов
const PAD_X = 14;
const TOP = 26; // первый ряд штырьков
const PEG_R = 2.4;
const BALL_R = 5.2;
const CONTACT = PEG_R + BALL_R; // расстояние между центрами в момент удара
const SLOT_H = 26;
const SLOT_GAP = 3;
const SLOT_FLOOR = SLOT_H - BALL_R - 2; // где лежит центр шарика на дне лунки

const GRAVITY = 2400; // ускорение падения, единиц доски за с²: меньше — медленнее
const DOUBLE_BOUNCE = 0.22; // доля ударов, когда шарик сперва подпрыгивает на макушке штырька
const SINK_MS = 350;

// Тыква вместо шарика на Хэллоуин — её включает src/styles/halloween.css.
// Контуры из static/halloween/pumpkin.svg: тело с прорезями в хвостике отдельно
// от рожицы, чтобы рожицу залить светом.
const PUMPKIN_BODY =
    'M8.04 2.79c 0,0 0,0 0,0 -0.3,-0.08 -0.18,-0.52 0.32,-1.02 l 0,0 c 0.08,-0.1 -0.1,-0.31 -0.44,-0.5 -0.37,-0.21 -0.79,-0.32 -0.93,-0.24 -0.01,0 -0.01,0.01 -0.02,0.01 l 0,0 c -0.75,0.63 -0.89,1.54 -0.91,1.77 C 3.39,2.39 1,4.41 1,8.11 c 0,3.21 4.19,4.89 6,4.89 1.81,0 6,-1.67 6,-4.89 0,-3.65 -2.12,-5.79 -4.96,-5.33 M7.67 1.69c 0.13,0.05 0.26,0.09 0.37,0.11 -0.26,0.36 -0.44,0.87 -0.29,1.01 0.19,0.17 0.57,0.39 0.69,0.48 0.12,0.09 -0.55,0.11 -0.82,0.4 0,0 -0.67,-1.12 0.05,-2 M6.05 2.93c 0.06,0.42 -0.35,0.77 -0.35,0.77 -0.01,-0.27 -0.27,-0.44 -0.27,-0.44 0.18,-0.2 0.62,-0.34 0.62,-0.34';
const PUMPKIN_FACE =
    'M9.1 6.51c 0.23,-0.07 2.45,-1.09 2.45,-0.79 0,0.35 -1.22,2.17 -2.12,2.46 -0.29,0.09 -1.38,-0.78 -1.16,-1.84 0.05,-0.27 0.53,0.27 0.84,0.17 M7 7.25c 0.23,0 1.14,0.41 1.14,1.09 0,0.68 -0.51,0.07 -1.14,0.07 -0.63,0 -1.14,0.61 -1.14,-0.07 0,-0.68 0.91,-1.09 1.14,-1.09 M4.9 6.51c 0.31,0.1 0.78,-0.44 0.84,-0.17 0.21,1.06 -0.88,1.93 -1.16,1.84 -0.91,-0.28 -2.12,-2.1 -2.12,-2.46 0,-0.3 2.22,0.72 2.45,0.79 M11.07 10.39l-0.7,-0.4 -0.44,1.14 -0.73,-0.72 -0.57,1.36 -1.49,-1.06 -0.76,0.92 -0.82,-0.96 -1.27,0.47 -0.74,-1.3 -0.95,0.42 -0.62,-2.56 0.96,1.6 0.93,-0.49 0.58,1.12 1.05,-0.61 0.86,1.15 0.81,-1.1 0.99,0.74 0.6,-0.87 0.93,0.5 0.55,-1.03 0.65,0.68 1.47,-1.68 -1.27,2.69';

// Стили живут в самой доске: <style> внутри inline-SVG действует на документ,
// поэтому все правила начинаются с .plinko-board.
const CSS = `
.plinko-board { display: block; width: 100%; height: auto; user-select: none; }
.plinko-board .peg { fill: #d8d8e2; opacity: .45; transition: opacity .4s, fill .4s; }
.plinko-board .peg.hit { fill: var(--cyber-yellow); opacity: 1; transition: none; }
.plinko-board .slot rect { fill: var(--cyber-yellow); }
.plinko-board .slot text { font: 700 12.5px var(--font-tech, 'Chakra Petch', monospace); text-anchor: middle; dominant-baseline: central; }
.plinko-board .tier-0 rect, .plinko-board .tier-1 rect, .plinko-board .tier-2 rect { fill: #16161b; stroke: rgba(255, 255, 255, .07); }
.plinko-board .tier-1 rect { stroke: var(--cyber-yellow); stroke-opacity: .35; }
.plinko-board .tier-2 rect { stroke: var(--cyber-yellow); stroke-opacity: .85; }
.plinko-board .tier-3 rect { fill-opacity: .78; }
.plinko-board .tier-0 text { fill: #8b8b96; }
.plinko-board .tier-1 text { fill: #f2f2f6; }
.plinko-board .tier-2 text { fill: var(--cyber-yellow); }
.plinko-board .tier-3 text, .plinko-board .tier-4 text { fill: #0b0b0f; }
.plinko-board .ball-core { fill: var(--cyber-yellow); }
.plinko-board .ball-shine { fill: #fff; opacity: .7; }
.plinko-board .ball-skin { display: none; }
.plinko-board .float { font: 700 12px var(--font-tech, 'Chakra Petch', monospace); text-anchor: middle; paint-order: stroke; stroke: #0b0b0f; stroke-width: 3px; }
.plinko-board .float.win { fill: var(--cyber-yellow); }
.plinko-board .float.loss { fill: #9a9aa6; }
.plinko-board .slot.prize rect { stroke: #fff3c4; stroke-width: 1.4; }
`;

export interface PlinkoBoardOptions {
    rows: number;
    /** Подписи лунок слева направо. */
    labels: string[];
    /** Яркость лунки от 0 до 4: чем больше множитель, тем ярче. */
    tiers: number[];
    /** Лунки с призом ивента — над ними тыква. */
    prizeSlots?: readonly number[];
}

export interface PlinkoLanding {
    /** Что всплывает над лункой, например «+15». */
    text: string;
    win: boolean;
}

export interface PlinkoBoard {
    /** Провести шарик по пути (0 — влево, 1 — вправо); onLand — когда он лёг в лунку. */
    drop(path: number[], landing: PlinkoLanding, onLand?: () => void): void;
    /** Показать тыквы над призовыми лунками; пустой список — убрать. */
    setPrizeSlots(slots: readonly number[]): void;
    destroy(): void;
}

type Point = { x: number; y: number };

/** Отрезок полёта: парабола от (x0, y0) с начальной скоростью (vx, vy) в единицах за секунду. */
export interface FlightSegment {
    t0: number; // начало, мс от броска
    dur: number; // мс
    x0: number;
    y0: number;
    vx: number;
    vy: number;
    /** Штырёк [ряд, номер], от которого шарик оттолкнулся в начале отрезка. */
    hit?: [number, number];
    /** В начале отрезка шарик коснулся дна лунки. */
    land?: boolean;
}

export interface Flight {
    segments: FlightSegment[];
    /** Мс от броска до момента, когда шарик затих на дне лунки. */
    duration: number;
    gravity: number;
    spawn: Point;
    rest: Point;
    slot: number;
}

/** Геометрия доски — общая для рисования и для расчёта полёта. */
export function boardGeometry(rows: number) {
    const width = (rows + 1) * DX + PAD_X * 2;
    const cx = width / 2;
    const slotY = TOP + (rows - 1) * DY + 14;
    return {
        width,
        height: slotY + SLOT_H + 8,
        slotY,
        pegX: (r: number, i: number) => cx + (i - (r + 2) / 2) * DX,
        pegY: (r: number) => TOP + r * DY,
        slotX: (k: number) => cx + (k - rows / 2) * DX,
        pegRadius: PEG_R,
        ballRadius: BALL_R,
        slotWidth: DX - SLOT_GAP
    };
}

/**
 * Парабола из from в to: шарик подлетает на hop вверх и падает под действием тяжести.
 * Возвращает время полёта (с) и начальную скорость, при которых он попадёт точно в to.
 */
function arc(from: Point, to: Point, hop: number, g: number) {
    const vy = -Math.sqrt(2 * g * hop);
    const dur = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (to.y - from.y)))) / g;
    if (!(dur > 0)) return { dur: 0, vx: 0, vy: 0 };
    return { dur, vx: (to.x - from.x) / dur, vy };
}

/**
 * Полёт шарика по готовому пути: цепочка парабол от удара к удару.
 * Каждый ряд шарик бьёт штырёк тем боком, куда потом отскочит; иногда сперва
 * подпрыгивает на его макушке. Кончается полёт на дне лунки, которую задаёт путь.
 */
export function planFlight(
    path: number[],
    rows: number,
    opts: { reduced?: boolean; random?: () => number } = {}
): Flight {
    const { reduced = false, random = Math.random } = opts;
    const geo = boardGeometry(rows);
    const g = reduced ? GRAVITY * 6 : GRAVITY;
    const rand = (a: number, b: number) => a + random() * (b - a);

    const rights = [0];
    for (const bit of path) rights.push(rights[rights.length - 1] + bit);
    const slot = rights[rows];
    const side = (r: number) => (path[r] ? 1 : -1);

    // Точка удара о штырёк ряда r: угол theta от макушки, плюс — правый бок.
    const contact = (r: number, theta: number): Point => ({
        x: geo.pegX(r, rights[r] + 1) + CONTACT * Math.sin(theta),
        y: geo.pegY(r) - CONTACT * Math.cos(theta)
    });

    // Дуга не должна задевать штырьки: иначе на экране шарик пройдёт сквозь них.
    // Хватает рядов вокруг того, от которого шарик отлетает.
    const clear = (from: Point, to: Point, hop: number, row: number) => {
        const a = arc(from, to, hop, g);
        for (let k = 1; k < 40; k++) {
            const tau = (a.dur * k) / 40;
            const x = from.x + a.vx * tau;
            const y = from.y + a.vy * tau + (g * tau * tau) / 2;
            for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
                for (let i = 0; i < r + 3; i++) {
                    if (Math.hypot(x - geo.pegX(r, i), y - geo.pegY(r)) < CONTACT) return false;
                }
            }
        }
        return true;
    };

    // Как шарик встретит штырёк ряда r: угол удара, подскок до него, двойной отскок.
    type Arrival = { twice: boolean; inAngle: number; out: number; hop: number; miniHop: number };
    const pick = (r: number): Arrival => {
        const twice = !reduced && random() < DOUBLE_BOUNCE;
        const out = side(r) * (twice ? rand(0.35, 0.7) : rand(0.21, 0.66));
        const hop = reduced ? 0.4 : 1.5 + 4.5 * random() ** 2;
        return { twice, out, inAngle: twice ? rand(-0.15, 0.15) : out, hop, miniHop: rand(1.2, 3) };
    };
    // Запасной вариант проходит всегда: шарик садится на макушку и скатывается в нужную сторону.
    const safe = (r: number): Arrival => ({ twice: true, out: side(r) * 0.5, inAngle: 0, hop: reduced ? 0.4 : 0.6, miniHop: 1.2 });
    const fits = (r: number, from: Point | null, c: Arrival) => {
        const at = contact(r, c.inAngle);
        if (from && !clear(from, at, c.hop, r - 1)) return false;
        return !c.twice || clear(at, contact(r, c.out), c.miniHop, r);
    };
    const choose = (r: number, from: Point | null) => {
        for (let attempt = 0; attempt < 16; attempt++) {
            const c = pick(r);
            if (fits(r, from, c)) return c;
        }
        return safe(r);
    };

    const segments: FlightSegment[] = [];
    let duration = 0;
    const fly = (from: Point, to: Point, hop: number, mark: Partial<FlightSegment> = {}) => {
        const a = arc(from, to, hop, g);
        segments.push({ t0: duration, dur: a.dur * 1000, x0: from.x, y0: from.y, vx: a.vx, vy: a.vy, ...mark });
        duration += a.dur * 1000;
        return to;
    };

    // Шарик появляется над первым штырьком и падает ему на бок.
    let arrival = choose(0, null);
    let at = contact(0, arrival.inAngle);
    const spawn = { x: at.x + rand(-1, 1), y: BALL_R + 1 };
    fly(spawn, at, 0);
    for (let r = 0; r < rows; r++) {
        const hit: [number, number] = [r, rights[r] + 1];
        if (arrival.twice) at = fly(at, contact(r, arrival.out), arrival.miniHop, { hit });
        if (r + 1 < rows) {
            arrival = choose(r + 1, at);
            at = fly(at, contact(r + 1, arrival.inAngle), arrival.hop, { hit });
            continue;
        }
        // Из последнего ряда — в лунку.
        let target: Point | null = null;
        let hop = 0.6;
        for (let attempt = 0; attempt < 16 && !target; attempt++) {
            const candidate = { x: geo.slotX(slot) + rand(-2, 2), y: geo.slotY + SLOT_FLOOR };
            const h = reduced ? 0.4 : 1.5 + 4.5 * random() ** 2;
            if (clear(at, candidate, h, r)) {
                target = candidate;
                hop = h;
            }
        }
        at = fly(at, target ?? { x: geo.slotX(slot) + 2 * side(r), y: geo.slotY + SLOT_FLOOR }, reduced ? 0.4 : hop, { hit });
    }
    // На дне лунки шарик ещё пару раз подпрыгивает и затихает.
    at = fly(at, { x: at.x + rand(-1.5, 1.5), y: at.y }, reduced ? 0 : 2.2, { land: true });
    if (!reduced) at = fly(at, { x: at.x + rand(-0.5, 0.5), y: at.y }, 0.6);

    return { segments, duration, gravity: g, spawn, rest: at, slot };
}

let boardCount = 0;

function node<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
    parent?: Element
): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    parent?.appendChild(el);
    return el;
}

type Anim = { start: number; dur: number; step: (p: number) => void; end?: () => void };

export function createPlinkoBoard(host: HTMLElement, opts: PlinkoBoardOptions): PlinkoBoard {
    const { rows, labels, tiers } = opts;
    const geo = boardGeometry(rows);
    // При «меньше движения» шарик падает быстро и почти без подскоков.
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const skinId = `plinko-pumpkin-${++boardCount}`;

    const svg = node('svg', { class: 'plinko-board', viewBox: `0 0 ${geo.width} ${geo.height}`, 'aria-hidden': 'true' });
    node('style', {}, svg).textContent = CSS;
    const skin = node('symbol', { id: skinId, viewBox: '0 0 14 14' }, node('defs', {}, svg));
    node('path', { d: PUMPKIN_BODY, fill: '#ea580c' }, skin);
    node('path', { d: PUMPKIN_FACE, fill: '#ffd27a' }, skin);

    // Штырьки: в ряду r их r + 3, ряды выровнены по центру.
    const pegLayer = node('g', {}, svg);
    const pegs: SVGCircleElement[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: SVGCircleElement[] = [];
        for (let i = 0; i < r + 3; i++) {
            row.push(node('circle', { class: 'peg', cx: geo.pegX(r, i), cy: geo.pegY(r), r: PEG_R }, pegLayer));
        }
        pegs.push(row);
    }

    // Лунка k — между штырьками k и k + 1 последнего ряда.
    const slotEls = labels.map((label, k) => {
        const g = node('g', { class: `slot tier-${tiers[k]}`, transform: `translate(${geo.slotX(k)} ${geo.slotY})` }, svg);
        node('rect', { x: -geo.slotWidth / 2, y: 0, width: geo.slotWidth, height: SLOT_H, rx: 3 }, g);
        node('text', { x: 0, y: SLOT_H / 2 }, g).textContent = label;
        return g;
    });

    // Приз ивента: маленькая тыква над серединой лунки (тот же силуэт, что у шарика)
    // и светлая обводка. Слой под шариками — падающий шарик проходит поверх.
    const prizeLayer = node('g', {}, svg);
    function setPrizeSlots(slots: readonly number[]) {
        prizeLayer.replaceChildren();
        slotEls.forEach((g, k) => g.classList.toggle('prize', slots.includes(k)));
        for (const k of slots) {
            node('use', { href: `#${skinId}`, x: geo.slotX(k) - 6.5, y: geo.slotY - 10, width: 13, height: 13 }, prizeLayer);
        }
    }
    setPrizeSlots(opts.prizeSlots ?? []);

    const ballLayer = node('g', {}, svg);
    const floatLayer = node('g', {}, svg);
    host.appendChild(svg);

    // Один цикл requestAnimationFrame на все шарики, штырьки и всплывающие подписи.
    let anims: Anim[] = [];
    let frame = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function run(anim: Anim) {
        anims.push(anim);
        if (!frame) frame = requestAnimationFrame(tick);
    }

    function tick(now: number) {
        const current = anims;
        anims = [];
        frame = 0;
        for (const a of current) {
            if (a.start < 0) a.start = now;
            const p = Math.min(1, (now - a.start) / a.dur);
            a.step(p);
            if (p < 1) anims.push(a);
            else a.end?.();
        }
        if (anims.length && !frame) frame = requestAnimationFrame(tick);
    }

    function flash(peg: SVGCircleElement) {
        peg.classList.add('hit');
        const timer = setTimeout(() => {
            peg.classList.remove('hit');
            timers.delete(timer);
        }, 140);
        timers.add(timer);
        // Штырёк вздрагивает от удара.
        run({ start: -1, dur: 220, step: (p) => peg.setAttribute('r', (PEG_R * (1 + 0.6 * (1 - p) * (1 - p))).toFixed(2)) });
    }

    function land(slot: number, landing: PlinkoLanding) {
        const g = slotEls[slot];
        const x = geo.slotX(slot);
        run({
            start: -1,
            dur: 260,
            step: (p) => g.setAttribute('transform', `translate(${x} ${(geo.slotY + 3 * Math.sin(Math.PI * p)).toFixed(2)})`)
        });
        const label = node('text', { class: `float ${landing.win ? 'win' : 'loss'}`, x, y: geo.slotY - 4 }, floatLayer);
        label.textContent = landing.text;
        run({
            start: -1,
            dur: 900,
            step: (p) => {
                label.setAttribute('y', (geo.slotY - 4 - 22 * p).toFixed(2));
                label.setAttribute('opacity', (1 - p * p).toFixed(2));
            },
            end: () => label.remove()
        });
    }

    function drop(path: number[], landing: PlinkoLanding, onLand?: () => void) {
        const flight = planFlight(path, rows, { reduced });
        const { segments, duration, gravity, spawn, rest } = flight;

        const ball = node('g', { class: 'ball' }, ballLayer);
        node('circle', { class: 'ball-core', r: BALL_R }, ball);
        node('circle', { class: 'ball-shine', cx: -1.6, cy: -1.7, r: 1.7 }, ball);
        const skinUse = node('use', { class: 'ball-skin', href: `#${skinId}`, x: -7.5, y: -8, width: 15, height: 15 }, ball);
        const place = (x: number, y: number) => {
            ball.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
            // Тыква катится: поворот по пройденному вбок пути.
            skinUse.setAttribute('transform', `rotate(${((((x - spawn.x) / BALL_R) * 180) / Math.PI).toFixed(1)})`);
        };
        place(spawn.x, spawn.y);

        let upcoming = 0; // первый отрезок, который ещё не начался
        let landed = false;
        const settle = () => {
            if (landed) return;
            landed = true;
            land(flight.slot, landing);
            onLand?.();
        };

        run({
            start: -1,
            dur: duration + SINK_MS,
            step: (p) => {
                const t = p * (duration + SINK_MS);
                // События начавшихся отрезков: удар о штырёк, касание дна.
                while (upcoming < segments.length && segments[upcoming].t0 <= t) {
                    const seg = segments[upcoming++];
                    if (seg.hit) flash(pegs[seg.hit[0]][seg.hit[1]]);
                    if (seg.land) settle();
                }
                if (t >= duration) {
                    settle();
                    const q = (t - duration) / SINK_MS;
                    place(rest.x, rest.y + 3 * q);
                    ball.setAttribute('opacity', (1 - q).toFixed(2));
                    return;
                }
                const seg = segments[Math.max(0, upcoming - 1)];
                const tau = (t - seg.t0) / 1000;
                place(seg.x0 + seg.vx * tau, seg.y0 + seg.vy * tau + (gravity * tau * tau) / 2);
            },
            end: () => {
                settle();
                ball.remove();
            }
        });
    }

    return {
        drop,
        setPrizeSlots,
        destroy() {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            anims = [];
            timers.forEach(clearTimeout);
            timers.clear();
            svg.remove();
        }
    };
}
