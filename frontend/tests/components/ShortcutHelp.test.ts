import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ShortcutHelp from '#lib/components/ShortcutHelp.svelte';

const state = vi.hoisted(() => ({ url: null as string | null }));
vi.mock('#lib/utils/shortcutLink.js', () => ({
	get IOS_SHORTCUT_URL() {
		return state.url;
	},
}));

describe('ShortcutHelp', () => {
	beforeEach(() => {
		state.url = null;
	});

	it('hides the install button when no link is set', () => {
		render(ShortcutHelp);
		expect(screen.queryByRole('link', { name: /add the shortcut/i })).not.toBeInTheDocument();
	});

	it('shows an install link when the link is set', () => {
		state.url = 'https://www.icloud.com/shortcuts/abc123';
		render(ShortcutHelp);
		expect(screen.getByRole('link', { name: /add the shortcut/i })).toHaveAttribute(
			'href',
			'https://www.icloud.com/shortcuts/abc123',
		);
	});

	it('always shows the how-to steps', () => {
		render(ShortcutHelp);
		const steps = screen.getAllByRole('listitem');
		expect(steps).toHaveLength(3);
		expect(steps[1]).toHaveTextContent(/choose “Add to Perspectize”/);
	});
});
