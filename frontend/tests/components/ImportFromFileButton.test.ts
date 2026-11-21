import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import ImportFromFileButton from '#lib/components/imports/ImportFromFileButton.svelte';
import { goto } from '$app/navigation';
import { IMPORT_FILE_FORMAT } from '#lib/utils/importFile.js';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

// The mutation's state and its callbacks are driven per test; the component only reads them.
const stage = vi.hoisted(() => ({
	pending: false,
	mutate: vi.fn(),
}));
vi.mock('#lib/queries/imports/useStageImportFromFile.js', () => ({
	useStageImportFromFile: () => ({
		get isPending() {
			return stage.pending;
		},
		mutate: stage.mutate,
	}),
}));

const BUTTON = /import from file/i;

function validFile(): File {
	const text = JSON.stringify({
		format: IMPORT_FILE_FORMAT,
		source: { title: "Jordan's Journey", websiteUrl: 'https://jordans-journey.com', destinationType: 'WEB_PAGE' },
		items: [
			{
				externalId: 'post-1',
				url: 'https://jordans-journey.com/post-1',
				title: 'A post',
				position: 0,
				facts: { kind: 'PAGE' },
			},
		],
	});
	return new File([text], 'perspectize-import.json', { type: 'application/json' });
}

function chooseFile(file: File) {
	const input = screen.getByLabelText('Choose a candidates file') as HTMLInputElement;
	fireEvent.change(input, { target: { files: [file] } });
}

/** A GraphQL error as graphql-request reports it (the response.errors shape importErrorMessage reads). */
function serverError(message: string) {
	return { response: { errors: [{ message }] } };
}

beforeEach(() => {
	vi.clearAllMocks();
	stage.pending = false;
});

afterEach(() => {
	cleanup();
});

describe('ImportFromFileButton', () => {
	it('is hidden for a non-admin', () => {
		render(ImportFromFileButton, { props: { isAdmin: false } });
		expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
		expect(screen.queryByLabelText('Choose a candidates file')).toBeNull();
	});

	it('is shown for an admin, enabled', () => {
		render(ImportFromFileButton, { props: { isAdmin: true } });
		expect(screen.getByRole('button', { name: BUTTON }).hasAttribute('disabled')).toBe(false);
	});

	it('invalid JSON shows an error and sends nothing', async () => {
		render(ImportFromFileButton, { props: { isAdmin: true } });
		chooseFile(new File(['{nope'], 'bad.json', { type: 'application/json' }));

		expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't valid JSON.");
		expect(stage.mutate).not.toHaveBeenCalled();
	});

	it('a file of another format shows an error and sends nothing', async () => {
		render(ImportFromFileButton, { props: { isAdmin: true } });
		chooseFile(new File(['{"format":"other/v1","items":[]}'], 'other.json', { type: 'application/json' }));

		expect(await screen.findByRole('alert')).toHaveTextContent("That isn't a Perspectize import file");
		expect(stage.mutate).not.toHaveBeenCalled();
	});

	it('a file over the server limit shows the server error', async () => {
		stage.mutate.mockImplementation((_input: unknown, opts: { onError: (e: unknown) => void }) =>
			opts.onError(serverError('invalid input: a file takes 1 to 5000 items')),
		);
		render(ImportFromFileButton, { props: { isAdmin: true } });
		chooseFile(validFile());

		expect(await screen.findByRole('alert')).toHaveTextContent('A file takes 1 to 5000 items');
		expect(goto).not.toHaveBeenCalled();
	});

	it('a valid file stages the import and navigates to it', async () => {
		stage.mutate.mockImplementation((_input: unknown, opts: { onSuccess: (d: unknown) => void }) =>
			opts.onSuccess({ stageImportFromFile: { id: '42' } }),
		);
		render(ImportFromFileButton, { props: { isAdmin: true } });
		chooseFile(validFile());

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/import/42'));
		const sent = stage.mutate.mock.calls[0][0];
		expect(sent.name).toBe("Jordan's Journey");
		expect(sent.items).toHaveLength(1);
	});

	it('is disabled while the import is being staged', () => {
		stage.pending = true;
		render(ImportFromFileButton, { props: { isAdmin: true } });
		expect(screen.getByRole('button', { name: /importing/i }).hasAttribute('disabled')).toBe(true);
	});
});
