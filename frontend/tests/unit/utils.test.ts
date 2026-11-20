import { describe, it, expect } from 'vitest';
import { cn } from '#lib/utils.js';

describe('cn() utility', () => {
	it('returns empty string for no arguments', () => {
		expect(cn()).toBe('');
	});

	it('passes through a single class', () => {
		expect(cn('text-red-500')).toBe('text-red-500');
	});

	it('merges multiple classes', () => {
		const result = cn('px-4', 'py-2', 'text-sm');
		expect(result).toContain('px-4');
		expect(result).toContain('py-2');
		expect(result).toContain('text-sm');
	});

	it('handles conditional classes via clsx', () => {
		const isActive = true;
		const result = cn('base', isActive && 'active');
		expect(result).toContain('base');
		expect(result).toContain('active');
	});

	it('removes falsy conditional classes', () => {
		const isActive = false;
		const result = cn('base', isActive && 'active');
		expect(result).toBe('base');
		expect(result).not.toContain('active');
	});

	it('resolves conflicting Tailwind classes (last wins via twMerge)', () => {
		const result = cn('px-4', 'px-8');
		expect(result).toBe('px-8');
		expect(result).not.toContain('px-4');
	});

	it('handles undefined and null inputs', () => {
		const result = cn('text-sm', undefined, null, 'font-bold');
		expect(result).toContain('text-sm');
		expect(result).toContain('font-bold');
	});

	it('merges object syntax from clsx', () => {
		const result = cn({ 'text-red-500': true, 'text-blue-500': false });
		expect(result).toBe('text-red-500');
	});

	it('merges array syntax from clsx', () => {
		const result = cn(['px-4', 'py-2']);
		expect(result).toContain('px-4');
		expect(result).toContain('py-2');
	});
});
