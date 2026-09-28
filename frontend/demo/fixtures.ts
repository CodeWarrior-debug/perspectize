import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

export { expect };

const VIDEO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'videos');

export type Persona = 'alice' | 'ben' | 'carmen' | 'newbie';

export interface TourOptions {
	/** true in the `record` project: pace for humans, show captions + cursor, save a video. */
	recording: boolean;
}

/**
 * The Tour API every tour script uses. In e2e runs captions and pauses are
 * no-ops and clicks/typing are instant, so the same script is a regular test;
 * in recording runs they become the narration and pacing of the video.
 */
export interface Tour {
	readonly recording: boolean;
	/** Open `path` signed in as `persona` (null = signed out). */
	start(opts: { persona: Persona | null; path?: string; video?: string }): Promise<void>;
	/** Show a caption bar; in recordings, hold it long enough to read. */
	caption(text: string, holdMs?: number): Promise<void>;
	hideCaption(): Promise<void>;
	/** Move the visible cursor to the target, then click it (clears any caption first). */
	click(target: Locator): Promise<void>;
	/** Replace the target's value — typed like a person in recordings, filled instantly otherwise. */
	type(target: Locator, text: string): Promise<void>;
	pause(ms: number): Promise<void>;
}

// Injected into every page in recording runs: a caption bar and a cursor dot
// that follows real mouse events (headless video has no OS cursor).
const OVERLAY_SCRIPT = `
(() => {
	const install = () => {
		if (document.getElementById('__tour_cursor')) return;
		const style = document.createElement('style');
		style.textContent = \`
			#__tour_cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
				border-radius: 50%; background: rgba(250, 204, 21, .45); border: 2px solid rgba(202, 138, 4, .9);
				pointer-events: none; transition: transform .12s ease; left: -40px; top: -40px; }
			#__tour_cursor.down { transform: scale(.7); }
			#__tour_caption { position: fixed; z-index: 2147483646; left: 50%; bottom: 28px; transform: translateX(-50%);
				max-width: 80%; padding: 12px 20px; border-radius: 12px; background: rgba(15, 23, 42, .88); color: #fff;
				font: 500 20px/1.35 system-ui, sans-serif; text-align: center; pointer-events: none;
				box-shadow: 0 8px 30px rgba(0,0,0,.25); opacity: 0; transition: opacity .25s ease; }
			#__tour_caption.show { opacity: 1; }\`;
		document.head.appendChild(style);
		const cursor = document.createElement('div');
		cursor.id = '__tour_cursor';
		const caption = document.createElement('div');
		caption.id = '__tour_caption';
		document.body.append(cursor, caption);
		addEventListener('mousemove', (e) => { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }, true);
		addEventListener('mousedown', () => cursor.classList.add('down'), true);
		addEventListener('mouseup', () => cursor.classList.remove('down'), true);
		window.__tourCaption = (text) => {
			caption.textContent = text || '';
			caption.classList.toggle('show', !!text);
		};
	};
	if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install);
	else install();
})();
`;

/** Reading time for a caption: ~220 wpm plus a beat. */
function readingMs(text: string): number {
	return Math.max(1800, (text.split(/\s+/).length / 220) * 60_000 + 900);
}

async function setCaption(page: Page, text: string) {
	await page.evaluate((t) => (window as unknown as { __tourCaption?: (t: string) => void }).__tourCaption?.(t), text);
}

export const test = base.extend<TourOptions & { tour: Tour }>({
	recording: [false, { option: true }],

	tour: async ({ page, recording }, use, testInfo) => {
		let videoName: string | undefined;
		if (recording) await page.addInitScript(OVERLAY_SCRIPT);

		const tour: Tour = {
			recording,
			async start({ persona, path: to = '/', video }) {
				videoName = video;
				const url = new URL(to, 'http://x');
				url.searchParams.set('demo_as', persona ?? '');
				await page.goto(url.pathname + url.search);
				await expect(page.getByTestId('demo-banner')).toBeVisible();
				if (recording) {
					// park the cursor mid-screen so its first move is visible
					await page.mouse.move(640, 360);
				}
			},
			async caption(text, holdMs) {
				if (!recording) return;
				await setCaption(page, text);
				await page.waitForTimeout(holdMs ?? readingMs(text));
			},
			async hideCaption() {
				if (recording) await setCaption(page, '');
			},
			async click(target) {
				if (recording) {
					// Captions narrate the step before an action; clear it so it
					// never covers the control being clicked.
					await setCaption(page, '');
					await target.scrollIntoViewIfNeeded();
					const box = await target.boundingBox();
					if (box) {
						await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
						await page.waitForTimeout(350);
					}
				}
				await target.click();
				if (recording) await page.waitForTimeout(500);
			},
			async type(target, text) {
				if (recording) {
					await tour.click(target);
					await target.press('ControlOrMeta+A'); // replace, don't append to a prefilled value
					await target.pressSequentially(text, { delay: 45 });
					await page.waitForTimeout(400);
				} else {
					await target.fill(text);
				}
			},
			async pause(ms) {
				if (recording) await page.waitForTimeout(ms);
			},
		};

		await use(tour);

		// Save the recording under a stable name so it can be published as-is.
		const video = page.video();
		if (recording && video && videoName && testInfo.status === testInfo.expectedStatus) {
			await page.waitForTimeout(800); // let the final frame breathe
			await page.close();
			mkdirSync(VIDEO_DIR, { recursive: true });
			await video.saveAs(path.join(VIDEO_DIR, `${videoName}.webm`));
		}
	},
});

/** The Activity grid row for a content title (AG Grid renders rows as divs). */
export function activityRow(page: Page, title: string | RegExp): Locator {
	return page.locator('.ag-center-cols-container .ag-row').filter({ hasText: title });
}
