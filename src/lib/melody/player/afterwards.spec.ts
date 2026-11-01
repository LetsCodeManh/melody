import { describe, expect, it } from 'vitest';
import { afterwardsAfter, songAfter, stepFrom } from './afterwards';

describe('afterwardsAfter', () => {
	it('goes stop, the next song, this one again, and round', () => {
		expect(afterwardsAfter('stop')).toBe('next');
		expect(afterwardsAfter('next')).toBe('again');
		expect(afterwardsAfter('again')).toBe('stop');
	});
	it('starts from stop for a setting it doesn’t know', () => {
		expect(afterwardsAfter('gone')).toBe('next');
	});
});

describe('songAfter', () => {
	const songs = ['a', 'b', 'c'];
	it('stops, or plays the same song again', () => {
		expect(songAfter(songs, 'b', 'stop')).toBeUndefined();
		expect(songAfter(songs, 'b', 'again')).toBe('b');
	});
	it('plays the next song, wrapping round to the first', () => {
		expect(songAfter(songs, 'b', 'next')).toBe('c');
		expect(songAfter(songs, 'c', 'next')).toBe('a');
	});
	it('plays the only song again, and the first after one no longer in the list', () => {
		expect(songAfter(['a'], 'a', 'next')).toBe('a');
		expect(songAfter(songs, 'gone', 'next')).toBe('a');
		expect(songAfter([], 'gone', 'next')).toBeUndefined();
	});
});

describe('stepFrom', () => {
	const songs = ['a', 'b', 'c'];
	it('goes to the next song, and from the last round to the first', () => {
		expect(stepFrom(songs, 'a', 1, 0, 3)).toEqual({ song: 'b' });
		expect(stepFrom(songs, 'c', 1, 50, 3)).toEqual({ song: 'a' });
	});
	it('goes to the previous song in its first seconds, from the first round to the last', () => {
		expect(stepFrom(songs, 'b', -1, 2, 3)).toEqual({ song: 'a' });
		expect(stepFrom(songs, 'a', -1, 3, 3)).toEqual({ song: 'c' });
	});
	it('goes back to the start of the song once past its first seconds', () => {
		expect(stepFrom(songs, 'b', -1, 3.01, 3)).toEqual({ restart: true });
	});
	it('steps along a list of one to the same song', () => {
		expect(stepFrom(['a'], 'a', 1, 10, 3)).toEqual({ song: 'a' });
	});
});
