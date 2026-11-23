<script lang="ts">
	import { NO_AUTOFILL } from '#lib/utils/noAutofill.js';
	import { tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		Input,
	} from '#lib/components/shadcn/index.js';
	import {
		OPERANDS,
		OPERANDS_BY_KEY,
		evaluateColumn,
		formulaShapeError,
		isOperandNode,
		isOpNode,
		parseFormula,
		printFormula,
		stepsToTree,
		treeToSteps,
		type FormulaNode,
		type FormulaPayload,
		type Operand,
		type OperandRow,
		type Steps,
	} from '#lib/customColumns';
	import { useCreateSavedFormula } from '#lib/queries/savedFormulas/useCreateSavedFormula.js';
	import { useUpdateSavedFormula } from '#lib/queries/savedFormulas/useUpdateSavedFormula.js';
	import type { SavedFormula, SavedItemPrivacy } from '#lib/queries/savedFormulas/index.js';
	import CustomColumnPreview from './CustomColumnPreview.svelte';
	import CustomColumnSteps from './CustomColumnSteps.svelte';
	import { DEFAULT_NUMBER_FORMAT, NUMBER_FORMATS, normalizeNumberFormat, saveErrorMessage } from './builderFormat';

	interface Props {
		/** Two-way bound open state. The caller mounts this component only while open. */
		open?: boolean;
		/** The column being edited. Null or undefined means create mode. */
		formula?: SavedFormula | null;
		/** The movie rows currently loaded in the grid, already shaped as operand rows. */
		previewRows?: OperandRow[];
		/** Called with the saved column after a successful create or update. */
		onSaved?: (formula: SavedFormula) => void;
	}

	let { open = $bindable(false), formula = null, previewRows = [], onSaved }: Props = $props();

	const FUNCTIONS = ['log10', 'sqrt', 'zscore', 'min', 'max', 'coalesce'] as const;
	const NAME_MAX = 100;
	const SUBTITLE_MAX = 200;

	type Mode = 'steps' | 'formula';

	/** The starting draft: the stored formula when editing, otherwise a fresh column on TMDB score. */
	type Draft = {
		name: string;
		subtitle: string;
		numberFormat: string;
		privacy: SavedItemPrivacy;
		mode: Mode;
		steps: Steps;
		formulaText: string;
	};

	function draftFrom(f: SavedFormula | null): Draft {
		const draft: Draft = {
			name: '',
			subtitle: '',
			numberFormat: DEFAULT_NUMBER_FORMAT,
			privacy: 'PRIVATE',
			mode: 'steps',
			steps: { start: 'tmdbScore', steps: [] },
			formulaText: '',
		};
		if (!f) return draft;
		draft.name = f.name;
		draft.subtitle = f.payload?.subtitle ?? '';
		draft.numberFormat = normalizeNumberFormat(f.payload?.numberFormat);
		draft.privacy = f.privacy;
		const expression = f.payload?.expression;
		if (!expression) return draft;
		const asSteps = treeToSteps(expression);
		if (asSteps) return { ...draft, steps: asSteps };
		return { ...draft, mode: 'formula', formulaText: printFormula(expression) };
	}

	// Seeded once: the dialog mounts fresh each time it opens, so later prop changes do not re-seed.
	const seed = untrack(() => draftFrom(formula ?? null));

	const isEdit = $derived(formula != null);
	let name = $state(seed.name);
	let subtitle = $state(seed.subtitle);
	let numberFormat = $state(seed.numberFormat);
	let privacy = $state<SavedItemPrivacy>(seed.privacy);
	let mode = $state<Mode>(seed.mode);
	let steps = $state<Steps>(seed.steps);
	let formulaText = $state(seed.formulaText);
	let blocked = $state(false);
	let serverError = $state<string | null>(null);
	let formulaInput = $state<HTMLTextAreaElement | null>(null);

	const createMutation = useCreateSavedFormula();
	const updateMutation = useUpdateSavedFormula();

	const stepsTree = $derived(stepsToTree(steps));
	const parsed = $derived(parseFormula(formulaText));
	const parseError = $derived('error' in parsed ? parsed.error : null);
	const suggestions = $derived('error' in parsed ? (parsed.suggestions ?? []) : []);

	/** The tree the active editor describes; null when the active editor has no valid tree. */
	const activeTree = $derived.by((): FormulaNode | null => {
		if (mode === 'steps') return stepsTree;
		return 'tree' in parsed ? parsed.tree : null;
	});
	/** Steps are always a tree, so only their shape caps can fail; a formula already carries its parse error. */
	const activeError = $derived.by((): string | null => {
		if (mode === 'formula') return parseError;
		return formulaShapeError(stepsTree);
	});
	const validTree = $derived(activeError === null ? activeTree : null);

	/** The movie columns the tree reads, in order of first use. */
	function operandKeysOf(node: FormulaNode, out: string[] = []): string[] {
		if (isOperandNode(node)) {
			if (!out.includes(node.operand)) out.push(node.operand);
		} else if (isOpNode(node)) {
			for (const arg of node.args) operandKeysOf(arg, out);
		}
		return out;
	}

	const usedOperands = $derived(
		validTree
			? operandKeysOf(validTree).flatMap((key): Operand[] => {
					const operand = OPERANDS_BY_KEY.get(key);
					return operand ? [operand] : [];
				})
			: [],
	);
	const previewValues = $derived(validTree ? evaluateColumn(validTree, previewRows, OPERANDS_BY_KEY) : null);

	const trimmedName = $derived(name.trim());
	const subtitleTooLong = $derived(subtitle.length > SUBTITLE_MAX);
	const nameTooLong = $derived(trimmedName.length > NAME_MAX);
	const pending = $derived(createMutation.isPending || updateMutation.isPending);
	const canSave = $derived(trimmedName !== '' && !nameTooLong && !subtitleTooLong && validTree !== null && !pending);

	function toFormula() {
		formulaText = printFormula(stepsTree);
		blocked = false;
		mode = 'formula';
	}

	function toSteps() {
		const result = parseFormula(formulaText);
		if ('error' in result) return;
		const asSteps = treeToSteps(result.tree);
		if (!asSteps) {
			blocked = true;
			return;
		}
		steps = asSteps;
		blocked = false;
		mode = 'steps';
	}

	/** Inserts text where the caret is, then puts the caret at `caretOffset` inside the inserted text. */
	async function insertAtCaret(text: string, caretOffset = text.length) {
		const el = formulaInput;
		const start = el?.selectionStart ?? formulaText.length;
		const end = el?.selectionEnd ?? start;
		formulaText = formulaText.slice(0, start) + text + formulaText.slice(end);
		blocked = false;
		const caret = start + caretOffset;
		await tick();
		formulaInput?.focus();
		formulaInput?.setSelectionRange(caret, caret);
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const tree = validTree;
		if (!canSave || tree === null) return;
		const payload: FormulaPayload = { expression: tree, numberFormat };
		if (subtitle.trim() !== '') payload.subtitle = subtitle.trim();
		serverError = null;
		try {
			const saved = formula
				? await updateMutation.mutateAsync({ id: Number(formula.id), name: trimmedName, payload })
				: await createMutation.mutateAsync({ name: trimmedName, payload, privacy });
			toast.success(formula ? 'Custom column updated' : 'Custom column saved');
			onSaved?.(saved);
			open = false;
		} catch (err) {
			serverError = saveErrorMessage(err);
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
		<DialogHeader>
			<DialogTitle>{isEdit ? 'Edit custom column' : 'New custom column'}</DialogTitle>
			<DialogDescription>Build a column from your Library fields. It is calculated in your browser.</DialogDescription>
		</DialogHeader>

		<form class="space-y-5" onsubmit={save}>
			<div class="space-y-1">
				<label for="cc-name" class="text-sm font-medium">Name</label>
				<Input
					id="cc-name"
					maxlength={NAME_MAX}
					bind:value={name}
					placeholder="Bang for buck"
					aria-invalid={nameTooLong}
					aria-describedby="cc-name-hint"
				/>
				{#if trimmedName === ''}
					<p id="cc-name-hint" class="text-xs text-muted-foreground">Give your column a name.</p>
				{/if}
			</div>

			<div class="space-y-1">
				<label for="cc-subtitle" class="text-sm font-medium">Subtitle</label>
				<Input id="cc-subtitle" maxlength={SUBTITLE_MAX} bind:value={subtitle} aria-describedby="cc-subtitle-hint" />
				<p id="cc-subtitle-hint" class="text-xs text-muted-foreground">Shown when you hover the column header.</p>
			</div>

			<section class="space-y-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="text-sm font-semibold">Calculation</h3>
					{#if mode === 'steps'}
						<Button type="button" variant="outline" size="sm" onclick={toFormula}>Edit as formula</Button>
					{:else}
						<Button type="button" variant="outline" size="sm" onclick={toSteps}>Back to steps</Button>
					{/if}
				</div>

				{#if mode === 'steps'}
					<CustomColumnSteps bind:steps rows={previewRows} />
				{:else}
					<div class="space-y-2">
						<label for="cc-formula" class="text-sm font-medium">Formula</label>
						<textarea
							{...NO_AUTOFILL}
							id="cc-formula"
							rows="3"
							spellcheck="false"
							class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
							bind:this={formulaInput}
							bind:value={formulaText}
							oninput={() => (blocked = false)}
							aria-invalid={parseError !== null}
							aria-describedby="cc-formula-error"></textarea>

						<div class="flex flex-wrap gap-1.5" role="group" aria-label="Insert a column">
							{#each OPERANDS as operand (operand.key)}
								<button
									type="button"
									class="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
									onclick={() => insertAtCaret(`[${operand.label}]`)}
								>
									[{operand.label}]
								</button>
							{/each}
						</div>
						<div class="flex flex-wrap gap-1.5" role="group" aria-label="Insert a function">
							{#each FUNCTIONS as fn (fn)}
								<button
									type="button"
									class="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-xs text-secondary-foreground hover:bg-accent"
									onclick={() => insertAtCaret(`${fn}()`, fn.length + 1)}
								>
									{fn}()
								</button>
							{/each}
						</div>

						<div id="cc-formula-error" aria-live="polite" class="space-y-1 text-sm">
							{#if parseError}
								<p class="text-destructive">{parseError}</p>
								{#if suggestions.length > 0}
									<p class="text-xs text-muted-foreground">Closest columns: {suggestions.join(', ')}</p>
								{/if}
							{:else if blocked}
								<p class="text-muted-foreground">
									This formula needs the formula bar. Steps can only show a simple chain, so it stays a formula.
								</p>
							{/if}
						</div>
					</div>
				{/if}

				{#if mode === 'steps' && activeError}
					<p class="text-sm text-destructive">{activeError}</p>
				{/if}

				<p class="text-sm font-medium">Your calculation</p>
				<CustomColumnPreview
					operands={usedOperands}
					rows={previewRows}
					values={previewValues}
					heading={trimmedName || 'New column'}
					{numberFormat}
				/>
			</section>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1">
					<label for="cc-format" class="text-sm font-medium">Show values as</label>
					<select
						id="cc-format"
						class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
						bind:value={numberFormat}
					>
						{#each NUMBER_FORMATS as format (format.value)}
							<option value={format.value}>{format.label}</option>
						{/each}
					</select>
				</div>

				<fieldset class="space-y-2">
					<legend class="text-sm font-medium">Who can see it</legend>
					<label class="flex items-start gap-2 text-sm">
						<input
							type="radio"
							name="cc-privacy"
							class="mt-1 accent-primary"
							value="PRIVATE"
							disabled={isEdit}
							bind:group={privacy}
						/>
						<span>Only me</span>
					</label>
					<label class="flex items-start gap-2 text-sm">
						<input
							type="radio"
							name="cc-privacy"
							class="mt-1 accent-primary"
							value="PUBLIC"
							disabled={isEdit}
							bind:group={privacy}
						/>
						<span>Anyone <span class="text-xs text-muted-foreground">(they can copy or link it)</span></span>
					</label>
					{#if isEdit}
						<p class="text-xs text-muted-foreground">Privacy is set when a column is created.</p>
					{/if}
				</fieldset>
			</div>

			{#if serverError}
				<p role="alert" class="text-sm text-destructive">{serverError}</p>
			{/if}

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={!canSave}>{pending ? 'Saving…' : 'Save'}</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
