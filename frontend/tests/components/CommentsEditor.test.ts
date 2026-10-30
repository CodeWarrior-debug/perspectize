import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import CommentsEditor from '$lib/components/CommentsEditor.svelte';

describe('CommentsEditor', () => {
	it('renders the default toolbar buttons', async () => {
		render(CommentsEditor, { props: { value: '', onChange: vi.fn() } });

		await waitFor(() => {
			expect(screen.getByLabelText('Bold')).toBeInTheDocument();
		});
		expect(screen.getByLabelText('Italic')).toBeInTheDocument();
		expect(screen.getByLabelText('Underline')).toBeInTheDocument();
		expect(screen.getByLabelText('Bullet list')).toBeInTheDocument();
		expect(screen.getByLabelText('Numbered list')).toBeInTheDocument();
		expect(screen.getByLabelText('Text style')).toBeInTheDocument();
		expect(screen.getByLabelText('Link')).toBeInTheDocument();
		expect(screen.getByLabelText('Image')).toBeInTheDocument();
	});

	it('renders desktop-only table controls when isMobile is false', async () => {
		render(CommentsEditor, {
			props: { value: '', onChange: vi.fn(), isMobile: false },
		});

		await waitFor(() => {
			expect(screen.getByLabelText('Insert table')).toBeInTheDocument();
		});
		expect(screen.getByLabelText('Add row')).toBeInTheDocument();
		expect(screen.getByLabelText('Add column')).toBeInTheDocument();
		expect(screen.getByLabelText('Delete table')).toBeInTheDocument();
	});

	it('does not render table controls when isMobile is true', async () => {
		render(CommentsEditor, {
			props: { value: '', onChange: vi.fn(), isMobile: true },
		});

		await waitFor(() => {
			expect(screen.getByLabelText('Bold')).toBeInTheDocument();
		});
		expect(screen.queryByLabelText('Insert table')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Add row')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Add column')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Delete table')).not.toBeInTheDocument();
	});

	it('basic toolbar keeps text formatting and links, and drops image and table controls', async () => {
		render(CommentsEditor, {
			props: { value: '', onChange: vi.fn(), toolbar: 'basic', isMobile: false },
		});

		await waitFor(() => {
			expect(screen.getByLabelText('Bold')).toBeInTheDocument();
		});
		for (const label of ['Italic', 'Underline', 'Bullet list', 'Numbered list', 'Text style', 'Link']) {
			expect(screen.getByLabelText(label)).toBeInTheDocument();
		}
		for (const label of ['Image', 'Insert table', 'Add row', 'Add column', 'Delete table']) {
			expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
		}
	});

	it('basic toolbar still shows an existing table, so editing a comment that has one loses nothing', async () => {
		const html = '<table><tbody><tr><td><p>cell text</p></td></tr></tbody></table>';
		const { container } = render(CommentsEditor, {
			props: { value: html, onChange: vi.fn(), toolbar: 'basic' },
		});

		await waitFor(() => {
			expect(container.querySelector('table td')).not.toBeNull();
		});
		expect(container.querySelector('table td')?.textContent).toContain('cell text');
	});

	it('toolbar buttons activate on click (keyboard Enter/Space fire click, not mousedown)', async () => {
		const onChange = vi.fn();
		render(CommentsEditor, { props: { value: '<p>hello</p>', onChange } });

		await waitFor(() => {
			expect(screen.getByLabelText('Insert table')).toBeInTheDocument();
		});
		await fireEvent.click(screen.getByLabelText('Insert table'));

		await waitFor(() => {
			expect(onChange).toHaveBeenCalled();
		});
		expect(onChange.mock.calls.at(-1)![0]).toContain('<table');
	});

	it('exposes toggle state to assistive tech via aria-pressed on toggle buttons only', async () => {
		render(CommentsEditor, { props: { value: '<p>hello</p>', onChange: vi.fn() } });

		await waitFor(() => {
			expect(screen.getByLabelText('Bold')).toBeInTheDocument();
		});
		expect(screen.getByLabelText('Bold')).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByLabelText('Numbered list')).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByLabelText('Insert table')).not.toHaveAttribute('aria-pressed');
	});

	it('does not register duplicate Link/Underline extensions (StarterKit already bundles them)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			render(CommentsEditor, { props: { value: '', onChange: vi.fn() } });
			await waitFor(() => {
				expect(screen.getByLabelText('Bold')).toBeInTheDocument();
			});
			const duplicate = warn.mock.calls.filter((c) => String(c[0]).includes('Duplicate extension'));
			expect(duplicate).toEqual([]);
		} finally {
			warn.mockRestore();
		}
	});

	it('drops strike and inline-code formatting the sanitizers would strip on save', async () => {
		const onChange = vi.fn();
		render(CommentsEditor, {
			props: { value: '<p><s>gone</s> <code>gone2</code></p>', onChange },
		});

		await waitFor(() => {
			expect(screen.getByLabelText('Insert table')).toBeInTheDocument();
		});
		await fireEvent.click(screen.getByLabelText('Insert table'));

		await waitFor(() => {
			expect(onChange).toHaveBeenCalled();
		});
		const html = onChange.mock.calls.at(-1)![0] as string;
		expect(html).not.toMatch(/<s>|<code>/);
		expect(html).toContain('gone');
	});

	it('text-style dropdown follows the cursor between a heading and a paragraph', async () => {
		render(CommentsEditor, {
			props: { value: '<h2>title</h2><p>body</p>', onChange: vi.fn() },
		});

		const select = (await screen.findByLabelText('Text style')) as HTMLSelectElement;
		await waitFor(() => {
			expect(select.value).toBe('2');
		});

		// ProseMirror only reads DOM selection changes while it has focus.
		(document.querySelector('.ProseMirror') as HTMLElement).focus();
		const body = document.querySelector('.ProseMirror p')!;
		const range = document.createRange();
		range.setStart(body.firstChild!, 1);
		range.collapse(true);
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));

		await waitFor(() => {
			expect(select.value).toBe('0');
		});
	});
});
