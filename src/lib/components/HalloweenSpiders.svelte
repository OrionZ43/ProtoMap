<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { settingsStore } from '$lib/stores/settingsStore';
    import { getThemeSeason } from '$lib/seasonal/seasons';

    // Паучки с сердечком — персонажи хэллоуинской темы. Живут под шапкой:
    // с нижнего края свисает паутина, паучки висят на нитях у своего места и
    // смотрят на курсор — зрачками и наклоном головы, сами за ним не ходят. Время
    // от времени сходятся (вспыхивает сердечко) и уходят по краю плести паутинку.
    // Двигается всё только transform-ом и opacity; цикл кадров крутится лишь пока
    // что-то движется, на скрытой вкладке стоит. С «меньше движения» — неподвижно.

    const STRIP_H = 120; // высота полосы со свисающей паутиной
    const IDLE_MS = 2500; // столько паучки ещё смотрят туда, где замер курсор
    const MAX_WOVEN = 6; // больше сплетённых паутинок не копится
    const WEAVE_MS = 3600;

    // spider.svg без родной нитки (путь №3): нить рисуется своя, её длина меняется.
    // Подпути — тело с лапками и два глаза; нить крепится на 47,56% ширины (см. .body).
    const SPIDER_BODY =
        'M593.17,307.39c-43.758-76.194-146.268-75.888-195.228-6.426c-27.54-41.004-82.927-55.08-134.028-43.452 c-3.978,0.918-5.202,4.284-4.284,7.038c-40.086,5.813-77.418,25.397-98.838,55.998v-0.306 c-39.168-57.223-137.394-76.5-160.65,4.59c-1.224,4.59,5.814,7.956,7.956,3.366c30.294-70.074,105.876-55.998,147.492-3.979 c0.612,0.612,1.224,0.918,2.142,1.225c-7.344,11.628-12.546,24.785-14.994,39.474C72.664,324.832-44.228,408.981,17.89,483.034 c3.06,3.672,9.486-1.225,6.732-5.202c-47.43-70.38,50.49-139.842,115.056-107.101c0.918,0.307,1.53,0.307,2.448,0.307 c-0.612,7.038-0.918,14.382-0.306,22.032c0.306,5.201,1.224,10.403,2.448,14.993c-62.73-17.441-110.772,84.763-46.512,112.914 c5.202,2.143,9.18-4.283,4.284-7.344c-48.654-32.742-11.016-111.996,44.37-97.308c20.196,59.976,96.39,82.62,155.754,72.521 c47.43-7.956,86.598-36.414,104.04-76.5c19.278-8.262,38.862,13.464,48.654,30.294c15.605,26.316,18.666,59.059-1.53,83.845 c-3.979,4.896,2.142,11.016,7.038,7.037c48.348-39.168-7.956-143.514-50.796-130.355c4.896-14.688,7.344-30.6,6.12-47.43 c27.846-14.688,55.386-22.95,85.985-7.65c30.906,15.606,48.042,51.102,63.342,80.172c2.143,4.284,9.181,1.224,7.65-3.366 c-25.704-71.298-91.8-123.317-157.896-78.336l0,0c-2.143-15.3-6.732-28.458-13.465-39.779 c55.692-62.73,132.498-62.118,184.213,5.201C588.886,316.264,595.924,312.592,593.17,307.39z M402.838,355.432 c-0.611,0.612-1.53,1.225-2.142,1.836c-2.143,2.143,0.306,5.509,2.754,4.591c2.448,57.222-42.534,100.367-96.696,112.607 c-64.872,14.382-146.88-13.464-153-87.822c-5.814-69.155,62.73-105.876,121.176-114.444c2.142-0.306,3.06-2.142,3.06-3.978 c59.67-7.344,115.668,17.748,124.542,83.844C402.838,353.29,402.838,354.514,402.838,355.432z';
    const SPIDER_EYES =
        'M254.734,334.93c-10.71-15.912-36.108-24.479-53.856-17.136c-4.896,2.142-1.836,8.874,2.448,9.18 c14.688,0.612,26.928-0.306,38.862,10.099c13.464,11.934,8.568,27.846-1.53,39.474c-13.77-14.076-26.622-29.07-39.474-44.063 c-2.142-2.448-6.426,0.918-4.59,3.672c12.24,18.054,25.092,36.414,40.392,52.02c2.142,2.142,5.508,1.836,7.65,0 C259.936,373.792,267.586,353.596,254.734,334.93z M369.178,334.624c-14.994-18.054-37.332-23.256-55.691-7.344c-16.83,14.382-18.36,41.922-5.509,59.058 c1.53,1.836,3.673,2.142,5.202,1.224c1.225,0.918,2.754,1.225,4.591,0.307c10.403-4.59,19.584-11.935,27.846-19.278 c6.12-5.508,14.382-11.934,15.912-20.502c0.918-4.59-4.284-7.956-7.956-4.59c-5.814,5.508-10.099,11.934-15.606,17.442 c-7.344,7.344-15.3,14.075-24.174,19.277c-6.732-14.994-6.12-31.518,5.814-43.758c13.464-14.076,30.6-6.732,41.615,6.12 C365.812,348.088,373.769,340.132,369.178,334.624z';
    const HEART =
        'M12 20H10V19H9V18H8V17H7V16H6V15H5V14H4V13H3V12H2V10H1V5H2V4H3V3H4V2H9V3H10V4H12V3H13V2H18V3H19V4H20V5H21V10H20V12H19V13H18V14H17V15H16V16H15V17H14V18H13V19H12V20M5 11V12H6V13H7V14H8V15H9V16H10V17H12V16H13V15H14V14H15V13H16V12H17V11H18V9H19V6H18V5H17V4H14V5H13V6H12V7H10V6H9V5H8V4H5V5H4V6H3V9H4V11H5Z';
    // Зрачки в глазах-«D» картинки, в её координатах
    const PUPILS = [
        { x: 228, y: 355 },
        { x: 330, y: 359 }
    ];

    const f = (n: number) => Number(n.toFixed(1));
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const seeded = (seed: number) => {
        let s = seed >>> 0;
        return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    };

    // Паутина рисуется в три слоя разной яркости: дальние нити, основные, ближние.
    type Layer = 'faint' | 'base' | 'bright';
    type WebArt = Record<Layer, string> & { drops: { x: number; y: number; r: number }[] };

    /** Конец пряди: клочок, капля или ничего. */
    function strandEnd(art: WebArt, x: number, y: number, rnd: () => number) {
        const roll = rnd();
        if (roll < 0.45) {
            const s = 2.5 + rnd() * 3.5;
            art.base +=
                `M${f(x)} ${f(y)}L${f(x - s)} ${f(y + s * 0.8)}M${f(x)} ${f(y)}L${f(x + s * 0.2)} ${f(y + s * 1.1)}` +
                `M${f(x)} ${f(y)}L${f(x + s)} ${f(y + s * 0.7)}` +
                `M${f(x - s * 0.6)} ${f(y + s * 0.5)}Q${f(x)} ${f(y + s * 0.9)} ${f(x + s * 0.6)} ${f(y + s * 0.45)}`;
        } else if (roll < 0.75) {
            art.drops.push({ x: f(x), y: f(y + 1.6), r: f(1.1 + rnd() * 0.8) });
        }
    }

    /** Прядь с лёгким изгибом от точки вниз. */
    function strand(art: WebArt, x: number, y: number, len: number, rnd: () => number, layer: Layer = 'base') {
        const bend = (rnd() - 0.5) * 6;
        const xe = x + bend;
        art[layer] += `M${f(x)} ${f(y)}Q${f(x + bend * 1.6)} ${f(y + len / 2)} ${f(xe)} ${f(y + len)}`;
        strandEnd(art, xe, y + len, rnd);
    }

    /** Угловая паутина: неровные лучи, кольца разной густоты, кое-где порваны. */
    function cornerWeb(art: WebArt, cx: number, R: number, dir: number, rnd: () => number) {
        const n = 5 + Math.floor(rnd() * 3);
        const angles = Array.from({ length: n }, (_, i) => rad(5 + (i * 82) / (n - 1) + (rnd() - 0.5) * 9));
        const reach = angles.map(() => R * (0.8 + rnd() * 0.25));
        const pt = (a: number, r: number) => [cx + dir * Math.cos(a) * r, Math.sin(a) * r];
        // один луч оборван, с его конца свисает нить
        const broken = 1 + Math.floor(rnd() * (n - 2));
        reach[broken] *= 0.55;
        angles.forEach((a, i) => {
            const [x, y] = pt(a, reach[i]);
            art.bright += `M${f(cx)} 0L${f(x)} ${f(y)}`;
            if (i === broken) strand(art, x, y, 14 + rnd() * 26, rnd);
        });
        let k = 0.12;
        while (k < 0.9) {
            k += 0.1 + rnd() * 0.12;
            const r = R * Math.min(k, 0.97);
            for (let i = 0; i < n - 1; i++) {
                if (rnd() < 0.12 || r > reach[i] || r > reach[i + 1]) continue;
                const [x1, y1] = pt(angles[i], r);
                const [x2, y2] = pt(angles[i + 1], r);
                const [qx, qy] = pt((angles[i] + angles[i + 1]) / 2, r * (0.76 + rnd() * 0.12));
                art[k < 0.5 ? 'bright' : 'base'] += `M${f(x1)} ${f(y1)}Q${f(qx)} ${f(qy)} ${f(x2)} ${f(y2)}`;
            }
        }
        // спутанный клочок у края рядом с углом
        const mx = cx + dir * R * (0.95 + rnd() * 0.3);
        for (let i = 0; i < 6; i++) {
            const x1 = mx + (rnd() - 0.5) * 26;
            const x2 = mx + (rnd() - 0.5) * 26;
            art.faint += `M${f(x1)} ${f(rnd() * 8)}L${f(x2)} ${f(6 + rnd() * 16)}`;
        }
    }

    /**
     * Веер, свисающий с края: лучи вниз, а поперёк них нить ходит туда-обратно,
     * понемногу уходя от центра, — как спираль, а не ровные кольца. Полоса порвана.
     */
    function fanWeb(art: WebArt, cx: number, R: number, rnd: () => number) {
        const n = 6 + Math.floor(rnd() * 3);
        const from = 18 + rnd() * 14;
        const to = 162 - rnd() * 14;
        const angles = Array.from({ length: n }, (_, i) => rad(from + ((to - from) * i) / (n - 1) + (rnd() - 0.5) * 6));
        const pt = (a: number, r: number) => [cx + Math.cos(a) * r, Math.sin(a) * r];
        for (const a of angles) {
            const [x, y] = pt(a, R * (0.9 + rnd() * 0.12));
            art.bright += `M${f(cx)} 0L${f(x)} ${f(y)}`;
        }
        const segs = (n - 1) * 5;
        const tearFrom = Math.floor(segs * (0.45 + rnd() * 0.2));
        for (let j = 0; j < segs; j++) {
            if (j >= tearFrom && j < tearFrom + 3) continue;
            const pass = Math.floor(j / (n - 1));
            const step = j % (n - 1);
            const i1 = pass % 2 ? n - 1 - step : step;
            const i2 = pass % 2 ? i1 - 1 : i1 + 1;
            const r1 = R * (0.2 + (0.72 * j) / segs);
            const r2 = R * (0.2 + (0.72 * (j + 1)) / segs);
            const [x1, y1] = pt(angles[i1], r1);
            const [x2, y2] = pt(angles[i2], r2);
            const [qx, qy] = pt((angles[i1] + angles[i2]) / 2, ((r1 + r2) / 2) * 0.86);
            art.base += `M${f(x1)} ${f(y1)}Q${f(qx)} ${f(qy)} ${f(x2)} ${f(y2)}`;
        }
        // из порванного места свисает обрывок
        const [tx, ty] = pt(angles[Math.floor(n / 2)], R * (0.2 + (0.72 * tearFrom) / segs));
        strand(art, tx, ty, 10 + rnd() * 18, rnd);
    }

    /**
     * Неподвижная паутина под шапкой: разные углы, один-два веера и между ними
     * гирлянды разной длины и провиса — в одну, две или три нити, местами
     * перехлёстнутые, с прядями, клочками и каплями; кое-где край голый.
     * Рисунок зависит только от ширины, поэтому от загрузки к загрузке не скачет.
     */
    function staticWebs(W: number, mobile: boolean, clear: [number, number]): WebArt {
        const rnd = seeded(11);
        const art: WebArt = { faint: '', base: '', bright: '', drops: [] };
        const RL = mobile ? 50 : 92 + rnd() * 24;
        const RR = mobile ? 40 : 66 + rnd() * 20;
        cornerWeb(art, 0, RL, 1, rnd);
        cornerWeb(art, W, RR, -1, rnd);

        // Веера — не над паучками и не друг на друге
        const fans: [number, number][] = [];
        const want = mobile ? (W > 360 ? 1 : 0) : W > 1100 ? 2 : 1;
        for (let tries = 0; fans.length < want && tries < 40; tries++) {
            const R = mobile ? 22 + rnd() * 8 : 32 + rnd() * 20;
            const x = RL + R + 30 + rnd() * (W - RL - RR - 2 * R - 60);
            const span: [number, number] = [x - R - 10, x + R + 10];
            const hits = (a: [number, number]) => span[0] < a[1] + 40 && span[1] > a[0] - 40;
            if (hits(clear) || fans.some(hits)) continue;
            fanWeb(art, x, R, rnd);
            fans.push(span);
        }

        const end = W - RR * 0.8;
        let x = RL * 0.8;
        while (x < end - 24) {
            const fan = fans.find((s) => x >= s[0] - 4 && x < s[1]);
            if (fan) {
                x = fan[1];
                continue;
            }
            if (rnd() < 0.16) {
                x += 30 + rnd() * (mobile ? 50 : 110); // голый кусок края
                continue;
            }
            const roll = rnd();
            const len = roll < 0.25 ? 170 + rnd() * 150 : roll < 0.65 ? 80 + rnd() * 90 : 34 + rnd() * 40;
            const nextFan = Math.min(end, ...fans.filter((s) => s[0] > x).map((s) => s[0]));
            const x2 = Math.min(x + len * (mobile ? 0.6 : 1), nextFan);
            const span = x2 - x;
            if (span < 20) {
                x = x2 + 4;
                continue;
            }
            const threads = 1 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.18 ? 1 : 0);
            let lowX = 0;
            let lowY = 0;
            for (let t = 0; t < threads; t++) {
                const a = x + (t ? rnd() * 16 : 0);
                const b = x2 - (t ? rnd() * 16 : 0);
                const sag = span * (0.05 + rnd() * (span > 150 ? 0.12 : 0.24)) * (1 + t * 0.35);
                const mid = (a + b) / 2 + (rnd() - 0.5) * span * 0.2;
                art[t === 0 ? 'base' : 'faint'] += `M${f(a)} 0Q${f(mid)} ${f(sag * 2)} ${f(b)} 0`;
                if (t === 0) {
                    lowX = (a + 2 * mid + b) / 4; // нижняя точка квадратичной кривой
                    lowY = sag;
                }
            }
            // пряди из нижней точки — одна, две или ни одной
            const strands = rnd() < 0.55 ? (rnd() < 0.3 ? 2 : 1) : 0;
            for (let i = 0; i < strands; i++) {
                strand(art, lowX + i * (6 + rnd() * 10), lowY, 6 + rnd() * (mobile ? 30 : 64), rnd, i ? 'faint' : 'base');
            }
            // изредка перехлёст: длинная тонкая нить через стык с соседней гирляндой
            if (!mobile && rnd() < 0.18 && x2 < end - 60) {
                const a = x + span * (0.4 + rnd() * 0.3);
                const b = Math.min(x2 + 40 + rnd() * 80, end);
                art.faint += `M${f(a)} 0Q${f((a + b) / 2)} ${f((b - a) * 0.3)} ${f(b)} 0`;
            }
            x = x2 + (rnd() < 0.45 ? 0 : 8 + rnd() * (mobile ? 24 : 50));
        }
        return art;
    }

    /** Свежая паутинка, которую плетёт паучок: небольшой неровный веер. */
    function wovenLines(rnd: () => number): { d: string; len: number }[] {
        const R = (mobile ? 14 : 18) + rnd() * 10;
        const n = 4 + Math.floor(rnd() * 3);
        const from = 25 + rnd() * 20;
        const to = 155 - rnd() * 20;
        const angles = Array.from({ length: n }, (_, i) => rad(from + ((to - from) * i) / (n - 1)));
        const pt = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r];
        const lines: { d: string; len: number }[] = [];
        for (const a of angles) {
            const [x, y] = pt(a, R);
            lines.push({ d: `M0 0L${f(x)} ${f(y)}`, len: Math.ceil(R) });
        }
        const rings = 2 + Math.floor(rnd() * 3);
        for (let j = 1; j <= rings; j++) {
            const r = R * (0.2 + (0.75 * j) / rings);
            let d = '';
            let len = 0;
            for (let i = 0; i < n - 1; i++) {
                const [x1, y1] = pt(angles[i], r);
                const [x2, y2] = pt(angles[i + 1], r);
                const [qx, qy] = pt((angles[i] + angles[i + 1]) / 2, r * 0.84);
                d += `${i ? '' : `M${f(x1)} ${f(y1)}`}Q${f(qx)} ${f(qy)} ${f(x2)} ${f(y2)}`;
                len += Math.hypot(x2 - x1, y2 - y1) * 1.06;
            }
            lines.push({ d, len: Math.ceil(len) });
        }
        return lines;
    }

    type Spider = {
        x: number; len: number; tilt: number;
        tx: number; tl: number;
        homeX: number; homeL: number;
        turn: number; ex: number; ey: number; // наклон головы и взгляд
        el?: HTMLDivElement; thread?: HTMLDivElement; body?: HTMLDivElement;
        head?: SVGSVGElement; face?: SVGGElement; pupils?: SVGGElement;
    };
    type Woven = { id: number; x: number; lines: { d: string; len: number }[]; fading: boolean };

    let host: HTMLDivElement;
    let mounted = false;
    let width = 0;
    let mobile = false;
    let reduced = false;
    let art: WebArt = { faint: '', base: '', bright: '', drops: [] };
    let woven: Woven[] = [];
    let heartKey = 0;
    let heartX = 0;
    let heartY = 0;

    const A: Spider = { x: 0, len: 26, tilt: 0, tx: 0, tl: 26, homeX: 0, homeL: 26, turn: 0, ex: 0, ey: 0 };
    const B: Spider = { x: 0, len: 34, tilt: 0, tx: 0, tl: 34, homeX: 0, homeL: 34, turn: 0, ex: 0, ey: 0 };
    const spiders = [A, B];

    let frame = 0;
    let last = 0;
    let scrollBoost = 0;
    let lastScrollY = 0;
    // Куда смотрят: курсор, место касания или случайная точка на телефоне
    let look: { x: number; y: number; until: number } | null = null;
    // Паучок идёт к месту новой паутинки, плетёт и возвращается домой
    let weaving: { s: Spider; x: number; phase: 'go' | 'weave'; until: number } | null = null;
    // Паучки сходятся друг к другу — вспыхивает сердечко
    let meeting: { until: number; hearted: boolean } | null = null;
    let weaver = 0;
    let nextWebId = 1;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const rnd = Math.random;

    $: visible = mounted && getThemeSeason() === 'halloween' && $settingsStore.seasonalEnabled;

    function later(fn: () => void, ms: number) {
        const id = setTimeout(() => {
            timers.delete(id);
            fn();
        }, ms);
        timers.add(id);
        return id;
    }

    function layout() {
        if (!host) return;
        width = host.clientWidth;
        mobile = width < 768;
        // Дома паучки висят парой чуть левее центра
        A.homeX = clamp(width / 2 - (mobile ? 80 : 150), 40, width - 40);
        B.homeX = clamp(width / 2 - (mobile ? 10 : 70), 40, width - 40);
        art = staticWebs(width, mobile, [A.homeX - 30, B.homeX + 30]);
        for (const s of spiders) {
            if (!s.x || (!weaving && !meeting)) {
                s.x = s.tx = s.homeX;
                s.len = s.tl = s.homeL;
            }
            apply(s);
        }
        wake();
    }

    function apply(s: Spider) {
        if (!s.el || !s.thread || !s.body) return;
        const len = s.len + scrollBoost;
        s.el.style.transform = `translate3d(${f(s.x)}px, 0, 0) rotate(${s.tilt.toFixed(2)}deg)`;
        s.thread.style.transform = `scaleY(${f(len)})`;
        s.body.style.transform = `translate3d(0, ${f(len)}px, 0)`;
        if (s.head) s.head.style.transform = `rotate(${s.turn.toFixed(2)}deg)`;
        // Глаза и зрачки сдвигаются в сторону взгляда — голова будто поворачивается
        s.face?.setAttribute('transform', `translate(${f(s.ex * 0.7)} ${f(s.ey * 0.5)})`);
        s.pupils?.setAttribute('transform', `translate(${f(s.ex)} ${f(s.ey)})`);
    }

    function wake() {
        if (!frame && !reduced && !document.hidden) {
            last = performance.now();
            frame = requestAnimationFrame(step);
        }
    }

    function goHome(s: Spider) {
        s.tx = s.homeX;
        s.tl = s.homeL;
    }

    function step(now: number) {
        frame = 0;
        const dt = Math.min(50, now - last) / 16.67;
        last = now;
        if (look && now > look.until) look = null;

        if (weaving) {
            const w = weaving;
            if (w.phase === 'go' && Math.abs(w.s.x - w.x) < 2) {
                w.phase = 'weave';
                w.until = now + WEAVE_MS;
                addWoven(w.x);
            }
            if (w.phase === 'weave') {
                if (now > w.until) {
                    goHome(w.s);
                    weaving = null;
                } else {
                    // перебирает лапками на месте, пока плетёт
                    w.s.tx = w.x + Math.sin(now / 170) * 3;
                    w.s.tl = 12 + Math.sin(now / 260) * 2;
                }
            }
        }
        if (meeting && now > meeting.until) {
            meeting = null;
            for (const s of spiders) if (weaving?.s !== s) goHome(s);
        }

        scrollBoost *= Math.pow(0.94, dt);
        if (scrollBoost < 0.2) scrollBoost = 0;
        let moving = scrollBoost > 0 || !!weaving || !!meeting || !!look;
        const ease = 1 - Math.pow(0.82, dt);
        for (const s of spiders) {
            const kx = 1 - Math.pow(0.95, dt);
            const kl = 1 - Math.pow(1 - (s.tl < s.len ? 0.12 : 0.05), dt);
            // шагом, а не рывком: по краю не быстрее 150 px/с
            const vx = clamp((s.tx - s.x) * kx, -2.5 * dt, 2.5 * dt);
            s.x += vx;
            s.len += (s.tl - s.len) * kl;
            // нить отклоняется против хода и раскачивается обратно
            s.tilt += (clamp(-vx * 3, -12, 12) - s.tilt) * (1 - Math.pow(0.85, dt));

            // Взгляд: зрачки к цели, голова чуть наклоняется в её сторону
            let ex = 0;
            let ey = 0;
            let turn = 0;
            if (look) {
                const dx = look.x - s.x;
                const dy = look.y - (s.len + scrollBoost + 12);
                const dist = Math.hypot(dx, dy) || 1;
                const near = Math.min(1, dist / 50); // курсор на самом паучке — смотрит прямо
                ex = (dx / dist) * 9 * near;
                ey = (dy / dist) * 7 * near;
                turn = clamp(dx / 30, -11, 11) * near;
            }
            s.ex += (ex - s.ex) * ease;
            s.ey += (ey - s.ey) * ease;
            s.turn += (turn - s.turn) * ease;

            if (
                Math.abs(s.tx - s.x) > 0.3 || Math.abs(s.tl - s.len) > 0.3 || Math.abs(s.tilt) > 0.15 ||
                Math.abs(ex - s.ex) > 0.1 || Math.abs(ey - s.ey) > 0.1 || Math.abs(turn - s.turn) > 0.1
            ) moving = true;
            apply(s);
        }

        // Сошлись — между ними вспыхивает сердечко, одно за встречу
        if (meeting && !meeting.hearted && Math.abs(A.tx - A.x) < 3 && Math.abs(B.tx - B.x) < 3) {
            meeting.hearted = true;
            meeting.until = now + 2600;
            heartX = (A.x + B.x) / 2;
            heartY = (A.len + B.len) / 2 + scrollBoost - 4;
            heartKey += 1;
        }
        if (moving) frame = requestAnimationFrame(step);
    }

    function lookAt(x: number, y: number, ms: number) {
        look = { x, y, until: performance.now() + ms };
        wake();
    }

    function onPointer(e: PointerEvent) {
        if (!host || (e.type === 'pointermove' && e.pointerType !== 'mouse')) return;
        const r = host.getBoundingClientRect();
        // y — от нижнего края шапки
        lookAt(e.clientX - r.left, e.clientY - r.top, e.pointerType === 'mouse' ? IDLE_MS : 2200);
    }

    function onScroll() {
        const y = window.scrollY;
        if (y > lastScrollY + 2) {
            scrollBoost = Math.min(30, scrollBoost + 5);
            wake();
        }
        lastScrollY = y;
    }

    function addWoven(x: number) {
        woven = [...woven, { id: nextWebId++, x, lines: wovenLines(rnd), fading: false }];
        // Старые паутинки медленно растворяются, чтобы шапка не заросла
        const alive = woven.filter((w) => !w.fading);
        if (alive.length > MAX_WOVEN) {
            const oldest = alive[0].id;
            woven = woven.map((w) => (w.id === oldest ? { ...w, fading: true } : w));
            later(() => { woven = woven.filter((w) => w.id !== oldest); }, 2400);
        }
    }

    function weave() {
        later(weave, (30 + rnd() * 20) * 1000);
        if (document.hidden || weaving || meeting) return;
        const s = weaver === 0 ? A : B;
        weaver = 1 - weaver;
        // Новое место — недалеко от дома и не поверх уже сплетённых
        const reach = mobile ? 140 : 420;
        let x = -1;
        for (let i = 0; i < 12 && x < 0; i++) {
            const c = clamp(s.homeX + (rnd() - 0.5) * 2 * reach, 70, width - 70);
            if (Math.abs(c - s.homeX) > 50 && woven.every((w) => w.fading || Math.abs(w.x - c) > 70)) x = c;
        }
        if (x < 0) return;
        weaving = { s, x, phase: 'go', until: 0 };
        s.tx = x;
        s.tl = 16;
        wake();
    }

    function meet() {
        later(meet, (18 + rnd() * 14) * 1000);
        if (document.hidden || weaving || meeting) return;
        const mid = (A.homeX + B.homeX) / 2;
        // лапки почти касаются, сердечко — между ними
        A.tx = mid - 25;
        B.tx = mid + 25;
        A.tl = B.tl = 30;
        meeting = { until: performance.now() + 9000, hearted: false };
        wake();
    }

    // Телефон: курсора нет — паучки время от времени оглядываются сами
    function glance() {
        later(glance, (4 + rnd() * 4) * 1000);
        if (!document.hidden) lookAt(rnd() * width, 20 + rnd() * 260, 1800);
    }

    function onVisibility() {
        if (document.hidden && frame) {
            cancelAnimationFrame(frame);
            frame = 0;
        } else if (!document.hidden) {
            wake();
        }
    }

    let resizeObserver: ResizeObserver | null = null;
    let started = false;

    function start() {
        if (started || !host) return;
        started = true;
        reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        layout();
        resizeObserver = new ResizeObserver(() => layout());
        resizeObserver.observe(host);
        if (reduced) return;
        if (matchMedia('(hover: hover)').matches) window.addEventListener('pointermove', onPointer, { passive: true });
        else later(glance, 2500);
        window.addEventListener('pointerdown', onPointer, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        lastScrollY = window.scrollY;
        later(meet, 5000 + rnd() * 3000);
        later(weave, 14000 + rnd() * 8000);
    }

    function stop() {
        if (!started) return;
        started = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        timers.forEach(clearTimeout);
        timers.clear();
        resizeObserver?.disconnect();
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('pointerdown', onPointer);
        window.removeEventListener('scroll', onScroll);
        document.removeEventListener('visibilitychange', onVisibility);
        weaving = null;
        meeting = null;
        look = null;
    }

    onMount(() => {
        mounted = true;
    });

    onDestroy(stop);

    // Блок появляется и пропадает вместе с настройкой сезонных эффектов
    $: if (visible && host) start();
    $: if (!visible) stop();
</script>

{#if visible}
    <div class="hw-spiders" class:still={reduced} bind:this={host} aria-hidden="true">
        <svg class="webs" width={width} height={STRIP_H} viewBox="0 0 {width || 1} {STRIP_H}">
            <path class="faint" d={art.faint} />
            <path class="base" d={art.base} />
            <path class="bright" d={art.bright} />
            {#each art.drops as drop}
                <circle cx={drop.x} cy={drop.y} r={drop.r} />
            {/each}
        </svg>

        {#each woven as web (web.id)}
            <svg class="woven" class:fading={web.fading} style="left: {web.x - 40}px" width="80" height="44" viewBox="-40 0 80 44">
                {#each web.lines as line, i}
                    <path d={line.d} style="--len: {line.len}; --delay: {i * 0.28}s" />
                {/each}
            </svg>
        {/each}

        {#each spiders as spider, i}
            <div class="spider" bind:this={spider.el}>
                <div class="swing" class:late={i === 1}>
                    <div class="thread" bind:this={spider.thread}></div>
                    <div class="body" bind:this={spider.body}>
                        <svg viewBox="0 250 594 285" width="48" height="23" bind:this={spider.head}>
                            <path d={SPIDER_BODY} />
                            <g bind:this={spider.face}>
                                <path d={SPIDER_EYES} />
                                <g bind:this={spider.pupils}>
                                    {#each PUPILS as p}
                                        <circle cx={p.x} cy={p.y} r="13" />
                                    {/each}
                                </g>
                            </g>
                        </svg>
                    </div>
                </div>
            </div>
        {/each}

        {#if heartKey}
            {#key heartKey}
                <div class="heart" style="transform: translate3d({f(heartX)}px, {f(heartY)}px, 0)">
                    <svg viewBox="0 0 22 22" width="14" height="14"><path d={HEART} /></svg>
                </div>
            {/key}
        {/if}
    </div>
{/if}

<style>
    .hw-spiders {
        position: absolute;
        left: 0;
        right: 0;
        top: 100%;
        height: 190px;
        pointer-events: none;
        overflow: visible;
        z-index: -1; /* под выпадающими меню шапки, но над страницей */
    }
    .webs {
        position: absolute;
        left: 0;
        top: 0;
        display: block;
    }
    .webs path,
    .woven path {
        fill: none;
        stroke-linecap: round;
    }
    .webs .faint {
        stroke: rgba(236, 236, 246, 0.16);
        stroke-width: 0.7;
    }
    .webs .base {
        stroke: rgba(236, 236, 246, 0.3);
        stroke-width: 0.9;
    }
    .webs .bright {
        stroke: rgba(236, 236, 246, 0.42);
        stroke-width: 1;
    }
    .webs circle {
        fill: rgba(236, 236, 246, 0.5);
    }
    .woven {
        position: absolute;
        top: 0;
        transition: opacity 2.2s ease;
    }
    .woven path {
        stroke: rgba(236, 236, 246, 0.42);
        stroke-width: 0.9;
        stroke-dasharray: var(--len);
        stroke-dashoffset: var(--len);
        animation: hw-weave 0.6s ease-out var(--delay) forwards;
    }
    .woven.fading {
        opacity: 0;
    }
    @keyframes hw-weave {
        to {
            stroke-dashoffset: 0;
        }
    }

    .spider {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        transform-origin: 0 0;
        will-change: transform;
    }
    .swing {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        animation: hw-spider-sway 5.5s ease-in-out infinite alternate;
    }
    .swing.late {
        animation-delay: -2.7s;
    }
    .thread {
        position: absolute;
        left: -0.5px;
        top: 0;
        width: 1px;
        height: 1px;
        background: rgba(255, 255, 255, 0.55);
        transform-origin: 0 0;
    }
    .body {
        position: absolute;
        left: -22.8px; /* 47,56% ширины картинки — точка крепления нити */
        top: 0;
    }
    .body svg {
        display: block;
        fill: #f2f2f6;
        filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
        transform-origin: 50% 45%; /* наклон головы — вокруг середины */
    }
    @keyframes hw-spider-sway {
        from {
            transform: rotate(-5deg);
        }
        to {
            transform: rotate(5deg);
        }
    }

    .heart {
        position: absolute;
        left: -7px;
        top: -7px;
    }
    .heart svg {
        display: block;
        fill: var(--cyber-red, #ff3300);
        animation: hw-heart 1.6s ease-out forwards;
    }
    @keyframes hw-heart {
        0% {
            opacity: 0;
            transform: scale(0.4) translateY(6px);
        }
        30% {
            opacity: 1;
            transform: scale(1.25) translateY(-2px);
        }
        70% {
            opacity: 1;
            transform: scale(1) translateY(-6px);
        }
        100% {
            opacity: 0;
            transform: scale(0.9) translateY(-12px);
        }
    }

    .still .swing,
    .still .woven path {
        animation: none;
    }
    .still .woven path {
        stroke-dashoffset: 0;
    }
</style>
