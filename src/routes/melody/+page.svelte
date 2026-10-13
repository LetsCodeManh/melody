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
	import { actionFor, type Action } from '#lib/melody/player/shortcuts.ts';
	import { SKINS, skinAfter, type Skin } from '#lib/melody/player/skins.ts';

	const IDLE = 3000; // ms without the pointer moving before the playing player fades away
	const SKIP = 5; // s the arrow keys jump

	let host: HTMLDivElement;
	let stage: Stage | undefined;
	let audio: AudioContext | undefined;
	let playback = $state.raw<Playback>();
	let songs = $state.raw<string[]>([]);
	let song = $state('');
	let span = $state.raw({ start: 0, end: 0 });
	let now = $state(0);
	let playing = $state(false);
	let status = $state('');
	let error = $state('');
	let loading = 0;
	let skin = $state<Skin>(SKINS[0].id);
	let hidden = $state(false);
	let idle = $state(false);
	let hover = $state(false);
	let picking = $state(false);
	let helping = $state(false);
	let toast = $state('');
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	const away = $derived(hidden || (playing && idle && !hover && !picking && !helping));

	async function fetchOk(url: string) {
		const res = await fetch(url);
		if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? res.statusText);
		return res;
	}

	/** Prepares the song if it needs to (the server runs prepare.py), then shows it at its start, paused. */
	async function load(name: string) {
		const ticket = ++loading;
		playback?.dispose();
		playback = undefined;
		error = '';
		status = `Preparing ${name}… the first time takes about 20 seconds.`;
		try {
			const base = `/api/melody/${encodeURIComponent(name)}`;
			const data: Prepared = await (await fetchOk(base)).json();
			const [svg, wav] = await Promise.all([
				fetchOk(`${base}/score.svg`).then((r) => r.text()),
				fetchOk(`${base}/audio.wav`).then((r) => r.arrayBuffer())
			]);
			const sound = await audio!.decodeAudioData(wav);
			if (ticket !== loading) return; // another song was picked meanwhile
			stage!.show(data, svg);
			span = duration(data);
			playback = createPlayback(sound, audio!, span.start, span.end);
			status = '';
			void goto(`?song=${encodeURIComponent(name)}`, { shallow: true, replace: true });
		} catch (e) {
			if (ticket !== loading) return;
			status = '';
			error = `${name}: ${(e as Error).message}`;
		}
	}

	const toggle = () => (playback?.playing ? playback.pause() : playback?.play());
	const seek = (t: number) => playback?.seek(t);
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
		songs: () => ((helping = false), (picking = true)),
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
		help: () => ((picking = false), (helping = !helping)),
		close: () => (picking = helping = false)
	};

	function onKey(e: KeyboardEvent) {
		const t = e.target;
		const target = t instanceof HTMLInputElement && t.type !== 'range' ? 'text' : t instanceof HTMLButtonElement ? 'button' : 'other';
		const action = actionFor(e, target);
		if (!action || (picking && action !== 'close')) return;
		e.preventDefault();
		wake();
		actions[action]();
	}

	onMount(() => {
		const saved = localStorage.getItem('melody.skin');
		if (saved) skin = skinAfter(saved, 0);
		wake();
		audio = new AudioContext();
		stage = createStage(host, () => {
			const t = playback?.time() ?? span.start;
			now = t;
			playing = playback?.playing ?? false;
			return t;
		});
		fetchOk('/api/melody')
			.then((r) => r.json())
			.then((list: string[]) => {
				songs = list;
				const wanted = page.url.searchParams.get('song');
				song = wanted && list.includes(wanted) ? wanted : list[0] ?? '';
				if (song) load(song);
				else error = 'No songs yet: put a .mid in blender/melody-bounce/songs.';
			})
			.catch((e: Error) => (error = `Songs: ${e.message}`));
		return () => {
			clearTimeout(idleTimer);
			clearTimeout(toastTimer);
			loading++;
			playback?.dispose();
			stage?.dispose();
			void audio?.close();
		};
	});
</script>

<svelte:head><title>Melody</title></svelte:head>
<svelte:window onkeydown={onKey} onpointermove={wake} onpointerdown={wake} />

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

	{#if picking}<SongPicker {songs} current={song} onPick={pick} onClose={() => (picking = false)} />{/if}
	{#if helping}<Shortcuts onClose={() => (helping = false)} />{/if}

	<div class="status" role="status">
		{#if status}<span class="toast">{status}</span>{/if}
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
</style>
