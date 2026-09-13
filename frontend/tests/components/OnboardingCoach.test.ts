import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const mocks = vi.hoisted(() => ({
	mockMarkMutate: vi.fn(),
	mockGraphql: vi.fn(),
}));

vi.mock('$lib/queries/users/useMarkOnboardingSeen', () => ({
	useMarkOnboardingSeen: () => ({
		mutate: mocks.mockMarkMutate,
		isPending: false,
	}),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...args: unknown[]) => mocks.mockGraphql(...args),
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((optsFn: () => any) => {
		const opts = typeof optsFn === 'function' ? optsFn() : optsFn;
		void opts;
		return {
			data: {
				content: { items: [], totalCount: 0 },
				perspectives: { items: [] },
			},
			isSuccess: true,
			refetch: vi.fn(),
		};
	}),
	createMutation: vi.fn(() => ({
		mutate: vi.fn(),
		isPending: false,
		isSuccess: false,
	})),
	useQueryClient: vi.fn(() => ({
		setQueriesData: vi.fn(),
		invalidateQueries: vi.fn(),
	})),
}));

vi.mock('$lib/onboarding/config', () => ({
	CURRENT_INTRO_VERSION: 1,
	ONBOARDING_VIDEOS: {
		guestProduct: undefined,
		howAddVideo: undefined,
		howPerspective: undefined,
	},
}));

vi.mock('$lib/components/AddVideoDialog.svelte', async () => {
	const mod = await import('../helpers/Passthrough.svelte');
	return { default: mod.default };
});

vi.mock('$lib/components/PerspectivePopover.svelte', async () => {
	const mod = await import('../helpers/Passthrough.svelte');
	return { default: mod.default };
});

import OnboardingCoach from '$lib/components/onboarding/OnboardingCoach.svelte';
import { CURRENT_INTRO_VERSION } from '$lib/onboarding/config';

describe('OnboardingCoach', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders step 1 with add video and skip controls', async () => {
		render(OnboardingCoach, { props: { userId: 7, open: true } });
		await tick();
		expect(screen.getByText(/add a video/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /add video/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /skip step/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /skip all/i })).toBeInTheDocument();
	});

	it('skip step advances to perspective step without mark-seen', async () => {
		render(OnboardingCoach, { props: { userId: 7, open: true } });
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /skip step/i }));
		await tick();
		expect(screen.getByText(/leave a perspective/i)).toBeInTheDocument();
		expect(mocks.mockMarkMutate).not.toHaveBeenCalled();
	});

	it('skip all marks onboarding seen', async () => {
		render(OnboardingCoach, { props: { userId: 7, open: true } });
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /skip all/i }));
		await tick();
		expect(mocks.mockMarkMutate).toHaveBeenCalledWith(CURRENT_INTRO_VERSION);
	});

	it('dismiss (X) marks onboarding seen', async () => {
		render(OnboardingCoach, { props: { userId: 7, open: true } });
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /dismiss getting started/i }));
		await tick();
		expect(mocks.mockMarkMutate).toHaveBeenCalledWith(CURRENT_INTRO_VERSION);
	});

	it('empty library on step 2 offers back to add video', async () => {
		render(OnboardingCoach, { props: { userId: 7, open: true } });
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /skip step/i }));
		await tick();
		expect(screen.getByText(/library is empty/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /back to add video/i })).toBeInTheDocument();
	});
});
