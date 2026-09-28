import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// Demo mode is a build-time flag; force it on for this file. svelte-clerk must
// never be rendered in demo mode, so its mock throws if it is.
vi.mock('$lib/auth/demo.svelte', async (importOriginal) => {
	const mod = await importOriginal<typeof import('$lib/auth/demo.svelte')>();
	return { ...mod, DEMO_MODE: true, demoSession: new mod.DemoSession() };
});
vi.mock('svelte-clerk', () => {
	const fail = () => {
		throw new Error('svelte-clerk rendered in demo mode');
	};
	return { Show: fail, SignInButton: fail, UserButton: fail, useClerkContext: fail };
});

import { demoSession } from '$lib/auth';
import GuestLanding from '$lib/components/onboarding/GuestLanding.svelte';
import UserMenu from '$lib/components/auth/UserMenu.svelte';
import DemoPersonaDialog from '$lib/components/auth/DemoPersonaDialog.svelte';
import DemoBanner from '$lib/components/auth/DemoBanner.svelte';

describe('demo-mode auth components', () => {
	beforeEach(() => {
		localStorage.clear();
		demoSession.signOut();
	});

	it('Sign in on the guest landing opens the persona picker instead of Clerk', async () => {
		render(GuestLanding);
		expect(demoSession.pickerOpen).toBe(false);
		await fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
		expect(demoSession.pickerOpen).toBe(true);
	});

	it('picking a persona signs in and closes the picker', async () => {
		demoSession.pickerOpen = true;
		render(DemoPersonaDialog);
		await fireEvent.click(await screen.findByTestId('demo-persona-ben'));
		expect(demoSession.persona).toBe('ben');
		expect(demoSession.pickerOpen).toBe(false);
	});

	it('UserMenu shows the persona initial and reopens the picker', async () => {
		demoSession.signInAs('alice');
		render(UserMenu);
		const chip = screen.getByTestId('demo-user-menu');
		expect(chip).toHaveTextContent('A');
		await fireEvent.click(chip);
		expect(demoSession.pickerOpen).toBe(true);
	});

	it('DemoBanner names the signed-in persona', () => {
		demoSession.signInAs('carmen');
		render(DemoBanner);
		expect(screen.getByTestId('demo-banner')).toHaveTextContent(/signed in as Carmen/);
	});
});
