<script lang="ts">
	import BugIcon from '@lucide/svelte/icons/bug';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import { Button } from '$lib/components/shadcn';

	let { onClose = undefined }: { onClose?: () => void } = $props();

	const GITHUB_REPO = 'CodeWarrior-debug/perspectize';
	const BUG_REPORT_URL = `https://github.com/${GITHUB_REPO}/issues/new?template=bug_report.md`;
	const FEATURE_REQUEST_URL = `https://github.com/${GITHUB_REPO}/issues/new?template=feature_request.md`;

	function handleClick(url: string) {
		window.open(url, '_blank', 'noopener,noreferrer');
		onClose?.();
	}
</script>

<div class="space-y-4">
	<div>
		<p class="text-sm text-muted-foreground mb-4">Help us improve Perspectize by reporting bugs or sharing feature ideas.</p>
	</div>

	<div class="grid gap-3">
		<Button
			variant="outline"
			class="justify-start h-auto p-4 flex flex-col items-start"
			onclick={() => handleClick(BUG_REPORT_URL)}
		>
			<div class="flex items-center gap-2 mb-2">
				<BugIcon class="size-5" />
				<span class="font-semibold">Report a bug</span>
			</div>
			<span class="text-xs text-muted-foreground">Something isn't working as expected?</span>
		</Button>

		<Button
			variant="outline"
			class="justify-start h-auto p-4 flex flex-col items-start"
			onclick={() => handleClick(FEATURE_REQUEST_URL)}
		>
			<div class="flex items-center gap-2 mb-2">
				<LightbulbIcon class="size-5" />
				<span class="font-semibold">Request a feature</span>
			</div>
			<span class="text-xs text-muted-foreground">Have an idea for improvement?</span>
		</Button>
	</div>

	<p class="text-xs text-muted-foreground pt-2">Your feedback will open GitHub, where you can add more details before submitting.</p>
</div>
