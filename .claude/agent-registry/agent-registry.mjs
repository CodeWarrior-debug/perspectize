#!/usr/bin/env node
// agent-registry.mjs: a per-machine registry that stops Claude Code sessions on
// one computer from writing to the same git checkout, and serialises browser
// verification so only one session drives the shared dev servers and Chrome.
//
// Shareable: no dependencies, Node 18+, Windows / macOS / Linux. Everything
// project-specific (ports, dev-server process patterns) comes from
// `.claude/agent-registry.config.json`. See README.md beside this file.
//
// Usage: node agent-registry.mjs <command> [options]   (`help` lists commands)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.0.0';
export const CHECKOUTS_FILE = 'LOCAL_AGENT_CHECKOUTS.md';
export const VERIFICATION_FILE = 'LOCAL_AGENT_VERIFICATION.md';
const LOCK_DIR = '.agent-registry.lock';
const DATA_OPEN = '<!-- agent-registry-data';
const DATA_CLOSE = '-->';
const IS_WIN = process.platform === 'win32';
const CASE_INSENSITIVE_FS = IS_WIN || process.platform === 'darwin';
const SCRIPT_PATH = fileURLToPath(import.meta.url);

// Exit codes for CLI commands (hooks always exit 0: they fail open).
export const EXIT = { OK: 0, ERROR: 1, BUSY: 2, NEEDS_PING: 3, TIMEOUT: 4, INACTIVE: 5 };

export const DEFAULT_CONFIG = {
	chromeDebugPort: 9222,
	maxConcurrentVerifications: 1,
	slots: [{ id: 1, backendPort: 8080, frontendPort: 5173, enabled: true }],
	waitPollSeconds: 300,
	waitMaxMinutes: 120,
	humanReplyMinutes: 10,
	staleClaimHours: 24,
	// Regexes (strings) matched against a process's command line. Only matching
	// processes are ever stopped by a takeover; anything else is left alone.
	devServerProcessPatterns: ['vite', '\\bair\\b', 'pnpm', 'npm run dev'],
};

// ---------------------------------------------------------------------------
// Paths and checkouts
// ---------------------------------------------------------------------------

/** Real absolute path with forward slashes; the nearest existing ancestor is resolved for a path that doesn't exist yet. */
export function canonicalPath(p) {
	let abs = path.resolve(expandHome(p));
	const tail = [];
	while (!fs.existsSync(abs)) {
		const parent = path.dirname(abs);
		if (parent === abs) break;
		tail.unshift(path.basename(abs));
		abs = parent;
	}
	let real = abs;
	try {
		real = fs.realpathSync.native(abs);
	} catch {
		/* keep abs */
	}
	return toSlash(path.join(real, ...tail));
}

function expandHome(p) {
	return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function toSlash(p) {
	return p.replace(/\\/g, '/');
}

/** Comparison key: case-insensitive on macOS and Windows, where the filesystem is. */
export function pathKey(p) {
	return CASE_INSENSITIVE_FS ? p.toLowerCase() : p;
}

/**
 * The git checkout containing `p` and the main checkout it belongs to (a linked
 * worktree's main root comes from its gitdir's `commondir`). Pure filesystem
 * reads: no git process, so it is cheap enough for every tool call.
 */
export function findCheckout(p) {
	let dir = canonicalPath(p);
	if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) dir = toSlash(path.dirname(dir));
	for (;;) {
		const dotGit = path.join(dir, '.git');
		let st = null;
		try {
			st = fs.statSync(dotGit);
		} catch {
			/* not here */
		}
		if (st?.isDirectory()) return { root: dir, mainRoot: dir };
		if (st?.isFile()) {
			const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
			if (!m) return { root: dir, mainRoot: dir };
			const gitDir = path.resolve(dir, m[1].trim());
			let commonDir = gitDir;
			try {
				commonDir = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
			} catch {
				/* a submodule or plain gitfile: treat the checkout as its own main */
				return { root: dir, mainRoot: dir };
			}
			return { root: dir, mainRoot: canonicalPath(path.dirname(commonDir)) };
		}
		const parent = toSlash(path.dirname(dir));
		if (parent === dir) return null;
		dir = parent;
	}
}

function currentBranch(root) {
	try {
		const dotGit = path.join(root, '.git');
		let gitDir = dotGit;
		if (fs.statSync(dotGit).isFile()) {
			const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
			gitDir = path.resolve(root, m[1].trim());
		}
		const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
		const m = /^ref: refs\/heads\/(.+)$/.exec(head);
		return m ? m[1] : `(detached ${head.slice(0, 8)})`;
	} catch {
		return '(unknown)';
	}
}

/** The registry is opted into per machine by creating the checkouts file at the main root (`init`). */
export function registryActive(mainRoot) {
	return fs.existsSync(path.join(mainRoot, CHECKOUTS_FILE));
}

export function loadConfig(checkoutRoot, mainRoot) {
	for (const dir of [checkoutRoot, mainRoot]) {
		if (!dir) continue;
		const f = path.join(dir, '.claude', 'agent-registry.config.json');
		if (fs.existsSync(f)) {
			try {
				return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(f, 'utf8')) };
			} catch (err) {
				warn(`ignoring unreadable ${f}: ${err.message}`);
			}
		}
	}
	return { ...DEFAULT_CONFIG };
}

// ---------------------------------------------------------------------------
// Processes (one snapshot per run; the same code path on every OS)
// ---------------------------------------------------------------------------

let processTable = null;

/** pid -> { ppid, name } for every process, from one `ps` (or one CIM query on Windows). */
function processes() {
	if (processTable) return processTable;
	processTable = new Map();
	try {
		if (IS_WIN) {
			const out = execFileSync(
				'powershell.exe',
				[
					'-NoProfile',
					'-Command',
					'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)" }',
				],
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
			);
			for (const line of out.split(/\r?\n/)) {
				const [pid, ppid, name] = line.split('\t');
				if (pid) processTable.set(Number(pid), { ppid: Number(ppid), name: (name ?? '').trim() });
			}
		} else {
			const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			});
			for (const line of out.split('\n')) {
				const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
				if (m) processTable.set(Number(m[1]), { ppid: Number(m[2]), name: path.basename(m[3].trim()) });
			}
		}
	} catch {
		/* no process listing: liveness falls back to signal 0 only */
	}
	return processTable;
}

/** Full command line of one process, or '' if unavailable. */
function commandLine(pid) {
	try {
		if (IS_WIN) {
			return execFileSync(
				'powershell.exe',
				['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`],
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
			).trim();
		}
		return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return '';
	}
}

function isClaudeName(name) {
	return /^claude(\.exe)?$/i.test(name);
}

/** A `node` command line running the Claude CLI, not merely a script under some `.claude/` folder. */
export function isClaudeCli(cmd) {
	return /@anthropic-ai[\\/]claude-code/i.test(cmd) || /(?:^|[\\/\s])claude(?:\.c?js|\.mjs)?(?:\s|$)/i.test(cmd);
}

/**
 * The PID of the Claude Code process this script runs under: the nearest
 * ancestor named `claude` (a hook's direct parent; for a Bash-tool call it is
 * the shell's parent), or a `node` ancestor running the Claude CLI. Null when
 * run by hand outside Claude.
 */
export function findClaudePid() {
	if (process.env.AGENT_REGISTRY_TEST_PID) return Number(process.env.AGENT_REGISTRY_TEST_PID);
	const table = processes();
	let pid = process.ppid;
	for (let i = 0; i < 8 && pid > 1; i++) {
		const info = table.get(pid);
		if (!info) break;
		if (isClaudeName(info.name)) return pid;
		if (/^node(\.exe)?$/i.test(info.name) && isClaudeCli(commandLine(pid))) return pid;
		pid = info.ppid;
	}
	return null;
}

function processName(pid) {
	return processes().get(Number(pid))?.name ?? null;
}

/** Alive, and (when recorded) still the same program, so a reused PID doesn't count. */
export function isAlive(pid, expectedName) {
	if (!pid) return false;
	try {
		process.kill(Number(pid), 0);
	} catch (err) {
		if (err.code !== 'EPERM') return false;
	}
	if (expectedName) {
		const name = processName(pid);
		if (name && name.toLowerCase() !== String(expectedName).toLowerCase()) return false;
	}
	return true;
}

/** PIDs listening on a TCP port. */
function listenerPids(port) {
	const pids = new Set();
	try {
		if (IS_WIN) {
			const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
				windowsHide: true,
			});
			for (const line of out.split(/\r?\n/)) {
				const cols = line.trim().split(/\s+/);
				if (cols[3] === 'LISTENING' && cols[1]?.endsWith(`:${port}`)) pids.add(Number(cols[4]));
			}
		} else {
			const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			});
			for (const l of out.split('\n')) if (l.trim()) pids.add(Number(l.trim()));
		}
	} catch {
		/* lsof exits 1 when nothing listens; ss fallback for Linux without lsof */
		if (!IS_WIN && pids.size === 0) {
			try {
				const out = execFileSync('ss', ['-ltnpH', `sport = :${port}`], {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore'],
				});
				for (const m of out.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]));
			} catch {
				/* nothing */
			}
		}
	}
	return [...pids];
}

/** True when something accepts connections on the port (IPv4 or IPv6 loopback). */
export async function portInUse(port) {
	const tryHost = (host) =>
		new Promise((resolve) => {
			const s = net.connect({ port, host });
			const done = (v) => {
				s.destroy();
				resolve(v);
			};
			s.setTimeout(400, () => done(false));
			s.once('connect', () => done(true));
			s.once('error', () => done(false));
		});
	return (await tryHost('127.0.0.1')) || (await tryHost('::1'));
}

function matchesDevServer(cmd, config) {
	return config.devServerProcessPatterns.some((re) => new RegExp(re).test(cmd));
}

/** Stop a process and its children (Windows: taskkill /T; elsewhere TERM to children, then the process). */
function killTree(pid) {
	try {
		if (IS_WIN) {
			execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
			return;
		}
		const table = processes();
		for (const [child, info] of table) if (info.ppid === Number(pid)) killTree(child);
		process.kill(Number(pid), 'SIGTERM');
	} catch {
		/* already gone */
	}
}

/**
 * Stop the dev servers on a port that match the configured patterns, plus their
 * matching ancestors (pnpm, air), so nothing respawns them. Returns
 * { stopped, refused }: refused lists listeners that matched no pattern.
 */
function stopDevServersOnPort(port, config) {
	const stopped = [];
	const refused = [];
	const table = processes();
	for (const pid of listenerPids(port)) {
		const cmd = commandLine(pid);
		if (!matchesDevServer(cmd, config)) {
			refused.push({ pid, cmd });
			continue;
		}
		let top = pid;
		let parent = table.get(pid)?.ppid;
		while (parent && parent > 1 && matchesDevServer(commandLine(parent), config)) {
			top = parent;
			parent = table.get(parent)?.ppid;
		}
		killTree(top);
		stopped.push({ pid: top, cmd });
	}
	return { stopped, refused };
}

// ---------------------------------------------------------------------------
// Lock and file I/O
// ---------------------------------------------------------------------------

function sleepSync(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Take the machine-wide lock for `mainRoot` and return its release function.
 * The lock is a directory (mkdir is atomic on every OS). A lock whose holder
 * died, or that is older than 30 s (an update takes milliseconds), is broken
 * and the break is logged.
 */
export function acquireLock(mainRoot) {
	const lock = path.join(mainRoot, LOCK_DIR);
	const owner = path.join(lock, 'owner.json');
	const deadline = Date.now() + 15000;
	for (;;) {
		try {
			fs.mkdirSync(lock);
			fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, at: Date.now() }));
			return () => fs.rmSync(lock, { recursive: true, force: true });
		} catch (err) {
			if (err.code !== 'EEXIST') throw err;
			let info = null;
			try {
				info = JSON.parse(fs.readFileSync(owner, 'utf8'));
			} catch {
				/* being written, or the holder died between mkdir and write */
			}
			let age = 0;
			try {
				age = Date.now() - (info?.at ?? fs.statSync(lock).mtimeMs);
			} catch {
				continue; // released between our checks
			}
			if (age > 30000 || (info && !isAlive(info.pid))) {
				warn(`broke a stale registry lock (holder pid ${info?.pid ?? '?'}, ${Math.round(age / 1000)}s old)`);
				fs.rmSync(lock, { recursive: true, force: true });
				continue;
			}
			if (Date.now() > deadline) throw new Error(`registry lock busy: ${lock}`);
			sleepSync(25 + Math.floor(Math.random() * 50));
		}
	}
}

function readData(file, fallback) {
	try {
		const text = fs.readFileSync(file, 'utf8');
		const start = text.indexOf(DATA_OPEN);
		if (start === -1) return fallback;
		const end = text.indexOf(DATA_CLOSE, start);
		return { ...fallback, ...JSON.parse(text.slice(start + DATA_OPEN.length, end)) };
	} catch {
		return fallback;
	}
}

/** Write to a temp file and rename over the target, retrying while Windows holds it open. */
function writeAtomic(file, text) {
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, text);
	for (let i = 0; ; i++) {
		try {
			fs.renameSync(tmp, file);
			return;
		} catch (err) {
			if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
				fs.rmSync(tmp, { force: true });
				throw err;
			}
			sleepSync(50);
		}
	}
}

function writeIfChanged(file, text) {
	try {
		if (fs.readFileSync(file, 'utf8') === text) return;
	} catch {
		/* missing: write it */
	}
	writeAtomic(file, text);
}

const emptyCheckouts = () => ({ version: 1, sessions: {}, claims: [] });
const emptyVerification = () => ({ version: 1, slots: {}, holds: {} });

function table(headers, rows) {
	const esc = (v) => String(v ?? '').replace(/\|/g, '\\|');
	return [
		`| ${headers.join(' | ')} |`,
		`|${headers.map(() => '---').join('|')}|`,
		...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
	].join('\n');
}

function renderCheckouts(data) {
	const claims = data.claims.length
		? table(
				['Session', 'Branch', 'Checkout (absolute)', 'PID', 'Started'],
				data.claims.map((c) => [c.session, c.branch, c.checkout, c.pid ?? '-', c.startedAt]),
			)
		: '_No checkout is claimed._';
	const sessions = Object.entries(data.sessions);
	const sessionTable = sessions.length
		? table(
				['Session', 'PID', 'Started in', 'Started'],
				sessions.map(([id, s]) => [id, s.pid ?? '-', s.cwd, s.startedAt]),
			)
		: '_None._';
	return `# LOCAL_AGENT_CHECKOUTS

Which Claude Code session on **this machine** is writing to which checkout.
Written only by \`.claude/agent-registry/agent-registry.mjs\` (see its README);
do not edit by hand while sessions are running. Gitignored; one per machine.

## Claims

${claims}

## Live sessions seen

${sessionTable}

${DATA_OPEN}
${JSON.stringify(data, null, 2)}
${DATA_CLOSE}
`;
}

function renderVerification(data, config, available) {
	const rows = config.slots.map((slot) => {
		const s = data.slots[slot.id];
		const port = (kind, p) => {
			const info = s?.ports?.[kind];
			return info?.startedAt ? `${p} (since ${info.startedAt})` : String(p);
		};
		const status = !slot.enabled ? 'disabled' : s ? 'IN USE' : 'free';
		const h = s?.holder;
		return [
			slot.id,
			status,
			h ? (h.kind === 'human' ? `human (${h.label})` : 'agent') : '-',
			h?.session ?? '-',
			h?.branch ?? '-',
			h?.checkout ?? '-',
			h?.pid ?? (h?.pids ?? []).join(',') ?? '-',
			h?.startedAt ?? '-',
			port('backend', slot.backendPort),
			port('frontend', slot.frontendPort),
		];
	});
	const holds = Object.entries(data.holds).map(([slot, h]) => `- Slot ${slot}: held by ${h.by} until ${h.until}`);
	return `# LOCAL_AGENT_VERIFICATION

VERIFICATION_AVAILABLE = ${available ? 'TRUE' : 'FALSE'}

One browser verification at a time on this machine (max concurrent: ${config.maxConcurrentVerifications}).
Shared: Chrome on :${config.chromeDebugPort} plus the slot's ports. Written only by
\`.claude/agent-registry/agent-registry.mjs\`; snapshot as of ${now()}. Run its \`status\` for a fresh check.

${table(['Slot', 'Status', 'Holder', 'Session', 'Branch', 'Checkout', 'PID', 'Started', 'Backend port', 'Frontend port'], rows)}

## Holds (takeover blocked)

${holds.length ? holds.join('\n') : '_None._'}

${DATA_OPEN}
${JSON.stringify(data, null, 2)}
${DATA_CLOSE}
`;
}

function now() {
	return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Registry operations (callers hold the lock)
// ---------------------------------------------------------------------------

class Registry {
	constructor(mainRoot, config) {
		this.mainRoot = mainRoot;
		this.config = config;
		this.checkoutsFile = path.join(mainRoot, CHECKOUTS_FILE);
		this.verificationFile = path.join(mainRoot, VERIFICATION_FILE);
		this.checkouts = readData(this.checkoutsFile, emptyCheckouts());
		this.verification = readData(this.verificationFile, emptyVerification());
		this.notes = [];
	}

	sessionAlive(session, pid, pidName) {
		const s = this.checkouts.sessions[session];
		return isAlive(pid ?? s?.pid, pidName ?? s?.pidName);
	}

	/** Drop claims, sessions and verification holders whose process is gone. */
	pruneDead() {
		for (const [id, s] of Object.entries(this.checkouts.sessions)) {
			if (!isAlive(s.pid, s.pidName)) {
				delete this.checkouts.sessions[id];
				this.notes.push(`removed dead session ${id} (pid ${s.pid})`);
			}
		}
		this.checkouts.claims = this.checkouts.claims.filter((c) => {
			const ok = isAlive(c.pid, c.pidName);
			if (!ok) this.notes.push(`released stale claim on ${c.checkout} by dead session ${c.session} (pid ${c.pid})`);
			return ok;
		});
		for (const [slotId, s] of Object.entries(this.verification.slots)) {
			const h = s.holder;
			const alive = h.kind === 'human' ? (h.pids ?? []).some((p) => isAlive(p)) : isAlive(h.pid, h.pidName);
			if (!alive) {
				this.stopRecordedServers(s);
				delete this.verification.slots[slotId];
				this.notes.push(`released verification slot ${slotId} from dead holder ${h.session ?? h.label}`);
			}
		}
		for (const [slotId, hold] of Object.entries(this.verification.holds)) {
			if (Date.parse(hold.until) < Date.now()) delete this.verification.holds[slotId];
		}
	}

	staleClaims() {
		const limit = this.config.staleClaimHours * 3600 * 1000;
		return this.checkouts.claims.filter((c) => Date.now() - Date.parse(c.startedAt) > limit);
	}

	recordSession(session, pid, cwd) {
		const existing = this.checkouts.sessions[session];
		this.checkouts.sessions[session] = {
			pid,
			pidName: pid ? processName(pid) : null,
			cwd,
			startedAt: existing?.startedAt ?? now(),
		};
		// A resumed session runs in a new process: move its claims and slots to the new PID.
		for (const c of this.checkouts.claims) {
			if (c.session === session) Object.assign(c, { pid, pidName: this.checkouts.sessions[session].pidName });
		}
		for (const s of Object.values(this.verification.slots)) {
			if (s.holder.session === session) Object.assign(s.holder, { pid, pidName: this.checkouts.sessions[session].pidName });
		}
	}

	sessionForPid(pid) {
		return Object.entries(this.checkouts.sessions).find(([, s]) => s.pid === pid)?.[0] ?? null;
	}

	ownerOf(checkout) {
		return this.checkouts.claims.find((c) => pathKey(c.checkout) === pathKey(checkout)) ?? null;
	}

	/** Claim `checkout` for `session`. Returns { ok: true } or { ok: false, owner }. */
	claim(checkout, session, pid) {
		const owner = this.ownerOf(checkout);
		if (owner && owner.session !== session) {
			if (isAlive(owner.pid, owner.pidName)) return { ok: false, owner };
			this.notes.push(`took over ${checkout} from dead session ${owner.session} (pid ${owner.pid})`);
			this.checkouts.claims = this.checkouts.claims.filter((c) => c !== owner);
		} else if (owner) {
			return { ok: true, already: true };
		}
		this.checkouts.claims.push({
			session,
			branch: currentBranch(checkout),
			checkout,
			pid,
			pidName: pid ? processName(pid) : null,
			startedAt: now(),
		});
		return { ok: true };
	}

	releaseSession(session) {
		const before = this.checkouts.claims.length;
		this.checkouts.claims = this.checkouts.claims.filter((c) => c.session !== session);
		delete this.checkouts.sessions[session];
		const released = [];
		for (const [slotId, s] of Object.entries(this.verification.slots)) {
			if (s.holder.session === session) {
				this.stopRecordedServers(s);
				delete this.verification.slots[slotId];
				released.push(slotId);
			}
		}
		return { claims: before - this.checkouts.claims.length, slots: released };
	}

	stopRecordedServers(slotState) {
		for (const info of Object.values(slotState.ports ?? {})) {
			if (info.pid && isAlive(info.pid)) killTree(info.pid);
		}
	}

	enabledSlots() {
		return this.config.slots.filter((s) => s.enabled);
	}

	heldCount() {
		return Object.keys(this.verification.slots).length;
	}

	slotFor(session) {
		const entry = Object.entries(this.verification.slots).find(([, s]) => s.holder.session === session);
		return entry ? { id: Number(entry[0]), state: entry[1], slot: this.config.slots.find((s) => s.id === Number(entry[0])) } : null;
	}

	/**
	 * Why a slot can't be taken right now, or null if it can. Kinds: holder
	 * (registered agent or human), hold, unknown (an unregistered listener).
	 */
	async slotBlocker(slot) {
		const s = this.verification.slots[slot.id];
		if (s) return { kind: s.holder.kind === 'human' ? 'human' : 'agent', holder: s.holder };
		const hold = this.verification.holds[slot.id];
		if (hold) return { kind: 'hold', hold };
		const busy = [];
		for (const port of [slot.backendPort, slot.frontendPort]) {
			if (await portInUse(port)) {
				busy.push({
					port,
					listeners: listenerPids(port).map((pid) => ({ pid, cmd: commandLine(pid) })),
				});
			}
		}
		return busy.length ? { kind: 'unknown', ports: busy } : null;
	}

	async available() {
		if (this.heldCount() >= this.config.maxConcurrentVerifications) return false;
		for (const slot of this.enabledSlots()) if (!(await this.slotBlocker(slot))) return true;
		return false;
	}

	/** `verification: false` skips the verification file (and its port probes): the per-tool-call claim path. */
	async save({ verification = true } = {}) {
		writeIfChanged(this.checkoutsFile, renderCheckouts(this.checkouts));
		if (verification) {
			writeAtomic(this.verificationFile, renderVerification(this.verification, this.config, await this.available()));
		}
	}
}

/** Load the registry under the lock, run `fn(registry)` (may be async), save, release. */
async function update(mainRoot, config, fn, saveOpts) {
	const release = acquireLock(mainRoot);
	try {
		const reg = new Registry(mainRoot, config);
		const result = await fn(reg);
		await reg.save(saveOpts);
		return { ...(result ?? {}), notes: reg.notes };
	} finally {
		release();
	}
}

// ---------------------------------------------------------------------------
// Bash write detection (a documented heuristic, not a sandbox)
// ---------------------------------------------------------------------------

const GIT_WRITE =
	/\bgit\b(?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?))*\s+(?:commit|checkout|switch|reset|merge|rebase|stash|add|rm|mv|pull|cherry-pick|revert|restore|clean|am|apply|worktree\s+(?:add|remove|move|prune)|submodule\s+(?:update|add|deinit)|branch\s+-[dDmMf]|tag\s+-d)\b/;
const FILE_WRITE =
	/(?:^|[;&|()]\s*|\s)(?:rm|rmdir|mv|cp|mkdir|touch|tee|ln|truncate|rsync|unzip|patch|install)\s|\b(?:sed|perl)\s+(?:-\w*\s+)*-i\b|\btar\s+-?\w*x/;
const TOOL_WRITE =
	/\b(?:pnpm|npm|yarn|bun)\s+(?:i|install|add|remove|rm|uninstall|update|up|upgrade|link|prune)\b|\bgo\s+(?:generate|get|mod\s+(?:tidy|vendor|edit))\b|\bgofmt\s+(?:-\w+\s+)*-w\b|\bprettier\b[^|;&]*--write\b|\beslint\b[^|;&]*--fix\b|\bmake\s+(?:graphql-gen|gen|generate|fmt|format|install-hooks)\b/;
// `>` / `>>` redirection that isn't to a file descriptor or /dev/null.
const REDIRECT = /(?:^|[^0-9&<>|])>{1,2}\s*(?!&|\/dev\/null|nul\b)[^\s&|;]/;

export function isWriteCommand(cmd) {
	return GIT_WRITE.test(cmd) || FILE_WRITE.test(cmd) || TOOL_WRITE.test(cmd) || REDIRECT.test(cmd);
}

/** Paths a command may write into: its working directory (after a leading `cd`) plus absolute paths it names. */
export function commandTargets(cmd, cwd) {
	const targets = [];
	const cd = /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*(?:&&|;|$)/.exec(cmd);
	targets.push(cd ? path.resolve(cwd, expandHome(cd[1].replace(/^["']|["']$/g, ''))) : cwd);
	for (const m of cmd.matchAll(/(?:^|[\s='"(])((?:\/|~\/|[A-Za-z]:[\\/])[^\s'";|&)<>]*)/g)) {
		const p = m[1];
		if (/^\/dev\//.test(p)) continue;
		targets.push(expandHome(p));
	}
	return targets;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function readStdin() {
	try {
		return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
	} catch {
		return {};
	}
}

function hookOutput(event, extra) {
	process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, ...extra } }));
}

/** When both the user-level copy and the project copy are installed, only the project copy runs. */
function deferToProjectCopy() {
	const projectDir = process.env.CLAUDE_PROJECT_DIR;
	if (!projectDir) return false;
	const projectScript = path.join(projectDir, '.claude', 'agent-registry', 'agent-registry.mjs');
	if (pathKey(canonicalPath(projectScript)) === pathKey(canonicalPath(SCRIPT_PATH))) return false;
	if (!fs.existsSync(projectScript)) return false;
	try {
		return fs.readFileSync(path.join(projectDir, '.claude', 'settings.json'), 'utf8').includes('agent-registry.mjs');
	} catch {
		return false;
	}
}

async function hookSessionStart(input) {
	const checkout = findCheckout(input.cwd ?? process.cwd());
	if (!checkout || !registryActive(checkout.mainRoot)) return;
	const config = loadConfig(checkout.root, checkout.mainRoot);
	const pid = findClaudePid();
	const res = await update(checkout.mainRoot, config, async (reg) => {
		reg.pruneDead();
		reg.recordSession(input.session_id, pid, canonicalPath(input.cwd ?? process.cwd()));
		const owner = reg.ownerOf(checkout.root);
		return {
			owner: owner && owner.session !== input.session_id ? owner : null,
			claims: reg.checkouts.claims,
			stale: reg.staleClaims(),
			available: await reg.available(),
		};
	});
	const lines = [
		`Agent registry (per machine, ${path.join(checkout.mainRoot, CHECKOUTS_FILE)}): ` +
			`${res.claims.length} claimed checkout(s); VERIFICATION_AVAILABLE=${res.available ? 'TRUE' : 'FALSE'}.`,
	];
	for (const c of res.claims) lines.push(`- ${c.checkout} -> session ${c.session} (${c.branch}) since ${c.startedAt}`);
	if (res.owner) {
		lines.push(
			`WARNING: this checkout (${checkout.root}) is claimed by another live session ${res.owner.session} ` +
				`(branch ${res.owner.branch}). Writes here will be denied. Work in a free worktree instead.`,
		);
	}
	for (const s of res.stale) {
		lines.push(`Stale? ${s.checkout} claimed by live pid ${s.pid} since ${s.startedAt}: check whether that session is still working.`);
	}
	for (const n of res.notes) lines.push(`Cleanup: ${n}`);
	lines.push('Before any browser verification, use the pr-verification skill (it takes the machine-wide verification slot).');
	hookOutput('SessionStart', { additionalContext: lines.join('\n') });
}

async function hookSessionEnd(input) {
	const checkout = findCheckout(input.cwd ?? process.cwd());
	if (!checkout || !registryActive(checkout.mainRoot)) return;
	const config = loadConfig(checkout.root, checkout.mainRoot);
	await update(checkout.mainRoot, config, async (reg) => reg.releaseSession(input.session_id));
}

async function hookPreToolUse(input) {
	const tool = input.tool_name;
	const ti = input.tool_input ?? {};
	const cwd = input.cwd ?? process.cwd();
	let targets = [];
	if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
		const file = ti.file_path ?? ti.notebook_path;
		if (!file) return;
		const abs = path.resolve(cwd, file);
		if ([CHECKOUTS_FILE, VERIFICATION_FILE].includes(path.basename(abs))) {
			const co = findCheckout(abs);
			if (co && pathKey(canonicalPath(path.dirname(abs))) === pathKey(co.mainRoot)) {
				return deny(`${path.basename(abs)} is written only by the agent-registry script: run \`node ${SCRIPT_PATH} help\`.`);
			}
		}
		targets = [abs];
	} else if (tool === 'Bash') {
		const cmd = String(ti.command ?? '');
		if (!isWriteCommand(cmd)) return;
		if (/LOCAL_AGENT_(?:CHECKOUTS|VERIFICATION)\.md/.test(cmd) && !/agent-registry\.mjs/.test(cmd)) {
			return deny('The LOCAL_AGENT_*.md files are written only by the agent-registry script.');
		}
		targets = commandTargets(cmd, cwd);
	} else {
		return;
	}

	const byMain = new Map();
	for (const t of targets) {
		const co = findCheckout(t);
		if (!co || !registryActive(co.mainRoot)) continue;
		if (!byMain.has(co.mainRoot)) byMain.set(co.mainRoot, new Map());
		byMain.get(co.mainRoot).set(pathKey(co.root), co.root);
	}
	if (byMain.size === 0) return;
	let pid;
	for (const [mainRoot, roots] of byMain) {
		// Fast path, no lock: this session already owns every target checkout.
		const current = readData(path.join(mainRoot, CHECKOUTS_FILE), emptyCheckouts());
		const mine = [...roots.keys()].every((k) =>
			current.claims.some((c) => pathKey(c.checkout) === k && c.session === input.session_id),
		);
		if (mine) continue;
		pid ??= findClaudePid();
		const config = loadConfig([...roots.values()][0], mainRoot);
		const res = await update(mainRoot, config, async (reg) => {
			if (!reg.checkouts.sessions[input.session_id]) reg.recordSession(input.session_id, pid, canonicalPath(cwd));
			for (const root of roots.values()) {
				const r = reg.claim(root, input.session_id, pid);
				if (!r.ok) return { blocked: { root, owner: r.owner } };
			}
			return {};
		}, { verification: false });
		if (res.blocked) {
			const o = res.blocked.owner;
			return deny(
				`agent-registry: ${res.blocked.root} is claimed by another live Claude session on this machine ` +
					`(session ${o.session}, branch ${o.branch}, pid ${o.pid}, since ${o.startedAt}). ` +
					`Do not write there: use or create a free worktree (see the project's worktree docs). ` +
					`If that session is gone, \`node ${SCRIPT_PATH} cleanup\` removes dead claims.`,
			);
		}
	}
}

function deny(reason) {
	hookOutput('PreToolUse', { permissionDecision: 'deny', permissionDecisionReason: reason });
}

async function runHook(event) {
	if (process.env.CLAUDE_CODE_REMOTE === 'true') return; // cloud sessions can't see this machine
	if (deferToProjectCopy()) return;
	const input = readStdin();
	if (!input.session_id) return;
	try {
		if (event === 'session-start') await hookSessionStart(input);
		else if (event === 'session-end') await hookSessionEnd(input);
		else if (event === 'pre-tool-use') await hookPreToolUse(input);
	} catch (err) {
		// Fail open: a registry bug must never block work. Report it on stderr.
		warn(`hook ${event} failed: ${err.stack ?? err}`);
	}
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function warn(msg) {
	process.stderr.write(`[agent-registry] ${msg}\n`);
}

function parseArgs(argv) {
	const opts = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const [k, v] = a.slice(2).split('=');
			if (v !== undefined) opts[k] = v;
			else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts[k] = argv[++i];
			else opts[k] = true;
		} else opts._.push(a);
	}
	return opts;
}

function context(opts) {
	const checkout = findCheckout(opts.path ?? process.cwd());
	if (!checkout) throw new Error(`not inside a git checkout: ${opts.path ?? process.cwd()}`);
	const config = loadConfig(checkout.root, checkout.mainRoot);
	return { checkout, config };
}

/** This CLI call's session: --session, else the registered session of the Claude process running it. */
function whoAmI(reg, opts) {
	const pid = findClaudePid();
	const session = opts.session ?? (pid ? reg.sessionForPid(pid) : null) ?? (pid ? `pid-${pid}` : 'human');
	return { session, pid };
}

function print(obj) {
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
		console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
	}
}

function requireActive(mainRoot) {
	if (!registryActive(mainRoot)) {
		console.log(`agent registry not initialised for ${mainRoot}: run \`node ${SCRIPT_PATH} init\``);
		process.exit(EXIT.INACTIVE);
	}
}

async function cmdInit() {
	const { checkout, config } = context({});
	const created = [];
	for (const f of [CHECKOUTS_FILE, VERIFICATION_FILE]) if (!fs.existsSync(path.join(checkout.mainRoot, f))) created.push(f);
	// Seed the files (the checkouts file is the opt-in marker), then render them for real.
	if (created.includes(CHECKOUTS_FILE)) writeAtomic(path.join(checkout.mainRoot, CHECKOUTS_FILE), renderCheckouts(emptyCheckouts()));
	await update(checkout.mainRoot, config, async (reg) => reg.pruneDead());
	print({ mainRoot: checkout.mainRoot, created: created.length ? created : 'nothing (already initialised)' });
}

async function cmdStatus() {
	const { checkout, config } = context({});
	requireActive(checkout.mainRoot);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		reg.pruneDead();
		const slots = [];
		for (const slot of config.slots) {
			const blocker = slot.enabled ? await reg.slotBlocker(slot) : { kind: 'disabled' };
			slots.push({ id: slot.id, ports: `${slot.backendPort}/${slot.frontendPort}`, blocker: blocker ?? 'free' });
		}
		return { claims: reg.checkouts.claims, slots, available: await reg.available(), stale: reg.staleClaims() };
	});
	console.log(`VERIFICATION_AVAILABLE = ${res.available ? 'TRUE' : 'FALSE'}`);
	for (const s of res.slots) console.log(`slot ${s.id} (${s.ports}): ${typeof s.blocker === 'string' ? s.blocker : JSON.stringify(s.blocker)}`);
	console.log(`claims: ${res.claims.length}`);
	for (const c of res.claims) console.log(`  ${c.checkout}  session=${c.session} branch=${c.branch} pid=${c.pid} since=${c.startedAt}`);
	for (const s of res.stale) console.log(`stale? ${s.checkout} (pid ${s.pid} alive since ${s.startedAt})`);
	for (const n of res.notes) console.log(`cleanup: ${n}`);
	console.log(`files: ${path.join(checkout.mainRoot, CHECKOUTS_FILE)}, ${path.join(checkout.mainRoot, VERIFICATION_FILE)}`);
}

async function cmdCleanup() {
	const { checkout, config } = context({});
	requireActive(checkout.mainRoot);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		reg.pruneDead();
		return { stale: reg.staleClaims() };
	});
	for (const n of res.notes) console.log(`cleanup: ${n}`);
	if (!res.notes.length) console.log('nothing to clean up: every recorded process is alive');
	for (const s of res.stale) console.log(`still alive but old (investigate): ${s.checkout} session=${s.session} pid=${s.pid} since=${s.startedAt}`);
}

async function cmdClaim(opts, release) {
	const { checkout, config } = context(opts);
	requireActive(checkout.mainRoot);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		const me = whoAmI(reg, opts);
		if (release) {
			const before = reg.checkouts.claims.length;
			reg.checkouts.claims = reg.checkouts.claims.filter(
				(c) => !(c.session === me.session && (opts.all || pathKey(c.checkout) === pathKey(checkout.root))),
			);
			return { released: before - reg.checkouts.claims.length, me };
		}
		return { ...reg.claim(checkout.root, me.session, me.pid), me };
	});
	print({ checkout: checkout.root, session: res.me.session, ...res, me: undefined });
	if (res.ok === false) process.exit(EXIT.BUSY);
}

/** Try to take a verification slot for this session. */
async function tryAcquire(reg, opts, me, checkout) {
	const held = reg.slotFor(me.session);
	if (held) return { acquired: true, slot: held.slot, already: true };
	if (reg.heldCount() >= reg.config.maxConcurrentVerifications) {
		const [id, s] = Object.entries(reg.verification.slots)[0];
		return { acquired: false, blocker: { kind: s.holder.kind === 'human' ? 'human' : 'agent', slot: Number(id), holder: s.holder } };
	}
	const candidates = opts.slot ? reg.enabledSlots().filter((s) => s.id === Number(opts.slot)) : reg.enabledSlots();
	let firstBlocker = null;
	for (const slot of candidates) {
		const blocker = await reg.slotBlocker(slot);
		if (!blocker) {
			reg.verification.slots[slot.id] = {
				holder: {
					kind: 'agent',
					session: me.session,
					branch: currentBranch(checkout.root),
					checkout: checkout.root,
					pid: me.pid,
					pidName: me.pid ? processName(me.pid) : null,
					startedAt: now(),
				},
				ports: { backend: { port: slot.backendPort }, frontend: { port: slot.frontendPort } },
			};
			return { acquired: true, slot };
		}
		firstBlocker ??= { ...blocker, slot: slot.id };
	}
	return { acquired: false, blocker: firstBlocker ?? { kind: 'none-enabled' } };
}

function printAcquired(slot, config) {
	print({
		result: 'ACQUIRED',
		slot: slot.id,
		backendPort: slot.backendPort,
		frontendPort: slot.frontendPort,
		chromeDebugPort: config.chromeDebugPort,
	});
}

async function cmdVerifyAcquire(opts) {
	const { checkout, config } = context(opts);
	requireActive(checkout.mainRoot);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		reg.pruneDead();
		return tryAcquire(reg, opts, whoAmI(reg, opts), checkout);
	});
	if (res.acquired) return printAcquired(res.slot, config);
	print({ result: 'BUSY', blocker: res.blocker });
	process.exit(EXIT.BUSY);
}

/** Record that a server is up on the held slot (its listener PID is found from the port). */
async function cmdVerifyStarted(opts) {
	const kind = opts._[1];
	if (!['backend', 'frontend'].includes(kind)) throw new Error('usage: verify-started backend|frontend');
	const { checkout, config } = context(opts);
	requireActive(checkout.mainRoot);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		const me = whoAmI(reg, opts);
		const held = reg.slotFor(me.session);
		if (!held) return { error: 'this session holds no verification slot (run verify-acquire first)' };
		const port = kind === 'backend' ? held.slot.backendPort : held.slot.frontendPort;
		const pid = opts.pid ? Number(opts.pid) : listenerPids(port)[0];
		if (!pid) return { error: `nothing is listening on :${port} yet` };
		held.state.ports[kind] = { port, pid, startedAt: now() };
		return { port, pid };
	});
	if (res.error) {
		console.log(`error: ${res.error}`);
		process.exit(EXIT.ERROR);
	}
	print({ recorded: kind, port: res.port, pid: res.pid });
}

async function cmdVerifyRelease(opts) {
	const { checkout, config } = context(opts);
	requireActive(checkout.mainRoot);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		const me = whoAmI(reg, opts);
		const held = reg.slotFor(me.session);
		if (!held) return { released: false };
		if (!opts['keep-servers']) reg.stopRecordedServers(held.state);
		delete reg.verification.slots[held.id];
		return { released: true, slot: held.id };
	});
	print({ released: res.released, slot: res.slot });
}

/**
 * Wait for a verification slot without spending tokens: run in the background.
 * Exits 0 once it has ACQUIRED the slot (the woken agent already holds it),
 * 3 NEEDS_PING when a human/unknown process holds the ports (the agent should
 * ping the human, then rerun with --takeover-after), 4 on timeout.
 */
async function cmdVerifyWait(opts) {
	const { checkout, config } = context(opts);
	requireActive(checkout.mainRoot);
	const pollMs = Number(opts['poll-seconds'] ?? config.waitPollSeconds) * 1000;
	const deadline = Date.now() + Number(opts['max-minutes'] ?? config.waitMaxMinutes) * 60000;
	const takeoverMs = opts['takeover-after'] !== undefined ? Number(opts['takeover-after']) * 60000 : null;
	let takeoverAt = null;
	const verificationFile = path.join(checkout.mainRoot, VERIFICATION_FILE);

	for (;;) {
		processTable = null;
		const res = await update(checkout.mainRoot, config, async (reg) => {
			reg.pruneDead();
			const me = whoAmI(reg, opts);
			let r = await tryAcquire(reg, opts, me, checkout);
			const b = r.blocker;
			const takeable = b && (b.kind === 'human' || b.kind === 'unknown');
			if (!r.acquired && takeable && takeoverMs !== null) {
				takeoverAt ??= Date.now() + takeoverMs;
				if (Date.now() >= takeoverAt) {
					const slot = config.slots.find((s) => s.id === b.slot);
					const stopped = [];
					const refused = [];
					for (const port of [slot.backendPort, slot.frontendPort]) {
						const out = stopDevServersOnPort(port, config);
						stopped.push(...out.stopped);
						refused.push(...out.refused);
					}
					if (b.kind === 'human') delete reg.verification.slots[b.slot];
					reg.notes.push(`takeover of slot ${b.slot}: stopped ${JSON.stringify(stopped)}`);
					if (refused.length) {
						r = { acquired: false, blocker: { kind: 'unknown-not-dev-server', slot: b.slot, refused } };
					} else {
						await new Promise((ok) => setTimeout(ok, 1500)); // ports close asynchronously
						processTable = null;
						r = await tryAcquire(reg, opts, me, checkout);
					}
				}
			} else if (!takeable) {
				takeoverAt = null;
			}
			return r;
		});
		if (res.acquired) return printAcquired(res.slot, config);
		const b = res.blocker;
		if ((b.kind === 'human' || b.kind === 'unknown') && takeoverMs === null) {
			notifyDesktop(`Verification is waiting for slot ${b.slot}: reply 'keep' to the waiting Claude session to stop a takeover.`);
			print({ result: 'NEEDS_PING', blocker: b, next: `ping the human, then rerun verify-wait --takeover-after ${config.humanReplyMinutes}` });
			process.exit(EXIT.NEEDS_PING);
		}
		if (Date.now() > deadline) {
			print({ result: 'TIMEOUT', blocker: b });
			process.exit(EXIT.TIMEOUT);
		}
		const wakeAt = Math.min(deadline, Date.now() + pollMs, takeoverAt ?? Infinity);
		await waitForChange(verificationFile, Math.max(1000, wakeAt - Date.now()));
	}
}

/** Sleep up to `ms`, returning early when the verification file changes (a release frees the slot). */
function waitForChange(file, ms) {
	return new Promise((resolve) => {
		const onChange = () => finish();
		const timer = setTimeout(() => finish(), ms);
		function finish() {
			clearTimeout(timer);
			fs.unwatchFile(file, onChange);
			resolve();
		}
		fs.watchFile(file, { interval: 5000 }, onChange);
	});
}

function notifyDesktop(message) {
	try {
		if (process.platform === 'darwin') {
			execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title "agent-registry"`], { stdio: 'ignore' });
		} else if (process.platform === 'linux') {
			execFileSync('notify-send', ['agent-registry', message], { stdio: 'ignore' });
		}
	} catch {
		/* best effort */
	}
}

async function cmdHold(opts, on) {
	const { checkout, config } = context(opts);
	requireActive(checkout.mainRoot);
	const slot = Number(opts.slot ?? 1);
	const minutes = Number(opts.minutes ?? 60);
	await update(checkout.mainRoot, config, async (reg) => {
		if (on) reg.verification.holds[slot] = { by: opts.by ?? 'human', until: new Date(Date.now() + minutes * 60000).toISOString() };
		else delete reg.verification.holds[slot];
	});
	console.log(on ? `slot ${slot} held for ${minutes} min: no takeover until then` : `slot ${slot} hold removed`);
}

/** `make start` registers the human's dev servers as the slot holder; `human-stop` releases it. */
async function cmdHuman(opts, start) {
	const { checkout, config } = context(opts);
	if (!registryActive(checkout.mainRoot)) return; // silently: Makefile calls this unconditionally
	const slotId = Number(opts.slot ?? 1);
	const slot = config.slots.find((s) => s.id === slotId);
	const res = await update(checkout.mainRoot, config, async (reg) => {
		reg.pruneDead();
		const s = reg.verification.slots[slotId];
		if (!start) {
			if (s?.holder.kind === 'human') delete reg.verification.slots[slotId];
			return { ok: true };
		}
		if (s && s.holder.kind !== 'human') return { ok: false, holder: s.holder };
		const pids = [];
		for (const port of [slot.backendPort, slot.frontendPort]) pids.push(...listenerPids(port));
		for (const f of [].concat(opts['pid-file'] ?? [])) {
			try {
				pids.push(Number(fs.readFileSync(f, 'utf8').trim()));
			} catch {
				/* not started */
			}
		}
		reg.verification.slots[slotId] = {
			holder: {
				kind: 'human',
				label: opts.label ?? 'make start',
				branch: currentBranch(checkout.root),
				checkout: checkout.root,
				pids: [...new Set(pids.filter(Boolean))],
				startedAt: now(),
			},
			ports: {
				backend: { port: slot.backendPort, startedAt: now() },
				frontend: { port: slot.frontendPort, startedAt: now() },
			},
		};
		return { ok: true };
	});
	if (!res.ok) console.log(`agent-registry: slot ${slotId} is held by agent session ${res.holder.session}; your servers are not registered`);
}

/** Copy this script to ~/.claude/agent-registry/ and add user-level hooks, so old worktrees are covered too. */
async function cmdInstall() {
	await cmdInit();
	const userDir = path.join(os.homedir(), '.claude', 'agent-registry');
	fs.mkdirSync(userDir, { recursive: true });
	const userScript = path.join(userDir, 'agent-registry.mjs');
	fs.copyFileSync(SCRIPT_PATH, userScript);
	const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
	let settings = {};
	if (fs.existsSync(settingsFile)) {
		const raw = fs.readFileSync(settingsFile, 'utf8');
		settings = JSON.parse(raw); // throws on invalid JSON: never overwrite a file we can't read
		fs.writeFileSync(`${settingsFile}.bak-agent-registry`, raw);
	}
	const added = mergeHooks(settings, userScript);
	writeAtomic(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
	print({ userScript: toSlash(userScript), settings: toSlash(settingsFile), hooksAdded: added.length ? added : 'none (already installed)' });
}

export function hookEntries(scriptPath) {
	const h = (event) => ({ type: 'command', command: 'node', args: [toSlash(scriptPath), 'hook', event], timeout: 15 });
	return {
		SessionStart: { hooks: [h('session-start')] },
		SessionEnd: { hooks: [h('session-end')] },
		PreToolUse: { matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash', hooks: [h('pre-tool-use')] },
	};
}

export function mergeHooks(settings, scriptPath) {
	settings.hooks ??= {};
	const added = [];
	for (const [event, entry] of Object.entries(hookEntries(scriptPath))) {
		settings.hooks[event] ??= [];
		const present = settings.hooks[event].some((e) => JSON.stringify(e).includes('agent-registry.mjs'));
		if (!present) {
			settings.hooks[event].push(entry);
			added.push(event);
		}
	}
	return added;
}

async function cmdUninstall() {
	const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
	if (!fs.existsSync(settingsFile)) return console.log('no user settings');
	const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
	for (const event of Object.keys(settings.hooks ?? {})) {
		settings.hooks[event] = settings.hooks[event].filter((e) => !JSON.stringify(e).includes('agent-registry.mjs'));
	}
	writeAtomic(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
	console.log('removed agent-registry hooks from user settings (the per-repo files are left in place)');
}

const HELP = `agent-registry ${VERSION}: per-machine checkout claims and verification slots.

  init                      opt this repo in on this machine (creates the LOCAL_AGENT_*.md files)
  install                   init + copy to ~/.claude/agent-registry and add user-level hooks
  uninstall                 remove the user-level hooks
  status                    refresh and print claims, slots, VERIFICATION_AVAILABLE
  cleanup                   remove entries whose process is gone; list old-but-alive ones
  claim [--path P]          claim the checkout (hooks do this on first write)
  release [--path P|--all]  release this session's claim(s)
  verify-acquire [--slot N] take a verification slot now (exit 2 if busy)
  verify-wait [--takeover-after MIN] [--max-minutes M] [--poll-seconds S]
                            wait in the background, acquire, then exit (0 acquired,
                            3 needs ping, 4 timeout)
  verify-started backend|frontend [--pid N]   record a server as up on the held slot
  verify-release [--keep-servers]             release the slot (stops servers it recorded)
  hold [--slot N] [--minutes M] / unhold [--slot N]   block (or allow) a takeover
  human-start [--slot N] [--pid-file F]... / human-stop [--slot N]   used by make start/stop
  hook session-start|session-end|pre-tool-use          Claude Code hook entry points

Exit codes: 0 ok, 1 error, 2 busy, 3 needs ping, 4 timeout, 5 not initialised.`;

async function main(argv) {
	const opts = parseArgs(argv);
	const cmd = opts._[0] ?? 'help';
	switch (cmd) {
		case 'hook':
			return runHook(opts._[1]);
		case 'init':
			return cmdInit();
		case 'install':
			return cmdInstall();
		case 'uninstall':
			return cmdUninstall();
		case 'status':
			return cmdStatus();
		case 'cleanup':
			return cmdCleanup();
		case 'claim':
			return cmdClaim(opts, false);
		case 'release':
			return cmdClaim(opts, true);
		case 'verify-acquire':
			return cmdVerifyAcquire(opts);
		case 'verify-wait':
			return cmdVerifyWait(opts);
		case 'verify-started':
			return cmdVerifyStarted(opts);
		case 'verify-release':
			return cmdVerifyRelease(opts);
		case 'hold':
			return cmdHold(opts, true);
		case 'unhold':
			return cmdHold(opts, false);
		case 'human-start':
			return cmdHuman(opts, true);
		case 'human-stop':
			return cmdHuman(opts, false);
		case 'version':
			return console.log(VERSION);
		default:
			return console.log(HELP);
	}
}

if (process.argv[1] && pathKey(canonicalPath(process.argv[1])) === pathKey(canonicalPath(SCRIPT_PATH))) {
	main(process.argv.slice(2)).catch((err) => {
		warn(err.message);
		process.exit(EXIT.ERROR);
	});
}
