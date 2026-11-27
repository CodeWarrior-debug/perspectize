// Fails when the rich-text editor (Tiptap/ProseMirror) is part of the JavaScript every
// page loads up front. The editor is large and only needed once someone opens it, and a
// chunk-grouping change can pull it into first load without any source import changing,
// so only the built output can show it. Run after `vite build`.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const build = resolve(process.argv[2] ?? 'build');
const html = readFileSync(join(build, 'index.html'), 'utf8');

// Static `import`/`export ... from` specifiers only: `import(...)` is loaded on demand.
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;

const queue = [...html.matchAll(/["']([^"']*_app\/immutable\/[^"']+\.js)["']/g)].map(([, path]) =>
	join(build, path.replace(/^(\.\/|\/)/, '')),
);
const seen = new Set();
while (queue.length) {
	const file = normalize(queue.pop());
	if (seen.has(file) || !existsSync(file)) continue;
	seen.add(file);
	for (const [, spec] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
		queue.push(join(dirname(file), spec));
	}
}

if (seen.size === 0) {
	console.error(`first-load check: no scripts found from ${build}/index.html`);
	process.exit(1);
}

const kb = (files) => Math.round(files.reduce((sum, file) => sum + statSync(file).size, 0) / 1024);
const editor = [...seen].filter((file) => readFileSync(file, 'utf8').includes('ProseMirror'));

console.log(`first-load check: ${seen.size} scripts, ${kb([...seen])} KB up front`);
if (editor.length) {
	console.error('The editor is loaded up front by:');
	for (const file of editor) console.error(`  ${relative(build, file)} (${kb([file])} KB)`);
	process.exit(1);
}
