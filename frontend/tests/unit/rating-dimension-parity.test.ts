import { describe, it, expect } from 'vitest';
import addFieldSearchSource from '$lib/components/AddFieldSearch.svelte?raw';
import perspectivePopoverSource from '$lib/components/PerspectivePopover.svelte?raw';
import { STANDARD_DIMENSIONS, getFieldLabel } from '$lib/utils/comparePerspectives';

/**
 * Gap #17 in the UI gap audit: the 4 standard rating dimensions (quality,
 * agreement, importance, confidence) used to be defined independently in
 * three places -- comparePerspectives.ts's STANDARD_DIMENSIONS (what Compare
 * actually renders), AddFieldSearch's AVAILABLE_FIELDS (a literal list with
 * its own labels), and PerspectivePopover's DEFAULT_FIELDS (a literal key
 * list). They agreed by coincidence; nothing would have caught a rename
 * drifting one of them.
 *
 * AddFieldSearch and PerspectivePopover now both derive from
 * STANDARD_DIMENSIONS at runtime, so this is mostly a regression guard
 * against a future literal list creeping back in.
 */
describe('rating dimension parity', () => {
	it('STANDARD_DIMENSIONS has exactly the 4 core dimensions', () => {
		expect(STANDARD_DIMENSIONS.map((d) => d.key)).toEqual(['quality', 'agreement', 'importance', 'confidence']);
	});

	it('getFieldLabel agrees with STANDARD_DIMENSIONS for every standard key', () => {
		for (const d of STANDARD_DIMENSIONS) {
			expect(getFieldLabel(d.key)).toBe(d.label);
		}
	});

	it('AddFieldSearch.svelte builds its core fields from STANDARD_DIMENSIONS, not a separate literal list', () => {
		expect(addFieldSearchSource).toContain('STANDARD_DIMENSIONS');
		expect(addFieldSearchSource).toContain('...STANDARD_DIMENSIONS.map(');
		// Regression guard: no hand-written {key:'quality', label:'Quality', ...} object
		// (the pattern the old literal AVAILABLE_FIELDS entries used).
		expect(addFieldSearchSource).not.toMatch(/key:\s*'quality',\s*label:\s*'Quality'/);
	});

	it('PerspectivePopover.svelte derives DEFAULT_FIELDS from STANDARD_DIMENSIONS, not a separate literal list', () => {
		expect(perspectivePopoverSource).toContain('STANDARD_DIMENSIONS');
		expect(perspectivePopoverSource).toContain('STANDARD_DIMENSIONS.map((d) => d.key)');
		expect(perspectivePopoverSource).not.toContain(
			"DEFAULT_FIELDS = ['quality', 'agreement', 'importance', 'confidence']",
		);
	});
});
