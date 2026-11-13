<script lang="ts">
	import { bookResponse, bookSubjects, type BookRow } from '$lib/utils/bookFormatting';
	import { descriptionText, safeRelatedWorks } from '$lib/utils/book';

	// Open Library description, related works and subjects, then the attribution. Each section shows
	// only when it has content. Descriptions are external markdown: they are reduced to plain text
	// and rendered only as text, never as HTML.
	let { row }: { row: BookRow } = $props();

	/** Subject chips shown before the "+N more" count. */
	const SUBJECT_CHIP_LIMIT = 20;

	const data = $derived(bookResponse(row));
	const description = $derived(descriptionText(data?.description ?? ''));
	const related = $derived(safeRelatedWorks(data?.relatedWorks));
	const subjects = $derived(bookSubjects(row) ?? []);
	const shownSubjects = $derived(subjects.slice(0, SUBJECT_CHIP_LIMIT));
	const hiddenSubjectCount = $derived(Math.max(0, subjects.length - SUBJECT_CHIP_LIMIT));
</script>

{#if description}
	<div class="mt-3.5 border-t border-border pt-3.5">
		<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Description</div>
		<div class="font-slot-longform font-serif text-[13px] whitespace-pre-wrap text-foreground">{description}</div>
	</div>
{/if}

{#if related.length > 0}
	<div class="mt-3.5">
		<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Related works</div>
		<ul class="space-y-1 font-slot-cell font-[family-name:var(--font-family-serif)] text-[13px] text-foreground">
			{#each related as work, i (i)}
				<li>
					<a
						href={work.url}
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-primary hover:underline">{work.title}</a
					>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#if subjects.length > 0}
	<div class="mt-3.5">
		<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Tags</div>
		<div class="flex flex-wrap gap-1.5">
			{#each shownSubjects as subject, i (i)}
				<span class="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">{subject}</span>
			{/each}
			{#if hiddenSubjectCount > 0}
				<span class="text-[12px] text-muted-foreground">+{hiddenSubjectCount} more</span>
			{/if}
		</div>
	</div>
{/if}

<p class="mt-3.5 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
	Data: Open Library (archive.org), community-contributed; may be incomplete.
</p>
