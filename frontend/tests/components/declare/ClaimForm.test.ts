import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ClaimForm from '$lib/components/declare/ClaimForm.svelte';
import type { ClaimRow } from '$lib/queries/content/claims';

const mocks = vi.hoisted(() => ({
	createMutate: vi.fn(),
	updateMutate: vi.fn(),
}));

vi.mock('$lib/queries/content/useCreateClaim', () => ({
	useCreateClaim: vi.fn(() => ({ mutate: mocks.createMutate, isPending: false })),
}));

vi.mock('$lib/queries/content/useUpdateClaim', () => ({
	useUpdateClaim: vi.fn(() => ({ mutate: mocks.updateMutate, isPending: false })),
}));

const CLAIM: ClaimRow = {
	id: '42',
	name: 'Old claim text',
	addedByUserID: '7',
	privacy: 'PRIVATE',
	customFields: { effectiveDate: '2026-01-05', evaluateBy: '2027-01-05' },
	createdAt: '2026-01-05T12:00:00Z',
	updatedAt: '2026-01-05T12:00:00Z',
};

const LEGACY_CLAIM: ClaimRow = { ...CLAIM, id: '189', name: 'Legacy claim text', customFields: null };

function textArea() {
	return screen.getByLabelText('Claim') as HTMLTextAreaElement;
}
function effectiveInput() {
	return screen.getByLabelText('Effective date') as HTMLInputElement;
}
function evaluateInput() {
	return screen.getByLabelText('Evaluate by') as HTMLInputElement;
}
function submitButton(name: string) {
	return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('ClaimForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Local "today" is 2026-10-23 so the default effective date is deterministic.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 23, 12, 0, 0));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('create mode', () => {
		it('defaults the effective date to today (local) and leaves evaluate-by empty', () => {
			render(ClaimForm);
			expect(effectiveInput().value).toBe('2026-10-23');
			expect(evaluateInput().value).toBe('');
		});

		it('shows the two-word hint and disables submit for an empty claim', () => {
			render(ClaimForm);
			expect(screen.getByText('Write the claim as a statement of at least two words.')).toBeInTheDocument();
			expect(submitButton('Declare')).toBeDisabled();
		});

		it('shows the two-word hint and disables submit for a one-word claim', async () => {
			render(ClaimForm);
			await fireEvent.input(textArea(), { target: { value: 'Water' } });
			expect(screen.getByText('Write the claim as a statement of at least two words.')).toBeInTheDocument();
			expect(submitButton('Declare')).toBeDisabled();
		});

		it('does not count punctuation-only tokens as words', async () => {
			render(ClaimForm);
			await fireEvent.input(textArea(), { target: { value: 'Water ---' } });
			expect(screen.getByText('Write the claim as a statement of at least two words.')).toBeInTheDocument();
			expect(submitButton('Declare')).toBeDisabled();
		});

		it('submits a valid claim through the create mutation with userID 0', async () => {
			render(ClaimForm);
			await fireEvent.input(textArea(), { target: { value: 'Water is wet' } });
			expect(screen.queryByText('Write the claim as a statement of at least two words.')).not.toBeInTheDocument();
			expect(submitButton('Declare')).toBeEnabled();

			await fireEvent.click(submitButton('Declare'));

			expect(mocks.createMutate).toHaveBeenCalledTimes(1);
			expect(mocks.createMutate).toHaveBeenCalledWith(
				{ text: 'Water is wet', userID: 0, effectiveDate: '2026-10-23', evaluateBy: undefined, privacy: 'PUBLIC' },
				expect.objectContaining({ onSuccess: expect.any(Function) }),
			);
			expect(mocks.updateMutate).not.toHaveBeenCalled();
		});

		it('sends the evaluate-by date when one is chosen', async () => {
			render(ClaimForm);
			await fireEvent.input(textArea(), { target: { value: 'Water is wet' } });
			await fireEvent.input(evaluateInput(), { target: { value: '2027-06-01' } });
			await fireEvent.click(submitButton('Declare'));
			expect(mocks.createMutate).toHaveBeenCalledWith(
				expect.objectContaining({ evaluateBy: '2027-06-01' }),
				expect.anything(),
			);
		});

		it('shows the shorten message and disables submit for a claim over 300 characters', async () => {
			render(ClaimForm);
			// 61 words of "word" joined by spaces = 304 characters after collapsing.
			await fireEvent.input(textArea(), { target: { value: 'word '.repeat(61) } });
			expect(screen.getByText('Shorten the claim to 300 characters.')).toBeInTheDocument();
			expect(submitButton('Declare')).toBeDisabled();
		});

		it('shows an inline error and does not mutate when evaluate-by is before effective', async () => {
			render(ClaimForm);
			await fireEvent.input(textArea(), { target: { value: 'Water is wet' } });
			await fireEvent.input(effectiveInput(), { target: { value: '2026-10-23' } });
			await fireEvent.input(evaluateInput(), { target: { value: '2026-10-01' } });

			expect(screen.getByText('Evaluate-by date cannot be before the effective date.')).toBeInTheDocument();
			expect(submitButton('Declare')).toBeDisabled();

			await fireEvent.click(submitButton('Declare'));
			expect(mocks.createMutate).not.toHaveBeenCalled();
		});
	});

	describe('privacy', () => {
		it('create: a new claim is public unless the switch is turned on', async () => {
			render(ClaimForm);
			expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
			await fireEvent.input(textArea(), { target: { value: 'Water is wet' } });
			await fireEvent.click(screen.getByRole('switch'));
			await fireEvent.click(submitButton('Declare'));
			expect(mocks.createMutate).toHaveBeenCalledWith(
				expect.objectContaining({ privacy: 'PRIVATE' }),
				expect.anything(),
			);
		});

		it('edit: a private claim shows the switch on, and turning it off alone saves as public', async () => {
			render(ClaimForm, { props: { claim: CLAIM } });
			expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
			expect(submitButton('Save')).toBeDisabled();

			await fireEvent.click(screen.getByRole('switch'));
			expect(submitButton('Save')).toBeEnabled();
			await fireEvent.click(submitButton('Save'));

			expect(mocks.updateMutate).toHaveBeenCalledWith(
				expect.objectContaining({ input: expect.objectContaining({ privacy: 'PUBLIC' }) }),
				expect.anything(),
			);
		});
	});

	describe('edit mode', () => {
		it('pre-fills the text and both dates from the claim and labels submit "Save"', () => {
			render(ClaimForm, { props: { claim: CLAIM } });
			expect(textArea().value).toBe('Old claim text');
			expect(effectiveInput().value).toBe('2026-01-05');
			expect(evaluateInput().value).toBe('2027-01-05');
			expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
		});

		it('shows a Cancel button that calls onDone', async () => {
			const onDone = vi.fn();
			render(ClaimForm, { props: { claim: CLAIM, onDone } });
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			expect(onDone).toHaveBeenCalledTimes(1);
		});

		it('keeps submit disabled and does not call update when nothing changed', async () => {
			render(ClaimForm, { props: { claim: CLAIM } });
			expect(submitButton('Save')).toBeDisabled();
			await fireEvent.click(submitButton('Save'));
			expect(mocks.updateMutate).not.toHaveBeenCalled();
		});

		it('calls update with the claim id and the changed text when the text changes', async () => {
			render(ClaimForm, { props: { claim: CLAIM } });
			await fireEvent.input(textArea(), { target: { value: 'New claim text' } });
			expect(submitButton('Save')).toBeEnabled();
			await fireEvent.click(submitButton('Save'));

			expect(mocks.updateMutate).toHaveBeenCalledTimes(1);
			expect(mocks.updateMutate).toHaveBeenCalledWith(
				{
					id: '42',
					input: {
						text: 'New claim text',
						effectiveDate: '2026-01-05',
						evaluateBy: '2027-01-05',
						privacy: 'PRIVATE',
					},
				},
				expect.objectContaining({ onSuccess: expect.any(Function) }),
			);
			expect(mocks.createMutate).not.toHaveBeenCalled();
		});

		it('sends a null evaluateBy when the evaluate-by date is cleared', async () => {
			render(ClaimForm, { props: { claim: CLAIM } });
			await fireEvent.input(evaluateInput(), { target: { value: '' } });
			await fireEvent.click(submitButton('Save'));
			expect(mocks.updateMutate).toHaveBeenCalledWith(
				expect.objectContaining({ input: expect.objectContaining({ evaluateBy: null }) }),
				expect.anything(),
			);
		});

		it('renders a legacy claim with no customFields: empty date fields, no date error', () => {
			render(ClaimForm, { props: { claim: LEGACY_CLAIM } });
			expect(textArea().value).toBe('Legacy claim text');
			expect(effectiveInput().value).toBe('');
			expect(evaluateInput().value).toBe('');
			expect(screen.queryByText('Evaluate-by date cannot be before the effective date.')).not.toBeInTheDocument();
			expect(screen.queryByText('Write the claim as a statement of at least two words.')).not.toBeInTheDocument();
			expect(submitButton('Save')).toBeDisabled();
		});

		it('sends no effective date for a legacy claim when only the text changes', async () => {
			render(ClaimForm, { props: { claim: LEGACY_CLAIM } });
			await fireEvent.input(textArea(), { target: { value: 'Legacy claim, reworded' } });
			await fireEvent.click(submitButton('Save'));
			expect(mocks.updateMutate).toHaveBeenCalledWith(
				{
					id: '189',
					input: { text: 'Legacy claim, reworded', effectiveDate: undefined, evaluateBy: null, privacy: 'PRIVATE' },
				},
				expect.anything(),
			);
		});
	});
});
