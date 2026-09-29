// Kept free of svelte-clerk imports so plain modules (the GraphQL client, the
// WebSocket client) can use it; components import useAuthState directly from
// '$lib/auth/useAuthState'.
export { DEMO_MODE, DEMO_PERSONAS, demoSession, type DemoPersona } from './demo.svelte';
export { getAuthToken } from './token';
