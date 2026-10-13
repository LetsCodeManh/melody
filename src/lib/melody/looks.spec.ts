import { describe, expect, it } from 'vitest';
import { createPulse, noteLooks } from './looks';
import type { Prepared } from './melody';

const song = (notes: [number, number, number][], lands: number[] = []) =>
	({ notes, flights: lands.map((land, note) => [note, land - 1, land, 0, 0, 0, 0]) }) as unknown as Prepared;

describe('noteLooks', () => {
	it('runs from azure at the low end of the song to amber at the high end', () => {
		const [low, , high] = noteLooks(song([[40, 64, 1], [60, 64, 1], [80, 64, 1]]));
		expect(low.colour.b).toBeGreaterThan(low.colour.r);
		expect(high.colour.r).toBeGreaterThan(high.colour.b);
	});
	it('weighs loud and long notes heavier, by length alone when every note is equally loud', () => {
		const [soft, loud] = noteLooks(song([[60, 30, 0.5], [60, 110, 0.5]]));
		expect(loud.weight).toBeGreaterThan(soft.weight);
		const [short, long] = noteLooks(song([[60, 50, 0.1], [60, 50, 3]]));
		expect(short.weight).toBe(0.25);
		expect(long.weight).toBe(0.75);
	});
	it('strikes by velocity alone, by weight when every key is struck alike', () => {
		const [soft, hard] = noteLooks(song([[60, 30, 3], [60, 110, 0.1]]));
		expect([soft.strike, hard.strike]).toEqual([0, 1]);
		const [short, long] = noteLooks(song([[60, 50, 0.1], [60, 50, 3]]));
		expect([short.strike, long.strike]).toEqual([short.weight, long.weight]);
	});
});

describe('createPulse', () => {
	it('is still before the first landing, kicks at it, and dies away after', () => {
		const pulse = createPulse(song([[60, 64, 1]], [2]), [{ weight: 1 } as never]);
		expect(pulse(1.99)).toBe(0);
		expect(pulse(2)).toBeCloseTo(1 - Math.exp(-1));
		expect(pulse(3)).toBe(0);
	});
	it('kicks harder for a chord than for one of its notes', () => {
		const one = createPulse(song([[60, 64, 1]], [2]), [{ weight: 0.5 } as never]);
		const chord = createPulse(song([[60, 64, 1], [64, 64, 1], [67, 64, 1]], [2, 2, 2]), Array(3).fill({ weight: 0.5 }));
		expect(chord(2.05)).toBeGreaterThan(one(2.05));
	});
});
