<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import ListXIcon from '@lucide/svelte/icons/list-x';
	import type { GridApi } from '@ag-grid-community/core';
	import { formatDurationSeconds } from '$lib/utils/formatting';

	interface FilterChip {
		colId: string;
		label: string;
		value: string;
	}

	let {
		gridApi,
		filterModel,
		onRemove,
		onClearAll,
	}: {
		gridApi: GridApi | null;
		filterModel: Record<string, any>;
		/** Used when no grid is mounted (mobile card mode): the caller edits URL filters directly. */
		onRemove?: (colId: string) => void;
		onClearAll?: () => void;
	} = $props();

	const COLUMN_LABELS: Record<string, string> = {
		type: 'Type',
		duration: 'Length',
		views: 'Views',
		likes: 'Likes',
		publishDate: 'Date',
		channel: 'Channel',
		tags: 'Tags',
		description: 'Description',
		updatedAt: 'Updated',
		createdAt: 'Date Added',
	};

	const TEXT_OPERATORS: Record<string, string> = {
		contains: 'contains',
		notContains: 'excludes',
		equals: 'is',
		notEqual: 'is not',
		startsWith: 'starts with',
		endsWith: 'ends with',
		blank: 'is blank',
		notBlank: 'is not blank',
	};

	const NUMBER_OPERATORS: Record<string, string> = {
		equals: '=',
		notEqual: '\u2260',
		greaterThan: '>',
		greaterThanOrEqual: '\u2265',
		lessThan: '<',
		lessThanOrEqual: '\u2264',
		inRange: '',
		blank: 'is blank',
		notBlank: 'is not blank',
	};

	function formatShortDate(d: string): string {
		if (!d) return '';
		const date = new Date(d);
		if (isNaN(date.getTime())) return d;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatNumberValue(value: number, colId?: string): string {
		switch (colId) {
			case 'duration':
				// YouTube videos store length in seconds — display as m:ss
				return formatDurationSeconds(value);
			default:
				return String(value);
		}
	}

	function formatSingleCondition(filter: any, colId?: string): string {
		const ft = filter.filterType;

		if (ft === 'text') {
			if (filter.type === 'blank') return 'is blank';
			if (filter.type === 'notBlank') return 'is not blank';
			const op = TEXT_OPERATORS[filter.type] ?? filter.type;
			return `${op} "${filter.filter}"`;
		}

		if (ft === 'number') {
			if (filter.type === 'blank') return 'is blank';
			if (filter.type === 'notBlank') return 'is not blank';
			if (filter.type === 'inRange')
				return `${formatNumberValue(filter.filter, colId)} \u2013 ${formatNumberValue(filter.filterTo, colId)}`;
			const op = NUMBER_OPERATORS[filter.type] ?? filter.type;
			return `${op} ${formatNumberValue(filter.filter, colId)}`;
		}

		if (ft === 'date') {
			if (filter.type === 'blank') return 'is blank';
			if (filter.type === 'notBlank') return 'is not blank';
			if (filter.type === 'equals') return formatShortDate(filter.dateFrom);
			if (filter.type === 'greaterThan') return `after ${formatShortDate(filter.dateFrom)}`;
			if (filter.type === 'lessThan') return `before ${formatShortDate(filter.dateFrom)}`;
			if (filter.type === 'notEqual') return `\u2260 ${formatShortDate(filter.dateFrom)}`;
			if (filter.type === 'inRange')
				return `${formatShortDate(filter.dateFrom)} \u2013 ${formatShortDate(filter.dateTo)}`;
			return formatShortDate(filter.dateFrom);
		}

		return String(filter.filter ?? '');
	}

	function formatFilterValue(filter: any, colId?: string): string {
		if (filter.operator && filter.conditions) {
			const parts = filter.conditions.map((c: any) => formatSingleCondition(c, colId));
			return parts.join(` ${filter.operator.toLowerCase()} `);
		}
		if (filter.operator && filter.condition1) {
			const parts = [filter.condition1, filter.condition2]
				.filter(Boolean)
				.map((c: any) => formatSingleCondition(c, colId));
			return parts.join(` ${filter.operator.toLowerCase()} `);
		}
		return formatSingleCondition(filter, colId);
	}

	const chips: FilterChip[] = $derived(
		Object.entries(filterModel).map(([colId, filter]) => ({
			colId,
			label: COLUMN_LABELS[colId] ?? colId,
			value: formatFilterValue(filter, colId),
		})),
	);

	function removeFilter(colId: string) {
		if (!gridApi) return onRemove?.(colId);
		const model = { ...gridApi.getFilterModel() };
		delete model[colId];
		gridApi.setFilterModel(model);
	}

	function removeAllFilters() {
		if (!gridApi) return onClearAll?.();
		gridApi.setFilterModel(null);
	}
</script>

{#if chips.length > 0}
	<div class="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
		{#each chips as chip (chip.colId)}
			<span
				class="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
			>
				<span class="font-semibold">{chip.label}:</span>
				<span class="opacity-80">{chip.value}</span>
				<button
					onclick={() => removeFilter(chip.colId)}
					class="ml-0.5 p-0.5 rounded-full hover:bg-primary/20 transition-colors"
					aria-label="Remove {chip.label} filter"
				>
					<XIcon class="size-3" />
				</button>
			</span>
		{/each}

		<button
			onclick={removeAllFilters}
			class="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
		>
			<ListXIcon class="size-3.5" />
			Clear all
		</button>
	</div>
{/if}
