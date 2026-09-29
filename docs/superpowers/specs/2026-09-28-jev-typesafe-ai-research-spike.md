# Spike: Jev (TypeSafe AI "System One" model) for a future AI bot feature

**Status:** Not started — pre-planning spike doc only. This is **not** a superpowers plan (no `executing-plans` sub-skill header, no checkbox task list meant for autonomous execution). It exists to be linked from `.planning/ROADMAP.md` so the idea and its context aren't lost, and to give whoever picks this up (human or a future planning session) enough to evaluate Jev for real once the AI bot feature is scoped, without re-deriving this research.

**⚠️ Written without superpowers loaded** — no `superpowers:*` skill was available in this session (plugin not connected/loaded in this Claude Code cloud environment). A superpowers-enabled session should review this via `writing-plans` (or its brainstorming/spec-writing counterparts) before treating it as vetted, and before turning it into an actual execution plan.

**Roadmap link:** `.planning/ROADMAP.md` → "Jev (TypeSafe AI) Research Spike (UNSCOPED, DEFERRED)", listed after Phase 24 since it isn't gated on any existing phase — it's pre-work for a not-yet-planned AI bot feature.

**Origin:** Conversation starting 2026-09-27 (Claude Code cloud session), prompted by "where can Jev enhance my workflow" — a colleague's tip about a "brand new system 1 AI model," researched via a background agent and reported back mid-session.

---

## 1. What Jev is

Jev is a real, confirmed product from **TypeSafe AI** (founder Diogo Almeida, ex-OpenAI; $40M seed led by DCVC; early access opened 2026-09-15). It's a fast **decision/classification** model — TypeSafe brands it "System One," contrasting with slower "System Two" reasoning models — that returns typed `Choice`/`Score`/`Noul` answers with calibrated probabilities, claimed at ~70-500ms per call. It never generates prose or code.

It is **not** a competitor to Claude Code. It's a candidate cheap/fast classification layer that could sit *alongside* an agent (e.g., pre-filtering, routing, or confidence-scoring before a more expensive model call).

**Official links:**
- Announcement: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- Docs (coding agents): https://docs.typesafe.ai/introduction/coding-agents
- Known failure modes: https://docs.typesafe.ai/model-jaggedness/jev-1.13

**Official access paths:** REST API (`POST /v1/systemone`), Python/JS SDKs, a Claude Code skill (`claude plugin marketplace add typesafe-ai/skills`), plus listings on Vercel AI Gateway (`typesafe-ai/jev`) and Cloudflare Workers AI (`typesafe/jev`). Go support is **unofficial only** so far (`jev-go`, `go-jev`, `typesafe-go` — unverified community clients).

**Pricing:** $0.042/M input tokens, output free.

## 2. Signal vs. hype

- Vercel reported ~13% of paid AI Gateway teams adopted it within 24h of listing (https://x.com/vercel/status/2101077346203971900).
- TechCrunch reported a command-safety classifier running 5-18x faster than on OpenAI Luna 5.6 (https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/).
- Caveats worth weighing against the hype:
  - "0% hallucination" only means Jev never answers outside its allowed option set — it's not a general accuracy claim.
  - TypeSafe's own benchmark shows 67.8% agreement vs. GPT-5.6 Terra at 67.9% — essentially a tie, not a clear win.
  - An independent rerank eval found Jev alone does not beat plain embeddings for ranking — it needs fusion with embeddings to be competitive.

## 3. Third-party ecosystem — treat as a supply-chain risk signal, not a shopping list

Within days of Jev's launch, roughly 15 third-party/community repos and Claude Code plugin/MCP integrations appeared, several pitched as plugging directly into CI merge gates, Claude Code's tool-call approval flow, or agent Stop hooks:

- **Claude Code agent-layer guards:** `jev-kit` (tool-call guard, allow/warn/rewrite/block), `jev-code` (MCP server exposing classify/check/score/rank/ask), `limpet` (Stop hook judging completion rules), `fast-jev-compaction` (context-compaction plugin)
- **CI/test triage:** `jev-ci-triage`, two unrelated projects both named `jev-harness`, `jevtriage`, `jev-test-triage`
- **Log diagnostics:** `jev-logtriage`, "Jev Logs" (OpenTelemetry triage)
- **Schema checks:** `graphql-classifier` (GraphQL PII/auth-gap/N+1 scanner)
- **Calibration:** `jevcal` (per-question confidence threshold fitting/regression-proofing)
- Four separate "awesome-jev" curated-list repos

**This pattern — many unofficial packages appearing immediately after a hyped launch, several requesting authority over destructive actions or merge gates — is a classic typosquat/supply-chain risk signal**, independent of whether any specific one of them turns out to be legitimate. None of these should be installed without independently reading their source and confirming maintainer legitimacy first; a vendor README claim is not verification. In particular, never run `claude plugin marketplace add typesafe-ai/skills` or any similar marketplace-add command without confirming the marketplace is actually owned by TypeSafe AI's official GitHub org rather than a lookalike.

## 4. Where this could plausibly fit Perspectize

Perspectize doesn't have an AI bot feature yet ("Jeeves AI Assistant" is an unscoped idea in `FEATURE_BACKLOG.md`, describing perspective refinement, content discovery, summarization, challenge-mode counter-arguments, and category/tag suggestions). If and when that feature gets a real design, Jev's fast/cheap classification could plausibly serve as a pre-filter or guard layer in that bot's pipeline — e.g., cheap moderation/routing/confidence checks before an expensive model call, rather than a fit for anything in this codebase today.

## 5. Exit / go-no-go criteria for revisiting

This spike is **not** an invitation to install anything. Before piloting Jev in any form:

1. The AI bot feature must have a concrete design that identifies a specific use case Jev would serve (a decision/classification step, not code generation).
2. Any candidate integration (official SDK or third-party repo) must be independently source-reviewed for what it does with any credentials/permissions it would be given — no exceptions for repos that look popular or well-documented.
3. Nothing from the third-party ecosystem list in Section 3 gets wired into CI merge gates, Claude Code's tool-approval flow, or any Stop hook without that review, regardless of how it's marketed.

**Priority:** Deferred — revisit specifically when AI bot implementation work is scoped as a real plan, not before.
