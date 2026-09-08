import { describe, it, expect } from 'vitest';
import {
	initials,
	threadTitle,
	otherParticipants,
	messageClockTime,
	typingLabel,
} from '$lib/messaging/format';

const part = (id: string, username: string) => ({
	user: { id, username },
	role: 'MEMBER' as const,
	lastReadSeq: 0,
	joinedAt: 'x',
});

describe('messaging/format', () => {
	it('initials takes the first two alphanumerics, uppercased', () => {
		expect(initials('alice')).toBe('AL');
		expect(initials('bob_smith')).toBe('BO');
		expect(initials('7-eleven')).toBe('7E');
		expect(initials('   ')).toBe('?');
	});

	it('threadTitle prefers an explicit title, then other usernames, then "Just you"', () => {
		expect(threadTitle({ title: 'Standup', participants: [] }, 'u1')).toBe('Standup');
		expect(
			threadTitle(
				{ title: null, participants: [part('u1', 'me'), part('u2', 'alice'), part('u3', 'bob')] },
				'u1',
			),
		).toBe('alice, bob');
		expect(threadTitle({ title: null, participants: [part('u1', 'me')] }, 'u1')).toBe('Just you');
	});

	it('otherParticipants excludes me', () => {
		expect(
			otherParticipants({ participants: [part('u1', 'me'), part('u2', 'alice')] }, 'u1').map(
				(u) => u.username,
			),
		).toEqual(['alice']);
	});

	it('messageClockTime formats parseable ISO and blanks the rest', () => {
		expect(messageClockTime('not-a-date')).toBe('');
		expect(messageClockTime('2026-09-07T13:05:00Z')).toMatch(/\d/);
	});

	it('typingLabel handles 0/1/2/3+ names', () => {
		expect(typingLabel([])).toBe('');
		expect(typingLabel(['Alice'])).toBe('Alice is typing…');
		expect(typingLabel(['Alice', 'Bob'])).toBe('Alice and Bob are typing…');
		expect(typingLabel(['Alice', 'Bob', 'Cara'])).toBe('Alice, Bob and 1 other are typing…');
	});
});
