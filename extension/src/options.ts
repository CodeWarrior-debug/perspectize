import { getBaseUrl, PRODUCTION_BASE } from './baseUrl.js';

const input = document.getElementById('base-url') as HTMLInputElement;
const status = document.getElementById('status') as HTMLElement;

async function load() {
	const { baseUrl } = (await chrome.storage.sync.get('baseUrl')) as { baseUrl?: string };
	input.value = getBaseUrl(baseUrl);
}

async function save(value: string) {
	const origin = getBaseUrl(value);
	// Only the origin is stored; production is stored as "no override".
	if (origin === PRODUCTION_BASE) await chrome.storage.sync.remove('baseUrl');
	else await chrome.storage.sync.set({ baseUrl: origin });
	input.value = origin;
	status.textContent = `Saved: ${origin}`;
}

document.getElementById('save')?.addEventListener('click', () => void save(input.value));
document.getElementById('use-production')?.addEventListener('click', () => void save(PRODUCTION_BASE));
document.getElementById('use-local')?.addEventListener('click', () => void save('http://localhost:5173'));

void load();
