// Architecture rules only (not a style linter). Rules F1-F6 and F8; F7 (cycles) is in .dependency-cruiser.cjs.
// Run: pnpm run lint:arch   (bulk suppressions in eslint-suppressions.json hold today's violations; it may only shrink)
import tsParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';

const parsers = [
	{ files: ['**/*.ts', '**/*.js'], languageOptions: { parser: tsParser } },
	{
		files: ['**/*.svelte'],
		languageOptions: { parser: svelteParser, parserOptions: { parser: tsParser } },
	},
];

const TRANSPORT = ['graphqlRequest', 'graphqlRequestAnonymous', 'graphqlClient'];
const CLIENT_MODULES = ['#lib/queries/client', '#lib/queries/client.js', '**/queries/client', '**/queries/client.js'];
const UI = [
	'src/lib/components/**/*.svelte',
	'src/lib/components/**/*.ts',
	'src/routes/**/*.svelte',
	'src/routes/**/*.ts',
];
const NON_UI_DIRS = [
	'utils',
	'queries',
	'stores',
	'services',
	'messaging',
	'auth',
	'data',
	'theme',
	'onboarding',
	'contribute',
];
const NON_UI_LIB = [
	...NON_UI_DIRS.flatMap((d) => [`src/lib/${d}/**/*.ts`, `src/lib/${d}/**/*.svelte`]),
	'src/lib/*.ts',
];
const SHADCN = ['src/lib/components/ui/**'];
const TESTS = ['tests/**', '**/*.test.ts', 'src/**/*.d.ts'];
const SRC = ['src/**/*.ts', 'src/**/*.js', 'src/**/*.svelte'];

// Import restrictions, one entry per rule so blocks can combine them.
const F1 = {
	paths: [
		{
			name: '@tanstack/svelte-query',
			importNames: ['createQuery', 'createMutation', 'createInfiniteQuery', 'createQueries', 'useQueryClient'],
			message: 'F1: components use the useX hooks in src/lib/queries, not TanStack Query directly.',
		},
	],
};
const F2 = {
	patterns: [
		{
			group: CLIENT_MODULES,
			importNames: TRANSPORT,
			message: 'F2: components never call the GraphQL transport; use a useX hook.',
		},
	],
};
const F5 = {
	patterns: [
		{
			group: ['svelte-clerk', 'svelte-clerk/*'],
			message: 'F5: import svelte-clerk only in src/lib/auth (the facade).',
		},
	],
};
const F8_ROUTES = {
	patterns: [{ group: ['**/routes/**', '$routes/**'], message: 'F8: src/lib must not import from src/routes.' }],
};
const F8_COMPONENTS = {
	patterns: [
		{
			group: ['**/components/**/*.svelte', '#lib/components/**'],
			message: 'F8: non-component lib code must not import components.',
		},
	],
};
const imports = (...parts) => ({
	paths: parts.flatMap((p) => p.paths ?? []),
	patterns: parts.flatMap((p) => p.patterns ?? []),
});
const COMPONENTS = ['src/lib/components/**/*.svelte', 'src/lib/components/**/*.ts'];
const ROUTES = ['src/routes/**/*.svelte', 'src/routes/**/*.ts'];

const hexOrRgb = String.raw`#[0-9a-fA-F]{3,8}\b|\brgba?\(`;

// Two files carry `eslint-disable @typescript-eslint/no-explicit-any`; define the rule as a no-op so ESLint accepts them.
const noopAny = { plugins: { '@typescript-eslint': { rules: { 'no-explicit-any': { create: () => ({}) } } } } };

export default [
	noopAny,
	{ linterOptions: { reportUnusedDisableDirectives: 'off' } },
	{ ignores: ['.svelte-kit/**', 'build/**', 'coverage/**', 'node_modules/**', 'demo/**', 'static/**', ...TESTS] },
	...parsers,
	{
		files: SRC,
		rules: {
			// F3: TanStack Query v5+ is `isPending`; `isLoading` is the older meaning.
			// F6: query keys come from `queryKeys` (src/lib/queries/keys.ts); never wipe the whole cache.
			'no-restricted-syntax': [
				'error',
				{ selector: "MemberExpression[property.name='isLoading']", message: 'F3: use isPending, not isLoading.' },
				{
					selector: "Property[key.name='queryKey'] > ArrayExpression",
					message: 'F6: build query keys with queryKeys (src/lib/queries/keys.ts), not an inline array.',
				},
				{
					selector: "CallExpression[callee.property.name='clear'][callee.object.name=/[qQ]ueryClient|cache/]",
					message: 'F6: do not clear the whole query cache; invalidate a specific key from queryKeys.',
				},
			],
		},
	},
	// no-restricted-imports: flat config replaces a rule's options per matching block (it does not merge), so every
	// block below lists all of the restrictions that apply to its files. Order: general first, specific later.
	{ files: SRC, rules: { 'no-restricted-imports': ['error', imports(F5)] } },
	{
		files: COMPONENTS,
		ignores: [...SHADCN, 'src/lib/components/auth/**'],
		rules: { 'no-restricted-imports': ['error', imports(F1, F2, F5, F8_ROUTES)] },
	},
	{
		files: ['src/lib/components/auth/**/*.svelte', 'src/lib/components/auth/**/*.ts'],
		rules: { 'no-restricted-imports': ['error', imports(F1, F2, F8_ROUTES)] },
	},
	{
		files: ROUTES,
		ignores: ['src/routes/+layout.svelte'],
		rules: { 'no-restricted-imports': ['error', imports(F1, F2, F5)] },
	},
	{ files: ['src/routes/+layout.svelte'], rules: { 'no-restricted-imports': ['error', imports(F1, F2)] } },
	{
		files: NON_UI_LIB,
		ignores: ['src/lib/auth/**'],
		rules: { 'no-restricted-imports': ['error', imports(F5, F8_ROUTES, F8_COMPONENTS)] },
	},
	{
		files: ['src/lib/auth/**/*.ts', 'src/lib/auth/**/*.svelte'],
		rules: { 'no-restricted-imports': ['error', imports(F8_ROUTES, F8_COMPONENTS)] },
	},
];
