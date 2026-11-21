<script lang="ts">
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
		Input,
	} from '#lib/components/shadcn/index.js';
	import type { OperandRow } from '#lib/customColumns/operands.js';
	import { useSharedFormulas } from '#lib/queries/savedFormulas/useSharedFormulas.js';
	import { useCopySavedItem } from '#lib/queries/savedFormulas/useCopySavedItem.js';
	import { useLinkSavedItem } from '#lib/queries/savedFormulas/useLinkSavedItem.js';
	import { useDeleteSavedItem } from '#lib/queries/savedFormulas/useDeleteSavedItem.js';
	import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';
	import { isInsideToast, toastWithAction } from '#lib/utils/toast.js';
	import SharedColumnCard from './SharedColumnCard.svelte';
	import { actionTargetId, sharedErrorMessage } from './sharedColumns.js';

	interface Props {
		/** Two-way bound open state. */
		open?: boolean;
		/** The viewer's loaded rows, the population each shared column's top result is read from. */
		previewRows?: OperandRow[];
		/** The viewer's own saved formula ids. */
		ownedIds?: Set<string>;
		/** Called with the new saved row after a copy or link succeeds. */
		onAdded: (formula: SavedFormula) => void;
	}

	let { open = $bindable(false), previewRows = [], ownedIds = new Set<string>(), onAdded }: Props = $props();

	const shared = useSharedFormulas();
	const copy = useCopySavedItem();
	const link = useLinkSavedItem();
	const remove = useDeleteSavedItem();

	type Action = 'copy' | 'link';

	let search = $state('');
	let pending = $state<{ id: string; action: Action } | null>(null);
	let errors = $state<Record<string, string>>({});
	/** Rows this dialog added, by the new row's id and by the source it points at, so the card updates before the parent's ownedIds does. */
	let addedIds = $state<Set<string>>(new Set());
	let addedTargets = $state<Set<string>>(new Set());

	const loaded = $derived(shared.data?.sharedFormulas.items ?? []);

	/** Hides the viewer's own rows (they are in ownedIds or were just added here). */
	const others = $derived(loaded.filter((row) => !ownedIds.has(row.id) && !addedIds.has(row.id)));

	/** The viewer's loaded rows that point at a source, so that source reads "In your columns". */
	const ownedSourceIds = $derived(
		new Set(
			loaded
				.filter((row) => ownedIds.has(row.id) || addedIds.has(row.id))
				.map((row) => row.sourceId)
				.filter((id): id is string => id !== null),
		),
	);

	const needle = $derived(search.trim().toLowerCase());

	const visible = $derived(
		needle === ''
			? others
			: others.filter((row) =>
					[row.name, row.payload?.subtitle ?? '', row.user.username].some((text) =>
						text.toLowerCase().includes(needle),
					),
				),
	);

	function inYourColumns(row: SavedFormula): boolean {
		const target = actionTargetId(row);
		// A row whose own id is in ownedIds is the viewer's own and is hidden, so only its source can match here.
		return ownedIds.has(row.sourceId ?? '') || ownedSourceIds.has(target) || addedTargets.has(target);
	}

	function undo(saved: SavedFormula) {
		remove.mutate(
			{ id: saved.id, privacy: saved.privacy },
			{
				onSuccess: () => {
					addedIds = withoutValue(addedIds, saved.id);
					addedTargets = withoutValue(addedTargets, actionTargetId(saved));
				},
			},
		);
	}

	function withoutValue(set: Set<string>, value: string): Set<string> {
		const next = new Set(set);
		next.delete(value);
		return next;
	}

	function add(row: SavedFormula, action: Action) {
		const target = actionTargetId(row);
		const mutation = action === 'copy' ? copy : link;
		pending = { id: row.id, action };
		errors = withoutKey(errors, row.id);
		mutation.mutate(target, {
			onSuccess: (saved) => {
				pending = null;
				addedIds = new Set([...addedIds, saved.id]);
				addedTargets = new Set([...addedTargets, target]);
				const formula: SavedFormula = { ...saved, payload: row.payload };
				onAdded(formula);
				const message =
					action === 'copy'
						? `Copied “${saved.name}” into your columns. It's yours now, and private.`
						: `Linked “${saved.name}”. It follows the author's edits.`;
				toastWithAction(message, { label: 'Undo', onClick: () => undo(formula) }, { id: `shared-column-${saved.id}` });
			},
			onError: (err) => {
				pending = null;
				errors = { ...errors, [row.id]: sharedErrorMessage(err) };
			},
		});
	}

	function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
		const next = { ...record };
		delete next[key];
		return next;
	}
</script>

<Dialog bind:open>
	<DialogContent
		class="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col gap-4"
		onInteractOutside={(e) => {
			// A toast's Undo button renders outside this dialog; clicking it must not close the dialog.
			if (isInsideToast(e.target)) e.preventDefault();
		}}
	>
		<DialogHeader>
			<DialogTitle>Shared columns</DialogTitle>
			<DialogDescription
				>Columns other people have shared. Use a copy to own it, or link to follow its author.</DialogDescription
			>
		</DialogHeader>

		<Input
			type="search"
			bind:value={search}
			placeholder="Search by name, description or author"
			aria-label="Search shared columns"
		/>

		<div class="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
			{#if shared.isPending}
				<p role="status" class="text-sm text-muted-foreground">Loading shared columns…</p>
			{:else if shared.isError}
				<p role="alert" class="text-sm text-destructive">Could not load shared columns. Close this and try again.</p>
			{:else if others.length === 0}
				<p class="text-sm text-muted-foreground">Nobody has shared a column yet</p>
			{:else if visible.length === 0}
				<p class="text-sm text-muted-foreground">No shared columns match “{search.trim()}”.</p>
			{:else}
				{#each visible as row (row.id)}
					<SharedColumnCard
						{row}
						{previewRows}
						inYourColumns={inYourColumns(row)}
						pending={pending?.id === row.id ? pending.action : null}
						error={errors[row.id] ?? null}
						onCopy={() => add(row, 'copy')}
						onLink={() => add(row, 'link')}
					/>
				{/each}
			{/if}
		</div>
	</DialogContent>
</Dialog>
