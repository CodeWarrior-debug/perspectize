import { TYPES, type DetectRule } from './catalog.js';
import type { DraftState } from './model.js';

/**
 * Mirror of frontend/src/lib/utils/detectContentType.ts, with the drafted
 * type's link rule inserted where it would go: after the built-in URL rules,
 * before "any other URL is never guessed". Keep the steps in the app's order —
 * the precedence is the point of the tester.
 *
 * The typed-Bible-reference step is an approximation: the app runs a real
 * reference parser (passageParserAdapter.ts), which this file does not copy.
 */

export interface DetectStep {
  rule: string;
  /** Where the rule lives, so a mismatch with the app can be traced. */
  source: string;
  outcome: 'match' | 'no-match' | 'skipped';
  note?: string;
}

export interface DetectResult {
  /** Enum value, or null for "Select a type". */
  type: string | null;
  label: string;
  /** Extracted external id, when the matching rule captures one. */
  externalId?: string;
  steps: DetectStep[];
}

const APP_FILE = 'detectContentType.ts';
const BIBLE_GATEWAY_HOSTS = new Set(['biblegateway.com', 'www.biblegateway.com']);
const BIBLE_REF = /^([1-3]\s?)?[A-Za-z][A-Za-z .]*?\s+\d+(:\d+)?([-–]\d+(:\d+)?)?$/;

/** Copy of validateYouTubeUrl (frontend/src/lib/utils/youtube.ts). */
function isYouTubeUrl(input: string): boolean {
  try {
    const u = new URL(input);
    if (u.hostname === 'youtu.be') return u.pathname.length > 1;
    if (u.hostname === 'youtube-nocookie.com' || u.hostname.endsWith('.youtube-nocookie.com')) {
      return u.pathname.startsWith('/embed/');
    }
    if (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com')) {
      return /^\/(watch|embed|v|e|shorts|live)(\/|$)/.test(u.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

function parseUrl(input: string): URL | null {
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

interface NamedRule {
  enumValue: string;
  label: string;
  rule: DetectRule;
}

/** The draft's rule, plus any seeded type with a rule other than the one the draft was copied from. */
export function detectRules(state: DraftState): NamedRule[] {
  const rules: NamedRule[] = [];
  const d = state.draft;
  if (d.detect && d.detect.hosts.length && d.detect.path) {
    rules.push({ enumValue: d.enumValue || 'NEW_TYPE', label: `${d.label || 'New type'} (draft)`, rule: d.detect });
  }
  for (const t of TYPES) {
    if (t.detect && t.id !== state.seed) rules.push({ enumValue: t.enumValue, label: t.label, rule: t.detect });
  }
  return rules;
}

function matchRule(url: URL, rule: DetectRule): { ok: boolean; id?: string; note: string } {
  const host = url.hostname.toLowerCase();
  if (!rule.hosts.includes(host)) return { ok: false, note: `host ${host} not in ${rule.hosts.join(', ')}` };
  let re: RegExp;
  try {
    re = new RegExp(rule.path);
  } catch {
    return { ok: false, note: `path pattern is not a valid regular expression` };
  }
  const m = re.exec(url.pathname);
  if (!m) return { ok: false, note: `host matches, but path ${url.pathname} does not match ${rule.path}` };
  return { ok: true, id: m[1], note: m[1] ? `id ${m[1]}` : 'matched (pattern captures no id)' };
}

export function detect(input: string, state: DraftState): DetectResult {
  const steps: DetectStep[] = [];
  const trimmed = input.trim();
  const done = (type: string | null, label: string, externalId?: string): DetectResult => ({ type, label, externalId, steps });

  if (!trimmed) {
    steps.push({ rule: 'Empty input', source: APP_FILE, outcome: 'match', note: 'nothing to detect' });
    return done(null, 'Select a type');
  }

  const yt = isYouTubeUrl(trimmed);
  steps.push({ rule: 'YouTube link', source: 'youtube.ts validateYouTubeUrl', outcome: yt ? 'match' : 'no-match' });
  if (yt) return done('YOUTUBE', 'YouTube');

  const url = parseUrl(trimmed);
  if (url) {
    const bg = BIBLE_GATEWAY_HOSTS.has(url.hostname.toLowerCase()) && !!url.searchParams.get('search');
    steps.push({ rule: 'Bible Gateway link', source: APP_FILE, outcome: bg ? 'match' : 'no-match' });
    if (bg) return done('BIBLE_PASSAGE', 'Bible passage');

    for (const r of detectRules(state)) {
      const m = matchRule(url, r.rule);
      steps.push({ rule: `${r.label} link`, source: 'NEW — proposed by this tool', outcome: m.ok ? 'match' : 'no-match', note: m.note });
      if (m.ok) return done(r.enumValue, r.label.replace(/ \(draft\)$/, ''), m.id);
    }
    steps.push({ rule: 'Any other link', source: APP_FILE, outcome: 'match', note: 'never guessed — the user must pick a type' });
    return done(null, 'Select a type');
  }
  steps.push({ rule: 'Link rules', source: APP_FILE, outcome: 'skipped', note: 'not an http(s) link' });

  const ref = BIBLE_REF.test(trimmed);
  steps.push({ rule: 'Typed Bible reference', source: 'passageParserAdapter.ts (approximated here)', outcome: ref ? 'match' : 'no-match' });
  if (ref) return done('BIBLE_PASSAGE', 'Bible passage');

  const claim = /\s/.test(trimmed) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  steps.push({
    rule: 'Free-text claim',
    source: APP_FILE,
    outcome: claim ? 'match' : 'no-match',
    note: claim ? "the app then says claims can't be added from this card yet" : 'needs at least two words'
  });
  if (claim) return done('CLAIM', 'Claim');
  return done(null, 'Select a type');
}
