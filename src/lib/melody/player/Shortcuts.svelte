<script lang="ts">
	import { SHORTCUTS } from './shortcuts';

	let { onClose }: { onClose: () => void } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}>
	<div class="panel keys" role="dialog" aria-label="Keys">
		<h2>Keys</h2>
		<dl>
			{#each SHORTCUTS as s (s.action)}
				<dt><kbd>{s.show}</kbd></dt>
				<dd>{s.does}</dd>
			{/each}
		</dl>
	</div>
</div>
