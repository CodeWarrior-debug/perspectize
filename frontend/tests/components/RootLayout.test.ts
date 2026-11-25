import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Layout from '../../src/routes/+layout.svelte';

const mocks = vi.hoisted(() => ({
	page: { route: { id: '/' as string | null }, url: new URL('http://localhost/') },
	session: { signedIn: false, pickerOpen: false },
}));

vi.mock('$app/state', () => ({ page: mocks.page, updated: { current: false, check: vi.fn() } }));
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
// Demo mode has no ClerkProvider, so the auth wrappers render from this plain session.
vi.mock('#lib/auth/index.js', () => ({ DEMO_MODE: true, demoSession: mocks.session }));
vi.mock('svelte-clerk', () => ({ ClerkProvider: {}, ClerkLoaded: {}, ClerkLoading: {}, Show: {} }));
// Everything around the gate is out of scope here.
vi.mock('#lib/components/Header.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/AuthUserSync.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/auth/DemoBanner.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/auth/DemoPersonaDialog.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/messaging/InboxStreamMount.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/messaging/MessagingWidget.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/onboarding/OnboardingShell.svelte', () => ({ default: () => {} }));
vi.mock('#lib/components/onboarding/GuestLanding.svelte', async () => {
	const { createRawSnippet } = await import('svelte');
	const stub = createRawSnippet(() => ({ render: () => '<p>guest landing</p>' }));
	return { default: (anchor: unknown) => (stub as (a: unknown) => void)(anchor) };
});
vi.mock('svelte-sonner', () => ({ Toaster: () => {} }));
vi.mock('#lib/telemetry.js', () => ({ initTelemetry: vi.fn() }));
vi.mock('#lib/utils/versionWatch.js', () => ({ watchForNewVersion: () => () => {} }));
vi.mock('#lib/utils/versionHotkey.js', () => ({ attachVersionHotkey: () => () => {} }));

const children = createRawSnippet(() => ({ render: () => '<p>route page</p>' }));

function open(routeId: string, signedIn: boolean) {
	mocks.page.route.id = routeId;
	mocks.page.url = new URL(`http://localhost${routeId}`);
	mocks.session.signedIn = signedIn;
	render(Layout, { props: { children } });
}

describe('root layout signed-out gate', () => {
	beforeEach(() => vi.clearAllMocks());

	it('signed out on /add shows the page, which has its own sign-in', () => {
		open('/add', false);
		expect(screen.getByText('route page')).toBeInTheDocument();
		expect(screen.queryByText('guest landing')).not.toBeInTheDocument();
	});

	it('signed out elsewhere shows the landing page instead of the page', () => {
		open('/content-library', false);
		expect(screen.getByText('guest landing')).toBeInTheDocument();
		expect(screen.queryByText('route page')).not.toBeInTheDocument();
	});

	it.each(['/add', '/content-library'])('signed in on %s shows the page once', (routeId) => {
		open(routeId, true);
		expect(screen.getAllByText('route page')).toHaveLength(1);
		expect(screen.queryByText('guest landing')).not.toBeInTheDocument();
	});
});
