<script lang="ts">
	import { Button, Input, Label, Switch } from '$lib/components/shadcn';
	import { useCreateClaim } from '$lib/queries/content/useCreateClaim';
	import { useUpdateClaim } from '$lib/queries/content/useUpdateClaim';
	import type { ClaimPrivacy, ClaimRow } from '$lib/queries/content/claims';

	// Mirrors the server rules (backend claim validation): trimmed and whitespace-collapsed text,
	// at least two words, at most 300 characters, and evaluate-by not before effective.
	const MIN_WORDS = 2;
	const MAX_CHARS = 300;

	let {
		claim,
		onDone,
	}: {
		/** Edit this claim. Omit to create a new one. */
		claim?: ClaimRow;
		onDone?: () => void;
	} = $props();

	const uid = $props.id();
	const isEdit = $derived(claim !== undefined);

	/** Local calendar date as YYYY-MM-DD (not UTC, so the default matches the user's day). */
	function localToday(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	function normalise(s: string): string {
		return s.trim().replace(/\s+/g, ' ');
	}

	function wordCount(s: string): number {
		// A word is a whitespace-separated token that contains a letter or digit.
		return normalise(s)
			.split(' ')
			.filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
	}

	// Editable fields seed from the claim once. The parent keys each row's form by claim, so a
	// later prop change never needs to overwrite what the user is typing.
	// svelte-ignore state_referenced_locally
	let text = $state(claim?.name ?? '');
	// svelte-ignore state_referenced_locally
	let effectiveDate = $state(claim ? (claim.customFields?.effectiveDate ?? '') : localToday());
	// svelte-ignore state_referenced_locally
	let evaluateBy = $state(claim?.customFields?.evaluateBy ?? '');
	// Claims are public unless the owner keeps them private.
	// svelte-ignore state_referenced_locally
	let isPrivate = $state(claim?.privacy === 'PRIVATE');

	const createClaim = useCreateClaim();
	const updateClaim = useUpdateClaim();
	const isPending = $derived(createClaim.isPending || updateClaim.isPending);

	const normalisedText = $derived(normalise(text));
	const tooShort = $derived(wordCount(text) < MIN_WORDS);
	const tooLong = $derived([...normalisedText].length > MAX_CHARS);
	const dateOrderInvalid = $derived(effectiveDate !== '' && evaluateBy !== '' && evaluateBy < effectiveDate);

	// Edit mode only submits when something differs from the saved claim.
	const changed = $derived(
		!claim ||
			normalisedText !== normalise(claim.name) ||
			effectiveDate !== (claim.customFields?.effectiveDate ?? '') ||
			evaluateBy !== (claim.customFields?.evaluateBy ?? '') ||
			isPrivate !== (claim.privacy === 'PRIVATE'),
	);

	const canSubmit = $derived(!tooShort && !tooLong && !dateOrderInvalid && changed && !isPending);

	function reset() {
		text = '';
		effectiveDate = localToday();
		evaluateBy = '';
		isPrivate = false;
	}

	function privacy(): ClaimPrivacy {
		return isPrivate ? 'PRIVATE' : 'PUBLIC';
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;

		if (claim) {
			updateClaim.mutate(
				{
					id: claim.id,
					// An empty effective date is omitted (the server keeps or defaults it); an empty evaluate-by clears it.
					input: {
						text: normalisedText,
						effectiveDate: effectiveDate || undefined,
						evaluateBy: evaluateBy || null,
						privacy: privacy(),
					},
				},
				{ onSuccess: () => onDone?.() },
			);
		} else {
			createClaim.mutate(
				{
					text: normalisedText,
					userID: 0,
					effectiveDate: effectiveDate || undefined,
					evaluateBy: evaluateBy || undefined,
					privacy: privacy(),
				},
				{
					onSuccess: () => {
						reset();
						onDone?.();
					},
				},
			);
		}
	}

	const textareaClass =
		'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] flex min-h-20 w-full min-w-0 rounded-md border px-3 py-2 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';
</script>

<form onsubmit={handleSubmit} class="space-y-4" aria-label={isEdit ? 'Edit claim' : 'New claim'}>
	<div class="space-y-2">
		<Label for="{uid}-text">Claim</Label>
		<textarea
			id="{uid}-text"
			class={textareaClass}
			rows="3"
			placeholder="Write a claim as a statement"
			bind:value={text}
			disabled={isPending}
			aria-invalid={tooShort || tooLong}
			aria-describedby="{uid}-feedback"></textarea>
		<div id="{uid}-feedback" class="space-y-1 text-sm">
			{#if tooShort}
				<p class="text-muted-foreground">Write the claim as a statement of at least two words.</p>
			{/if}
			{#if tooLong}
				<p class="text-destructive">Shorten the claim to {MAX_CHARS} characters.</p>
			{/if}
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<Label for="{uid}-effective">Effective date</Label>
			<Input id="{uid}-effective" type="date" bind:value={effectiveDate} disabled={isPending} />
		</div>
		<div class="space-y-2">
			<Label for="{uid}-evaluate">Evaluate by</Label>
			<Input
				id="{uid}-evaluate"
				type="date"
				bind:value={evaluateBy}
				disabled={isPending}
				aria-invalid={dateOrderInvalid}
				aria-describedby="{uid}-date-error"
			/>
		</div>
	</div>
	{#if dateOrderInvalid}
		<p id="{uid}-date-error" class="text-destructive text-sm">Evaluate-by date cannot be before the effective date.</p>
	{/if}

	<div class="flex items-center justify-between gap-4">
		<div class="space-y-0.5">
			<Label for="{uid}-private">Private</Label>
			<p class="text-muted-foreground text-sm">
				{isPrivate ? 'Only you can see this claim.' : 'Anyone can see this claim.'}
			</p>
		</div>
		<Switch id="{uid}-private" bind:checked={isPrivate} disabled={isPending} />
	</div>

	<div class="flex items-center justify-end gap-2">
		{#if isEdit}
			<Button type="button" variant="outline" onclick={() => onDone?.()} disabled={isPending}>Cancel</Button>
		{/if}
		<Button type="submit" disabled={!canSubmit}>{isEdit ? 'Save' : 'Declare'}</Button>
	</div>
</form>
