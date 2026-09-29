# Phase 25: Jev (TypeSafe AI) Research Spike - Research

**Researched:** 2026-09-27/28
**Domain:** TypeSafe AI's "System One" decision model (Jev), evaluated as a candidate component for a future Perspectize AI bot feature
**Confidence:** MEDIUM (official product claims verified against announcement/docs; third-party ecosystem claims unverified and treated with suspicion)
**Status:** Deferred — not scoped to any phase yet. This phase exists to hold the research until the AI bot feature is planned.

## Summary

Jev is a real, confirmed product from TypeSafe AI (founder Diogo Almeida, ex-OpenAI; $40M seed led by DCVC; early access opened 2026-09-15). It is a fast **decision/classification** model ("System One" — returns typed `Choice`/`Score`/`Noul` answers with calibrated probabilities in ~70-500ms per vendor figures), not a code-generation or reasoning model. It does not compete with Claude Code; it's a candidate cheap-and-fast "yes/no/classify" layer that could sit alongside an AI agent.

Official links:
- Announcement: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- Docs (coding agents): https://docs.typesafe.ai/introduction/coding-agents
- Known failure modes: https://docs.typesafe.ai/model-jaggedness/jev-1.13

Access paths (official): REST API (`POST /v1/systemone`), Python/JS SDKs, a Claude Code skill (`claude plugin marketplace add typesafe-ai/skills`), and listings on Vercel AI Gateway (`typesafe-ai/jev`) and Cloudflare Workers AI (`typesafe/jev`). Go support is unofficial only (`jev-go`, `go-jev`, `typesafe-go` — community clients, unverified).

Pricing: $0.042/M input tokens, output free.

## Third-party ecosystem — treat as unverified / supply-chain risk

Within days of launch, ~15 third-party/community repos and Claude Code plugin/MCP integrations appeared, several pitched as plugging directly into CI merge gates, Claude Code's tool-call approval flow, or agent Stop hooks:

- `jev-kit`, `jev-code` (MCP server), `limpet` (Stop hook), `fast-jev-compaction` — agent-layer guards/compaction for Claude Code
- `jev-ci-triage`, `jev-harness` (two unrelated projects with the same name), `jevtriage`, `jev-test-triage` — CI/test-failure triage
- `jev-logtriage`, "Jev Logs" (OTel) — log diagnostics
- `graphql-classifier` — GraphQL schema PII/auth/N+1 checks
- `jevcal` — confidence calibration/regression-proofing for Jev itself
- Four separate "awesome-jev" list repos

**This pattern (many unofficial packages appearing immediately after a hyped launch, several requesting authority over destructive actions or merge gates) is a classic typosquat/supply-chain risk signal.** None of these should be installed without independently reading their source and confirming maintainer legitimacy first — a vendor README claim is not verification. In particular, never run `claude plugin marketplace add typesafe-ai/skills` or any similar marketplace-add command without confirming the marketplace is actually owned by TypeSafe AI's official GitHub org, not a lookalike.

## Signal vs. hype

- Vercel reported ~13% of paid AI Gateway teams adopted it within 24h (https://x.com/vercel/status/2101077346203971900)
- TechCrunch: a command-safety classifier ran 5-18x faster than on OpenAI Luna 5.6 (https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/)
- Caveats: "0% hallucination" only means Jev never answers outside its allowed option set; TypeSafe's own benchmark shows 67.8% agreement vs. GPT-5.6 Terra at 67.9% (essentially a tie); an independent rerank eval found Jev alone does not beat embeddings — fusion is required to win.

## Recommendation

**Where Jev could be worth real evaluation:** when Perspectize implements its own AI bot feature (not yet built), Jev's fast/cheap classification could plausibly serve as a pre-filter/guard layer in that bot's pipeline (e.g., cheap moderation/routing/confidence checks before an expensive model call). That is the point at which it's worth properly vetting the official SDKs and re-running this research against the actual bot design.

**Do not pilot any of the community CI/agent-guard repos listed above until:**
1. The AI bot feature has a concrete design that identifies a real use case for Jev, and
2. Each candidate repo is independently source-reviewed for what it actually does with any credentials/permissions it would be given.

**Priority:** Deferred — revisit specifically when AI bot implementation work is scoped as a phase, not before. No pilot, no install, no CI wiring from this research alone.

**Source:** Dev research spike (2026-09-27/28), requested as "where can Jev enhance my workflow."
