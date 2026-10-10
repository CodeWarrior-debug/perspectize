import type { UserTodoItem } from '$lib/queries/userTodos';
import { activityItemCellRenderer } from './activityItemCellRenderer';
import { planContentLabel } from './plan-grid-config';

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
	if (!content) return planContentLabel(todo);
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
