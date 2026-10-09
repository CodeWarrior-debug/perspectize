<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/shadcn/popover';
	import { internalPath, isInternalHref, isModifiedClick } from './linkify';

	let {
		href,
		text,
		appOrigin = typeof window === 'undefined' ? '' : window.location.origin,
	}: { href: string; text: string; appOrigin?: string } = $props();

	const internal = $derived(isInternalHref(href, appOrigin));
	let open = $state(false);

	const linkClass = 'underline underline-offset-2 break-all hover:opacity-80';

	function openInNewTab() {
		open = false;
		window.open(href, '_blank', 'noopener,noreferrer');
	}

	function goThere() {
		open = false;
		goto(internalPath(href));
	}
</script>

{#if internal}
	<Popover bind:open>
		<PopoverTrigger>
			{#snippet child({ props })}
				<a
					{...props}
					{href}
					class={linkClass}
					onclick={(e: MouseEvent) => {
						// Leave modified / middle clicks to the browser (no popover).
						if (isModifiedClick(e)) return;
						e.preventDefault();
						(props.onclick as ((e: MouseEvent) => void) | undefined)?.(e);
					}}>{text}</a
				>
			{/snippet}
		</PopoverTrigger>
		<PopoverPrimitive.Portal>
			<PopoverContent class="flex w-auto flex-col gap-1 p-1" align="start">
				<button
					type="button"
					class="rounded px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
					onclick={openInNewTab}>Open in new tab</button
				>
				<button
					type="button"
					class="rounded px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
					onclick={goThere}>Go there</button
				>
			</PopoverContent>
		</PopoverPrimitive.Portal>
	</Popover>
{:else}
	<a {href} target="_blank" rel="noopener noreferrer" class={linkClass}>{text}</a>
{/if}
