<script lang="ts" module>
	/** One fact on a card's facts line: plain text, or a pill (a category or a role). */
	export interface CardFact {
		text: string;
		pill?: 'category' | 'role';
	}
</script>

<script lang="ts">
	let { facts, testid, class: className = '' }: { facts: CardFact[]; testid?: string; class?: string } = $props();

	const PILL_CLASS = {
		category: 'rounded bg-muted px-1.5 py-0.5 text-foreground',
		role: 'rounded-full border border-border bg-muted px-2 py-px text-foreground',
	} as const;
</script>

<!-- The dot between two facts lives in 1rem of padding to the left of the later fact. The row is pulled
     left by that same 1rem and the wrapper clips the overflow, so whichever fact starts a line loses its
     dot: a dot never leads a wrapped line and, being part of the fact after it, never trails one. A fact
     wraps as a unit (no "60.5 K / views") and truncates if it alone is wider than the card. -->
<div data-testid={testid} class="overflow-hidden text-xs text-muted-foreground {className}">
	<div class="-ml-4 flex flex-wrap items-center gap-y-1">
		{#each facts as fact, i (i)}
			<span data-testid="card-fact" class="relative max-w-full pl-4 whitespace-nowrap {fact.pill ? '' : 'truncate'}">
				{#if i > 0}<span aria-hidden="true" class="absolute top-1/2 left-0 w-4 -translate-y-1/2 text-center"
						>&middot;</span
					>{/if}{#if fact.pill}<span
						data-pill={fact.pill}
						class="inline-block max-w-full truncate align-bottom {PILL_CLASS[fact.pill]}">{fact.text}</span
					>{:else}{fact.text}{/if}
			</span>
		{/each}
	</div>
</div>
