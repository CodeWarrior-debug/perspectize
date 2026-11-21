# Stack Research

**Domain:** In-app AI assistant (Jeeves): provider-neutral Go LLM layer, agent loop, tool registry, evals, dev CLI, streaming via GraphQL subscriptions
**Milestone:** v1.2 Jeeves AI Assistant
**Researched:** 2026-09-26
**Confidence:** HIGH for SDK versions/APIs (read directly from module-proxy source + official docs); MEDIUM for Sevalla build-context specifics; MEDIUM for the eval-tooling recommendation (it's a judgment call, and the ecosystem is thin)

> Scope: only what v1.2 adds. The existing stack (gqlgen v0.17.95, coder/websocket v1.8.15, graphql-ws 6.x, Clerk, GORM/pgx, SvelteKit/Svelte 5/TanStack Query) is validated and not re-researched here. Locked decisions in `ai-tooling/CLAUDE.md` are taken as given.
>
> Supersedes the stack parts of `.planning/v1.1-research/AI-ASSISTANT.md` (Feb 2026). That doc is stale on: SDK version (v1.22.1 → **v1.75.0**), model IDs (Sonnet 4.5 → **Opus 5 / Sonnet 5 / Haiku 4.5**), thinking config (budget → **adaptive + effort**), and transport (SSE → **GraphQL subscription**, locked decision 7).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `github.com/anthropics/anthropic-sdk-go` | **v1.75.0** (2026-09-22) | Anthropic adapter only (`ai-tooling/provider/anthropic`) | Official SDK. Covers everything the manual agent loop needs: `Messages.NewStreaming` → `ssestream.Stream[MessageStreamEventUnion]`, `Message.Accumulate(event)` to rebuild the final message from deltas, `Message.ToParam()` to append the assistant turn back into history, `NewToolResultBlock(id, content, isError)`, `Messages.CountTokens` (for measuring tool-definition tokens per locked decision 10), `*anthropic.Error` with `RequestID`, automatic retries (2x on 408/409/429/5xx). Requires Go 1.24+; the backend is on go 1.26. |
| `github.com/openai/openai-go/v3` | **v3.66.0** (2026-09-23) | OpenRouter / OpenAI-compatible adapter (later phase) | Official OpenAI SDK. Use **Chat Completions** (not Responses). OpenRouter speaks the Chat Completions schema; the Responses API is OpenAI-specific. `option.WithBaseURL("https://openrouter.ai/api/v1")` + `option.WithAPIKey(...)`. Has streaming tool-call support via `ChatCompletionAccumulator` (`AddChunk`, `JustFinishedToolCall`, `JustFinishedContent`). v3.45.0+ requires Go 1.25 (fine). Import path has `/v3`, so don't use the root `github.com/openai/openai-go` (v1.12, frozen July 2025) or `/v2`. |
| `github.com/google/jsonschema-go` | **v0.4.3** (2026-04-17) | Generate tool input schemas from Go structs, *and* validate model-produced tool input before running a tool | One library covers both jobs: `jsonschema.For[T](opts)` infers a schema from a struct (the `jsonschema:"..."` tag becomes the property description), and `schema.Resolve(nil)` → `resolved.Validate(v)` checks the input. No dependencies outside the stdlib. The official MCP Go SDK is built on it, so the MCP phase reuses the same schemas with no conversion. Schemas are kept provider-neutral (`*jsonschema.Schema` or `map[string]any`), and each adapter converts at the edge. |
| Go stdlib (`flag`, `encoding/json`, `testing`, `context`, `log/slog`, `iter`) | Go 1.26 toolchain (Docker builds on golang:1.27-alpine) | `botler` CLI, own message/event types, agent loop, eval runner | Matches `backend/cmd/seed-bible` (stdlib `flag`). The agent loop is ~150 lines of `for { call model; if stop_reason != tool_use break; run tools; append results }`, and writing it by hand is the teaching goal. Expose streams as `iter.Seq2[Event, error]` or a `<-chan Event`. Both are idiomatic and neither depends on an SDK. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `github.com/modelcontextprotocol/go-sdk` | v1.8.0 (2026-09-04) | MCP server (later milestone) | **Don't add in v1.2.** Maturity is good: v1.x stable since v1.0, maintained by the MCP org together with Google's Go team, supports spec 2026-07-28 from v1.7.0, and is already a transitive dependency of anthropic-sdk-go. Picking `google/jsonschema-go` now keeps the path to it clean. |
| `golang.org/x/time/rate` | v0.16.0 | Per-user token-bucket rate limit on the Jeeves subscription | The existing `go-chi/httprate` limits HTTP requests. It can't see individual subscription operations on one long-lived WebSocket, so the subscription resolver needs its own `rate.Limiter` keyed by user ID (or a DB-backed counter if limits must hold across instances). |
| `github.com/stretchr/testify` | v1.12.1 (already in backend) | Assertions in ai-tooling tests and eval checks | Keeps test style the same across the monorepo (PROJECT.md requires table-driven tests + testify). |
| `github.com/sebdah/goldie/v2` | v2.8.0 | *Optional* golden files for eval transcripts / rendered prompts | Only if prompt-snapshot diffs become useful (e.g. to catch unintended system-prompt changes). A hand-rolled `-update` flag with `os.WriteFile` works just as well, so it's fine to skip. |
| `marked` (npm) + existing `dompurify` 3.4.x | marked 18.0.14 | Render assistant markdown in the sidebar | Streaming markdown is a frontend concern: re-parse the accumulated text on each batched delta, then sanitize with DOMPurify, which is already a dependency. Skip `svelte-streamdown` (4.2.0) unless incremental rendering turns out to be a real problem, because it's one more dependency for a small gain. |

**No new frontend transport library.** `graphql-ws` 6.2.x is already used in `src/lib/messaging/ws-client.svelte.ts`, and gqlgen's `transport.Websocket` with `coderWebsocketImplementationFor` and `KeepAlivePingInterval` is already wired in `cmd/server/main.go`. The Jeeves subscription reuses both.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `botler` (in-house, `ai-tooling/cmd/botler`) | `tools list`, `tools call`, `chat`, `eval` | Subcommands via `flag.NewFlagSet` per verb, the same pattern as seed-bible. It talks to the backend over GraphQL (locked decision 4). Use plain `net/http` + `encoding/json` for the GraphQL client. Don't pull in `genqlient`/`graphql-request`-style codegen for a handful of queries. |
| In-house eval harness (`ai-tooling/eval`) | Deterministic checks on fixtures, model × prompt matrix, token/latency capture | See "Eval tooling" below. Output is JSONL per run plus a Markdown summary table, committed under `ai-tooling/eval/results/` or gitignored (the owner decides). |
| `go test -run TestEval -tags eval` | Run live-model evals separately from unit tests | A build tag keeps paid API calls out of `go test ./...` and CI. Fixture-only deterministic checks run in normal `go test`. |
| `option.WithDebugLog(nil)` (anthropic) / `option.WithDebugLog` (openai) | Log the raw request and response while learning | Good for teaching mode: shows the exact JSON on the wire. Never enable it in production because it logs prompts. |

## Anthropic SDK: what the manual agent loop uses (v1.75.0, verified in source)

| Need | API | Notes |
|------|-----|-------|
| Stream a turn | `client.Messages.NewStreaming(ctx, anthropic.MessageNewParams{...})` | Loop `stream.Next()` / `stream.Current()`, then check `stream.Err()`. The stream is tied to the passed `ctx`: cancel it when the subscription closes. |
| Rebuild the full message | `var msg anthropic.Message; msg.Accumulate(event)` | After the stream ends, `msg.StopReason`, `msg.Content`, and `msg.Usage` are complete. |
| Text deltas → UI | `event.AsAny().(anthropic.ContentBlockDeltaEvent)` → `.Delta.AsAny().(anthropic.TextDelta)` | Map to the neutral `TextDelta` event. Batching (locked decision 7) happens in the backend subscription layer, not in the adapter. |
| Tool input deltas | `anthropic.InputJSONDelta` (partial JSON) | Ignore for execution: only run tools from the *accumulated* `ToolUseBlock` (`block.ID`, `block.Name`, `block.Input` as `json.RawMessage`). You can emit a neutral `ToolCallStarted` event from `content_block_start` for UI "Looking up…" hints. |
| Stop reasons | `end_turn`, `tool_use`, `max_tokens`, `stop_sequence`, `pause_turn`, `refusal`, `model_context_window_exceeded` | The neutral type needs all of them. `pause_turn` only matters with server tools (not used). `refusal` and `model_context_window_exceeded` need explicit UX. |
| Append the assistant turn | `messages = append(messages, msg.ToParam())` | Keeps thinking blocks and signatures intact. See PITFALLS: the neutral type must round-trip them. |
| Return tool results | `anthropic.NewUserMessage(anthropic.NewToolResultBlock(id, jsonString, isError)...)` | All results for one assistant turn go in **one** user message. |
| Tools | `[]anthropic.ToolUnionParam{{OfTool: &anthropic.ToolParam{Name, Description: anthropic.String(...), InputSchema: anthropic.ToolInputSchemaParam{Properties, Required}}}}` | `ToolParam` also has `Strict` (schema-guaranteed inputs), `DeferLoading` (Anthropic tool search), and `EagerInputStreaming`. Keep these adapter-internal, behind neutral hints. |
| Thinking | `Thinking: anthropic.ThinkingConfigParamUnion{OfAdaptive: &anthropic.ThinkingConfigAdaptiveParam{}}` | Adaptive only. `budget_tokens` is rejected on Opus 5 / Sonnet 5. |
| Effort | `OutputConfig: anthropic.OutputConfigParam{Effort: anthropic.OutputConfigEffortLow}` | Levels: `low`, `medium`, `high`, `xhigh`, `max`. **Changing effort between turns invalidates the prompt cache**, so pick one per conversation. Probably `low`/`medium` for a how-to assistant; tune it through evals. |
| Caching | Top-level `CacheControl: anthropic.NewCacheControlEphemeralParam()` on `MessageNewParams`, or per block (`TextBlockParam.CacheControl`) | Put a breakpoint after system prompt + tool definitions (stable prefix). Per-page tool sets (locked decision 10) mean each page has its own cache prefix. |
| Usage | `msg.Usage.InputTokens`, `OutputTokens`, `CacheCreationInputTokens`, `CacheReadInputTokens`, `OutputTokensDetails.ThinkingTokens` | With streaming, the thinking breakdown only arrives on the final `message_delta`. `Accumulate` handles it. |
| Model IDs | `anthropic.ModelClaudeOpus5` (`claude-opus-5`), `ModelClaudeSonnet5`, `ModelClaudeHaiku4_5`, `ModelClaudeFable5_1` | Store model IDs as **strings in the neutral model registry**, not SDK constants, so adapters never leak them. |

**Don't use the SDK's `toolrunner` / `BetaToolRunner`.** It's built on `Beta*` types and invopop schemas, which leaks SDK types into tool definitions (violates locked decision 3) and hides the loop that the owner is supposed to learn.

## OpenAI-compatible adapter (OpenRouter): what matters

| Need | API / behavior | Notes |
|------|----------------|-------|
| Client | `openai.NewClient(option.WithBaseURL("https://openrouter.ai/api/v1"), option.WithAPIKey(key))` | The same adapter works against any OpenAI-compatible endpoint (e.g. local Ollama/vLLM for cheap eval runs). |
| Stream + tools | `client.Chat.Completions.NewStreaming(...)` + `openai.ChatCompletionAccumulator{}`; `acc.AddChunk(chunk)`; `acc.JustFinishedToolCall()` | Tool calls arrive as `choices[0].delta.tool_calls[i].function.arguments` string fragments. Let the accumulator assemble them. |
| Tools | `ChatCompletionToolUnionParam` with function name, description, and `parameters` (JSON Schema object) | OpenRouter requires `tools` on **every** request in the loop, including the ones that send tool results back. |
| Tool results | A `tool`-role message per call, carrying `tool_call_id` | Different from Anthropic, which puts all results in one user message with blocks. The neutral message type must be able to express both shapes. |
| Reasoning | OpenRouter returns `reasoning` and `reasoning_details` on messages, and `reasoning_details` **must be passed back unmodified** during tool loops | openai-go doesn't type these fields. Read them via `message.JSON.ExtraFields["reasoning_details"].Raw()` and send them back via `SetExtraFields`. Store them as opaque provider data in the neutral message. |
| Usage/cost | Always included, and the final stream chunk has `usage.cost`, `prompt_tokens_details.cached_tokens`, `cache_write_tokens` | `stream_options.include_usage` is deprecated on OpenRouter and has no effect. `cost` isn't a typed field in openai-go, so read it from `ExtraFields`. |

## Go module layout: `ai-tooling/` imported by `backend/`

**Recommendation: a `replace` directive in `backend/go.mod`. Don't commit a `go.work`.**

```
# ai-tooling/go.mod
module github.com/CodeWarrior-debug/perspectize/ai-tooling
go 1.26

# backend/go.mod (added when the in-app phase starts, not before)
require github.com/CodeWarrior-debug/perspectize/ai-tooling v0.0.0
replace github.com/CodeWarrior-debug/perspectize/ai-tooling => ../ai-tooling
```

Why `replace` and not `go.work`:
- `replace` is part of the backend module itself, so `go build`, `go test`, `go mod tidy`, CI (`working-directory: backend`), and the Docker build all see the same dependency graph. A `go.work` file is advisory and applies only when present. The Go reference says it is "generally inadvisable to commit go.work files", partly because CI can end up testing a different graph than consumers get.
- `replace` only applies in the main module, so it can't leak. ai-tooling will never be imported by an outside module anyway.
- Tagged releases (`ai-tooling/v0.1.0`, since subdirectory modules need the directory prefix on tags) add release overhead for no benefit in a single-repo, single-consumer setup.
- A developer can still create an **uncommitted** `go.work` at the repo root (`go work init ./backend ./ai-tooling`, gitignored) to get gopls cross-module navigation. Add `go.work` and `go.work.sum` to `.gitignore`.

**Dependency direction:** `backend → ai-tooling` only. ai-tooling must never import backend (Go forbids importing `backend/internal` anyway, locked decision 4). The in-process `PerspectizeData` implementation lives in backend and adapts backend services to the ai-tooling interface.

**Keep SDKs out of the core package.** Put the Anthropic and OpenAI SDKs in `ai-tooling/provider/anthropic` and `ai-tooling/provider/openaicompat`. Module-graph pruning means the backend only compiles packages it actually imports, but `go.sum` will grow a lot: anthropic-sdk-go's go.mod lists AWS, Google Cloud, and MCP SDK dependencies for Bedrock/Vertex. That's harmless as long as you never import `.../bedrock` or `.../vertex`, which register global stream decoders via `init()`.

### Docker / Sevalla implications (when the backend starts importing ai-tooling)

The current `backend/Dockerfile` uses `COPY go.mod go.sum ./` + `COPY . .` with context `backend`. The `../ai-tooling` replace target is outside that context, so **the build fails until the context moves to the repo root.** This is locked decision 2. Changes needed in one PR:

1. **Sevalla:** Docker context `backend` → `.` (repo root). Dockerfile path stays `backend/Dockerfile`.
2. **Dockerfile** (paths now relative to the root):
   ```dockerfile
   WORKDIR /src
   COPY backend/go.mod backend/go.sum ./backend/
   COPY ai-tooling/go.mod ai-tooling/go.sum ./ai-tooling/
   RUN cd backend && go mod download
   COPY backend/ ./backend/
   COPY ai-tooling/ ./ai-tooling/
   RUN cd backend && CGO_ENABLED=0 GOOS=linux GOFLAGS="-trimpath" go build -ldflags="-s -w" -o /out/server ./cmd/server
   # runtime: COPY --from=builder /out/server /server ; COPY --from=builder /src/backend/migrations /migrations
   ```
   Keeping the directory layout (`/src/backend`, `/src/ai-tooling`) matters because the `../ai-tooling` replace path has to resolve inside the image.
3. **.dockerignore:** `backend/.dockerignore` stops applying, because Docker only reads `.dockerignore` from the context root. Add `backend/Dockerfile.dockerignore`, which sits next to the Dockerfile and takes precedence per Docker docs, and exclude `frontend/`, `**/node_modules`, `.git/`, `.planning/`, `docs/`, `graphify-out/`, `perspectize/` (legacy C#), and `**/*.log`. Without this, the context upload grows to include the whole frontend and node_modules. **Verify that Sevalla's builder honors Dockerfile-specific ignore files** (a BuildKit feature). If it doesn't, use a root `.dockerignore`.
4. **CI:** add an `ai-tooling` job (`working-directory: ai-tooling`, `go-version-file: ai-tooling/go.mod`, build/vet/gofmt/test). The existing backend job already sees `../ai-tooling` because checkout is the whole repo. Add `/ai-tooling` to `.github/dependabot.yml` (gomod). Trivy already scans `.` (fs).
5. **Local dev:** nothing changes. `make run` in `backend/` resolves `../ai-tooling` through the replace directive.

Until the in-app phase, ai-tooling stays independent (CLI + evals only) and the Docker build doesn't change at all. Only move the build context in the phase that first adds the `require`.

## Eval tooling: recommend a small in-house harness

No Go eval framework is worth adopting here:
- `maragu.dev/llm/eval`: runs evals inside `go test` with scorer functions. It's pseudo-versioned only (no semver tags, latest 2026-09-16) and tied to its own LLM client abstraction. It's a good *reference design* but not worth a dependency.
- promptfoo / Inspect / DeepEval: capable, but they're Node/Python. They'd add a second toolchain and move evals away from the `PerspectizeData` fixtures and agent loop, which are the things you need to test.
- Genkit Go (v1.13.1) and Eino (v0.9.21) include eval features but are full frameworks with their own message types, which conflicts with locked decision 3.

**In-house harness shape (roughly 300–500 lines):**
- `Case{ID, PageContext, Input, Fixtures, Checks []Check}` loaded from YAML/JSON under `ai-tooling/eval/cases/`. The stdlib can't parse YAML, so prefer JSON to avoid a dependency, or use `go.yaml.in/yaml/v3`, which is already indirect in backend.
- `Check` is a Go interface with deterministic implementations: `CalledTool(name)`, `NotCalledTool`, `ToolArgsMatch(jsonpath, value)`, `AnswerContains/Regex`, `MaxToolCalls(n)`, `MaxInputTokens(n)`, `NoHallucinatedRoute` (answer only references routes in the app guide).
- The runner iterates the `models × promptVersions × cases` matrix against the **fixture `PerspectizeData`**, uses a bounded worker pool (`errgroup` with `SetLimit`) to respect rate limits, and records per run: model, prompt version, pass/fail per check, input/output/cache tokens, **tool-definition tokens** (via `CountTokens` on the Anthropic side), time to first token, total latency, and tool-call count.
- Output is JSONL plus a Markdown matrix. `botler eval` is a thin wrapper around it. LLM-as-judge scorers come later, only for checks that can't be made deterministic.

## Installation

```bash
# ai-tooling module (new)
cd ai-tooling   # separate Bash calls, per repo rule: no && chaining
go mod init github.com/CodeWarrior-debug/perspectize/ai-tooling
go get github.com/anthropics/anthropic-sdk-go@v1.75.0
go get github.com/google/jsonschema-go@v0.4.3
go get github.com/stretchr/testify@v1.12.1

# OpenRouter phase (later)
go get github.com/openai/openai-go/v3@v3.66.0

# backend (in-app phase)
go get golang.org/x/time@v0.16.0
# plus the require + replace lines shown above, then: go mod tidy

# frontend (sidebar phase)
pnpm add marked --dir frontend
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Official `anthropic-sdk-go` | Raw `net/http` + SSE parsing | Only if the SDK's release pace (v1.22 → v1.75 in about 7 months, where the docs allow "backward-incompatible changes in minor versions" for internals) becomes a maintenance burden. Hand-rolling SSE for a teaching project is tempting, but the SDK's `Accumulate` covers subtle cases (thinking signatures, citations, server tools). |
| `openai-go/v3` Chat Completions | `github.com/revrost/go-openrouter` v1.8.0 | If you need typed OpenRouter-only fields (provider routing, `reasoning_details`, `cost`) and would rather not use `ExtraFields`. It's community-maintained, with a smaller bus factor. |
| `openai-go/v3` | `github.com/sashabaranov/go-openai` v1.42.1 | Legacy community client with a simpler API. Don't choose it for new code now that there's an official SDK. |
| `google/jsonschema-go` | `github.com/invopop/jsonschema` v0.14.0 | It's what anthropic-sdk-go uses internally (already compiled in), and it has richer tag options (`jsonschema:"enum=a,enum=b"`). But it only generates schemas and doesn't validate, so you'd need a second library. |
| `google/jsonschema-go` | Hand-written `map[string]any` schemas | Fine for the first 2–3 tools and good for teaching (you see the raw schema). Switch to `For[T]` once the drift between structs and schemas starts to hurt. |
| `replace` directive | Committed `go.work` | Only if multiple modules need to be edited together constantly *and* CI is explicitly set up with `GOWORK=off` for module checks. Not worth it here. |
| In-house eval harness | promptfoo (Node) via `botler` as an exec provider | If the owner wants a web UI for comparing runs later. It can consume the same JSONL. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChainGo (`tmc/langchaingo` v0.1.14, last release Oct 2025), Genkit Go, Eino, `any-llm-go` | Their own message and agent abstractions replace the provider-neutral core that locked decision 3 says to build. They hide the agent loop (the teaching goal), and they lag new API features like adaptive thinking, effort, and tool search. LangChainGo looks stalled. | Own types in `ai-tooling/llm` + thin adapters |
| SDK `toolrunner` / `BetaToolRunner` / Beta Managed Agents | Beta, Anthropic-only types, and they hide the loop | Hand-written loop over the neutral `Provider` interface |
| `thinking: {type: "enabled", budget_tokens: N}` | Rejected on Opus 5 / Sonnet 5 | `ThinkingConfigAdaptiveParam` + `OutputConfig.Effort` |
| SSE endpoint (the Feb 2026 research recommendation) | Locked decision 7 chose a GraphQL subscription on the existing WS, which already has auth (`InitFunc`), keepalive, and timeout carve-outs | gqlgen subscription resolver returning `<-chan *model.AssistantEvent` |
| openai-go **Responses API** for the OpenRouter adapter | Responses is OpenAI-specific. OpenRouter's compatibility is Chat Completions. | `client.Chat.Completions.NewStreaming` |
| Root `github.com/openai/openai-go` or `/v2` import | Frozen, older major versions | `github.com/openai/openai-go/v3` |
| Importing `anthropic-sdk-go/bedrock` or `/vertex` | Pulls in AWS/GCP SDKs and registers global stream decoders via `init()` | Direct Anthropic API only |
| Committing `go.work` | Go reference advises against it, and it can make CI test a different graph than production | `replace` in `backend/go.mod`, local gitignored `go.work` for editor convenience |
| `mark3labs/mcp-go` (v1.1.1) for the later MCP phase | Community SDK. The official `modelcontextprotocol/go-sdk` is now stable (v1.8.0) and shares `google/jsonschema-go`. | Official MCP Go SDK |

## Stack Patterns by Variant

**If running evals across many models cheaply:**
- Point the openai-compat adapter at OpenRouter (or a local OpenAI-compatible server).
- Because one adapter covers hundreds of models, the model × prompt matrix only needs model-registry entries, not new code.

**If a tool set gets large (MCP phase, or many per-page tools):**
- On Anthropic, `ToolParam.DeferLoading` + the tool search tool (`tool_search_tool_regex_20251119` / `_bm25_20251119`) is a native option. Keep it behind an adapter capability flag, because OpenRouter models won't have it. The neutral design (per-page tool sets + `find_tools`) stays the default.

**If a model supports strict tool schemas:**
- Set `ToolParam.Strict` (Anthropic) or `strict: true` on function tools (OpenAI-compatible, where supported) through a neutral `Tool.Strict` hint. Still validate inputs with `jsonschema-go` in the registry, because providers differ.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| anthropic-sdk-go v1.75.0 | Go ≥ 1.24 | Uses `omitzero` JSON tags (Go 1.24+). Backend go 1.26 / toolchain 1.26.0, Docker golang:1.27-alpine, current Go 1.27.1. |
| openai-go/v3 v3.66.0 | Go ≥ 1.25 | Pin v3.44.0 only if you ever need Go < 1.25 (not the case). Its go.mod lists `coder/websocket v1.8.15`, the same version the backend uses, so no conflict. |
| modelcontextprotocol/go-sdk v1.8.0 | Go ≥ 1.25; MCP spec 2026-07-28 (plus older) | anthropic-sdk-go v1.75.0 requires go-sdk v1.3.1 transitively. MVS will pick v1.8.0 once it's added directly. |
| google/jsonschema-go v0.4.3 | Go ≥ 1.23 | Pre-1.0, so pin it. It's the version go-sdk v1.8.0 requires, so they stay aligned. |
| gqlgen v0.17.95 subscriptions | graphql-ws 6.x (`graphql-transport-ws`) | Already in production for messaging. Nothing new needed. |

## Sources

- Go module proxy (`proxy.golang.org/<mod>/@latest`, queried 2026-09-26): exact latest versions and dates for every Go module above. HIGH
- anthropic-sdk-go v1.75.0 source (downloaded from the proxy): `message.go` (Model constants, StopReason values, `ToolParam` fields incl. `Strict`/`DeferLoading`, `ThinkingConfigAdaptiveParam`, `OutputConfigEffort*`, top-level `CacheControl`, `Usage` fields), `messageutil.go` (`Accumulate`, `ToParam`), `toolrunner/tool.go` (Beta + invopop coupling), `go.mod` (Go 1.24, transitive AWS/GCP/MCP deps). HIGH
- https://platform.claude.com/docs/en/api/sdks/go: streaming, tool-calling loop, retries, timeouts, error handling, Go 1.24+ requirement. HIGH
- https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost: adaptive thinking, effort levels, effort changes invalidating the cache, `output_tokens_details.thinking_tokens`, passing thinking blocks back during tool use. HIGH
- openai-go v3.66.0 source: `go.mod` (Go 1.25), README (Go-version policy, Chat Completions), `streamaccumulator.go` (`ChatCompletionAccumulator`, `JustFinishedToolCall`). HIGH
- https://openrouter.ai/docs/guides/features/tool-calling: OpenAI-compatible tool schema, `tools` required on every request. MEDIUM-HIGH
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens: `reasoning_details` must be passed back unmodified. MEDIUM-HIGH
- https://openrouter.ai/docs/guides/guides/usage-accounting: usage/cost always included, `include_usage` deprecated. MEDIUM-HIGH
- modelcontextprotocol/go-sdk v1.8.0 README: spec-version compatibility table. HIGH
- google/jsonschema-go v0.4.3 source: `For[T]`, `ForType`, `Resolve`, `Validate`, `ApplyDefaults`, zero non-stdlib dependencies. HIGH
- https://go.dev/ref/mod: advice against committing go.work, replace directives applying only in the main module, subdirectory tag prefixes. HIGH
- https://docs.docker.com/build/concepts/context/: `.dockerignore` read from the context root, Dockerfile-specific ignore files. HIGH (whether Sevalla honors them: unverified, LOW)
- Repo files: `backend/Dockerfile`, `backend/.dockerignore`, `.github/workflows/{ci,trivy}.yml`, `.github/dependabot.yml`, `backend/cmd/server/main.go` (WS transport + timeout handling), `frontend/package.json`. HIGH
- https://pkg.go.dev/maragu.dev/llm/eval, https://www.maragu.dev/blog/requirements-for-an-llm-eval-pipeline-in-go: reference design for Go-native evals. MEDIUM
- https://appliedgo.net/spotlight/ai-and-go/: Go AI ecosystem survey, 2026. LOW (context only)

---
*Stack research for: Jeeves in-app AI assistant (v1.2)*
*Researched: 2026-09-26*
