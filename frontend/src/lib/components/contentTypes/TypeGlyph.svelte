<script lang="ts">
	import type { TypeIcon } from '#lib/contentTypes/registry.js';

	let { icon, class: className = 'size-4' }: { icon: TypeIcon; class?: string } = $props();
</script>

{#if icon.kind === 'markup'}
	<span class="inline-flex {className}" aria-hidden="true">{@html icon.svg}</span>
{:else}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill={icon.kind === 'brand' ? icon.fill : 'none'}
		stroke={icon.kind === 'outline' ? 'currentColor' : 'none'}
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d={icon.d} />
	</svg>
{/if}
