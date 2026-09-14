<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import XIcon from '@lucide/svelte/icons/x';
	import { RATING_STEP, RATING_MIN, RATING_MAX, RATING_DEFAULT_DISPLAY } from '$lib/utils/ratings';

	/**
	 * RatingInput — compact stepper + progress bar rating component.
	 *
	 * value: storage units (0-10000), or null if unset.
	 * hasInteracted: when false, shows gray 5.000 default; when true, shows actual value in primary color.
	 */
	let {
		label,
		value = $bindable<number | null>(null),
		name,
		compact = false,
		onRemove,
		trackWidth,
	}: {
		label: string;
		value: number | null;
		name: string;
		compact?: boolean;
		onRemove?: () => void;
		trackWidth?: number;
	} = $props();

	// Track whether the user has interacted with this input
	let hasInteracted = $state(value !== null);

	// Display value in 0-10 scale (what user sees)
	let displayValue = $state(value !== null ? value / 1000 : RATING_DEFAULT_DISPLAY);

	// Keep displayValue in sync when value prop changes (e.g., edit mode population)
	$effect(() => {
		if (value !== null) {
			displayValue = value / 1000;
			hasInteracted = true;
		} else {
			displayValue = RATING_DEFAULT_DISPLAY;
			hasInteracted = false;
		}
	});

	// Hold-to-repeat state
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let isTouching = false;

	function setDisplay(newDisplay: number) {
		const clamped = Math.max(RATING_MIN, Math.min(RATING_MAX, newDisplay));
		const rounded = Math.round(clamped * 1000) / 1000; // keep 3 decimal places
		displayValue = rounded;
		hasInteracted = true;
		value = Math.round(rounded * 1000);
	}

	function increment() {
		setDisplay(displayValue + RATING_STEP);
	}

	function decrement() {
		setDisplay(displayValue - RATING_STEP);
	}

	function startIncrement(e: MouseEvent | TouchEvent) {
		if (e.type === 'mousedown' && isTouching) return;
		if (e.type === 'touchstart') isTouching = true;
		increment();
		timeoutId = setTimeout(() => {
			intervalId = setInterval(increment, 75);
		}, 300);
	}

	function startDecrement(e: MouseEvent | TouchEvent) {
		if (e.type === 'mousedown' && isTouching) return;
		if (e.type === 'touchstart') isTouching = true;
		decrement();
		timeoutId = setTimeout(() => {
			intervalId = setInterval(decrement, 75);
		}, 300);
	}

	function stopRepeat() {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		setTimeout(() => {
			isTouching = false;
		}, 400);
	}

	function handleInputChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const raw = input.value;
		const parsed = parseFloat(raw);
		if (!isNaN(parsed) && parsed >= RATING_MIN && parsed <= RATING_MAX) {
			setDisplay(parsed);
		}
	}

	function handleFocus() {
		hasInteracted = true;
	}

	function handleProgressBarClick(e: MouseEvent) {
		const bar = e.currentTarget as HTMLDivElement;
		const rect = bar.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const pct = Math.max(0, Math.min(1, clickX / rect.width));
		const newVal = RATING_MIN + (RATING_MAX - RATING_MIN) * pct;
		setDisplay(newVal);
	}

	function clearRating() {
		value = null;
		displayValue = RATING_DEFAULT_DISPLAY;
		hasInteracted = false;
	}

	// Progress bar percentage
	const percentage = $derived(hasInteracted ? (displayValue / RATING_MAX) * 100 : 50);

	// Progress bar color based on value
	const barColor = $derived(() => {
		if (!hasInteracted) return 'color-mix(in srgb, var(--color-muted-foreground) 35%, transparent)';
		if (displayValue > 7) return 'var(--color-rating-positive)';
		if (displayValue >= 3) return 'var(--color-rating-neutral)';
		return 'var(--color-rating-negative)';
	});

	// Number display color
	const numberColor = $derived(
		hasInteracted ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-muted-foreground) 35%, transparent)',
	);
</script>

<div class="flex flex-col items-center" class:space-y-1.5={!compact} class:space-y-1={compact}>
	<!-- Label -->
	<label for={name} class="text-xs font-medium text-center text-muted-foreground">
		{label}
	</label>

	<!-- Stepper row -->
	<div class="flex items-center justify-center">
	<div class="inline-flex items-center gap-1.5 relative">
		<!-- Decrement button -->
		<button
			type="button"
			onmousedown={startDecrement}
			onmouseup={stopRepeat}
			onmouseleave={stopRepeat}
			ontouchstart={startDecrement}
			ontouchend={stopRepeat}
			class="flex items-center justify-center transition-opacity hover:opacity-70 select-none text-muted-foreground"
			aria-label="Decrease {label}"
		>
			<ChevronDownIcon class="size-3.5" strokeWidth={2} />
		</button>

		<!-- Number input -->
		<input
			id={name}
			{name}
			type="number"
			min={RATING_MIN}
			max={RATING_MAX}
			step="any"
			value={hasInteracted ? displayValue.toFixed(3) : RATING_DEFAULT_DISPLAY.toFixed(3)}
			onchange={handleInputChange}
			onfocus={handleFocus}
			class="text-center bg-transparent border-none outline-none font-mono text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
			style="width: 60px; color: {numberColor};"
			aria-label="{label} rating"
		/>

		<!-- Increment button -->
		<button
			type="button"
			onmousedown={startIncrement}
			onmouseup={stopRepeat}
			onmouseleave={stopRepeat}
			ontouchstart={startIncrement}
			ontouchend={stopRepeat}
			class="flex items-center justify-center transition-opacity hover:opacity-70 select-none text-muted-foreground"
			aria-label="Increase {label}"
		>
			<ChevronUpIcon class="size-3.5" strokeWidth={2} />
		</button>

		<!-- Clear button (X) — shown only when hasInteracted and no onRemove handler -->
		{#if !onRemove && hasInteracted}
			<button
				type="button"
				onclick={clearRating}
				class="absolute -right-5 flex items-center justify-center transition-opacity hover:opacity-70 text-muted-foreground"
				aria-label="Clear {label} rating"
			>
				<XIcon class="size-3" />
			</button>
		{/if}

		<!-- Remove field button (X) — snug to the right of the stepper row, vertically centered on it -->
		{#if onRemove}
			<button
				type="button"
				onclick={onRemove}
				class="hover-tooltip flex items-center justify-center bg-white border border-border rounded-full shadow-sm text-muted-foreground hover:opacity-70 transition-opacity z-10"
				style="position: absolute; top: 50%; left: 100%; margin-left: 4px; transform: translateY(-50%); width: 16px; height: 16px;"
				aria-label="Remove {label}"
				data-tooltip="Remove {label}"
			>
				<XIcon class="size-2" strokeWidth={3} />
			</button>
		{/if}
	</div>
	</div>

	<!-- Progress bar -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onclick={handleProgressBarClick}
		class="h-1 rounded-full overflow-hidden mx-auto cursor-pointer"
		style="background-color: var(--color-muted); width: {trackWidth ?? 90}px;"
		role="presentation"
	>
		<div
			class="h-full transition-all duration-300 ease-out"
			style="width: {percentage}%; background-color: {barColor()};"
		></div>
	</div>
</div>
