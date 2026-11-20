<script lang="ts">
	import SafeHtml from './SafeHtml.svelte';
	import LockIcon from '@lucide/svelte/icons/lock';
	import { nameInitials } from '$lib/utils/compareIdentity';

	let {
		name,
		avatarColor,
		review,
		uniqueFeelings,
		isPrivate = false,
	}: {
		name: string;
		avatarColor: string;
		review: string | null;
		uniqueFeelings: { emoji: string; label: string | null }[];
		// Public is the default and carries no marker (the app's convention:
		// only private is labelled, as in PerspectivePopover's Private switch).
		isPrivate?: boolean;
	} = $props();
</script>

<div class="flex flex-col gap-3 rounded-lg border border-border p-3.5">
	<span class="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Take</span>
	<div class="flex items-center gap-2">
		<span
			class="flex size-6 flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white"
			style="background-color: {avatarColor};"
		>
			{nameInitials(name)}
		</span>
		<span class="text-[13px] font-semibold text-foreground">{name}</span>
		{#if isPrivate}
			<span
				class="ml-auto flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground"
				data-testid="take-private"
			>
				<LockIcon class="size-3" aria-hidden="true" />
				Private
			</span>
		{/if}
	</div>
	<div
		class="font-slot-longform font-[family-name:var(--font-family-serif)] text-[13.5px] leading-snug text-foreground"
	>
		{#if review}
			<SafeHtml html={review} />
		{:else}
			<span class="text-muted-foreground">No written review.</span>
		{/if}
	</div>

	{#if uniqueFeelings.length > 0}
		<div class="flex flex-col gap-1.5 border-t border-border pt-2.5">
			<span class="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"> Unique feelings </span>
			<div class="flex flex-wrap gap-1.5">
				{#each uniqueFeelings as f, i (`${f.emoji}:${f.label ?? ''}:${i}`)}
					<span class="rounded-full border border-border px-2 py-0.5 text-[12px]">{f.emoji} {f.label ?? ''}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
