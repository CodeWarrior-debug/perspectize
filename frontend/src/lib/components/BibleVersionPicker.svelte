<script lang="ts">
	import translations from '$lib/data/bible-translations.json';
	import { bibleVersion, type BibleVersionStore } from '$lib/utils/bibleVersion.svelte';

	let { store = bibleVersion }: { store?: BibleVersionStore } = $props();
</script>

<label
	class="flex max-w-full min-w-0 flex-col gap-1 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:gap-2"
>
	<span class="whitespace-nowrap">Bible Gateway version</span>
	<select
		class="min-w-0 max-w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground"
		value={store.code}
		onchange={(e) => store.set(e.currentTarget.value)}
	>
		{#each translations as t (t.code)}
			<option value={t.code}>{t.code} — {t.label}{t.catholic ? ' (Catholic)' : ''}</option>
		{/each}
	</select>
</label>
