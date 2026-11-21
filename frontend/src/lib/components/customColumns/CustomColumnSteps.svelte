<script lang="ts">
	import { NO_AUTOFILL } from '#lib/utils/noAutofill.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		OPERANDS,
		OPERANDS_BY_KEY,
		STEP_LABELS,
		compressPreview,
		evaluateColumn,
		explainCompareToRest,
		explainCompress,
		printFormula,
		stepsToTree,
		type OperandRow,
		type Step,
		type StepOp,
		type StepScale,
		type Steps,
	} from '#lib/customColumns';
	import { formatCustomValue } from './builderFormat';

	interface Props {
		/** The guided model; the parent owns it and stores its tree. */
		steps: Steps;
		/** The loaded movie rows the compress preview and the z-score note are measured on. */
		rows: readonly OperandRow[];
	}

	let { steps = $bindable(), rows }: Props = $props();

	const OP_LABEL: Record<StepOp, string> = { div: 'divided by', mul: 'times', add: 'plus', sub: 'minus' };
	const SCALE_LABEL: Record<StepScale, string> = {
		millions: STEP_LABELS.millions,
		thousands: STEP_LABELS.thousands,
		none: 'as is',
	};

	const isMoney = (key: string) => OPERANDS_BY_KEY.get(key)?.unit === 'money';

	function setSteps(next: Step[]) {
		steps = { ...steps, steps: next };
	}

	function updateStep(index: number, patch: (step: Step) => Step) {
		setSteps(steps.steps.map((step, i) => (i === index ? patch(step) : step)));
	}

	function removeStep(index: number) {
		setSteps(steps.steps.filter((_, i) => i !== index));
	}

	function addStep() {
		setSteps([...steps.steps, { op: 'div', with: { const: 1 } }]);
	}

	function setStart(key: string) {
		steps = { ...steps, start: key };
	}

	/**
	 * Before and after log10 for a step's running value. "Before" is the value the step produces
	 * with its own operation only: earlier steps as chosen, this step without either transform.
	 */
	const compressPreviews = $derived(
		steps.steps.map((step, i) => {
			if (!step.compress) return null;
			const prefix: Step[] = [...steps.steps.slice(0, i), { ...step, compress: false, compareToRest: false }];
			const values = evaluateColumn(stepsToTree({ start: steps.start, steps: prefix }), rows, OPERANDS_BY_KEY);
			return compressPreview(values);
		}),
	);

	const formulaText = $derived(printFormula(stepsToTree(steps)));
	const compareNote = $derived(explainCompareToRest(rows.length));
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center gap-2">
		<label for="cc-start" class="text-sm font-medium">Start with</label>
		<select
			id="cc-start"
			class="h-9 rounded-md border border-input bg-background px-2 text-sm"
			value={steps.start}
			onchange={(e) => setStart(e.currentTarget.value)}
		>
			{#each OPERANDS as operand (operand.key)}
				<option value={operand.key}>{operand.label}</option>
			{/each}
		</select>
	</div>

	<ol class="space-y-3">
		{#each steps.steps as step, i (i)}
			{@const n = i + 1}
			{@const withKey = 'operand' in step.with ? step.with.operand : 'const'}
			<li class="space-y-2 rounded-md border border-border p-3">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm text-muted-foreground">Step {n}</span>
					<select
						aria-label="Step {n}: operation"
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
						value={step.op}
						onchange={(e) => updateStep(i, (s) => ({ ...s, op: e.currentTarget.value as StepOp }))}
					>
						{#each Object.entries(OP_LABEL) as [op, label] (op)}
							<option value={op}>{label}</option>
						{/each}
					</select>
					<select
						aria-label="Step {n}: column or number"
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
						value={withKey}
						onchange={(e) => {
							const value = e.currentTarget.value;
							updateStep(i, (s) => {
								if (value === 'const') {
									const { scale: _scale, ...rest } = s;
									return { ...rest, with: { const: 1 } };
								}
								const next: Step = { ...s, with: { operand: value } };
								if (isMoney(value)) next.scale = s.scale ?? 'millions';
								else delete next.scale;
								return next;
							});
						}}
					>
						<option value="const">a number</option>
						{#each OPERANDS as operand (operand.key)}
							<option value={operand.key}>{operand.label}</option>
						{/each}
					</select>
					{#if 'const' in step.with}
						<input
							{...NO_AUTOFILL}
							type="number"
							step="any"
							aria-label="Step {n}: number"
							class="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
							value={step.with.const}
							oninput={(e) => {
								const parsed = e.currentTarget.valueAsNumber;
								updateStep(i, (s) => ({ ...s, with: { const: parsed } }));
							}}
						/>
					{/if}
					{#if 'operand' in step.with && isMoney(step.with.operand)}
						<select
							aria-label="Step {n}: scale"
							class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							value={step.scale ?? 'none'}
							onchange={(e) => {
								const scale = e.currentTarget.value as StepScale;
								updateStep(i, (s) => {
									const { scale: _old, ...rest } = s;
									return scale === 'none' ? rest : { ...rest, scale };
								});
							}}
						>
							<option value="millions">{SCALE_LABEL.millions}</option>
							<option value="thousands">{SCALE_LABEL.thousands}</option>
							<option value="none">{SCALE_LABEL.none}</option>
						</select>
					{/if}
					<button
						type="button"
						aria-label="Remove step {n}"
						class="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
						onclick={() => removeStep(i)}
					>
						<XIcon class="size-4" />
					</button>
				</div>

				<div class="space-y-1 pl-1">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="size-4 accent-primary"
							checked={step.compress ?? false}
							onchange={(e) => updateStep(i, (s) => ({ ...s, compress: e.currentTarget.checked }))}
						/>
						{STEP_LABELS.compress}
					</label>
					{#if step.compress}
						<p class="text-xs text-muted-foreground">{explainCompress()}</p>
						{@const preview = compressPreviews[i]}
						{#if preview}
							<p class="text-xs text-muted-foreground">
								Smallest: {formatCustomValue(preview.smallest.before, 'sig3')} becomes
								{preview.smallest.after === null
									? 'no value (zero or below)'
									: formatCustomValue(preview.smallest.after, 'sig3')}. Largest: {formatCustomValue(
									preview.largest.before,
									'sig3',
								)} becomes
								{preview.largest.after === null
									? 'no value (zero or below)'
									: formatCustomValue(preview.largest.after, 'sig3')}.
							</p>
						{/if}
					{/if}
				</div>

				<div class="space-y-1 pl-1">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="size-4 accent-primary"
							checked={step.compareToRest ?? false}
							onchange={(e) => updateStep(i, (s) => ({ ...s, compareToRest: e.currentTarget.checked }))}
						/>
						{STEP_LABELS.compareToRest}
					</label>
					{#if step.compareToRest}
						<p class="text-xs text-muted-foreground">{compareNote}</p>
					{/if}
				</div>
			</li>
		{/each}
	</ol>

	<button
		type="button"
		class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
		onclick={addStep}
	>
		<PlusIcon class="size-4" />
		Add a step
	</button>

	<p class="text-xs text-muted-foreground">
		As a formula: <code class="font-mono text-foreground">{formulaText}</code>
	</p>
</div>
