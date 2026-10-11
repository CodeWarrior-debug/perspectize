# Judge comparison: `claude-sonnet-5-5` vs `claude-opus-5-5`

56 shared judgements (harness-failed checks). Cost: claude-sonnet-5-5 $1.03, claude-opus-5-5 $1.97.

**Verdict agreement:** 56/56. Harness majority verdict (all FAIL) matched by claude-sonnet-5-5: 56, claude-opus-5-5: 56.

| | claude-sonnet-5-5 | claude-opus-5-5 |
|---|---|---|
| mean words | 86.64 | 92.68 |
| mean cost / judgement ($) | 0.02 | 0.04 |
| reasonings that quote the report | 52 | 55 |
| mean quotes per reasoning | 1.89 | 2.14 |

**Same quoted passage:** in 52 judgements both quote the report; mean overlap of quoted spans 0.21 (1.0 = identical evidence, 0 = disjoint).

## Per grader (failed checks judged)

| case / grader | n | verdict differences |
|---|---|---|
| planted-defects / d1-stale-path | 3 | 0 |
| planted-defects / d4-contradiction | 5 | 0 |
| planted-defects / d5-dead-link | 1 | 0 |
| planted-defects / d6-go-version | 2 | 0 |
| planted-defects / no-false-positives | 2 | 0 |
| real-repo-snapshot / r1-missing-component | 6 | 0 |
| real-repo-snapshot / r2-prerender | 6 | 0 |
| real-repo-snapshot / r3-helpers-path | 10 | 0 |
| real-repo-snapshot / r4-migrate-contradiction | 6 | 0 |
| real-repo-snapshot / r6-go-versions | 3 | 0 |
| real-repo-snapshot / r7-middleware-path | 6 | 0 |
| subtle-defects / s1-port | 1 | 0 |
| subtle-defects / s2-stale-prose-path | 2 | 0 |
| subtle-defects / s3-renamed-constructor | 3 | 0 |

## Verdict disagreements (0)

None.


## Three least-overlapping reasonings (same verdict, different evidence)

### haiku-planted-defects-with-1-d4-contradiction
harness votes [False, False, False]

**claude-sonnet-5-5** → FAIL: The agent's report never connects the two files' opposing instructions about `make migrate-up`. On the root side, it notes only "DATABASE_URL rule present but not explained" and says the rules "don't explain setup steps". It never states that the root forbids running migrate-up locally. On the backend side, it says only "No mention of database migration workflow or prerequisites", which is the opposite of the fixture's contents, since backend/CLAUDE.md does tell you to run `make migrate-up`. The report therefore misses the contradiction and doesn't note that the two files disagree.

**claude-opus-5-5** → FAIL: The agent never identifies the conflict between the root rule against running `make migrate-up` and the backend instruction to run it as first-time setup. On the root side it only notes "DATABASE_URL rule present but not explained," and never mentions `migrate-up` or the shared staging DB. On the backend side it says "⚠️ No mention of database migration workflow or prerequisites." That misses the `make migrate-up` setup step entirely and does not connect it to the root prohibition. No passage links the two files or says they disagree, and the recommendation to "Document ... migration workflow" could make the conflict worse.

### haiku-planted-defects-with-1-d6-go-version
harness votes [False, False, False]

**claude-sonnet-5-5** → FAIL: The criterion requires the agent to explicitly identify the "Go 1.21" statement in backend/CLAUDE.md as wrong or stale, given that go.mod declares go 1.25. The agent's report does not do this. The only Go version mention is in the recommendations: "Document Go 1.21+ requirement and migration workflow." This treats Go 1.21 as a valid requirement to document, and it never notes the mismatch with go.mod. The report also says "No environment setup instructions (Go version, dependencies)" as missing, which further implies it did not notice the existing, stale version claim.

**claude-opus-5-5** → FAIL: The agent never flags the Go version mismatch between backend/CLAUDE.md ("Go 1.21") and go.mod (`go 1.25`). Its backend issues cover `make seed`, the missing `make lint`, and a general gap in environment setup: "❌ **Missing:** No environment setup instructions (Go version, dependencies)". Its recommendation then treats the stale value as correct: "Document Go 1.21+ requirement and migration workflow". Recommending 1.21 as the requirement reinforces the outdated version instead of saying it is wrong or should be updated to 1.25. The response treats the stale value as valid, so it fails the criterion.

### haiku-planted-defects-with-2-d1-stale-path
harness votes [False, False, False]

**claude-sonnet-5-5** → FAIL: The criterion requires the response to explicitly identify `internal/handlers/` as wrong, stale, or nonexistent. The agent's backend section says only: "Good layout description but missing handlers pattern details". This treats the handlers directory as valid and even asks for more detail about it. The agent never flags it as nonexistent, and its only backend errors concern `make seed` and the missing `make lint`. No passage identifies `internal/handlers/` as stale.

**claude-opus-5-5** → FAIL: The criterion requires the agent to flag `internal/handlers/` in backend/CLAUDE.md as nonexistent or stale. The only related passage in the backend assessment is under Architecture clarity: "Good layout description but missing handlers pattern details." This praises the layout and asks for *more* detail on handlers, which treats the directory as valid. None of the listed backend issues or recommended fixes mention that `internal/handlers/` doesn't exist, or that `internal/core/services/` is the real directory. The agent caught the command errors (`make seed`, `test:unit`) but missed this directory error entirely.

