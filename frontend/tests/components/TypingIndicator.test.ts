import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TypingIndicator from '$lib/components/messaging/TypingIndicator.svelte';

describe('TypingIndicator', () => {
	it('renders nothing when nobody is typing', () => {
		render(TypingIndicator, { props: { usernames: [] } });
		expect(screen.queryByTestId('typing')).toBeNull();
	});

	it('renders a label when someone is typing', () => {
		render(TypingIndicator, { props: { usernames: ['Alice'] } });
		expect(screen.getByTestId('typing')).toHaveTextContent('Alice is typing…');
	});
});
