import { describe, it, expect } from 'vitest';
import { planFlight, boardGeometry } from './plinkoBoard';
import { PLINKO_ROWS, dropBall } from '$lib/games/plinko';

// Повторяемые прогоны: одна и та же последовательность «случайных» отскоков.
function seeded(seed: number) {
	let s = seed >>> 0;
	return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const geo = boardGeometry(PLINKO_ROWS);
const pegs: { x: number; y: number }[] = [];
for (let r = 0; r < PLINKO_ROWS; r++) {
	for (let i = 0; i < r + 3; i++) pegs.push({ x: geo.pegX(r, i), y: geo.pegY(r) });
}
const contact = geo.pegRadius + geo.ballRadius;
const randomBall = (rand: () => number) => dropBall(() => (rand() < 0.5 ? 0 : 1));

describe('Плинко: полёт шарика', () => {
	it('шарик ложится в лунку, которую задаёт путь', () => {
		const rand = seeded(1);
		for (let n = 0; n < 500; n++) {
			const ball = randomBall(rand);
			const flight = planFlight(ball.path, PLINKO_ROWS, { random: rand });
			expect(flight.slot).toBe(ball.slot);
			expect(Math.abs(flight.rest.x - geo.slotX(ball.slot))).toBeLessThan(geo.slotWidth / 2 - geo.ballRadius);
			expect(flight.rest.y).toBeGreaterThan(geo.slotY);
		}
	});

	it('в каждом ряду бьёт тот штырёк, что лежит на пути', () => {
		const rand = seeded(2);
		for (let n = 0; n < 200; n++) {
			const ball = randomBall(rand);
			const hits = planFlight(ball.path, PLINKO_ROWS, { random: rand })
				.segments.filter((s) => s.hit)
				.map((s) => s.hit as [number, number]);
			let rights = 0;
			const expected = ball.path.map((bit, r) => {
				const peg = [r, rights + 1];
				rights += bit;
				return peg;
			});
			// Двойной отскок — два удара подряд о один и тот же штырёк.
			expect(hits.filter((h, k) => k === 0 || h[0] !== hits[k - 1][0])).toEqual(expected);
		}
	});

	it('ни одна дуга не проходит сквозь штырёк', () => {
		const rand = seeded(3);
		for (let n = 0; n < 200; n++) {
			const flight = planFlight(randomBall(rand).path, PLINKO_ROWS, { random: rand });
			let closest = Infinity;
			for (const s of flight.segments) {
				for (let k = 1; k < 20; k++) {
					const tau = (s.dur / 1000) * (k / 20);
					const x = s.x0 + s.vx * tau;
					const y = s.y0 + s.vy * tau + (flight.gravity * tau * tau) / 2;
					for (const p of pegs) closest = Math.min(closest, Math.hypot(x - p.x, y - p.y));
				}
			}
			expect(closest).toBeGreaterThan(contact - 0.05);
		}
	});

	it('падает медленно, но не тянется', () => {
		const rand = seeded(4);
		const durations = Array.from(
			{ length: 200 },
			() => planFlight(randomBall(rand).path, PLINKO_ROWS, { random: rand }).duration
		);
		const average = durations.reduce((a, b) => a + b, 0) / durations.length;
		expect(average).toBeGreaterThan(2800);
		expect(average).toBeLessThan(4500);
	});

	it('при «меньше движения» шарик долетает быстро', () => {
		const rand = seeded(5);
		const flight = planFlight(randomBall(rand).path, PLINKO_ROWS, { reduced: true, random: rand });
		expect(flight.duration).toBeLessThan(1600);
	});
});
