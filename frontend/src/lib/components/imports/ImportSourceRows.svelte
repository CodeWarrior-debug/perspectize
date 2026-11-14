<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/shadcn';
	import { DEMO_MODE } from '$lib/auth/demo.svelte';
	import type { ImportSourceType } from '$lib/queries/imports';
	import { MAX_IMPORT_SOURCES, newSourceRow, type SourceRow } from '$lib/utils/import-sheet';

	/**
	 * The editable source rows shared by the request form and "Add sources": a
	 * type, a reference, and (for a TMDB person) which credits count. `max` is how
	 * many rows may exist at once; callers pass what is left under the server's cap.
	 */
	let { sources = $bindable(), max = MAX_IMPORT_SOURCES }: { sources: SourceRow[]; max?: number } = $props();

	const PLACEHOLDER: Record<ImportSourceType, string> = {
		YOUTUBE_CHANNEL: '@JordanBPeterson, or a channel URL',
		TMDB_PERSON: 'Christopher Nolan, 525, or a TMDB person URL',
	};
</script>

{#each sources as src, i (src.key)}
	<div class="flex flex-wrap items-center gap-2" data-testid="import-request-source">
		<select
			bind:value={src.sourceType}
			aria-label={`Source ${i + 1} type`}
			class="border-border bg-background text-foreground rounded-md border px-2 py-2 text-sm"
		>
			<option value="YOUTUBE_CHANNEL">YouTube channel</option>
			<option value="TMDB_PERSON">Person's films (TMDB)</option>
		</select>
		<input
			type="text"
			bind:value={src.ref}
			maxlength={200}
			placeholder={PLACEHOLDER[src.sourceType]}
			aria-label={`Source ${i + 1}`}
			class="border-border bg-background text-foreground min-w-72 flex-1 rounded-md border px-3 py-2 text-sm"
		/>
		{#if src.sourceType === 'TMDB_PERSON'}
			<select
				bind:value={src.role}
				aria-label={`Source ${i + 1} credits`}
				class="border-border bg-background text-foreground rounded-md border px-2 py-2 text-sm"
			>
				<option value="DIRECTOR">Directed</option>
				<option value="CAST">Acted in</option>
				<option value="BOTH">Both</option>
			</select>
		{/if}
		{#if sources.length > 1}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-label={`Remove source ${i + 1}`}
				onclick={() => (sources = sources.filter((s) => s.key !== src.key))}
			>
				<XIcon />
			</Button>
		{/if}
	</div>
{/each}
{#if sources.length < max}
	<Button
		type="button"
		variant="outline"
		size="sm"
		class="self-start"
		onclick={() => (sources = [...sources, newSourceRow()])}
	>
		<PlusIcon /> Add a source
	</Button>
{/if}
{#if DEMO_MODE}
	<p class="text-muted-foreground text-xs">
		Demo mode has sample data for @JordanBPeterson, @DrJordanBPetersonClips, @PetersonAcademy, @gracetoyou and
		Christopher Nolan (or 525).
	</p>
{/if}
