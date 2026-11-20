import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import PageWrapper from '#lib/components/PageWrapper.svelte';
import { createRawSnippet } from 'svelte';

function createChildrenSnippet(text: string = 'Test content') {
	return createRawSnippet(() => ({
		render: () => `<span>${text}</span>`,
	}));
}

function renderWrapper(props: Record<string, unknown> = {}) {
	const result = render(PageWrapper, {
		props: { children: createChildrenSnippet(), ...props },
	});
	const main = result.container.querySelector('main');
	return { ...result, main };
}

describe('PageWrapper component', () => {
	it('renders a main element with children', () => {
		const { main } = renderWrapper();
		expect(main).toBeInTheDocument();
	});

	it('renders the provided children content', () => {
		const { container } = render(PageWrapper, {
			props: { children: createChildrenSnippet('Hello World') },
		});
		expect(container.textContent).toContain('Hello World');
	});

	it('has responsive padding classes', () => {
		const { main } = renderWrapper();
		expect(main?.className).toContain('px-4');
	});

	it('has max-width constraint', () => {
		const { main } = renderWrapper();
		expect(main?.className).toContain('max-w-screen-xl');
	});

	it('renders without custom className (default empty string)', () => {
		const { main } = renderWrapper({ class: undefined });
		expect(main?.className).toContain('px-4');
		expect(main?.className).not.toContain('custom-class');
	});

	it('applies custom className when provided', () => {
		const { main } = renderWrapper({ class: 'custom-class' });
		expect(main?.className).toContain('custom-class');
	});
});
