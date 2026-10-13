import { describe, expect, it } from 'vitest';
import { afterwardsAfter, songAfter } from './afterwards';

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
