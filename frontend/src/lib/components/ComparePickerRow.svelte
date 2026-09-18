<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';

	let {
		options,
		leftId,
		rightId,
		viewerId = null,
		onLeftChange,
		onRightChange,
		onSwap,
	}: {
		options: { id: string; name: string }[];
		leftId: string;
		rightId: string;
		viewerId?: string | null;
		onLeftChange: (id: string) => void;
		onRightChange: (id: string) => void;
		onSwap: () => void;
	} = $props();

	const leftOptions = $derived(options.filter((o) => o.id !== rightId));
	const rightOptions = $derived(options.filter((o) => o.id !== leftId));

	// Color by identity (the viewer, "You", is always primary-colored) — not
	// by side/position — so a Swap doesn't change "You"'s avatar color.
	function avatarColor(id: string): string {
		return id === viewerId ? 'var(--color-primary)' : 'var(--color-logo-purple)';
	}

	function initials(name: string): string {
		return name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	const leftName = $derived(options.find((o) => o.id === leftId)?.name ?? '');
	const rightName = $derived(options.find((o) => o.id === rightId)?.name ?? '');
</script>

<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
	<div class="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
		<span
			class="flex size-[26px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
			style="background-color: {avatarColor(leftId)};"
		>
			{initials(leftName)}
		</span>
		<select
			data-testid="picker-left"
			aria-label="Left perspective"
			class="w-full min-w-0 bg-transparent text-sm font-medium text-foreground"
			value={leftId}
			onchange={(e) => onLeftChange(e.currentTarget.value)}
		>
			{#each leftOptions as option (option.id)}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	</div>

	<button
		type="button"
		onclick={onSwap}
		aria-label="Swap sides"
		class="flex flex-none items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-primary/[0.06]"
	>
		<ArrowLeftRightIcon class="size-4" />
	</button>

	<div class="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
		<span
			class="flex size-[26px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
			style="background-color: {avatarColor(rightId)};"
		>
			{initials(rightName)}
		</span>
		<select
			data-testid="picker-right"
			aria-label="Right perspective"
			class="w-full min-w-0 bg-transparent text-sm font-medium text-foreground"
			value={rightId}
			onchange={(e) => onRightChange(e.currentTarget.value)}
		>
			{#each rightOptions as option (option.id)}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	</div>
</div>
