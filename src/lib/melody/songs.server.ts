import { execFile } from 'node:child_process';
import { access, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { error } from '@sveltejs/kit';
import type { Prepared } from './melody';

/** The Blender project does the music work (MIDI, LilyPond engraving, flights, camera, audio); the page reuses it. */
const ROOT = path.resolve('blender/melody-bounce');
const SONGS = path.join(ROOT, 'songs');
const BUILD = path.join(ROOT, 'build');
const TRASH = path.join(os.homedir(), '.Trash'); // macOS: Finder's Put Back finds it there
// a change to any of these changes what prepare.py writes
const SOURCES = ['prepare.py', 'midi.py', 'meter.py', 'score.py', 'flight.py', 'synth.py', 'settings.py'].map((f) => path.join(ROOT, f));
const NAME = /^[\w-]+$/;
const LARGEST = 2 * 1024 * 1024; // bytes: a long piano piece is well under 200 KB

/** prepare.py's output, with the paths of the files it wrote. */
export interface PreparedFiles extends Prepared {
	score: string;
	wav: string;
}

/** What the page gets of a prepared song: without the paths of the files on this machine. */
export function forPage(data: Prepared): Prepared {
	const { page, end, flights, held, ties, notes, camera, settings } = data;
	return { page, end, flights, held, ties, notes, camera, settings };
}

export async function listSongs(): Promise<string[]> {
	return (await readdir(SONGS)).filter((f) => f.endsWith('.mid')).map((f) => f.slice(0, -4)).sort();
}

/** A song's name from its file's: lower case, words joined by dashes ("All of Me (Piano).mid" → "all-of-me-piano"). */
export function songName(file: string): string {
	const name = file
		.replace(/\.midi?$/i, '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // accents off: é → e
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	if (!name) throw new RangeError(`"${file}" has no letters or digits to name the song by`);
	return name;
}

/** Throws unless the bytes look like a standard MIDI file of a sensible size. */
export function checkMidi(bytes: Uint8Array): void {
	if (bytes.length > LARGEST) throw new RangeError(`the file is ${(bytes.length / 1048576).toFixed(1)} MB; a MIDI over 2 MB isn't a song`);
	if (bytes.length < 14 || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'MThd') throw new RangeError('not a MIDI file (.mid)');
}

/** Saves an uploaded MIDI into songs/ and returns the song's name. Never replaces a song: an existing name throws
 * (code EEXIST). Whether it engraves is found out when it is first prepared. */
export async function addSong(file: string, bytes: Uint8Array): Promise<string> {
	checkMidi(bytes);
	const name = songName(file);
	await writeFile(path.join(SONGS, name + '.mid'), bytes, { flag: 'wx' });
	return name;
}

const running = new Map<string, Promise<unknown>>();
const modified = (file: string) => stat(file).then((s) => s.mtimeMs, () => -Infinity);

/** The song's MIDI file; throws for a name that isn't a song in songs/. */
async function songFile(song: string): Promise<string> {
	if (!NAME.test(song) || !(await listSongs()).includes(song)) throw new RangeError(`no song "${song}"`);
	return path.join(SONGS, song + '.mid');
}

/** The song's prepared data; prepares it first (~20 s) when it never was, or the MIDI or the code changed since.
 * Throws for a name that isn't a song in songs/. */
export async function prepared(song: string): Promise<PreparedFiles> {
	const midi = await songFile(song);
	const out = path.join(BUILD, song + '.json');
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

/** Moves the song's MIDI to the Trash, where it can be put back, and removes what was built from it (made again if it
 * returns). Waits for a prepare still running, so it can't write the build back afterwards. Throws for a name that
 * isn't a song in songs/. */
export async function deleteSong(song: string): Promise<void> {
	const midi = await songFile(song);
	await running.get(song)?.catch(() => {});
	await moveToTrash(midi, TRASH);
	// names are letters, digits, _ and -, so the dot ends the song's name: all-of-me.* is never all-of-me-piano's
	const built = (await readdir(BUILD).catch(() => [])).filter((f) => f.startsWith(song + '.'));
	await Promise.all(built.map((f) => rm(path.join(BUILD, f), { recursive: true, force: true })));
}

/** Moves a file into the trash folder, under a dated name if one of its name is already there; returns where it went. */
export async function moveToTrash(file: string, trash: string): Promise<string> {
	await access(trash); // no Trash here: fail rather than delete outright
	const { name, ext } = path.parse(file);
	let to = path.join(trash, name + ext);
	if (await access(to).then(() => true, () => false)) {
		to = path.join(trash, `${name} ${new Date().toISOString().replace(/[:.]/g, '-')}${ext}`);
	}
	await rename(file, to);
	return to;
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
