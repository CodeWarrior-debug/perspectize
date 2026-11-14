# Subscriber sign-in and token storage

Type: `wayfinder:grilling` (HITL) · Status: open · Blocked by: [Subscriber listening test with real accounts](01-subscriber-listening-test.md) · Claimed by: none

## Question

For providers where the test shows subscriber listening needs sign-in (likely Apple Music via MusicKit), where do tokens live and who holds them: only in the user's browser, or encrypted on our server? Decide the sign-in trigger, scopes, what we store, expiry and revocation, and what a user sees when they are not a subscriber. This is the riskiest safeguard on the map. If the test shows YouTube Premium needs no sign-in at all, the scope shrinks to Apple Music.
