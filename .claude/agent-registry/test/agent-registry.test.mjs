// Tests for agent-registry.mjs. Run: node --test .claude/agent-registry/test/
// Each test builds a throwaway git repo (plus linked worktrees) in the OS temp
// dir and stands in real child processes for "live" Claude sessions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	canonicalPath,
	commandTargets,
	findCheckout,
	isClaudeCli,
	isWriteCommand,
	mergeHooks,
	pathKey,
} from '../agent-registry.mjs';

const SCRIPT = fileURLToPath(new URL('../agent-registry.mjs', import.meta.url));
const children = [];
let tmp;

before(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-registry-test-'));
});

after(() => {
	for (const c of children) c.kill();
	fs.rmSync(tmp, { recursive: true, force: true });
});

function git(cwd, ...args) {
	return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** A repo with one commit and `worktrees` linked worktrees under .claude/worktrees/. */
function makeRepo(name, worktrees = 1, config = null) {
	const root = path.join(tmp, name);
	fs.mkdirSync(root, { recursive: true });
	git(root, 'init', '-q', '-b', 'main');
	git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
	if (config) {
		fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
		fs.writeFileSync(path.join(root, '.claude', 'agent-registry.config.json'), JSON.stringify(config));
	}
	const wts = [];
	for (let i = 1; i <= worktrees; i++) {
		const wt = path.join(root, '.claude', 'worktrees', String(i));
		git(root, 'worktree', 'add', '-q', '-b', `wt-${i}`, wt);
		wts.push(canonicalPath(wt));
	}
	return { root: canonicalPath(root), wts };
}

/** A live stand-in for a Claude process. */
function liveProcess(extraArgs = []) {
	const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', ...extraArgs], { stdio: 'ignore' });
	children.push(child);
	return child.pid;
}

function deadPid() {
	const out = execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
	return Number(out.trim());
}

function run(args, { cwd, pid, stdin } = {}) {
	try {
		const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
			cwd,
			input: stdin ? JSON.stringify(stdin) : '',
			env: { ...process.env, AGENT_REGISTRY_TEST_PID: pid ? String(pid) : '', CLAUDE_PROJECT_DIR: '', CLAUDE_CODE_REMOTE: '' },
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return { code: 0, stdout };
	} catch (err) {
		return { code: err.status, stdout: String(err.stdout), stderr: String(err.stderr) };
	}
}

function hook(event, input, pid) {
	const out = run(['hook', event], { cwd: input.cwd, pid, stdin: input }).stdout;
	return out ? JSON.parse(out) : null;
}

function claims(root) {
	const text = fs.readFileSync(path.join(root, 'LOCAL_AGENT_CHECKOUTS.md'), 'utf8');
	const json = text.slice(text.indexOf('<!-- agent-registry-data') + 24, text.lastIndexOf('-->'));
	return JSON.parse(json).claims;
}

function write(session, cwd, file, pid) {
	return hook('pre-tool-use', { session_id: session, cwd, tool_name: 'Write', tool_input: { file_path: file } }, pid);
}

async function freePort() {
	return new Promise((resolve) => {
		const s = net.createServer().listen(0, '127.0.0.1', () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

// --- paths ------------------------------------------------------------------

test('a worktree and its main checkout resolve to the same main root', () => {
	const { root, wts } = makeRepo('paths');
	assert.deepEqual(findCheckout(path.join(wts[0], 'src', 'new-file.ts')), { root: wts[0], mainRoot: root });
	assert.deepEqual(findCheckout(root), { root, mainRoot: root });
	assert.equal(findCheckout(os.tmpdir()), null);
});

test('one folder spelled two ways gives one key on case-insensitive filesystems', () => {
	const { root } = makeRepo('casing');
	if (process.platform === 'linux') return;
	assert.equal(pathKey(canonicalPath(root.toUpperCase())), pathKey(canonicalPath(root)));
});

// --- checkout claims ----------------------------------------------------------

test('the hooks do nothing until the repo is initialised', () => {
	const { wts } = makeRepo('inactive');
	assert.equal(write('a', wts[0], path.join(wts[0], 'x.txt'), liveProcess()), null);
});

test('a first write claims the checkout; another live session is denied there', () => {
	const { root, wts } = makeRepo('claims', 2);
	run(['init'], { cwd: root });
	const a = liveProcess();
	const b = liveProcess();
	assert.equal(write('A', wts[0], path.join(wts[0], 'x.txt'), a), null);
	assert.deepEqual(
		claims(root).map((c) => [c.session, c.checkout, c.branch]),
		[['A', wts[0], 'wt-1']],
	);

	const denied = write('B', wts[0], path.join(wts[0], 'y.txt'), b);
	assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
	assert.match(denied.hookSpecificOutput.permissionDecisionReason, /claimed by another live Claude session/);

	assert.equal(write('B', wts[1], path.join(wts[1], 'y.txt'), b), null, 'a free worktree is fine');
	assert.equal(write('A', wts[0], path.join(wts[0], 'z.txt'), a), null, 'the owner keeps writing');
});

test("a dead session's claim is taken over, not obeyed", () => {
	const { root, wts } = makeRepo('dead-owner');
	run(['init'], { cwd: root });
	write('A', wts[0], path.join(wts[0], 'x.txt'), deadPid());
	assert.equal(write('B', wts[0], path.join(wts[0], 'x.txt'), liveProcess()), null);
	assert.deepEqual(claims(root).map((c) => c.session), ['B']);
});

test('SessionEnd releases every claim the session holds', () => {
	const { root, wts } = makeRepo('end', 2);
	run(['init'], { cwd: root });
	const a = liveProcess();
	write('A', wts[0], path.join(wts[0], 'x'), a);
	write('A', wts[1], path.join(wts[1], 'x'), a);
	hook('session-end', { session_id: 'A', cwd: wts[0], reason: 'other' }, a);
	assert.deepEqual(claims(root), []);
});

test('SessionStart cleans dead entries and reports claims into context', () => {
	const { root, wts } = makeRepo('start', 2);
	run(['init'], { cwd: root });
	write('A', wts[0], path.join(wts[0], 'x'), deadPid());
	write('B', wts[1], path.join(wts[1], 'x'), liveProcess());
	const out = hook('session-start', { session_id: 'C', cwd: wts[1], source: 'startup' }, liveProcess());
	const ctx = out.hookSpecificOutput.additionalContext;
	assert.match(ctx, /1 claimed checkout/);
	assert.match(ctx, /claimed by another live session B/);
	assert.match(ctx, /released stale claim/);
});

test('editing the status files by hand is denied', () => {
	const { root } = makeRepo('status-files');
	run(['init'], { cwd: root });
	const out = write('A', root, path.join(root, 'LOCAL_AGENT_CHECKOUTS.md'), liveProcess());
	assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('Bash: reads claim nothing, writes claim the checkout', () => {
	const { root, wts } = makeRepo('bash');
	run(['init'], { cwd: root });
	const bash = (command, session, pid) =>
		hook('pre-tool-use', { session_id: session, cwd: wts[0], tool_name: 'Bash', tool_input: { command } }, pid);
	const a = liveProcess();
	assert.equal(bash('git log --oneline -3', 'A', a), null);
	assert.deepEqual(claims(root), []);
	assert.equal(bash('git commit -m x', 'A', a), null);
	assert.deepEqual(claims(root).map((c) => c.checkout), [wts[0]]);
	const denied = bash(`echo hi > ${wts[0]}/f.txt`, 'B', liveProcess());
	assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
});

test('simultaneous claims are all kept (the lock serialises them)', async () => {
	const { root, wts } = makeRepo('race', 8);
	run(['init'], { cwd: root });
	const pids = wts.map(() => liveProcess());
	await Promise.all(
		wts.map(
			(wt, i) =>
				new Promise((resolve) => {
					const c = spawn(process.execPath, [SCRIPT, 'hook', 'pre-tool-use'], {
						env: { ...process.env, AGENT_REGISTRY_TEST_PID: String(pids[i]), CLAUDE_PROJECT_DIR: '' },
						stdio: ['pipe', 'ignore', 'ignore'],
					});
					c.stdin.end(JSON.stringify({ session_id: `S${i}`, cwd: wt, tool_name: 'Write', tool_input: { file_path: `${wt}/f` } }));
					c.on('exit', resolve);
				}),
		),
	);
	assert.equal(claims(root).length, 8);
});

test('a lock left by a dead process is broken', () => {
	const { root, wts } = makeRepo('stale-lock');
	run(['init'], { cwd: root });
	fs.mkdirSync(path.join(root, '.agent-registry.lock'));
	fs.writeFileSync(path.join(root, '.agent-registry.lock', 'owner.json'), JSON.stringify({ pid: deadPid(), at: Date.now() }));
	assert.equal(write('A', wts[0], path.join(wts[0], 'x'), liveProcess()), null);
	assert.equal(claims(root).length, 1);
});

// --- Bash heuristic -----------------------------------------------------------

test('isWriteCommand separates writes from reads', () => {
	for (const w of [
		'git commit -m "x"',
		'git -C /a/b checkout -b new',
		'git stash push -u',
		'echo x > out.txt',
		'cat a >> b',
		'rm -f file',
		'mkdir -p dir',
		'sed -i "" s/a/b/ f',
		'pnpm install',
		'go mod tidy',
		'prettier --write src',
		'make graphql-gen',
	]) {
		assert.equal(isWriteCommand(w), true, w);
	}
	for (const r of ['git log', 'git status', 'git diff origin/main', 'ls -la', 'pnpm run test:run 2>&1 | tail', 'go test ./... > /dev/null', 'grep -rn x src']) {
		assert.equal(isWriteCommand(r), false, r);
	}
});

test('commandTargets follows a leading cd and absolute paths', () => {
	assert.deepEqual(commandTargets('cd /a/b && git commit -m x', '/cwd'), [path.resolve('/a/b'), '/a/b']);
	assert.deepEqual(commandTargets('git -C /repo/wt add .', '/cwd'), ['/cwd', '/repo/wt']);
});

test('git worktree add does not claim the checkout that will contain the new worktree', () => {
	// The destination does not exist yet, so findCheckout would climb to the main checkout.
	const dest = path.join(os.tmpdir(), 'agent-registry-no-such-dir', '.claude', 'worktrees', 'new');
	assert.deepEqual(commandTargets(`git worktree add -b topic ${dest} origin/main`, '/cwd'), ['/cwd']);
	// An existing path named elsewhere in the same command is still a target.
	const here = os.tmpdir();
	assert.deepEqual(commandTargets(`git -C ${here} worktree add ${dest}`, '/cwd'), ['/cwd', here]);
});

test('isClaudeCli spots the Claude CLI, not scripts under a .claude folder', () => {
	assert.equal(isClaudeCli('node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js'), true);
	assert.equal(isClaudeCli('node /opt/homebrew/bin/claude --resume'), true);
	assert.equal(isClaudeCli('node /repo/.claude/scripts/verification-servers.mjs start'), false);
	assert.equal(isClaudeCli('node /repo/.claude/agent-registry/agent-registry.mjs status'), false);
});

// --- verification slots -------------------------------------------------------

async function verificationRepo(name) {
	const backendPort = await freePort();
	const frontendPort = await freePort();
	const repo = makeRepo(name, 2, {
		slots: [{ id: 1, backendPort, frontendPort, enabled: true }],
		devServerProcessPatterns: ['fake-vite-dev-server'],
	});
	run(['init'], { cwd: repo.root });
	return { ...repo, backendPort, frontendPort };
}

test('one verification at a time; release frees the slot', async () => {
	const { wts } = await verificationRepo('verify');
	const a = liveProcess();
	const b = liveProcess();
	hook('session-start', { session_id: 'A', cwd: wts[0], source: 'startup' }, a);
	hook('session-start', { session_id: 'B', cwd: wts[1], source: 'startup' }, b);

	const got = run(['verify-acquire'], { cwd: wts[0], pid: a });
	assert.equal(got.code, 0);
	assert.match(got.stdout, /result: ACQUIRED/);

	const busy = run(['verify-acquire'], { cwd: wts[1], pid: b });
	assert.equal(busy.code, 2);
	assert.match(busy.stdout, /"kind":"agent"/);

	run(['verify-release'], { cwd: wts[0], pid: a });
	assert.equal(run(['verify-acquire'], { cwd: wts[1], pid: b }).code, 0);
});

test('a slot held by a dead session is released automatically', async () => {
	const { wts } = await verificationRepo('verify-dead');
	const dead = deadPid();
	hook('session-start', { session_id: 'A', cwd: wts[0], source: 'startup' }, liveProcess());
	run(['verify-acquire', '--session', 'A'], { cwd: wts[0], pid: dead });
	assert.equal(run(['verify-acquire'], { cwd: wts[1], pid: liveProcess() }).code, 0);
});

test('an unregistered process on the ports: wait asks for a ping, then takes over a dev server', async () => {
	const { wts, backendPort } = await verificationRepo('verify-takeover');
	const listener = spawn(
		process.execPath,
		['-e', `require('net').createServer().listen(${backendPort}, '127.0.0.1')`, 'fake-vite-dev-server'],
		{ stdio: 'ignore' },
	);
	children.push(listener);
	await new Promise((r) => setTimeout(r, 400));
	const me = liveProcess();
	hook('session-start', { session_id: 'W', cwd: wts[0], source: 'startup' }, me);

	const busy = run(['verify-acquire'], { cwd: wts[0], pid: me });
	assert.equal(busy.code, 2);
	assert.match(busy.stdout, /"kind":"unknown"/);

	const ping = run(['verify-wait', '--poll-seconds', '1', '--max-minutes', '1'], { cwd: wts[0], pid: me });
	assert.equal(ping.code, 3);
	assert.match(ping.stdout, /NEEDS_PING/);

	const took = run(['verify-wait', '--takeover-after', '0', '--poll-seconds', '1', '--max-minutes', '1'], { cwd: wts[0], pid: me });
	assert.equal(took.code, 0, took.stdout + took.stderr);
	assert.match(took.stdout, /ACQUIRED/);
});

test('a hold blocks a takeover', async () => {
	const { root, wts } = await verificationRepo('verify-hold');
	run(['hold', '--slot', '1', '--minutes', '5'], { cwd: root });
	const r = run(['verify-acquire'], { cwd: wts[0], pid: liveProcess() });
	assert.equal(r.code, 2);
	assert.match(r.stdout, /"kind":"hold"/);
	run(['unhold', '--slot', '1'], { cwd: root });
	assert.equal(run(['verify-acquire'], { cwd: wts[0], pid: liveProcess() }).code, 0);
});

test('VERIFICATION_AVAILABLE reflects the slot state', async () => {
	const { root, wts } = await verificationRepo('verify-flag');
	const file = () => fs.readFileSync(path.join(root, 'LOCAL_AGENT_VERIFICATION.md'), 'utf8');
	run(['status'], { cwd: root });
	assert.match(file(), /VERIFICATION_AVAILABLE = TRUE/);
	const a = liveProcess();
	run(['verify-acquire', '--session', 'A'], { cwd: wts[0], pid: a });
	assert.match(file(), /VERIFICATION_AVAILABLE = FALSE/);
});

// --- installer ----------------------------------------------------------------

test('mergeHooks adds each hook once and keeps existing ones', () => {
	const settings = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } };
	assert.deepEqual(mergeHooks(settings, '/home/u/.claude/agent-registry/agent-registry.mjs'), [
		'SessionStart',
		'SessionEnd',
		'PreToolUse',
	]);
	assert.deepEqual(mergeHooks(settings, '/home/u/.claude/agent-registry/agent-registry.mjs'), []);
	assert.equal(settings.hooks.SessionStart.length, 2);
	assert.deepEqual(settings.hooks.PreToolUse[0].hooks[0].args.slice(1), ['hook', 'pre-tool-use']);
});
