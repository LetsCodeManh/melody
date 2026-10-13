import * as THREE from 'three';
import type { Prepared } from './melody';

/** Low to high across the song's own range: azure in the bass, orchid in the middle, amber at the top. Saturated well
 * past what shows: the tone mapping washes bright light out towards white. */
const PALETTE = [new THREE.Color(0.03, 0.3, 1.0), new THREE.Color(0.85, 0.12, 0.9), new THREE.Color(1.0, 0.5, 0.1)];
const DECAY = 0.15; // s for a landing's kick to the pulse to die to a third

export interface Look {
	colour: THREE.Color;
	/** 0 lightest to 1 heaviest: how hard the note lands, from its loudness and length within the song */
	weight: number;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

function along(u: number) {
	const at = u * (PALETTE.length - 1);
	const i = Math.min(Math.floor(at), PALETTE.length - 2);
	return new THREE.Color().lerpColors(PALETTE[i], PALETTE[i + 1], at - i);
}

/** Every note's colour and weight, by note index. Relative to the song, so a quiet song still has heavy notes. */
export function noteLooks({ notes }: Prepared): Look[] {
	const pitches = notes.map(([p]) => p).sort((a, b) => a - b);
	// the 5th to 95th percentile, so a few stray low notes don't push every other note to the warm end
	const lo = pitches[Math.floor(0.05 * (pitches.length - 1))];
	const hi = pitches[Math.ceil(0.95 * (pitches.length - 1))];
	let [quiet, loud] = [Infinity, -Infinity];
	for (const [, v] of notes) [quiet, loud] = [Math.min(quiet, v), Math.max(loud, v)];
	return notes.map(([pitch, velocity, length]) => {
		// MIDI exported from a sequencer often has one velocity throughout: then length alone decides
		const loudness = loud > quiet ? (velocity - quiet) / (loud - quiet) : 0.5;
		// an eighth of a second or shorter lands lightest, two seconds or longer heaviest
		const longness = clamp01(Math.log2(length / 0.125) / 4);
		return { colour: along(hi > lo ? clamp01((pitch - lo) / (hi - lo)) : 0.5), weight: (loudness + longness) / 2 };
	});
}

/** How hard the music is landing at song time t, 0 to 1: each landing kicks it by its weight, dying away within
 * a fraction of a second; a chord or a run kicks harder, saturating softly. */
export function createPulse(song: Prepared, looks: Look[]): (t: number) => number {
	const landings = song.flights.map(([note, , land]) => [land, 0.4 + 0.6 * looks[note].weight]).sort((a, b) => a[0] - b[0]);
	return (t) => {
		let [lo, hi] = [0, landings.length];
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (landings[mid][0] <= t) lo = mid + 1;
			else hi = mid;
		}
		let level = 0;
		for (let i = lo - 1; i >= 0 && t - landings[i][0] < 5 * DECAY; i--) level += landings[i][1] * Math.exp(-(t - landings[i][0]) / DECAY);
		return 1 - Math.exp(-level);
	};
}
