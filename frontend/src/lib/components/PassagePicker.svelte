<script lang="ts">
	import { BIBLE_BOOKS } from '$lib/utils/bibleStructure';
	import type { PassageRange } from '$lib/utils/bible';
	import { defaultRange, isRangeOrdered } from '$lib/utils/passageRange';

	let {
		range,
		onchange,
		disabled = false,
	}: {
		range: PassageRange;
		onchange: (range: PassageRange) => void;
		disabled?: boolean;
	} = $props();

	const book = $derived(BIBLE_BOOKS.find((b) => b.id === range.bookId) ?? BIBLE_BOOKS[0]);
	const chapters = $derived(Array.from({ length: book.chapterCount }, (_, i) => i + 1));
	const versesIn = (chapter: number) =>
		Array.from({ length: book.versesPerChapter[chapter - 1] ?? 0 }, (_, i) => i + 1);
	const ordered = $derived(isRangeOrdered(range));

	const clampVerse = (chapter: number, verse: number) => Math.min(verse, book.versesPerChapter[chapter - 1] ?? verse);

	// Most passages picked are a single verse or a short range typed start-first. Until the user
	// deliberately edits an end field, treat the end as "following" the start so it never has to be
	// re-picked by hand after every start change. One explicit end edit opts the range out of this
	// for the rest of the session, so a real multi-verse selection is never silently overwritten.
	let endTouched = $state(false);

	function setBook(e: Event) {
		endTouched = false;
		onchange(defaultRange(Number((e.currentTarget as HTMLSelectElement).value)));
	}

	function setField(field: 'startChapter' | 'startVerse' | 'endChapter' | 'endVerse', e: Event) {
		const value = Number((e.currentTarget as HTMLSelectElement).value);
		const next = { ...range, [field]: value };

		if (field === 'endChapter' || field === 'endVerse') {
			endTouched = true;
		} else if (!endTouched) {
			// Keep the end glued to the start so the passage stays a valid single point
			// until the user opts into a range by touching an end field themselves.
			next.endChapter = next.startChapter;
			next.endVerse = next.startVerse;
		}

		// A chapter change can leave the verse past that chapter's last verse.
		next.startVerse = clampVerse(next.startChapter, next.startVerse);
		next.endVerse = clampVerse(next.endChapter, next.endVerse);
		onchange(next);
	}

	const selectClass =
		'border-input bg-background h-9 w-full rounded-md border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';
</script>

<div class="space-y-2" data-testid="passage-picker">
	<label class="block text-sm">
		<span class="text-muted-foreground">Book</span>
		<select class={selectClass} value={range.bookId} onchange={setBook} {disabled}>
			{#each BIBLE_BOOKS as b (b.id)}
				<option value={b.id}>{b.name}</option>
			{/each}
		</select>
	</label>

	<div class="grid grid-cols-2 gap-2">
		<label class="block text-sm">
			<span class="text-muted-foreground">Start chapter</span>
			<select class={selectClass} value={range.startChapter} onchange={(e) => setField('startChapter', e)} {disabled}>
				{#each chapters as c (c)}<option value={c}>{c}</option>{/each}
			</select>
		</label>
		<label class="block text-sm">
			<span class="text-muted-foreground">Start verse</span>
			<select class={selectClass} value={range.startVerse} onchange={(e) => setField('startVerse', e)} {disabled}>
				{#each versesIn(range.startChapter) as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
		<label class="block text-sm">
			<span class="text-muted-foreground">End chapter</span>
			<select class={selectClass} value={range.endChapter} onchange={(e) => setField('endChapter', e)} {disabled}>
				{#each chapters as c (c)}<option value={c}>{c}</option>{/each}
			</select>
		</label>
		<label class="block text-sm">
			<span class="text-muted-foreground">End verse</span>
			<select class={selectClass} value={range.endVerse} onchange={(e) => setField('endVerse', e)} {disabled}>
				{#each versesIn(range.endChapter) as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
	</div>

	{#if !ordered}
		<p class="text-sm text-red-600" role="alert">The end of the passage can't come before its start.</p>
	{/if}
</div>
