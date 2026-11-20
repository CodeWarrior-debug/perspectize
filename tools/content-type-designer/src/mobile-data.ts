/**
 * Data behind the mobile card list drawing (no DOM, so Node scripts can import
 * the compiled module too). A type is drawn on mobile once it has an entry in
 * MOBILE_CARDS; everything else about the card's look lives in mobile.ts and
 * mirrors frontend/src/lib/components/ActivityCardList.svelte.
 */
import { SAMPLES, type SampleRow, type TypeId } from './catalog.js';

/** One muted text-xs line under the title: facts joined by "·", then an optional category chip. */
export interface MobileLine {
  facts: string[];
  chip?: string;
  /** The first line sits 6px under the title (mt-1.5) and wraps; later lines sit 4px under (mt-1). */
  first: boolean;
}

export interface MobileThumb {
  src: string;
  /** Posters and covers are fitted (object-contain on the card colour); video thumbnails are cropped. */
  fitted: boolean;
  /** Play badge, only on cropped video thumbnails. */
  play: boolean;
}

export interface MobileCard {
  title: string;
  /** null = the empty grey slot the app shows when no image loads. */
  thumb: MobileThumb | null;
  lines: MobileLine[];
  /** The viewer already has a perspective: glasses instead of "+". */
  hasPerspective: boolean;
  /** The source page the thumbnail opens. */
  href?: string;
}

/**
 * The app's Type filter labels, in option order (CONTENT_TYPE_LABELS in
 * frontend/src/lib/utils/grid-config.ts). The mock's "Other types" pills and
 * the Type chip use them.
 */
export const APP_TYPE_LABELS: readonly string[] = ['YouTube Video', 'Claim', 'Bible Passage', 'Movie', 'Book', 'Webpage'];

export interface MobileCardSpec {
  /** The type's label in the app's Type filter (a proposed type uses its own label). */
  appLabel: string;
  /** Where the card's facts come from in the app, for the tooltip and the README. */
  source: string;
  cards: (rows: SampleRow[]) => MobileCard[];
}

/* ------------------------------------------------------------- formatting */

/** formatDurationSeconds in frontend/src/lib/utils/formatting.ts. */
export function formatDurationSeconds(seconds: number): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** formatCount in frontend/src/lib/utils/formatting.ts ("18.4 K", with the space). */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)} K`;
  if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(1)} M`;
  return `${(count / 1_000_000_000).toFixed(1)} B`;
}

function text(row: SampleRow, key: string): string | undefined {
  const v = row[key];
  return v === undefined ? undefined : typeof v === 'string' ? v : v.text;
}

function secondsOf(clock: string | undefined): number | null {
  if (!clock || !/^\d+(:\d{2}){1,2}$/.test(clock)) return null;
  return clock.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

function numberOf(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[,%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- YouTube */

/**
 * A stand-in for i.ytimg.com/vi/<id>/hqdefault.jpg: 480×360 with the black
 * letterbox bars YouTube adds above and below a 16:9 frame, so the app's
 * object-cover crop to 96×64 shows the same slivers of bar. Flat fills and no
 * text, so it rasterises the same way every time (gradients dither run to run).
 */
export function youtubeThumbSvg(hue: number): string {
  const a = `hsl(${hue} 55% 34%)`;
  const b = `hsl(${(hue + 40) % 360} 60% 58%)`;
  const c = `hsl(${(hue + 200) % 360} 45% 86%)`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">` +
    `<rect width="480" height="360" fill="#000"/>` +
    `<rect y="45" width="480" height="270" fill="${a}"/>` +
    `<polygon points="480,45 480,315 120,315" fill="${b}"/>` +
    `<circle cx="350" cy="150" r="70" fill="${c}" opacity="0.85"/>` +
    `<rect x="40" y="215" width="220" height="22" rx="4" fill="#fff" opacity="0.9"/>` +
    `<rect x="40" y="248" width="150" height="14" rx="4" fill="#fff" opacity="0.6"/>` +
    `</svg>`
  );
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** What the YouTube Data API would add to each sample row: an id for the thumbnail URL, and the viewer's perspective. */
const YOUTUBE_EXTRAS: { videoId: string; hue: number; hasPerspective: boolean }[] = [
  { videoId: 'smpBeatitud', hue: 28, hasPerspective: false },
  { videoId: 'smpIsaiah40', hue: 205, hasPerspective: true },
  { videoId: 'smpRevelatn', hue: 290, hasPerspective: false }
];

export interface YoutubeFixture {
  title: string;
  channel: string;
  seconds: number;
  views: number;
  likes: number;
  category?: string;
  videoId: string;
  hue: number;
  hasPerspective: boolean;
  published: string;
  added: string;
}

/**
 * The YouTube sample rows as the API fields the card reads. Likes are not a
 * column; they come from views × "% liked".
 */
export function youtubeFixtures(rows: SampleRow[] = SAMPLES.youtube ?? []): YoutubeFixture[] {
  return rows.map((row, i) => {
    const extra = YOUTUBE_EXTRAS[i % YOUTUBE_EXTRAS.length];
    const views = numberOf(text(row, 'audience')) ?? 0;
    const liked = numberOf(text(row, 'approval')) ?? 0;
    return {
      title: text(row, 'item') ?? '',
      channel: text(row, 'creator') ?? '',
      seconds: secondsOf(text(row, 'length')) ?? 0,
      views,
      likes: Math.round((views * liked) / 100),
      category: text(row, 'category'),
      videoId: extra.videoId,
      hue: extra.hue,
      hasPerspective: extra.hasPerspective,
      published: text(row, 'date') ?? '2026-01-01',
      added: text(row, 'createdAt') ?? '2026-01-01'
    };
  });
}

/** The default export the comparison script reads. */
export const YOUTUBE_MOBILE_FIXTURES = youtubeFixtures();

/** ActivityCardList's last branch: channel · duration · category chip, then views · likes. */
const youtubeSpec: MobileCardSpec = {
  appLabel: 'YouTube Video',
  source: 'ActivityCardList.svelte, YouTube branch: channelTitle · formatDuration(length) · primaryCategory chip; then formatCount(viewCount) views · formatCount(likeCount) likes',
  cards: (rows) =>
    youtubeFixtures(rows).map((f) => {
      const facts = [f.channel, f.seconds ? formatDurationSeconds(f.seconds) : ''].filter(Boolean);
      return {
        title: f.title,
        href: `https://www.youtube.com/watch?v=${f.videoId}`,
        thumb: { src: svgDataUri(youtubeThumbSvg(f.hue)), fitted: false, play: true },
        hasPerspective: f.hasPerspective,
        lines: [
          { facts, chip: f.category, first: true },
          { facts: [`${formatCount(f.views)} views`, `${formatCount(f.likes)} likes`], first: false }
        ]
      };
    })
};

/** Types the mobile view can draw. Add a type by adding its spec here. */
export const MOBILE_CARDS: Partial<Record<TypeId, MobileCardSpec>> = {
  youtube: youtubeSpec
};
