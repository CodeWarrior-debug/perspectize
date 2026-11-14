import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import WebPageRolesPicker from '$lib/components/webpage/WebPageRolesPicker.svelte';
import type { WebPageRole } from '$lib/queries/content';

function renderPicker(roles: WebPageRole[], disabled = false) {
	const onChange = vi.fn();
	render(WebPageRolesPicker, { props: { roles, onChange, disabled } });
	return { onChange };
}

const openList = async () => {
	await fireEvent.click(screen.getByRole('button', { name: /^roles$/i }));
};
const option = (label: string) => screen.getByRole('option', { name: label });

describe('WebPageRolesPicker', () => {
	it('nothing picked: the summary reads None, and the options stay closed until opened', async () => {
		renderPicker([]);
		expect(screen.getByTestId('roles-summary')).toHaveTextContent('None');
		expect(screen.queryByRole('listbox')).toBeNull();
		await openList();
		expect(option('Blog post')).toHaveAttribute('aria-selected', 'false');
		expect(option('Session transcript')).toHaveAttribute('aria-selected', 'false');
	});

	it('picking one sends just that role', async () => {
		const { onChange } = renderPicker([]);
		await openList();
		await fireEvent.click(option('Blog post'));
		expect(onChange).toHaveBeenCalledWith(['BLOG_POST']);
	});

	it('picking the second keeps the first pick first: the first pick is the primary role', async () => {
		const { onChange } = renderPicker(['SESSION_TRANSCRIPT']);
		await openList();
		await fireEvent.click(option('Blog post'));
		expect(onChange).toHaveBeenCalledWith(['SESSION_TRANSCRIPT', 'BLOG_POST']);
	});

	it('unpicking one removes only that one and keeps the rest in order', async () => {
		const { onChange } = renderPicker(['BLOG_POST', 'SESSION_TRANSCRIPT']);
		await openList();
		await fireEvent.click(option('Blog post'));
		expect(onChange).toHaveBeenCalledWith(['SESSION_TRANSCRIPT']);
	});

	it('both picked: the summary lists them in pick order and the options show as selected', async () => {
		renderPicker(['SESSION_TRANSCRIPT', 'BLOG_POST']);
		expect(screen.getByTestId('roles-summary')).toHaveTextContent('Session transcript, Blog post');
		await openList();
		expect(option('Blog post')).toHaveAttribute('aria-selected', 'true');
		expect(option('Session transcript')).toHaveAttribute('aria-selected', 'true');
	});

	it('disabled: the list cannot be opened', async () => {
		renderPicker([], true);
		expect(screen.getByRole('button', { name: /^roles$/i })).toBeDisabled();
	});
});
