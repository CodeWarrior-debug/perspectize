// Generates a first-concept spec for a "YouTube Music track" content type
// using the actual content-type-designer engine (dist/model.js + dist/emit.js),
// seeded from the 'music' profile per the ISRC discussion.
import { buildSpec, buildMatrix } from '/home/user/perspectize/tools/content-type-designer/dist/emit.js';

const draft = {
  id: 'youtube_music',
  label: 'YouTube Music track',
  plural: 'YouTube Music tracks',
  enumValue: 'YOUTUBE_MUSIC',
  gist: 'A song streamed through YouTube Music, resolved to its MusicBrainz recording (ISRC) where one exists.',
  ingestion: 'api',
  enrichment:
    'ytmusicapi (unofficial InnerTube endpoints — no official YouTube Music Data API) for track/artist/album lookup, cross-referenced against MusicBrainz for ISRC + Cover Art Archive artwork',
  urlRequired: true,
  urlPattern: 'music.youtube.com/watch?v=<id> (also accepts youtube.com/watch?v=<id> when the video is a recognised YT Music track)',
  identity: 'ISRC via MusicBrainz cross-reference (fallback: YouTube Music videoId, then artist + title + album)',
  icon: 'note',
  accent: '#FF3355',
  sharesUrlSpace: true,
  thumbnail: 'YouTube Music thumbnail (i.ytimg.com), replaced by Cover Art Archive front image once ISRC resolves'
};

const b = (label, applicability, source, path, defaultVisible, extra = {}) => ({
  label,
  applicability,
  source,
  path,
  defaultVisible,
  ...extra
});

const decisions = {
  item: b('Track', 'required', 'api', 'name + cover art (YT thumbnail until ISRC resolves)', true, {
    tooltip: 'Track title and artwork; artwork upgrades from YouTube thumbnail to Cover Art Archive once MusicBrainz resolves an ISRC.'
  }),
  creator: b('Artist', 'required', 'api', "response->>'artist'", true, {
    tooltip: 'Primary artist, from ytmusicapi — not the uploading channel.'
  }),
  venue: b('Platform', 'optional', 'derived', "'YouTube Music'", false),
  length: b('Length', 'required', 'api', 'length + length_units', true, {
    unit: 'seconds → m:ss',
    tooltip: 'Track duration from YouTube Music — may include a few seconds of intro/outro the canonical MusicBrainz recording length does not.'
  }),
  date: b('Released', 'typical', 'api', "response->>'releaseDate'", true, {
    tooltip: 'Album/single release date, from MusicBrainz when resolved, else ytmusicapi album metadata.'
  }),
  audience: b('Views', 'optional', 'api', "response->>'viewCount'", false, {
    tooltip: 'YouTube view count on the music video/listing — an engagement metric, not a play count on the work.'
  }),
  genre: b('Genre', 'optional', 'api', "response->'tags'->0->>'name'", false, {
    tooltip: 'From MusicBrainz tags once ISRC resolves; blank otherwise.'
  }),
  identifier: b('ISRC', 'typical', 'api', "response->>'isrc'", false, {
    tooltip: 'Resolved via MusicBrainz recording search on artist+title+duration. Not guaranteed — indie/unreleased YT Music uploads may never resolve one.'
  }),
  description: b('Notes', 'optional', 'user', "response->>'notes'", false),
  status: b('Listened', 'optional', 'user', "response->>'progressStatus'", false)
};

const state = {
  draft,
  decisions,
  selected: ['youtube_music', 'youtube', 'music'],
  rule: 'majority',
  deviations:
    'Enrichment source (ytmusicapi) is unofficial and unversioned — no API key, no SLA, no ToS coverage. Every other api-ingestion type in the catalog (YouTube Data API v3, TMDB, Open Library, iTunes Search, MusicBrainz) is an official or fully open, keyless source. This type is a deliberate exception and should be flagged as higher-maintenance-risk in review, not treated as equivalent in reliability to youtube or music.',
  testingNotes:
    'Mock ytmusicapi responses for: (1) a track that resolves an ISRC via MusicBrainz, (2) one that never resolves one (falls back to videoId identity), (3) a duration mismatch between YT Music and the MusicBrainz recording (assert we keep the YT Music duration for display and the MusicBrainz one only for match confidence). Cover the identity fallback chain end-to-end since it is the whole rationale for this type.'
};

console.log(buildSpec(state));
console.log('\n---\n');
console.log(buildMatrix(state));
