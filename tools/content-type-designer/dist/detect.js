import { SAMPLES, TYPES } from './catalog.js';
const APP_FILE = 'detectContentType.ts';
const BIBLE_GATEWAY_HOSTS = new Set(['biblegateway.com', 'www.biblegateway.com']);
const BIBLE_REF = /^([1-3]\s?)?[A-Za-z][A-Za-z .]*?\s+\d+(:\d+)?([-–]\d+(:\d+)?)?$/;
/** Copy of validateYouTubeUrl (frontend/src/lib/utils/youtube.ts). */
function isYouTubeUrl(input) {
    try {
        const u = new URL(input);
        if (u.hostname === 'youtu.be')
            return u.pathname.length > 1;
        if (u.hostname === 'youtube-nocookie.com' || u.hostname.endsWith('.youtube-nocookie.com')) {
            return u.pathname.startsWith('/embed/');
        }
        if (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com')) {
            return /^\/(watch|embed|v|e|shorts|live)(\/|$)/.test(u.pathname);
        }
        return false;
    }
    catch {
        return false;
    }
}
function parseUrl(input) {
    if (!/^https?:\/\//i.test(input))
        return null;
    try {
        return new URL(input);
    }
    catch {
        return null;
    }
}
/**
 * The draft's rule, plus any seeded type with a rule other than the one the
 * draft was copied from. Types sharing one rule (the museum family) appear
 * once, labelled with every type it can route to.
 */
export function detectRules(state) {
    const rules = [];
    const d = state.draft;
    if (d.detect && d.detect.hosts.length && d.detect.path) {
        const draftLabel = `${d.label || 'New type'} (draft)`;
        const family = d.detect.routedBy
            ? TYPES.filter((o) => o.detect && o.id !== state.seed && sameRule(o.detect, d.detect)).map((o) => o.label)
            : [];
        rules.push({ enumValue: d.enumValue || 'NEW_TYPE', label: [draftLabel, ...family].join(' / '), rule: d.detect });
    }
    for (const t of TYPES) {
        if (!t.detect || t.id === state.seed)
            continue;
        if (t.detect.routedBy && rules.some((r) => sameRule(r.rule, t.detect)))
            continue;
        if (t.detect.routedBy) {
            const family = TYPES.filter((o) => o.detect && sameRule(o.detect, t.detect)).map((o) => o.label);
            rules.push({ enumValue: t.enumValue, label: family.join(' / '), rule: t.detect });
        }
        else {
            rules.push({ enumValue: t.enumValue, label: t.label, rule: t.detect });
        }
    }
    return rules;
}
function sameRule(a, b) {
    return a.path === b.path && a.hosts.join() === b.hosts.join();
}
function textOf(cell) {
    return cell === undefined ? '' : typeof cell === 'string' ? cell : cell.text;
}
/**
 * Stand-in for the backend's after-fetch routing: the planner has no API, so
 * it finds the record among the sample rows of the types sharing the rule.
 */
function routeAfterFetch(rule, id, state) {
    for (const t of TYPES) {
        if (!t.detect || !sameRule(t.detect, rule))
            continue;
        const rows = SAMPLES[t.id] ?? [];
        const hit = rows.some((row) => {
            const sourceId = textOf(row.identifier).split(' ')[0];
            return sourceId === `met:${id}` || sourceId === `europeana:/${id}`;
        });
        if (hit)
            return t.id === state.seed ? { enumValue: state.draft.enumValue || t.enumValue, label: state.draft.label || t.label } : { enumValue: t.enumValue, label: t.label };
    }
    return null;
}
function matchRule(url, rule) {
    const host = url.hostname.toLowerCase();
    if (!rule.hosts.includes(host))
        return { ok: false, note: `host ${host} not in ${rule.hosts.join(', ')}` };
    let re;
    try {
        re = new RegExp(rule.path);
    }
    catch {
        return { ok: false, note: `path pattern is not a valid regular expression` };
    }
    const m = re.exec(url.pathname);
    if (!m)
        return { ok: false, note: `host matches, but path ${url.pathname} does not match ${rule.path}` };
    return { ok: true, id: m[1], note: m[1] ? `id ${m[1]}` : 'matched (pattern captures no id)' };
}
export function detect(input, state) {
    const steps = [];
    const trimmed = input.trim();
    const done = (type, label, externalId) => ({ type, label, externalId, steps });
    if (!trimmed) {
        steps.push({ rule: 'Empty input', source: APP_FILE, outcome: 'match', note: 'nothing to detect' });
        return done(null, 'Select a type');
    }
    const yt = isYouTubeUrl(trimmed);
    steps.push({ rule: 'YouTube link', source: 'youtube.ts validateYouTubeUrl', outcome: yt ? 'match' : 'no-match' });
    if (yt)
        return done('YOUTUBE', 'YouTube');
    const url = parseUrl(trimmed);
    if (url) {
        const bg = BIBLE_GATEWAY_HOSTS.has(url.hostname.toLowerCase()) && !!url.searchParams.get('search');
        steps.push({ rule: 'Bible Gateway link', source: APP_FILE, outcome: bg ? 'match' : 'no-match' });
        if (bg)
            return done('BIBLE_PASSAGE', 'Bible passage');
        for (const r of detectRules(state)) {
            const m = matchRule(url, r.rule);
            steps.push({ rule: `${r.label} link`, source: 'NEW — proposed by this tool', outcome: m.ok ? 'match' : 'no-match', note: m.note });
            if (m.ok && r.rule.routedBy && m.id) {
                const routed = routeAfterFetch(r.rule, m.id, state);
                steps.push({
                    rule: 'Route after fetch',
                    source: 'NEW — backend, after fetching the record',
                    outcome: routed ? 'match' : 'no-match',
                    note: routed
                        ? `${routed.label} — by ${r.rule.routedBy.split(';')[0]} (simulated here from the sample rows)`
                        : `not a sample row; the backend would route by ${r.rule.routedBy}`
                });
                if (routed)
                    return done(routed.enumValue, routed.label, m.id);
                return done(r.enumValue, `${r.label} (set after fetch)`, m.id);
            }
            if (m.ok)
                return done(r.enumValue, r.label.replace(/ \(draft\)$/, ''), m.id);
        }
        steps.push({ rule: 'Any other link', source: APP_FILE, outcome: 'match', note: 'never guessed — the user must pick a type' });
        return done(null, 'Select a type');
    }
    steps.push({ rule: 'Link rules', source: APP_FILE, outcome: 'skipped', note: 'not an http(s) link' });
    const ref = BIBLE_REF.test(trimmed);
    steps.push({ rule: 'Typed Bible reference', source: 'passageParserAdapter.ts (approximated here)', outcome: ref ? 'match' : 'no-match' });
    if (ref)
        return done('BIBLE_PASSAGE', 'Bible passage');
    const claim = /\s/.test(trimmed) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    steps.push({
        rule: 'Free-text claim',
        source: APP_FILE,
        outcome: claim ? 'match' : 'no-match',
        note: claim ? "the app then says claims can't be added from this card yet" : 'needs at least two words'
    });
    if (claim)
        return done('CLAIM', 'Claim');
    return done(null, 'Select a type');
}
//# sourceMappingURL=detect.js.map