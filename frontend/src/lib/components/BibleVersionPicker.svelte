<script lang="ts">
	import translations from '$lib/data/bible-translations.json';
	import { bibleVersion, type BibleVersionStore } from '$lib/utils/bibleVersion.svelte';

	let { store = bibleVersion }: { store?: BibleVersionStore } = $props();
</script>

<label class="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
	<span>Bible Gateway version</span>
	<select
		class="rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground"
		value={store.code}
		onchange={(e) => store.set(e.currentTarget.value)}
	>
		{#each translations as t (t.code)}
			<option value={t.code}>{t.code} — {t.label}{t.catholic ? ' (Catholic)' : ''}</option>
		{/each}
	</select>
</label>
