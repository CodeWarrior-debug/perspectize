<script lang="ts">
	import {
		EMPTY_VALUE,
		formatBoxOffice,
		formatDuration,
		formatReleased,
		formatTmdbScore,
		formatVsBudgetCell,
		boxOfficeValueGetter,
		budgetValueGetter,
		genreValueGetter,
		ratedValueGetter,
		releasedValueGetter,
		tmdbScoreValueGetter,
		vsBudgetValueGetter,
		formatMoneyCompact,
		movieResponse,
		type MovieRow,
	} from '$lib/utils/formatting';

	// Movie-specific stat tiles, rendered as children of the modal's tile grid.
	// Money/score formatting reuses the grid helpers so the modal and grid agree
	// (unknown budget/revenue is an em dash, never $0).
	let { row, length, lengthUnits }: { row: MovieRow; length: number | null; lengthUnits: string | null } = $props();

	const m = $derived(movieResponse(row));
	const params = $derived({ data: row });
	const directors = $derived(
		m?.directors && m.directors.length > 0 ? m.directors.map((d) => d.name).join(', ') : EMPTY_VALUE,
	);
	const duration = $derived.by(() => {
		if (length != null) return formatDuration(length, lengthUnits);
		return m?.runtimeMinutes ? formatDuration(m.runtimeMinutes * 60, 'seconds') : EMPTY_VALUE;
	});
	const tiles = $derived([
		{ label: 'TMDB Score', value: formatTmdbScore(tmdbScoreValueGetter(params)) },
		{ label: 'Duration', value: duration },
		{ label: 'Released', value: formatReleased(releasedValueGetter(params)) },
		{ label: 'Rated', value: ratedValueGetter(params) ?? EMPTY_VALUE },
		{ label: 'Director(s)', value: directors },
		{ label: 'Genre', value: genreValueGetter(params) ?? EMPTY_VALUE },
		{ label: 'Budget', value: formatMoneyCompact(budgetValueGetter(params)) },
		{ label: 'Box office', value: formatBoxOffice(boxOfficeValueGetter(params)) },
		{ label: 'Vs. budget', value: formatVsBudgetCell(vsBudgetValueGetter(params)) },
	]);
</script>

{#each tiles as tile (tile.label)}
	<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
		<div class="text-[11px] tracking-wide text-muted-foreground uppercase">{tile.label}</div>
		<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground">
			{tile.value}
		</div>
	</div>
{/each}
