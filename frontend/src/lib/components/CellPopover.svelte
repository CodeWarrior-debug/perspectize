<script lang="ts" module>
	export interface PopoverState {
		anchor: HTMLElement;
		mode: 'single' | 'multi';
		text: string;
		copy: string | null;
		items: string[];
	}
</script>

<script lang="ts">
	import { Popover } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { itemsCopyText } from '$lib/utils/tooltipSpec';

	let {
		state: popover,
		onEnter,
		onLeave,
		onClose,
	}: {
		state: PopoverState | null;
		onEnter: () => void;
		onLeave: () => void;
		onClose: () => void;
	} = $props();

	let selected = $state(new Set<string>());
	let lastState: PopoverState | null = null;
	// Reset selection only when a different cell opens the popover.
	$effect(() => {
		const current = popover;
		if (current !== lastState) {
			lastState = current;
			selected = new Set();
		}
	});

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied');
		} catch {
			toast.error('Could not copy');
		}
	}

	function toggle(item: string) {
		const next = new Set(selected);
		if (next.has(item)) next.delete(item);
		else next.add(item);
		selected = next;
	}
</script>

<Popover.Root open={popover !== null} onOpenChange={(o) => !o && onClose()}>
	{#if popover}
		<Popover.Portal>
			<Popover.Content
				customAnchor={popover.anchor}
				side="bottom"
				align="start"
				sideOffset={6}
				trapFocus={false}
				onOpenAutoFocus={(e) => e.preventDefault()}
				class="tip-surface"
				onpointerenter={onEnter}
				onpointerleave={onLeave}
			>
				{#if popover.mode === 'single'}
					<span data-testid="tip-text">{popover.text}</span>
					{#if popover.copy !== null}
						<button
							type="button"
							class="tip-copy-btn"
							data-testid="tip-copy"
							aria-label="Copy value"
							onclick={() => copy(popover.copy!)}><CopyIcon size={14} /></button
						>
					{/if}
				{:else}
					<div class="tip-chips">
						{#each popover.items as item (item)}
							<button
								type="button"
								class="tip-chip"
								data-selected={selected.has(item)}
								aria-pressed={selected.has(item)}
								data-testid={`tip-item-${item}`}
								onclick={() => toggle(item)}>{item}</button
							>
						{/each}
					</div>
					<div class="tip-actions">
						<button
							type="button"
							data-testid="tip-copy-selected"
							disabled={selected.size === 0}
							onclick={() => copy(itemsCopyText(popover.items, selected))}>Copy selected</button
						>
						<button type="button" data-testid="tip-copy-all" onclick={() => copy(itemsCopyText(popover.items, null))}
							>Copy all</button
						>
					</div>
				{/if}
			</Popover.Content>
		</Popover.Portal>
	{/if}
</Popover.Root>
