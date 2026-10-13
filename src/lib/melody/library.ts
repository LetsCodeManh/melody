/** Where the page finds its songs. Under `pnpm dev` the server prepares any MIDI in songs/ when it is opened, and songs
 * can be added and deleted; a built site has no server for that (no Python or LilyPond) and plays the songs published
 * into static/songs (pnpm publish-song). */
export function library(live: boolean) {
	const at = live ? '/api/melody' : '/songs';
	return {
		/** songs can be added and deleted */
		editable: live,
		/** the song names, as a JSON array */
		list: live ? at : `${at}/index.json`,
		/** a song's data (Prepared), engraved score and audio */
		files(song: string) {
			const base = `${at}/${encodeURIComponent(song)}`;
			return { data: live ? base : `${base}/song.json`, score: `${base}/score.svg`, audio: `${base}/audio.${live ? 'wav' : 'flac'}` };
		}
	};
}
