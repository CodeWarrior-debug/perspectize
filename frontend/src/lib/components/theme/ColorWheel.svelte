<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import LazyLoadError from '$lib/components/LazyLoadError.svelte';

	interface Props {
		value: string; // hex
		onChange: (hex: string) => void;
		size?: number;
	}

	let { value, onChange, size = 180 }: Props = $props();

	let container: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let picker: any;
	let loadFailed = $state(false);

	onMount(async () => {
		let iro;
		try {
			({ default: iro } = await import('@jaames/iro'));
		} catch {
			loadFailed = true;
			return;
		}
		picker = new iro.ColorPicker(container, {
			width: size,
			color: value,
			layout: [{ component: iro.ui.Wheel }, { component: iro.ui.Slider, options: { sliderType: 'value' } }],
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		picker.on('color:change', (color: any) => {
			onChange(color.hexString);
		});
	});

	onDestroy(() => {
		picker?.off?.('color:change');
	});

	$effect(() => {
		if (picker && value && picker.color.hexString.toLowerCase() !== value.toLowerCase()) {
			picker.color.set(value);
		}
	});
</script>

{#if loadFailed}
	<LazyLoadError what="the colour picker" />
{/if}
<div bind:this={container} data-testid="color-wheel"></div>
