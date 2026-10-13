// Puts songs on the deployed site, which can't prepare them (no Python or LilyPond there): pnpm publish-song <song>…
// To take one off, delete its folder in static/songs and run it with no song: that only rewrites the list.
import { publishSong, writePublishedList } from '#lib/melody/songs.server.ts';

for (const song of process.argv.slice(2)) {
	await publishSong(song);
	console.log(`published ${song}`);
}
console.log(`on the site: ${(await writePublishedList()).join(', ') || 'no songs'}`);
