// Usage: node record.mjs <outDir> <urlSubstring>
// Records a CDP screencast of the first page target whose URL contains <urlSubstring>.
// Stops when <outDir>/STOP exists. Writes frame-NNNNN.jpg and frames.txt (frame, timestamp seconds).
import fs from 'node:fs';
import path from 'node:path';

const [outDir, match = ''] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const targets = await (await fetch('http://localhost:9222/json')).json();
const target = targets.find((t) => t.type === 'page' && t.url.includes(match));
if (!target) {
	console.error('no page target matching', match, targets.map((t) => t.url));
	process.exit(1);
}
console.log('recording', target.url);

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
const index = [];
let n = 0;

ws.addEventListener('open', () => {
	send('Page.enable');
	send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
});

ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.method !== 'Page.screencastFrame') return;
	const { data, metadata, sessionId } = msg.params;
	const name = `frame-${String(n++).padStart(5, '0')}.jpg`;
	fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64'));
	index.push(`${name} ${metadata.timestamp}`);
	send('Page.screencastFrameAck', { sessionId });
});

const timer = setInterval(() => {
	if (fs.existsSync(path.join(outDir, 'STOP'))) {
		clearInterval(timer);
		send('Page.stopScreencast');
		fs.writeFileSync(path.join(outDir, 'frames.txt'), index.join('\n') + '\n');
		console.log('stopped, frames:', n);
		setTimeout(() => process.exit(0), 300);
	}
}, 200);
