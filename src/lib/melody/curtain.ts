/** The curtain round a song: before its first frame the light rises from black as the camera eases in; after its last
 * the light fades to black as the camera drifts back. Seconds, on the song's clock, added to either end of its frames. */
export const INTRO = 2.5;
export const OUTRO = 5;
const RISE = 0.6; // how much further back the camera starts, as a share of where the song's first frame has it
const PULL = 1.2; // how much further back it ends up

type Span = { start: number; end: number };

/** The time the playback runs: the song's frames with the curtain either side. */
export const withCurtain = ({ start, end }: Span): Span => ({ start: start - INTRO, end: end + OUTRO });

const ease = (u: number) => {
	const x = Math.min(Math.max(u, 0), 1);
	return x * x * (3 - 2 * x);
};

/** How the scene looks at song time t, for a song whose frames span `frames`: `light` scales everything seen (0 is
 * black), `back` scales how far back the camera stands. Both are 1 all through the song itself. */
export function curtainAt(frames: Span, t: number): { light: number; back: number } {
	if (t < frames.start) {
		const u = ease((t - frames.start + INTRO) / INTRO);
		return { light: u, back: 1 + RISE * (1 - u) };
	}
	if (t > frames.end) {
		const u = ease((t - frames.end) / OUTRO);
		return { light: 1 - u, back: 1 + PULL * u };
	}
	return { light: 1, back: 1 };
}

export type Screen = 'loading' | 'title' | 'end';

/** The card for a song that is ready: waiting at its start, or played to its end. `run` is the playback's whole time,
 * curtain included; nothing shows while it plays, mid-song, or before there is a song. */
export function screenAt(state: { playing: boolean; t: number; run: Span }): Screen | undefined {
	if (state.playing || state.run.end <= state.run.start) return;
	if (state.t <= state.run.start) return 'title';
	if (state.t >= state.run.end) return 'end';
}
