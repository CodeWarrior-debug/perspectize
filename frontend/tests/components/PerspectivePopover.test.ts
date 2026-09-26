import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PerspectivePopover from '$lib/components/PerspectivePopover.svelte';
import { tick } from 'svelte';

const mocks = vi.hoisted(() => ({
	mockCreateMutate: vi.fn(),
	mockUpdateMutate: vi.fn(),
	mockOnClose: vi.fn(),
	mockSaveDraft: vi.fn(),
	mockLoadDraft: vi.fn(() => null as string | null),
	mockClearDraft: vi.fn(),
}));

vi.mock('$lib/utils/perspectiveDraft', () => ({
	draftKey: (contentId: number, userId: number) => `draft:${contentId}:${userId}`,
	saveDraft: mocks.mockSaveDraft,
	loadDraft: mocks.mockLoadDraft,
	clearDraft: mocks.mockClearDraft,
}));

vi.mock('$lib/components/PerspectiveEditor.svelte', async () => {
	const mod = await import('../helpers/FakePerspectiveEditor.svelte');
	return { default: mod.default };
});

vi.mock('$lib/queries/perspectives/useCreatePerspective', () => ({
	useCreatePerspective: vi.fn(() => ({
		mutate: mocks.mockCreateMutate,
		isPending: false,
	})),
}));

vi.mock('$lib/queries/perspectives/useUpdatePerspective', () => ({
	useUpdatePerspective: vi.fn(() => ({
		mutate: mocks.mockUpdateMutate,
		isPending: false,
	})),
}));

vi.mock('$lib/queries/perspectives/useHermeneuticApproaches', () => ({
	useHermeneuticApproaches: vi.fn(() => ({
		data: { hermeneuticApproaches: [] },
	})),
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

function renderPopover(props?: {
	contentId?: number;
	contentName?: string;
	existingPerspective?: any;
	userId?: number;
	open?: boolean;
	onClose?: () => void;
}) {
	const defaultProps = {
		contentId: 1,
		contentName: 'Test Content',
		userId: 42,
		onClose: mocks.mockOnClose,
		open: true,
		...props,
	};
	return render(PerspectivePopover, { props: defaultProps });
}

describe('PerspectivePopover component', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mockLoadDraft.mockReturnValue(null);
	});

	describe('rendering', () => {
		it('renders without errors', () => {
			const { container } = renderPopover();
			expect(container).toBeTruthy();
		});

		it('renders dialog with "Add perspective" title when creating', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			expect(screen.getByText('Add perspective')).toBeInTheDocument();
		});

		it('renders dialog with "Edit perspective" title when editing', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: 7500,
					agreement: 5000,
					importance: 6000,
					confidence: 8000,
					like: null,
				},
			});
			await tick();
			expect(screen.getByText('Edit perspective')).toBeInTheDocument();
		});
	});

	describe('content display', () => {
		it('displays content name in dialog', async () => {
			renderPopover({ contentName: 'My Cool Video' });
			await tick();
			expect(screen.getByText('My Cool Video')).toBeInTheDocument();
		});

		it('displays different content names correctly', async () => {
			renderPopover({ contentName: 'Another Content' });
			await tick();
			expect(screen.getByText('Another Content')).toBeInTheDocument();
		});

		it('handles long content names', async () => {
			renderPopover({ contentName: 'A very long content name that might overflow' });
			await tick();
			const nameElement = screen.getByText('A very long content name that might overflow');
			expect(nameElement).toBeInTheDocument();
		});
	});

	describe('rating inputs', () => {
		it('renders four rating input labels', async () => {
			renderPopover();
			await tick();
			expect(screen.getByText('Quality')).toBeInTheDocument();
			expect(screen.getByText('Agreement')).toBeInTheDocument();
			expect(screen.getByText('Importance')).toBeInTheDocument();
			expect(screen.getByText('Confidence')).toBeInTheDocument();
		});

		it('renders all four rating inputs in a 2x2 grid', async () => {
			renderPopover();
			await tick();
			const labels = ['Quality', 'Agreement', 'Importance', 'Confidence'];
			for (const label of labels) {
				expect(screen.getByText(label)).toBeInTheDocument();
			}
		});

		it('populates rating values in edit mode', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: 7500,
					agreement: 5000,
					importance: 6000,
					confidence: 8000,
					like: null,
				},
			});
			await tick();
			// Values should be displayed (7.500, 5.000, 6.000, 8.000)
			expect(screen.getByDisplayValue('7.500')).toBeInTheDocument();
			expect(screen.getByDisplayValue('5.000')).toBeInTheDocument();
			expect(screen.getByDisplayValue('6.000')).toBeInTheDocument();
			expect(screen.getByDisplayValue('8.000')).toBeInTheDocument();
		});
	});

	describe('like buttons (thumbs up/down)', () => {
		it('renders thumbs up button', async () => {
			renderPopover();
			await tick();
			expect(screen.getByLabelText('Thumbs up')).toBeInTheDocument();
		});

		it('renders thumbs down button', async () => {
			renderPopover();
			await tick();
			expect(screen.getByLabelText('Thumbs down')).toBeInTheDocument();
		});

		it('renders overall section label', async () => {
			renderPopover();
			await tick();
			expect(screen.getByText('Overall')).toBeInTheDocument();
		});

		it('thumbs up button has aria-pressed attribute', async () => {
			renderPopover();
			await tick();
			const thumbsUp = screen.getByLabelText('Thumbs up');
			expect(thumbsUp.hasAttribute('aria-pressed')).toBe(true);
		});

		it('thumbs down button has aria-pressed attribute', async () => {
			renderPopover();
			await tick();
			const thumbsDown = screen.getByLabelText('Thumbs down');
			expect(thumbsDown.hasAttribute('aria-pressed')).toBe(true);
		});
	});

	// TODO: Re-enable Add More / Claim creation tests in a future phase
	// describe('add more button', () => { ... });
	// describe('claim textarea', () => { ... });

	describe('action buttons', () => {
		it('renders Cancel button', async () => {
			renderPopover();
			await tick();
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});

		it('renders "Save perspective" button when creating', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			const submitBtn = screen.getByRole('button', { name: 'Save perspective' });
			expect(submitBtn).toBeInTheDocument();
		});

		it('renders "Save perspective" button when editing', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
				},
			});
			await tick();
			const submitBtn = screen.getByRole('button', { name: 'Save perspective' });
			expect(submitBtn).toBeInTheDocument();
		});
	});

	describe('dialog interaction', () => {
		it('calls onClose when Cancel button is clicked', async () => {
			renderPopover();
			await tick();
			const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
			await fireEvent.click(cancelBtn);
			expect(mocks.mockOnClose).toHaveBeenCalled();
		});

		it('has About perspectives info button', async () => {
			renderPopover();
			await tick();
			expect(screen.getByLabelText('About perspectives')).toBeInTheDocument();
		});
	});

	describe('title and headers', () => {
		it('displays dialog title', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			expect(screen.getByText('Add perspective')).toBeInTheDocument();
		});

		it('dialog has header with content name', async () => {
			renderPopover({ contentName: 'Test Video' });
			await tick();
			expect(screen.getByText('Test Video')).toBeInTheDocument();
		});
	});

	describe('modes and state', () => {
		it('is in create mode when existingPerspective is null', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			expect(screen.getByText('Add perspective')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Save perspective' })).toBeInTheDocument();
		});

		it('is in edit mode when existingPerspective is provided', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: 'THUMBS_UP',
				},
			});
			await tick();
			expect(screen.getByText('Edit perspective')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Save perspective' })).toBeInTheDocument();
		});

		it('populates like value from existingPerspective', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: null,
					agreement: null,
					importance: null,
					confidence: null,
					like: 'THUMBS_UP',
				},
			});
			await tick();
			const thumbsUp = screen.getByLabelText('Thumbs up');
			expect(thumbsUp.getAttribute('aria-pressed')).toBe('true');
		});
	});

	describe('thumbs toggle behavior', () => {
		it('clicking thumbs up toggles aria-pressed to true', async () => {
			renderPopover();
			await tick();
			const thumbsUp = screen.getByLabelText('Thumbs up');
			await fireEvent.click(thumbsUp);
			expect(thumbsUp.getAttribute('aria-pressed')).toBe('true');
		});

		it('clicking thumbs up twice toggles back to false', async () => {
			renderPopover();
			await tick();
			const thumbsUp = screen.getByLabelText('Thumbs up');
			await fireEvent.click(thumbsUp);
			await fireEvent.click(thumbsUp);
			expect(thumbsUp.getAttribute('aria-pressed')).toBe('false');
		});

		it('clicking thumbs down toggles aria-pressed to true', async () => {
			renderPopover();
			await tick();
			const thumbsDown = screen.getByLabelText('Thumbs down');
			await fireEvent.click(thumbsDown);
			expect(thumbsDown.getAttribute('aria-pressed')).toBe('true');
		});

		it('clicking thumbs down twice toggles back to false', async () => {
			renderPopover();
			await tick();
			const thumbsDown = screen.getByLabelText('Thumbs down');
			await fireEvent.click(thumbsDown);
			await fireEvent.click(thumbsDown);
			expect(thumbsDown.getAttribute('aria-pressed')).toBe('false');
		});

		it('clicking thumbs up then thumbs down switches selection', async () => {
			renderPopover();
			await tick();
			const thumbsUp = screen.getByLabelText('Thumbs up');
			const thumbsDown = screen.getByLabelText('Thumbs down');
			await fireEvent.click(thumbsUp);
			expect(thumbsUp.getAttribute('aria-pressed')).toBe('true');
			await fireEvent.click(thumbsDown);
			expect(thumbsDown.getAttribute('aria-pressed')).toBe('true');
			expect(thumbsUp.getAttribute('aria-pressed')).toBe('false');
		});

		it('populates THUMBS_DOWN from existingPerspective', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: null,
					agreement: null,
					importance: null,
					confidence: null,
					like: 'THUMBS_DOWN',
				},
			});
			await tick();
			const thumbsDown = screen.getByLabelText('Thumbs down');
			expect(thumbsDown.getAttribute('aria-pressed')).toBe('true');
		});

		it('neither thumb pressed when like is null', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: null,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
				},
			});
			await tick();
			expect(screen.getByLabelText('Thumbs up').getAttribute('aria-pressed')).toBe('false');
			expect(screen.getByLabelText('Thumbs down').getAttribute('aria-pressed')).toBe('false');
		});

		it('neither thumb pressed when like is unknown string', async () => {
			renderPopover({
				existingPerspective: {
					id: '1',
					quality: null,
					agreement: null,
					importance: null,
					confidence: null,
					like: 'UNKNOWN_VALUE',
				},
			});
			await tick();
			expect(screen.getByLabelText('Thumbs up').getAttribute('aria-pressed')).toBe('false');
			expect(screen.getByLabelText('Thumbs down').getAttribute('aria-pressed')).toBe('false');
		});
	});

	describe('form submission', () => {
		it('calls createMutation.mutate when submitting in create mode with a rating', async () => {
			renderPopover();
			await tick();
			// Click thumbs up to set at least one field
			await fireEvent.click(screen.getByLabelText('Thumbs up'));
			// Submit
			const submitBtn = screen.getByRole('button', { name: 'Save perspective' });
			await fireEvent.click(submitBtn);
			expect(mocks.mockCreateMutate).toHaveBeenCalled();
		});

		it('calls updateMutation.mutate when submitting in edit mode', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
				},
			});
			await tick();
			const submitBtn = screen.getByRole('button', { name: 'Save perspective' });
			await fireEvent.click(submitBtn);
			expect(mocks.mockUpdateMutate).toHaveBeenCalled();
		});
	});

	// Gap #2 in the UI gap audit: edit mode used to send `x ?? undefined` for
	// every field, so a value the user cleared was dropped from the request
	// entirely and the server read that as "leave unchanged" -- the old value
	// came back on reopen. Edit mode now sends null for a cleared field.
	describe('clearing fields in edit mode', () => {
		it('removing the Quality field sends quality: null, not undefined or the old value', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500,
					agreement: 5000,
					importance: null,
					confidence: null,
					like: null,
				},
			});
			await tick();

			await fireEvent.click(screen.getByLabelText('Remove Quality'));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			const payload = mocks.mockUpdateMutate.mock.calls.at(-1)![0];
			expect(payload.quality).toBeNull();
			// The field the user didn't touch is still sent as its real value, not
			// dropped -- edit mode sends the whole form state every time.
			expect(payload.agreement).toBe(5000);
		});

		it('clearing the thumb (toggling it off) sends like: null, keeping the untouched rating', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500, // kept, so the form still has a non-empty field to submit
					agreement: null,
					importance: null,
					confidence: null,
					like: 'THUMBS_UP',
				},
			});
			await tick();

			await fireEvent.click(screen.getByLabelText('Thumbs up')); // was pressed; this toggles it off
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			const payload = mocks.mockUpdateMutate.mock.calls.at(-1)![0];
			expect(payload.like).toBeNull();
			expect(payload.quality).toBe(7500);
		});

		it('emptying the review sends review: null, not undefined', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
					review: 'This used to say something.',
				},
			});
			await tick();

			await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			const payload = mocks.mockUpdateMutate.mock.calls.at(-1)![0];
			expect(payload.review).toBeNull();
		});

		it('removing the last custom field sends customFields: null, not undefined', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
					customFields: { clarity: 8000 },
				},
			});
			await tick();

			await fireEvent.click(screen.getByLabelText('Remove Clarity'));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			const payload = mocks.mockUpdateMutate.mock.calls.at(-1)![0];
			expect(payload.customFields).toBeNull();
		});

		it('create mode still omits empty fields (sends undefined, not null) — only edit mode clears', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			await fireEvent.click(screen.getByLabelText('Thumbs up'));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			const payload = mocks.mockCreateMutate.mock.calls.at(-1)![0];
			expect(payload.review).toBeUndefined();
			expect(payload.customFields).toBeUndefined();
			expect('review' in payload ? payload.review === undefined : true).toBe(true);
		});
	});

	describe('custom fields', () => {
		it('shows the field title-cased but submits customFields with a fully lowercased key', async () => {
			renderPopover({ existingPerspective: null });
			await tick();

			// Type it with a capital — the viewer should title-case, GraphQL should lowercase.
			const search = screen.getByPlaceholderText('Add a field — e.g. clarity');
			await fireEvent.input(search, { target: { value: 'Humor' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Create "Humor"' }));
			await tick();

			// Viewer: title-cased label.
			expect(screen.getByText('Humor')).toBeInTheDocument();

			// Adjust it — the write must flow back to the popover, not stay in RatingInput.
			const bump = screen.getByRole('button', { name: 'Increase Humor' });
			await fireEvent.mouseDown(bump);
			await fireEvent.mouseUp(bump);

			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			expect(mocks.mockCreateMutate).toHaveBeenCalled();
			const payload = mocks.mockCreateMutate.mock.calls.at(-1)![0];
			expect(payload.customFields).toBeDefined();
			expect(typeof payload.customFields.humor).toBe('number');
			expect(payload.customFields.humor).toBeGreaterThan(0);
			// Lowercase key only — no "Humor", no "custom:humor".
			expect(Object.keys(payload.customFields)).toEqual(['humor']);
		});

		it('preserves every custom field added before submit', async () => {
			renderPopover({ existingPerspective: null });
			await tick();

			const search = screen.getByPlaceholderText('Add a field — e.g. clarity');

			// Add three custom fields, one after another, WITHOUT submitting.
			for (const name of ['humor', 'wit', 'depthx']) {
				await fireEvent.input(search, { target: { value: name } });
				await fireEvent.click(screen.getByRole('button', { name: `Create "${name}"` }));
				await tick();
			}

			// All three controls are present.
			for (const label of ['Humor', 'Wit', 'Depthx']) {
				expect(screen.getByText(label)).toBeInTheDocument();
			}

			// Give each a distinct value.
			for (const [label, taps] of [
				['Humor', 1],
				['Wit', 2],
				['Depthx', 3],
			] as const) {
				const bump = screen.getByRole('button', { name: `Increase ${label}` });
				for (let i = 0; i < taps; i++) {
					await fireEvent.mouseDown(bump);
					await fireEvent.mouseUp(bump);
				}
			}

			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			expect(mocks.mockCreateMutate).toHaveBeenCalled();
			const payload = mocks.mockCreateMutate.mock.calls.at(-1)![0];
			expect(Object.keys(payload.customFields ?? {}).sort()).toEqual(['depthx', 'humor', 'wit']);
			// distinct values, in tap order
			expect(payload.customFields.humor).toBeLessThan(payload.customFields.wit);
			expect(payload.customFields.wit).toBeLessThan(payload.customFields.depthx);
		});

		it('restores a custom field from an existing perspective in edit mode', async () => {
			renderPopover({
				existingPerspective: {
					id: '3',
					quality: null,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
					customFields: { humor: 8500 },
				},
			});
			await tick();
			expect(screen.getByText('Humor')).toBeInTheDocument();
			expect(screen.getByDisplayValue('8.500')).toBeInTheDocument();
		});
	});

	describe('accessibility', () => {
		it('dialog is accessible with proper roles', async () => {
			renderPopover();
			await tick();
			const buttons = screen.getAllByRole('button');
			expect(buttons.length).toBeGreaterThan(0);
		});

		it('rating inputs have proper aria-labels', async () => {
			renderPopover();
			await tick();
			expect(screen.getByLabelText(/Quality rating/)).toBeInTheDocument();
			expect(screen.getByLabelText(/Agreement rating/)).toBeInTheDocument();
		});

		it('all action buttons are present and accessible', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Save perspective' })).toBeInTheDocument();
		});
	});

	describe('privacy toggle', () => {
		it('submits privacy PUBLIC by default', async () => {
			renderPopover();
			await tick();
			await fireEvent.click(screen.getByLabelText('Thumbs up'));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));
			expect(mocks.mockCreateMutate).toHaveBeenCalled();
			const payload = mocks.mockCreateMutate.mock.calls.at(-1)![0];
			expect(payload.privacy).toBe('PUBLIC');
		});

		it('submits privacy PRIVATE when the toggle is on', async () => {
			renderPopover();
			await tick();
			await fireEvent.click(screen.getByLabelText('Thumbs up'));
			await fireEvent.click(screen.getByRole('switch', { name: /private/i }));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));
			expect(mocks.mockCreateMutate).toHaveBeenCalled();
			const payload = mocks.mockCreateMutate.mock.calls.at(-1)![0];
			expect(payload.privacy).toBe('PRIVATE');
		});

		it('initialises the toggle from an existing private perspective in edit mode', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					privacy: 'PRIVATE',
					quality: 7500,
					agreement: 5000,
					importance: 6000,
					confidence: 8000,
					like: null,
				},
			});
			await tick();
			expect(screen.getByRole('switch', { name: /private/i })).toBeChecked();
		});
	});

	describe('draft persistence', () => {
		it('typing triggers a debounced saveDraft call', async () => {
			vi.useFakeTimers();
			try {
				renderPopover();
				await tick();

				const editor = screen.getByLabelText('Comment');
				await fireEvent.input(editor, { target: { value: '<p>hello</p>' } });

				expect(mocks.mockSaveDraft).not.toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(1000);
				expect(mocks.mockSaveDraft).toHaveBeenCalledWith('draft:1:42', '<p>hello</p>', '');
			} finally {
				vi.useRealTimers();
			}
		});

		it('reopening with an existing draft shows the restore banner and populates the editor', async () => {
			mocks.mockLoadDraft.mockReturnValue('<p>draft content</p>');
			renderPopover();
			await tick();

			expect(screen.getByText('Restored unsaved draft')).toBeInTheDocument();
			expect(screen.getByLabelText('Comment')).toHaveValue('<p>draft content</p>');
		});

		it('does not show the restore banner when no draft exists', async () => {
			mocks.mockLoadDraft.mockReturnValue(null);
			renderPopover();
			await tick();

			expect(screen.queryByText('Restored unsaved draft')).not.toBeInTheDocument();
		});

		it('successful create clears the draft', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			await fireEvent.click(screen.getByLabelText('Thumbs up'));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			expect(mocks.mockCreateMutate).toHaveBeenCalled();
			const options = mocks.mockCreateMutate.mock.calls.at(-1)![1];
			options.onSuccess();
			expect(mocks.mockClearDraft).toHaveBeenCalledWith('draft:1:42');
		});

		it('successful update clears the draft', async () => {
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
				},
			});
			await tick();
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			expect(mocks.mockUpdateMutate).toHaveBeenCalled();
			const options = mocks.mockUpdateMutate.mock.calls.at(-1)![1];
			options.onSuccess();
			expect(mocks.mockClearDraft).toHaveBeenCalledWith('draft:1:42');
		});
	});

	describe('image-only reviews', () => {
		const imageOnly = '<p><img src="https://example.com/a.png"></p>';

		it('saves an image-only review alongside a rating instead of dropping it', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: imageOnly } });
			await fireEvent.click(screen.getByLabelText('Thumbs up'));
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			expect(mocks.mockCreateMutate).toHaveBeenCalled();
			const payload = mocks.mockCreateMutate.mock.calls.at(-1)![0];
			expect(payload.review).toContain('<img');
		});

		it('counts an image-only review as content, so it can be saved on its own', async () => {
			renderPopover({ existingPerspective: null });
			await tick();
			await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: imageOnly } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));

			expect(mocks.mockCreateMutate).toHaveBeenCalled();
		});
	});

	describe('draft lifecycle', () => {
		it('a pending debounced draft save cannot resurrect the draft after a successful save', async () => {
			vi.useFakeTimers();
			try {
				renderPopover({ existingPerspective: null });
				await tick();
				await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>typed</p>' } });
				await fireEvent.click(screen.getByLabelText('Thumbs up'));
				await fireEvent.click(screen.getByRole('button', { name: 'Save perspective' }));
				mocks.mockCreateMutate.mock.calls.at(-1)![1].onSuccess();
				expect(mocks.mockClearDraft).toHaveBeenCalledWith('draft:1:42');

				await vi.advanceTimersByTimeAsync(1500);
				expect(mocks.mockSaveDraft).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		it('flushes a pending draft save immediately when the popover unmounts', async () => {
			vi.useFakeTimers();
			try {
				const { unmount } = renderPopover({ existingPerspective: null });
				await tick();
				await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>almost lost</p>' } });
				expect(mocks.mockSaveDraft).not.toHaveBeenCalled();

				unmount();
				expect(mocks.mockSaveDraft).toHaveBeenCalledWith('draft:1:42', '<p>almost lost</p>', '');
				await vi.advanceTimersByTimeAsync(1500);
				expect(mocks.mockSaveDraft).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it('keys drafts to the server review they were started from', async () => {
			vi.useFakeTimers();
			try {
				renderPopover({
					existingPerspective: {
						id: '5',
						quality: 7500,
						agreement: null,
						importance: null,
						confidence: null,
						like: null,
						review: '<p>server copy</p>',
					},
				});
				await tick();
				expect(mocks.mockLoadDraft).toHaveBeenCalledWith('draft:1:42', '<p>server copy</p>');

				await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>edited</p>' } });
				await vi.advanceTimersByTimeAsync(1000);
				expect(mocks.mockSaveDraft).toHaveBeenCalledWith('draft:1:42', '<p>edited</p>', '<p>server copy</p>');
			} finally {
				vi.useRealTimers();
			}
		});

		it('"Discard draft" reverts to the saved review and deletes the stored draft', async () => {
			mocks.mockLoadDraft.mockReturnValue('<p>stale draft</p>');
			renderPopover({
				existingPerspective: {
					id: '5',
					quality: 7500,
					agreement: null,
					importance: null,
					confidence: null,
					like: null,
					review: '<p>saved copy</p>',
				},
			});
			await tick();
			expect(screen.getByLabelText('Comment')).toHaveValue('<p>stale draft</p>');

			await fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));

			expect(mocks.mockClearDraft).toHaveBeenCalledWith('draft:1:42');
			expect(screen.getByLabelText('Comment')).toHaveValue('<p>saved copy</p>');
			expect(screen.queryByText('Restored unsaved draft')).not.toBeInTheDocument();
		});
	});
	describe('expanding the comment editor in place', () => {
		it('starts collapsed', async () => {
			renderPopover();
			await tick();

			expect(screen.getByLabelText('Comment')).toHaveAttribute('data-expanded', 'false');
			expect(screen.getByRole('button', { name: 'Expand comment' })).toBeInTheDocument();
		});

		it('expand grows the editor and collapse returns it, in the same dialog', async () => {
			renderPopover();
			await tick();

			await fireEvent.click(screen.getByRole('button', { name: 'Expand comment' }));
			expect(screen.getByLabelText('Comment')).toHaveAttribute('data-expanded', 'true');
			expect(screen.getByRole('button', { name: 'Save perspective' })).toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: 'Collapse comment' }));
			expect(screen.getByLabelText('Comment')).toHaveAttribute('data-expanded', 'false');
			expect(mocks.mockOnClose).not.toHaveBeenCalled();
		});

		it('keeps typed text across expand and collapse (single editor, no sync step)', async () => {
			renderPopover();
			await tick();

			await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>draft</p>' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Expand comment' }));
			expect(screen.getByLabelText('Comment')).toHaveValue('<p>draft</p>');
			await fireEvent.click(screen.getByRole('button', { name: 'Collapse comment' }));
			expect(screen.getByLabelText('Comment')).toHaveValue('<p>draft</p>');
		});
	});
});
