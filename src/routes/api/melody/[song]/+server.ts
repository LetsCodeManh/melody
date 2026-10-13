import { error, json } from '@sveltejs/kit';
import { preparedForRequest } from '#lib/melody/songs.server.ts';
import type { Prepared } from '#lib/melody/melody.ts';
import type { RequestHandler } from './$types';

/** GET → the song's flights, camera and settings (Prepared); the first time, it waits for prepare.py (~20 s). */
export const GET: RequestHandler = async ({ params }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	const data = await preparedForRequest(params.song);
	const song: Prepared = { page: data.page, end: data.end, flights: data.flights, held: data.held, notes: data.notes, camera: data.camera, settings: data.settings };
	return json(song);
};
