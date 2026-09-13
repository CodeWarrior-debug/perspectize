import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Avatar from '$lib/components/messaging/Avatar.svelte';

describe('Avatar', () => {
	it('renders username initials and a title', () => {
		render(Avatar, { props: { username: 'alice' } });
		const el = screen.getByTestId('avatar');
		expect(el).toHaveTextContent('AL');
		expect(el).toHaveAttribute('title', 'alice');
	});

	it('applies the small size class when size=sm', () => {
		render(Avatar, { props: { username: 'bob', size: 'sm' } });
		expect(screen.getByTestId('avatar').className).toContain('size-6');
	});
});
