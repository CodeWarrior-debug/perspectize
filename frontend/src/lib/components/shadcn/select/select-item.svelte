<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithoutChildrenOrChild<SelectPrimitive.ItemProps> & {
		children: Snippet;
	} = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	class={cn(
		'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50',
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</SelectPrimitive.Item>
