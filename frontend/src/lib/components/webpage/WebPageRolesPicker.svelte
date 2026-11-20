<script lang="ts">
	import type { WebPageRole } from '#lib/queries/content/index.js';
	import { WEB_PAGE_ROLE_OPTIONS, webPageRoleLabel } from '#lib/utils/webPage.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let {
		roles,
		onChange,
		disabled = false,
	}: {
		/** Picked roles in pick order. The first is the primary role. */
		roles: WebPageRole[];
		/** Called with the whole new list. The parent owns the state. */
		onChange: (roles: WebPageRole[]) => void;
		disabled?: boolean;
	} = $props();

	let expanded = $state(false);

	const summary = $derived(roles.length === 0 ? 'None' : roles.map(webPageRoleLabel).join(', '));

	// Pick order is kept: a new pick goes to the end, an unpick removes only that role.
	function toggle(value: WebPageRole) {
		onChange(roles.includes(value) ? roles.filter((r) => r !== value) : [...roles, value]);
	}
</script>

<div class="space-y-1">
	<span id="webpage-roles-label" class="text-sm font-medium">Roles</span>
	<button
		type="button"
		aria-label="Roles"
		aria-haspopup="listbox"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
		{disabled}
		class="border-input bg-background flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
	>
		<span data-testid="roles-summary" class="truncate text-left">{summary}</span>
		<ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" />
	</button>
	{#if expanded}
		<div
			role="listbox"
			aria-multiselectable="true"
			aria-labelledby="webpage-roles-label"
			class="border-input bg-popover rounded-md border p-1"
		>
			{#each WEB_PAGE_ROLE_OPTIONS as option (option.value)}
				<button
					type="button"
					role="option"
					aria-selected={roles.includes(option.value)}
					onclick={() => toggle(option.value)}
					{disabled}
					class="hover:bg-accent flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm aria-selected:font-medium"
				>
					{option.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
