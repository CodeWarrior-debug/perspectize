import type { CellCtx, ColTooltipSpec } from './tooltipSpec';
import { formatCountExact, percentLikedTooltip, percentLikedValueGetter } from './formatting';

/** Per-column hover popover specs for ActivityTable, keyed by colId. */
export const ACTIVITY_TOOLTIP_SPECS = {
	perspectize: false,
	item: {
		text: (c: CellCtx) => c.data?.name ?? '',
		copyValue: (c: CellCtx) => c.data?.name ?? '',
	},
	category: {
		text: (c: CellCtx) => c.data?.primaryCategory?.label ?? '',
		copyValue: (c: CellCtx) => c.data?.primaryCategory?.label ?? '',
	},
	views: {
		text: (c: CellCtx) => formatCountExact(c.data?.viewCount ?? null),
		copyValue: (c: CellCtx) => c.data?.viewCount,
	},
	likes: {
		text: (c: CellCtx) => formatCountExact(c.data?.likeCount ?? null),
		copyValue: (c: CellCtx) => c.data?.likeCount,
	},
	percentLiked: {
		text: (c: CellCtx) => percentLikedTooltip({ data: c.data }),
		copyValue: (c: CellCtx) => percentLikedValueGetter({ data: c.data }),
	},
	tags: { mode: 'multi', emptyText: 'No tags', items: (c: CellCtx) => c.data?.tags ?? [] },
	description: { emptyText: 'No description', text: (c: CellCtx) => c.data?.description ?? '' },
} satisfies Record<string, ColTooltipSpec>;
