import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Kit 3 exposes only variables declared in src/env.ts. svelte-clerk and app.html read these
// through the public env, so a missing declaration reads as undefined at runtime: without the
// Clerk key the root layout never leaves "Loading...", and the build still passes.
const envDeclarations = readFileSync(resolve(process.cwd(), 'src/env.ts'), 'utf8');
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

const REQUIRED = [
	// svelte-clerk's fallback when the layout passes no publishableKey (Sevalla defines this name).
	'PUBLIC_CLERK_PUBLISHABLE_KEY',
	// app.html placeholders: clerk-js preload and the GraphQL preconnect.
	'PUBLIC_CLERK_ORIGIN',
	'PUBLIC_CLERK_SCRIPT_URL',
	'PUBLIC_GRAPHQL_ORIGIN',
] as const;

describe('public env declarations (Kit 3)', () => {
	it.each(REQUIRED)('declares %s as a public static variable', (name) => {
		expect(envDeclarations).toMatch(new RegExp(`${name}:\\s*\\{[^}]*public:\\s*true[^}]*static:\\s*true`));
	});

	it.each(REQUIRED)('vite.config.ts sets %s from the build env', (name) => {
		expect(viteConfig).toContain(`process.env.${name} =`);
	});

	it('takes the Clerk key from the PUBLIC_ name Sevalla defines, not only VITE_', () => {
		expect(viteConfig).toMatch(/PUBLIC_CLERK_PUBLISHABLE_KEY\s*=[\s\S]*?clerkBuildEnv\.PUBLIC_CLERK_PUBLISHABLE_KEY/);
	});
});
