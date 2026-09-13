import type { MessageThread, MessagingUser } from '$lib/queries/messaging';

export function initials(username: string): string {
	const chars = (username.match(/[a-z0-9]/gi) ?? []).slice(0, 2).join('');
	return chars ? chars.toUpperCase() : '?';
}

export function otherParticipants(thread: Pick<MessageThread, 'participants'>, myUserId: string): MessagingUser[] {
	return thread.participants.filter((p) => p.user.id !== myUserId).map((p) => p.user);
}

export function threadTitle(thread: Pick<MessageThread, 'title' | 'participants'>, myUserId: string): string {
	if (thread.title && thread.title.trim()) return thread.title;
	const others = otherParticipants(thread, myUserId);
	if (others.length) return others.map((u) => u.username).join(', ');
	return 'Just you';
}

export function messageClockTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function typingLabel(usernames: string[]): string {
	if (usernames.length === 0) return '';
	if (usernames.length === 1) return `${usernames[0]} is typing…`;
	if (usernames.length === 2) return `${usernames[0]} and ${usernames[1]} are typing…`;
	const rest = usernames.length - 2;
	return `${usernames[0]}, ${usernames[1]} and ${rest} other${rest > 1 ? 's' : ''} are typing…`;
}
