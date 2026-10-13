import { error, json } from '@sveltejs/kit';
import { listSongs } from '#lib/melody/songs.server.ts';
import type { RequestHandler } from './$types';

/** GET → the songs in blender/melody-bounce/songs (names without .mid). */
export const GET: RequestHandler = async () => {
	// local only: it runs Python and LilyPond on this machine
	if (!import.meta.env.DEV) error(404, 'Not found');
	return json(await listSongs());
};
