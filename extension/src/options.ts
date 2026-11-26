import { getBaseUrl } from './baseUrl.js';

const input = document.getElementById('base-url') as HTMLInputElement;
const status = document.getElementById('status') as HTMLElement;

// `local`, not `sync`: the address stays on this browser and is not copied to a Google account.
async function load() {
	const { baseUrl } = (await chrome.storage.local.get('baseUrl')) as { baseUrl?: string };
	input.value = getBaseUrl(baseUrl) ?? '';
}

async function save(value: string) {
	const origin = getBaseUrl(value);
	if (!origin) {
		status.textContent = 'Enter a full address, e.g. https://example.com';
		return;
	}
	// Only the origin is stored.
	await chrome.storage.local.set({ baseUrl: origin });
	input.value = origin;
	status.textContent = `Saved: ${origin}`;
}

async function clear() {
	await chrome.storage.local.remove('baseUrl');
	input.value = '';
	status.textContent = 'Cleared.';
}

document.getElementById('save')?.addEventListener('click', () => void save(input.value));
document.getElementById('clear')?.addEventListener('click', () => void clear());
document.getElementById('use-local')?.addEventListener('click', () => void save('http://localhost:5173'));

void load();
