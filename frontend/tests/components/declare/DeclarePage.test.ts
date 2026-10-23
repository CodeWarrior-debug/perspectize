import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { ClaimRow } from '$lib/queries/content/claims';

const mocks = vi.hoisted(() => ({
	auth: { isLoaded: true, userId: null as string | null },
	me: null as { id: string; username: string } | null,
	claims: { isPending: false, isError: false, data: undefined as ClaimRow[] | undefined },
}));

vi.mock('$lib/auth/useAuthState', () => ({
	useAuthState: () => ({
		get isLoaded() {
			return mocks.auth.isLoaded;
		},
		get userId() {
			return mocks.auth.userId;
		},
	}),
}));

vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return mocks.me;
		},
	}),
}));

vi.mock('$lib/queries/content/useMyClaims', () => ({
	useMyClaims: vi.fn(() => mocks.claims),
}));

vi.mock('$lib/queries/content/useCreateClaim', () => ({
	useCreateClaim: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('$lib/queries/content/useUpdateClaim', () => ({
	useUpdateClaim: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

// SignInTrigger wraps its child in Clerk's SignInButton; render the child through.
vi.mock('svelte-clerk', async () => {
	const mod = await import('../../helpers/Passthrough.svelte');
	return { SignInButton: mod.default };
});

import DeclarePage from '../../../src/routes/declare/+page.svelte';

const ME = { id: '7', username: 'ada' };

function claim(overrides: Partial<ClaimRow> = {}): ClaimRow {
	return {
		id: '1',
		name: 'Water is wet',
		addedByUserID: '7',
		privacy: 'PRIVATE',
		customFields: { effectiveDate: '2026-01-05', evaluateBy: '2027-01-05' },
		createdAt: '2026-01-05T12:00:00Z',
		updatedAt: '2026-01-05T12:00:00Z',
		...overrides,
	};
}

function signedIn(data: ClaimRow[] | undefined, extra: Partial<typeof mocks.claims> = {}) {
	mocks.auth.userId = 'user_clerk_1';
	mocks.me = ME;
	mocks.claims = { isPending: false, isError: false, data, ...extra };
}

describe('DeclarePage', () => {
	beforeEach(() => {
		mocks.auth = { isLoaded: true, userId: null };
		mocks.me = null;
		mocks.claims = { isPending: false, isError: false, data: undefined };
	});

	it('signed out: shows the sign-in prompt and never the empty list', () => {
		render(DeclarePage);
		expect(screen.getByRole('heading', { name: 'Declare' })).toBeInTheDocument();
		expect(screen.getByText('Claims are private. Sign in to see yours.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
		expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();
	});

	it('auth still loading: shows the loading text', () => {
		mocks.auth = { isLoaded: false, userId: null };
		render(DeclarePage);
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();
	});

	it('signed in while claims load: shows the loading text, not the empty state', () => {
		signedIn(undefined, { isPending: true });
		render(DeclarePage);
		expect(screen.getByText('Loading your claims…')).toBeInTheDocument();
		expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();
	});

	it('signed in with a failed list: shows the error text', () => {
		signedIn(undefined, { isPending: false, isError: true });
		render(DeclarePage);
		expect(screen.getByText("Couldn't load your claims.")).toBeInTheDocument();
	});

	it('signed in with no claims: shows the empty state', () => {
		signedIn([]);
		render(DeclarePage);
		expect(screen.getByText('No claims yet.')).toBeInTheDocument();
	});

	it('signed in with a claim that has dates: shows the text, both dates and the private label', () => {
		signedIn([claim()]);
		render(DeclarePage);
		expect(screen.getByText('Water is wet')).toBeInTheDocument();
		expect(screen.getByText('Effective 2026-01-05')).toBeInTheDocument();
		expect(screen.getByText('Evaluate by 2027-01-05')).toBeInTheDocument();
		expect(screen.getByText('Private')).toBeInTheDocument();
	});

	it("shows only the signed-in user's own claims", () => {
		signedIn([claim(), claim({ id: '2', name: 'Someone else claim', addedByUserID: '8' })]);
		render(DeclarePage);
		expect(screen.getByText('Water is wet')).toBeInTheDocument();
		expect(screen.queryByText('Someone else claim')).not.toBeInTheDocument();
	});

	it('a legacy claim without dates: shows the text and no date labels', () => {
		signedIn([claim({ name: 'Legacy claim text', customFields: null })]);
		render(DeclarePage);
		expect(screen.getByText('Legacy claim text')).toBeInTheDocument();
		// Digit-anchored: the create form's "Effective date" / "Evaluate by" labels must not match.
		expect(screen.queryByText(/^Effective \d/)).not.toBeInTheDocument();
		expect(screen.queryByText(/^Evaluate by \d/)).not.toBeInTheDocument();
	});

	it('Edit swaps the row for the edit form pre-filled with the claim', async () => {
		signedIn([claim()]);
		render(DeclarePage);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
		const textareas = screen.getAllByLabelText('Claim') as HTMLTextAreaElement[];
		expect(textareas.map((t) => t.value)).toContain('Water is wet');
	});
});
