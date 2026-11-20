import { defineEnvVars } from '@sveltejs/kit/env';

// Kit 3 only substitutes `%sveltekit.env.*%` in app.html for variables declared here.
// vite.config.ts derives these from the build env (Clerk's preload URLs and the GraphQL
// preconnect origin) and sets them on process.env before Kit reads the env. They are
// static so the values are fixed at build time, as they were under Kit 2.
export const variables = defineEnvVars({
	PUBLIC_CLERK_ORIGIN: { public: true, static: true },
	PUBLIC_CLERK_SCRIPT_URL: { public: true, static: true },
	PUBLIC_GRAPHQL_ORIGIN: { public: true, static: true },
});
