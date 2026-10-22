import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SCRIPT = resolve(__dirname, '../../scripts/strip-sourcemaps.mjs');

describe('scripts/strip-sourcemaps.mjs', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'strip-sourcemaps-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('deletes nested .map files and keeps everything else', async () => {
		const nested = join(dir, '_app', 'immutable', 'chunks');
		mkdirSync(nested, { recursive: true });
		const kept = [
			join(dir, 'index.html'),
			join(dir, '_app', 'immutable', 'entry.js'),
			join(nested, 'chunk-abc.js'),
			join(nested, 'style.css'),
		];
		const maps = [
			join(dir, '_app', 'immutable', 'entry.js.map'),
			join(nested, 'chunk-abc.js.map'),
			join(nested, 'style.css.map'),
		];
		for (const f of [...kept, ...maps]) writeFileSync(f, 'x');

		const { stdout } = await run(process.execPath, [SCRIPT, dir]);

		for (const f of maps) expect(existsSync(f)).toBe(false);
		for (const f of kept) expect(existsSync(f)).toBe(true);
		expect(stdout).toContain('removed 3 .map file(s)');
	});

	it('exits 0 when the directory does not exist', async () => {
		const missing = join(dir, 'does-not-exist');
		const { stdout } = await run(process.execPath, [SCRIPT, missing]);
		expect(stdout).toContain('does not exist');
	});
});
