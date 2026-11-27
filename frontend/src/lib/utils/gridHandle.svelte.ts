import type { GridApi, GridOptions } from '@ag-grid-community/core';

/**
 * The lifecycle every AG Grid component here repeats: hold the Grid API once the grid is
 * ready, drop it before teardown, and run column-API work after ready.
 *
 * Why the wait: column APIs (`setColumnsVisible`, `applyColumnState`, `setGridOption('columnDefs')`)
 * called straight from `onGridReady`, or from an effect it triggers, throw
 * `Cannot read properties of undefined (reading 'setColumnMovingCss')` because the grid's body
 * controller is not up yet. AG Grid hands the controller to its column services from a timer, and
 * `onGridReady` can arrive from a timer queued before that one. A timer queued after ready runs
 * after both; one animation frame alone usually does, but not always.
 *
 * Why drop the API: unmounting the grid (card mode, an error state, a keyed remount) destroys it,
 * and an effect that still holds the old API would call into a destroyed grid.
 */
export interface GridHandle<TData> {
	/** The Grid API from the last `onGridReady`, or null once the grid is torn down. */
	readonly api: GridApi<TData> | null;
	/** True between `onGridReady` and teardown. Effects that touch the grid read this. */
	readonly ready: boolean;
	/** The API only while it is ready and not destroyed; for event-time reads (clicks, exports). */
	live(): GridApi<TData> | null;
	/** Forget the API, e.g. when the component hides the grid without AG Grid's own teardown. */
	detach(): void;
	/**
	 * Run `fn` with the API after the next animation frame and a timer queued from it, skipping it
	 * if the grid was destroyed meanwhile. Returns a cancel function, so an `$effect` can return it as its cleanup.
	 */
	afterFrame(fn: (api: GridApi<TData>) => void): () => void;
	/**
	 * `onGridReady` / `onGridPreDestroyed` handlers to spread into the grid options.
	 * `onReady` / `onDetach` run after the handle has recorded the change.
	 */
	options(hooks?: {
		onReady?: (api: GridApi<TData>) => void;
		onDetach?: () => void;
	}): Pick<GridOptions<TData>, 'onGridReady' | 'onGridPreDestroyed'>;
}

export function createGridHandle<TData>(): GridHandle<TData> {
	// raw: the Grid API is replaced whole, never mutated through, so it needs no deep proxy.
	let api = $state.raw<GridApi<TData> | null>(null);
	let ready = $state(false);

	function detach() {
		api = null;
		ready = false;
	}

	return {
		get api() {
			return api;
		},
		get ready() {
			return ready;
		},
		live() {
			return ready && api && !api.isDestroyed() ? api : null;
		},
		detach,
		afterFrame(fn) {
			const target = api;
			if (!target) return () => {};
			let timer: ReturnType<typeof setTimeout> | undefined;
			const frame = requestAnimationFrame(() => {
				timer = setTimeout(() => {
					if (!target.isDestroyed()) fn(target);
				}, 0);
			});
			return () => {
				cancelAnimationFrame(frame);
				clearTimeout(timer);
			};
		},
		options(hooks = {}) {
			return {
				onGridReady: (params) => {
					api = params.api;
					ready = true;
					hooks.onReady?.(params.api);
				},
				// Fires synchronously before any grid teardown, so effects flushed afterwards
				// see no grid instead of calling a destroyed Grid API. Only the held grid's
				// teardown counts: in a keyed remount the new grid can be ready before the
				// old one's teardown event arrives, and that must not drop the new API.
				onGridPreDestroyed: (event) => {
					if (event.api !== api) return;
					detach();
					hooks.onDetach?.();
				},
			};
		},
	};
}
