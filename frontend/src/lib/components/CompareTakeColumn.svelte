<script lang="ts">
	let {
		name,
		avatarColor,
		review,
		uniqueFeelings,
	}: {
		name: string;
		avatarColor: string;
		review: string | null;
		uniqueFeelings: { emoji: string; label: string | null }[];
	} = $props();

	function initials(value: string): string {
		return value
			.split(' ')
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}
</script>

<div class="flex flex-col gap-3 rounded-lg border border-border p-3.5">
	<span class="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Take</span>
	<div class="flex items-center gap-2">
		<span
			class="flex size-6 flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white"
			style="background-color: {avatarColor};"
		>
			{initials(name)}
		</span>
		<span class="text-[13px] font-semibold text-foreground">{name}</span>
	</div>
	<p class="font-[family-name:var(--font-family-serif)] text-[13.5px] leading-snug text-foreground">
		{#if review}
			&ldquo;{review}&rdquo;
		{:else}
			<span class="text-muted-foreground">No written review.</span>
		{/if}
	</p>

	{#if uniqueFeelings.length > 0}
		<div class="flex flex-col gap-1.5 border-t border-border pt-2.5">
			<span class="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
				Unique feelings
			</span>
			<div class="flex flex-wrap gap-1.5">
				{#each uniqueFeelings as f (f.label ?? f.emoji)}
					<span class="rounded-full border border-border px-2 py-0.5 text-[12px]">{f.emoji} {f.label ?? ''}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
