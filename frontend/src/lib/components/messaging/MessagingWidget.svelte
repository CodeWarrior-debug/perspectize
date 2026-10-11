<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_FAB_POSITION,
		FAB_SIZE,
		LONG_PRESS_MS,
		LONG_PRESS_SLOP,
		clampFabPosition,
		loadFabPosition,
		saveFabPosition,
		type FabPosition,
	} from './fabPosition';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { useMessageThreads } from '$lib/queries/messaging/useMessageThreads';
	import { useEditMessage } from '$lib/queries/messaging/useEditMessage';
	import { useDeleteMessage } from '$lib/queries/messaging/useDeleteMessage';
	import { totalUnread } from '$lib/messaging/inboxCache';
	import ThreadList from './ThreadList.svelte';
	import ThreadView from './ThreadView.svelte';
	import NewThreadDialog from './NewThreadDialog.svelte';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import XIcon from '@lucide/svelte/icons/x';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';

	/**
	 * MessagingWidget — a floating action button (bottom-right) that opens an
	 * in-place messaging panel: a thread list, and a selected thread's
	 * ThreadView, without ever navigating away from the current page.
	 *
	 * The /messages and /messages/[threadId] routes still exist as plain,
	 * linkable full-page fallbacks (e.g. a direct URL); this widget is the
	 * primary entry point and does not use them.
	 *
	 * Long-press (mouse or touch) the button to pick it up and drag it anywhere
	 * on screen; the spot is remembered per device in localStorage.
	 */

	let open = $state(false);
	let selectedThreadId = $state<string | null>(null);
	let dialogOpen = $state(false);

	const meState = useMe();
	const myUserId = $derived(meState.me?.id ?? '');
	const signedIn = $derived(!!meState.me);

	const threadsQuery = useMessageThreads(() => signedIn);
	const unread = $derived(totalUnread(threadsQuery.data?.messageThreads ?? []));

	const editMutation = useEditMessage();
	const deleteMutation = useDeleteMessage();

	function handleEdit(messageId: string, threadId: string, newBody: string, previousBody: string) {
		editMutation.mutate({ messageId, threadId, body: newBody, previousBody });
	}

	function handleDelete(messageId: string, threadId: string) {
		deleteMutation.mutate({ messageId, threadId });
	}

	let vw = $state(1024);
	let vh = $state(768);
	let pos = $state<FabPosition>(DEFAULT_FAB_POSITION);
	let dragging = $state(false);

	// Non-reactive gesture bookkeeping
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressPointerId = -1;
	let startX = 0;
	let startY = 0;
	let startPos: FabPosition = DEFAULT_FAB_POSITION;
	let suppressClick = false;

	onMount(() => {
		const saved = loadFabPosition();
		if (saved) pos = saved;
	});

	// Re-clamp on resize/rotate so a saved spot can never sit off-screen.
	const fabPos = $derived(clampFabPosition(pos, vw, vh));

	function cancelPress() {
		clearTimeout(pressTimer);
		pressTimer = undefined;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const el = e.currentTarget as HTMLElement;
		startX = e.clientX;
		startY = e.clientY;
		startPos = fabPos;
		pressPointerId = e.pointerId;
		cancelPress();
		pressTimer = setTimeout(() => {
			pressTimer = undefined;
			dragging = true;
			el.setPointerCapture?.(pressPointerId);
			navigator.vibrate?.(10);
		}, LONG_PRESS_MS);
	}

	function onPointerMove(e: PointerEvent) {
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!dragging) {
			// Moved before the hold completed: it's a click/scroll attempt, not a pickup.
			if (pressTimer && Math.hypot(dx, dy) > LONG_PRESS_SLOP) cancelPress();
			return;
		}
		pos = clampFabPosition({ right: startPos.right - dx, bottom: startPos.bottom - dy }, vw, vh);
	}

	function endPress() {
		cancelPress();
		if (!dragging) return;
		dragging = false;
		suppressClick = true; // the release would otherwise toggle the panel
		saveFabPosition(pos);
	}

	function togglePanel() {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		open = !open;
	}

	// Panel opens above the button when there's room, otherwise below; kept on-screen either way.
	const panelStyle = $derived.by(() => {
		const width = Math.min(380, vw - 40);
		const right = Math.max(8, Math.min(fabPos.right, vw - width - 8));
		const above = vh - (fabPos.bottom + FAB_SIZE) - 20;
		const below = fabPos.bottom - 20;
		if (above >= Math.min(360, below) || above >= below) {
			return `right:${right}px;bottom:${fabPos.bottom + FAB_SIZE + 12}px;width:${width}px;height:${Math.min(600, above)}px`;
		}
		return `right:${right}px;top:${vh - fabPos.bottom + 12}px;width:${width}px;height:${Math.min(600, below)}px`;
	});

	function closePanel() {
		open = false;
	}
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

{#if signedIn}
	<button
		type="button"
		onclick={togglePanel}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={endPress}
		onpointercancel={endPress}
		oncontextmenu={(e) => e.preventDefault()}
		style="right:{fabPos.right}px;bottom:{fabPos.bottom}px"
		aria-label={open ? 'Close messages' : 'Open messages'}
		data-testid="messaging-fab"
		class="fixed z-40 flex size-14 touch-none select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 {dragging
			? 'scale-110 cursor-grabbing shadow-2xl'
			: 'cursor-pointer'}"
	>
		{#if open}
			<XIcon class="size-6" />
		{:else}
			<MessageCircleIcon class="size-6" />
			{#if unread > 0}
				<span
					data-testid="fab-unread"
					class="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground"
				>
					{unread}
				</span>
			{/if}
		{/if}
	</button>

	{#if open}
		<div
			data-testid="messaging-panel"
			style={panelStyle}
			class="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
		>
			{#if selectedThreadId}
				<div class="flex items-center gap-2 border-b border-border p-2">
					<button
						type="button"
						onclick={() => (selectedThreadId = null)}
						aria-label="Back to conversations"
						class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<ChevronLeftIcon class="size-4" />
					</button>
					<button
						type="button"
						onclick={closePanel}
						aria-label="Close messages"
						class="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<XIcon class="size-4" />
					</button>
				</div>
				<div class="min-h-0 flex-1">
					{#key selectedThreadId}
						<ThreadView threadId={selectedThreadId} onEditMessage={handleEdit} onDeleteMessage={handleDelete} />
					{/key}
				</div>
			{:else}
				<ThreadList
					threads={threadsQuery.data?.messageThreads ?? []}
					{myUserId}
					activeThreadId={null}
					loading={threadsQuery.isLoading}
					onNewThread={() => (dialogOpen = true)}
					onSelect={(id) => (selectedThreadId = id)}
				/>
			{/if}
		</div>
	{/if}

	<NewThreadDialog
		open={dialogOpen}
		onOpenChange={(v) => (dialogOpen = v)}
		{myUserId}
		onCreated={(id) => {
			selectedThreadId = id;
			open = true;
		}}
	/>
{/if}
