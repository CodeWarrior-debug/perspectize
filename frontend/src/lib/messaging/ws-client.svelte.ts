import { browser } from '$app/environment';
import { createClient, type Client } from 'graphql-ws';
import { getAuthToken } from '$lib/queries/client';

export const wsStatus = $state({ value: 'closed' as 'connecting' | 'connected' | 'closed' });

export function httpUrlToWs(httpUrl: string): string {
	if (httpUrl.startsWith('https://')) return 'wss://' + httpUrl.slice('https://'.length);
	if (httpUrl.startsWith('http://')) return 'ws://' + httpUrl.slice('http://'.length);
	return httpUrl;
}

export function wsEndpoint(): string {
	const http = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';
	return httpUrlToWs(http);
}

let client: Client | null = null;

export function getWsClient(): Client {
	if (!browser) throw new Error('graphql-ws client is browser-only');
	if (client) return client;
	client = createClient({
		url: wsEndpoint(),
		lazy: true,
		retryAttempts: Infinity,
		connectionParams: async () => ({ authToken: (await getAuthToken()) ?? '' }),
		on: {
			connecting: () => {
				wsStatus.value = 'connecting';
			},
			connected: () => {
				wsStatus.value = 'connected';
			},
			closed: () => {
				wsStatus.value = 'closed';
			},
		},
	});
	return client;
}

export function subscribeGraphql<T>(
	payload: { query: string; variables?: Record<string, unknown> },
	handlers: { next: (data: T) => void; error?: (err: unknown) => void; complete?: () => void },
): () => void {
	let c: Client;
	try {
		c = getWsClient();
	} catch {
		return () => {};
	}
	return c.subscribe(payload, {
		next: (result: { data?: unknown }) => {
			if (result.data != null) handlers.next(result.data as T);
		},
		error: (err) => handlers.error?.(err),
		complete: () => handlers.complete?.(),
	});
}

export function disposeWsClient(): void {
	if (client) {
		client.dispose();
		client = null;
	}
	wsStatus.value = 'closed';
}
