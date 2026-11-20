<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		align = 'center',
		sideOffset = 4,
		children,
		...restProps
	}: WithoutChildrenOrChild<PopoverPrimitive.ContentProps> & {
		children: Snippet;
	} = $props();
</script>

<PopoverPrimitive.Content
	bind:ref
	{align}
	{sideOffset}
	class={cn(
		'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 w-72 rounded-md border p-4 shadow-md outline-hidden',
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</PopoverPrimitive.Content>
