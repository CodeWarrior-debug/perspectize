// Pixel check of the mobile drawing against the real app's mobile Library page (YouTube video).
//
// Renders the app's /content-library?f.type=youtube_video at 390x844 (isMobile, DSF 2), with the
// YouTube sample rows from src/mobile-data.ts served through a mocked GraphQL route and the
// thumbnail placeholder served for i.ytimg.com, then renders index.html?phone=youtube the same way.
// Prints text-box geometry deltas and the share of differing pixels, and writes
// <prefix>-real.png, -drawn.png, -diff.png and -side-by-side.png into <outDir>.
//
// Needs, from the repo root:
//   VITE_DEMO_MODE=true pnpm --dir frontend exec vite dev --port 5191   (demo mode: no Clerk, no sign-in)
//   python3 -m http.server 8765                                          (serves the tool and the fonts)
// then:
//   node tools/content-type-designer/scripts/compare_mobile.mjs http://localhost:5191 \
//     "http://127.0.0.1:8765/tools/content-type-designer/index.html?phone=youtube" <outDir> <prefix>
// Uses frontend/'s Playwright and the installed Google Chrome. Read-only: nothing is written outside <outDir>.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, '../../../frontend/package.json'));
const { chromium } = require('@playwright/test');

const [appBase, toolUrl, outDir, prefix] = process.argv.slice(2);
const ph = await import(pathToFileURL(join(HERE, '../dist/mobile-data.js')).href);
const fixtures = ph.YOUTUBE_MOBILE_FIXTURES;
const W = 390, H = 844, DSF = 2;

const items = fixtures.map((f, i) => ({
	id: String(i + 1), name: f.title, addedByUserID: 1, url: `https://www.youtube.com/watch?v=${f.videoId}`,
	contentType: 'YOUTUBE_VIDEO', verseStartID: null, verseEndID: null, displayTitle: null,
	length: f.seconds, lengthUnits: 'seconds', lengthDisplay: null, viewCount: f.views, likeCount: f.likes,
	channelTitle: f.channel, publishedAt: f.published + 'T12:00:00Z', tags: [], description: '',
	movie: null, customFields: null, book: null, webPage: null,
	primaryCategory: f.category ? { id: String(10 + i), wikidataQid: null, label: f.category, description: null, entityType: null, wikipediaUrl: null } : null,
	createdAt: f.added + 'T12:00:00Z', updatedAt: f.added + 'T12:00:00Z',
}));
const perspectives = fixtures.map((f, i) => (f.hasPerspective ? { id: String(100 + i), contentID: String(i + 1), userID: 1 } : null)).filter(Boolean);

const browser = await chromium.launch({ channel: 'chrome' });
const ctxOpts = { viewport: { width: W, height: H }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true, colorScheme: 'light' };

// Text leaves with their boxes, walking into shadow roots.
const textBoxes = () => {
	const out = [];
	const walk = (node) => {
		for (const e of node.children) {
			const cs = getComputedStyle(e);
			if (cs.display === 'none') continue;
			if (e.shadowRoot) walk(e.shadowRoot);
			walk(e);
			const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
			const r = e.getBoundingClientRect();
			if (own && r.width > 0) out.push({ t: own.slice(0, 28), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), f: `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`, c: cs.color });
			if (['svg', 'img', 'input', 'BUTTON'].includes(e.tagName) || e.tagName === 'svg' || e.tagName === 'IMG' || e.tagName === 'INPUT') {
				if (r.width > 0 && !own) out.push({ t: `<${e.tagName.toLowerCase()}>`, x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), f: '', c: cs.color });
			}
		}
	};
	walk(document.body);
	return out;
};

// --- real app
const real = await browser.newContext(ctxOpts);
const rp = await real.newPage();
await rp.route('**/i.ytimg.com/**', (route) => {
	const id = new URL(route.request().url()).pathname.split('/')[2];
	const f = fixtures.find((x) => x.videoId === id);
	route.fulfill({ status: 200, contentType: 'image/svg+xml', body: f ? ph.youtubeThumbSvg(f.hue) : '' });
});
await rp.route('**/graphql', async (route) => {
	let body = {};
	try { body = route.request().postDataJSON() ?? {}; } catch {}
	const op = body.operationName ?? (String(body.query ?? '').match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? '?');
	let data = null;
	if (op === 'Me') data = { me: { id: '1', username: 'alice', role: 'USER', onboarding: { version: 99, displayNextSession: false, completedAt: '2026-01-01T00:00:00Z' } } };
	else if (op === 'ListContent') data = { content: { items, pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, totalCount: items.length } };
	else if (/Perspectives/i.test(op)) data = { perspectives: { items: perspectives, pageInfo: { hasNextPage: false }, totalCount: perspectives.length } };
	route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
});
await rp.goto(`${appBase}/content-library?demo_as=alice&f.type=youtube_video`, { waitUntil: 'networkidle' });
await rp.waitForSelector('[data-testid="activity-card-list"] img');
await rp.addStyleTag({ content: '[data-testid="demo-banner"]{display:none!important}' });
await rp.evaluate(() => document.fonts.ready);
await rp.waitForTimeout(800);
const realPng = `${outDir}/${prefix}-real.png`;
await rp.screenshot({ path: realPng });
const realBoxes = await rp.evaluate(textBoxes);

// --- drawing
const drawn = await browser.newContext(ctxOpts);
const dp = await drawn.newPage();
const errors = [];
dp.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
dp.on('pageerror', (e) => errors.push(String(e)));
await dp.goto(toolUrl, { waitUntil: 'networkidle' });
await dp.evaluate(() => document.fonts.ready);
await dp.waitForTimeout(500);
const fonts = await dp.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`));
const drawnPng = `${outDir}/${prefix}-drawn.png`;
await dp.screenshot({ path: drawnPng });
const drawnBoxes = await dp.evaluate(textBoxes);
console.log('tool console errors:', errors.length ? errors : 'none');
console.log('tool fonts loaded:', fonts.join(' | ') || 'none (serve from the repo root)');

// --- geometry deltas, matched by text in order
const used = new Set();
let worst = [];
for (const r of realBoxes) {
	let i = -1;
	if (r.t.startsWith('<')) {
		let best = Infinity;
		drawnBoxes.forEach((d, k) => { if (!used.has(k) && d.t === r.t) { const dist = Math.abs(d.x - r.x) + Math.abs(d.y - r.y) + Math.abs(d.w - r.w) + Math.abs(d.h - r.h); if (dist < best) { best = dist; i = k; } } });
	} else i = drawnBoxes.findIndex((d, k) => !used.has(k) && d.t === r.t);
	if (i < 0) { worst.push({ d: 999, line: `MISSING in drawing: ${r.t} @${r.x},${r.y}` }); continue; }
	used.add(i);
	const d = drawnBoxes[i];
	const delta = Math.max(Math.abs(d.x - r.x), Math.abs(d.y - r.y), Math.abs(d.w - r.w), Math.abs(d.h - r.h));
	const fontDiff = r.f && d.f !== r.f ? ` font real[${r.f}] drawn[${d.f}]` : '';
	const colDiff = r.c !== d.c ? ` color real[${r.c}] drawn[${d.c}]` : '';
	if (delta > 0.5 || fontDiff || colDiff) worst.push({ d: delta, line: `${r.t}: real ${r.x},${r.y} ${r.w}x${r.h} drawn ${d.x},${d.y} ${d.w}x${d.h}${fontDiff}${colDiff}` });
}
drawnBoxes.forEach((d, k) => { if (!used.has(k)) worst.push({ d: 998, line: `EXTRA in drawing: ${d.t} @${d.x},${d.y}` }); });
worst.sort((a, b) => b.d - a.d);
console.log(`geometry: ${realBoxes.length} real boxes, ${worst.length} differ (>0.5px, font or colour)`);
for (const w of worst.slice(0, 60)) console.log('  ' + w.line);

// --- pixel diff in a canvas
const dc = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const cp = await dc.newPage();
const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const result = await cp.evaluate(async ({ a, b }) => {
	const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
	const [ia, ib] = await Promise.all([load(a), load(b)]);
	const w = ia.width, h = ia.height;
	const get = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
	const da = get(ia), db = get(ib);
	const diff = new ImageData(w, h);
	let strict = 0, tol = 0;
	for (let p = 0; p < w * h * 4; p += 4) {
		const d = Math.max(Math.abs(da.data[p] - db.data[p]), Math.abs(da.data[p + 1] - db.data[p + 1]), Math.abs(da.data[p + 2] - db.data[p + 2]));
		const grey = 255 - (da.data[p] * 0.3 + da.data[p + 1] * 0.59 + da.data[p + 2] * 0.11) * 0.25;
		if (d > 0) strict++;
		if (d > 32) { tol++; diff.data[p] = 230; diff.data[p + 1] = 0; diff.data[p + 2] = 60; }
		else if (d > 0) { diff.data[p] = 255; diff.data[p + 1] = 190; diff.data[p + 2] = 120; }
		else { diff.data[p] = diff.data[p + 1] = diff.data[p + 2] = grey; }
		diff.data[p + 3] = 255;
	}
	// Where the differing pixels are: counts per 20×20 CSS-px cell.
	const cells = {};
	for (let p = 0; p < w * h; p++) {
		const q = p * 4;
		const d = Math.max(Math.abs(da.data[q] - db.data[q]), Math.abs(da.data[q + 1] - db.data[q + 1]), Math.abs(da.data[q + 2] - db.data[q + 2]));
		if (d > 0) { const k = `${Math.floor((p % w) / 40) * 20},${Math.floor(Math.floor(p / w) / 40) * 20}`; cells[k] = (cells[k] ?? 0) + 1; }
	}
	var hot = Object.entries(cells).sort((a, b) => b[1] - a[1]).slice(0, 15);
	const dcv = document.createElement('canvas'); dcv.width = w; dcv.height = h; dcv.getContext('2d').putImageData(diff, 0, 0);
	// side by side: real | drawn | diff, with labels
	const gap = 24, top = 56;
	const s = document.createElement('canvas'); s.width = w * 3 + gap * 4; s.height = h + top + gap;
	const sx = s.getContext('2d'); sx.fillStyle = '#e9ebef'; sx.fillRect(0, 0, s.width, s.height);
	sx.fillStyle = '#16191d'; sx.font = '600 28px system-ui';
	[['Real app (ActivityCardList, 390px)', ia], ['Content Type Designer drawing', ib], ['Pixel diff (red > 32/255, orange any)', dcv]].forEach(([label, img], k) => {
		const x = gap + k * (w + gap); sx.fillText(label, x, 38); sx.drawImage(img, x, top);
	});
	return { hot, strict: strict / (w * h), tol: tol / (w * h), w, h, diff: dcv.toDataURL('image/png'), side: s.toDataURL('image/png') };
}, { a: b64(realPng), b: b64(drawnPng) });
writeFileSync(`${outDir}/${prefix}-diff.png`, Buffer.from(result.diff.split(',')[1], 'base64'));
writeFileSync(`${outDir}/${prefix}-side-by-side.png`, Buffer.from(result.side.split(',')[1], 'base64'));
console.log('diff hot spots (css x,y of 20px cell: device px):', result.hot.map(([k,v])=>`${k}:${v}`).join('  '));
console.log(`pixels ${result.w}x${result.h}: strict diff ${(result.strict * 100).toFixed(2)}%, diff >32/255 ${(result.tol * 100).toFixed(2)}%`);
await browser.close();
