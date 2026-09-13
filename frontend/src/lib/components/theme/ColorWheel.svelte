<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		value: string; // hex
		onChange: (hex: string) => void;
		size?: number;
	}

	let { value, onChange, size = 180 }: Props = $props();

	let container: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let picker: any;

	onMount(async () => {
		const { default: iro } = await import('@jaames/iro');
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

<div bind:this={container} data-testid="color-wheel"></div>
