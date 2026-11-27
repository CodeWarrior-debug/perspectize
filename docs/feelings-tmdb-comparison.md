# Feelings picker vs TMDB moods

Comparison of Perspectize's feel-wheel (`frontend/src/lib/data/feelings.ts`) against the **Mood** picker TMDB shows under *Vibes* ("How did X make you feel?"). Written as a decision sheet: fill the **Decision** column, then change `feelings.ts` in a follow-up PR.

- **Perspectize:** 83 feelings — 20 on the core wheel (10 opposite pairs) and 63 in the "search more" extended set, in 20 families.
- **TMDB:** 34 mood emoji in 7 categories (Happy, Interested, Surprised, Sad, Disgusted, Afraid, Angry), 4–6 per category. TMDB shows **no text label per emoji**, only the category name.
- **Result:** 24 emoji appear in both, 10 are TMDB only, 59 are Perspectize only.

**Caveats**

- TMDB's emoji were identified by eye from a phone screenshot. Rows marked ⚠️ are the least certain.
- TMDB's **Tone** section (below Mood in the same sheet) was cut off in the screenshot and is **not** compared here. A screenshot of it is needed.
- Matching is by emoji glyph only. A label can differ even when the emoji matches.

**Decision values:** `keep`, `remove`, `rename → <label>`, `move → <family>`, `add` (TMDB-only rows). Blank = undecided.

## 1. TMDB moods (34)

| TMDB category | Emoji | Match? | Perspectize label (family) | Decision |
|---|---|---|---|---|
| Happy | 😃 ⚠️ | ❌ TMDB only | nearest: 😄 Joyful (core), 😁 Cheerful | |
| Happy | 🤭 | ❌ TMDB only | | |
| Happy | 🥲 | ✅ | Touched (love) | |
| Happy | 😂 | ❌ TMDB only | nearest: 🤣 Hilarious, 😆 Amused | |
| Happy | 🤣 | ✅ | Hilarious (joy) | |
| Happy | 😍 | ✅ | Adoring (love) | |
| Interested | 🥱 | ✅ | Yawning (boredom) | |
| Interested | 😐 | ✅ | Bored (core, boredom) | |
| Interested | 😵‍💫 | ✅ | Disoriented (confusion) | |
| Interested | 🤨 | ✅ | Skeptical (confusion) | |
| Interested | 🤔 | ✅ | Curious (anticipation) | |
| Interested | 🤯 | ✅ | Mind-blown (core, surprise-positive) | |
| Surprised | 😮 | ❌ TMDB only | Perspectize's 😲 Surprised is a different glyph | |
| Surprised | 😳 | ✅ | Flustered (awkward-positive) | |
| Surprised | 🫢 | ❌ TMDB only | | |
| Surprised | 😨 ⚠️ | ✅ | Fearful (anxiety) | |
| Sad | 🙁 | ❌ TMDB only | | |
| Sad | 😞 | ✅ | Disappointed (sadness) | |
| Sad | 😣 ⚠️ | ❌ TMDB only | | |
| Sad | 😩 ⚠️ | ❌ TMDB only | | |
| Sad | 😢 | ✅ | Sad (core, sadness) | |
| Sad | 😭 | ✅ | Heartbroken (sadness) | |
| Disgusted | 😕 | ✅ | Confused (core, confusion) | |
| Disgusted | 😬 | ✅ | Awkward (core, awkward) | |
| Disgusted | 🤢 | ✅ | Disgusted (core, disgust) | |
| Disgusted | 🤮 | ✅ | Nauseated (disgust) | |
| Afraid | 😦 ⚠️ | ❌ TMDB only | | |
| Afraid | 😰 | ✅ | Anxious (core, anxiety) | |
| Afraid | 🫣 | ✅ | Cringing (awkward) | |
| Afraid | 😱 | ✅ | Shocked (surprise) | |
| Angry | 😒 | ❌ TMDB only | | |
| Angry | 😖 ⚠️ | ✅ | Uncomfortable (awkward) | |
| Angry | 😡 | ✅ | Furious (hate) | |
| Angry | 🤬 | ✅ | Hate (core, hate) | |

### Matches where the grouping differs

| Emoji | TMDB category | Perspectize family |
|---|---|---|
| 😕 | Disgusted | confusion |
| 😬 | Disgusted | awkward |
| 😨 | Surprised | anxiety |
| 😱 | Afraid | surprise |
| 😖 | Angry | awkward |
| 🥱 | Interested | boredom |

## 2. Perspectize only (59)

12 are on the core wheel and 47 are in the extended set.

| Family | Emoji | Label | Where | Decision |
|---|---|---|---|---|
| love | 🥰 | Love | Core | |
| love | 💕 | Affectionate | Extended | |
| love | 🫶 | Appreciative | Extended | |
| love | 😻 | Smitten | Extended | |
| joy | 😄 | Joyful | Core | |
| joy | 😁 | Cheerful | Extended | |
| joy | 😆 | Amused | Extended | |
| joy | 🙃 | Playful | Extended | |
| joy | 🥳 | Celebratory | Extended | |
| trust | 🤗 | Trusting | Core | |
| trust | 🤝 | Collaborative | Extended | |
| trust | 🫂 | Supported | Extended | |
| trust | 🙏 | Grateful | Extended | |
| trust | 😊 | Reassured | Extended | |
| anticipation | 🤞 | Hopeful | Core | |
| anticipation | 👀 | Eager | Extended | |
| anticipation | ⏳ | Expectant | Extended | |
| anticipation | 🙌 | Pumped | Extended | |
| cool | 😎 | Cool | Core | |
| cool | 🕶️ | Unbothered | Extended | |
| cool | 🤙 | Chill | Extended | |
| cool | 😇 | Blessed | Extended | |
| surprise-positive | 🤩 | Starstruck | Extended | |
| surprise-positive | ✨ | Delighted | Extended | |
| surprise-positive | 🎆 | Awestruck | Extended | |
| awkward-positive | 😅 | Sweat-smile | Core | |
| awkward-positive | 🫠 | Melting | Extended | |
| awkward-positive | 🙈 | Bashful | Extended | |
| confidence | 😏 | Confident | Core | |
| confidence | 💪 | Empowered | Extended | |
| confidence | 😤 | Determined | Extended | |
| confidence | 👑 | Proud | Extended | |
| calm | 😌 | Peaceful | Core | |
| calm | 🧘 | Centered | Extended | |
| calm | 🌊 | Serene | Extended | |
| calm | 😴 | Content | Extended | |
| nostalgia | 🥹 | Nostalgic | Core | |
| nostalgia | 📼 | Wistful | Extended | |
| nostalgia | 🌇 | Reflective | Extended | |
| hate | 💢 | Irritated | Extended | |
| hate | 😾 | Hostile | Extended | |
| sadness | 💔 | Crushed | Extended | |
| disgust | 🙄 | Disdainful | Extended | |
| surprise | 😲 | Surprised | Core | |
| surprise | 😵 | Stunned | Extended | |
| boredom | 😪 | Drowsy | Extended | |
| boredom | 🫥 | Checked-out | Extended | |
| indifference | 😑 | Meh | Core | |
| indifference | 🤷 | Indifferent | Extended | |
| indifference | 😶 | Blank | Extended | |
| indifference | 🫤 | Unimpressed | Extended | |
| awkward | 😓 | Nervous | Extended | |
| insecurity | 😟 | Insecure | Core | |
| insecurity | 🥺 | Vulnerable | Extended | |
| insecurity | 😔 | Dejected | Extended | |
| insecurity | 🙇 | Self-conscious | Extended | |
| anxiety | 🥵 | Overwhelmed | Extended | |
| anxiety | 😥 | Uneasy | Extended | |
| confusion | 🧐 | Puzzled | Extended | |

Four families (hate, sadness, disgust, anxiety) have no core-wheel feeling in this list: their core emoji (🤬 😢 🤢 😰) all match TMDB.

## 3. Observations

- **TMDB covers 7 categories.** It has no love, trust, calm, nostalgia, confidence, cool or indifference, and no non-face emoji (💪 👑 🌊 📼 ⏳ 💔). Those make up most of the 59.
- **TMDB orders each row mild → intense** (Sad 🙁 → 😭, Angry 😒 → 🤬, Disgusted 😕 → 🤮). Perspectize's wheel pairs opposites and has no intensity order.
- **Labels that name the emoji, not a feeling:** "Sweat-smile", "Cool".
- **Near-duplicates on the core wheel:** 😐 Bored and 😑 Meh.
- **Labels that don't fit the emoji:** 😴 "Content", 🎆 "Awestruck", 🙃 "Playful", 😇 "Blessed".
- **Overlapping meanings:** Curious 🤔 / Eager 👀; Overwhelmed 🥵 / Stunned 😵 / Disoriented 😵‍💫; Proud 👑 / Determined 😤.
- **Families that look misplaced:** 🙏 Grateful (trust), 😇 Blessed (cool), 🤔 Curious (anticipation).

## 4. Follow-up

- [ ] Get a screenshot of TMDB's **Tone** section and add it to this comparison.
- [ ] Fill the **Decision** columns above.
- [ ] Update `frontend/src/lib/data/feelings.ts` (`FEEL_WHEEL`, `EXTENDED_FEELINGS`, `FAMILY_ORDER`) to match.
- [ ] Check the dependents of those exports before removing or renaming anything: `frontend/src/lib/components/FeelWheel.svelte`, its tests, `backend/internal/demo/fixtures.go`, and any stored perspective feelings in the database. A removed emoji may already be saved on perspectives.
- [ ] Decide whether the extended set should be reorganised around TMDB-style intensity rows or stay grouped by family.

Related design: [`superpowers/specs/2026-09-12-feel-wheel-design.md`](superpowers/specs/2026-09-12-feel-wheel-design.md).

Sources: TMDB mood picker (screenshot supplied by the user) and the [TMDB General Bible](https://www.themoviedb.org/bible/general?language=en-GB), which describes Vibes (Moods and Tones) but lists no emoji.
