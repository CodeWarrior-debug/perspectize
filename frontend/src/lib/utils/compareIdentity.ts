/**
 * Avatar badge helpers shared across the Compare page — previously
 * copy-pasted identically in ComparePickerRow.svelte and
 * CompareTakeColumn.svelte, with Compare.svelte inlining the color logic a
 * third time. One place to fix instead of three (compare-page-enhancements
 * #10).
 */

/** Two-letter initials from a full display name, e.g. "Jamie Lee" -> "JL". */
export function nameInitials(name: string): string {
	return name
		.split(' ')
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

/**
 * Avatar color by identity, not by which side of the comparison a user is
 * currently on — the viewer ("You") is always primary-colored, everyone
 * else gets the neutral logo-purple, so swapping sides never changes "You"'s
 * color.
 */
export function identityColor(id: string, viewerId: string | null): string {
	return id === viewerId ? 'var(--color-primary)' : 'var(--color-logo-purple)';
}
