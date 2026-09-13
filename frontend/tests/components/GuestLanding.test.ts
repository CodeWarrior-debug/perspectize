import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('svelte-clerk', async () => {
	const mod = await import('../helpers/Passthrough.svelte');
	return { SignInButton: mod.default };
});

vi.mock('$lib/onboarding/config', () => ({
	ONBOARDING_VIDEOS: {
		guestProduct: undefined,
		howAddVideo: undefined,
		howPerspective: undefined,
	},
	CURRENT_INTRO_VERSION: 1,
}));

import GuestLanding from '$lib/components/onboarding/GuestLanding.svelte';

describe('GuestLanding', () => {
	it('renders value line and Sign in affordance', () => {
		render(GuestLanding);
		expect(screen.getByRole('heading', { name: /perspectize/i })).toBeInTheDocument();
		expect(screen.getByText(/collect perspectives on the media you care about/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
	});

	it('does not show watch control when guest product video URL is unset', () => {
		render(GuestLanding);
		expect(screen.queryByRole('button', { name: /watch how it works/i })).toBeNull();
	});
});
