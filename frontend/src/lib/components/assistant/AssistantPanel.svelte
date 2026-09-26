<script lang="ts">
	import { page } from '$app/state';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/shadcn';
	import AssistantMessage from './AssistantMessage.svelte';
	import { useAssistantReply } from '$lib/queries/assistant';
	import { ASSISTANT_NAME, pageForPath } from '$lib/assistant/config';

	/**
	 * AssistantPanel — dev-flagged sidebar for asking Jeeves one question at a
	 * time (tracer 2). Opens only when the user clicks the toggle; never opens
	 * or nudges on its own. Stop cancels the reply (and the model call).
	 */
	let { reply = useAssistantReply() }: { reply?: ReturnType<typeof useAssistantReply> } = $props();

	let open = $state(false);
	let question = $state('');

	const responding = $derived(reply.status === 'responding');
	// Screen readers get state changes, not every streamed token.
	const announcement = $derived(
		reply.status === 'responding'
			? `${ASSISTANT_NAME} is responding`
			: reply.status === 'done'
				? 'Answer ready'
				: reply.status === 'error'
					? (reply.error ?? '')
					: reply.stopped
						? 'Stopped'
						: '',
	);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		reply.ask(question, pageForPath(page.url.pathname));
	}
</script>

{#if !open}
	<button
		type="button"
		class="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-lg"
		onclick={() => (open = true)}
		data-testid="assistant-toggle"
	>
		<SparklesIcon class="size-4" />
		Ask {ASSISTANT_NAME} <span class="text-xs opacity-70">(dev)</span>
	</button>
{:else}
	<section
		class="fixed bottom-5 left-5 z-40 flex max-h-[min(600px,calc(100dvh-8rem))] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
		aria-label="{ASSISTANT_NAME} assistant"
		data-testid="assistant-panel"
	>
		<header class="flex items-center justify-between border-b border-border px-3 py-2">
			<h2 class="text-sm font-semibold">{ASSISTANT_NAME} <span class="text-xs opacity-70">(dev)</span></h2>
			<button
				type="button"
				class="rounded p-1 hover:bg-muted"
				aria-label="Close {ASSISTANT_NAME}"
				onclick={() => {
					reply.stop();
					open = false;
				}}
			>
				<XIcon class="size-4" />
			</button>
		</header>

		<div class="flex-1 overflow-y-auto px-3 py-3" aria-busy={responding}>
			{#if reply.text}
				<AssistantMessage markdown={reply.text} />
			{/if}
			{#if reply.tool === 'read_guide'}
				<p class="mt-2 text-xs text-muted-foreground" data-testid="assistant-tool">Reading the app guide…</p>
			{:else if reply.tool}
				<p class="mt-2 text-xs text-muted-foreground" data-testid="assistant-tool">Working…</p>
			{/if}
			{#if reply.refused}
				<p class="mt-2 text-xs text-muted-foreground">{ASSISTANT_NAME} can't help with that one.</p>
			{/if}
			{#if reply.status === 'error'}
				<p class="mt-2 text-sm text-destructive" role="alert">{reply.error}</p>
			{/if}
			{#if reply.stopped}
				<p class="mt-2 text-xs text-muted-foreground">Stopped.</p>
			{/if}
		</div>

		<form class="flex flex-col gap-2 border-t border-border p-3" onsubmit={submit}>
			<label class="sr-only" for="assistant-question">Ask {ASSISTANT_NAME} a question</label>
			<textarea
				id="assistant-question"
				class="min-h-16 w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
				placeholder="How do I compare two perspectives?"
				maxlength="4000"
				bind:value={question}></textarea>
			<div class="flex justify-end gap-2">
				{#if responding}
					<Button type="button" variant="outline" size="sm" onclick={() => reply.stop()}>Stop</Button>
				{:else}
					<Button type="submit" size="sm" disabled={!question.trim()}>Ask</Button>
				{/if}
			</div>
		</form>

		<p class="sr-only" aria-live="polite" data-testid="assistant-live">{announcement}</p>
	</section>
{/if}
