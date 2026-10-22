/** Per-viewer playback preference (ticket 03): off by default. localStorage is a convenience only. */
export const OVERLAP_SETTING_KEY = 'perspectize:allow-overlapping-playback';

function read(): boolean {
	try {
		return localStorage.getItem(OVERLAP_SETTING_KEY) === 'true';
	} catch {
		return false;
	}
}

class PlaybackSettings {
	allowOverlappingPlayback = $state(read());

	set(value: boolean) {
		this.allowOverlappingPlayback = value;
		try {
			localStorage.setItem(OVERLAP_SETTING_KEY, String(value));
		} catch {
			// storage blocked: the choice lasts for this page only
		}
	}
}

export const playbackSettings = new PlaybackSettings();
