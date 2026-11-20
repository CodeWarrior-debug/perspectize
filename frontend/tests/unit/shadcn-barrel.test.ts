import { describe, it, expect } from 'vitest';
import { Button, buttonVariants } from '#lib/components/shadcn/index.js';

describe('shadcn barrel exports', () => {
	it('exports Button component', () => {
		expect(Button).toBeDefined();
	});

	it('exports buttonVariants function', () => {
		expect(buttonVariants).toBeDefined();
		expect(typeof buttonVariants).toBe('function');
	});

	it('buttonVariants returns class string for default variant', () => {
		const classes = buttonVariants({ variant: 'default' });
		expect(typeof classes).toBe('string');
		expect(classes.length).toBeGreaterThan(0);
	});

	it('buttonVariants returns different classes for different variants', () => {
		const defaultClasses = buttonVariants({ variant: 'default' });
		const outlineClasses = buttonVariants({ variant: 'outline' });
		expect(defaultClasses).not.toBe(outlineClasses);
	});
});
