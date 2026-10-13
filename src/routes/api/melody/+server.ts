import { error, json } from '@sveltejs/kit';
import { addSong, listSongs } from '#lib/melody/songs.server.ts';
import type { RequestHandler } from './$types';

/** GET → the songs in blender/melody-bounce/songs (names without .mid). */
export const GET: RequestHandler = async () => {
	// local only: it runs Python and LilyPond on this machine
	if (!import.meta.env.DEV) error(404, 'Not found');
	return json(await listSongs());
};

/** POST a form with a `file` (.mid) → { song } it was saved as. 400 for anything that isn't a MIDI, 409 when a song
 * of that name is already there. */
export const POST: RequestHandler = async ({ request }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	const file = (await request.formData().catch(() => null))?.get('file');
	if (!(file instanceof File)) error(400, 'send the MIDI as the form field "file"');
	try {
		return json({ song: await addSong(file.name, new Uint8Array(await file.arrayBuffer())) }, { status: 201 });
	} catch (e) {
		if (e instanceof RangeError) error(400, e.message);
		if ((e as NodeJS.ErrnoException).code === 'EEXIST') error(409, `there is already a song called that: rename the file`);
		throw e;
	}
};
