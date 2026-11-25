<script lang="ts">
	import { Input, Label } from '#lib/components/shadcn/index.js';
	import PassagePicker from '#lib/components/PassagePicker.svelte';
	import WebPageImportPreview from '#lib/components/webpage/WebPageImportPreview.svelte';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { isChosenType, type AddContent } from './useAddContent.svelte.js';

	let { add }: { add: AddContent } = $props();
</script>

<div class="space-y-2">
	<Label for="content-input">Link or reference</Label>
	<div class="relative">
		<Input
			id="content-input"
			type="text"
			placeholder="Paste a link or type a reference"
			bind:value={add.input}
			oninput={add.resetOverrides}
			disabled={add.isPending}
			autocomplete="off"
			class="pr-9"
		/>
		<button
			type="button"
			onclick={add.paste}
			disabled={add.isPending}
			aria-label="Paste from clipboard"
			title="Paste from clipboard"
			class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
		>
			<ClipboardPasteIcon class="size-4" />
		</button>
	</div>
	{#if add.error}
		<p class="text-sm text-red-600">{add.error}</p>
	{/if}
	{#if add.effectiveType === 'BOOK' && add.bookFailed}
		<p class="text-sm text-red-600">
			{add.notAllowedMessage ?? 'Could not add this book. Check the link and try again.'}
		</p>
	{/if}
	{#if add.effectiveType === 'MOVIE' && add.movieFailed}
		<p class="text-sm text-red-600">
			{add.notAllowedMessage ?? 'Could not add this movie. Check the link and try again.'}
		</p>
	{/if}

	<div class="flex items-center gap-2 text-sm">
		<span data-testid="type-chip" class="text-muted-foreground">{add.chipLabel}</span>
		<select
			aria-label="Change type"
			class="border-input bg-background h-8 rounded-md border px-2 text-sm"
			value={isChosenType(add.effectiveType) ? add.effectiveType : ''}
			onchange={add.changeType}
			disabled={add.isPending}
		>
			<option value="" disabled>Select a type</option>
			<option value="YOUTUBE_VIDEO">YouTube</option>
			<option value="BIBLE_PASSAGE">Bible passage</option>
			<option value="MOVIE">Movie</option>
			<option value="BOOK">Book</option>
			<option value="WEB_PAGE">Webpage</option>
		</select>
		<div class="ml-auto flex items-center gap-1">
			<button
				type="button"
				onclick={add.clearType}
				disabled={add.isPending || !isChosenType(add.effectiveType)}
				aria-label="Clear type"
				title="Clear this type's fields"
				class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
			>
				<RotateCcwIcon class="size-3.5" />
				Type
			</button>
			<button
				type="button"
				onclick={add.clearAll}
				disabled={add.isPending || (!add.input && !add.manualType && !add.rangeOverride)}
				aria-label="Clear all"
				title="Clear everything"
				class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
			>
				<EraserIcon class="size-3.5" />
				All
			</button>
		</div>
	</div>

	{#if add.effectiveType === 'MOVIE'}
		<p class="text-xs text-muted-foreground">
			This product uses the TMDB API but is not endorsed or certified by TMDB.
		</p>
	{/if}

	{#if add.effectiveType === 'BOOK'}
		<p class="text-xs text-muted-foreground">
			Data: Open Library (archive.org), community-contributed; may be incomplete.
		</p>
	{/if}

	{#if add.effectiveType === 'BIBLE_PASSAGE'}
		{#key add.pickerResetToken}
			<PassagePicker range={add.range} onchange={add.setRange} disabled={add.isPending} />
		{/key}
	{/if}

	{#if add.effectiveType === 'WEB_PAGE'}
		<WebPageImportPreview
			url={add.input.trim()}
			preview={add.webPagePreview}
			loading={add.webPageLoading}
			failed={add.webPageFailed}
			roles={add.webPageRoles}
			onRolesChange={add.setRoles}
			disabled={add.isPending}
		/>
	{/if}
</div>
