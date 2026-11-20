<script lang="ts">
	import type { WebPagePreview, WebPageRole } from '#lib/queries/content/index.js';
	import { libraryContentHref } from '#lib/utils/contentLinks.js';
	import { webPageReadNotice } from '#lib/utils/webPage.js';
	import WebPageRolesPicker from './WebPageRolesPicker.svelte';
	import GlobeIcon from '@lucide/svelte/icons/globe';

	let {
		url,
		preview,
		loading,
		failed,
		roles,
		onRolesChange,
		disabled = false,
	}: {
		/** The pasted link, shown as the title when the page gave none. */
		url: string;
		preview: WebPagePreview | null;
		/** The preview is being read (also covers the debounce before the request). */
		loading: boolean;
		/** The preview request itself failed (network or server). Save still works. */
		failed: boolean;
		roles: WebPageRole[];
		onRolesChange: (roles: WebPageRole[]) => void;
		disabled?: boolean;
	} = $props();

	// The image URL that failed to load. Keyed by URL, so a new preview gets its own attempt.
	let failedImage = $state<string | null>(null);

	const alreadySavedId = $derived(preview?.alreadyExistsContentId ?? null);
	const notice = $derived(
		failed ? "Couldn't load a preview. You can still save the link." : webPageReadNotice(preview?.fetch),
	);
	const title = $derived(preview?.title ?? preview?.domain ?? url);
	const site = $derived(preview?.siteName ?? preview?.domain ?? null);
	const showImage = $derived(!!preview?.imageUrl && failedImage !== preview.imageUrl);
</script>

<div class="border-border space-y-3 rounded-md border p-3 text-sm" data-testid="webpage-preview">
	{#if loading}
		<p class="text-muted-foreground">Reading the page…</p>
	{:else if preview}
		<div class="flex gap-3">
			{#if showImage}
				<img
					src={preview.imageUrl}
					alt=""
					referrerpolicy="no-referrer"
					loading="lazy"
					class="h-16 w-24 shrink-0 rounded object-cover"
					onerror={() => (failedImage = preview.imageUrl)}
				/>
			{:else}
				<div data-testid="webpage-glyph" class="bg-muted flex h-16 w-24 shrink-0 items-center justify-center rounded">
					<GlobeIcon class="text-muted-foreground size-6" />
				</div>
			{/if}
			<div class="min-w-0 space-y-1">
				<p class="break-words font-medium">{title}</p>
				{#if site}
					<p class="text-muted-foreground">{site}</p>
				{/if}
				{#if preview.author}
					<p>By {preview.author}</p>
				{/if}
				{#if preview.publishedAt}
					<p class="text-muted-foreground">Published {preview.publishedAt}</p>
				{/if}
			</div>
		</div>
		{#if preview.description}
			<p class="line-clamp-3">{preview.description}</p>
		{/if}
	{/if}

	{#if notice}
		<p role="status" class="text-muted-foreground">{notice}</p>
	{/if}

	{#if alreadySavedId}
		<p>
			Already saved — <a class="underline" href={libraryContentHref(alreadySavedId)}>open it</a>
		</p>
	{:else}
		<WebPageRolesPicker {roles} onChange={onRolesChange} {disabled} />
	{/if}
</div>
