#!/usr/bin/env node
// Perspectize-specific: start THIS checkout's backend and frontend on a verification
// slot's ports, using the main checkout's env files (a worktree has none), and record
// both with the agent registry so `verify-release` stops exactly these processes.
//
//   node .claude/scripts/verification-servers.mjs --backend-port 8080 --frontend-port 5173
//
// Take the slot first (`agent-registry.mjs verify-acquire`); see the pr-verification skill.
// Secrets are passed to the child processes only, never printed.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCheckout } from '../agent-registry/agent-registry.mjs';

const REGISTRY = fileURLToPath(new URL('../agent-registry/agent-registry.mjs', import.meta.url));

function arg(name) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : undefined;
}

/** KEY=VALUE lines of an env file, for a child process's environment. Never logged. */
function readEnvFile(file) {
	const env = {};
	if (!fs.existsSync(file)) return env;
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
		if (!m) continue;
		let v = m[2];
		if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
		else v = v.replace(/\s+#.*$/, '');
		env[m[1]] = v;
	}
	return env;
}

function listening(port) {
	return new Promise((resolve) => {
		const s = net.connect({ port, host: '127.0.0.1' });
		s.setTimeout(500, () => (s.destroy(), resolve(false)));
		s.once('connect', () => (s.destroy(), resolve(true)));
		s.once('error', () => resolve(false));
	});
}

async function waitForPort(port, child, seconds, label) {
	for (let i = 0; i < seconds * 2; i++) {
		if (child.exitCode !== null) throw new Error(`${label} exited early (code ${child.exitCode}); see its log`);
		if (await listening(port)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`${label} did not listen on :${port} within ${seconds}s; see its log`);
}

const started = [];

function startDetached(cmd, args, { cwd, env, log }) {
	const out = fs.openSync(log, 'a');
	const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', out, out], windowsHide: true });
	child.unref();
	started.push(child);
	return child;
}

/** On failure, stop what this run started (each child leads its own process group). */
function stopStarted() {
	for (const child of started) {
		try {
			if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
			else process.kill(-child.pid, 'SIGTERM');
		} catch {
			/* already gone */
		}
	}
}

async function main() {
	const backendPort = Number(arg('backend-port'));
	const frontendPort = Number(arg('frontend-port'));
	if (!backendPort || !frontendPort) throw new Error('usage: --backend-port N --frontend-port N (from verify-acquire)');
	const co = findCheckout(process.cwd());
	if (!co) throw new Error('run this from inside a checkout');
	for (const port of [backendPort, frontendPort]) {
		if (await listening(port)) throw new Error(`:${port} is already in use: the slot isn't free (check agent-registry status)`);
	}
	const logs = path.join(co.root, 'logs');
	fs.mkdirSync(logs, { recursive: true });
	const secrets = (dir) => readEnvFile(path.join(co.mainRoot, dir, '.env'));

	// Backend: build this checkout's server, run it on the slot's port.
	const backendDir = path.join(co.root, 'backend');
	const bin = path.join(backendDir, 'tmp', process.platform === 'win32' ? 'verify-server.exe' : 'verify-server');
	console.log(`building backend from ${backendDir} ...`);
	execFileSync('go', ['build', '-o', bin, './cmd/server'], { cwd: backendDir, stdio: 'inherit' });
	const backend = startDetached(bin, [], {
		cwd: backendDir,
		env: { ...process.env, ...secrets('backend'), SERVER_PORT: String(backendPort) },
		log: path.join(logs, 'verify-backend.log'),
	});

	// Frontend: this checkout's code, the main checkout's env (envDir), pointed at the slot's backend.
	const frontendDir = path.join(co.root, 'frontend');
	if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
		console.log('installing frontend dependencies ...');
		execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--frozen-lockfile'], {
			cwd: frontendDir,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});
	}
	const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perspectize-verify-'));
	const wrapper = path.join(wrapperDir, 'vite.config.mjs');
	const base = path.join(frontendDir, 'vite.config.ts').replace(/\\/g, '/');
	fs.writeFileSync(
		wrapper,
		`import base from ${JSON.stringify(base)};
export default {
	...base,
	envDir: ${JSON.stringify(path.join(co.mainRoot, 'frontend').replace(/\\/g, '/'))},
	server: { ...(base.server ?? {}), port: ${frontendPort}, strictPort: true },
};
`,
	);
	const frontend = startDetached(
		process.execPath,
		[path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--config', wrapper, '--port', String(frontendPort), '--strictPort'],
		{
			cwd: frontendDir,
			// A process variable beats .env files in vite, so the slot's backend wins.
			env: { ...process.env, VITE_GRAPHQL_URL: `http://localhost:${backendPort}/graphql` },
			log: path.join(logs, 'verify-frontend.log'),
		},
	);

	await waitForPort(backendPort, backend, 120, 'backend');
	await waitForPort(frontendPort, frontend, 120, 'frontend');
	for (const [kind, child] of [
		['backend', backend],
		['frontend', frontend],
	]) {
		execFileSync(process.execPath, [REGISTRY, 'verify-started', kind, '--pid', String(child.pid)], { stdio: 'inherit' });
	}
	console.log(`backend   http://localhost:${backendPort}/graphql   (pid ${backend.pid}, log logs/verify-backend.log)`);
	console.log(`frontend  http://localhost:${frontendPort}/          (pid ${frontend.pid}, log logs/verify-frontend.log)`);
	console.log('serving this checkout:', co.root);
}

main().catch((err) => {
	stopStarted();
	console.error(`verification-servers: ${err.message}`);
	process.exit(1);
});
