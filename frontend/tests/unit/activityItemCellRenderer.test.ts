import { describe, it, expect, vi } from 'vitest';
import { activityItemCellRenderer } from '$lib/utils/activityItemCellRenderer';

describe('activityItemCellRenderer', () => {
	it('returns empty string when data is missing', () => {
		expect(activityItemCellRenderer({})).toBe('');
	});

	it('renders a thumbnail and a 2-line-clamp title', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result).toBeInstanceOf(HTMLDivElement);

		const img = result.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.src).toBe('https://i.ytimg.com/vi/abc123/default.jpg');

		const title = result.querySelector('[data-testid="item-title"]');
		expect(title?.textContent).toBe('My Video');
		expect(title?.className).toContain('line-clamp-2');
	});

	it('lays the thumbnail and title out side-by-side (not stacked)', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result.className).toContain('items-center');
		expect(result.className).not.toContain('flex-col');

		const thumbWrap = result.querySelector('[data-testid="item-thumb"]');
		expect(thumbWrap?.className).toContain('h-8');
		expect(thumbWrap?.className).toContain('w-10');

		const title = result.querySelector('[data-testid="item-title"]');
		expect(title?.className).toContain('text-left');
		expect(title?.className).not.toContain('text-center');
	});

	it('omits the thumbnail image when the URL has no extractable video id', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'No Thumb', url: 'https://example.com/not-youtube' },
		}) as HTMLElement;

		expect(result.querySelector('img')).toBeNull();
		expect(result.querySelector('[data-testid="item-title"]')?.textContent).toBe('No Thumb');
	});

	it('clicking the thumbnail opens the video in a new tab and does not open the modal', () => {
		const onOpenDetails = vi.fn();
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const result = activityItemCellRenderer({
			data: { id: '42', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
			context: { onOpenDetails },
		}) as HTMLElement;

		const thumbWrap = result.querySelector('[data-testid="item-thumb"]') as HTMLElement;
		thumbWrap.click();

		expect(openSpy).toHaveBeenCalledWith('https://youtube.com/watch?v=abc123', '_blank', 'noopener,noreferrer');
		expect(onOpenDetails).not.toHaveBeenCalled();

		openSpy.mockRestore();
	});

	it('clicking anywhere else in the cell opens the details modal with the row id', () => {
		const onOpenDetails = vi.fn();

		const result = activityItemCellRenderer({
			data: { id: '42', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
			context: { onOpenDetails },
		}) as HTMLElement;

		result.click();

		expect(onOpenDetails).toHaveBeenCalledWith('42');
	});

	it('does not set a native title attribute (avoids doubling up with the AG Grid cell tooltip)', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result.hasAttribute('title')).toBe(false);
		expect(result.querySelector('[data-testid="item-thumb"]')?.hasAttribute('title')).toBe(false);
	});
});
