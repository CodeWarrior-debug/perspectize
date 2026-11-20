/**
 * Sample data: 25 content items and 65 perspectives, hand-written so every state the design has
 * to handle appears at least once. Ratings are written on the displayed 0-10 scale and stored
 * x1000, as the app stores them (0-10,000, `valid_integer_range`).
 *
 * Planted cases (each is checked by the states the preview demonstrates):
 * - 1-2 contributors (Brothers Karamazov, Ecclesiastes, Past Lives, Map of Mathematics...).
 * - Contested: Remote work (Agreement), Social media (Agreement + Importance), Tree of Life (Quality).
 * - Missing ratings: nobody rated Importance on "How SQLite Is Tested" (AVG empty, COUNT 0).
 * - Real zeros: an Agreement of 0 on the social media claim (MIN shows 0.0, not empty).
 * - Private perspectives, never in a shared number: hana and ivo on Arrival, kofi on Remote work,
 *   lena on Oppenheimer, gus on Four-day week, plus the viewer's own private perspective on Gilead.
 * - Two slots, one person: gus (public + private) on the four-day week claim and kofi (public +
 *   private) on remote work, for the one-vote-per-user rule (ADR 0002 section 7).
 * - No perspectives at all: "Simulating an epidemic" and "Falsehoods Programmers Believe About Names".
 */

export type ContentType = 'YOUTUBE_VIDEO' | 'MOVIE' | 'BOOK' | 'WEB_PAGE' | 'BIBLE_PASSAGE' | 'CLAIM';

export interface Content {
  id: number;
  type: ContentType;
  title: string;
  creator: string;
  /** Short claim text a supporter / a doubter would write, used to fill perspectives. */
  pro: string;
  con: string;
}

export interface Feeling {
  emoji: string;
  label: string;
  /** Stored 0-10,000. */
  intensity: number;
}

export interface Perspective {
  id: number;
  contentId: number;
  owner: string;
  privacy: 'PUBLIC' | 'PRIVATE';
  claim: string;
  quality: number | null;
  agreement: number | null;
  importance: number | null;
  confidence: number | null;
  /** Numeric custom fields (optional dimensions). */
  custom: Record<string, number>;
  feelings: Feeling[];
  createdAt: string;
  updatedAt: string;
}

/** The signed-in viewer for every view in the preview (the demo stack's `demo_as=alice`). */
export const VIEWER = 'alice';

export const TYPE_META: Record<ContentType, { label: string; short: string; color: string }> = {
  YOUTUBE_VIDEO: { label: 'YouTube', short: 'YT', color: '#b42318' },
  MOVIE: { label: 'Movie', short: 'MV', color: '#3f4b8c' },
  BOOK: { label: 'Book', short: 'BK', color: '#7c5a2e' },
  WEB_PAGE: { label: 'Webpage', short: 'WP', color: '#2f5d4a' },
  BIBLE_PASSAGE: { label: 'Bible passage', short: 'BP', color: '#5b46b0' },
  CLAIM: { label: 'Claim', short: 'CL', color: '#0e7490' },
};

export const CONTENT: Content[] = [
  { id: 1, type: 'MOVIE', title: 'Arrival (2016)', creator: 'Denis Villeneuve', pro: 'Language shapes time here, and it works.', con: 'Beautiful, but the twist carries too much.' },
  { id: 2, type: 'BOOK', title: 'East of Eden', creator: 'John Steinbeck', pro: 'Timshel is the best idea in American fiction.', con: 'Cathy is a symbol, not a person.' },
  { id: 3, type: 'YOUTUBE_VIDEO', title: 'But what is a neural network?', creator: '3Blue1Brown', pro: 'The clearest first picture of a network.', con: 'Skips why the layers learn anything.' },
  { id: 4, type: 'CLAIM', title: 'Remote work raises productivity for most knowledge workers', creator: '', pro: 'Fewer interruptions, more deep work.', con: 'Mentoring and serendipity quietly die.' },
  { id: 5, type: 'BIBLE_PASSAGE', title: 'Romans 8:28–39', creator: 'BSB', pro: 'Nothing can separate us: the whole letter turns here.', con: 'Verse 28 is quoted far past what it says.' },
  { id: 6, type: 'WEB_PAGE', title: 'How SQLite Is Tested', creator: 'sqlite.org', pro: 'The standard every test suite should be measured against.', con: 'Impressive, but few teams can afford it.' },
  { id: 7, type: 'MOVIE', title: 'The Tree of Life (2011)', creator: 'Terrence Malick', pro: 'A prayer on film.', con: 'Two hours of whispering at the sky.' },
  { id: 8, type: 'BOOK', title: 'Thinking, Fast and Slow', creator: 'Daniel Kahneman', pro: 'Two systems is still the best map of judgement.', con: 'Half the priming chapter did not replicate.' },
  { id: 9, type: 'YOUTUBE_VIDEO', title: 'The Map of Mathematics', creator: 'Domain of Science', pro: 'A great poster of the field.', con: 'A map with no roads.' },
  { id: 10, type: 'CLAIM', title: 'Social media does more harm than good to teenagers', creator: '', pro: 'The timing of the mental-health turn is hard to ignore.', con: 'Correlation, small effects, moral panic.' },
  { id: 11, type: 'BIBLE_PASSAGE', title: 'Psalm 23', creator: 'BSB', pro: 'Comfort without denial of the valley.', con: 'Too familiar to hear any more.' },
  { id: 12, type: 'WEB_PAGE', title: 'Choose Boring Technology', creator: 'mcfunley.com', pro: 'Innovation tokens is the right budget.', con: 'Boring for whom?' },
  { id: 13, type: 'MOVIE', title: 'Oppenheimer (2023)', creator: 'Christopher Nolan', pro: 'A thriller made of meetings.', con: 'Loud where it should be quiet.' },
  { id: 14, type: 'BOOK', title: 'The Brothers Karamazov', creator: 'Fyodor Dostoevsky', pro: 'The Grand Inquisitor alone is worth it.', con: 'Long.' },
  { id: 15, type: 'YOUTUBE_VIDEO', title: 'Inventing on Principle', creator: 'Bret Victor', pro: 'Immediate connection changed how I build tools.', con: 'Demos, not products.' },
  { id: 16, type: 'CLAIM', title: 'Nuclear power is essential to decarbonise the grid', creator: '', pro: 'Firm low-carbon power is the gap.', con: 'Too slow and too costly to build now.' },
  { id: 17, type: 'BIBLE_PASSAGE', title: 'Ecclesiastes 3:1–8', creator: 'BSB', pro: 'Permission for every season.', con: 'Fatalism dressed as wisdom.' },
  { id: 18, type: 'WEB_PAGE', title: 'The Bitter Lesson', creator: 'incompleteideas.net', pro: 'Search and learning win; keep relearning it.', con: 'Compute is not free and never was.' },
  { id: 19, type: 'MOVIE', title: 'Paddington 2 (2017)', creator: 'Paul King', pro: 'If we are kind and polite...', con: 'Charming, slight.' },
  { id: 20, type: 'BOOK', title: 'Gilead', creator: 'Marilynne Robinson', pro: 'Grace written as a letter.', con: 'Slow.' },
  { id: 21, type: 'YOUTUBE_VIDEO', title: 'Simulating an epidemic', creator: '3Blue1Brown', pro: '', con: '' },
  { id: 22, type: 'CLAIM', title: 'A four-day work week should be the default', creator: '', pro: 'Same output, better lives.', con: 'Only for jobs measured by output.' },
  { id: 23, type: 'WEB_PAGE', title: 'Falsehoods Programmers Believe About Names', creator: 'kalzumeus.com', pro: '', con: '' },
  { id: 24, type: 'BIBLE_PASSAGE', title: 'John 1:1–18', creator: 'BSB', pro: 'The Word made flesh: the hinge of the Gospel.', con: 'Dense; needs the Greek.' },
  { id: 25, type: 'MOVIE', title: 'Past Lives (2023)', creator: 'Celine Song', pro: 'In-yun, quietly devastating.', con: 'Restraint that tips into absence.' },
];

/** Compact row: content, owner, Q, A, I, C (displayed scale, null = not rated), then options. */
type Row = [number, string, number | null, number | null, number | null, number | null, Opts?];
interface Opts {
  priv?: boolean;
  clarity?: number;
  hopeful?: number;
  feel?: string;
  day?: number;
}

const FEELINGS: Record<string, { emoji: string; label: string }> = {
  love: { emoji: '🥰', label: 'Love' },
  joy: { emoji: '😄', label: 'Joyful' },
  trust: { emoji: '🤗', label: 'Trusting' },
  hope: { emoji: '🤞', label: 'Hopeful' },
  blown: { emoji: '🤯', label: 'Mind-blown' },
  peace: { emoji: '😌', label: 'Peaceful' },
  nostalgia: { emoji: '🥹', label: 'Nostalgic' },
  sad: { emoji: '😢', label: 'Sad' },
  bored: { emoji: '😐', label: 'Bored' },
  meh: { emoji: '😑', label: 'Meh' },
  anxious: { emoji: '😰', label: 'Anxious' },
  confused: { emoji: '😕', label: 'Confused' },
  surprised: { emoji: '😲', label: 'Surprised' },
};

const ROWS: Row[] = [
  // Arrival: 6 rows, two private.
  [1, 'alice', 9, 8, 7.5, 8, { feel: 'blown:8', clarity: 8.5, day: 12 }],
  [1, 'ben', 8.5, 7, 6, 7, { feel: 'sad:6', day: 20 }],
  [1, 'chidi', 9.5, 9, 8, null, { feel: 'blown:9', clarity: 9, day: 31 }],
  [1, 'dara', 7, 6, 5, 6.5, { day: 44 }],
  [1, 'hana', 8, 7.5, 7, 7, { priv: true, feel: 'peace:5', day: 61 }],
  [1, 'ivo', 6, 4, 4.5, 5, { priv: true, day: 70 }],
  // East of Eden: 5.
  [2, 'ben', 9, 8.5, 8, 9, { feel: 'love:7', day: 8 }],
  [2, 'eli', 8, 7, 7.5, 6, { day: 19 }],
  [2, 'farah', 9.5, 9, 9, 8.5, { feel: 'nostalgia:6', day: 27 }],
  [2, 'jun', 7.5, 6.5, 6, null, { day: 53 }],
  [2, 'alice', 8.5, 8, 8.5, 7.5, { day: 88 }],
  // Neural network: 3.
  [3, 'chidi', 9, 8, 7, 8, { clarity: 9.5, feel: 'blown:7', day: 5 }],
  [3, 'kofi', 8.5, 8, 6.5, 7, { clarity: 9, day: 38 }],
  [3, 'mo', 7, 7, 5, 6, { clarity: 7.5, day: 97 }],
  // Remote work: 6 rows, kofi has a public and a private row.
  [4, 'alice', 6, 7, 8, 5, { feel: 'hope:6', hopeful: 6, day: 3 }],
  [4, 'ben', 5, 1.5, 7.5, 7, { feel: 'anxious:6', day: 15 }],
  [4, 'dara', 7, 9.5, 8, 8, { hopeful: 8, feel: 'hope:8', day: 22 }],
  [4, 'gus', 4.5, 1, 9, 9, { day: 40 }],
  [4, 'kofi', 6.5, 9, 7, 6, { day: 47 }],
  [4, 'kofi', 6, 3, 7, 4, { priv: true, day: 101 }],
  // Romans 8: 5.
  [5, 'eli', 9.5, 9.5, 10, 9, { hopeful: 9, feel: 'hope:9', day: 2 }],
  [5, 'farah', 9, 9, 9.5, 8.5, { hopeful: 8.5, feel: 'peace:7', day: 18 }],
  [5, 'hana', 8.5, 8, 9, 7, { feel: 'trust:8', day: 36 }],
  [5, 'lena', 9, 7.5, 9, 6, { hopeful: 7, day: 63 }],
  [5, 'alice', 9.5, 9, 9.5, 8, { hopeful: 9.5, feel: 'hope:9', day: 90 }],
  // SQLite testing: 2, nobody rated Importance.
  [6, 'jun', 9, 9, null, 8, { clarity: 9, day: 25 }],
  [6, 'mo', 8.5, 8, null, 7, { clarity: 8, day: 76 }],
  // Tree of Life: 4, quality split.
  [7, 'ben', 9.5, 8, 7, 6, { feel: 'peace:8', day: 9 }],
  [7, 'chidi', 2, 3, 3, 8, { feel: 'bored:7', day: 33 }],
  [7, 'gus', 10, 9, 8, 7, { feel: 'blown:9', day: 58 }],
  [7, 'ivo', 3, 2.5, 2, 7.5, { feel: 'meh:6', day: 84 }],
  // Thinking, Fast and Slow: 3.
  [8, 'dara', 8, 6, 7.5, 5, { clarity: 8, day: 14 }],
  [8, 'eli', 7, 5.5, 7, 4.5, { clarity: 7, feel: 'confused:4', day: 49 }],
  [8, 'alice', 7.5, 6, 8, 6, { clarity: 8.5, day: 99 }],
  // Map of Mathematics: 2.
  [9, 'kofi', 7, 7, 4, 6, { day: 29 }],
  [9, 'lena', 6.5, 7.5, 3.5, null, { day: 72 }],
  // Social media and teenagers: 5, split on Agreement (with a real 0) and Importance.
  [10, 'alice', 6, 8, 9, 6, { feel: 'anxious:7', day: 6 }],
  [10, 'chidi', 5, 0, 2, 8, { day: 21 }],
  [10, 'farah', 7, 9.5, 10, 7, { feel: 'sad:8', day: 42 }],
  [10, 'jun', 4, 1, 1.5, 7, { day: 66 }],
  [10, 'mo', 6.5, 8.5, 9.5, 5, { feel: 'anxious:6', day: 93 }],
  // Psalm 23: 3.
  [11, 'eli', 9.5, 9.5, 9, 9, { hopeful: 8, feel: 'peace:9', day: 11 }],
  [11, 'hana', 9, 9, 8.5, 8, { hopeful: 7.5, feel: 'trust:7', day: 45 }],
  [11, 'ben', 8, 8.5, 7, null, { feel: 'nostalgia:6', day: 80 }],
  // Choose Boring Technology: 2.
  [12, 'gus', 8.5, 9, 6, 8, { day: 24 }],
  [12, 'alice', 8, 8, 6.5, 7, { day: 77 }],
  // Oppenheimer: 3 (one private).
  [13, 'dara', 8.5, 7, 8, 7, { feel: 'anxious:7', day: 17 }],
  [13, 'jun', 7.5, 6.5, 8.5, 6, { day: 51 }],
  [13, 'lena', 5, 4, 7, 6.5, { priv: true, day: 95 }],
  // Brothers Karamazov: 1.
  [14, 'farah', 10, 9, 9.5, 9, { feel: 'blown:9', day: 39 }],
  // Inventing on Principle: 2.
  [15, 'mo', 9.5, 9, 8, 8, { clarity: 9.5, feel: 'blown:8', day: 13 }],
  [15, 'alice', 9, 8.5, 7.5, 7, { clarity: 9, feel: 'joy:6', day: 67 }],
  // Nuclear power: 2.
  [16, 'gus', 7, 8, 9, 6, { hopeful: 7, day: 30 }],
  [16, 'kofi', 6, 5, 8.5, 4, { hopeful: 4.5, feel: 'anxious:5', day: 74 }],
  // Ecclesiastes 3: 1.
  [17, 'hana', 9, 8, 7, 7, { hopeful: 6, feel: 'peace:6', day: 55 }],
  // The Bitter Lesson: 2.
  [18, 'chidi', 8, 8.5, 8, 7, { clarity: 8, day: 26 }],
  [18, 'kofi', 7.5, 6, 7, 5, { clarity: 7, feel: 'surprised:5', day: 85 }],
  // Paddington 2: 2.
  [19, 'lena', 9.5, 9, 4, 9, { feel: 'joy:9', day: 35 }],
  [19, 'ivo', 9, 8.5, 3.5, 8, { feel: 'love:7', day: 60 }],
  // Gilead: only the viewer's own private perspective.
  [20, 'alice', 9, 8.5, 8, 7.5, { priv: true, feel: 'peace:8', day: 103 }],
  // Four-day week: gus holds a public and a private perspective that contradict each other.
  [22, 'gus', 8, 9, 7, 6, { day: 41 }],
  [22, 'gus', 5, 4, 6, 6, { priv: true, day: 105 }],
  // John 1: 2.
  [24, 'eli', 9.5, 9.5, 10, 8, { hopeful: 9, feel: 'trust:9', day: 7 }],
  [24, 'farah', 9, 9, 9.5, null, { hopeful: 8, day: 69 }],
  // Past Lives: 1.
  [25, 'ben', 9, 8, 6, 8, { feel: 'nostalgia:8', day: 82 }],
];

const BASE = Date.UTC(2026, 5, 20, 12, 0, 0);
const DAY = 86_400_000;
const iso = (d: number) => new Date(BASE + d * DAY).toISOString();
const stored = (v: number | null) => (v === null ? null : Math.round(v * 1000));

export const PERSPECTIVES: Perspective[] = ROWS.map(([contentId, owner, q, a, i, c, o = {}], idx) => {
  const content = CONTENT.find((x) => x.id === contentId)!;
  const custom: Record<string, number> = {};
  if (o.clarity !== undefined) custom.clarity = stored(o.clarity)!;
  const feelings: Feeling[] = [];
  if (o.feel) {
    const [key, level] = o.feel.split(':');
    feelings.push({ ...FEELINGS[key], intensity: Number(level) * 1000 });
  }
  if (o.hopeful !== undefined && !feelings.some((f) => f.label === 'Hopeful')) {
    feelings.push({ ...FEELINGS.hope, intensity: stored(o.hopeful)! });
  }
  const day = o.day ?? idx;
  return {
    id: 1000 + idx,
    contentId,
    owner,
    privacy: o.priv ? 'PRIVATE' : 'PUBLIC',
    claim: a !== null && a >= 5 ? content.pro : content.con,
    quality: stored(q),
    agreement: stored(a),
    importance: stored(i),
    confidence: stored(c),
    custom,
    feelings,
    createdAt: iso(day),
    updatedAt: iso(day + (idx % 4 === 0 ? 9 : idx % 3)),
  };
});

export const USERS = [...new Set(PERSPECTIVES.map((p) => p.owner))].sort();

export function contentById(id: number): Content {
  return CONTENT.find((c) => c.id === id)!;
}
