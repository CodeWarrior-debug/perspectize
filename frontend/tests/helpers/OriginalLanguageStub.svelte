<script lang="ts">
	let {
		startVerseId,
		endVerseId,
		plain,
	}: { startVerseId: number; endVerseId: number; verses: unknown; plain: import('svelte').Snippet } = $props();
</script>

<div data-testid="original-language-stub" data-range="{startVerseId}-{endVerseId}">{@render plain()}</div>
