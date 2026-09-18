import type { PopoverState } from '$lib/components/CellPopover.svelte';
import { resolveSpec, displayText, copyText, type CellCtx } from './tooltipSpec';

export interface BuildPopoverParams {
	colDef: { context?: { tooltipSpec?: any } };
	value: unknown;
	valueFormatted?: string | null;
	data?: any;
	cellEl: HTMLElement;
}

export function buildPopoverState(params: BuildPopoverParams): PopoverState | null {
	const spec = resolveSpec(params.colDef.context?.tooltipSpec);
	if (!spec) return null;
	const ctx: CellCtx = {
		value: params.value,
		valueFormatted: params.valueFormatted,
		data: params.data,
	};
	if (spec.mode === 'multi') {
		return {
			anchor: params.cellEl,
			mode: 'multi',
			text: '',
			copy: null,
			items: spec.items?.(ctx) ?? [],
		};
	}
	return {
		anchor: params.cellEl,
		mode: 'single',
		text: displayText(spec, ctx),
		copy: copyText(spec, ctx),
		items: [],
	};
}
