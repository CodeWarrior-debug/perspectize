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
	const empty = (): PopoverState | null =>
		spec.emptyText ? { anchor: params.cellEl, mode: 'single', text: spec.emptyText, copy: null, items: [] } : null;
	if (spec.mode === 'multi') {
		const items = spec.items?.(ctx) ?? [];
		if (items.length === 0) return empty();
		return { anchor: params.cellEl, mode: 'multi', text: '', copy: null, items };
	}
	const text = displayText(spec, ctx);
	if (text.trim() === '') return empty();
	return {
		anchor: params.cellEl,
		mode: 'single',
		text,
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
	let pendingAnchor: HTMLElement | null = null;
	let insidePopover = false;

	function cancelOpen() {
		clearTimeout(openTimer);
		pendingAnchor = null;
	}

	function scheduleClose() {
		cancelOpen();
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			if (!insidePopover) opts.setState(null);
		}, closeDelay);
	}

	return {
		// State is built once per open so its identity stays stable while shown.
		hover(cellEl: HTMLElement, build: () => PopoverState | null) {
			clearTimeout(closeTimer);
			const current = opts.getState();
			if (current?.anchor === cellEl) {
				cancelOpen();
				return;
			}
			// Different cell: give the pointer a grace period to reach the open popover.
			if (current) {
				clearTimeout(closeTimer);
				closeTimer = setTimeout(() => {
					if (!insidePopover) opts.setState(null);
				}, closeDelay);
			}
			// Same pending cell (child-element mouseovers): keep the running open timer.
			if (pendingAnchor === cellEl) return;
			clearTimeout(openTimer);
			pendingAnchor = cellEl;
			openTimer = setTimeout(() => {
				pendingAnchor = null;
				if (insidePopover) return;
				opts.setState(build());
			}, openDelay);
		},
		leave: scheduleClose,
		popoverLeave() {
			insidePopover = false;
			scheduleClose();
		},
		enter() {
			insidePopover = true;
			clearTimeout(closeTimer);
			cancelOpen();
		},
		// Immediately close and cancel any pending open (scroll/sort/filter/data change).
		close() {
			insidePopover = false;
			cancelOpen();
			clearTimeout(closeTimer);
			opts.setState(null);
		},
		destroy() {
			insidePopover = false;
			cancelOpen();
			clearTimeout(closeTimer);
		},
	};
}
