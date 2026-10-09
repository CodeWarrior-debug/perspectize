<script lang="ts">
	import { moviePeople, movieResponse, type MovieRow } from '$lib/utils/formatting';

	// Synopsis, top cast (directors first, linked to TMDB person pages) and keywords.
	let { row }: { row: MovieRow } = $props();

	const m = $derived(movieResponse(row));
	const people = $derived(moviePeople(row));
	const keywords = $derived(m?.keywords ?? []);
</script>

{#if m?.overview}
	<div class="mt-3.5 border-t border-border pt-3.5">
		<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Synopsis</div>
		<div class="font-serif text-[13px] whitespace-pre-wrap text-foreground">{m.overview}</div>
	</div>
{/if}

{#if people.length > 0}
	<div class="mt-3.5">
		<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Top cast</div>
		<ul class="space-y-1 font-[family-name:var(--font-family-serif)] text-[13px] text-foreground">
			{#each people as person (`${person.role}-${person.id}`)}
				<li>
					<a
						href={`https://www.themoviedb.org/person/${person.id}`}
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-primary hover:underline">{person.name}</a
					>
					{#if person.role === 'director'}
						<span class="text-muted-foreground">· Director</span>
					{:else if person.character}
						<span class="text-muted-foreground">as {person.character}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#if keywords.length > 0}
	<div class="mt-3.5">
		<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Keywords</div>
		<div class="font-[family-name:var(--font-family-serif)] text-[13px] text-foreground">
			{keywords.join(', ')}
		</div>
	</div>
{/if}
