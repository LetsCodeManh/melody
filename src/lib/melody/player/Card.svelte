<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Screen } from '../curtain';

	/** `waited`: whole seconds the song has been preparing */
	let { screen, song, waited }: { screen: Screen | undefined; song: string; waited: number } = $props();
	const name = $derived(song.replaceAll('-', ' '));
</script>

<!-- the screens before and after the music, cross-fading from one to the next; the skins dress them -->
{#key screen}
	{#if screen}
		<div class="card {screen}" role="status" transition:fade={{ duration: 400 }}>
			{#if screen === 'loading'}
				<p class="caption">Preparing</p>
				<p class="name">{name}</p>
				<div class="breath"></div>
				<!-- every song takes a moment to open; only a first prepare takes long enough to need explaining -->
				<p class="cue" class:quiet={waited < 3}><span class="waited">{waited} s</span> · the first time a song opens takes a while</p>
			{:else if screen === 'title'}
				<p class="caption">Ready</p>
				<p class="name">{name}</p>
				<p class="cue"><kbd>Space</kbd> to play</p>
			{:else}
				<p class="caption">The end</p>
				<p class="name">{name}</p>
				<p class="cue"><kbd>Space</kbd> to play again · <kbd>N</kbd> next song</p>
			{/if}
		</div>
	{/if}
{/key}
