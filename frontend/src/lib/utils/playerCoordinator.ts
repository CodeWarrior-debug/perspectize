import { playbackSettings } from '$lib/stores/playbackSettings.svelte';

/**
 * One active player per tab and across tabs (ticket 03). A player registers a
 * pause callback and reports when it starts playing; every other registered
 * player here is paused, and other tabs hear about it on a BroadcastChannel.
 * With the viewer's override on, nothing is paused or broadcast.
 */
export const PLAYER_CHANNEL = 'perspectize-player';

export type ChannelLike = Pick<BroadcastChannel, 'postMessage' | 'addEventListener'>;

export interface PlayerCoordinator {
	register(playerId: string, pause: () => void): () => void;
	playing(playerId: string): void;
}

type PlayingMessage = { type: 'playing'; tabId: string; playerId: string };

export function createPlayerCoordinator(opts: {
	channel: ChannelLike | null;
	allowOverlap?: () => boolean;
	tabId?: string;
}): PlayerCoordinator {
	const allowOverlap = opts.allowOverlap ?? (() => false);
	const tabId = opts.tabId ?? Math.random().toString(36).slice(2);
	const players = new Map<string, () => void>();

	const pauseAllExcept = (playerId: string | null) => {
		for (const [id, pause] of players) if (id !== playerId) pause();
	};

	opts.channel?.addEventListener('message', (e: Event) => {
		const msg = (e as MessageEvent).data as PlayingMessage | undefined;
		if (msg?.type !== 'playing' || msg.tabId === tabId || allowOverlap()) return;
		pauseAllExcept(null);
	});

	return {
		register(playerId, pause) {
			players.set(playerId, pause);
			return () => players.delete(playerId);
		},
		playing(playerId) {
			if (allowOverlap()) return;
			pauseAllExcept(playerId);
			opts.channel?.postMessage({ type: 'playing', tabId, playerId } satisfies PlayingMessage);
		},
	};
}

function browserChannel(): ChannelLike | null {
	try {
		return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PLAYER_CHANNEL);
	} catch {
		return null;
	}
}

export const playerCoordinator = createPlayerCoordinator({
	channel: typeof window === 'undefined' ? null : browserChannel(),
	allowOverlap: () => playbackSettings.allowOverlappingPlayback,
});
