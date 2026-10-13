<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		songs: string[];
		current: string;
		onPick: (song: string) => void;
		onClose: () => void;
	}

	let { songs, current, onPick, onClose }: Props = $props();

	let query = $state('');
	let field: HTMLInputElement;
	const shown = $derived(songs.filter((s) => s.replaceAll('-', ' ').includes(query.trim().toLowerCase())));
	// starts on the song playing; from then on, where the keys or the pointer move it
	let at = $state(untrack(() => Math.max(songs.indexOf(current), 0)));
	const chosen = $derived(Math.min(at, shown.length - 1));

	$effect(() => field.focus());

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			at = (chosen + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
		} else if (e.key === 'Enter' && shown[chosen]) onPick(shown[chosen]);
		else if (e.key === 'Escape') onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}>
	<div class="panel picker" role="dialog" aria-label="Songs" tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<label class="find"><input
			bind:this={field}
			bind:value={query}
			oninput={() => (at = 0)}
			onkeydown={onKey}
			placeholder="Find a song…"
			aria-label="Find a song"
			aria-controls="melody-songs"
			spellcheck="false"
			autocomplete="off"
		/></label>
		<ul class="songs" id="melody-songs" role="listbox" aria-label="Songs">
			{#each shown as name, i (name)}
				<li role="option" aria-selected={i === chosen}>
					<button class="song" class:chosen={i === chosen} class:current={name === current} onclick={() => onPick(name)} onpointermove={() => (at = i)} tabindex="-1">
						{name.replaceAll('-', ' ')}
					</button>
				</li>
			{:else}
				<li class="none">No song matches</li>
			{/each}
		</ul>
		<p class="hint">↑ ↓ to move · Enter to play · Esc to close</p>
	</div>
</div>
