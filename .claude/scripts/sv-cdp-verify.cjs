#!/usr/bin/env node
/**
 * sv-cdp-verify.cjs — drive the signed-in Chrome over CDP for UI self-verification.
 *
 * Starting point for ad-hoc browser checks. It attaches to the Chrome that
 * `.claude/scripts/sv-chrome.sh` left running (remote debugging on :9222, signed-in
 * `.claude/sv-profile/`), opens ITS OWN tab (your other tabs are untouched), runs a
 * scenario, prints JSON, and closes only its own tab. Needs no Claude Code restart or
 * MCP config change — see .docs/VERIFICATION.md §0.
 *
 * Usage:   node .claude/scripts/sv-cdp-verify.cjs [scenario]
 * Env:     CDP_URL (default http://127.0.0.1:9222)   BASE_URL (default http://localhost:5173)
 *          OUT_DIR (screenshots; default os.tmpdir())
 * Adapt:   add a function to SCENARIOS below. Helpers: hoverCell, popover, pasteRead.
 *
 * Never handle credentials here. If the page is signed out, stop and ask the human.
 * Note: copy checks overwrite the system clipboard.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const OUT_DIR = process.env.OUT_DIR || os.tmpdir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// playwright-core lives in pnpm's nested store (it's a transitive dep of vitest browser mode).
function loadPlaywright() {
	const store = path.join(__dirname, '..', '..', 'frontend', 'node_modules', '.pnpm');
	const dir = fs.existsSync(store) && fs.readdirSync(store).find((d) => d.startsWith('playwright-core@'));
	if (!dir) throw new Error('playwright-core not found — run `pnpm install --dir frontend` first');
	return require(path.join(store, dir, 'node_modules', 'playwright-core'));
}

/** Helpers bound to one page. */
function helpers(page) {
	// Cells of the first data row, by AG Grid col-id.
	const cell = (col) => page.locator(`.ag-center-cols-container .ag-row[row-index="0"] .ag-cell[col-id="${col}"]`).first();

	// Scroll into view FIRST (a scroll rightly cancels a pending popover open), settle, then hover.
	// Also waits out any AG Grid header tooltip, whose box can sit on top of row 0.
	async function hoverCell(col, settleMs = 1000) {
		await page.locator('.ag-tooltip').first().waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
		await cell(col).scrollIntoViewIfNeeded();
		await sleep(600);
		await page.mouse.move(5, 5);
		await sleep(400);
		await cell(col).hover();
		await sleep(settleMs);
	}

	// Computed style + contents of the cell popover, or null when closed.
	const popover = () =>
		page.evaluate(() => {
			const el = document.querySelector('[data-testid="cell-popover"]');
			if (!el) return null;
			const s = getComputedStyle(el);
			return {
				text: el.innerText.slice(0, 80),
				fontSize: s.fontSize,
				padding: s.padding,
				radius: s.borderRadius,
				bg: s.backgroundColor,
				buttons: [...el.querySelectorAll('button')].map((b) => b.getAttribute('data-testid') || b.textContent.trim()),
			};
		});

	// Paste the REAL clipboard into the search box, read it back, clear it. Proves what was actually stored.
	async function pasteRead() {
		const search = page.locator('input[placeholder="Search content..."]').first();
		await search.click();
		await page.keyboard.press('ControlOrMeta+A');
		await page.keyboard.press('ControlOrMeta+V');
		await sleep(300);
		const value = await search.inputValue();
		await page.keyboard.press('ControlOrMeta+A');
		await page.keyboard.press('Backspace');
		await sleep(300);
		return value;
	}

	return { cell, hoverCell, popover, pasteRead };
}

const SCENARIOS = {
	// Activity-table cell popover: styling parity, copy values, tags multi-select, A→B, scroll-close.
	async 'cell-popover'(page, h) {
		const out = { columns: {} };
		for (const col of ['item', 'category', 'views', 'likes', 'percentLiked', 'tags']) {
			if ((await h.cell(col).count()) === 0) { out.columns[col] = 'no visible cell'; continue; }
			await h.hoverCell(col);
			const p = await h.popover();
			out.columns[col] = p && { text: p.text, fontSize: p.fontSize, padding: p.padding, radius: p.radius };
		}
		await h.hoverCell('likes');
		await page.screenshot({ path: path.join(OUT_DIR, 'cell-popover-likes.png') });
		await page.locator('[data-testid="tip-copy"]').click({ timeout: 4000 });
		out.pastedLikes = await h.pasteRead(); // expect the raw number, no commas

		await h.hoverCell('tags');
		const chips = page.locator('[data-testid^="tip-item-"]');
		out.tagChips = await chips.count();
		out.copySelectedDisabledInitially = await page.locator('[data-testid="tip-copy-selected"]').isDisabled();
		await chips.nth(2).click();
		await chips.nth(4).click();
		await page.locator('[data-testid="tip-copy-selected"]').click();
		out.pastedSelected = await h.pasteRead();
		await h.hoverCell('tags');
		await page.locator('[data-testid="tip-copy-all"]').click();
		out.pastedAll = await h.pasteRead();

		// A→B: A's popover must be gone by ~150ms after moving to B; B opens after the delay.
		await h.hoverCell('views');
		await h.cell('likes').hover();
		await sleep(250);
		out.afterMoveTo_B_250ms = await h.popover();
		await sleep(900);
		out.afterMoveTo_B_1150ms = (await h.popover())?.text ?? null;

		// Scrolling closes it (AG Grid recycles cell DOM, so the anchor would go stale).
		await h.hoverCell('likes');
		const before = (await h.popover()) !== null;
		await page.mouse.wheel(0, 300);
		await sleep(500);
		out.scroll = { openBefore: before, openAfter: (await h.popover()) !== null };
		return out;
	},
};

(async () => {
	const name = process.argv[2] || 'cell-popover';
	if (!SCENARIOS[name]) {
		console.error(`unknown scenario "${name}". Available: ${Object.keys(SCENARIOS).join(', ')}`);
		process.exit(2);
	}
	const browser = await loadPlaywright().chromium.connectOverCDP(CDP_URL);
	const page = await browser.contexts()[0].newPage(); // own tab
	let result;
	try {
		await page.goto(`${BASE_URL}/?mode=all`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.ag-row .ag-cell', { timeout: 20000 }); // times out if signed out → ask the human
		await sleep(1500);
		result = await SCENARIOS[name](page, helpers(page));
	} catch (e) {
		result = { error: String(e).slice(0, 500) };
		await page.screenshot({ path: path.join(OUT_DIR, 'sv-cdp-verify-error.png') }).catch(() => {});
	} finally {
		await page.close().catch(() => {}); // close only our tab; never browser.close() (would end the human's Chrome)
	}
	console.log(JSON.stringify(result, null, 2));
	process.exit(result && result.error ? 1 : 0);
})();
