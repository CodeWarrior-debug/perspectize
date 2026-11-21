<script lang="ts">
	import { Button } from '#lib/components/shadcn/index.js';
	import { IOS_SHORTCUT_URL } from '#lib/utils/shortcutLink.js';
</script>

<div class="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="shortcut-help">
	<span class="text-sm font-medium">Add from iPhone</span>
	<p class="text-xs text-muted-foreground">
		Add a YouTube video, article or any link straight from the Share sheet in Safari, YouTube and other apps.
	</p>
	<ol class="list-decimal pl-5 text-xs text-muted-foreground space-y-0.5">
		<li>Install the Shortcut below, once.</li>
		<li>In any app, tap Share, then choose “Add to Perspectize” from the Share sheet.</li>
		<li>Perspectize opens with the link filled in. Check it and tap Add.</li>
	</ol>
	{#if IOS_SHORTCUT_URL}
		<div>
			<Button href={IOS_SHORTCUT_URL} variant="outline" size="sm">Add the Shortcut</Button>
		</div>
	{/if}
</div>
