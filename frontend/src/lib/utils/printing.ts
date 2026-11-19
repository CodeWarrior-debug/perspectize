export type PrintMode = 'list' | 'grid';

export interface PrintHooks {
	before: () => void | Promise<void>;
	after: () => void;
}

/**
 * Prints the page in the given mode. `html[data-print]` selects the print
 * stylesheet rules; it is set after `before` has finished and is removed (and
 * `after` run, once) on `afterprint`, which browsers also fire when the dialog
 * is cancelled. If `print` throws, the same cleanup runs and the error rethrows.
 */
export async function runPrint(
	mode: PrintMode,
	hooks: PrintHooks,
	win: Pick<Window, 'print' | 'addEventListener' | 'removeEventListener'> = window,
	doc: Document = document,
): Promise<void> {
	try {
		await hooks.before();
	} catch (error) {
		doc.documentElement.removeAttribute('data-print');
		hooks.after();
		throw error;
	}
	const root = doc.documentElement;
	let cleaned = false;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		win.removeEventListener('afterprint', cleanup);
		root.removeAttribute('data-print');
		hooks.after();
	};
	root.setAttribute('data-print', mode);
	win.addEventListener('afterprint', cleanup);
	try {
		win.print();
	} catch (error) {
		cleanup();
		throw error;
	}
}

const LANDSCAPE_STYLE_ATTR = 'data-print-page';

/** `@page` cannot be scoped by an attribute selector, so landscape is added for one print run. */
export function addLandscapePageStyle(doc: Document = document): void {
	if (doc.head.querySelector(`style[${LANDSCAPE_STYLE_ATTR}]`)) return;
	const style = doc.createElement('style');
	style.setAttribute(LANDSCAPE_STYLE_ATTR, '');
	style.textContent = '@page { size: landscape; }';
	doc.head.appendChild(style);
}

export function removeLandscapePageStyle(doc: Document = document): void {
	doc.head.querySelectorAll(`style[${LANDSCAPE_STYLE_ATTR}]`).forEach((el) => el.remove());
}
