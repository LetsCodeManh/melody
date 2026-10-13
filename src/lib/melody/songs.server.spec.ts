import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkMidi, moveToTrash, songName } from './songs.server';

describe('songName', () => {
	it('names a song from its file in lower-case words joined by dashes', () => {
		expect(songName('All of Me (Piano).mid')).toBe('all-of-me-piano');
		expect(songName('Clair_de_Lune.MIDI')).toBe('clair-de-lune');
		expect(songName('Für Élise.mid')).toBe('fur-elise');
	});
	it('can’t be steered out of songs/, and needs something to name it by', () => {
		expect(songName('../../etc/passwd.mid')).toBe('etc-passwd');
		expect(() => songName('???.mid')).toThrow(RangeError);
	});
});

describe('checkMidi', () => {
	const midi = (extra = 10) => new Uint8Array([...new TextEncoder().encode('MThd'), ...new Array(extra).fill(0)]);
	it('takes a standard MIDI file', () => {
		expect(() => checkMidi(midi())).not.toThrow();
	});
	it('turns away anything else, and anything too big to be a song', () => {
		expect(() => checkMidi(new TextEncoder().encode('RIFF....WAVEfmt '))).toThrow(/not a MIDI/);
		expect(() => checkMidi(midi(3 * 1024 * 1024))).toThrow(/MB/);
	});
});

describe('moveToTrash', () => {
	const folders = async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'melody-trash-'));
		const song = path.join(root, 'tune.mid');
		await writeFile(song, 'new');
		return { root, song };
	};
	it('moves the file into the trash under its own name', async () => {
		const { root, song } = await folders();
		const trash = await mkdtemp(path.join(os.tmpdir(), 'melody-trash-'));
		expect(await moveToTrash(song, trash)).toBe(path.join(trash, 'tune.mid'));
		expect(await readdir(trash)).toEqual(['tune.mid']);
		expect(await readdir(root)).toEqual([]);
	});
	it('keeps a song of the same name already in the trash, dating the newcomer', async () => {
		const { song } = await folders();
		const trash = await mkdtemp(path.join(os.tmpdir(), 'melody-trash-'));
		await writeFile(path.join(trash, 'tune.mid'), 'old');
		const to = await moveToTrash(song, trash);
		expect(path.basename(to)).toMatch(/^tune \d{4}-\d\d-\d\dT[\d-]+Z\.mid$/);
		expect(await readFile(path.join(trash, 'tune.mid'), 'utf8')).toBe('old');
		expect(await readFile(to, 'utf8')).toBe('new');
	});
	it('leaves the file where it is when there is no trash', async () => {
		const { root, song } = await folders();
		await expect(moveToTrash(song, path.join(root, 'no-trash'))).rejects.toThrow(/ENOENT/);
		expect(await readdir(root)).toEqual(['tune.mid']);
	});
});
