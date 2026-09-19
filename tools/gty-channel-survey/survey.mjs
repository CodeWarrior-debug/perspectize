// Survey / sync of the Grace to You YouTube channel via the YouTube Data API v3.
//
// Usage:
//   YOUTUBE_API_KEY=... node survey.mjs                 # full pull
//   YOUTUBE_API_KEY=... node survey.mjs --incremental   # only videos newer than out/playlist-items.json
//   YOUTUBE_API_KEY=... node survey.mjs --channel UCxxxx
//
// Writes raw JSON to ./out/ (gitignored) and prints a summary. Never logs the API key.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
	console.error('Set YOUTUBE_API_KEY in the environment.');
	process.exit(1);
}

const args = process.argv.slice(2);
const INCREMENTAL = args.includes('--incremental');
const channelFlag = args.indexOf('--channel');
const CHANNEL_ID = channelFlag >= 0 ? args[channelFlag + 1] : 'UCneKpMu9SFGlt2usTdAI75A';
const UPLOADS_PLAYLIST = 'UU' + CHANNEL_ID.slice(2);
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');
const BASE = 'https://www.googleapis.com/youtube/v3';

const PAGE_SIZE = 50; // API maximum for playlistItems and videos
const PAUSE_MS = 150; // courtesy gap between calls
const MAX_ATTEMPTS = 5;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function api(path, params) {
	const url = new URL(`${BASE}/${path}`);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	url.searchParams.set('key', KEY);

	for (let attempt = 1; ; attempt++) {
		let res;
		try {
			res = await fetch(url);
		} catch (err) {
			if (attempt >= MAX_ATTEMPTS) throw new Error(`${path} -> network error: ${err.message}`);
			await sleep(2 ** attempt * 500);
			continue;
		}
		if (res.ok) {
			await sleep(PAUSE_MS);
			return res.json();
		}
		if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
			await sleep(2 ** attempt * 500);
			continue;
		}
		const body = await res.json().catch(() => ({}));
		// Deliberately omit the URL so the key never reaches the terminal.
		throw new Error(`${path} -> ${res.status}: ${body?.error?.message ?? 'unknown error'}`);
	}
}

async function readJson(name, fallback) {
	try {
		return JSON.parse(await readFile(join(OUT_DIR, name), 'utf8'));
	} catch {
		return fallback;
	}
}

// The uploads playlist is newest-first, so in incremental mode we stop as soon as
// a page contains a video we already have.
async function fetchPlaylistItems(knownIds) {
	const items = [];
	let pageToken;
	let hitKnown = false;
	do {
		const page = await api('playlistItems', {
			part: 'snippet,contentDetails',
			playlistId: UPLOADS_PLAYLIST,
			maxResults: String(PAGE_SIZE),
			...(pageToken && { pageToken })
		});
		for (const it of page.items) {
			if (knownIds.has(it.contentDetails.videoId)) hitKnown = true;
			else items.push(it);
		}
		pageToken = page.nextPageToken;
		process.stderr.write(`\rplaylist items fetched: ${items.length}`);
	} while (pageToken && !(INCREMENTAL && hitKnown));
	process.stderr.write('\n');
	return items;
}

async function fetchVideoDetails(ids) {
	const videos = [];
	for (let i = 0; i < ids.length; i += PAGE_SIZE) {
		const page = await api('videos', {
			part: 'contentDetails,statistics,snippet',
			id: ids.slice(i, i + PAGE_SIZE).join(',')
		});
		videos.push(...page.items);
		process.stderr.write(`\rvideo details: ${videos.length}/${ids.length}`);
	}
	process.stderr.write('\n');
	return videos;
}

function durationSeconds(iso) {
	const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
	if (!m) return 0;
	const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => (x === undefined ? 0 : Number(x)));
	return d * 86400 + h * 3600 + min * 60 + s;
}

const BUCKETS = [
	['<= 1 min (shorts)', 60],
	['1-5 min (clips)', 300],
	['5-20 min', 1200],
	['20-45 min', 2700],
	['45-90 min (full sermon)', 5400],
	['> 90 min', Infinity]
];
const bucketOf = (sec) => BUCKETS.find(([, max]) => sec <= max)[0];

const SERMON_URL = /gty\.org\/sermons\/(\d+)-(\d+)/;

function toRows(items, videos) {
	const byId = new Map(videos.map((v) => [v.id, v]));
	return items.map((it) => {
		const id = it.contentDetails.videoId;
		const v = byId.get(id);
		const title = it.snippet.title;
		const code = SERMON_URL.exec(it.snippet.description ?? '');
		const paren = /\(([^)]*)\)/.exec(title);
		const seconds = v ? durationSeconds(v.contentDetails.duration) : null;
		return {
			id,
			title,
			publishedAt: it.contentDetails.videoPublishedAt,
			seconds,
			bucket: seconds === null ? 'unavailable (private/deleted)' : bucketOf(seconds),
			sermonPrefix: code ? Number(code[1]) : null,
			sermonCode: code ? `${code[1]}-${code[2]}` : null,
			titleParen: paren ? paren[1] : null
		};
	});
}

function summarize(rows) {
	const count = (fn) => {
		const m = new Map();
		for (const r of rows) m.set(fn(r), (m.get(fn(r)) ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	};

	console.log(`\nTotal uploads: ${rows.length}`);
	console.log('\n== Duration buckets ==');
	for (const [b, n] of count((r) => r.bucket)) console.log(`${String(n).padStart(5)}  ${b}`);

	console.log('\n== gty.org sermon code in description ==');
	console.log(`${rows.filter((r) => r.sermonCode).length} / ${rows.length} have a /sermons/NN-NNN link`);
	for (const [b] of BUCKETS) {
		const inBucket = rows.filter((r) => r.bucket === b);
		const coded = inBucket.filter((r) => r.sermonCode).length;
		console.log(`${String(coded).padStart(5)} / ${String(inBucket.length).padEnd(5)} coded  ${b}`);
	}

	console.log('\n== Sermon code prefix distribution (book-number theory: 1-66 = canon order) ==');
	for (const [p, n] of count((r) => r.sermonPrefix).filter(([p]) => p !== null))
		console.log(`${String(n).padStart(5)}  prefix ${p}`);

	console.log(`\n== Parenthetical in title ==\n${rows.filter((r) => r.titleParen).length} / ${rows.length} titles`);
	for (const [t, n] of count((r) => r.titleParen).filter(([t]) => t !== null).slice(0, 15))
		console.log(`${String(n).padStart(5)}  (${t})`);

	console.log('\n== Sample titles per bucket ==');
	for (const [b] of BUCKETS) {
		const sample = rows.filter((r) => r.bucket === b).slice(0, 4);
		if (!sample.length) continue;
		console.log(`\n${b}`);
		for (const r of sample)
			console.log(`  [${r.sermonCode ?? 'no code'}] ${Math.round((r.seconds ?? 0) / 60)}m  ${r.title.slice(0, 90)}`);
	}
}

await mkdir(OUT_DIR, { recursive: true });

const channel = await api('channels', { part: 'snippet,statistics', id: CHANNEL_ID });
await writeFile(join(OUT_DIR, 'channel.json'), JSON.stringify(channel, null, 2));
console.log(`Channel: ${channel.items[0].snippet.title} (${channel.items[0].statistics.videoCount} videos)`);

const prevItems = INCREMENTAL ? await readJson('playlist-items.json', []) : [];
const prevVideos = INCREMENTAL ? await readJson('videos.json', []) : [];
const knownIds = new Set(prevItems.map((i) => i.contentDetails.videoId));
if (INCREMENTAL) console.log(`Incremental: ${knownIds.size} videos already on disk`);

const newItems = await fetchPlaylistItems(knownIds);
const newVideos = await fetchVideoDetails(newItems.map((i) => i.contentDetails.videoId));
console.log(`New this run: ${newItems.length} videos`);

// New items are newer than everything on disk, so they go first.
const items = [...newItems, ...prevItems];
const videos = [...newVideos, ...prevVideos];
await writeFile(join(OUT_DIR, 'playlist-items.json'), JSON.stringify(items, null, 2));
await writeFile(join(OUT_DIR, 'videos.json'), JSON.stringify(videos, null, 2));

const rows = toRows(items, videos);
await writeFile(join(OUT_DIR, 'rows.json'), JSON.stringify(rows, null, 2));
summarize(rows);
console.log(`\nRaw data written to ${OUT_DIR}`);
