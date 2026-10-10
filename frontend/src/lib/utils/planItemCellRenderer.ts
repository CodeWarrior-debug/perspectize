import type { UserTodoItem } from '$lib/queries/userTodos';
import { activityItemCellRenderer } from './activityItemCellRenderer';
import { planContentLabel } from './plan-grid-config';

/**
 * A todo with no content has no thumbnail, so its text starts at the left edge a thumbnail
 * would: the same row padding (`px-2.5`) as the Activity cell, with nothing in front of the
 * text. Set in the same type as a thumbnail row's title.
 */
function textOnlyCell(label: string): HTMLElement {
	const cell = document.createElement('div');
	cell.className = 'flex h-full w-full cursor-pointer items-center px-2.5 py-[3px]';

	const title = document.createElement('div');
	title.dataset.testid = 'item-title';
	title.className =
		'line-clamp-2 min-w-0 flex-1 whitespace-normal text-left font-[family-name:var(--font-family-serif)] text-[13px] leading-[1.5] text-foreground';
	title.textContent = label;

	cell.append(title);
	return cell;
}

/**
 * The Plan grid's Item cell. A todo with content is drawn by the Activity table's own
 * Item cell (video thumbnail, movie poster, or passage icon beside the title), so the
 * two tables stay alike; a free-text todo is just its name.
 *
 * No `onOpenDetails` is passed on purpose: a click on the title then falls through to
 * the grid's cell click, which opens the todo for editing. The thumbnail still opens
 * the video or movie page in a new tab, as on Activity, without opening the todo.
 */
export function planItemCellRenderer(todo: UserTodoItem): HTMLElement | string {
	const content = todo.content;
	if (!content) return textOnlyCell(planContentLabel(todo));
	return activityItemCellRenderer({
		data: {
			id: content.id,
			name: content.name,
			url: content.url ?? null,
			contentType: content.contentType,
			displayTitle: content.displayTitle,
			verseStartID: content.verseStartID,
			verseEndID: content.verseEndID,
			movie: content.movie,
		},
	});
}
