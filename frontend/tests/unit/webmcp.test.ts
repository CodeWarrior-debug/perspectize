import { describe, it, expect, vi } from 'vitest';
import { getModelContext, registerWebMCP, type ModelContextLike } from '$lib/assistant/webmcp';
import { ASSISTANT_TOOLS_QUERY, RUN_ASSISTANT_TOOL_QUERY } from '$lib/queries/assistant';

type Registered = Parameters<ModelContextLike['registerTool']>[0];

function fakeContext() {
	const tools: Registered[] = [];
	const signals: (AbortSignal | undefined)[] = [];
	const ctx: ModelContextLike = {
		registerTool: vi.fn((tool: Registered, opts?: { signal?: AbortSignal }) => {
			tools.push(tool);
			signals.push(opts?.signal);
		}),
	};
	return { ctx, tools, signals };
}

const specs = [
	{
		name: 'read_guide',
		description: 'Read the guide.',
		inputSchema: '{"type":"object","properties":{"area":{"type":"string"}}}',
		untrustedContent: false,
	},
	{
		name: 'list_perspectives',
		description: 'Read perspectives.',
		inputSchema: '{"type":"object"}',
		untrustedContent: true,
	},
];

function fakeRequest(result: unknown = 'tool output') {
	return vi.fn(async (doc: string) => {
		if (doc === ASSISTANT_TOOLS_QUERY) return { assistantTools: specs };
		if (doc === RUN_ASSISTANT_TOOL_QUERY) return { runAssistantTool: result };
		throw new Error('unexpected query');
	}) as unknown as <T>(document: string, variables?: Record<string, unknown>) => Promise<T>;
}

describe('getModelContext', () => {
	it('returns null when the browser has no WebMCP', () => {
		expect(getModelContext({}, {})).toBeNull();
	});

	it('prefers document.modelContext and falls back to the navigator alias', () => {
		const { ctx } = fakeContext();
		expect(getModelContext({ modelContext: ctx }, {})).toBe(ctx);
		expect(getModelContext({}, { modelContext: ctx })).toBe(ctx);
	});
});

describe('registerWebMCP', () => {
	it('does nothing without WebMCP', async () => {
		const request = fakeRequest();
		const n = await registerWebMCP(new AbortController().signal, { request, modelContext: null });
		expect(n).toBe(0);
		expect(request).not.toHaveBeenCalled();
	});

	it('registers every tool the backend lists, read-only, with the untrusted hint', async () => {
		const { ctx, tools, signals } = fakeContext();
		const controller = new AbortController();
		const n = await registerWebMCP(controller.signal, {
			request: fakeRequest(),
			modelContext: ctx,
		});

		expect(n).toBe(2);
		expect(tools.map((t) => t.name)).toEqual(['read_guide', 'list_perspectives']);
		expect(tools[0].inputSchema).toEqual({
			type: 'object',
			properties: { area: { type: 'string' } },
		});
		expect(tools[0].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: false });
		expect(tools[1].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
		expect(signals.every((s) => s === controller.signal)).toBe(true);
	});

	it('execute runs the tool on the backend with the input as JSON', async () => {
		const { ctx, tools } = fakeContext();
		const request = fakeRequest('## compare.pick-two');
		await registerWebMCP(new AbortController().signal, { request, modelContext: ctx });

		const out = await tools[0].execute({ area: 'compare' });
		expect(out).toBe('## compare.pick-two');
		expect(request).toHaveBeenLastCalledWith(RUN_ASSISTANT_TOOL_QUERY, {
			name: 'read_guide',
			input: '{"area":"compare"}',
		});
	});

	it('surfaces the GraphQL error message to the agent', async () => {
		const { ctx, tools } = fakeContext();
		const request = vi.fn(async (doc: string) => {
			if (doc === ASSISTANT_TOOLS_QUERY) return { assistantTools: specs };
			throw { response: { errors: [{ message: 'invalid input: unknown area "nope"' }] } };
		}) as unknown as <T>(document: string, variables?: Record<string, unknown>) => Promise<T>;
		await registerWebMCP(new AbortController().signal, { request, modelContext: ctx });

		await expect(tools[0].execute({ area: 'nope' })).rejects.toThrow('unknown area "nope"');
	});

	it('registers nothing once the signal is aborted', async () => {
		const { ctx } = fakeContext();
		const controller = new AbortController();
		controller.abort();
		const n = await registerWebMCP(controller.signal, {
			request: fakeRequest(),
			modelContext: ctx,
		});
		expect(n).toBe(0);
		expect(ctx.registerTool).not.toHaveBeenCalled();
	});
});
