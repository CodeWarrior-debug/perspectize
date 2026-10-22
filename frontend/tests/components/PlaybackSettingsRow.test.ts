import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import PlaybackSettingsRow from '$lib/components/PlaybackSettingsRow.svelte';
import { playbackSettings, OVERLAP_SETTING_KEY } from '$lib/stores/playbackSettings.svelte';

describe('PlaybackSettingsRow', () => {
	beforeEach(() => {
		localStorage.clear();
		playbackSettings.set(false);
	});

	it('is off by default', () => {
		render(PlaybackSettingsRow);
		expect(screen.getByRole('switch', { name: /more than one player/i })).not.toBeChecked();
	});

	it('turning it on persists for this viewer', async () => {
		render(PlaybackSettingsRow);
		await fireEvent.click(screen.getByRole('switch', { name: /more than one player/i }));
		expect(playbackSettings.allowOverlappingPlayback).toBe(true);
		expect(localStorage.getItem(OVERLAP_SETTING_KEY)).toBe('true');
	});
});
