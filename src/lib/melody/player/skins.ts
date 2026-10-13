// the looks: base.css and one file per skin, each styling everything under `.melody[data-skin=…]`
import.meta.glob('./skins/*.css', { eager: true });

/** The player's looks. Each styles the player, the song picker, the key list and the messages. */
export const SKINS = [
	{ id: 'hairline', name: 'Hairline', intent: 'almost nothing: one line of light along the bottom edge' },
	{ id: 'brass', name: 'Brass', intent: 'a concert programme: gold rules, small caps, old-style figures' },
	{ id: 'terminal', name: 'Terminal', intent: 'a command line, its progress in blocks' },
	{ id: 'island', name: 'Island', intent: 'a black pill at the top that opens when you reach for it' }
] as const;

export type Skin = (typeof SKINS)[number]['id'];

/** The skin `step` places along from `from`, wrapping round; an unknown one starts from the first. */
export function skinAfter(from: string, step: number): Skin {
	const i = Math.max(
		SKINS.findIndex((s) => s.id === from),
		0
	);
	return SKINS[(((i + step) % SKINS.length) + SKINS.length) % SKINS.length].id;
}
