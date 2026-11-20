import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import OnboardingVideo from '#lib/components/onboarding/OnboardingVideo.svelte';

describe('OnboardingVideo', () => {
	it('renders nothing when src is missing', () => {
		const { container } = render(OnboardingVideo, { props: { src: undefined, label: 'Watch' } });
		expect(container.querySelector('video')).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('renders nothing when src is empty string', () => {
		const { container } = render(OnboardingVideo, { props: { src: '', label: 'Watch' } });
		expect(container.querySelector('video')).toBeNull();
	});

	it('shows a play control and video with playsinline when src is set', () => {
		const { container } = render(OnboardingVideo, {
			props: { src: '/onboarding/guest.mp4', label: 'Watch how it works' },
		});
		const video = container.querySelector('video');
		expect(video).toBeInTheDocument();
		expect(video).toHaveAttribute('playsinline');
		expect(video).toHaveAttribute('src', '/onboarding/guest.mp4');
		expect(screen.getByRole('button', { name: /watch how it works/i })).toBeInTheDocument();
	});

	it('starts playback on click without relying on autoplay', async () => {
		const { container } = render(OnboardingVideo, {
			props: { src: '/onboarding/guest.mp4', label: 'Watch how it works' },
		});
		const video = container.querySelector('video') as HTMLVideoElement;
		const play = vi.fn().mockResolvedValue(undefined);
		video.play = play;

		await fireEvent.click(screen.getByRole('button', { name: /watch how it works/i }));
		expect(play).toHaveBeenCalled();
	});
});
