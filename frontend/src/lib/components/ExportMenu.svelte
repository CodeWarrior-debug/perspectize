<script lang="ts">
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/shadcn';

	interface Props {
		disabled: boolean;
		onPrintAsSeen: () => void;
		onPrintAsList: () => void;
		/** The "Download CSV" item renders only when this is given. */
		onDownloadCsv?: () => void;
		/** The "Copy for spreadsheet" item renders only when this is given. */
		onCopy?: () => void;
	}

	let { disabled, onPrintAsSeen, onPrintAsList, onDownloadCsv, onCopy }: Props = $props();

	let open = $state(false);

	function choose(handler: () => void) {
		open = false;
		handler();
	}

	const itemClass =
		'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden';
</script>

<Popover bind:open>
	<PopoverTrigger
		aria-label="Export"
		{disabled}
		class="inline-flex items-center gap-1.5 px-2 py-1 text-sm border border-input rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
	>
		<DownloadIcon class="size-4" />
		<span class="hidden md:inline">Export</span>
		<ChevronDownIcon class="size-4" />
	</PopoverTrigger>
	<PopoverContent align="start" class="w-56 p-1">
		{#if onDownloadCsv}
			<button type="button" class={itemClass} onclick={() => choose(onDownloadCsv)}>
				<DownloadIcon class="size-4" />
				Download CSV
			</button>
		{/if}
		{#if onCopy}
			<button type="button" class={itemClass} onclick={() => choose(onCopy)}>
				<CopyIcon class="size-4" />
				Copy for spreadsheet
			</button>
		{/if}
		<button type="button" class={itemClass} onclick={() => choose(onPrintAsSeen)}>
			<PrinterIcon class="size-4" />
			Print as seen…
		</button>
		<button type="button" class={itemClass} onclick={() => choose(onPrintAsList)}>
			<PrinterIcon class="size-4" />
			Print as list…
		</button>
	</PopoverContent>
</Popover>
