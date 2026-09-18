import type { PopoverState } from '$lib/components/CellPopover.svelte';
import { resolveSpec, displayText, copyText, type CellCtx, type ColTooltipSpec } from './tooltipSpec';

export interface BuildPopoverParams {
	colDef: { context?: { tooltipSpec?: ColTooltipSpec } };
	value: unknown;
	valueFormatted?: string | null;
	data?: unknown;
	cellEl: HTMLElement;
}

export function buildPopoverState(params: BuildPopoverParams): PopoverState | null {
	const spec = resolveSpec(params.colDef.context?.tooltipSpec);
	if (!spec) return null;
	const ctx: CellCtx = {
		value: params.value,
		valueFormatted: params.valueFormatted,
		data: params.data as CellCtx['data'],
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

export interface HoverControllerOptions {
	getState: () => PopoverState | null;
	setState: (s: PopoverState | null) => void;
	openDelay?: number;
	closeDelay?: number;
}

export function createHoverController(opts: HoverControllerOptions) {
	const openDelay = opts.openDelay ?? 600;
	const closeDelay = opts.closeDelay ?? 150;
	let openTimer: ReturnType<typeof setTimeout> | undefined;
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleClose() {
		clearTimeout(openTimer);
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => opts.setState(null), closeDelay);
	}

	return {
		// State is built once per open so its identity stays stable while shown.
		hover(cellEl: HTMLElement, build: () => PopoverState | null) {
			clearTimeout(closeTimer);
			clearTimeout(openTimer);
			if (opts.getState()?.anchor === cellEl) return;
			openTimer = setTimeout(() => opts.setState(build()), openDelay);
		},
		leave: scheduleClose,
		enter() {
			clearTimeout(closeTimer);
		},
		destroy() {
			clearTimeout(openTimer);
			clearTimeout(closeTimer);
		},
	};
}
