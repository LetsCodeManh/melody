<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createStage, type Stage } from '#lib/melody/stage.ts';
	import { createPlayback, type Playback } from '#lib/melody/playback.ts';
	import { duration, type Prepared } from '#lib/melody/melody.ts';

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

	const clock = (t: number) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${String(Math.floor(Math.abs(t) % 60)).padStart(2, '0')}`;

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

	function onKey(e: KeyboardEvent) {
		// space plays and pauses, except where it already means something
		const t = e.target;
		if (e.code !== 'Space' || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLButtonElement)
			return;
		e.preventDefault();
		toggle();
	}

	onMount(() => {
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
			loading++;
			playback?.dispose();
			stage?.dispose();
			void audio?.close();
		};
	});
</script>

<svelte:head><title>Melody</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="stage" bind:this={host}></div>

<div class="bar">
	<label>
		<span class="hidden">Song</span>
		<select bind:value={song} onchange={() => load(song)}>
			{#each songs as name (name)}<option value={name}>{name}</option>{/each}
		</select>
	</label>
	<button onclick={toggle} disabled={!playback}>{playing ? 'Pause' : 'Play'}</button>
	<input
		type="range"
		aria-label="Position"
		min={span.start}
		max={span.end}
		step="0.01"
		value={now}
		disabled={!playback}
		oninput={(e) => playback?.seek(+e.currentTarget.value)}
	/>
	<span class="time">{clock(now)} / {clock(span.end)}</span>
</div>

<div class="status" role="status">
	{status}
	{#if error}<span class="error">{error}</span>{/if}
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
	.bar {
		position: fixed;
		left: 50%;
		bottom: 20px;
		translate: -50%;
		display: flex;
		align-items: center;
		gap: 12px;
		width: min(720px, calc(100vw - 32px));
		box-sizing: border-box;
		padding: 8px 14px;
		border: 1px solid rgb(226 189 114 / 0.25);
		border-radius: 12px;
		background: rgb(10 9 12 / 0.8);
		backdrop-filter: blur(8px);
	}
	select,
	button {
		padding: 5px 10px;
		border: 1px solid rgb(226 189 114 / 0.5);
		border-radius: 8px;
		background: #17141a;
		color: inherit;
		font: inherit;
	}
	button {
		min-width: 70px;
	}
	input[type='range'] {
		flex: 1;
		accent-color: #e2bd72;
	}
	.time {
		font: 12px ui-monospace, monospace;
		white-space: nowrap;
	}
	.hidden {
		position: absolute;
		clip-path: inset(50%);
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	.status {
		position: fixed;
		top: 20px;
		width: 100%;
		text-align: center;
		pointer-events: none;
	}
	.error {
		display: block;
		color: #ff9a8a;
		white-space: pre-line;
	}
</style>
