import { describe, expect, it } from 'vitest';
import { poolShare } from './landings';

describe('poolShare', () => {
	const every = (gap: number, n: number) => Array.from({ length: n }, (_, i) => i * gap);

	it('dims a pool smoothly as newer notes land, dark by the time one takes its light', () => {
		const lands = every(0.5, 12);
		let [last, jump] = [poolShare(lands, 0, 0), 0];
		for (let ms = 1; ms <= 6000; ms++) {
			const share = poolShare(lands, 0, ms / 1000);
			jump = Math.max(jump, Math.abs(share - last));
			last = share;
		}
		expect(jump).toBeLessThan(0.01);
		expect(poolShare(lands, 0, 3.99)).toBeCloseTo(0, 2);
		expect(poolShare(lands, 0, 4)).toBe(0); // the 8th newer landing: its light is handed on
	});
	it('keeps the newest pool at full strength', () => {
		expect(poolShare(every(0.5, 4), 3, 1.5)).toBe(1);
		expect(poolShare(every(0.5, 4), 3, 9)).toBe(1);
	});
	it('is dark before its note lands', () => {
		expect(poolShare(every(0.5, 4), 2, 0.9)).toBe(0);
	});
});
