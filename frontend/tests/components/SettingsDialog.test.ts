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

	it('has a Fonts section in the rail with a picker for each slot', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Fonts' }));
		expect(screen.queryByRole('button', { name: 'Restart onboarding' })).toBeNull();
		// The font list is lazy-loaded when the section opens.
		expect(await screen.findByRole('combobox', { name: 'Headings' })).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Table cells' })).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Long-form reading' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Editorial' })).toBeTruthy();
	});

	it('a pairing applies all three slots at once', async () => {
		localStorage.removeItem('perspectize-fonts');
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Fonts' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Editorial' }));
		const saved = JSON.parse(localStorage.getItem('perspectize-fonts')!);
		expect([saved.heading.family, saved.cell.family, saved.longform.family]).toEqual([
			'Fraunces',
			'Source Serif 4',
			'Literata',
		]);
		expect(document.documentElement.hasAttribute('data-font-heading')).toBe(true);
		expect(screen.getByRole('button', { name: 'Editorial' }).getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(screen.getByRole('button', { name: 'Default' }));
		expect(document.documentElement.hasAttribute('data-font-heading')).toBe(false);
	});

	it('Peek hides Settings behind a floating button that brings it back on the Fonts section', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Fonts' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Peek' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
		expect(screen.queryByRole('button', { name: 'Back to Settings' })).toBeNull();
		expect(await screen.findByRole('combobox', { name: 'Headings' })).toBeTruthy();
	});

	it('switches to the theme section and shows no restart button there', async () => {
		render(SettingsDialog, { props: { open: true, store: fakeStore } });
		await fireEvent.click(screen.getByRole('button', { name: 'Customize Theme' }));
		expect(screen.queryByRole('button', { name: 'Restart onboarding' })).toBeNull();
	}, 15000); // even though it's not actually stuck. See frontend/CLAUDE.md. // suite's CPU contention that render can miss the default 5s budget // ThemeCustomizePanel mounts all 28 presets on click; under the full
});
