# Content Relationship Perspectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

**Status:** Design agreed 2026-09-27. **First trial runs against the local Docker Postgres approach being introduced in a separate PR.** Do not apply this migration to the shared Neon database until that trial has validated the model.

**Goal:** Let each user record their perspective on how two pieces of content relate: how relevant and how important one is to the other, which typed relationships hold (each rated 0–10000), user-named custom ratings, and an HTML review. This powers a future claim view listing related claims and questions, ranked by these ratings.

**Tech Stack:** Go 1.25+, gqlgen, GORM, golang-migrate SQL, Svelte 5 runes, TanStack Svelte Query.

**Depends on:** `2026-09-27-private-claims-plan.md` (content.privacy, migration 000031).

## Agreed Design

### New content type: QUESTION
- A separate type from CLAIM. A claim is concluded on through ordinary perspectives (like / agreement / confidence). A question is not; it is answered and weighed through relationship perspectives.
- Created private by default, like claims.
- Add Content autodetects free text ending in `?` as a question.
- No question-status or "concluded" view (decided: not building).

### Table: `content_relationship_perspectives`
Mirrors the `perspectives` table's patterns.

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `user_id` | int NOT NULL FK users ON DELETE CASCADE | |
| `content_id` | int NOT NULL FK content ON DELETE CASCADE | the item being considered (anchor) |
| `related_content_id` | int NOT NULL FK content ON DELETE CASCADE | |
| `relevance` | int NULL, 0–10000 | |
| `importance` | int NULL, 0–10000 | how much `related_content_id` matters **to** `content_id` (asymmetric) |
| `relationship_types` | jsonb NOT NULL DEFAULT `'{}'` | fixed vocabulary, lowercase keys → 0–10000 |
| `custom_fields` | jsonb NOT NULL DEFAULT `'{}'` | user-named, lowercase keys → 0–10000 (same as `perspectives.custom_fields`) |
| `review` | text NULL | HTML, sanitized with the same sanitizer as `perspectives.review` |
| `privacy` | text NOT NULL DEFAULT `'public'` CHECK public/private | same as `perspectives.privacy` |
| `created_at` / `updated_at` | timestamptz | |

- Unique `(user_id, content_id, related_content_id)`; CHECK `content_id <> related_content_id`.
- Index on `related_content_id` for reverse lookups.

**How to read a row:** from `content_id`'s point of view, `related_content_id` is this relevant, this important, and relates to it as these types.
- **Empty `relationship_types` means related in an unspecified way.**
- **Rows are ordered on purpose:** importance is not symmetric.

### Relationship type vocabulary (read "related ___ content")

| group | types |
|---|---|
| Evidential | `proves`, `disproves`, `supports`, `undermines`, `prerequisite`, `contradicts`* |
| Sourcing / interpretation | `source`, `explains` |
| Scope | `duplicates`*, `overlaps`*, `broader`, `narrower` |
| Question fit | `would_settle`, `answers`, `too_broad`, `too_narrow`, `loaded` |

\* symmetric.
- The vocabulary lives in a Go enum, validated in the service.
- Adding a type is a code change, not a migration.

### Visibility and aggregation
- A row is readable when the viewer can read **both** content endpoints and the row is public or owned by the viewer.
- A content item's related list comes from rows anchored on it. Rows anchored the other way contribute to relevance, and symmetric types count either way.
- Default ranking is by average relevance × average importance.
- Averages are exposed per relationship type and per custom field.

### Worked examples
The design conversation used five scenarios as acceptance examples:
1. **O.J. Simpson:** a claim with glove and motive/means/ability questions.
2. **Coffee and health:** scope, overlap, a too-broad question.
3. **Faith and works:** Bible passages as related content, `explains`.
4. **EV ownership cost:** a YouTube source, duplicates, one-way importance.
5. **Moon landing:** unspecified relatedness, a loaded question, both sides agreeing a claim would disprove the landing if true.

The full tables are in **Appendix: Demo Data** below. They are the demo seed for the local Docker trial and the test fixtures.

## Design Rationale

How the design got here, so a later session doesn't reopen settled questions. Rejected alternatives are listed so they aren't proposed again.

### Claims and questions
- **Claims start private.** A claim is visible only to its owner. Going public will require passing a conceptual-uniqueness check against other claims (AI-assisted). That gate is deliberately undesigned for now; don't plan it here.
- **Claims carry minimal metadata:** text, owner, optional parent. The richer claim profile seeded in `tools/content-type-designer` (stance, verdict, confidence, claimant, asserted date, context) was dropped as too elaborate to start with.
- **A claim's parent link is optional.** A claim can stand alone.
- **QUESTION is its own content type,** not a claim phrased as a question.
- **Answers are never a content type.** A user's answer to a question lives in their relationship perspective on the claim ↔ question pair: their ratings (e.g. custom fields `motive` / `means` / `ability`) and their HTML review.
- **A user's conclusion on a claim lives in their ordinary perspective on that claim:** like (Overall), agreement, confidence. "Concluding" means a user moving those scores past their own passing level. There is no question-status or "concluded" view.

### Why a new table, and why this shape
- **Not `perspectives`:** a perspective is one user's view of one content item. This is one user's view of how *two* items relate.
- **One table, one row per user per ordered pair.** An earlier draft had a shared link table plus a separate ratings table. It was replaced because what a link *means* differs per user (next point), and a single table mirrors `perspectives`. A pair "exists" as soon as any user rates it.
- **No shared relationship kind on the link.** Opposing users read the same pair differently:
  - O.J.: alice rates the glove question related but not a settler (empty types); ben rates it `would_settle` 8500.
  - Faith and works: ben says James 2:24 `disproves` the claim (9000); alice says it only mildly `undermines` it (2000).

  A shared kind would make them fight over one field.
- **Mirrors `perspectives` patterns exactly:**
  - 0–10000 integer ratings
  - `custom_fields` as a JSONB map of lowercase, user-named keys to 0–10000
  - `review` as sanitized HTML text
  - `privacy` public / private
- **`custom_fields` holds numbers only.** An earlier draft put categorical labels in it (`answer_lean: "did_not_fit"`, `bearing: "against_claim"`). Rejected: it breaks the perspectives pattern. Direction and leaning are expressed through `relationship_types` strengths and the review instead.
- **`review` is HTML text, not a JSONB comments column,** for the same reason: it matches `perspectives.review`.

### Column naming
- **Rejected `content_one_id` / `content_two_id`:** the names say nothing.
- **Rejected `source_content_id` / `target_content_id`:** they imply a direction, which is wrong for the common "related in an unspecified way" case.
- **Chosen `content_id` / `related_content_id`:** mirrors `perspectives.content_id` (the row is a perspective anchored on `content_id`) and reads naturally whether or not a direction applies.

### Why rows are ordered
- **Importance is not symmetric.** In the EV scenario, ben rates battery life at importance 9000 *to* the cost claim, but the cost claim at only 1500 *to* battery life.
- So uniqueness is on `(user_id, content_id, related_content_id)`, not the unordered pair, and a user may hold one row in each direction.

### Why `relationship_types` is a map, not an enum column
- **A pair can hold several relationships at once:** 202 both `supports` and is `narrower` than 201; 405 both `duplicates` and is `narrower` than 401.
- **Each type carries a strength,** so every type is a ranking, not just a label.
- **Adding a type is a code change, not a migration.**
- **An empty map means "related in an unspecified way."** That's the default and a first-class case (Kubrick and the moon landing).

### Relevance vs importance
- **Relevance** is how related the two items are. **Importance** is how much the related item matters *to the anchor*.
- **Disagreement usually shows up in importance, not relevance.** O.J. glove: alice and ben agree it's relevant (7000 vs 9500) but split on importance (2500 vs 9500).

### A type's strength rates the link, not the truth of the related item
- Both sides rate "O.J. was in Chicago" `disproves` 10000, and "the Van Allen belts would have killed the astronauts" `disproves` 9500. They agree on the logic.
- Whether the related claim is *true* is each user's ordinary perspective on that claim, not part of this row.
- **Belief shows up in importance instead.** Alice gives the Chicago claim importance 1500 because she thinks it's false. Ben gives the Van Allen claim importance 9500 because he thinks it may be true.

## Tasks

### Task 1: QUESTION content type
- [ ] `domain.ContentTypeQuestion = "QUESTION"`.
- [ ] `createQuestion` mutation, mirroring `createClaim`: private, owner from the session, trimmed text.
- [ ] Add Content: detect text ending in `?`, add Question to the type picker, and add a `useCreateQuestion` hook.
- [ ] Tests for each layer.

### Task 2: Migration (local Docker first)
- [ ] `backend/migrations/0000NN_add_content_relationship_perspectives.{up,down}.sql`. Take the next free number at execution time and check other branches for collisions.
- [ ] Write idempotent DDL.
- [ ] Apply to the local Docker Postgres only; manual `migrate up` elsewhere after the trial.

### Task 3: Domain, ports, repository
- [ ] Add a `RelationshipType` enum with an `IsSymmetric()` method, plus the `ContentRelationshipPerspective` struct.
- [ ] Repository:
  - `Upsert` on the unique key
  - `GetByID`
  - `ListForContent(contentID, viewerID, limit)`: includes both orientations, applies the visibility joins, and returns aggregates
  - `Delete` (owner only)
- [ ] GORM model and mappers (JSONB maps like `CustomFields`).
- [ ] sqlmock tests.

### Task 4: Service
- [ ] Both endpoints must exist and be readable by the caller (not found otherwise).
- [ ] Reject self-links.
- [ ] Validate that ratings and all map values are 0–10000.
- [ ] Validate `relationship_types` keys against the vocabulary.
- [ ] Lowercase `custom_fields` keys.
- [ ] Sanitize `review`.
- [ ] Unit tests built from the scenario fixtures.

### Task 5: GraphQL
- [ ] Add a `ContentRelationshipPerspective` type.
- [ ] Add a `relatedContent(contentID)` query returning related items with aggregates and `myPerspective`.
- [ ] Mutations, all `@auth`:
  - `upsertContentRelationshipPerspective`
  - `deleteContentRelationshipPerspective` (owner only)
- [ ] Add a new `content_relationship.resolvers.go`; wire the service in `main.go`.
- [ ] Resolver tests.

### Task 6: Frontend data layer (no UI yet)
- [ ] gql documents, types and hooks for the query and mutations.
- [ ] Unit tests.

### Task 7: Seed + verify
- [ ] Load every table in **Appendix: Demo Data** through the demo-mode seeder (`backend/internal/demo/fixtures.go` + `backend/cmd/seed-demo`):
  - add the `casey` persona (backend fixtures and the frontend picker mirror)
  - add the EV demo video fixture
  - seed claims, questions, anchor-claim perspectives and relationship perspectives
  - keep the seeder idempotent and `-reset` safe
- [ ] Update `.docs/DEMO_MODE.md` (persona table and seed summary).
- [ ] Extend `cmd/seed-demo/main_test.go` to assert the coverage checklist.
- [ ] Run the headless checklist: `go build`, `gofmt -l .`, `go test ./...`, `pnpm run test:run`, `pnpm run check`.

## Out of Scope
- Claim/question view UI and rating UI.
- The public/uniqueness gate for claims (`duplicates` data will feed it later).
- AI-suggested relationships.
- Cursor pagination.

---

## Appendix: Demo Data (seed verbatim)

These five scenarios are the agreed demo data. Seed them through the existing demo-mode system, not ad-hoc SQL:
- **Fixtures:** `backend/internal/demo/fixtures.go`
- **Seeder:** `backend/cmd/seed-demo`, which is idempotent and supports `-reset`
- **Stack:** `make demo-up` / `make demo-reset`

They double as service and resolver test fixtures.

**Personas:** every scenario uses the same three demo personas.

| scenario role | demo persona | notes |
|---|---|---|
| first side | `alice` (existing) | |
| opposing side | `ben` (existing) | his blurb is already "disagrees with Alice" |
| unsure party | `casey` (**new persona**) | add to `demo.Personas` **and** the frontend picker mirror `frontend/src/lib/auth/demo.svelte.ts` |

**Content keys:** the ids below (101, 201, …) are fixture keys, not database ids. The seeder resolves them by name.

**Non-claim content:**
- Bible passages (302, 303) come from the Bible reference seed.
- The EV video (402) needs a new `demo.Videos` fixture entry with an illustrative ID and metadata.

**Visibility:** claims and questions are seeded **public** so every persona can see the relationships. Private-claim behaviour is demonstrated separately: one extra claim owned by `alice` stays private.

Each scenario lists its content, each persona's perspective on the anchor claim (their conclusion), and the relationship perspectives. Read each row as *"from `content`'s point of view, `related` is…"*.

**How to read the values.** Each scenario below ends with:
- **What this shows:** why the values are what they are, and which capability the scenario proves.
- **Expected ranking:** the related list the anchor claim should produce. Use it as a test assertion.

**Value conventions** (used throughout the seed; confirm before building validation):

| value | relevance | importance | type strength |
|---|---|---|---|
| 0 | unrelated | doesn't matter to the anchor | the relationship does not hold |
| ~5000 | partly related | matters somewhat | holds partially, or the user is unsure |
| 10000 | about the same thing | decisive for the anchor | holds completely (for `proves` / `disproves`: conclusive *if* the related item is true) |

- NULL relevance or importance means not rated.
- A type absent from the map means no opinion. A type present with 0 would mean "explicitly doesn't hold" (proposed; the seed never uses 0).

**Ranking rule used in the expected rankings:** rows anchored on the claim, averaged per related item across raters, scored as average relevance × average importance ÷ 10000 (so the score is also 0–10000), highest first, rounded.

### Scenario 1: O.J. Simpson

| key | type | name |
|---|---|---|
| 101 | CLAIM | O.J. Simpson killed Nicole Brown Simpson |
| 102 | QUESTION | Did the glove fit? |
| 103 | QUESTION | Did O.J. have motive, means, and ability? |
| 104 | QUESTION | Did O.J. have a motive? |
| 105 | QUESTION | Did O.J. have the means? |
| 106 | QUESTION | Did O.J. have the ability? |
| 107 | CLAIM | O.J.'s blood was found at the scene |
| 108 | CLAIM | The blood evidence was contaminated |
| 109 | CLAIM | O.J. was in Chicago at the time of the murders |
| 110 | CLAIM | O.J. was the killer |

**Perspectives on 101** (like / agreement / confidence):
- alice (guilty): THUMBS_UP / 9500 / 9000
- ben (not guilty): THUMBS_DOWN / 800 / 8500
- casey (unsure): — / 5000 / 2500

| user | content → related | relevance | importance | relationship_types | custom_fields | review |
|---|---|---|---|---|---|---|
| alice | 101 → 102 | 7000 | 2500 | `{}` | `{"evidentiary weight": 2000, "fairness of test": 1500}` | `<p><strong>Mostly no — and it barely matters.</strong> The glove was blood-soaked and had shrunk, and he pulled it on <em>over a latex glove</em> in court.</p><p>A bad fit on that day isn't evidence he never wore it.</p>` |
| ben | 101 → 102 | 9500 | 9500 | `{"would_settle": 8500}` | `{"evidentiary weight": 9000, "fairness of test": 8500}` | `<p><strong>No.</strong> The prosecution chose that demonstration and it failed in front of the jury.</p><ul><li>Their own exhibit</li><li>Their own test</li></ul><p>If the key physical evidence doesn't fit the man, the claim has a hole in it.</p>` |
| casey | 101 → 102 | 8500 | 6000 | `{"would_settle": 4000}` | `{"evidentiary weight": 5000, "fairness of test": 4500}` | `<p>It didn't appear to fit, but the shrinkage and latex points are real.</p><p>I can't tell how much weight this deserves, which is part of why I'm <em>unsure</em> on the claim.</p>` |
| alice | 101 → 103 | 9500 | 9500 | `{"would_settle": 8000}` | `{"motive": 9500, "means": 8500, "ability": 9000, "evidentiary weight": 8500}` | `<p><strong>Yes on all three.</strong></p><ul><li><strong>Motive:</strong> documented history of abusing her</li><li><strong>Means:</strong> no alibi for the time window</li><li><strong>Ability:</strong> physical strength and access to the home</li></ul><p>The strongest question for the claim.</p>` |
| ben | 101 → 103 | 8000 | 3500 | `{"would_settle": 3000}` | `{"motive": 7000, "means": 2500, "ability": 3000, "evidentiary weight": 3000}` | `<p>Motive, <em>arguably</em>. But means and ability rest on a very tight timeline and forensics that were mishandled.</p><p><strong>Having a motive isn't committing a murder</strong>, so this doesn't move me much.</p>` |
| casey | 101 → 103 | 9000 | 8000 | `{"would_settle": 6500, "too_broad": 7000}` | `{"motive": 8500, "means": 5500, "ability": 8000, "evidentiary weight": 6500}` | `<p>Motive and ability look clear. <strong>Means</strong> depends on trusting the evidence handling, and that's what I'm stuck on.</p><p>This question pushes me toward the claim more than any other.</p>` |
| casey | 103 → 105 | 8000 | 7000 | `{"narrower": 8500}` | `{}` | `<p>Too broad as asked. <em>Means</em> is the part I'm actually stuck on; it deserves its own question.</p>` |
| ben | 102 → 103 | 6000 | 5000 | `{}` | `{"dependency": 7000}` | `<p>These connect: if the glove didn't fit, the <em>means</em> part of the other question gets weaker too.</p>` |
| alice | 102 → 103 | 3000 | 2000 | `{}` | `{"dependency": 1500}` | `<p>Barely connected. Means doesn't hinge on one glove; the blood evidence stands on its own.</p>` |
| alice | 101 → 107 | 9500 | 9500 | `{"supports": 9000}` | `{}` | `<p>His blood at the scene is close to decisive.</p>` |
| ben | 101 → 107 | 9000 | 6000 | `{"supports": 3500}` | `{}` | `<p>It would suggest it, <em>if</em> the sample was clean.</p>` |
| ben | 107 → 108 | 9500 | 9000 | `{"undermines": 8500}` | `{}` | `<p>Vannatter carried the reference vial around for hours.</p>` |
| alice | 107 → 108 | 8000 | 3000 | `{"undermines": 2000}` | `{}` | `<p>Contamination can't explain the blood in the Bronco.</p>` |
| alice | 101 → 109 | 9000 | 1500 | `{"disproves": 10000}` | `{}` | `<p>If true it would clear him, but it isn't: he flew to Chicago <em>after</em> the time window.</p>` |
| ben | 101 → 109 | 9000 | 2000 | `{"disproves": 10000}` | `{}` | `<p>Agreed it would disprove it. I'm not arguing he was already in Chicago.</p>` |
| casey | 101 → 110 | 10000 | 4000 | `{"duplicates": 9500}` | `{}` | `<p>Same claim, reworded.</p>` |


**What this shows**
- **Opposing sides split on importance, not relevance.** Glove (102): relevance 7000 (alice) vs 9500 (ben), but importance 2500 vs 9500. The custom fields say why: `fairness of test` 1500 vs 8500, `evidentiary weight` 2000 vs 9000.
- **A user's answer to a question is in their ratings and review.** Alice answers "mostly no, and it barely matters" with empty types. Ben answers "no" with `would_settle` 8500.
- **Custom fields break down a compound question.** On 103, `motive` / `means` / `ability` show exactly where people differ:
  - `means`: alice 8500, ben 2500, casey 5500. That average of 5500 makes `means` the most disputed point.
  - Casey's doubt is specifically about means; her motive (8500) and ability (8000) are high.
- **Question hygiene is data.** Casey marks 103 `too_broad` 7000 and links 103 → 105 (`narrower` 8500), effectively proposing "split this question."
- **Question-to-question links.** Ben rates 102 → 103 `dependency` 7000 (glove and means are tied); alice rates it 1500. Empty types here: related, with no logical type named.
- **Same type, different strength.** 107 (blood at the scene) `supports` 101: alice 9000, ben 3500. Neither disputes the type, only how strongly it holds.
- **Evidence chains.** 108 (contamination) `undermines` 107: ben 8500, alice 2000. A row can be about evidence about evidence.
- **Agree on logic, not truth.** 109 (Chicago alibi) `disproves` 101 at 10000 from both sides. Importance is low (1500 / 2000) because neither believes 109.
- **Duplicates.** Casey flags 110 as `duplicates` 9500 of 101, the input the future uniqueness gate will use.

**Expected ranking for 101**

| rank | related | raters | avg relevance | avg importance | score |
|---|---|---|---|---|---|
| 1 | 107 blood at the scene | alice, ben | 9250 | 7750 | 7169 |
| 2 | 103 motive, means, ability | alice, ben, casey | 8833 | 7000 | 6183 |
| 3 | 102 glove | alice, ben, casey | 8333 | 6000 | 5000 |
| 4 | 110 duplicate wording | casey | 10000 | 4000 | 4000 |
| 5 | 109 Chicago alibi | alice, ben | 9000 | 1750 | 1575 |

109 sinks to the bottom despite `disproves` 10000: the ranking reflects what people think matters, not logical strength.

### Scenario 2: Coffee and health

| key | type | name |
|---|---|---|
| 201 | CLAIM | Coffee is good for your health |
| 202 | CLAIM | Moderate coffee drinking lowers the risk of type 2 diabetes |
| 203 | CLAIM | Caffeine raises blood pressure |
| 204 | QUESTION | Is caffeine healthy? |
| 205 | QUESTION | How many cups a day is "moderate"? |

**Perspectives on 201:**
- alice (good): THUMBS_UP / 8500 / 7500
- ben (not good): THUMBS_DOWN / 2000 / 7000
- casey (unsure): — / 5000 / 3000

| user | content → related | relevance | importance | relationship_types | custom_fields | review |
|---|---|---|---|---|---|---|
| alice | 201 → 202 | 9000 | 8500 | `{"supports": 8000, "narrower": 7000}` | `{"study quality": 8000}` | `<p>Large cohort studies agree. It's the best-evidenced piece of the broader claim.</p>` |
| ben | 201 → 202 | 8500 | 4000 | `{"supports": 3500, "narrower": 8000}` | `{"study quality": 5000}` | `<p>Observational data. Coffee drinkers differ in other ways: <em>correlation, not cause</em>.</p>` |
| ben | 201 → 203 | 9000 | 8500 | `{"undermines": 7500}` | `{"study quality": 7500}` | `<p>Measurable and repeatable. For anyone with hypertension this outweighs the rest.</p>` |
| alice | 201 → 203 | 7500 | 3000 | `{"undermines": 2500}` | `{"study quality": 6000}` | `<p>The effect is small and fades with regular use.</p>` |
| casey | 201 → 204 | 7000 | 3000 | `{"too_broad": 8500, "overlaps": 6000}` | `{}` | `<p>Caffeine isn't coffee: tea, soda, pills. This question wanders off the claim.</p>` |
| casey | 201 → 205 | 9500 | 9000 | `{"would_settle": 7500}` | `{}` | `<p><strong>My real sticking point.</strong> "Good for you" probably flips somewhere between two and six cups.</p>` |


**What this shows**
- **Same types, opposite strengths.** Both alice and ben say 202 `supports` 201 and is `narrower`, but alice rates `supports` 8000 vs ben's 3500. Their real disagreement is evidence quality: `study quality` 8000 vs 5000 (ben: "observational data").
- **A mirror image.** On 203 (blood pressure), ben rates `undermines` 7500 with importance 8500; alice rates it 2500 with importance 3000. Each side discounts the other's evidence, and the model captures that symmetrically.
- **A relevant but poorly scoped question.** Casey marks 204 `too_broad` 8500 and `overlaps` 6000 with importance only 3000: caffeine isn't coffee.
- **The unsure person's crux is findable from data.** Casey's highest-importance row is 205 ("how many cups is moderate?"): importance 9000, `would_settle` 7500.

**Expected ranking for 201**

| rank | related | raters | avg relevance | avg importance | score |
|---|---|---|---|---|---|
| 1 | 205 how many cups | casey | 9500 | 9000 | 8550 |
| 2 | 202 diabetes risk | alice, ben | 8750 | 6250 | 5469 |
| 3 | 203 blood pressure | alice, ben | 8250 | 5750 | 4744 |
| 4 | 204 is caffeine healthy | casey | 7000 | 3000 | 2100 |

### Scenario 3: Faith and works (Bible passages)

| key | type | name |
|---|---|---|
| 301 | CLAIM | Salvation is by faith alone |
| 302 | BIBLE_PASSAGE | Ephesians 2:8-9 |
| 303 | BIBLE_PASSAGE | James 2:24 |
| 304 | QUESTION | Do Paul and James mean the same thing by "justified"? |
| 305 | CLAIM | James describes the evidence of faith, not its cause |

**Perspectives on 301:**
- alice (Protestant, agrees): THUMBS_UP / 9500 / 9000
- ben (Catholic, disagrees): THUMBS_DOWN / 1500 / 8500
- casey (unsure): — / 5500 / 3000

| user | content → related | relevance | importance | relationship_types | custom_fields | review |
|---|---|---|---|---|---|---|
| alice | 301 → 302 | 10000 | 9500 | `{"supports": 9500}` | `{"clarity": 9000}` | `<p><em>"By grace you have been saved through faith… not a result of works."</em> About as direct as scripture gets.</p>` |
| ben | 301 → 302 | 9500 | 7000 | `{"supports": 4000}` | `{"clarity": 6000}` | `<p>Paul excludes <strong>works of the law</strong>, not the obedience of faith. Keep reading into verse 10.</p>` |
| ben | 301 → 303 | 10000 | 9500 | `{"disproves": 9000}` | `{"clarity": 9500}` | `<p>The only place scripture says "faith alone," it says <strong>not</strong> by faith alone.</p>` |
| alice | 301 → 303 | 9500 | 6000 | `{"undermines": 2000}` | `{"clarity": 5000}` | `<p>James answers a different question: how living faith shows itself.</p>` |
| alice | 303 → 305 | 9000 | 8500 | `{"explains": 8500}` | `{}` | `<p>This reading reconciles James with Paul without strain.</p>` |
| ben | 303 → 305 | 8000 | 5000 | `{"explains": 2500}` | `{}` | `<p>A later gloss the text itself doesn't need.</p>` |
| casey | 301 → 304 | 9500 | 9500 | `{"would_settle": 9000}` | `{}` | `<p>Everything hinges on this. If the word means different things, the passages don't collide.</p>` |


**What this shows**
- **Non-claim content as related items.** Both passages are existing `BIBLE_PASSAGE` content. The table is content-generic, so no new structure is needed.
- **The same passage, read differently:**
  - Ephesians 2:8-9 `supports` the claim: alice 9500, ben 4000 (`clarity` 9000 vs 6000).
  - James 2:24: ben chooses `disproves` 9000 (`clarity` 9500), while alice chooses only `undermines` 2000 (`clarity` 5000).

  Users pick *different types* for the same pair, which is exactly why types are per user and not a shared link kind.
- **Rows can anchor on any content, not just claims.** 303 → 305 is anchored on the James passage: claim 305 `explains` it, alice 8500, ben 2500.
- **Reused custom field names aggregate.** Both use `clarity` on both passages, so it can be averaged per passage. Lowercasing keys matters for this.
- **The unsure person's crux.** Casey rates 304 ("do Paul and James mean the same thing by 'justified'?") `would_settle` 9000, importance 9500.
- **Both traditions get strong, good-faith rows.** The data shouldn't favor either side.

**Expected ranking for 301**

| rank | related | raters | avg relevance | avg importance | score |
|---|---|---|---|---|---|
| 1 | 304 meaning of "justified" | casey | 9500 | 9500 | 9025 |
| 2 | 302 Ephesians 2:8-9 | alice, ben | 9750 | 8250 | 8044 |
| 3 | 303 James 2:24 | alice, ben | 9750 | 7750 | 7556 |

(305 is anchored on 303, so it appears in 303's related list, not 301's.)

### Scenario 4: EV ownership cost (YouTube source)

| key | type | name |
|---|---|---|
| 401 | CLAIM | Electric cars are cheaper to own than gas cars |
| 402 | YOUTUBE_VIDEO | "EV vs Gas: 5-Year Total Cost of Ownership" (new demo video fixture) |
| 403 | CLAIM | EV batteries need replacing after about 8 years |
| 404 | QUESTION | Cheaper over how many years, at what electricity price? |
| 405 | CLAIM | EVs have a lower total cost of ownership in the U.S. |

**Perspectives on 401:**
- alice (EV owner, agrees): THUMBS_UP / 9000 / 8000
- ben (disagrees): THUMBS_DOWN / 2500 / 7500
- casey (shopper, unsure): — / 5000 / 2000

| user | content → related | relevance | importance | relationship_types | custom_fields | review |
|---|---|---|---|---|---|---|
| alice | 401 → 402 | 9000 | 7500 | `{"source": 8500, "supports": 8000}` | `{"source reliability": 7500}` | `<p>Clear spreadsheet, real receipts. Fuel and maintenance savings add up.</p>` |
| ben | 401 → 402 | 8500 | 4000 | `{"source": 6000, "supports": 4500}` | `{"source reliability": 3500}` | `<p>Assumes cheap home charging, ignores depreciation, and it's <em>sponsored by a charger company</em>.</p>` |
| ben | 401 → 403 | 9500 | 9000 | `{"undermines": 8000}` | `{}` | `<p>One battery replacement wipes out years of fuel savings.</p>` |
| ben | 403 → 401 | 9000 | 1500 | `{}` | `{}` | `<p>Whether EVs are cheaper says nothing about how long batteries last.</p>` |
| alice | 401 → 403 | 9000 | 3000 | `{"undermines": 1500}` | `{}` | `<p>Most packs are warrantied 8–10 years and outlast the warranty.</p>` |
| casey | 401 → 404 | 10000 | 9500 | `{"would_settle": 9500}` | `{}` | `<p>The answer changes with the time horizon and my local rates. Until I know those, I can't conclude.</p>` |
| casey | 401 → 405 | 10000 | 5000 | `{"duplicates": 7000, "narrower": 6000}` | `{}` | `<p>Nearly the same claim, limited to the U.S. Probably worth merging.</p>` |

**What this shows**
- **A YouTube video as a `source`.** Alice: `source` 8500, `supports` 8000, `source reliability` 7500. Ben: `source` 6000, `supports` 4500, `source reliability` 3500 ("sponsored by a charger company"). Two types in one map, plus a custom rating for how trustworthy the source is.
- **One-way importance.** Ben's two rows on the same pair:
  - 401 → 403: battery life matters a lot to the cost claim (importance 9000, `undermines` 8000).
  - 403 → 401: the cost claim barely matters to battery life (importance 1500, empty types).

  This is the reason rows are ordered.
- **The other side discounts it.** Alice rates 403 `undermines` only 1500, importance 3000 ("packs outlast the warranty").
- **The unsure shopper's crux.** Casey rates 404 (time horizon, electricity price) relevance 10000, importance 9500, `would_settle` 9500.
- **A partial duplicate.** Casey rates 405 `duplicates` 7000 *and* `narrower` 6000: nearly the same claim, but U.S.-only. A merge candidate, not an exact duplicate, and a case where two types at once are needed.

**Expected ranking for 401**

| rank | related | raters | avg relevance | avg importance | score |
|---|---|---|---|---|---|
| 1 | 404 time horizon / price | casey | 10000 | 9500 | 9500 |
| 2 | 403 battery replacement | alice, ben | 9250 | 6000 | 5550 |
| 3 | 402 cost video | alice, ben | 8750 | 5750 | 5031 |
| 4 | 405 U.S. duplicate | casey | 10000 | 5000 | 5000 |

If ben's reverse row (403 → 401) also counts toward relevance, as **Visibility and aggregation** says, 403's average relevance becomes 9167 and its score 5500. The order doesn't change.

### Scenario 5: Moon landing (unspecified relatedness, a loaded question)

| key | type | name |
|---|---|---|
| 501 | CLAIM | The Apollo 11 moon landing really happened |
| 502 | CLAIM | Stanley Kubrick directed 2001: A Space Odyssey |
| 503 | CLAIM | The Van Allen belts would have killed the astronauts |
| 504 | QUESTION | Why won't NASA admit the footage was staged? |
| 505 | QUESTION | Could 1969 technology have faked the footage? |

**Perspectives on 501:**
- alice (happened): THUMBS_UP / 10000 / 9500
- ben (hoax): THUMBS_DOWN / 1000 / 7000
- casey (unsure): — / 6000 / 3500

| user | content → related | relevance | importance | relationship_types | custom_fields | review |
|---|---|---|---|---|---|---|
| alice | 501 → 502 | 3000 | 300 | `{}` | `{}` | `<p>Related only through hoax folklore. True, but it says nothing about the landing.</p>` |
| ben | 501 → 502 | 7000 | 4000 | `{}` | `{}` | `<p>He had the skill to fake it. Not proof, but it's part of the story.</p>` |
| alice | 501 → 503 | 9000 | 6000 | `{"disproves": 9500}` | `{}` | `<p>If true it would rule the landing out, but the trajectory crossed the belts' thin edge in under an hour.</p>` |
| ben | 501 → 503 | 9500 | 9500 | `{"disproves": 9500}` | `{}` | `<p>Radiation is the hardest problem for the official story.</p>` |
| casey | 501 → 504 | 6000 | 1000 | `{"loaded": 10000}` | `{}` | `<p>Assumes its own answer. Rephrased, it would be worth asking.</p>` |
| casey | 501 → 505 | 9500 | 8500 | `{"would_settle": 7000}` | `{"technical difficulty": 8000}` | `<p><strong>The fair version of that question</strong>, and what I'd need answered.</p>` |


**What this shows**
- **Related in an unspecified way.** Kubrick (502) has empty types from both sides. There's no logical link, only folklore, so the disagreement lives entirely in relevance and importance: alice 3000 / 300, ben 7000 / 4000.
- **Agree on logic, disagree on truth.** Both rate 503 (Van Allen belts) `disproves` 9500. Importance differs (alice 6000, ben 9500) because ben thinks 503 may be true and alice doesn't.
- **A loaded question and its fair version:**
  - 504 ("why won't NASA admit…") gets `loaded` 10000 and importance 1000.
  - 505 ("could 1969 technology have faked the footage?") gets `would_settle` 7000, importance 8500 and `technical difficulty` 8000.

  The ranking buries the loaded question and surfaces the fair one.

**Expected ranking for 501**

| rank | related | raters | avg relevance | avg importance | score |
|---|---|---|---|---|---|
| 1 | 505 could 1969 tech fake it | casey | 9500 | 8500 | 8075 |
| 2 | 503 Van Allen belts | alice, ben | 9250 | 7750 | 7169 |
| 3 | 502 Kubrick | alice, ben | 5000 | 2150 | 1075 |
| 4 | 504 loaded question | casey | 6000 | 1000 | 600 |

### Coverage checklist (seed must demonstrate all of these)

| capability | where |
|---|---|
| Related in an unspecified way (empty `relationship_types`) | 5 (alice/ben 501 → 502), 1 (102 → 103) |
| Importance differs by direction | 4 (ben 401 → 403 vs 403 → 401) |
| Non-claim content as related items | 3 (Bible passages), 4 (YouTube) |
| Scope: narrower, overlaps, too broad | 1, 2, 4 |
| Duplicates (future merge / uniqueness gate) | 1 (101 → 110), 4 (401 → 405) |
| Interpretation (`explains`) | 3 |
| Opposing sides agree on logic, not truth | 1 (109), 5 (503) |
| Question hygiene: `loaded`, `too_broad`, `would_settle` | 1, 2, 4, 5 |
| User-named custom ratings | 1, 2, 3, 4, 5 |
| Opposing + unsure conclusions on every anchor claim | all |

### Open questions the numbers surfaced
1. **Single-rater items dominate the rankings.** Casey's question rows rank first in four of five lists (205, 304, 404, 505), because one rating isn't averaged against an opposing view. Consider weighting by number of raters (e.g. a Bayesian average) before the claim view ships. Not decided.
2. **How reverse-anchored rows count.** The design says they contribute to relevance; confirm whether they should also count toward importance or types (ben's 403 → 401 is the test case).
3. **Optional seed addition:** ordinary perspectives on 109 (Chicago alibi) and 503 (Van Allen belts) would make "agree on logic, disagree on truth" visible end to end. Today it's carried only by the reviews.
