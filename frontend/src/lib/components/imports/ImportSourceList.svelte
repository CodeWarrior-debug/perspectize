<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import type { ImportSource } from '$lib/queries/imports';
	import { contentTypeLabel } from '$lib/utils/grid-config';

	/** One line per source: what it is, what its rows become, and how listing went. */
	let { sources }: { sources: ImportSource[] } = $props();

	const STATUS: Record<ImportSource['status'], string> = {
		WAITING: 'Waiting for approval',
		LISTING: 'Listing…',
		READY: 'Ready',
		FAILED: 'Failed',
	};

	function asOf(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC',
		});
	}
</script>

<ul class="flex flex-col gap-1 text-sm" data-testid="import-sources">
	{#each sources as s (s.id)}
		<li class="flex flex-wrap items-baseline gap-x-2">
			{#if s.url}
				<a class="inline-flex items-center gap-1 font-medium underline" href={s.url} target="_blank" rel="noopener">
					{s.title ?? s.sourceRef}<ExternalLinkIcon class="size-3" />
				</a>
			{:else}
				<span class="font-medium">{s.title ?? s.sourceRef}</span>
			{/if}
			<span class="text-muted-foreground">
				{s.sourceType === 'YOUTUBE_CHANNEL'
					? 'YouTube channel'
					: s.role === 'DIRECTOR'
						? 'Films directed'
						: s.role === 'CAST'
							? 'Films acted in'
							: 'Filmography'}
				→ {contentTypeLabel(s.destinationType.toLowerCase())} · {#if s.status !== 'WAITING'}{s.itemCount} rows ·{/if}
				<span class:text-destructive={s.status === 'FAILED'}>{STATUS[s.status]}</span>
				{#if s.fetchedAt && s.status !== 'LISTING'}· stats as of {asOf(s.fetchedAt)}{/if}
			</span>
			{#if s.statusDetail}
				<span class="text-destructive text-xs">{s.statusDetail}</span>
			{/if}
		</li>
	{/each}
</ul>
