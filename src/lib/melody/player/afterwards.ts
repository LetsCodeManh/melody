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
