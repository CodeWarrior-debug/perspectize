import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import InterlinearCredit from '$lib/components/interlinear/InterlinearCredit.svelte';

describe('InterlinearCredit', () => {
	it('links "STEP Bible" to stepbible.org and states the license', () => {
		render(InterlinearCredit);
		const link = screen.getByRole('link', { name: 'STEP Bible' });
		expect(link).toHaveAttribute('href', 'https://www.stepbible.org');
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		expect(screen.getByText(/CC BY 4\.0/)).toBeInTheDocument();
		expect(screen.getByText(/Berean Standard Bible \(public domain\)/)).toBeInTheDocument();
		expect(screen.getByText(/Tyndale House/)).toBeInTheDocument();
	});
});
