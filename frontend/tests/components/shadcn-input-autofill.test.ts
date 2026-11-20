import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { Input } from '#lib/components/shadcn/index.js';

// The shared Input opts out of password-manager fill by default; allowAutofill is the one
// documented way back for real identity fields.
describe('shadcn Input password-manager opt-out', () => {
	it('opts out by default with all four attributes', () => {
		render(Input, { props: { placeholder: 'Search' } });
		const input = screen.getByPlaceholderText('Search');
		expect(input).toHaveAttribute('autocomplete', 'off');
		expect(input).toHaveAttribute('data-lpignore', 'true');
		expect(input).toHaveAttribute('data-1p-ignore', 'true');
		expect(input).toHaveAttribute('data-bwignore', 'true');
	});

	it('allowAutofill leaves the field free of the opt-out attributes', () => {
		render(Input, { props: { placeholder: 'Username', allowAutofill: true } });
		const input = screen.getByPlaceholderText('Username');
		expect(input).not.toHaveAttribute('autocomplete');
		expect(input).not.toHaveAttribute('data-lpignore');
		expect(input).not.toHaveAttribute('data-1p-ignore');
		expect(input).not.toHaveAttribute('data-bwignore');
	});

	it('an explicit autocomplete token from the caller wins over the default', () => {
		render(Input, { props: { placeholder: 'Email', autocomplete: 'email' } });
		expect(screen.getByPlaceholderText('Email')).toHaveAttribute('autocomplete', 'email');
	});

	it('allowAutofill is consumed, not forwarded to the DOM', () => {
		render(Input, { props: { placeholder: 'Handle', allowAutofill: true } });
		expect(screen.getByPlaceholderText('Handle')).not.toHaveAttribute('allowautofill');
	});
});
