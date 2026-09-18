import { describe, it, expect } from 'vitest';
import { resolveSpec, displayText, copyText, itemsCopyText } from '$lib/utils/tooltipSpec';

describe('resolveSpec', () => {
	it('gives every column the default single-mode spec', () => {
		expect(resolveSpec(undefined)?.mode).toBe('single');
	});
	it('returns null when a column opts out', () => {
		expect(resolveSpec(false)).toBeNull();
	});
	it('shallow-merges an override over the default', () => {
		const copyValue = () => 5;
		const spec = resolveSpec({ copyValue });
		expect(spec?.mode).toBe('single');
		expect(spec?.copyValue).toBe(copyValue);
		expect(spec?.text).toBeDefined();
	});
});

describe('displayText / copyText defaults', () => {
	it('shows the formatted value and copies the raw value', () => {
		const spec = resolveSpec(undefined)!;
		const ctx = { value: 1234, valueFormatted: '1.2K' };
		expect(displayText(spec, ctx)).toBe('1.2K');
		expect(copyText(spec, ctx)).toBe('1234');
	});
	it('falls back to raw value for display and returns null copy for empty', () => {
		const spec = resolveSpec(undefined)!;
		expect(displayText(spec, { value: 'abc' })).toBe('abc');
		expect(copyText(spec, { value: null })).toBeNull();
		expect(copyText(spec, { value: '' })).toBeNull();
	});
});

describe('copyValue override', () => {
	it('copies the override without commas', () => {
		const spec = resolveSpec({ copyValue: (c) => c.data.likeCount })!;
		expect(copyText(spec, { value: 1234, data: { likeCount: 1234 } })).toBe('1234');
	});
});

describe('itemsCopyText', () => {
	const items = ['a', 'b', 'c'];
	it('null selection copies all', () => expect(itemsCopyText(items, null)).toBe('a, b, c'));
	it('copies only selected, in original order', () => expect(itemsCopyText(items, new Set(['c', 'a']))).toBe('a, c'));
	it('empty selection yields empty string', () => expect(itemsCopyText(items, new Set())).toBe(''));
});
