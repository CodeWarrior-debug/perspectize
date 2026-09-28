<script lang="ts">
	import { sanitizeHtml } from '$lib/utils/sanitize';

	/**
	 * SafeHtml — renders user-generated HTML (e.g., Tiptap review content)
	 * after sanitizing with DOMPurify. Use this instead of raw {@html}.
	 */
	let {
		html,
		class: className = '',
	}: {
		html: string;
		class?: string;
	} = $props();

	const clean = $derived(sanitizeHtml(html));
</script>

<div class="safe-html {className}">
	{@html clean}
</div>

<style>
	.safe-html :global(ul),
	.safe-html :global(ol) {
		padding-left: 22px;
		margin: 4px 0;
	}
	/* Tailwind's preflight resets list-style to none, so restore markers. */
	.safe-html :global(ul) {
		list-style: disc;
	}
	.safe-html :global(ol) {
		list-style: decimal;
	}
	.safe-html :global(a) {
		color: var(--color-primary);
		text-decoration: underline;
	}
	.safe-html :global(li) {
		margin: 2px 0;
	}
	.safe-html :global(p) {
		margin: 0 0 4px;
	}
	.safe-html :global(p:last-child) {
		margin-bottom: 0;
	}
	.safe-html :global(h2) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0.75rem 0 0.25rem;
	}
	.safe-html :global(h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0.5rem 0 0.25rem;
	}
	.safe-html :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 4px;
	}
	.safe-html :global(table) {
		border-collapse: collapse;
		width: 100%;
		overflow-x: auto;
		display: block;
	}
	.safe-html :global(th),
	.safe-html :global(td) {
		border: 1px solid var(--color-border);
		padding: 4px 8px;
		text-align: left;
	}
</style>
