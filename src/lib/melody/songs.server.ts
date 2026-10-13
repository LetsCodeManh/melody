import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { error } from '@sveltejs/kit';
import type { Prepared } from './melody';

/** The Blender project does the music work (MIDI, LilyPond engraving, flights, camera, audio); the page reuses it. */
const ROOT = path.resolve('blender/melody-bounce');
const SONGS = path.join(ROOT, 'songs');
// a change to any of these changes what prepare.py writes
const SOURCES = ['prepare.py', 'midi.py', 'score.py', 'flight.py', 'synth.py', 'settings.py'].map((f) => path.join(ROOT, f));
const NAME = /^[\w-]+$/;

/** prepare.py's output, with the paths of the files it wrote. */
export interface PreparedFiles extends Prepared {
	score: string;
	wav: string;
}

export async function listSongs(): Promise<string[]> {
	return (await readdir(SONGS)).filter((f) => f.endsWith('.mid')).map((f) => f.slice(0, -4)).sort();
}

const running = new Map<string, Promise<unknown>>();
const modified = (file: string) => stat(file).then((s) => s.mtimeMs, () => -Infinity);

/** The song's prepared data; prepares it first (~20 s) when it never was, or the MIDI or the code changed since.
 * Throws for a name that isn't a song in songs/. */
export async function prepared(song: string): Promise<PreparedFiles> {
	if (!NAME.test(song) || !(await listSongs()).includes(song)) throw new RangeError(`no song "${song}"`);
	const midi = path.join(SONGS, song + '.mid');
	const out = path.join(ROOT, 'build', song + '.json');
	const newest = Math.max(...(await Promise.all([midi, ...SOURCES].map(modified))));
	if ((await modified(out)) < newest) {
		// one run per song, however many requests ask while it runs
		let job = running.get(song);
		if (!job) {
			job = promisify(execFile)('python3', [path.join(ROOT, 'prepare.py'), midi], { cwd: ROOT, timeout: 600_000 })
				.finally(() => running.delete(song));
			running.set(song, job);
		}
		await job;
	}
	return JSON.parse(await readFile(out, 'utf8'));
}

/** prepared(), its failures as HTTP errors: 404 for an unknown song, 500 with prepare.py's last words. */
export async function preparedForRequest(song: string): Promise<PreparedFiles> {
	try {
		return await prepared(song);
	} catch (e) {
		if (e instanceof RangeError) error(404, e.message);
		// LilyPond failing, an unreadable MIDI, a note without a head: the end of the traceback says which
		const stderr = (e as { stderr?: string }).stderr?.trim().split('\n').slice(-3).join('\n');
		error(500, stderr || (e as Error).message);
	}
}
