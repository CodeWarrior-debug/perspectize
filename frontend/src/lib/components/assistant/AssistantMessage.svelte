<script lang="ts">
	import { renderAssistantMarkdown } from '$lib/utils/assistantMarkdown';

	/**
	 * AssistantMessage — renders one assistant answer. Always goes through
	 * renderAssistantMarkdown (no images, strict links, citation chips); never
	 * reuse SafeHtml for assistant output.
	 */
	let { markdown }: { markdown: string } = $props();

	const html = $derived(renderAssistantMarkdown(markdown));
</script>

<div class="assistant-message text-sm leading-relaxed" data-testid="assistant-message">
	{@html html}
</div>

<style>
	.assistant-message :global(p) {
		margin: 0 0 6px;
	}
	.assistant-message :global(p:last-child) {
		margin-bottom: 0;
	}
	.assistant-message :global(ol),
	.assistant-message :global(ul) {
		padding-left: 20px;
		margin: 4px 0;
	}
	.assistant-message :global(ol) {
		list-style: decimal;
	}
	.assistant-message :global(ul) {
		list-style: disc;
	}
	.assistant-message :global(a) {
		color: var(--color-primary);
		text-decoration: underline;
	}
	.assistant-message :global(.assistant-cite) {
		display: inline-block;
		margin: 0 2px;
		padding: 0 6px;
		border-radius: 9999px;
		font-size: 0.7rem;
		line-height: 1.4rem;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		white-space: nowrap;
	}
</style>
