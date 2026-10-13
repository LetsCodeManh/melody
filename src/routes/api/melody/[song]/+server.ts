import { error, json } from '@sveltejs/kit';
import { deleteSong, preparedForRequest } from '#lib/melody/songs.server.ts';
import type { Prepared } from '#lib/melody/melody.ts';
import type { RequestHandler } from './$types';

/** GET → the song's flights, camera and settings (Prepared); the first time, it waits for prepare.py (~20 s). */
export const GET: RequestHandler = async ({ params }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	const data = await preparedForRequest(params.song);
	const song: Prepared = { page: data.page, end: data.end, flights: data.flights, held: data.held, notes: data.notes, camera: data.camera, settings: data.settings };
	return json(song);
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
