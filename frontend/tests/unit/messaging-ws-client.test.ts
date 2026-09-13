import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateClient, mockSubscribe, mockDispose, mockGetAuthToken } = vi.hoisted(() => ({
	mockCreateClient: vi.fn(),
	mockSubscribe: vi.fn(),
	mockDispose: vi.fn(),
	mockGetAuthToken: vi.fn(),
}));

vi.mock('graphql-ws', () => ({
	createClient: mockCreateClient,
}));

vi.mock('$lib/queries/client', () => ({
	getAuthToken: mockGetAuthToken,
}));

// browser flag is already mocked true in tests/setup.ts

let capturedOptions: any;

beforeEach(() => {
	vi.clearAllMocks();
	vi.resetModules();
	capturedOptions = undefined;
	mockCreateClient.mockImplementation((opts: any) => {
		capturedOptions = opts;
		return { subscribe: mockSubscribe, dispose: mockDispose, iterate: vi.fn(), terminate: vi.fn() };
	});
	mockGetAuthToken.mockResolvedValue('jwt-abc');
	mockSubscribe.mockImplementation((_payload: any, sink: any) => {
		(sink as any).__sink = true;
		return () => {};
	});
});

describe('httpUrlToWs', () => {
	it('maps http/https to ws/wss and leaves ws untouched', async () => {
		const { httpUrlToWs } = await import('$lib/messaging/ws-client.svelte');
		expect(httpUrlToWs('http://localhost:8080/graphql')).toBe('ws://localhost:8080/graphql');
		expect(httpUrlToWs('https://api.example.com/graphql')).toBe('wss://api.example.com/graphql');
		expect(httpUrlToWs('wss://api.example.com/graphql')).toBe('wss://api.example.com/graphql');
	});
});

describe('getWsClient', () => {
	it('creates the client once (singleton) with lazy + infinite retry', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		const a = mod.getWsClient();
		const b = mod.getWsClient();
		expect(a).toBe(b);
		expect(mockCreateClient).toHaveBeenCalledTimes(1);
		expect(capturedOptions.lazy).toBe(true);
		expect(capturedOptions.retryAttempts).toBe(Infinity);
	});

	it('connectionParams resolves the Clerk token under authToken', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		const params = await capturedOptions.connectionParams();
		expect(params).toEqual({ authToken: 'jwt-abc' });
	});

	it('connectionParams sends an empty string when there is no token', async () => {
		mockGetAuthToken.mockResolvedValue(null);
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		expect(await capturedOptions.connectionParams()).toEqual({ authToken: '' });
	});

	it('on.connected / on.closed drive wsStatus', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		capturedOptions.on.connecting();
		expect(mod.wsStatus.value).toBe('connecting');
		capturedOptions.on.connected();
		expect(mod.wsStatus.value).toBe('connected');
		capturedOptions.on.closed();
		expect(mod.wsStatus.value).toBe('closed');
	});
});

describe('subscribeGraphql', () => {
	it('passes the payload straight through and unwraps result.data', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		const next = vi.fn();
		mod.subscribeGraphql({ query: 'sub X', variables: { a: 1 } }, { next });

		expect(mockSubscribe).toHaveBeenCalledWith(
			{ query: 'sub X', variables: { a: 1 } },
			expect.objectContaining({ next: expect.any(Function) }),
		);
		const sink = mockSubscribe.mock.calls[0][1];
		sink.next({ data: { hello: 'world' } });
		sink.next({ data: null });
		expect(next).toHaveBeenCalledTimes(1);
		expect(next).toHaveBeenCalledWith({ hello: 'world' });
	});

	it('returns the disposer from client.subscribe', async () => {
		const disposer = vi.fn();
		mockSubscribe.mockReturnValue(disposer);
		const mod = await import('$lib/messaging/ws-client.svelte');
		const off = mod.subscribeGraphql({ query: 'sub' }, { next: vi.fn() });
		off();
		expect(disposer).toHaveBeenCalled();
	});
});

describe('disposeWsClient', () => {
	it('disposes and lets the next getWsClient build a fresh client', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		mod.disposeWsClient();
		expect(mockDispose).toHaveBeenCalled();
		expect(mod.wsStatus.value).toBe('closed');
		mod.getWsClient();
		expect(mockCreateClient).toHaveBeenCalledTimes(2);
	});
});
