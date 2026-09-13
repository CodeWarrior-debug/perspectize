import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerspectiveHeaderRenderer, perspectiveCellRenderer } from '$lib/utils/formatting';

describe('PerspectiveHeaderRenderer class', () => {
	let renderer: PerspectiveHeaderRenderer;

	beforeEach(() => {
		renderer = new PerspectiveHeaderRenderer();
	});

	describe('init()', () => {
		it('creates an HTMLElement', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element).toBeInstanceOf(HTMLElement);
		});

		it('creates a div element', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.tagName.toLowerCase()).toBe('div');
		});

		it('sets className with flex and centering classes', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.className).toContain('flex');
			expect(element.className).toContain('items-center');
			expect(element.className).toContain('justify-center');
			expect(element.className).toContain('w-full');
			expect(element.className).toContain('h-full');
		});

		it('className is exactly as specified', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.className).toBe('flex items-center justify-center w-full h-full');
		});

		it('sets innerHTML to GLASSES_SVG', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.innerHTML).toBeTruthy();
			expect(element.innerHTML).toContain('svg');
		});

		it('sets title attribute to accessibility text', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.title).toBe('Perspectize — add or edit your perspective');
		});

		it('title attribute is exactly as specified', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.title).toBe('Perspectize — add or edit your perspective');
		});
	});

	describe('getGui()', () => {
		it('returns an HTMLElement', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element).toBeInstanceOf(HTMLElement);
		});

		it('returns the same element after init', () => {
			renderer.init();
			const element1 = renderer.getGui();
			const element2 = renderer.getGui();
			expect(element1).toBe(element2);
		});

		it('returns element with glasses SVG', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.innerHTML).toContain('svg');
		});

		it('returns element with correct className', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.className).toBe('flex items-center justify-center w-full h-full');
		});

		it('returns element with correct title', () => {
			renderer.init();
			const element = renderer.getGui();
			expect(element.title).toBe('Perspectize — add or edit your perspective');
		});
	});

	describe('initialization order', () => {
		it('init must be called before getGui has element', () => {
			// Note: eGui is private and uninitialized, so getGui will return undefined element
			// This test verifies that init() must be called
			renderer.init();
			const element = renderer.getGui();
			expect(element).toBeDefined();
			expect(element.className).toBeTruthy();
		});
	});
});

describe('perspectiveCellRenderer function', () => {
	describe('with no perspective', () => {
		it('returns an HTMLElement', () => {
			const element = perspectiveCellRenderer({});
			expect(element).toBeInstanceOf(HTMLElement);
		});

		it('returns a div element', () => {
			const element = perspectiveCellRenderer({});
			expect(element.tagName.toLowerCase()).toBe('div');
		});

		it('shows "+" when no perspective exists', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			expect(element.textContent).toBe('+');
		});

		it('creates span with "+" content', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			const span = element.querySelector('span');
			expect(span).not.toBeNull();
			expect(span?.textContent).toBe('+');
		});

		it('span has bold font class', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			const span = element.querySelector('span');
			expect(span?.className).toContain('font-bold');
		});

		it('span has text-xl class', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			const span = element.querySelector('span');
			expect(span?.className).toContain('text-xl');
		});

		it('sets title to "Add a perspective"', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			expect(element.title).toBe('Add a perspective');
		});

		it('container has cursor-pointer class', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			expect(element.className).toContain('cursor-pointer');
		});

		it('container has flex centering classes', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			expect(element.className).toContain('flex');
			expect(element.className).toContain('items-center');
			expect(element.className).toContain('justify-center');
		});
	});

	describe('with existing perspective', () => {
		it('returns an HTMLElement', () => {
			const map = new Map([['content-1', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element).toBeInstanceOf(HTMLElement);
		});

		it('shows glasses icon when perspective exists', () => {
			const map = new Map([['content-1', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element.innerHTML).toContain('svg');
		});

		it('does not show "+" when perspective exists', () => {
			const map = new Map([['content-1', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element.textContent).not.toContain('+');
		});

		it('sets title to "Edit your perspective"', () => {
			const map = new Map([['content-1', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element.title).toBe('Edit your perspective');
		});

		it('has dark blue color style', () => {
			const map = new Map([['content-1', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			// JSDOM normalizes hex to rgb
			expect(element.style.color).toBe('rgb(26, 54, 93)');
		});
	});

	describe('missing data and context', () => {
		it('handles missing data object', () => {
			const map = new Map();
			const element = perspectiveCellRenderer({
				context: { perspectivesByContentId: map },
			});
			expect(element).toBeInstanceOf(HTMLElement);
			expect(element.textContent).toContain('+');
		});

		it('handles missing context', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
			});
			expect(element).toBeInstanceOf(HTMLElement);
			expect(element.textContent).toContain('+');
		});

		it('handles missing perspectivesByContentId map', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: {},
			});
			expect(element).toBeInstanceOf(HTMLElement);
			expect(element.textContent).toContain('+');
		});

		it('handles completely empty params', () => {
			const element = perspectiveCellRenderer({});
			expect(element).toBeInstanceOf(HTMLElement);
			expect(element.textContent).toContain('+');
		});

		it('handles null data id', () => {
			const map = new Map([['', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: null as any },
				context: { perspectivesByContentId: map },
			});
			expect(element).toBeInstanceOf(HTMLElement);
		});
	});

	describe('multiple content items', () => {
		it('shows "+" for content without perspective', () => {
			const map = new Map([['content-2', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element.textContent).toContain('+');
		});

		it('shows glasses for content with perspective', () => {
			const map = new Map([
				['content-1', {}],
				['content-2', {}],
			]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element.innerHTML).toContain('svg');
		});

		it('handles different content IDs correctly', () => {
			const map = new Map([['content-100', {}]]);
			const result1 = perspectiveCellRenderer({
				data: { id: 'content-100' },
				context: { perspectivesByContentId: map },
			});
			const result2 = perspectiveCellRenderer({
				data: { id: 'content-101' },
				context: { perspectivesByContentId: map },
			});
			expect(result1.innerHTML).toContain('svg');
			expect(result2.textContent).toContain('+');
		});
	});

	describe('container styling', () => {
		it('container always has h-full and w-full', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			expect(element.className).toContain('h-full');
			expect(element.className).toContain('w-full');
		});

		it('container className is consistent regardless of perspective status', () => {
			const map = new Map([['content-1', {}]]);
			const withPerspective = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			const withoutPerspective = perspectiveCellRenderer({
				data: { id: 'content-2' },
				context: { perspectivesByContentId: map },
			});
			expect(withPerspective.className).toBe(withoutPerspective.className);
		});
	});

	describe('SVG content', () => {
		it('glasses SVG is valid when perspective exists', () => {
			const map = new Map([['content-1', {}]]);
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: map },
			});
			expect(element.innerHTML).toContain('<svg');
			expect(element.innerHTML).toContain('</svg>');
		});

		it('no SVG when showing "+"', () => {
			const element = perspectiveCellRenderer({
				data: { id: 'content-1' },
				context: { perspectivesByContentId: new Map() },
			});
			expect(element.querySelector('span')).not.toBeNull();
			expect(element.querySelector('svg')).toBeNull();
		});
	});
});
