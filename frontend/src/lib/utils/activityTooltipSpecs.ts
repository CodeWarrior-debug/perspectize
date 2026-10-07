import type { CellCtx, ColTooltipSpec } from './tooltipSpec';
import {
	formatCountExact,
	percentLikedTooltip,
	percentLikedValueGetter,
	castTooltipItems,
	boxOfficeTooltip,
	boxOfficeValueGetter,
	vsBudgetTooltip,
	vsBudgetValueGetter,
	tmdbScoreTooltip,
	tmdbScoreValueGetter,
	contentTags,
	synopsisValueGetter,
	formatMoneyExact,
	budgetValueGetter,
} from './formatting';

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
	tags: { mode: 'multi', emptyText: 'No tags', items: (c: CellCtx) => contentTags(c.data) ?? [] },
	cast: { mode: 'multi', emptyText: 'No cast or directors', items: (c: CellCtx) => castTooltipItems(c.data) },
	boxOffice: {
		text: (c: CellCtx) => boxOfficeTooltip({ data: c.data }),
		copyValue: (c: CellCtx) => boxOfficeValueGetter({ data: c.data }),
	},
	vsBudget: {
		text: (c: CellCtx) => vsBudgetTooltip({ data: c.data }),
		copyValue: (c: CellCtx) => vsBudgetValueGetter({ data: c.data }),
	},
	tmdbScore: {
		text: (c: CellCtx) => tmdbScoreTooltip({ data: c.data }),
		copyValue: (c: CellCtx) => tmdbScoreValueGetter({ data: c.data }),
	},
	budget: {
		text: (c: CellCtx) => formatMoneyExact(budgetValueGetter({ data: c.data })),
		copyValue: (c: CellCtx) => budgetValueGetter({ data: c.data }),
	},
	synopsis: { emptyText: 'No synopsis', text: (c: CellCtx) => synopsisValueGetter({ data: c.data }) ?? '' },
	description: { emptyText: 'No description', text: (c: CellCtx) => c.data?.description ?? '' },
} satisfies Record<string, ColTooltipSpec>;
