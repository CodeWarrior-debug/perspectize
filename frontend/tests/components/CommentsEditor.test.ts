import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import CommentsEditor from '#lib/components/CommentsEditor.svelte';

// jsdom has no layout: ProseMirror and Floating UI measure ranges and elements while placing the
// selection toolbar, so give them zero-size rectangles.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
beforeAll(() => {
	Range.prototype.getClientRects = emptyRects;
	Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
	Element.prototype.getClientRects = emptyRects;
});

describe('CommentsEditor', () => {
	it('exposes the writing area as a named multiline textbox', async () => {
		render(CommentsEditor, { props: { value: '', onChange: vi.fn() } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		expect(box.getAttribute('aria-multiline')).toBe('true');
	});

	it('autofocus puts the caret in the writing area on mount', async () => {
		render(CommentsEditor, { props: { value: '', onChange: vi.fn(), autofocus: true } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		await waitFor(() => expect(document.activeElement).toBe(box));
	});

	it('does not steal focus unless asked', async () => {
		render(CommentsEditor, { props: { value: '', onChange: vi.fn() } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		expect(document.activeElement).not.toBe(box);
	});

	// jsdom has no layout, so assert the two classes that make the toolbar stay put while the
	// phone sheet scrolls to the caret: the toolbar is sticky and no ancestor inside the editor
	// frame is a clipping scroll container (overflow-hidden would make it the sticky scope).
	it('keeps the toolbar sticky inside a frame that clips without becoming a scroll container', async () => {
		const { container } = render(CommentsEditor, { props: { value: '', onChange: vi.fn() } });
		await screen.findByLabelText('Bold');
		const frame = container.querySelector('.comment-editor-wrapper') as HTMLElement;
		const toolbar = screen.getByLabelText('Bold').parentElement as HTMLElement;
		expect(toolbar.classList.contains('sticky')).toBe(true);
		expect(frame.classList.contains('overflow-clip')).toBe(true);
		expect(frame.classList.contains('overflow-hidden')).toBe(false);
	});

	it('keeps the caret in the writing area when the expand button is used', async () => {
		const onPopout = vi.fn();
		render(CommentsEditor, { props: { value: '', onChange: vi.fn(), showPopout: true, onPopout } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		await fireEvent.click(screen.getByLabelText('Expand comment'));
		expect(onPopout).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(document.activeElement).toBe(box));
	});

	it('shows no word count while the editor is empty', async () => {
		render(CommentsEditor, { props: { value: '', onChange: vi.fn() } });
		await screen.findByRole('textbox', { name: 'Comment' });
		expect(screen.queryByTestId('word-count')).toBeNull();
	});

	it('shows a status note even before any word is written, and the word count beside it', async () => {
		const { rerender } = render(CommentsEditor, {
			props: { value: '', onChange: vi.fn(), status: 'Draft saved on this device' },
		});
		expect(await screen.findByRole('status')).toHaveTextContent('Draft saved on this device');
		expect(screen.queryByTestId('word-count')).toBeNull();
		await rerender({ value: '<p>two words</p>', onChange: vi.fn(), status: 'Draft saved on this device' });
		await waitFor(() => expect(screen.getByTestId('word-count')).toHaveTextContent('2 words'));
	});

	it('counts the words of an existing review, singular for one', async () => {
		const { rerender } = render(CommentsEditor, {
			props: { value: '<p>one two three</p><ul><li>four</li></ul>', onChange: vi.fn() },
		});
		expect((await screen.findByTestId('word-count')).textContent?.replace(/\s+/g, ' ').trim()).toBe('4 words');
		await rerender({ value: '<p>solo</p>', onChange: vi.fn() });
		await waitFor(() =>
			expect(screen.getByTestId('word-count').textContent?.replace(/\s+/g, ' ').trim()).toBe('1 word'),
		);
	});

	it('has no floating selection toolbar on a phone', async () => {
		render(CommentsEditor, { props: { value: '<p>hello world</p>', onChange: vi.fn(), isMobile: true } });
		await screen.findByRole('textbox', { name: 'Comment' });
		expect(document.querySelector('.bubble-toolbar')).toBeNull();
	});

	it('keeps the floating selection toolbar out of view until words are selected', async () => {
		render(CommentsEditor, { props: { value: '<p>hello world</p>', onChange: vi.fn() } });
		await screen.findByRole('textbox', { name: 'Comment' });
		expect(screen.queryByRole('toolbar', { name: 'Format selection' })).toBeNull();
	});

	it('shows Bold, Italic, Underline, Quote and Link next to selected words and formats them', async () => {
		const onChange = vi.fn();
		render(CommentsEditor, { props: { value: '<p>hello world</p>', onChange } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		box.focus();
		const text = box.querySelector('p')!.firstChild!;
		const range = document.createRange();
		range.setStart(text, 0);
		range.setEnd(text, 5);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		const bar = await screen.findByRole('toolbar', { name: 'Format selection' }, { timeout: 2000 });
		expect(bar.querySelectorAll('button')).toHaveLength(5);
		await fireEvent.click(screen.getByLabelText('Bold (selection)'));
		await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('<p><strong>hello</strong> world</p>'));
	});

	async function select(box: HTMLElement, start: number, end: number) {
		box.focus();
		const text = box.querySelector('p')!.firstChild!;
		const range = document.createRange();
		range.setStart(text, start);
		range.setEnd(text, end);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
	}

	it('edits a link in the selection toolbar instead of the browser prompt', async () => {
		const onChange = vi.fn();
		const prompt = vi.spyOn(window, 'prompt');
		render(CommentsEditor, { props: { value: '<p>hello world</p>', onChange } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		await select(box, 0, 5);
		await fireEvent.click(await screen.findByLabelText('Link (selection)'));
		const input = (await screen.findByLabelText('Link URL')) as HTMLInputElement;
		expect(input.value).toBe('https://');
		expect(prompt).not.toHaveBeenCalled();
		await fireEvent.input(input, { target: { value: 'example.com/a' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() =>
			expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('href="https://example.com/a"')),
		);
		await waitFor(() => expect(screen.queryByLabelText('Link URL')).toBeNull());
		prompt.mockRestore();
	});

	it('keeps Escape in the link field from closing the dialog', async () => {
		render(CommentsEditor, { props: { value: '<p>hello world</p>', onChange: vi.fn() } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		await select(box, 0, 5);
		await fireEvent.click(await screen.findByLabelText('Link (selection)'));
		const input = await screen.findByLabelText('Link URL');
		const outer = vi.fn();
		document.addEventListener('keydown', outer);
		await fireEvent.keyDown(input, { key: 'Escape' });
		document.removeEventListener('keydown', outer);
		expect(outer).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByLabelText('Link URL')).toBeNull());
	});

	it('shows a link card with Open, Edit and Remove when the caret is inside a link, and removes the link', async () => {
		const onChange = vi.fn();
		render(CommentsEditor, {
			props: { value: '<p><a href="https://example.com/x">hello</a> world</p>', onChange },
		});
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		const linkText = box.querySelector('a')!.firstChild!;
		box.focus();
		const range = document.createRange();
		range.setStart(linkText, 2);
		range.setEnd(linkText, 2);
		window.getSelection()!.removeAllRanges();
		window.getSelection()!.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		const open = await screen.findByLabelText('Open link in a new tab', {}, { timeout: 2000 });
		expect(open.getAttribute('href')).toBe('https://example.com/x');
		expect(open.getAttribute('rel')).toBe('noopener noreferrer');
		expect(screen.getByLabelText('Edit link')).toBeInTheDocument();
		await fireEvent.click(screen.getByLabelText('Remove link'));
		await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('<p>hello world</p>'));
	});

	it('offers focus mode only in the expanded editor, off until chosen, and drops it on collapse', async () => {
		const props = { value: '<p>one</p><p>two</p>', onChange: vi.fn(), showPopout: true, onPopout: vi.fn() };
		const { container, rerender } = render(CommentsEditor, { props });
		await screen.findByRole('textbox', { name: 'Comment' });
		const frame = container.querySelector('.comment-editor-wrapper') as HTMLElement;
		expect(screen.queryByLabelText('Focus mode')).toBeNull();

		await rerender({ ...props, expanded: true });
		const toggle = await screen.findByLabelText('Focus mode');
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		expect(frame.dataset.focusMode).toBe('false');

		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-pressed')).toBe('true');
		expect(frame.dataset.focusMode).toBe('true');

		await rerender({ ...props, expanded: false });
		expect(screen.queryByLabelText('Focus mode')).toBeNull();
		expect(frame.dataset.focusMode).toBe('false');
	});

	it('quotes the paragraph with the Quote button and reports it as pressed', async () => {
		const onChange = vi.fn();
		render(CommentsEditor, { props: { value: '<p>a passage</p>', onChange } });
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		box.focus();
		const quote = screen.getByLabelText('Quote');
		expect(quote.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(quote);
		await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('<blockquote><p>a passage</p></blockquote><p></p>'));
		await waitFor(() => expect(screen.getByLabelText('Quote').getAttribute('aria-pressed')).toBe('true'));
		await fireEvent.click(screen.getByLabelText('Quote'));
		await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('<p>a passage</p><p></p>'));
	});

	it('keeps an existing quote when a review is loaded', async () => {
		render(CommentsEditor, {
			props: { value: '<blockquote><p>said</p></blockquote><p>I reply</p>', onChange: vi.fn() },
		});
		const box = await screen.findByRole('textbox', { name: 'Comment' });
		expect(box.querySelector('blockquote p')?.textContent).toBe('said');
	});

	it('leaves the quote button out of the basic toolbar', async () => {
		render(CommentsEditor, { props: { value: '', onChange: vi.fn(), toolbar: 'basic' } });
		await screen.findByLabelText('Bold');
		expect(screen.queryByLabelText('Quote')).toBeNull();
	});

	// The dialog is capped at 90vh, so an expanded editor sized as a share of the window pushed the Save row out
	// of view on laptop-height screens; the height has to be what remains of 90dvh after the dialog's other parts.
	it('sizes the expanded writing area from what the dialog has room for, not a share of the window', async () => {
		const props = { value: '', onChange: vi.fn(), showPopout: true, onPopout: vi.fn() };
		const { container, rerender } = render(CommentsEditor, { props });
		await screen.findByRole('textbox', { name: 'Comment' });
		const frame = container.querySelector('.comment-editor-wrapper') as HTMLElement;
		expect(frame.style.getPropertyValue('--pe-min-height')).toBe('80px');

		await rerender({ ...props, expanded: true });
		const expandedHeight = frame.style.getPropertyValue('--pe-min-height');
		expect(expandedHeight).toContain('90dvh');
		expect(expandedHeight).not.toContain('60dvh');
		expect(frame.style.getPropertyValue('--pe-max-height')).toBe(expandedHeight);
	});

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
	describe('content height cap', () => {
		it('collapsed: the editing area scrolls past a capped height instead of growing', async () => {
			render(CommentsEditor, { props: { value: '', onChange: vi.fn(), minHeight: 68 } });
			await waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull());

			const wrapper = document.querySelector('.comment-editor-wrapper') as HTMLElement;
			const scroller = document.querySelector('.comment-editor-scroll') as HTMLElement;
			expect(wrapper.style.getPropertyValue('--pe-max-height')).toBe('max(68px, min(40dvh, 320px))');
			expect(scroller.style.overflowY).toBe('auto');
			expect(scroller.style.maxHeight).toBe('var(--pe-max-height)');
			expect(scroller.querySelector('.ProseMirror')).not.toBeNull();
		});

		it('expanded: the cap matches the expanded height so the pop-out also scrolls', async () => {
			render(CommentsEditor, {
				props: { value: '', onChange: vi.fn(), minHeight: 68, expanded: true },
			});
			await waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull());

			const wrapper = document.querySelector('.comment-editor-wrapper') as HTMLElement;
			expect(wrapper.style.getPropertyValue('--pe-max-height')).toBe('clamp(160px, calc(90dvh - 290px), 560px)');
		});
	});
});
