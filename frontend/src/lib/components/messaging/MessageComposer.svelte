<script lang="ts">
	import { createTypingController } from '$lib/messaging/typing';
	import { Button } from '$lib/components/shadcn';
	import SendIcon from '@lucide/svelte/icons/send';

	let {
		disabled = false,
		onSend,
		onTypingChange,
	}: {
		disabled?: boolean;
		onSend: (body: string) => void;
		onTypingChange: (typing: boolean) => void;
	} = $props();

	let draft = $state('');
	const controller = createTypingController({ emit: onTypingChange });

	$effect(() => () => controller.stop());

	function submit() {
		const body = draft.trim();
		if (!body) return;
		onSend(body);
		draft = '';
		controller.onSend();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	}
</script>

<div class="flex items-end gap-2 border-t border-border p-3">
	<textarea
		data-testid="composer-input"
		bind:value={draft}
		{disabled}
		rows={1}
		placeholder="Write a message…"
		oninput={() => controller.onKeystroke()}
		onkeydown={onKeydown}
		class="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
	></textarea>
	<Button data-testid="composer-send" onclick={submit} disabled={disabled || !draft.trim()}>
		<SendIcon class="size-4" />
	</Button>
</div>
