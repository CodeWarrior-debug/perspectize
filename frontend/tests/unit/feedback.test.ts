import { describe, it, expect } from 'vitest';
import { buildContentTypeIssueUrl, buildIssueUrl, GITHUB_REPO_URL } from '$lib/feedback';

describe('buildIssueUrl', () => {
	it('points at the repo new-issue page with the template selected', () => {
		const url = new URL(buildIssueUrl({ template: 'bug_report.md' }));
		expect(`${url.origin}${url.pathname}`).toBe(`${GITHUB_REPO_URL}/issues/new`);
		expect(url.searchParams.get('template')).toBe('bug_report.md');
		expect(url.searchParams.has('body')).toBe(false);
	});

	it('joins labels with commas', () => {
		const url = new URL(buildIssueUrl({ template: 'feature_request.md', labels: ['enhancement', 'ui'] }));
		expect(url.searchParams.get('labels')).toBe('enhancement,ui');
	});
});

describe('buildContentTypeIssueUrl', () => {
	it('prefills title and every template section from the form', () => {
		const url = new URL(
			buildContentTypeIssueUrl({ name: '  Podcast  ', example: 'https://pod.example/ep1', reason: 'Long-form talk' }),
		);
		expect(url.searchParams.get('template')).toBe('content_type_request.md');
		expect(url.searchParams.get('title')).toBe('[Content Type] Podcast');
		const body = url.searchParams.get('body')!;
		expect(body).toContain('## Content Type\nPodcast');
		expect(body).toContain('## Example\nhttps://pod.example/ep1');
		expect(body).toContain('## Why\nLong-form talk');
	});

	it('marks optional fields as not provided when blank', () => {
		const body = new URL(buildContentTypeIssueUrl({ name: 'Book', example: ' ' })).searchParams.get('body')!;
		expect(body).toContain('## Example\n_None provided_');
		expect(body).toContain('## Why\n_None provided_');
	});
});
