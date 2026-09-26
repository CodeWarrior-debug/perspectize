import { subscribeGraphql } from '$lib/messaging/ws-client.svelte';
import { ASSISTANT_REPLY_SUBSCRIPTION, type AssistantEvent } from './index';

export type AssistantStatus = 'idle' | 'responding' | 'done' | 'error';

type Subscribe = typeof subscribeGraphql;

// Server errors that have a friendlier user-facing wording. Anything else
// falls back to a generic message; raw server text is never shown.
const FRIENDLY: [RegExp, string][] = [
	[/rate limit/i, "You've asked a lot of questions recently. Please try again a bit later."],
	[/already answering/i, 'Still answering your last question.'],
	[/not enabled/i, "The assistant isn't turned on here."],
	[/longer than|too long/i, 'That question is too long. Try something shorter.'],
];
const GENERIC = "Couldn't get an answer right now. Please try again.";

function friendly(err: unknown): string {
	const first = Array.isArray(err) ? err[0] : err;
	const msg = first && typeof first === 'object' && 'message' in first ? String(first.message) : '';
	return FRIENDLY.find(([re]) => re.test(msg))?.[1] ?? GENERIC;
}

/**
 * One assistant reply at a time over the GraphQL `assistantReply`
 * subscription. Callers get reactive state plus `ask` and `stop`; the
 * subscription wiring stays in here. `stop()` disposes the subscription,
 * which cancels the model call on the server.
 */
export function useAssistantReply(subscribe: Subscribe = subscribeGraphql) {
	const s = $state({
		status: 'idle' as AssistantStatus,
		text: '',
		tool: null as string | null,
		citations: [] as string[],
		error: null as string | null,
		refused: false,
		stopped: false,
	});
	let dispose: (() => void) | null = null;

	function handle(e: AssistantEvent) {
		switch (e.__typename) {
			case 'AssistantTextDelta':
				s.tool = null;
				s.text += e.text;
				break;
			case 'AssistantToolActivity':
				s.tool = e.name;
				break;
			case 'AssistantDone':
				s.tool = null;
				s.citations = e.citations;
				s.refused = e.stop === 'refusal';
				s.status = 'done';
				break;
			case 'AssistantError':
				s.tool = null;
				s.error = e.message;
				s.status = 'error';
				break;
		}
	}

	function stop() {
		dispose?.();
		dispose = null;
		if (s.status === 'responding') {
			s.status = 'idle';
			s.stopped = true;
			s.tool = null;
		}
	}

	function ask(message: string, page: string) {
		const q = message.trim();
		if (!q) return;
		stop();
		Object.assign(s, {
			status: 'responding',
			text: '',
			tool: null,
			citations: [],
			error: null,
			refused: false,
			stopped: false,
		});
		dispose = subscribe<{ assistantReply: AssistantEvent }>(
			{ query: ASSISTANT_REPLY_SUBSCRIPTION, variables: { input: { message: q, page } } },
			{
				next: (d) => handle(d.assistantReply),
				error: (err) => {
					s.tool = null;
					s.error = friendly(err);
					s.status = 'error';
					dispose = null;
				},
				complete: () => {
					if (s.status === 'responding') s.status = 'done';
					dispose = null;
				},
			},
		);
	}

	return {
		get status() {
			return s.status;
		},
		get text() {
			return s.text;
		},
		get tool() {
			return s.tool;
		},
		get citations() {
			return s.citations;
		},
		get error() {
			return s.error;
		},
		get refused() {
			return s.refused;
		},
		get stopped() {
			return s.stopped;
		},
		ask,
		stop,
	};
}
