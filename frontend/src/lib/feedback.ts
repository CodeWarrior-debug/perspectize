// Feedback links for the Settings → Feedback tab. Everything routes to GitHub
// issues (pre-filled via query params) so there's no backend storage to run.

export const GITHUB_REPO_URL = 'https://github.com/CodeWarrior-debug/perspectize';

export type FeedbackTemplate = 'feature_request.md' | 'bug_report.md' | 'content_type_request.md';

export interface IssueUrlOptions {
	template: FeedbackTemplate;
	title?: string;
	body?: string;
	labels?: string[];
}

/** Build a GitHub "new issue" URL. A `body` param replaces the template's body. */
export function buildIssueUrl({ template, title, body, labels }: IssueUrlOptions): string {
	const params = new URLSearchParams({ template });
	if (title) params.set('title', title);
	if (body) params.set('body', body);
	if (labels?.length) params.set('labels', labels.join(','));
	return `${GITHUB_REPO_URL}/issues/new?${params.toString()}`;
}

export interface ContentTypeSuggestion {
	name: string;
	example?: string;
	reason?: string;
}

/** Pre-fill the content_type_request.md template's sections from the in-app form. */
export function buildContentTypeIssueUrl({ name, example, reason }: ContentTypeSuggestion): string {
	const trimmedName = name.trim();
	const body = [
		'## Content Type',
		trimmedName,
		'',
		'## Example',
		example?.trim() || '_None provided_',
		'',
		'## Why',
		reason?.trim() || '_None provided_',
	].join('\n');

	return buildIssueUrl({
		template: 'content_type_request.md',
		title: `[Content Type] ${trimmedName}`,
		body,
		labels: ['enhancement', 'content-type'],
	});
}
