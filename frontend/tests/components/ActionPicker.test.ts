import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ActionPicker from '$lib/components/plan/ActionPicker.svelte';
import type { TodoActionItem } from '$lib/queries/userTodos';

const mocks = vi.hoisted(() => ({
	actions: [] as TodoActionItem[],
	createMutateAsync: vi.fn(),
}));

vi.mock('$lib/queries/userTodos/useTodoActions', () => ({
	useTodoActions: vi.fn(() => ({
		get data() {
			return { todoActions: mocks.actions };
		},
		isPending: false,
	})),
}));

vi.mock('$lib/queries/userTodos/useCreateTodoAction', () => ({
	useCreateTodoAction: vi.fn(() => ({
		mutateAsync: mocks.createMutateAsync,
		isPending: false,
	})),
}));

function preset(id: string, key: string, label: string, seq: number, description: string): TodoActionItem {
	return { id, key, label, description, typicalSequence: seq, isPreset: true };
}

function userAction(id: string, label: string): TodoActionItem {
	return { id, key: label.toLowerCase(), label, description: '', typicalSequence: null, isPreset: false };
}

describe('ActionPicker', () => {
	beforeEach(() => {
		mocks.createMutateAsync.mockReset();
		mocks.actions = [
			userAction('90', 'Brainstorm'),
			preset('2', 'consume', 'Consume', 2, 'Watch, read or listen for the first time'),
			preset('1', 'acquire', 'Acquire', 1, 'Buy, borrow or download it'),
			preset('3', 'process', 'Process', 3, 'Digest it: take notes, summarize, extract'),
		];
	});

	function openPicker() {
		const input = screen.getByRole('combobox');
		fireEvent.focus(input);
		return input;
	}

	it('lists presets in typical sequence, then the user actions', () => {
		render(ActionPicker, { props: { value: null, onChange: vi.fn() } });
		openPicker();
		const labels = screen.getAllByRole('option').map((o) => o.textContent?.trim());
		expect(labels).toEqual(['Acquire', 'Consume', 'Process', 'Brainstorm']);
	});

	it('shows each action description as its hover tooltip', () => {
		render(ActionPicker, { props: { value: null, onChange: vi.fn() } });
		openPicker();
		expect(screen.getByRole('option', { name: 'Consume' })).toHaveAttribute(
			'title',
			'Watch, read or listen for the first time',
		);
		expect(screen.getByRole('option', { name: 'Acquire' })).toHaveAttribute('title', 'Buy, borrow or download it');
	});

	it('filters the list by the typed text', () => {
		render(ActionPicker, { props: { value: null, onChange: vi.fn() } });
		const input = openPicker();
		fireEvent.input(input, { target: { value: 'con' } });
		expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(['Consume']);
	});

	it('selects an existing action and reports it', () => {
		const onChange = vi.fn();
		render(ActionPicker, { props: { value: null, onChange } });
		openPicker();
		fireEvent.click(screen.getByRole('option', { name: 'Process' }));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0]).toMatchObject({ id: '3', label: 'Process' });
	});

	it('offers Add for typed text that matches no action', () => {
		render(ActionPicker, { props: { value: null, onChange: vi.fn() } });
		const input = openPicker();
		fireEvent.input(input, { target: { value: 'Skim' } });
		expect(screen.getByTestId('action-add-option')).toHaveTextContent('Add "Skim"');
	});

	it('does not offer Add when the text already names an action', () => {
		render(ActionPicker, { props: { value: null, onChange: vi.fn() } });
		const input = openPicker();
		fireEvent.input(input, { target: { value: 'consume' } });
		expect(screen.queryByTestId('action-add-option')).toBeNull();
	});

	it('creates the new action and selects it', async () => {
		const created = userAction('95', 'Skim');
		mocks.createMutateAsync.mockResolvedValue(created);
		const onChange = vi.fn();
		render(ActionPicker, { props: { value: null, onChange } });
		const input = openPicker();
		fireEvent.input(input, { target: { value: '  Skim ' } });
		fireEvent.click(screen.getByTestId('action-add-option'));

		expect(mocks.createMutateAsync).toHaveBeenCalledWith({ label: 'Skim' });
		await waitFor(() => expect(onChange).toHaveBeenCalledWith(created));
	});

	it('shows an error and selects nothing when creating the action fails', async () => {
		mocks.createMutateAsync.mockRejectedValue(new Error('label is taken'));
		const onChange = vi.fn();
		render(ActionPicker, { props: { value: null, onChange } });
		const input = openPicker();
		fireEvent.input(input, { target: { value: 'Skim' } });
		fireEvent.click(screen.getByTestId('action-add-option'));

		expect(await screen.findByRole('alert')).toHaveTextContent('label is taken');
		expect(onChange).not.toHaveBeenCalled();
	});
});
