import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { addLandscapePageStyle, removeLandscapePageStyle, runPrint } from '#lib/utils/printing.js';

const appCss = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

function makeWin(print: () => void = () => {}) {
	let handler: (() => void) | null = null;
	const win = {
		print: vi.fn(print),
		addEventListener: vi.fn((_: string, h: () => void) => {
			handler = h;
		}),
		removeEventListener: vi.fn((_: string, h: () => void) => {
			if (handler === h) handler = null;
		}),
	};
	return { win, fire: () => handler?.() };
}

describe('runPrint', () => {
	it('sets data-print after before() and before print()', async () => {
		const order: string[] = [];
		const { win } = makeWin(() => {
			order.push(`print:${document.documentElement.getAttribute('data-print')}`);
		});
		await runPrint(
			'list',
			{
				before: () => {
					order.push(`before:${document.documentElement.getAttribute('data-print')}`);
				},
				after: () => {},
			},
			win,
			document,
		);
		expect(order).toEqual(['before:null', 'print:list']);
	});

	it('awaits an async before() prior to printing', async () => {
		const order: string[] = [];
		const { win } = makeWin(() => order.push('print'));
		await runPrint(
			'grid',
			{
				before: async () => {
					await Promise.resolve();
					order.push('before');
				},
				after: () => {},
			},
			win,
			document,
		);
		expect(order).toEqual(['before', 'print']);
		expect(document.documentElement.getAttribute('data-print')).toBe('grid');
		document.documentElement.removeAttribute('data-print');
	});

	it('afterprint clears the attribute and runs after once', async () => {
		const after = vi.fn();
		const { win, fire } = makeWin();
		await runPrint('list', { before: () => {}, after }, win, document);
		expect(document.documentElement.getAttribute('data-print')).toBe('list');
		fire();
		expect(document.documentElement.hasAttribute('data-print')).toBe(false);
		expect(after).toHaveBeenCalledTimes(1);
		expect(win.removeEventListener).toHaveBeenCalledWith('afterprint', expect.any(Function));
		fire();
		expect(after).toHaveBeenCalledTimes(1);
	});

	it('restores everything when print throws, and rethrows', async () => {
		const after = vi.fn();
		const { win } = makeWin(() => {
			throw new Error('boom');
		});
		await expect(runPrint('list', { before: () => {}, after }, win, document)).rejects.toThrow('boom');
		expect(document.documentElement.hasAttribute('data-print')).toBe(false);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it('restores everything on a cancelled dialog (afterprint only)', async () => {
		const after = vi.fn();
		const { win, fire } = makeWin();
		await runPrint('grid', { before: () => {}, after }, win, document);
		fire();
		expect(document.documentElement.hasAttribute('data-print')).toBe(false);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it('restores the page and rethrows when before() throws', async () => {
		const after = vi.fn();
		const { win } = makeWin();
		const before = () => {
			throw new Error('setup failed');
		};
		await expect(runPrint('grid', { before, after }, win, document)).rejects.toThrow('setup failed');
		expect(after).toHaveBeenCalledTimes(1);
		expect(win.print).not.toHaveBeenCalled();
		expect(document.documentElement.hasAttribute('data-print')).toBe(false);
		expect(win.addEventListener).not.toHaveBeenCalled();
	});

	it('restores the page and rethrows when before() rejects', async () => {
		const after = vi.fn();
		const { win } = makeWin();
		const before = async () => {
			await Promise.resolve();
			throw new Error('async setup failed');
		};
		await expect(runPrint('grid', { before, after }, win, document)).rejects.toThrow('async setup failed');
		expect(after).toHaveBeenCalledTimes(1);
		expect(win.print).not.toHaveBeenCalled();
		expect(document.documentElement.hasAttribute('data-print')).toBe(false);
		expect(win.addEventListener).not.toHaveBeenCalled();
	});

	it('runs after once when afterprint fires synchronously inside print()', async () => {
		const after = vi.fn();
		const ctl = makeWin();
		ctl.win.print.mockImplementation(() => ctl.fire());
		await runPrint('list', { before: () => {}, after }, ctl.win, document);
		expect(after).toHaveBeenCalledTimes(1);
		expect(document.documentElement.hasAttribute('data-print')).toBe(false);
		ctl.fire();
		expect(after).toHaveBeenCalledTimes(1);
	});
});

describe('As-seen print css', () => {
	it('hides everything except the grid', () => {
		expect(appCss).toContain(
			"html[data-print='grid'] body *:not(.activity-grid):not(.activity-grid *):not(:has(.activity-grid))",
		);
		expect(appCss).toContain("html[data-print='grid'] .activity-grid");
	});

	it('lets every grid ancestor grow and show overflow so all rows reach the page', () => {
		const rule = appCss.slice(appCss.indexOf("html[data-print='grid'] body *:has(.activity-grid)"));
		const block = rule.slice(0, rule.indexOf('}'));
		expect(block).toContain("html[data-print='grid'] .activity-grid");
		expect(block).toContain('height: auto !important');
		expect(block).toContain('max-height: none !important');
		expect(block).toContain('overflow: visible !important');
	});
});

describe('landscape page style', () => {
	it('adds one @page landscape style and removes it', () => {
		addLandscapePageStyle(document);
		addLandscapePageStyle(document);
		const styles = document.head.querySelectorAll('style[data-print-page]');
		expect(styles).toHaveLength(1);
		expect(styles[0].textContent).toContain('size: landscape');
		removeLandscapePageStyle(document);
		expect(document.head.querySelector('style[data-print-page]')).toBeNull();
	});
});
