<script lang="ts">
	import PrintOptionsDialog from '$lib/components/PrintOptionsDialog.svelte';

	let { onPrint }: { onPrint: (opts: { title: string; spacing: string }) => void } = $props();
	let open = $state(true);
</script>

<PrintOptionsDialog bind:open {onPrint} />
<button type="button" data-testid="open-state" onclick={() => (open = true)}>{open ? 'open' : 'closed'}</button>
