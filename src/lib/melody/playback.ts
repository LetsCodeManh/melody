/** The parts of an AudioContext playback uses. */
export type AudioClock = Pick<AudioContext, 'currentTime' | 'destination' | 'createBufferSource' | 'resume' | 'state'> & {
	outputLatency?: number;
};

export interface Playback {
	/** Song time in seconds now, as heard: everything on screen is drawn at this time. */
	time(): number;
	readonly playing: boolean;
	play(): void;
	pause(): void;
	seek(t: number): void;
	dispose(): void;
}

/** Plays the song's audio and keeps the song time by the audio clock, so the picture can't drift from the sound.
 * The audio starts at song time 0; time runs from start (before the first note) to end, where it stops. */
export function createPlayback(audio: AudioBuffer, ctx: AudioClock, start: number, end: number, onStop = () => {}): Playback {
	let source: AudioBufferSourceNode | undefined;
	let zero = 0; // audio clock time at song time 0, while playing
	let at = start; // song time, while paused
	// sound scheduled for now is heard outputLatency later; the picture shows what is heard
	const heard = () => ctx.currentTime - (ctx.outputLatency ?? 0) - zero;

	const stop = () => {
		if (!source) return;
		source.onended = null;
		source.stop();
		source.disconnect();
		source = undefined;
	};
	const playback: Playback = {
		time() {
			if (!source) return at;
			const t = heard();
			if (t < end) return t;
			stop();
			at = end;
			onStop();
			return end;
		},
		get playing() {
			return !!source;
		},
		play() {
			if (source) return;
			if (at >= end) at = start;
			if (ctx.state === 'suspended') void ctx.resume();
			source = ctx.createBufferSource();
			source.buffer = audio;
			source.connect(ctx.destination);
			const now = ctx.currentTime;
			zero = now - at;
			// before the first note: wait for it; after: start part way into the audio
			source.start(now + Math.max(0, -at), Math.max(0, at));
		},
		pause() {
			if (!source) return;
			at = Math.min(heard(), end);
			stop();
		},
		seek(t) {
			const was = !!source;
			stop();
			at = Math.min(Math.max(t, start), end);
			if (was) playback.play();
		},
		dispose: stop
	};
	return playback;
}
