# Source data expiry (YouTube counts)

Short design for #589. Written without an interactive approval round: the owner asked for an unattended run, so every call below is mine and listed for review.

## Intent

YouTube's API terms limit how long fetched data may be stored (about 30 days). Perspectize keeps view, like and comment counts in a row's stored `response`. Past the window those counts must be neither shown nor kept, but the row, its title and everyone's perspectives stay, and a refresh brings the numbers back.

## Goals / non-goals / anti-goals

- **Goals:** hide aged counts at once; delete them on a schedule or by hand; make the window one variable; let a person restore them with one click.
- **Non-goals:** archiving or soft-deleting rows; auto-refreshing in bulk (quota); other content types; import-staging facts (listed as a follow-up target).
- **Anti-goals:** a missing number shown as `0` or a bare dash; copy that names a provider, a day count or a policy and goes stale; a scheduled delete that switches itself on at deploy.

## Calls made

| Call | Choice | Why |
| --- | --- | --- |
| Age signal | `perspectizeFetchedAt` stamped inside the stored `response` when the source is fetched | `updated_at` moves on unrelated edits (category, display title) and would keep stale counts alive. A JSON key needs no migration, so the auto-deployed backend never queries a column that has not been applied yet. |
| Rows with no stamp | age from `created_at` | Can only over-expire (the person refreshes), never keep stale numbers. |
| Expired signal | backend field `Content.sourceDataExpired` | A null `likeCount` already means "uploader hid likes"; the client must not infer expiry. The window lives only on the backend, so one variable changes everything. |
| Read path | counts read `null` and `response.items[0].statistics` is dropped once expired, before the sweep has run | The API must not return stale values for the client to mask. |
| Clearing | raw `UPDATE ... response #- '{items,0,statistics}'`; leaves `updated_at` alone | A clear is not a refresh. Idempotent. |
| Mutation | `purgeSourceData(target: SourceDataTarget!, olderThanDays: Int!): Int!`, admin only, `olderThanDays >= 1`, returns rows cleared | The manual fallback if the schedule has trouble. `target` is an enum so unknown kinds fail. |
| Schedule | same service call, `SOURCE_DATA_SWEEP_HOURS` (0 = off, the default) | Opt-in like `MESSAGE_RETENTION_MAX`: merging must not run a delete against production. |
| Window | `SOURCE_DATA_MAX_AGE_DAYS`, default 30 | One value for read, sweep and flag. |
| UI | a placeholder "Refresh to view" in the grid, details tiles and mobile cards; details modal shows a "Refresh numbers" button and a hint | Reuses `updateContentSourceData`. Signed-out viewers get a sign-in hint instead. |
| Copy | "These numbers are only kept for a limited time. Refresh to see the latest." | Names no partner, no number, no rule. All wording is in `sourceDataExpiry.ts`. |

## Approaches considered

1. **Fetch stamp inside `response` (chosen).** No migration, no deploy ordering, one extra key.
2. **A `source_fetched_at` column.** Cleaner to query, but a manual migration after an auto-deploy leaves a window where code reads a missing column.
3. **`updated_at` as the age.** Zero new data, but wrong whenever anything else edits the row.

## Left for the builder / follow-ups

- Import staging facts (`ImportJob` facts) also hold counts: add a second `SourceDataTarget` value.
- Sorting or filtering by views/likes still sees the stored value until the sweep runs; after it, cleared rows sort as null.
- The first sweep clears every row with no stamp older than the window (all existing rows); that is the policy-safe intent and is why the schedule is opt-in. Run `purgeSourceData` once by hand first.
