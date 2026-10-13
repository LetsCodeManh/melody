import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { preparedForRequest } from '#lib/melody/songs.server.ts';
import type { RequestHandler } from './$types';

const FILES = {
	'score.svg': { key: 'score', type: 'image/svg+xml' },
	'audio.wav': { key: 'wav', type: 'audio/wav' }
} as const;

/** GET → the song's engraved score (score.svg) or its audio (audio.wav). */
export const GET: RequestHandler = async ({ params }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	const file = FILES[params.file as keyof typeof FILES];
	if (!file) error(404, 'Not found');
	const data = await preparedForRequest(params.song);
	return new Response(await readFile(data[file.key]), { headers: { 'content-type': file.type } });
};
