export type Action =
	| 'toggle'
	| 'back'
	| 'forward'
	| 'restart'
	| 'next'
	| 'previous'
	| 'afterwards'
	| 'songs'
	| 'add'
	| 'hide'
	| 'fullscreen'
	| 'skin'
	| 'skinBack'
	| 'help'
	| 'close';

interface Shortcut {
	action: Action;
	/** KeyboardEvent.key values, compared case-blind */
	keys: string[];
	/** when set, Shift must be held (true) or not (false) */
	shift?: boolean;
	show: string;
	does: string;
}

export const SHORTCUTS: Shortcut[] = [
	{ action: 'toggle', keys: [' '], show: 'Space', does: 'Play / pause' },
	{ action: 'back', keys: ['ArrowLeft'], show: '←', does: 'Back 5 s' },
	{ action: 'forward', keys: ['ArrowRight'], show: '→', does: 'Forward 5 s' },
	{ action: 'restart', keys: ['0', 'Home'], show: '0', does: 'From the start' },
	{ action: 'next', keys: ['n'], show: 'N', does: 'Next song' },
	{ action: 'previous', keys: ['p'], show: 'P', does: 'Previous song' },
	{ action: 'afterwards', keys: ['l'], show: 'L', does: 'After each song: stop, play the next, or play it again' },
	{ action: 'songs', keys: ['s', '/'], show: 'S', does: 'Pick a song' },
	{ action: 'add', keys: ['a'], show: 'A', does: 'Add a song (.mid), or drop one on the page' },
	{ action: 'hide', keys: ['h'], show: 'H', does: 'Hide / show the player' },
	{ action: 'fullscreen', keys: ['f'], show: 'F', does: 'Full screen' },
	{ action: 'skin', keys: ['t'], shift: false, show: 'T', does: 'Next player style' },
	{ action: 'skinBack', keys: ['t'], shift: true, show: '⇧ T', does: 'Previous player style' },
	{ action: 'help', keys: ['?'], show: '?', does: 'These keys' },
	{ action: 'close', keys: ['Escape'], show: 'Esc', does: 'Close' }
];

type Press = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>;

/** What a key press asks the player to do, if anything. `target` is what has focus: typing in a text field means no
 * shortcuts, and a focused button already plays its own click on Space. Browser shortcuts (⌘, Ctrl, Alt) pass through. */
export function actionFor(press: Press, target: 'text' | 'button' | 'other'): Action | undefined {
	if (press.metaKey || press.ctrlKey || press.altKey || target === 'text') return;
	const key = press.key.toLowerCase();
	const hit = SHORTCUTS.find((s) => s.keys.some((k) => k.toLowerCase() === key) && (s.shift ?? press.shiftKey) === press.shiftKey);
	if (hit?.action === 'toggle' && target === 'button') return;
	return hit?.action;
}
