# Counts and thumbnails: cache rules

Type: `wayfinder:grilling` (HITL) · Status: closed · Blocked by: none · Claimed by: Claude

## Question

How do we show listen and like counts and thumbnails without breaking provider rules? YouTube's terms say API data we copy, such as view and like counts, must be refreshed or deleted within 30 days. Spotify requires cover art to be shown with attribution and a link back.

## Resolution (2026-10-10, judgment call explained to the owner)

- Store every provider count with a `fetchedAt` date. Show it as "as of <date>", and refresh or drop it within 30 days.
- Hotlink thumbnails from the provider's own CDN instead of copying them into our database.
- Show a provider's attribution and link wherever its data appears.
- A scheduled refresher is not designed yet; it sits in the map's fog.
