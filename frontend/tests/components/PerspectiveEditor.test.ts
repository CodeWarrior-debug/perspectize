import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import PerspectiveEditor from '$lib/components/PerspectiveEditor.svelte';

describe('PerspectiveEditor', () => {
	it('renders the default toolbar buttons', async () => {
		render(PerspectiveEditor, { props: { value: '', onChange: vi.fn() } });

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
		render(PerspectiveEditor, {
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
		render(PerspectiveEditor, {
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

	it('toolbar buttons activate on click (keyboard Enter/Space fire click, not mousedown)', async () => {
		const onChange = vi.fn();
		render(PerspectiveEditor, { props: { value: '<p>hello</p>', onChange } });

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
		render(PerspectiveEditor, { props: { value: '<p>hello</p>', onChange: vi.fn() } });

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
			render(PerspectiveEditor, { props: { value: '', onChange: vi.fn() } });
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
		render(PerspectiveEditor, {
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
		render(PerspectiveEditor, {
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
