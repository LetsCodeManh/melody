<script lang="ts">
	interface Props {
		/** opens the file dialog for a .mid */
		onChoose: () => void;
		onClose: () => void;
	}

	let { onChoose, onClose }: Props = $props();

	let over = $state(false);
	let drop: HTMLButtonElement;

	$effect(() => drop.focus());
</script>

<!-- a file dropped on the zone goes on to the page's own drop, which adds it; the zone only shows it will land -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}>
	<!-- dressed like the keys sheet -->
	<div class="panel keys adder" role="dialog" aria-label="Add a song" tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<h2>Add a song</h2>
		<button
			class="drop"
			class:over
			bind:this={drop}
			onclick={onChoose}
			ondragover={() => (over = true)}
			ondragleave={() => (over = false)}
			ondrop={() => (over = false)}
		>
			Drop a .mid here <span>or click to choose one</span>
		</button>
		<div class="guide">
			<p>Where to find one:</p>
			<ul>
				<li><a href="https://www.mutopiaproject.org/" target="_blank" rel="noreferrer">Mutopia Project</a> · classical, free</li>
				<li><a href="https://www.mfiles.co.uk/" target="_blank" rel="noreferrer">MFiles</a> · piano pieces</li>
				<li><a href="https://bitmidi.com/" target="_blank" rel="noreferrer">BitMidi</a> · pop, films and games</li>
			</ul>
			<!-- score.py refuses a played MIDI: say so before the upload, not only after -->
			<p>Piano arrangements read best. One recorded from someone playing won’t take: look for one written note by note.</p>
		</div>
	</div>
</div>
