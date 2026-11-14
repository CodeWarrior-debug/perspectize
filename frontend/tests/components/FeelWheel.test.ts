import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FeelWheel from '$lib/components/FeelWheel.svelte';

describe('FeelWheel intensity', () => {
	it('shows a freshly picked feeling as unset until the user changes intensity', async () => {
		const { container } = render(FeelWheel, { props: { value: [] } });
		const wheelButton = container.querySelector('button[aria-pressed="false"]') as HTMLButtonElement;
		await fireEvent.click(wheelButton);

		const input = screen.getByLabelText('Intensity rating') as HTMLInputElement;
		expect(input.value).toBe('5.000');
		expect(input.style.color).toContain('color-mix');

		await fireEvent.mouseDown(screen.getByLabelText('Increase Intensity'));
		await fireEvent.mouseUp(screen.getByLabelText('Increase Intensity'));
		expect((screen.getByLabelText('Intensity rating') as HTMLInputElement).style.color).toContain('--color-primary');
	});

	it('treats an already-saved feeling as set', () => {
		render(FeelWheel, { props: { value: [{ emoji: '🥰', label: 'Love', intensity: 5000 }] } });
		expect((screen.getByLabelText('Intensity rating') as HTMLInputElement).style.color).toContain('--color-primary');
	});
});
