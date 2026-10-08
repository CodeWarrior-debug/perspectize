import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsDialog from '$lib/components/SettingsDialog.svelte';
import { createThemeStore } from '$lib/theme/store.svelte';
import { setCoachForceOpen, getCoachForceOpen, getCoachReplayNonce } from '$lib/onboarding/coachGate.svelte';

// Settings → Restart onboarding replays the coach immediately (no next-session flag).

const mocks = vi.hoisted(() => ({
	mockQueryData: undefined as any,
	mockMutate: vi.fn(),
	mockMutationState: { mutate: null as any, isPending: false },
	capturedMutationOptions: undefined as any,
	contributeEnabled: true,
}));

// Getters let each test flip the Contribute flag; paths come from the real builder.
vi.mock('$lib/contribute/config', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/contribute/config')>();
	return {
		...actual,
		get CONTRIBUTE_TAB_ENABLED() {
			return mocks.contributeEnabled;
		},
		get CONTRIBUTE_PATHS() {
			return actual.buildContributePaths({ VITE_SUPPORT_URL: 'https://buy.stripe.com/test_abc' });
		},
	};
});

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
	mocks.contributeEnabled = true;
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

	it('renders the General section by default, with a Restart onboarding button', () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByText('Getting started')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Restart onboarding' })).toBeTruthy();
	});

	it('clicking Restart onboarding opens the coach immediately and closes the dialog', async () => {
		setCoachForceOpen(false);
		const before = getCoachReplayNonce();
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Restart onboarding' }));
		expect(getCoachForceOpen()).toBe(true);
		expect(getCoachReplayNonce()).toBe(before + 1);
	});

	it('disables Restart onboarding while there is no signed-in user', () => {
		mocks.mockQueryData = undefined;
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByRole('button', { name: 'Restart onboarding' })).toBeDisabled();
	});

	// ThemeCustomizePanel mounts all 28 presets on click; under the full
	// suite's CPU contention that render can miss the default 5s budget
	// even though it's not actually stuck. See frontend/CLAUDE.md.
	it('switches to the theme section and shows no restart button there', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize Theme' }));
		expect(screen.queryByRole('button', { name: 'Restart onboarding' })).toBeNull();
	}, 15000);

	it('shows the Contribute section when enabled, with the support link', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Contribute' }));
		expect(screen.getByRole('link', { name: /leave a tip/i })).toHaveAttribute(
			'href',
			'https://buy.stripe.com/test_abc',
		);
		expect(screen.queryByRole('button', { name: 'Restart onboarding' })).toBeNull();
	});

	it('hides the Contribute section when disabled', () => {
		mocks.contributeEnabled = false;
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.queryByRole('button', { name: 'Contribute' })).toBeNull();
	});

	it('marks only the active section button with aria-current="page"', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('button', { name: 'Customize Theme' })).not.toHaveAttribute('aria-current');
		await fireEvent.click(screen.getByRole('button', { name: 'Contribute' }));
		expect(screen.getByRole('button', { name: 'Contribute' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('button', { name: 'General' })).not.toHaveAttribute('aria-current');
	});
});
