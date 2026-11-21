<script lang="ts">
	import type { Operand, OperandRow } from '#lib/customColumns';
	import { hasLowVoteCount } from '#lib/utils/formatting.js';
	import { EMPTY_CELL, formatCustomValue, formatOperandValue } from './builderFormat';

	/** How many loaded movies the table shows. The footer still counts every loaded movie. */
	const SHOWN_ROWS = 6;

	interface Props {
		/** The operand columns the formula reads, shown before the new column. */
		operands: readonly Operand[];
		/** Every loaded movie; the first SHOWN_ROWS are displayed. */
		rows: readonly OperandRow[];
		/** The evaluator's value per row (aligned with `rows`), or null when the formula is not valid yet. */
		values: readonly (number | null)[] | null;
		/** Header of the new column. */
		heading: string;
		/** `payload.numberFormat`. */
		numberFormat: string;
	}

	let { operands, rows, values, heading, numberFormat }: Props = $props();

	const shown = $derived(rows.slice(0, SHOWN_ROWS));
	const missingCount = $derived(values ? values.filter((v) => v === null).length : 0);
	const movieTitle = (row: OperandRow) => (row as { name?: string }).name || EMPTY_CELL;
</script>

<div class="space-y-2">
	{#if values === null}
		<p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Fix the formula to see values here.</p>
	{:else if rows.length === 0}
		<p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
			No loaded movies to preview yet. Load some movies in the Library to see values here.
		</p>
	{:else}
		<div class="overflow-x-auto rounded-md border border-border">
			<table class="w-full min-w-max text-left text-sm">
				<thead class="bg-muted text-xs text-muted-foreground">
					<tr>
						<th scope="col" class="px-3 py-2 font-medium">Movie</th>
						{#each operands as operand (operand.key)}
							<th scope="col" class="px-3 py-2 font-medium">{operand.label}</th>
						{/each}
						<th scope="col" class="px-3 py-2 font-semibold text-foreground">{heading}</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as row, i (i)}
						<tr class="border-t border-border">
							<td class="px-3 py-2">{movieTitle(row)}</td>
							{#each operands as operand (operand.key)}
								{@const value = operand.get(row)}
								<td
									class="px-3 py-2 tabular-nums {operand.key === 'tmdbScore' && hasLowVoteCount({ data: row })
										? 'text-muted-foreground'
										: ''}"
								>
									{formatOperandValue(operand, value)}
								</td>
							{/each}
							<td class="px-3 py-2 font-medium tabular-nums">{formatCustomValue(values[i] ?? null, numberFormat)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="text-xs text-muted-foreground">
			{missingCount} of {rows.length} movies have no value (a missing input), so they sort last.
		</p>
	{/if}
</div>
