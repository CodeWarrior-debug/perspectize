# Food & drink content type (`FOOD_ITEM`) — Design

> ⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed.

Status: **proposal, unscheduled. Not reviewed.** Written from a one-line request ("a food / beverage item type with caloric and nutritional information, backed by a solid API"). Every judgment call is listed in **§14 Decisions to confirm**. Intent: [project-management/intents/food-item-content-type.md](../../../project-management/intents/food-item-content-type.md) (draft).

## Scope

One new content type, `FOOD_ITEM`, covering packaged foods, generic foods (e.g. "banana, raw") and beverages. You add one by barcode, by a source URL, or by picking a search result. Each item stores calories and a standard nutrition panel, normalised so items can be sorted and compared side by side in the Activity table. People then write perspectives on it, as on any other content.

**Not in v1:** recipes and meals (composites), restaurant menu items, user-entered homemade foods, camera barcode scanning, diet logging or daily totals, and non-US label formats (see §11).

---

## 1. Source choice: USDA FoodData Central + Open Food Facts

Two free, open sources together cover generic foods, US packaged foods and international packaged foods. No paid API is needed for v1.

| Source | What it's good for | Access | Licence (what we may **store**) | Limits |
|---|---|---|---|---|
| **USDA FoodData Central (FDC)** — primary for nutrition | Lab-analysed generic foods (Foundation, SR Legacy), survey foods (FNDDS) and ~400k US branded foods whose label data the manufacturers submit | REST, `api.nal.usda.gov/fdc/v1`, free data.gov API key | **CC0 public domain.** Storing is unrestricted; USDA asks for a source credit | 1,000 req/hour per key (HTTP 429 and a one-hour block when exceeded). `DEMO_KEY` gives 30/hour and 50/day, which is not usable in prod. Higher limits on request |
| **Open Food Facts (OFF)** — primary for packaged-product context | ~3M+ crowdsourced products worldwide, keyed by barcode, with front image, Nutri-Score, NOVA (degree of processing), allergens, ingredients, categories and scan counts | REST, `world.openfoodfacts.org/api/v2`, **no key**; a descriptive `User-Agent` is required | Database **ODbL**, contents **DbCL**, images **CC BY-SA**. We may store facts per item with attribution. We don't redistribute a derivative database, so ODbL share-alike isn't triggered | **15 product reads/min and 10 searches/min per IP.** Exceeding these risks an IP ban. Our backend is one IP, so these limits are **shared by every user** |

Verified 2026-11-01: FDC's API guide (key, limits, CC0) and a live OFF v2 call (`/api/v2/product/3017624010701.json` returned Nutella with `nutriments.energy-kcal_100g = 539`, `nutriscore_grade = e`, `allergens_tags = [en:nuts]`, `unique_scans_n = 43`, and no `serving_size`). A live FDC call was not possible: `DEMO_KEY` was rate-limited from the cloud IP. The FDC field paths below come from FDC's published OpenAPI spec and **must be checked against a recorded fixture** before the adapter is written.

**Rejected for v1:**
- **Nutritionix** (Syndigo) has the best restaurant coverage, but pricing is by quote with no published rate limits, and its terms historically restrict storage.
- **Edamam** and **FatSecret Platform** have free tiers with attribution, but historically restrict caching or storing responses beyond a short window, which conflicts with our model (we store `response` permanently). I could not verify their current terms from here.

Revisit any of the three only for restaurant items (§11), and re-read their terms first (ADDING_CONTENT_TYPE Decision 9).

### Why both, and who wins a conflict

Most US barcodes exist in both sources. On a barcode add we call both in parallel, and the payload records which source supplied each block:

- **Nutrition numbers:** FDC Branded first (manufacturer-submitted label data), then OFF. FDC is the only source for unbarcoded generic foods.
- **Image, Nutri-Score, NOVA, allergens, categories, scan count:** OFF only. FDC has none of these, apart from an ingredients string.
- **Name and brand:** OFF's `product_name` + `brands` if present (cleaner casing), otherwise FDC `description` (often UPPERCASE: title-case it for display, keep the original) + `brandOwner`.

`response.nutritionSource` (`FDC_BRANDED | FDC_FOUNDATION | FDC_SR_LEGACY | FDC_SURVEY | OFF`) is shown in the details view and tooltips, so a reader knows whether a figure is lab data, label data or crowdsourced.

---

## 2. Identity, ingestion and dedupe

**Enum:** `FOOD_ITEM`, display label "Food & drink". Stored as DB value `food_item` via the existing lowercase converter. No migration is needed: `content.content_type` has no CHECK constraint.

**Input accepted (one text box, autodetected, like Movie in the Add Content window):**

| Input | Example | Resolves to |
|---|---|---|
| Barcode (UPC-A 12, EAN-13, EAN-8, GTIN-14) | `3017624010701` | Normalised to GTIN-13 (UPC-A gets a leading 0, check digit validated), then OFF + FDC lookup |
| OFF product URL | `world.openfoodfacts.org/product/3017624010701/nutella-ferrero` | Barcode from the path |
| FDC URL | `fdc.nal.usda.gov/food-details/2345678/nutrients` | `fdcId`. If it is a Branded food with a `gtinUpc`, it is treated as that barcode |
| Search result (Discover, §8) | — | The result's canonical URL |

**Canonical URL (the dedupe key; the global `UNIQUE(url)` stays):**
- A **barcoded item** gets `https://world.openfoodfacts.org/product/<GTIN-13>`, whichever source supplied the numbers. One barcode is one row: adding the same product by its FDC URL later hits the same key.
- An **unbarcoded generic food** gets `https://fdc.nal.usda.gov/food-details/<fdcId>/nutrients`.

**Not found in either source:** return `NOT_FOUND` with "No nutrition data for this barcode in USDA or Open Food Facts". Don't create an empty row. A "contribute it to Open Food Facts" link is a nice touch, not v1.

**Mutation:** `createContentFromFood(input: { identifier: String! }): Content! @auth`. The input name is `identifier` because it accepts a barcode, not only a URL.

---

## 3. What is stored: a normalised nutrition panel

Both sources become one shape in `content.response` (the `foodItem` payload). All amounts are numbers in fixed units, and **missing is `null`, never 0** (Nutella's OFF record has no `serving_size`, for example).

```jsonc
{
  "schemaVersion": 1,
  "gtin": "03017624010701" /* GTIN-13 or null */, "fdcId": 2345678 /* or null */, "offCode": "3017624010701",
  "name": "Nutella", "nameOriginal": "NUTELLA HAZELNUT SPREAD", "brand": "Ferrero",
  "form": "SOLID",                        // SOLID | LIQUID (§4)
  "kind": "FOOD",                         // FOOD | BEVERAGE (§4)
  "packageQuantity": { "amount": 400, "unit": "g" },
  "serving": { "amount": 37, "unit": "g", "label": "2 tbsp" },   // null when unknown
  "basis": "100g",                        // "100g" | "100ml": the per-100 basis for this item
  "per100":   { /* Nutrients, per 100 g or 100 ml */ },
  "perServing": { /* Nutrients; null when serving unknown */ },
  "nutritionSource": "FDC_BRANDED",
  "nutritionDerived": false,              // true when perServing was computed from per100 (or the reverse)
  "nutriScore": "e", "novaGroup": 4,      // OFF; null when absent
  "allergens": ["nuts", "milk"],          // OFF allergens_tags with the "en:" prefix stripped
  "traces": ["gluten"],
  "ingredientsText": "Sugar, palm oil, hazelnuts 13%, ...",
  "categories": ["spreads", "hazelnut-spreads"],
  "imageUrl": "https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.100.400.jpg",
  "offScans": 43, "offCompleteness": 0.76,
  "sourceModifiedAt": { "fdc": "2025-04-24", "off": "2026-09-22T..." },
  "fetchedAt": "2026-11-01T12:00:00Z",
  "panel": [ /* the full nutrient list, detail view only (§3.2) */ ]
}
```

### 3.1 Core nutrients (columns, sort and filter)

These twelve are what a US Nutrition Facts label shows, plus caffeine and alcohol for beverages. They exist in both `per100` and `perServing`.

| Key | Unit | FDC nutrient (`nutrient.number`) | OFF `nutriments` key | Notes |
|---|---|---|---|---|
| `energyKcal` | kcal | 208 (Energy, KCAL) | `energy-kcal_100g` | If FDC only has kJ (268), divide by 4.184. If OFF only has `energy_100g` (kJ), convert the same way |
| `fat` | g | 204 | `fat_100g` | |
| `saturatedFat` | g | 606 | `saturated-fat_100g` | |
| `transFat` | g | 605 | `trans-fat_100g` | |
| `cholesterol` | mg | 601 | `cholesterol_100g` (g → ×1000) | |
| `sodium` | mg | 307 | `sodium_100g` (g → ×1000) | Prefer OFF's sodium value to salt÷2.5 (OFF derives one from the other) |
| `carbohydrate` | g | 205 | `carbohydrates_100g` | US "total carbohydrate" includes fiber; EU "carbohydrate" excludes it. Keep OFF's value and note the convention in the tooltip (§11) |
| `fiber` | g | 291 | `fiber_100g` | |
| `sugars` | g | 269 | `sugars_100g` | |
| `addedSugars` | g | 539 | `added-sugars_100g` | Often missing outside the US |
| `protein` | g | 203 | `proteins_100g` | |
| `caffeine` | mg | 262 | `caffeine_100g` (g → ×1000) | Rarely filled in. Blank means unknown, not caffeine-free |
| `alcoholAbv` | % vol | 221 (Alcohol, ethyl, g/100 g) — convert ÷ 0.789 for drinks | `alcohol_100g` (already % vol) | Beverages only |

**FDC per-100 vs per-serving:** Branded `foodNutrients[].amount` is **per 100 g/ml**, derived from the label; `labelNutrients` is the **per-serving** label as printed. Use `labelNutrients` for `perServing` when present (it matches the package), otherwise derive it. Foundation, SR and Survey foods are per 100 g only, and their servings come from `foodPortions[]` (the first portion with a `gramWeight`, e.g. "1 medium (118 g)").

**Derivation rule:** if only one of `per100` and `perServing` exists and the serving's gram/ml weight is known, compute the other and set `nutritionDerived: true`. The tooltip says "calculated from the per-100 g label". Never derive across a g↔ml mismatch (we don't know the density).

### 3.2 Full panel (details view only)

`panel` holds every nutrient the source returned, as `{ name, number, amount, unit, per: "100g" }`: vitamins, minerals, amino acids and fatty-acid breakdowns, often 60–150 entries for Foundation foods. It is **never** sent with list rows. It is exposed by a separate field fetched only by the details query (§9), per [QUERY_BUDGET.md](../../../.docs/QUERY_BUDGET.md) and Decision 8's "summary in the row, full detail on click".

### 3.3 Size of `response`

The trimmed payload is ~2 KB, plus ~6 KB for the panel on Foundation foods. We don't store raw API responses (FDC Foundation responses run to 100 KB+).

---

## 4. Food vs beverage

One type, two facets, so a grid filter can split them without a second enum:

- **`form`** (`SOLID | LIQUID`) is physical, and decides whether the basis is per 100 g or per 100 ml. It comes from the serving or package unit (`ml`, `l`, `fl oz`, FDC `MLT`), then from OFF `nutrition_data_per = 100ml`. The default is `SOLID`.
- **`kind`** (`FOOD | BEVERAGE`) is what people mean. It is `BEVERAGE` when OFF categories include `en:beverages`, or FDC `brandedFoodCategory`/`foodCategory` is a beverage category, or `form = LIQUID` and there is no other signal. Soup is `LIQUID` but `FOOD`. That case is why there are two fields.

Beverage rows show **Caffeine** and **ABV** columns. They are hidden by default for food (§7).

---

## 5. Comparing across items: why per-100 and per-serving both matter

Serving sizes are set by manufacturers and are not comparable (a 30 g cereal serving vs a 55 g one). So:

- **Default sort and the "Calories" column use per serving.** That is what someone actually eats or drinks, and what the label shows. It is the "how big" answer for Decision 8.
- **A "per 100 g/ml" toggle** in the column header tooltip switches all nutrient columns to the per-100 basis for fair comparison. One grid state, `nutritionBasis: SERVING | PER100`, kept in the existing saved-view state.
- **Two derived rates**, not stored, computed in the sort SQL:
  - **Protein per 100 kcal** (`protein ÷ energyKcal × 100`): "how much protein for the calories".
  - **Sugar % of calories** (`sugars × 4 ÷ energyKcal`).
  - Both are null when `energyKcal` is null or 0 (water, black coffee, diet soda), and those rows sort last.
- **Mixing bases is flagged.** Sorting solids and liquids together on per-100 compares grams with millilitres. When the filtered set mixes `form`s, the header shows the same "mixed units" alert the length column already uses.

---

## 6. Source terms and liability (Decision 9)

- **Storing:** allowed for both sources (CC0; ODbL/DbCL with attribution).
- **Attribution:** the details view footer says "Nutrition data: USDA FoodData Central" and/or "Open Food Facts — ODbL", with links. An OFF image carries "Image: Open Food Facts contributors, CC BY-SA". Show only the credits for the sources the item actually used.
- **Images:** hotlink `images.openfoodfacts.org`. CSP `img-src` already allows `https:`, so no CSP change is needed. Don't copy images into our storage (CC BY-SA would then attach to our copy).
- **Not medical advice.** Allergen and nutrition data can be wrong, out of date or crowdsourced. The details view and the allergen filter carry: "From the product label and public databases. May be incomplete or out of date. Always check the package if you have an allergy." The **allergen filter is labelled "Hide items listing…", never "Safe for…"**.
- **OFF etiquette:** `User-Agent: Perspectize/<version> (<contact email>)`. The contact address is an env var, not hard-coded: `OFF_CONTACT_EMAIL`.
- **No embed or player.** No consent gate is needed.

---

## 7. Activity table: default columns (Food & drink filtered solo; Type hidden)

◎ · **Item** (thumbnail + name, brand under it) · **Kind** · **Serving** · **Calories** · **Protein** · **Carbs** · **Fat** · **Sugars** · **Sodium** · **Nutri-Score** · **Allergens** · **Tags**

- **Item:** OFF front image (40 px). With no image, a food or drink glyph by `kind`.
- **Serving:** "37 g (2 tbsp)". Blank when unknown, with the tooltip "No serving size on record; nutrients shown per 100 g".
- **Calories:** per serving by default. The tooltip shows both bases and the source. When `perServing` is null the cell shows the per-100 value with a small "/100g" suffix, so it is never silently a different basis.
- **Nutri-Score:** the A–E letter badge (OFF's colours). Blank when absent. The tooltip explains that it is an EU front-of-pack score, not a USDA one, and how it is computed.
- **Allergens:** chips (multi-mode tooltip: checklist + copy). Traces are listed separately as "may contain".
- **Tags:** OFF categories (the external-source set). This intersects issue #560 (separating source tags from user tags) the same way Movie keywords do, and must not block it.
- **Column picker extras:** NOVA group, Saturated fat, Trans fat, Cholesterol, Fiber, Added sugars, Caffeine, ABV, Protein / 100 kcal, Sugar % of kcal, Package size, Brand, Barcode, FDC ID, Nutrition source, Data as of, Date Added.
- **Beverage-only rows in view** (`kind = BEVERAGE` filter) swap Fat and Sodium out of the defaults for **Caffeine** and **ABV**.

**Sort rules** (`helpers.go`, all `NUMERIC` casts over JSONB with `NULLS LAST`): calories, protein, carbs, fat, sugars, sodium, fiber, caffeine, ABV (each on the active basis, i.e. `response->'perServing'->>'energyKcal'` or `response->'per100'->>...`), the two derived rates as `CASE` expressions (null-safe, like `PercentLiked`), Nutri-Score (`a < b < … < e`, null last), and NOVA (1–4).

**Filters:**
- Number ranges on each core nutrient.
- `kind` and `form`.
- Nutri-Score letters.
- **Allergen exclude** (`NOT (response->'allergens' ? 'nuts')` for each chosen allergen; rows with *no allergen data* are **excluded** too when this filter is on, because unknown ≠ none).
- Search field `BRAND` (new `ContentSearchField`, `ILIKE` on `response->>'brand'`).

**No index migration in v1.** We follow the Movie precedent: add a GIN/expression index only with EXPLAIN evidence on real volume.

---

## 8. Discover and the import picker (Decisions 7 and 8)

**Placement: search only, no feed.** Neither source has popularity or trending data worth a feed. OFF scan counts are sparse and skewed to France. People mostly add a food they have in hand, or look one up by name.

**Search is in-app and runs through the backend.** The FDC key must stay server-side, and the OFF rate limit is shared, so the browser never calls either directly and `connect-src` doesn't change.

- `foodSearch(query: String!, kind: FoodKind, page: Int): FoodSearchPage!`
- It calls **FDC `/foods/search` first.** At 1,000/h it can serve type-ahead, debounced at 400 ms, with a minimum of 3 characters. Results are grouped "Generic" (Foundation/SR/Survey) and "Packaged" (Branded).
- **OFF search** (10/min shared) runs only when FDC returns fewer than 5 packaged hits, or the user toggles "Include international products". It is cached server-side for 24 h per normalised query. When the OFF budget is spent, the picker says "International search busy — try again in a minute" instead of failing silently.
- **Barcode lookups** go to OFF product reads (15/min shared), with a server-side cache of 24 h for hits and 1 h for misses. A token bucket in the adapter keeps us under the limit and returns `RATE_LIMITED` (shown as "Busy, try again shortly") rather than risking an IP ban.

**The decision row (what each search result shows without leaving the page):**

| Question | Field | Source | Notes |
|---|---|---|---|
| **What is it?** | Name, brand, small image, Generic/Packaged badge | OFF `product_name`/`brands`/`image_front_small_url`; FDC `description`/`brandOwner`/`dataType` | FDC search results have no image. Show the kind glyph, never a broken image |
| **How big?** | Serving ("37 g · 2 tbsp") and **calories per serving** | FDC `servingSize`+`servingSizeUnit`+`householdServingFullText`, `foodNutrients` (number 208); OFF `serving_size`, `nutriments.energy-kcal_serving` | If there is no serving, show "per 100 g" calories, labelled as such |
| **How current?** | "Label data as of 2025-04" / "Updated 2026-09" | FDC `publicationDate`/`modifiedDate`; OFF `last_modified_t` | Old branded entries matter: reformulations change numbers |
| **How well regarded / how reliable?** | Nutri-Score; data quality: "USDA lab data" / "Manufacturer label (USDA)" / "Crowdsourced, 76% complete" | `dataType`; OFF `nutriscore_grade`, `completeness` | **Say what doesn't exist:** there are no ratings or reviews in either source. The picker says so once in its footer. OFF `unique_scans_n` is shown in the detail panel only, as "scanned N times on Open Food Facts", and is not a ranking |
| **What's in it?** (on click) | Macros at a glance, allergens, ingredients, full panel | §3.1, §3.2 | Fetched lazily for the detail panel only |

Shared rules: **already in library** rows are marked and unselectable, with a link to the existing content (matched on canonical URL). Low-quality OFF entries (`completeness < 0.5`, or no energy value) are shown muted. Counts are a snapshot: show "as of", and the actual add re-fetches.

---

## 9. GraphQL surface

```graphql
enum ContentType { ... FOOD_ITEM }
enum FoodKind { FOOD BEVERAGE }
enum NutritionBasis { SERVING PER100 }

input CreateContentFromFoodInput {
  "Barcode (UPC/EAN/GTIN), Open Food Facts product URL, or FoodData Central URL"
  identifier: String!
}

type FoodSearchResult {
  url: String!               # canonical — pass to createContentFromFood
  name: String!
  brand: String
  imageUrl: String
  kind: FoodKind
  generic: Boolean!          # FDC Foundation/SR/Survey
  servingLabel: String
  caloriesPerServing: Float
  caloriesPer100: Float
  dataQuality: String!       # "USDA lab data" | "Manufacturer label" | "Crowdsourced"
  sourceModifiedAt: Time
  existingContentId: ID      # set when already in the library
}
type FoodSearchPage { items: [FoodSearchResult!]! hasMore: Boolean! internationalSearched: Boolean! }

extend type Content {
  "Food & drink summary (§3 without `panel`); null for other types."
  foodItem: JSON
  "Full nutrient panel; details view only — never select in list queries."
  foodNutrientPanel: JSON
}

extend type Query { foodSearch(query: String!, kind: FoodKind, page: Int, includeInternational: Boolean = false): FoodSearchPage! }
extend type Mutation { createContentFromFood(input: CreateContentFromFoodInput!): Content! @auth }
```

Plus `ContentSortBy` values (`CALORIES`, `PROTEIN`, `CARBS`, `FAT`, `SUGARS`, `SODIUM`, `FIBER`, `CAFFEINE`, `ABV`, `PROTEIN_PER_100_KCAL`, `SUGAR_PCT_KCAL`, `NUTRI_SCORE`, `NOVA`), a `nutritionBasis: NutritionBasis` argument on the content list (default `SERVING`), the `ContentFilter` food fields from §7, and `ContentSearchField.BRAND`.

`foodItem` is computed from `response` minus `panel` in the resolver, so the list query's payload stays small without a second column. Whether `response` itself is already selected wholesale by the list SQL needs checking during the plan (Movie's `movie: JSON` is the pattern to mirror).

---

## 10. Backend change list

| Layer | Change |
|---|---|
| Domain | `ContentTypeFoodItem = "FOOD_ITEM"`; `FoodItem` value type + `Nutrients` struct with nullable `*float64` fields; GTIN normalise/validate (pure functions, table-tested); `ContentSearchFieldBrand`; new `ContentSortBy` values |
| Ports | `FoodDataClient` (`GetByFDCID`, `SearchFDC`, `FindByGTIN`) and `OpenFoodFactsClient` (`GetByBarcode`, `Search`) |
| Adapters | `adapters/fooddata/` (FDC): nutrient-number mapping table, `labelNutrients` vs per-100 handling, kJ→kcal; `adapters/openfoodfacts/`: User-Agent, token-bucket limiter (15/min reads, 10/min search), 24 h cache. Both tested against **recorded fixtures**, including Branded, Foundation, a beverage, an alcoholic drink, a not-found barcode and a 429 |
| Service | `CreateFromFood`: parse identifier → canonical URL → dedupe (`GetByURL`) → parallel fetch (`errgroup`) → merge by §1 precedence → derive the missing basis → save. `SearchFood` with already-in-library marking (one batched `url IN (...)` query, not N) |
| Repo | Sort rules, filters (`?` allergen operator, numeric ranges), the `BRAND` search field |
| Schema/resolvers | As §9. `make graphql-gen` (watch the known `schema.resolvers.go` collision) |
| Config | `FDC_API_KEY`, `OFF_CONTACT_EMAIL`: names only in `.env.example`, values set by the owner per environment |
| Migration | **None** |

**Frontend:** the Add Content window autodetects barcodes and FDC/OFF URLs and gains a "Food & drink" type option; a food column set (§7), nutrient cell renderer (`formatNutrient(value, unit)`: `539 kcal`, `6.3 g`, `43 mg`, null → "—"), Nutri-Score badge, allergen chips, the basis toggle, a Discover "Food & drink" source with the decision-row picker, and a details view with macro tiles, allergens, ingredients, a collapsible full panel, attribution and the disclaimer. A "Nutrition Facts"-style label rendering in the details view is a nice v1.1.

## 11. Edge cases and limits stated up front

- **Carbohydrate convention:** US labels include fiber in total carbohydrate; EU labels don't. OFF stores whatever the label says. We don't "correct" it. The tooltip says which convention the source likely used (FDC = US; OFF non-US barcode prefix = probably EU).
- **Reformulation:** the same barcode can change recipe. We show "data as of". A **Refresh from source** action (owner or any signed-in user, rate-limited) re-fetches and overwrites the nutrition while keeping the content id and perspectives. That is v1.1.
- **Generic foods have no barcode, brand or image.** That's fine. The Item cell uses the glyph.
- **Water, black coffee, diet soda:** 0 kcal is a real 0 (it differs from null), and the derived rates become n/a.
- **Multipacks and variety packs:** one barcode, one row. We don't split them.
- **Restaurant items** have no free source (Nutritionix is paid). Out of scope until a licensed source is chosen.
- **Homemade foods and recipes:** out of scope. The likely path is a user-entered panel (CLAIM-style manual entry), or a recipe type that sums FDC ingredients. That needs its own intent.
- **Camera barcode scanning:** the browser `BarcodeDetector` API isn't in Safari or Firefox. Use a library (e.g. ZXing) in v1.1. v1 is a typed barcode.

## 12. Testing

- **Domain:** GTIN normalisation (UPC-A → GTIN-13, EAN-8, bad check digit, whitespace/dashes); nutrient derivation (per100 ↔ per serving, g↔ml refusal, null propagation); kJ→kcal; ABV conversion.
- **Adapters:** fixture-based mapping for each FDC data type and for OFF; missing fields stay null (Nutella has no `serving_size`); 429 → `RATE_LIMITED`; OFF `status: 0` → not found; the limiter refuses the 16th read within a minute.
- **Service:** success with both sources, FDC-only, OFF-only, neither (not found), one source erroring (degrade to the other and log), duplicate (canonical URL already exists, including adding by FDC URL after a barcode add), merge precedence.
- **Repo:** sort SQL for each new key (null last, derived-rate CASE), allergen exclude (also excludes unknowns), basis switch.
- **Query budget:** create = 1 dedupe read + 1 insert. `foodSearch` = 1 batched library-match query whatever the page size. A list query never selects `panel`.
- **Frontend:** `formatNutrient` table tests; Calories cell states (per serving, per-100 fallback with suffix, null, 0); Nutri-Score badge A–E and null; allergen chips (none known vs empty list); picker row states (in library, muted low quality, no image, no serving).

## 13. Rollout

There is no migration. The owner creates a data.gov key, sets `FDC_API_KEY` and `OFF_CONTACT_EMAIL` per environment, and should request a higher FDC limit if Discover search sees real use. "Dark backend" release (see `.docs/RELEASE_APPROACHES.md`): backend first, then the frontend behind the merge gate. The first live add per source is a manual check: fixtures can't prove the field paths the plan inherits from §3.1.

**Suggested PR split:** (1) domain + FDC adapter + create mutation; (2) OFF adapter + merge; (3) grid columns, sort and filter; (4) Discover search + picker; (5) details view.

## 14. Decisions to confirm

1. **FDC + OFF, no paid source** in v1, so no restaurant items.
2. **One type `FOOD_ITEM`** with `kind`/`form` facets, rather than separate `FOOD` and `BEVERAGE` types.
3. **Barcoded items are keyed by the OFF product URL** even when FDC supplied the numbers.
4. **FDC label data wins over OFF** for nutrition numbers when both exist.
5. **Per-serving is the default basis**, with a per-100 toggle.
6. **The allergen filter excludes rows with unknown allergens.**
7. **Nutri-Score is a default column**, although it's an EU score. The alternative is to put it in the picker only for a US-first audience.
8. **No index migration** until EXPLAIN shows a need.
9. **Search only on Discover, no feed.**
