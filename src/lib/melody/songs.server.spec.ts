import { describe, expect, it } from 'vitest';
import { checkMidi, songName } from './songs.server';

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
