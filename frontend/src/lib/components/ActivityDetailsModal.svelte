<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import XIcon from '@lucide/svelte/icons/x';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Dialog, DialogContent, DialogTitle, DialogClose } from '$lib/components/shadcn';
	import {
		formatCount,
		formatDate,
		formatDateTime,
		formatDuration,
		formatRemainingTime,
		formatTags,
		extractVideoIdFromUrl,
		getSourceDataCooldown,
	} from '$lib/utils/formatting';
	import { useUpdateSourceData } from '$lib/queries/content/useUpdateSourceData';

	interface ModalContent {
		id: string;
		name: string;
		url: string | null;
		channelTitle: string | null;
		viewCount: number | null;
		likeCount: number | null;
		length: number | null;
		lengthUnits: string | null;
		publishedAt: string | null;
		updatedAt: string;
		description: string | null;
		tags: string[] | null;
	}

	let {
		content,
		open = false,
		onClose,
	}: {
		content: ModalContent | null;
		open?: boolean;
		onClose: () => void;
	} = $props();

	const videoId = $derived(content ? extractVideoIdFromUrl(content.url) : null);
	const thumbSrc = $derived(videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
	const hasTags = $derived(!!content?.tags && content.tags.length > 0);
	const hasDescription = $derived(!!content?.description && content.description.trim().length > 0);

	// Source data (title/description/stats) is cache-served by the backend for
	// up to 6h after the last update — refreshing again inside that window
	// would just re-show identical numbers. Gate the button client-side so
	// that's explained upfront instead of a "success" toast that changes
	// nothing. See getSourceDataCooldown's doc comment for why this is a UX
	// estimate, not the actual enforcement.
	const cooldown = $derived(content ? getSourceDataCooldown(content.updatedAt) : { active: false, remainingMs: 0 });

	const updateSourceData = useUpdateSourceData();

	function handleOpenChange(next: boolean) {
		if (!next) onClose();
	}

	function handleUpdateSourceData() {
		if (!content || cooldown.active) return;
		updateSourceData.mutate(content.id);
	}
</script>

{#if content}
	<Dialog {open} onOpenChange={handleOpenChange}>
		<DialogContent showCloseButton={false} class="max-w-[560px] gap-0 overflow-hidden rounded-xl p-0">
			<div class="flex items-start justify-between gap-3 bg-primary px-[22px] py-[18px]">
				<DialogTitle class="text-xs font-semibold tracking-wide text-primary-foreground/70 uppercase">
					YouTube Video
				</DialogTitle>
				<DialogClose class="text-primary-foreground/80 hover:text-primary-foreground">
					<XIcon class="size-[18px]" />
					<span class="sr-only">Close</span>
				</DialogClose>
			</div>

			<div class="max-h-[calc(88vh-56px)] overflow-y-auto p-[22px]">
				<div class="flex items-start gap-3.5">
					<div class="h-[68px] w-[120px] flex-none overflow-hidden rounded-md bg-muted">
						{#if thumbSrc}
							<img src={thumbSrc} alt="" class="h-full w-full object-cover" onerror={(e) => e.currentTarget.remove()} />
						{/if}
					</div>
					<div class="min-w-0">
						<div
							class="font-[family-name:var(--font-family-serif)] text-[17px] leading-tight font-bold text-foreground"
						>
							{content.name}
						</div>
						<div class="mt-1 text-[13px] text-muted-foreground">{content.channelTitle}</div>
					</div>
				</div>

				{#if content.url}
					<a
						href={content.url}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-3.5 flex items-center gap-1.5 text-[13px] break-all text-primary no-underline hover:underline"
					>
						<ExternalLinkIcon class="size-3.5 flex-none" />
						<span>{content.url}</span>
					</a>
				{/if}

				<div class="mt-4.5 grid grid-cols-2 gap-2.5">
					<div class="rounded-lg border border-border bg-accent px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Perspectives</div>
						<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-lg font-bold text-foreground">—</div>
					</div>
					<div class="rounded-lg border border-border bg-accent px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Avg. Rating</div>
						<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-lg font-bold text-foreground">—</div>
					</div>
					<div class="rounded-lg border border-border bg-accent px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Views</div>
						<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground">
							{formatCount(content.viewCount)}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-accent px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Likes</div>
						<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground">
							{formatCount(content.likeCount)}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-accent px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Duration</div>
						<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground">
							{formatDuration(content.length, content.lengthUnits)}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-accent px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Published</div>
						<div class="mt-0.5 font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground">
							{content.publishedAt ? formatDate(content.publishedAt) : '—'}
						</div>
					</div>
				</div>

				<div class="mt-3.5 flex items-start justify-between gap-3 border-t border-border pt-3.5">
					<div>
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Last updated in Perspectize</div>
						<div
							class="hover-tooltip mt-0.5 font-[family-name:var(--font-family-serif)] text-sm text-foreground"
							data-tooltip={formatDateTime(content.updatedAt)}
						>
							{formatDate(content.updatedAt)}
						</div>
					</div>
					<div class="flex flex-col items-end gap-1">
						<button
							type="button"
							disabled={updateSourceData.isPending || cooldown.active}
							onclick={handleUpdateSourceData}
							class="inline-flex items-center gap-1.5 rounded-md border border-primary px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{#if updateSourceData.isPending}
								<LoaderCircleIcon class="size-3.5 animate-spin" />
							{/if}
							Update source data
						</button>
						{#if cooldown.active}
							<div class="max-w-[180px] text-right text-[11px] text-muted-foreground">
								This was updated recently. Check back in {formatRemainingTime(cooldown.remainingMs)} to refresh again.
							</div>
						{/if}
					</div>
				</div>

				{#if hasDescription}
					<div class="mt-3.5 border-t border-border pt-3.5">
						<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Description</div>
						<div class="font-serif text-[13px] whitespace-pre-wrap text-foreground">
							{content.description}
						</div>
					</div>
				{/if}

				{#if hasTags}
					<div class="mt-3.5">
						<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Tags</div>
						<div class="font-[family-name:var(--font-family-serif)] text-[13px] text-foreground">
							{formatTags(content.tags)}
						</div>
					</div>
				{/if}
			</div>
		</DialogContent>
	</Dialog>
{/if}
