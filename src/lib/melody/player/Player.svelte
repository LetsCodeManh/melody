<script lang="ts">
	import { AFTERWARDS, type Afterwards } from './afterwards';

	interface Props {
		song: string;
		ready: boolean;
		playing: boolean;
		now: number;
		span: { start: number; end: number };
		/** faded out: hidden by hand, or idle while playing */
		away: boolean;
		/** the pointer is over the player, which keeps it from fading */
		hover?: boolean;
		onToggle: () => void;
		onSeek: (t: number) => void;
		onSongs: () => void;
		afterwards?: Afterwards;
		fullscreen?: boolean;
		/** with these, the player has a button for each: a touch screen has no keys */
		onPrevious?: () => void;
		onNext?: () => void;
		onAfterwards?: () => void;
		onFullscreen?: () => void;
	}

	let { song, ready, playing, now, span, away, hover = $bindable(false), onToggle, onSeek, onSongs, afterwards = 'stop', fullscreen = false, onPrevious, onNext, onAfterwards, onFullscreen }: Props = $props();
	const then = $derived(AFTERWARDS.find((a) => a.id === afterwards)!.then);

	const clock = (t: number) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${String(Math.floor(Math.abs(t) % 60)).padStart(2, '0')}`;
	const progress = $derived(span.end > span.start ? Math.min(Math.max((now - span.start) / (span.end - span.start), 0), 1) : 0);
</script>

<div
	class="player"
	class:away
	class:playing
	style:--p={progress}
	inert={away}
	role="group"
	aria-label="Player"
	onpointerenter={() => (hover = true)}
	onpointerleave={() => (hover = false)}
>
	{#if onPrevious}
		<button class="tap" onclick={onPrevious} disabled={!ready} aria-label="Previous song">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path class="solid" d="M6 5h2.5v14H6zM19 5.2v13.6L9 12z" /></svg>
		</button>
	{/if}
	<button class="play" onclick={onToggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			{#if playing}<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />{:else}<path d="M8 5.2v13.6L19 12z" />{/if}
		</svg>
	</button>
	{#if onNext}
		<button class="tap" onclick={onNext} disabled={!ready} aria-label="Next song">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path class="solid" d="M15.5 5H18v14h-2.5zM5 5.2v13.6L15 12z" /></svg>
		</button>
	{/if}
	<button class="title" onclick={onSongs} title="Pick a song (S)">
		<span class="label">Now playing</span>
		<span class="name">{song.replaceAll('-', ' ') || '…'}</span>
	</button>
	<div class="progress">
		<div class="track"><div class="fill"></div></div>
		<input
			type="range"
			aria-label="Position"
			min={span.start}
			max={span.end}
			step="0.01"
			value={now}
			disabled={!ready}
			oninput={(e) => onSeek(+e.currentTarget.value)}
		/>
	</div>
	<span class="time"><span class="now">{clock(now)}</span><span class="end">{clock(span.end)}</span></span>
	{#if onAfterwards}
		<button class="tap repeat" class:on={afterwards !== 'stop'} onclick={onAfterwards} aria-label="After each song: {then}">
			<!-- Lucide's repeat and repeat-1 (ISC) -->
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
				{#if afterwards === 'again'}<path d="M11 10h1v4" />{/if}
			</svg>
		</button>
	{/if}
	{#if onFullscreen}
		<button class="tap" onclick={onFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if fullscreen}<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />{:else}<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />{/if}
			</svg>
		</button>
	{/if}
</div>
