import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeedbackDialog from '$lib/components/FeedbackDialog.svelte';

describe('FeedbackDialog', () => {
	const originalWindowOpen = window.open;

	beforeEach(() => {
		window.open = vi.fn();
	});

	afterEach(() => {
		window.open = originalWindowOpen;
	});

	it('renders bug report button', () => {
		render(FeedbackDialog);
		expect(screen.getByText('Report a bug')).toBeInTheDocument();
	});

	it('renders feature request button', () => {
		render(FeedbackDialog);
		expect(screen.getByText('Request a feature')).toBeInTheDocument();
	});

	it('opens GitHub bug report URL when bug button is clicked', () => {
		render(FeedbackDialog);

		const bugButton = screen.getByText('Report a bug').closest('button');
		bugButton?.click();

		expect(window.open).toHaveBeenCalledWith(
			'https://github.com/CodeWarrior-debug/perspectize/issues/new?template=bug_report.md',
			'_blank',
			'noopener,noreferrer'
		);
	});

	it('opens GitHub feature request URL when feature button is clicked', () => {
		render(FeedbackDialog);

		const featureButton = screen.getByText('Request a feature').closest('button');
		featureButton?.click();

		expect(window.open).toHaveBeenCalledWith(
			'https://github.com/CodeWarrior-debug/perspectize/issues/new?template=feature_request.md',
			'_blank',
			'noopener,noreferrer'
		);
	});

	it('calls onClose callback when bug button is clicked', () => {
		const onClose = vi.fn();
		render(FeedbackDialog, { props: { onClose } as any });

		const bugButton = screen.getByText('Report a bug').closest('button');
		bugButton?.click();

		expect(onClose).toHaveBeenCalled();
	});

	it('calls onClose callback when feature button is clicked', () => {
		const onClose = vi.fn();
		render(FeedbackDialog, { props: { onClose } as any });

		const featureButton = screen.getByText('Request a feature').closest('button');
		featureButton?.click();

		expect(onClose).toHaveBeenCalled();
	});

	it('displays descriptive text about sending feedback', () => {
		render(FeedbackDialog);
		expect(screen.getByText(/Help us improve Perspectize/)).toBeInTheDocument();
		expect(screen.getByText(/Your feedback will open GitHub/)).toBeInTheDocument();
	});
});
