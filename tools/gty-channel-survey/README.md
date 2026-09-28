# gty-channel-survey

Pulls the Grace to You YouTube channel (`UCneKpMu9SFGlt2usTdAI75A`, `@gracetoyou`) through the
YouTube Data API v3, dumps the raw JSON, and prints a summary: duration buckets, how many
descriptions carry a `gty.org/sermons/NN-NNN` link, sermon-code prefix distribution, and
passage-style parentheticals in titles.

No dependencies — plain Node (18+, uses built-in `fetch`).

## Run

```
YOUTUBE_API_KEY=... node tools/gty-channel-survey/survey.mjs
```

Get the key from a password manager; never commit it or paste it into chat, issues, or PRs. Restrict
it to the YouTube Data API v3 in Google Cloud Console.

| Flag | Effect |
|---|---|
| `--incremental` | Fetch only videos newer than the ones already in `out/`, then merge. Use this to pick up new uploads. |
| `--channel UC...` | Survey a different channel instead of Grace to You. |

## Output (`out/`, gitignored)

`channel.json`, `playlist-items.json`, `videos.json` (durations, stats, descriptions), and
`rows.json` (flattened per-video rows the summary is built from).

## Cost and pacing

Both list endpoints cap at 50 per page: about 53 `playlistItems` + 53 `videos` calls for ~2,600
videos, roughly 106 quota units of the 10,000/day default. Calls run sequentially with a 150 ms
gap; 429/5xx responses retry with exponential backoff (up to 5 attempts).

## Caveats

- Edits to a video after it was first fetched (title, description) are not picked up by
  `--incremental`; run a full pull for that.
- Private or deleted videos appear in the playlist but not in `videos.list`; they're bucketed as
  "unavailable".
- Scraping gty.org is off the table (robots.txt blocks all but Google/Bing/Meta). The sermon links in
  video descriptions are the sanctioned way to connect a video to its gty.org page.
