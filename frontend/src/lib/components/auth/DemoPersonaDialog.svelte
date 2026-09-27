<script lang="ts">
	import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '$lib/components/shadcn';
	import { DEMO_PERSONAS, demoSession } from '$lib/auth';

	/** Demo-mode "sign in": pick a seeded persona. Mounted once in the root layout. */
</script>

<Dialog bind:open={demoSession.pickerOpen}>
	<DialogContent class="sm:max-w-md" data-testid="demo-persona-dialog">
		<DialogHeader>
			<DialogTitle>Try Perspectize as…</DialogTitle>
			<DialogDescription>
				Demo mode — pick a sample account. Everything you do stays in this demo database.
			</DialogDescription>
		</DialogHeader>
		<ul class="flex flex-col gap-2">
			{#each DEMO_PERSONAS as persona (persona.key)}
				<li>
					<button
						type="button"
						data-testid="demo-persona-{persona.key}"
						aria-current={demoSession.persona === persona.key ? 'true' : undefined}
						class="w-full rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current]:border-primary aria-[current]:bg-muted"
						onclick={() => demoSession.signInAs(persona.key)}
					>
						<span class="block text-sm font-medium text-foreground">{persona.name}</span>
						<span class="block text-xs text-muted-foreground">{persona.blurb}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if demoSession.signedIn}
			<button
				type="button"
				data-testid="demo-sign-out"
				class="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
				onclick={() => demoSession.signOut()}
			>
				Sign out
			</button>
		{/if}
	</DialogContent>
</Dialog>
