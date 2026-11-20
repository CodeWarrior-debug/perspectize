import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RatingInput from '#lib/components/RatingInput.svelte';
import { RATING_DEFAULT_DISPLAY } from '#lib/utils/ratings.js';

function renderRatingInput(props?: { label?: string; value?: number | null; name?: string }) {
	const defaultProps = {
		label: 'Test Rating',
		value: null,
		name: 'test-rating',
		...props,
	};
	return render(RatingInput, { props: defaultProps });
}

describe('RatingInput component', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('renders without errors', () => {
			const { container } = renderRatingInput();
			expect(container).toBeTruthy();
		});

		it('displays the label text', () => {
			renderRatingInput({ label: 'Quality' });
			expect(screen.getByText('Quality')).toBeInTheDocument();
		});

		it('displays different label text correctly', () => {
			renderRatingInput({ label: 'Agreement' });
			expect(screen.getByText('Agreement')).toBeInTheDocument();
		});

		it('associates label with input via for attribute', () => {
			renderRatingInput({ label: 'Test', name: 'my-rating' });
			const label = screen.getByText('Test');
			expect(label.getAttribute('for')).toBe('my-rating');
		});
	});

	describe('default display value', () => {
		it('shows default display value "5.000" when value is null', () => {
			renderRatingInput({ value: null });
			const input = screen.getByDisplayValue('5.000') as HTMLInputElement;
			expect(input).toBeInTheDocument();
		});

		it('shows default value when value is undefined', () => {
			renderRatingInput({ value: undefined });
			const input = screen.getByDisplayValue('5.000') as HTMLInputElement;
			expect(input).toBeInTheDocument();
		});

		it('displays initial non-null value correctly', () => {
			// value in storage units (0-10000), displays as 0-10 with 3 decimals
			renderRatingInput({ value: 7500 }); // 7.500
			const input = screen.getByDisplayValue('7.500') as HTMLInputElement;
			expect(input).toBeInTheDocument();
		});

		it('displays zero value correctly', () => {
			renderRatingInput({ value: 0 });
			const input = screen.getByDisplayValue('0.000') as HTMLInputElement;
			expect(input).toBeInTheDocument();
		});

		it('displays maximum value correctly', () => {
			renderRatingInput({ value: 10000 }); // 10.000
			const input = screen.getByDisplayValue('10.000') as HTMLInputElement;
			expect(input).toBeInTheDocument();
		});
	});

	describe('buttons and aria-labels', () => {
		it('renders decrease button with correct aria-label', () => {
			renderRatingInput({ label: 'Quality' });
			expect(screen.getByLabelText('Decrease Quality')).toBeInTheDocument();
		});

		it('renders increase button with correct aria-label', () => {
			renderRatingInput({ label: 'Quality' });
			expect(screen.getByLabelText('Increase Quality')).toBeInTheDocument();
		});

		it('decrease button aria-label uses correct label name', () => {
			renderRatingInput({ label: 'Agreement' });
			expect(screen.getByLabelText('Decrease Agreement')).toBeInTheDocument();
		});

		it('increase button aria-label uses correct label name', () => {
			renderRatingInput({ label: 'Confidence' });
			expect(screen.getByLabelText('Increase Confidence')).toBeInTheDocument();
		});
	});

	describe('input attributes', () => {
		it('has correct name attribute', () => {
			renderRatingInput({ name: 'my-rating' });
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.name).toBe('my-rating');
		});

		it('has correct id attribute matching name', () => {
			renderRatingInput({ name: 'quality' });
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.id).toBe('quality');
		});

		it('has spinbutton role', () => {
			renderRatingInput();
			expect(screen.getByRole('spinbutton')).toBeInTheDocument();
		});

		it('spinbutton has correct aria-label', () => {
			renderRatingInput({ label: 'Quality' });
			expect(screen.getByLabelText('Quality rating')).toBeInTheDocument();
		});

		it('input has type="number"', () => {
			renderRatingInput();
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.type).toBe('number');
		});
	});

	describe('clear button', () => {
		it('does NOT show clear button when value is null', () => {
			renderRatingInput({ value: null });
			expect(screen.queryByLabelText(/Clear/)).not.toBeInTheDocument();
		});

		it('shows clear button when value is not null', () => {
			renderRatingInput({ value: 5000 });
			expect(screen.getByLabelText('Clear Test Rating rating')).toBeInTheDocument();
		});

		it('shows clear button for zero value', () => {
			renderRatingInput({ value: 0 });
			expect(screen.getByLabelText(/Clear/)).toBeInTheDocument();
		});

		it('clear button has correct aria-label', () => {
			renderRatingInput({ label: 'Quality', value: 7500 });
			expect(screen.getByLabelText('Clear Quality rating')).toBeInTheDocument();
		});

		it('clear button aria-label uses correct label name', () => {
			renderRatingInput({ label: 'Agreement', value: 3000 });
			expect(screen.getByLabelText('Clear Agreement rating')).toBeInTheDocument();
		});
	});

	describe('user interaction', () => {
		it('shows clear button after user clicks increase button', async () => {
			renderRatingInput({ value: null });
			const increaseBtn = screen.getByLabelText('Increase Test Rating');
			await fireEvent.mouseDown(increaseBtn);
			await fireEvent.mouseUp(increaseBtn);
			expect(screen.queryByLabelText(/Clear/)).toBeInTheDocument();
		});

		it('shows clear button after user clicks decrease button', async () => {
			renderRatingInput({ value: null });
			const decreaseBtn = screen.getByLabelText('Decrease Test Rating');
			await fireEvent.mouseDown(decreaseBtn);
			await fireEvent.mouseUp(decreaseBtn);
			expect(screen.queryByLabelText(/Clear/)).toBeInTheDocument();
		});

		it('shows clear button after user types in input', async () => {
			renderRatingInput({ value: null });
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			await fireEvent.change(input, { target: { value: '5' } });
			expect(screen.queryByLabelText(/Clear/)).toBeInTheDocument();
		});

		it('shows clear button after user focuses on input', async () => {
			renderRatingInput({ value: null });
			const input = screen.getByRole('spinbutton');
			await fireEvent.focus(input);
			expect(screen.queryByLabelText(/Clear/)).toBeInTheDocument();
		});
	});

	describe('input value display', () => {
		it('input element has correct numeric attributes', () => {
			renderRatingInput();
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.min).toBe('0');
			expect(input.max).toBe('10');
			expect(input.step).toBe('any');
		});

		it('input displays value with 3 decimal places', () => {
			renderRatingInput({ value: 7234 });
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.value).toBe('7.234');
		});

		it('input displays 1.250 correctly', () => {
			renderRatingInput({ value: 1250 });
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.value).toBe('1.250');
		});
	});

	describe('label association', () => {
		it('input id is used in label for attribute', () => {
			renderRatingInput({ name: 'test-input' });
			const label = screen.getByText('Test Rating');
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(label.getAttribute('for')).toBe(input.id);
		});
	});

	describe('clear rating', () => {
		it('clear button resets to default display', async () => {
			renderRatingInput({ value: 7500 });
			const clearBtn = screen.getByLabelText('Clear Test Rating rating');
			await fireEvent.click(clearBtn);
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.value).toBe('5.000');
		});

		it('clear button hides itself after clearing', async () => {
			renderRatingInput({ value: 7500 });
			const clearBtn = screen.getByLabelText('Clear Test Rating rating');
			await fireEvent.click(clearBtn);
			expect(screen.queryByLabelText(/Clear/)).not.toBeInTheDocument();
		});
	});

	describe('input validation', () => {
		it('accepts valid input value', async () => {
			renderRatingInput({ value: null });
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			await fireEvent.change(input, { target: { value: '8.5' } });
			expect(input.value).toContain('8');
		});

		it('input has number type', () => {
			renderRatingInput();
			const input = screen.getByRole('spinbutton') as HTMLInputElement;
			expect(input.type).toBe('number');
		});
	});

	describe('progress bar', () => {
		it('renders a progress bar element', () => {
			const { container } = renderRatingInput({ value: 5000 });
			const bars = container.querySelectorAll('[role="presentation"]');
			expect(bars.length).toBeGreaterThan(0);
		});

		it('progress bar is clickable (has cursor-pointer class)', () => {
			const { container } = renderRatingInput();
			const bar = container.querySelector('[role="presentation"]');
			expect(bar?.classList.contains('cursor-pointer')).toBe(true);
		});
	});
});
