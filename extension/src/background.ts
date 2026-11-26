import { buildAddUrl, isAddableUrl } from './addUrl.js';
import { getBaseUrl } from './baseUrl.js';

const MENU_ID = 'add-to-perspectize';
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;
const BADGE_MS = 2000;

/** Opens the add form for `url` in a small popup window on the Perspectize origin chosen on the options page. */
async function openAddWindow(url: string | undefined, title?: string) {
	if (!isAddableUrl(url)) {
		flagUnsupported();
		return;
	}
	const { baseUrl } = (await chrome.storage.local.get('baseUrl')) as { baseUrl?: string };
	const base = getBaseUrl(baseUrl);
	if (!base) {
		// No address chosen yet: ask for it instead of opening nothing.
		await chrome.runtime.openOptionsPage();
		return;
	}
	await chrome.windows.create({
		url: buildAddUrl(base, url as string, title),
		type: 'popup',
		width: POPUP_WIDTH,
		height: POPUP_HEIGHT,
	});
}

/** A brief "!" on the toolbar icon: this page can't be added. */
function flagUnsupported() {
	chrome.action.setBadgeText({ text: '!' });
	chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' });
	setTimeout(() => chrome.action.setBadgeText({ text: '' }), BADGE_MS);
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: MENU_ID,
		title: 'Add to Perspectize',
		contexts: ['page', 'link'],
	});
});

// The toolbar button and the keyboard shortcut (`_execute_action`) both fire this.
chrome.action.onClicked.addListener((tab) => {
	void openAddWindow(tab.url, tab.title);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId !== MENU_ID) return;
	// On a link the link's address is what gets added; the page's title would mislabel it.
	if (info.linkUrl) void openAddWindow(info.linkUrl);
	else void openAddWindow(info.pageUrl ?? tab?.url, tab?.title);
});
