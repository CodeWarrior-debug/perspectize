import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick, type Component } from 'svelte';
import BookISBNPanel from '$lib/components/discover/BookISBNPanel.svelte';
import TestWrapper from '../helpers/TestWrapper.svelte';
import { makeClient } from '../helpers/queryBudget';
import { BOOK_BY_ISBN, type BookSearchResult } from '$lib/services/openLibraryApi';

vi.mock('$lib/queries/users/useMe.svelte', () => ({ useMe: () => ({ me: null }) }));

const mocks = vi.hoisted(() => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mocks.graphqlRequest }));

// 9780434740024 has a matching check digit; 9780434740025 does not.
const VALID_ISBN_13 = '9780434740024';
const BAD_CHECK_ISBN = '9780434740025';

const eastOfEden: BookSearchResult = {
	workKey: 'OL23166W',
	title: 'East of Eden',
	authorName: ['John Steinbeck'],
	coverId: null,
	firstPublishYear: 1952,
	pageCountMedian: 611,
	subjects: [],
	ratingsAverage: 4.1,
	ratingsCount: 100,
	editionCount: 65,
	url: 'https://openlibrary.org/works/OL23166W',
};

function renderPanel(overrides: Record<string, unknown> = {}) {
	const props = { library: new Map(), onAdd: vi.fn(), ...overrides };
	const component = BookISBNPanel as unknown as Component;
	render(TestWrapper, { props: { queryClient: makeClient(), component, props } });
	return props;
}

function isbnInput() {
	return screen.getByRole('textbox', { name: /^isbn$/i }) as HTMLInputElement;
}

async function type(text: string) {
	await fireEvent.input(isbnInput(), { target: { value: text } });
	await tick();
}

function lookupCalls() {
	return mocks.graphqlRequest.mock.calls.filter(([doc]) => doc === BOOK_BY_ISBN);
}

describe('BookISBNPanel', () => {
	beforeEach(() => {
		mocks.graphqlRequest.mockReset();
		mocks.graphqlRequest.mockResolvedValue({ bookByISBN: eastOfEden });
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('idle: shows no state message and makes no request before anything is typed', () => {
		renderPanel();

		expect(screen.queryByText('An ISBN has 10 or 13 digits.')).not.toBeInTheDocument();
		expect(screen.queryByText('No book found for that ISBN')).not.toBeInTheDocument();
		expect(lookupCalls()).toHaveLength(0);
	});

	it('incomplete: a partial number asks for more digits and makes no request', async () => {
		renderPanel();

		await type('97804');

		expect(screen.getByText('An ISBN has 10 or 13 digits.')).toBeInTheDocument();
		expect(lookupCalls()).toHaveLength(0);
	});

	it('invalid: a full-length number with a bad check digit is rejected without a request', async () => {
		renderPanel();

		await type(BAD_CHECK_ISBN);

		expect(screen.getByText("That ISBN's check digit doesn't match. Check for a typo.")).toBeInTheDocument();
		expect(lookupCalls()).toHaveLength(0);
	});

	it('valid: a hyphenated ISBN is looked up by its normalised digits', async () => {
		renderPanel();

		await type('978-0-434-74002-4');

		await waitFor(() => expect(screen.getByRole('link', { name: 'East of Eden' })).toBeInTheDocument());
		expect(mocks.graphqlRequest).toHaveBeenCalledWith(BOOK_BY_ISBN, { isbn: VALID_ISBN_13 });
	});

	it('resolving: shows the loading skeleton while the lookup is in flight', async () => {
		mocks.graphqlRequest.mockReturnValue(new Promise(() => {}));
		renderPanel();

		await type(VALID_ISBN_13);

		expect(screen.getByLabelText('Looking up ISBN')).toBeInTheDocument();
	});

	it('found: shows the resolved book, and its Add passes the work url to onAdd', async () => {
		const props = renderPanel();

		await type(VALID_ISBN_13);

		expect(await screen.findByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Add to Perspectize' }));
		expect(props.onAdd).toHaveBeenCalledWith(eastOfEden.url);
	});

	it('found: marks the book In Library when its work is already tracked', async () => {
		renderPanel({ library: new Map([[eastOfEden.url, { id: '7', name: 'Tracked' }]]) });

		await type(VALID_ISBN_13);

		expect(await screen.findByTestId('library-status')).toBeInTheDocument();
	});

	it('notFound: a valid ISBN with no record says so', async () => {
		mocks.graphqlRequest.mockResolvedValue({ bookByISBN: null });
		renderPanel();

		await type(VALID_ISBN_13);

		expect(await screen.findByText('No book found for that ISBN')).toBeInTheDocument();
	});

	it('error: a failed lookup shows the message with a Retry that looks it up again', async () => {
		mocks.graphqlRequest.mockRejectedValueOnce(new Error('lookup is down'));
		renderPanel();

		await type(VALID_ISBN_13);

		expect(await screen.findByText('Book lookup is unavailable right now.')).toBeInTheDocument();
		mocks.graphqlRequest.mockResolvedValueOnce({ bookByISBN: eastOfEden });
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(await screen.findByRole('link', { name: 'East of Eden' })).toBeInTheDocument();
		expect(lookupCalls()).toHaveLength(2);
	});
});
