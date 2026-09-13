import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReadReceiptAvatars from '$lib/components/messaging/ReadReceiptAvatars.svelte';

const p = (id: string, username: string, lastReadSeq: number) => ({
	user: { id, username },
	role: 'MEMBER' as const,
	lastReadSeq,
	joinedAt: 'x',
});

describe('ReadReceiptAvatars', () => {
	it('renders nothing when no other participant has read up to seq', () => {
		render(ReadReceiptAvatars, {
			props: { participants: [p('u1', 'me', 9), p('u2', 'a', 3)], seq: 5, myUserId: 'u1' },
		});
		expect(screen.queryByTestId('receipts')).toBeNull();
	});

	it('renders reader avatars when someone has read up to seq', () => {
		render(ReadReceiptAvatars, {
			props: { participants: [p('u1', 'me', 9), p('u2', 'alice', 7)], seq: 5, myUserId: 'u1' },
		});
		const wrap = screen.getByTestId('receipts');
		expect(wrap).toBeInTheDocument();
		expect(wrap).toHaveTextContent('AL');
	});
});
