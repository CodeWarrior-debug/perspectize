<script lang="ts">
	import { Button, Input, Label } from '$lib/components/shadcn';
	import { buildContentTypeIssueUrl, buildIssueUrl } from '$lib/feedback';

	const featureUrl = buildIssueUrl({ template: 'feature_request.md', labels: ['enhancement'] });
	const bugUrl = buildIssueUrl({ template: 'bug_report.md', labels: ['bug'] });

	let contentTypeName = $state('');
	let contentTypeExample = $state('');
	let contentTypeReason = $state('');

	const canSuggest = $derived(contentTypeName.trim().length > 0);

	function suggestContentType(event: SubmitEvent) {
		event.preventDefault();
		if (!canSuggest) return;
		const url = buildContentTypeIssueUrl({
			name: contentTypeName,
			example: contentTypeExample,
			reason: contentTypeReason,
		});
		window.open(url, '_blank', 'noopener,noreferrer');
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-xs text-muted-foreground">
		Feedback is tracked as GitHub issues — these open in a new tab (a GitHub account is required).
	</p>

	<section class="flex flex-col gap-2 rounded-md border border-border p-3" aria-labelledby="feedback-feature-heading">
		<h3 id="feedback-feature-heading" class="text-sm font-medium">Request a Feature or Change</h3>
		<p class="text-xs text-muted-foreground">Have an idea or want something to work differently?</p>
		<Button href={featureUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm" class="self-start">
			Open a feature request
		</Button>
	</section>

	<section class="flex flex-col gap-2 rounded-md border border-border p-3" aria-labelledby="feedback-bug-heading">
		<h3 id="feedback-bug-heading" class="text-sm font-medium">Report a Bug</h3>
		<p class="text-xs text-muted-foreground">Something broken or behaving unexpectedly?</p>
		<Button href={bugUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm" class="self-start">
			Report a bug
		</Button>
	</section>

	<section
		class="flex flex-col gap-2 rounded-md border border-border p-3"
		aria-labelledby="feedback-content-type-heading"
	>
		<h3 id="feedback-content-type-heading" class="text-sm font-medium">Suggest a New Content Type</h3>
		<p class="text-xs text-muted-foreground">
			Perspectize supports YouTube videos, claims, and Bible passages today. What should come next?
		</p>
		<form class="flex flex-col gap-3" onsubmit={suggestContentType}>
			<div class="flex flex-col gap-1">
				<Label for="feedback-content-type-name">Content type</Label>
				<Input
					id="feedback-content-type-name"
					bind:value={contentTypeName}
					placeholder="e.g. Podcast episode"
					maxlength={100}
					required
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="feedback-content-type-example">Example link (optional)</Label>
				<Input
					id="feedback-content-type-example"
					bind:value={contentTypeExample}
					placeholder="https://…"
					maxlength={500}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label for="feedback-content-type-reason">Why? (optional)</Label>
				<textarea
					id="feedback-content-type-reason"
					bind:value={contentTypeReason}
					placeholder="What perspectives would you capture on it?"
					rows={3}
					maxlength={2000}
					class="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
				></textarea>
			</div>
			<Button type="submit" size="sm" class="self-start" disabled={!canSuggest}>Continue on GitHub</Button>
		</form>
	</section>
</div>
