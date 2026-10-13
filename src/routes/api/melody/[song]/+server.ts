import { error, json } from '@sveltejs/kit';
import { deleteSong, forPage, preparedForRequest } from '#lib/melody/songs.server.ts';
import type { RequestHandler } from './$types';

/** GET → the song's flights, camera and settings (Prepared); the first time, it waits for prepare.py (~20 s). */
export const GET: RequestHandler = async ({ params }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	return json(forPage(await preparedForRequest(params.song)));
};

/** DELETE → the song's MIDI goes to the Trash and its built files away; 204, or 404 for a song that isn't there. */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	try {
		await deleteSong(params.song);
	} catch (e) {
		if (e instanceof RangeError) error(404, e.message);
		throw e;
	}
	return new Response(null, { status: 204 });
};
