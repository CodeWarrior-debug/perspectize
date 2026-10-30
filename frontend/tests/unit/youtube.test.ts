import { describe, it, expect } from 'vitest';
import { validateYouTubeUrl, classifyYouTubeUrl } from '$lib/utils/youtube';

describe('validateYouTubeUrl', () => {
	describe('valid URLs', () => {
		it('accepts youtube.com/watch URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
			expect(validateYouTubeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
			expect(validateYouTubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
		});

		it('accepts youtu.be short URLs', () => {
			expect(validateYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
			expect(validateYouTubeUrl('http://youtu.be/dQw4w9WgXcQ')).toBe(true);
		});

		it('accepts m.youtube.com mobile URLs', () => {
			expect(validateYouTubeUrl('https://m.youtube.com/watch?v=abc')).toBe(true);
		});

		it('accepts youtube.com/embed URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
			expect(validateYouTubeUrl('https://youtube.com/embed/abc')).toBe(true);
		});

		it('accepts youtube.com/shorts URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/shorts/abc123')).toBe(true);
			expect(validateYouTubeUrl('https://youtube.com/shorts/xyz')).toBe(true);
		});

		it('accepts youtube.com/live URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(true);
			expect(validateYouTubeUrl('https://youtube.com/live/abc123')).toBe(true);
		});

		it('accepts youtube.com/v legacy URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(true);
		});

		it('accepts youtube.com/e short embed URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/e/dQw4w9WgXcQ')).toBe(true);
		});

		it('accepts music.youtube.com URLs', () => {
			expect(validateYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
		});

		it('accepts youtube-nocookie.com embed URLs', () => {
			expect(validateYouTubeUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
			expect(validateYouTubeUrl('https://youtube-nocookie.com/embed/abc')).toBe(true);
		});

		it('accepts URLs with query parameters', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe(true);
			expect(validateYouTubeUrl('https://www.youtube.com/watch?v=abc&list=PLxxx&index=1')).toBe(true);
		});

		it('accepts URLs with trailing slash', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ/')).toBe(true);
		});

		it('accepts URLs with fragment', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=30')).toBe(true);
		});
	});

	describe('invalid URLs', () => {
		it('rejects empty string', () => {
			expect(validateYouTubeUrl('')).toBe(false);
		});

		it('rejects whitespace-only strings', () => {
			expect(validateYouTubeUrl('   ')).toBe(false);
			expect(validateYouTubeUrl('\t\n')).toBe(false);
		});

		it('rejects non-URL strings', () => {
			expect(validateYouTubeUrl('not-a-url')).toBe(false);
			expect(validateYouTubeUrl('just some text')).toBe(false);
		});

		it('rejects non-YouTube URLs', () => {
			expect(validateYouTubeUrl('https://vimeo.com/123456')).toBe(false);
			expect(validateYouTubeUrl('https://www.google.com')).toBe(false);
			expect(validateYouTubeUrl('https://notyoutube.com/watch?v=abc')).toBe(false);
		});

		it('rejects youtube.com without valid video path', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/')).toBe(false);
			expect(validateYouTubeUrl('https://youtube.com')).toBe(false);
			expect(validateYouTubeUrl('https://www.youtube.com/about')).toBe(false);
			expect(validateYouTubeUrl('https://www.youtube.com/channel/UCxxx')).toBe(false);
		});

		it('rejects youtube-nocookie.com without /embed path', () => {
			expect(validateYouTubeUrl('https://www.youtube-nocookie.com/watch?v=abc')).toBe(false);
			expect(validateYouTubeUrl('https://youtube-nocookie.com/')).toBe(false);
		});

		it('rejects youtu.be without video ID', () => {
			expect(validateYouTubeUrl('https://youtu.be/')).toBe(false);
			expect(validateYouTubeUrl('https://youtu.be')).toBe(false);
		});

		it('rejects malformed URLs', () => {
			expect(validateYouTubeUrl('http://')).toBe(false);
			expect(validateYouTubeUrl('https://')).toBe(false);
			expect(validateYouTubeUrl('://youtube.com')).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('handles very long strings without hanging (performance)', () => {
			const longString = 'a'.repeat(10000);
			expect(validateYouTubeUrl(longString)).toBe(false);
		});

		it('handles URLs with unusual but valid characters', () => {
			expect(validateYouTubeUrl('https://www.youtube.com/watch?v=abc_-123')).toBe(true);
		});
	});
});

describe('classifyYouTubeUrl', () => {
	const id = 'dQw4w9WgXcQ';
	it.each([
		[`https://music.youtube.com/watch?v=${id}`, 'musicTrack'],
		[`https://music.youtube.com/watch?v=${id}&list=RDAMVM${id}`, 'musicTrack'],
		['https://music.youtube.com/playlist?list=OLAK5uy_abc', 'musicCollection'],
		['https://music.youtube.com/browse/MPREb_abc', 'musicCollection'],
		['https://music.youtube.com/channel/UCabc', 'musicCollection'],
		[`https://www.youtube.com/watch?v=${id}`, 'video'],
		[`https://youtu.be/${id}`, 'video'],
		['https://music.youtube.com/watch', null],
		['https://music.youtube.com/', null],
		['https://example.com/watch?v=' + id, null],
		['not a url', null],
	])('%s -> %s', (url, expected) => {
		expect(classifyYouTubeUrl(url)).toBe(expected);
	});
});
