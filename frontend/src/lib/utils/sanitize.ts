import DOMPurify from 'dompurify';

/**
 * Sanitize HTML from user-generated rich text (Tiptap review/comment content).
 * Allows safe formatting tags only — strips scripts, event handlers, and dangerous attributes.
 */
export function sanitizeHtml(dirty: string): string {
	return DOMPurify.sanitize(dirty, {
		ALLOWED_TAGS: [
			'p',
			'br',
			'strong',
			'b',
			'em',
			'i',
			'u',
			'ul',
			'ol',
			'li',
			'a',
			'span',
			'h2',
			'h3',
			'img',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td',
		],
		ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height'],
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
	});
}
