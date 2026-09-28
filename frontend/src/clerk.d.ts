interface ClerkSession {
	getToken(): Promise<string | null>;
}

interface ClerkInstance {
	session: ClerkSession | null;
}

declare global {
	interface Window {
		Clerk?: ClerkInstance;
	}
}

export {};
