<script lang="ts">
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
	}

	let { song, ready, playing, now, span, away, hover = $bindable(false), onToggle, onSeek, onSongs }: Props = $props();

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
	<button class="play" onclick={onToggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			{#if playing}<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />{:else}<path d="M8 5.2v13.6L19 12z" />{/if}
		</svg>
	</button>
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
</div>
