// F7: no import cycles in src. Known cycles are in .dependency-cruiser-known-violations.json (it may only shrink).
// Run: pnpm run lint:arch   (ESLint rules F1-F6 and F8 are in eslint.config.js)
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: 'no-circular',
			severity: 'error',
			comment: 'F7: modules must not import each other in a cycle (value cycles; type-only imports are ignored).',
			from: {},
			to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
		},
	],
	options: {
		doNotFollow: { path: 'node_modules' },
		exclude: { path: ['\\.svelte-kit', '\\.test\\.ts$', '/tests/'] },
		tsPreCompilationDeps: false,
		tsConfig: { fileName: 'tsconfig.json' },
		enhancedResolveOptions: {
			exportsFields: ['exports'],
			conditionNames: ['import', 'require', 'node', 'default', 'types'],
		},
		extraExtensionsToScan: ['.svelte'],
	},
};
