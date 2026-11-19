<script lang="ts">
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		Button,
		Input,
		Label,
	} from '$lib/components/shadcn';

	export type PrintSpacing = 'compact' | 'standard' | 'roomy';

	interface Props {
		/** Two-way bound open state. */
		open?: boolean;
		/** Called with the chosen options when Print is clicked; the dialog then closes. */
		onPrint: (opts: { title: string; spacing: PrintSpacing }) => void;
	}

	let { open = $bindable(false), onPrint }: Props = $props();

	const DEFAULT_TITLE = 'Library';
	const SPACING_OPTIONS: { value: PrintSpacing; label: string }[] = [
		{ value: 'compact', label: 'Compact' },
		{ value: 'standard', label: 'Standard' },
		{ value: 'roomy', label: 'Roomy' },
	];

	let title = $state(DEFAULT_TITLE);
	let spacing = $state<PrintSpacing>('standard');

	// Each opening starts from the defaults, not the previous session's choices.
	$effect(() => {
		if (open) {
			title = DEFAULT_TITLE;
			spacing = 'standard';
		}
	});

	function handlePrint(event: SubmitEvent) {
		event.preventDefault();
		const opts = { title, spacing };
		open = false;
		onPrint(opts);
	}
</script>

<Dialog bind:open>
	<DialogContent class="max-w-sm">
		<DialogHeader>
			<DialogTitle>Print as list</DialogTitle>
		</DialogHeader>

		<form class="contents" onsubmit={handlePrint}>
			<div class="space-y-4 py-2">
				<div class="space-y-1.5">
					<Label for="print-title">Title</Label>
					<Input id="print-title" bind:value={title} />
				</div>

				<fieldset class="space-y-1.5">
					<legend class="text-sm font-medium">Spacing</legend>
					<div class="flex gap-2">
						{#each SPACING_OPTIONS as option (option.value)}
							<label
								class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-sm hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent"
							>
								<input
									type="radio"
									name="print-spacing"
									class="accent-primary"
									value={option.value}
									bind:group={spacing}
								/>
								{option.label}
							</label>
						{/each}
					</div>
				</fieldset>
			</div>

			<DialogFooter>
				<Button type="submit">Print</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
