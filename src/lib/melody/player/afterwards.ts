/** What plays once a song has played to its end. */
export const AFTERWARDS = [
	{ id: 'stop', then: 'stop' },
	{ id: 'next', then: 'the next song' },
	{ id: 'again', then: 'this song again' }
] as const;

export type Afterwards = (typeof AFTERWARDS)[number]['id'];

/** The setting after `from`, wrapping round; an unknown one counts as stop. */
export function afterwardsAfter(from: string): Afterwards {
	const i = Math.max(
		AFTERWARDS.findIndex((a) => a.id === from),
		0
	);
	return AFTERWARDS[(i + 1) % AFTERWARDS.length].id;
}

/** The song to play once `song` has ended, if any: the next one along wraps round to the first. */
export function songAfter(songs: string[], song: string, afterwards: Afterwards): string | undefined {
	if (afterwards === 'stop') return;
	if (afterwards === 'again') return song;
	return songs[(songs.indexOf(song) + 1) % songs.length];
}

/** What previous or next (`by`) does `into` seconds into `song`: the song along, wrapping round, or, for previous
 * past the song's first `restarts` seconds, its own start again, as on a music player. */
export function stepFrom(songs: string[], song: string, by: 1 | -1, into: number, restarts: number): { restart: true } | { song: string } {
	if (by < 0 && into > restarts) return { restart: true };
	return { song: songs[(((songs.indexOf(song) + by) % songs.length) + songs.length) % songs.length] };
}
