import { graphqlRequest } from '$lib/queries/client';
import { ASSISTANT_TOOLS_QUERY, RUN_ASSISTANT_TOOL_QUERY, type AssistantToolSpec } from '$lib/queries/assistant';

/**
 * WebMCP (https://webmachinelearning.github.io/webmcp/) lets a page offer
 * tools to the browser's built-in agent. We register the assistant's
 * read-only tools. Each call runs on the backend through the same tool
 * registry Jeeves uses, as the signed-in user (graphqlRequest attaches the
 * Clerk token), so there is one implementation and one privacy path.
 */

type Request = <T>(document: string, variables?: Record<string, unknown>) => Promise<T>;

/** The slice of the WebMCP ModelContext we use. */
export interface ModelContextLike {
	registerTool(
		tool: {
			name: string;
			description: string;
			inputSchema?: object;
			execute: (input: object) => Promise<unknown>;
			annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
		},
		options?: { signal?: AbortSignal },
	): Promise<void> | void;
}

/**
 * Finds the page's ModelContext, or null when the browser has no WebMCP.
 * The spec puts it on document; early Chrome builds used navigator.
 */
export function getModelContext(
	doc: object = globalThis.document ?? {},
	nav: object = globalThis.navigator ?? {},
): ModelContextLike | null {
	const ctx =
		(doc as { modelContext?: ModelContextLike }).modelContext ??
		(nav as { modelContext?: ModelContextLike }).modelContext;
	return ctx && typeof ctx.registerTool === 'function' ? ctx : null;
}

/** First GraphQL error message, so the agent sees why a call failed. */
function errorMessage(err: unknown): string {
	const errors = (err as { response?: { errors?: { message?: string }[] } })?.response?.errors;
	return errors?.[0]?.message ?? (err instanceof Error ? err.message : 'The tool call failed.');
}

/**
 * Registers every tool the backend exposes. Aborting signal unregisters them
 * (the WebMCP way). Returns how many were registered: 0 when the browser has
 * no WebMCP, the server exposes none, or signal was aborted first.
 */
export async function registerWebMCP(
	signal: AbortSignal,
	{
		request = graphqlRequest as Request,
		modelContext = getModelContext(),
	}: { request?: Request; modelContext?: ModelContextLike | null } = {},
): Promise<number> {
	if (!modelContext || signal.aborted) return 0;
	const { assistantTools } = await request<{ assistantTools: AssistantToolSpec[] }>(ASSISTANT_TOOLS_QUERY);
	let count = 0;
	for (const spec of assistantTools) {
		if (signal.aborted) break;
		await modelContext.registerTool(
			{
				name: spec.name,
				description: spec.description,
				inputSchema: JSON.parse(spec.inputSchema) as object,
				execute: async (input) => {
					try {
						const data = await request<{ runAssistantTool: string }>(RUN_ASSISTANT_TOOL_QUERY, {
							name: spec.name,
							input: JSON.stringify(input ?? {}),
						});
						return data.runAssistantTool;
					} catch (err) {
						throw new Error(errorMessage(err));
					}
				},
				// Only read-only tools are exposed; the backend enforces it too.
				annotations: { readOnlyHint: true, untrustedContentHint: spec.untrustedContent },
			},
			{ signal },
		);
		count++;
	}
	return count;
}
