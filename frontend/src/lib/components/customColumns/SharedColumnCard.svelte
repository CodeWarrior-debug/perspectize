<script lang="ts">
	import { Button } from '#lib/components/shadcn/index.js';
	import FunctionSquare from '@lucide/svelte/icons/square-function';
	import { printFormula } from '#lib/customColumns/formula.js';
	import type { OperandRow } from '#lib/customColumns/operands.js';
	import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';
	import { formatDate, EMPTY_VALUE } from '#lib/utils/formatting.js';
	import { isAvailable, scopeLabels, topResult, usesLabels } from './sharedColumns.js';

	interface Props {
		row: SavedFormula;
		/** The viewer's loaded movies, the population the top result is read from. */
		previewRows: readonly OperandRow[];
		/** True when the viewer already has this column (see SharedColumnsDialog). */
		inYourColumns: boolean;
		/** Which action is running for this card, if any. */
		pending: 'copy' | 'link' | null;
		/** A plain-words failure from the last attempt on this card. */
		error: string | null;
		onCopy: () => void;
		onLink: () => void;
	}

	let { row, previewRows, inYourColumns, pending, error, onCopy, onLink }: Props = $props();

	const expression = $derived(row.payload?.expression ?? null);
	const available = $derived(isAvailable(row));
	const uses = $derived(expression ? usesLabels(expression) : []);
	const scopes = $derived(scopeLabels(row.payload?.contentTypes));
	const formulaText = $derived(expression ? printFormula(expression) : EMPTY_VALUE);
	const top = $derived(expression ? topResult(expression, previewRows) : null);
	const busy = $derived(pending !== null);

	function formatValue(value: number): string {
		return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
	}
</script>

<article class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
	<header class="flex flex-col gap-0.5">
		<h3 class="flex items-center gap-1.5 text-base font-semibold break-words">
			<FunctionSquare class="size-4 shrink-0 text-primary" aria-hidden="true" />
			<span>{row.name}</span>
		</h3>
		<p class="text-xs text-muted-foreground">by @{row.user.username}</p>
		{#if row.payload?.subtitle}
			<p class="text-sm text-muted-foreground">{row.payload.subtitle}</p>
		{/if}
	</header>

	{#if available}
		<div class="flex flex-col gap-2 text-sm">
			<div class="flex flex-wrap gap-1.5">
				{#each scopes as scope (scope)}
					<span class="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
						{scope}
					</span>
				{/each}
			</div>
			<p>
				<span class="font-medium">Uses:</span>
				{uses.length > 0 ? uses.join(', ') : EMPTY_VALUE}
			</p>
			<p>
				<span class="font-medium">Updated:</span>
				{formatDate(row.updatedAt)}
			</p>
			<div>
				<p class="font-medium">Formula</p>
				<code class="mt-1 block rounded-md bg-muted px-2 py-1 font-mono text-xs break-words whitespace-pre-wrap">
					{formulaText}
				</code>
			</div>
			<p>
				{#if top}
					Top result on your loaded movies: <span class="font-medium">{top.title}</span> ({formatValue(top.value)})
				{:else}
					No value on your loaded movies yet
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{#if inYourColumns}
				<span class="text-sm font-medium text-muted-foreground">In your columns</span>
			{:else}
				<Button type="button" size="sm" disabled={busy} onclick={onCopy}>
					{pending === 'copy' ? 'Copying…' : 'Use a copy'}
				</Button>
			{/if}
			<Button type="button" size="sm" variant="secondary" disabled={busy || inYourColumns} onclick={onLink}>
				{pending === 'link' ? 'Linking…' : 'Link instead'}
			</Button>
		</div>
	{:else}
		<p class="text-sm font-medium text-muted-foreground">No longer available</p>
	{/if}

	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
</article>
