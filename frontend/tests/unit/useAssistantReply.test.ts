import { describe, it, expect, vi } from 'vitest';
import { useAssistantReply } from '$lib/queries/assistant/useAssistantReply.svelte';
import type { AssistantEvent } from '$lib/queries/assistant';

type Handlers = {
	next: (d: { assistantReply: AssistantEvent }) => void;
	error?: (e: unknown) => void;
	complete?: () => void;
};

function fakeSubscribe() {
	const calls: { payload: { query: string; variables?: Record<string, unknown> }; h: Handlers }[] = [];
	const dispose = vi.fn();
	const subscribe = vi.fn((payload, h) => {
		calls.push({ payload, h });
		return dispose;
	});
	return { subscribe, calls, dispose };
}

describe('useAssistantReply', () => {
	it('streams text, tool activity and finishes with citations', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('How do I compare?', 'compare');

		expect(r.status).toBe('responding');
		expect(f.calls[0].payload.variables).toEqual({
			input: { message: 'How do I compare?', page: 'compare' },
		});

		const h = f.calls[0].h;
		h.next({ assistantReply: { __typename: 'AssistantToolActivity', name: 'read_guide' } });
		expect(r.tool).toBe('read_guide');
		h.next({ assistantReply: { __typename: 'AssistantTextDelta', text: 'Open ' } });
		h.next({ assistantReply: { __typename: 'AssistantTextDelta', text: '**Compare**' } });
		expect(r.text).toBe('Open **Compare**');
		expect(r.tool).toBeNull();
		h.next({
			assistantReply: {
				__typename: 'AssistantDone',
				stop: 'end',
				citations: ['compare.pick-two'],
				inputTokens: 1,
				outputTokens: 2,
			},
		});
		h.complete?.();

		expect(r.status).toBe('done');
		expect(r.citations).toEqual(['compare.pick-two']);
	});

	it('shows a user-safe message for an error event', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('q', '');
		f.calls[0].h.next({ assistantReply: { __typename: 'AssistantError', message: 'Try again.' } });
		expect(r.status).toBe('error');
		expect(r.error).toBe('Try again.');
	});

	it('maps known GraphQL errors to friendly limit messages', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('q', '');
		f.calls[0].h.error?.([{ message: 'rate limit exceeded' }]);
		expect(r.status).toBe('error');
		expect(r.error).toMatch(/lot of questions/i);

		r.ask('q', '');
		f.calls[1].h.error?.([{ message: 'assistant is already answering for this user' }]);
		expect(r.error).toMatch(/still answering/i);
	});

	it('treats a refusal as a finished answer with a notice', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('q', '');
		f.calls[0].h.next({
			assistantReply: { __typename: 'AssistantDone', stop: 'refusal', citations: [], inputTokens: 0, outputTokens: 0 },
		});
		expect(r.status).toBe('done');
		expect(r.refused).toBe(true);
	});

	it('stop disposes the subscription and returns to idle', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('q', '');
		r.stop();
		expect(f.dispose).toHaveBeenCalledOnce();
		expect(r.status).toBe('idle');
		expect(r.stopped).toBe(true);
	});

	it('asking again disposes the previous reply and resets state', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('one', '');
		f.calls[0].h.next({ assistantReply: { __typename: 'AssistantTextDelta', text: 'old' } });
		r.ask('two', '');
		expect(f.dispose).toHaveBeenCalledOnce();
		expect(r.text).toBe('');
		expect(r.status).toBe('responding');
	});

	it('ignores empty questions', () => {
		const f = fakeSubscribe();
		const r = useAssistantReply(f.subscribe);
		r.ask('   ', '');
		expect(f.subscribe).not.toHaveBeenCalled();
		expect(r.status).toBe('idle');
	});
});
