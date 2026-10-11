#!/usr/bin/env node
// Deletes every *.map file under a build directory so source maps are never served publicly
// (observability plan, Task 11). Runs as the tail of `pnpm run build`.
//
// Usage: node scripts/strip-sourcemaps.mjs [dir]   (dir defaults to `build`)
//
// Only the .map files need removing: maps are emitted with build.sourcemap = 'hidden',
// which suppresses the `//# sourceMappingURL=` comment in the JS/CSS, so there is no
// dangling reference to strip from the remaining files.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'build');

if (!existsSync(dir)) {
	console.log(`strip-sourcemaps: ${dir} does not exist, nothing to do`);
	process.exit(0);
}

let removed = 0;
for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
	if (entry.isFile() && entry.name.endsWith('.map')) {
		rmSync(join(entry.parentPath, entry.name));
		removed++;
	}
}

console.log(`strip-sourcemaps: removed ${removed} .map file(s) from ${dir}`);
