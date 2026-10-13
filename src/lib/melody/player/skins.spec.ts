import { describe, expect, it } from 'vitest';
import { SKINS, skinAfter } from './skins';

describe('skinAfter', () => {
	it('steps through the skins and wraps round both ways', () => {
		expect(skinAfter('hairline', 1)).toBe('brass');
		expect(skinAfter('hairline', -1)).toBe(SKINS.at(-1)!.id);
		expect(skinAfter(SKINS.at(-1)!.id, 1)).toBe('hairline');
	});
	it('starts from the first for a skin it doesn’t know', () => {
		expect(skinAfter('gone', 0)).toBe('hairline');
	});
});
