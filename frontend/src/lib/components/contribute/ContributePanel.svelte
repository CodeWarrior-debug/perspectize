<script lang="ts">
	import { Button } from '$lib/components/shadcn';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { CONTRIBUTE_PATHS, type ContributePath } from '$lib/contribute/config';

	let { paths = CONTRIBUTE_PATHS }: { paths?: ContributePath[] } = $props();
</script>

<div class="flex flex-col gap-4">
	<p class="text-sm text-muted-foreground">Thanks for using Perspectize. Here's how you can help it grow.</p>

	{#if paths.length > 0}
		<ul class="grid gap-3">
			{#each paths as path (path.id)}
				<li class="rounded-md border border-border p-4 flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<path.icon class="size-5" aria-hidden="true" />
						<h3 class="font-semibold text-sm">{path.title}</h3>
					</div>
					<p class="text-xs text-muted-foreground">{path.description}</p>
					<div class="flex flex-wrap gap-2">
						{#each path.links as link (link.id)}
							<Button href={link.href} target="_blank" rel="noopener noreferrer">
								{link.label}
								<ExternalLinkIcon class="size-4" aria-hidden="true" />
								<span class="sr-only">(opens in a new tab)</span>
							</Button>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
