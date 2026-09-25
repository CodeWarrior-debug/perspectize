// Real (trusted) mouse/keyboard input over CDP against the sv-chrome debug port (9222).
// Usage: node mouse.mjs <urlSubstring> <cmd> [args]
//   move <x> <y> [ms]   smooth move from the last known position (kept in a tmp file)
//   click <x> <y>       move there, then press+release
//   type <text>         Input.insertText into the focused element
//   key <Enter|Tab|Escape|ArrowDown>
//   wait <ms>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [match, cmd, ...args] = process.argv.slice(2);
// Last pointer position survives between invocations so moves stay smooth. Delete it to reset.
const STATE = path.join(os.tmpdir(), 'perspectize-video-mouse-pos.json');
const last = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { x: 40, y: 40 };

const targets = await (await fetch('http://localhost:9222/json')).json();
const t = targets.find((x) => x.type === 'page' && x.url.includes(match));
if (!t) throw new Error('no target for ' + match);
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) pending.get(m.id)(m);
});
const send = (method, params = {}) =>
	new Promise((res) => {
		const i = ++id;
		pending.set(i, res);
		ws.send(JSON.stringify({ id: i, method, params }));
	});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function moveTo(x, y, ms = 500) {
	const steps = Math.max(8, Math.round(ms / 16));
	for (let i = 1; i <= steps; i++) {
		const k = i / steps;
		const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
		await send('Input.dispatchMouseEvent', {
			type: 'mouseMoved',
			x: last.x + (x - last.x) * e,
			y: last.y + (y - last.y) * e,
		});
		await sleep(ms / steps);
	}
	last.x = x;
	last.y = y;
	fs.writeFileSync(STATE, JSON.stringify(last));
}

if (cmd === 'move') await moveTo(+args[0], +args[1], args[2] ? +args[2] : 500);
else if (cmd === 'click') {
	await moveTo(+args[0], +args[1], 500);
	await sleep(120);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: last.x, y: last.y, button: 'left', clickCount: 1 });
	await sleep(80);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', clickCount: 1 });
} else if (cmd === 'type') {
	for (const ch of args.join(' ')) {
		await send('Input.insertText', { text: ch });
		await sleep(70);
	}
} else if (cmd === 'key') {
	const key = args[0];
	const codes = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40 };
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: codes[key], text: key === 'Enter' ? '\r' : undefined });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: codes[key] });
} else if (cmd === 'wait') await sleep(+args[0]);
ws.close();
