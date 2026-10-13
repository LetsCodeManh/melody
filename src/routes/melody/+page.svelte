<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createStage, type Stage } from '#lib/melody/stage.ts';
	import { createPlayback, type Playback } from '#lib/melody/playback.ts';
	import { duration, type Prepared } from '#lib/melody/melody.ts';
	import Player from '#lib/melody/player/Player.svelte';
	import SongPicker from '#lib/melody/player/SongPicker.svelte';
	import Shortcuts from '#lib/melody/player/Shortcuts.svelte';
	import AddSong from '#lib/melody/player/AddSong.svelte';
	import Card from '#lib/melody/player/Card.svelte';
	import { screenAt, withCurtain } from '#lib/melody/curtain.ts';
	import { actionFor, SHORTCUTS, type Action } from '#lib/melody/player/shortcuts.ts';
	import { library } from '#lib/melody/library.ts';
	import { SKINS, skinAfter, type Skin } from '#lib/melody/player/skins.ts';
	import { AFTERWARDS, afterwardsAfter, songAfter, type Afterwards } from '#lib/melody/player/afterwards.ts';

	const IDLE = 3000; // ms without the pointer moving before the playing player fades away
	const SKIP = 5; // s the arrow keys jump
	const TITLE = 3000; // ms a song played on to shows its title before it starts
	const SLOW = 300; // ms a song may take to open before the loading card shows: a prepared one opens without a flash
	const songsAt = library(import.meta.env.DEV);
	const NO_SONGS = songsAt.editable ? 'No songs yet: press A to add a .mid, or drop one on the page.' : 'No songs published yet.';
	// the built site plays only published songs: adding one is `pnpm dev` on the machine with Python and LilyPond
	const shortcuts = SHORTCUTS.filter((s) => songsAt.editable || s.action !== 'add');

	let host: HTMLDivElement;
	let stage: Stage | undefined;
	let audio: AudioContext | undefined;
	let playback = $state.raw<Playback>();
	let songs = $state.raw<string[]>([]);
	let song = $state('');
	let span = $state.raw({ start: 0, end: 0 });
	let now = $state(0);
	let playing = $state(false);
	let preparing = $state(false);
	let slow = $state(false);
	let waited = $state(0);
	let error = $state('');
	let loading = 0;
	let skin = $state<Skin>(SKINS[0].id);
	let afterwards = $state<Afterwards>('stop');
	let hidden = $state(false);
	let idle = $state(false);
	let hover = $state(false);
	let picking = $state(false);
	let helping = $state(false);
	let adding = $state(false);
	let toast = $state('');
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let slowTimer: ReturnType<typeof setTimeout> | undefined;
	let waitTimer: ReturnType<typeof setInterval> | undefined;
	let titleTimer: ReturnType<typeof setTimeout> | undefined;
	let chooser: HTMLInputElement;
	const away = $derived(hidden || (playing && idle && !hover && !picking && !helping && !adding));
	const screen = $derived(preparing ? (slow ? 'loading' : undefined) : screenAt({ playing, t: now, run: span }));

	async function fetchOk(url: string, init?: RequestInit) {
		const res = await fetch(url, init);
		if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? res.statusText);
		return res;
	}

	/** Prepares the song if it needs to (the server runs prepare.py), then shows it at its start, paused; `playOn`: it
	 * starts by itself once its title has shown. */
	async function load(name: string, playOn = false) {
		const ticket = ++loading;
		clearTimeout(titleTimer);
		playback?.dispose();
		playback = undefined;
		error = '';
		setPreparing(true);
		try {
			const files = songsAt.files(name);
			const data: Prepared = await (await fetchOk(files.data)).json();
			const [svg, wav] = await Promise.all([
				fetchOk(files.score).then((r) => r.text()),
				fetchOk(files.audio).then((r) => r.arrayBuffer())
			]);
			const sound = await audio!.decodeAudioData(wav);
			if (ticket !== loading) return; // another song was picked meanwhile
			stage!.show(data, svg);
			span = withCurtain(duration(data));
			// at the end, from inside the frame asking the time: what comes next waits for that frame to finish
			playback = createPlayback(sound, audio!, span.start, span.end, () => setTimeout(playAfter));
			if (playOn) titleTimer = setTimeout(() => playback?.play(), TITLE);
			setPreparing(false);
			void goto(`?song=${encodeURIComponent(name)}`, { shallow: true, replace: true });
		} catch (e) {
			if (ticket !== loading) return;
			setPreparing(false);
			span = { start: 0, end: 0 };
			error = `${name}: ${(e as Error).message}`;
		}
	}

	function setPreparing(on: boolean) {
		preparing = on;
		slow = false;
		waited = 0;
		clearTimeout(slowTimer);
		clearInterval(waitTimer);
		if (!on) return;
		slowTimer = setTimeout(() => (slow = true), SLOW);
		waitTimer = setInterval(() => waited++, 1000);
	}

	// either takes over from a song waiting to start by itself
	const toggle = () => (clearTimeout(titleTimer), playback?.playing ? playback.pause() : playback?.play());
	const seek = (t: number) => (clearTimeout(titleTimer), playback?.seek(t));
	// from the playback's own clock, not `now`: that only catches up on the next frame, and keys can repeat faster
	const skip = (by: number) => playback && seek(playback.time() + by);

	function say(text: string) {
		toast = text;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2200);
	}

	function wake() {
		idle = false;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => (idle = true), IDLE);
	}

	function pick(name: string) {
		picking = false;
		if (name === song) return;
		song = name;
		load(name);
	}

	/** A song has played to its end: what comes after it, as `afterwards` says. */
	function playAfter() {
		const next = songAfter(songs, song, afterwards);
		if (!next) return;
		if (next === song) return playback?.play();
		song = next;
		load(next, true);
	}

	function setAfterwards(next: Afterwards) {
		afterwards = next;
		localStorage.setItem('melody.afterwards', next);
		say(`After each song: ${AFTERWARDS.find((a) => a.id === next)!.then}`);
		if (screen === 'end') playAfter(); // the end card's "L keep playing" means now
	}

	/** Saves a dropped or chosen .mid as a new song and opens it; the server says what's wrong with one it won't take. */
	async function addSong(file: File) {
		picking = adding = false;
		say(`Adding ${file.name}…`);
		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch('/api/melody', { method: 'POST', body: form });
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.message ?? res.statusText);
			songs = await (await fetchOk(songsAt.list)).json();
			say(`Added ${body.song}`);
			pick(body.song);
		} catch (e) {
			say(`${file.name}: ${(e as Error).message}`);
		}
	}

	/** Moves a song to the Trash; when it is the one playing, the next takes its place. */
	async function deleteSong(name: string) {
		try {
			await fetchOk(`/api/melody/${encodeURIComponent(name)}`, { method: 'DELETE' });
			const at = songs.indexOf(name);
			songs = await (await fetchOk(songsAt.list)).json();
			say(`Moved ${name.replaceAll('-', ' ')} to the Trash`);
			if (name !== song) return;
			song = songs[Math.min(at, songs.length - 1)] ?? '';
			if (song) return load(song);
			loading++; // a load still on its way shows nothing
			playback?.dispose();
			playback = undefined;
			setPreparing(false);
			span = { start: 0, end: 0 };
			now = 0; // the stage's loop, which keeps it, stops with the clear
			stage?.clear();
			error = NO_SONGS;
		} catch (e) {
			say(`${name}: ${(e as Error).message}`);
		}
	}

	const openAdding = () => ((picking = helping = false), (adding = true));

	const dragsFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

	function onDrop(e: DragEvent) {
		if (!dragsFiles(e)) return;
		e.preventDefault(); // even where it can't be added: the browser would leave the page to open the file
		if (!songsAt.editable) return say('Songs are added where the site is built from: see the README');
		const file = e.dataTransfer!.files[0];
		if (file) addSong(file);
	}

	function setSkin(next: Skin) {
		skin = next;
		localStorage.setItem('melody.skin', next);
		const i = SKINS.findIndex((s) => s.id === next);
		say(`${i + 1}/${SKINS.length} · ${SKINS[i].name}: ${SKINS[i].intent}`);
	}

	const actions: Record<Action, () => void> = {
		toggle,
		back: () => skip(-SKIP),
		forward: () => skip(SKIP),
		restart: () => seek(span.start),
		next: () => songs.length && pick(songs[(songs.indexOf(song) + 1) % songs.length]),
		previous: () => songs.length && pick(songs[(songs.indexOf(song) - 1 + songs.length) % songs.length]),
		afterwards: () => setAfterwards(afterwardsAfter(afterwards)),
		songs: () => ((helping = false), (picking = true)),
		add: () => songsAt.editable && openAdding(),
		hide: () => {
			hidden = !hidden;
			if (hidden) say('Player hidden · H to show it');
		},
		fullscreen: () =>
			void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch((e: Error) =>
				say(`Full screen: ${e.message}`)
			),
		skin: () => setSkin(skinAfter(skin, 1)),
		skinBack: () => setSkin(skinAfter(skin, -1)),
		help: () => ((picking = adding = false), (helping = !helping)),
		close: () => (picking = helping = adding = false)
	};

	function onKey(e: KeyboardEvent) {
		const t = e.target;
		const target = t instanceof HTMLInputElement && t.type !== 'range' ? 'text' : t instanceof HTMLButtonElement ? 'button' : 'other';
		const action = actionFor(e, target);
		if (!action || ((picking || adding) && action !== 'close')) return;
		e.preventDefault();
		wake();
		actions[action]();
	}

	onMount(() => {
		const saved = localStorage.getItem('melody.skin');
		if (saved) skin = skinAfter(saved, 0);
		const after = localStorage.getItem('melody.afterwards');
		afterwards = AFTERWARDS.find((a) => a.id === after)?.id ?? 'stop';
		wake();
		audio = new AudioContext();
		stage = createStage(host, () => {
			const t = playback?.time() ?? span.start;
			now = t;
			playing = playback?.playing ?? false;
			return t;
		});
		fetchOk(songsAt.list)
			.then((r) => r.json())
			.then((list: string[]) => {
				songs = list;
				const wanted = page.url.searchParams.get('song');
				song = wanted && list.includes(wanted) ? wanted : list[0] ?? '';
				if (song) load(song);
				else error = NO_SONGS;
			})
			.catch((e: Error) => (error = `Songs: ${e.message}`));
		return () => {
			clearTimeout(idleTimer);
			clearTimeout(toastTimer);
			clearTimeout(titleTimer);
			setPreparing(false);
			loading++;
			playback?.dispose();
			stage?.dispose();
			void audio?.close();
		};
	});
</script>

<svelte:head><title>Melody</title></svelte:head>
<svelte:window
	onkeydown={onKey}
	onpointermove={wake}
	onpointerdown={wake}
	ondragover={(e) => dragsFiles(e) && e.preventDefault()}
	ondrop={onDrop}
/>

<div class="stage" class:quiet={away} bind:this={host}></div>

<div class="melody" data-skin={skin}>
	<Player
		{song}
		ready={!!playback}
		{playing}
		{now}
		{span}
		{away}
		bind:hover
		onToggle={toggle}
		onSeek={seek}
		onSongs={() => (picking = true)}
	/>

	{#if picking}<SongPicker {songs} current={song} onPick={pick} onClose={() => (picking = false)} onAdd={songsAt.editable ? openAdding : undefined} onDelete={songsAt.editable ? deleteSong : undefined} />{/if}
	<input
		class="chooser"
		type="file"
		accept=".mid,.midi,audio/midi,audio/x-midi"
		aria-label="Add a song"
		bind:this={chooser}
		onchange={(e) => {
			const file = e.currentTarget.files?.[0];
			e.currentTarget.value = ''; // so choosing the same file again still counts
			if (file) addSong(file);
		}}
	/>
	{#if helping}<Shortcuts {shortcuts} onClose={() => (helping = false)} />{/if}
	{#if adding}<AddSong onChoose={() => chooser.click()} onClose={() => (adding = false)} />{/if}

	<Card {screen} {song} {waited} {afterwards} />

	<div class="status" role="status">
		{#if error}<span class="toast error">{error}</span>{/if}
		{#if toast}<span class="toast">{toast}</span>{/if}
	</div>
</div>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		overflow: hidden;
		background: #030304;
		font: 14px/1.4 -apple-system, system-ui, sans-serif;
		color: #e2bd72;
	}
	.stage {
		position: fixed;
		inset: 0;
	}
	.stage.quiet {
		cursor: none;
	}
	.chooser {
		display: none;
	}
</style>
