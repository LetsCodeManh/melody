import { describe, expect, it } from 'vitest';
import { curtainAt, INTRO, OUTRO, screenAt, withCurtain } from './curtain';

const frames = { start: -1, end: 60 };
const run = withCurtain(frames);

describe('curtainAt', () => {
	it('rises from black, the camera further back, to the song’s own look at its first frame', () => {
		expect(run.start).toBe(-1 - INTRO);
		expect(curtainAt(frames, run.start)).toEqual({ light: 0, back: 1.6 });
		const mid = curtainAt(frames, run.start + INTRO / 2);
		expect(mid.light).toBeCloseTo(0.5);
		expect(mid.back).toBeCloseTo(1.3);
		expect(curtainAt(frames, frames.start)).toEqual({ light: 1, back: 1 });
	});
	it('leaves the song alone', () => {
		expect(curtainAt(frames, 30)).toEqual({ light: 1, back: 1 });
	});
	it('fades to black, drifting back, after the last frame, and holds there', () => {
		expect(run.end).toBe(60 + OUTRO);
		expect(curtainAt(frames, frames.end)).toEqual({ light: 1, back: 1 });
		const last = curtainAt(frames, run.end);
		expect(last.light).toBeCloseTo(0);
		expect(last.back).toBeCloseTo(2.2);
		expect(curtainAt(frames, run.end + 9)).toEqual(last);
	});
});

describe('screenAt', () => {
	const at = (t: number, more = {}) => screenAt({ playing: false, t, run, ...more });

	it('shows the title at the start and the end card at the end, while paused', () => {
		expect(at(run.start)).toBe('title');
		expect(at(run.end)).toBe('end');
		expect(at(30)).toBeUndefined();
	});
	it('shows nothing while playing, or before there is a song', () => {
		expect(at(run.start, { playing: true })).toBeUndefined();
		expect(screenAt({ playing: false, t: 0, run: { start: 0, end: 0 } })).toBeUndefined();
	});
});
