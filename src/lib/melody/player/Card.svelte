<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Screen } from '../curtain';
	import { AFTERWARDS, type Afterwards } from './afterwards';

	/** `waited`: whole seconds the song has been preparing; `afterwards`: what plays once the song has ended */
	let { screen, song, waited, afterwards }: { screen: Screen | undefined; song: string; waited: number; afterwards: Afterwards } = $props();
	const name = $derived(song.replaceAll('-', ' '));
	const then = $derived(AFTERWARDS.find((a) => a.id === afterwards)!.then);
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
				<p class="cue"><kbd>Space</kbd> to play{#if afterwards !== 'stop'}{` · then ${then}`}{/if}</p>
			{:else}
				<p class="caption">The end</p>
				<p class="name">{name}</p>
				<p class="cue">
					<kbd>Space</kbd> to play again · <kbd>N</kbd> next song{#if afterwards === 'stop'}{' · '}<kbd>L</kbd> keep playing{/if}
				</p>
			{/if}
		</div>
	{/if}
{/key}
