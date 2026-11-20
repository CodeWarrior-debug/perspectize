<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		Popover,
		PopoverContent,
		PopoverTrigger,
		buttonVariants,
		Button,
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
	} from '#lib/components/shadcn/index.js';

	let {
		triggerLabel,
		triggerIcon,
		title,
		description,
		submitLabel,
		pendingLabel,
		isPending = false,
		isSubmitDisabled = false,
		formFields,
		onSubmit,
		open = $bindable(false),
		triggerVariant = 'default',
		triggerSize = 'default',
		align = 'end',
	}: {
		triggerLabel: string;
		triggerIcon: Snippet;
		title: string;
		description: string;
		submitLabel: string;
		pendingLabel: string;
		isPending?: boolean;
		isSubmitDisabled?: boolean;
		formFields: Snippet;
		onSubmit: () => void;
		open?: boolean;
		triggerVariant?: 'default' | 'outline' | 'ghost';
		triggerSize?: 'default' | 'sm' | 'icon';
		align?: 'start' | 'center' | 'end';
	} = $props();

	let isMobile = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 767px)');
		const handler = (e: MediaQueryListEvent | MediaQueryList) => {
			isMobile = 'matches' in e ? e.matches : (e as MediaQueryListEvent).matches;
		};
		handler(mq);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	function handleSubmit(e: Event) {
		e.preventDefault();
		onSubmit();
	}
</script>

{#if isMobile}
	<Button variant={triggerVariant} size={triggerSize} onclick={() => (open = true)}>
		{@render triggerIcon()}
		<span class="hidden md:inline">{triggerLabel}</span>
	</Button>
	<Dialog bind:open>
		<DialogContent class="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<form onsubmit={handleSubmit}>
				{@render formFields()}
				<div class="flex gap-2 justify-end mt-4">
					<Button type="button" variant="outline" onclick={() => (open = false)} disabled={isPending}>Cancel</Button>
					<Button type="submit" disabled={isPending || isSubmitDisabled}>
						{isPending ? pendingLabel : submitLabel}
					</Button>
				</div>
			</form>
		</DialogContent>
	</Dialog>
{:else}
	<Popover bind:open>
		<PopoverTrigger class={buttonVariants({ variant: triggerVariant, size: triggerSize })}>
			{@render triggerIcon()}
			<span class="hidden md:inline">{triggerLabel}</span>
		</PopoverTrigger>
		<PopoverContent {align} sideOffset={8}>
			<form onsubmit={handleSubmit}>
				<div class="space-y-4">
					<div>
						<h3 class="font-semibold text-base">{title}</h3>
						<p class="text-muted-foreground text-sm mt-1">
							{description}
						</p>
					</div>

					{@render formFields()}

					<div class="flex gap-2 justify-end">
						<Button type="button" variant="outline" size="sm" onclick={() => (open = false)} disabled={isPending}>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={isPending || isSubmitDisabled}>
							{isPending ? pendingLabel : submitLabel}
						</Button>
					</div>
				</div>
			</form>
		</PopoverContent>
	</Popover>
{/if}
