import { describe, expect, it } from 'vitest';
import { actionFor } from './shortcuts';

const press = (key: string, more: Partial<KeyboardEvent> = {}) =>
	({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...more }) as KeyboardEvent;

describe('actionFor', () => {
	it('maps keys to actions, whatever their case', () => {
		expect(actionFor(press(' '), 'other')).toBe('toggle');
		expect(actionFor(press('N'), 'other')).toBe('next');
		expect(actionFor(press('l'), 'other')).toBe('afterwards');
		expect(actionFor(press('ArrowLeft'), 'other')).toBe('back');
		expect(actionFor(press('x'), 'other')).toBeUndefined();
	});
	it('tells T from Shift T, and lets ? through with its Shift', () => {
		expect(actionFor(press('t'), 'other')).toBe('skin');
		expect(actionFor(press('T', { shiftKey: true }), 'other')).toBe('skinBack');
		expect(actionFor(press('?', { shiftKey: true }), 'other')).toBe('help');
	});
	it('leaves browser shortcuts, typing, and a focused button’s Space alone', () => {
		expect(actionFor(press('f', { metaKey: true }), 'other')).toBeUndefined();
		expect(actionFor(press('s'), 'text')).toBeUndefined();
		expect(actionFor(press(' '), 'button')).toBeUndefined();
		expect(actionFor(press('n'), 'button')).toBe('next');
	});
});
