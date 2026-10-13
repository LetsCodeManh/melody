import { describe, expect, it } from 'vitest';
import { library } from './library';

describe('library', () => {
	it('under pnpm dev, asks the server, which prepares the song and can add and delete songs', () => {
		const songs = library(true);
		expect(songs.editable).toBe(true);
		expect(songs.list).toBe('/api/melody');
		expect(songs.files('bach')).toEqual({ data: '/api/melody/bach', score: '/api/melody/bach/score.svg', audio: '/api/melody/bach/audio.wav' });
	});
	it('on a built site, reads the published files as they lie in static/songs', () => {
		const songs = library(false);
		expect(songs.editable).toBe(false);
		expect(songs.list).toBe('/songs/index.json');
		expect(songs.files('bach')).toEqual({ data: '/songs/bach/song.json', score: '/songs/bach/score.svg', audio: '/songs/bach/audio.flac' });
	});
});
