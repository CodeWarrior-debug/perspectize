const LINK = /https?:\/\/[^\s<>"]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * The text to prefill the add form with, from the params a share or launcher passes to /add.
 * `url` wins; otherwise the first http(s) link inside `text` (apps often wrap the link in a
 * sentence); otherwise `text` itself, which covers a Bible reference shared as text.
 */
export function pickAddInput(params: { url?: string | null; text?: string | null }): string {
	const url = params.url?.trim();
	if (url) return url;

	const text = params.text?.trim() ?? '';
	const link = LINK.exec(text);
	if (link) return link[0].replace(TRAILING_PUNCTUATION, '');
	return text;
}
