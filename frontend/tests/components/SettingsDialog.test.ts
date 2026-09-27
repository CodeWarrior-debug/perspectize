import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsDialog from '$lib/components/SettingsDialog.svelte';
import { createThemeStore } from '$lib/theme/store.svelte';

// Gap #15 in the UI gap audit: SET_ONBOARDING_DISPLAY_NEXT_SESSION was defined
// and never called from anywhere in the app, so a user who dismissed
// onboarding had no way to turn it back on. These tests cover the toggle this
// component now wires up.

const mocks = vi.hoisted(() => ({
	mockQueryData: undefined as any,
	mockMutate: vi.fn(),
	mockMutationState: { mutate: null as any, isPending: false },
	capturedMutationOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({
		get data() {
			return mocks.mockQueryData;
		},
		isSuccess: mocks.mockQueryData !== undefined,
		isError: false,
	})),
	createMutation: vi.fn((optionsFn: () => any) => {
		mocks.capturedMutationOptions = optionsFn();
		mocks.mockMutationState.mutate = mocks.mockMutate;
		return mocks.mockMutationState;
	}),
	useQueryClient: vi.fn(() => ({
		setQueriesData: vi.fn(),
	})),
}));

vi.mock('svelte-clerk', () => ({
	useClerkContext: () => ({ isLoaded: true, auth: { userId: 'user_1' } }),
}));

vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

const fakeStore = createThemeStore();

function reset() {
	vi.clearAllMocks();
	mocks.capturedMutationOptions = undefined;
	mocks.mockMutationState.isPending = false;
	mocks.mockQueryData = {
		me: {
			id: '1',
			username: 'tester',
			role: 'DEFAULT',
			onboarding: { version: 1, displayNextSession: false, completedAt: '2026-01-01T00:00:00Z' },
		},
	};
}

describe('SettingsDialog', () => {
	beforeEach(reset);

	it('renders the General section by default, with the onboarding toggle', () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByText('Show onboarding next session')).toBeTruthy();
		expect(screen.getByRole('switch')).toBeTruthy();
	});

	it('reflects the signed-in user’s current onboarding.displayNextSession as the switch state', () => {
		mocks.mockQueryData.me.onboarding.displayNextSession = true;
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
	});

	it('defaults to unchecked when displayNextSession is false', () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
	});

	it('flipping the switch calls the mutation with the new value', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		const toggle = screen.getByRole('switch');
		await fireEvent.click(toggle);
		expect(mocks.mockMutate).toHaveBeenCalledWith(true);
	});

	it('disables the switch while there is no signed-in user', () => {
		mocks.mockQueryData = undefined;
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByRole('switch')).toBeDisabled();
	});

	it('disables the switch while the mutation is pending', () => {
		mocks.mockMutationState.isPending = true;
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByRole('switch')).toBeDisabled();
	});

	it('switches to the theme section and shows no onboarding toggle there', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize Theme' }));
		expect(screen.queryByText('Show onboarding next session')).toBeNull();
	});

	describe('Feedback section', () => {
		async function openFeedback() {
			render(SettingsDialog, { props: { open: true, store: fakeStore } });
			await fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
		}

		it('links feature requests and bug reports straight to GitHub issue templates', async () => {
			await openFeedback();
			const feature = screen.getByRole('link', { name: 'Open a feature request' });
			const bug = screen.getByRole('link', { name: 'Report a bug' });
			expect(feature.getAttribute('href')).toContain('template=feature_request.md');
			expect(bug.getAttribute('href')).toContain('template=bug_report.md');
			expect(feature.getAttribute('target')).toBe('_blank');
			expect(bug.getAttribute('rel')).toContain('noopener');
		});

		it('keeps the content-type submit disabled until a name is entered', async () => {
			await openFeedback();
			const submit = screen.getByRole('button', { name: 'Continue on GitHub' });
			expect(submit).toBeDisabled();
			await fireEvent.input(screen.getByLabelText('Content type'), { target: { value: 'Podcast' } });
			expect(submit).not.toBeDisabled();
		});

		it('opens a prefilled content-type issue on submit', async () => {
			const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
			await openFeedback();
			await fireEvent.input(screen.getByLabelText('Content type'), { target: { value: 'Podcast' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Continue on GitHub' }));
			expect(openSpy).toHaveBeenCalledTimes(1);
			const url = new URL(openSpy.mock.calls[0][0] as string);
			expect(url.searchParams.get('template')).toBe('content_type_request.md');
			expect(url.searchParams.get('title')).toBe('[Content Type] Podcast');
			openSpy.mockRestore();
		});
	});
});
