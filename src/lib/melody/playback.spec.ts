import { describe, expect, it, vi } from 'vitest';
import { createPlayback, type AudioClock } from './playback';

/** An audio clock that only moves when told to. */
function fakeClock() {
	const sources: { started?: [number, number]; stopped: boolean }[] = [];
	const ctx = {
		currentTime: 0,
		state: 'running',
		destination: {},
		resume: async () => {},
		createBufferSource() {
			const source = { started: undefined as [number, number] | undefined, stopped: false };
			sources.push(source);
			return Object.assign(source, {
				buffer: null,
				onended: null,
				connect() {},
				disconnect() {},
				start: (when: number, offset: number) => (source.started = [when, offset]),
				stop: () => (source.stopped = true)
			});
		}
	};
	return { ctx: ctx as unknown as AudioClock & { currentTime: number }, sources };
}

const audio = {} as AudioBuffer;

describe('createPlayback', () => {
	it('waits at the start, then keeps time by the audio clock', () => {
		const { ctx, sources } = fakeClock();
		const playback = createPlayback(audio, ctx, -2, 10);
		expect(playback.time()).toBe(-2);
		ctx.currentTime = 5;
		playback.play();
		expect(sources[0].started).toEqual([7, 0]); // the audio's 0 is 2 s away
		ctx.currentTime = 8;
		expect(playback.time()).toBe(-2 + 3);
	});

	it('stops at the end and says so, once; playing again starts over', () => {
		const { ctx, sources } = fakeClock();
		const onStop = vi.fn();
		const playback = createPlayback(audio, ctx, 0, 10, onStop);
		playback.play();
		ctx.currentTime = 12;
		expect(playback.time()).toBe(10);
		expect(playback.time()).toBe(10);
		expect(onStop).toHaveBeenCalledTimes(1);
		expect(playback.playing).toBe(false);
		expect(sources[0].stopped).toBe(true);
		playback.play();
		expect(playback.time()).toBe(0);
	});

	it('finds the end with nobody asking the time, as in a hidden tab, which draws no frames', () => {
		vi.useFakeTimers();
		try {
			const { ctx } = fakeClock();
			const onStop = vi.fn();
			const playback = createPlayback(audio, ctx, 0, 10, onStop);
			playback.play();
			ctx.currentTime = 9.9; // the audio clock runs a little behind the timers
			vi.advanceTimersByTime(10_000);
			expect(onStop).not.toHaveBeenCalled();
			ctx.currentTime = 10;
			vi.advanceTimersByTime(1_000);
			expect(onStop).toHaveBeenCalledTimes(1);
			expect(playback.playing).toBe(false);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('pausing, seeking and disposing leave no timer to fire', () => {
		vi.useFakeTimers();
		try {
			const { ctx } = fakeClock();
			const playback = createPlayback(audio, ctx, 0, 10);
			playback.play();
			playback.pause();
			expect(vi.getTimerCount()).toBe(0);
			playback.play();
			playback.seek(5);
			expect(vi.getTimerCount()).toBe(1);
			playback.dispose();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('pausing and seeking say nothing of an end', () => {
		const { ctx } = fakeClock();
		const onStop = vi.fn();
		const playback = createPlayback(audio, ctx, 0, 10, onStop);
		playback.play();
		ctx.currentTime = 4;
		playback.pause();
		expect(playback.time()).toBe(4);
		playback.seek(99);
		expect(playback.time()).toBe(10);
		expect(onStop).not.toHaveBeenCalled();
	});
});
