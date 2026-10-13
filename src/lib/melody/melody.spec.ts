import { describe, expect, it } from 'vitest';
import { duration, framingAt, type Prepared } from './melody';
import { createPlayback, type AudioClock } from './playback';

const song = {
	camera: { centre: [0, 10, 20, 30], back: [1, 1, 2, 2] },
	settings: { fps: 2, lead: 1 }
} as unknown as Prepared;

describe('framingAt', () => {
	it('follows the per-frame samples from -lead and blends between them', () => {
		expect(framingAt(song, -1)).toEqual({ centre: 0, back: 1 });
		expect(framingAt(song, -0.25)).toEqual({ centre: 15, back: 1.5 });
	});
	it('holds the first and last sample outside the song', () => {
		expect(framingAt(song, -5)).toEqual({ centre: 0, back: 1 });
		expect(framingAt(song, 9)).toEqual({ centre: 30, back: 2 });
		expect(duration(song)).toEqual({ start: -1, end: 0.5 });
	});
});

function fakeClock() {
	const started: [number, number][] = [];
	const ctx = {
		currentTime: 100,
		outputLatency: 0,
		state: 'running',
		destination: {},
		resume: async () => {},
		createBufferSource: () => ({ connect() {}, disconnect() {}, stop() {}, start: (when: number, offset: number) => started.push([when, offset]) })
	};
	return { ctx: ctx as unknown as AudioClock & { currentTime: number; outputLatency: number }, started };
}

describe('createPlayback', () => {
	it('waits for song time 0 before the audio starts, then keeps time by the audio clock', () => {
		const { ctx, started } = fakeClock();
		const p = createPlayback({} as AudioBuffer, ctx, -1, 10);
		p.play();
		expect(started).toEqual([[101, 0]]);
		ctx.currentTime = 102.5;
		expect(p.time()).toBe(1.5);
	});
	it('shows what is heard: output latency later', () => {
		const { ctx } = fakeClock();
		ctx.outputLatency = 0.05;
		const p = createPlayback({} as AudioBuffer, ctx, -1, 10);
		p.seek(2);
		p.play();
		ctx.currentTime = 101;
		expect(p.time()).toBeCloseTo(2.95);
	});
	it('pauses, seeks into the audio, and stops at the end', () => {
		const { ctx, started } = fakeClock();
		let stopped = 0;
		const p = createPlayback({} as AudioBuffer, ctx, -1, 10, () => stopped++);
		p.play();
		ctx.currentTime = 103;
		p.pause();
		ctx.currentTime = 200;
		expect([p.time(), p.playing]).toEqual([2, false]);
		p.seek(4);
		p.play();
		expect(started.at(-1)).toEqual([200, 4]);
		ctx.currentTime = 220;
		expect([p.time(), p.playing, stopped]).toEqual([10, false, 1]);
	});
});
